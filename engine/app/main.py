"""AYAN Geo Engine: real piyada izoxronu, MCLP optimallaşdırması, hub təsdiq axını."""
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pyproj import Transformer
from scipy import sparse
from shapely.geometry import Point, mapping
from shapely.ops import transform
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT.parent / "pipeline"))  # lokal inkişaf: ortaq modullar pipeline/-dadır
from hubcore import HUB_WALK_M, load_core  # noqa: E402

from db import STATUSES, Hub, engine, init_db  # noqa: E402
import live  # noqa: E402
import apar  # noqa: E402
import quality  # noqa: E402
import copilot  # noqa: E402
import difflib  # noqa: E402

DATA = Path(os.environ.get("AYAN_DATA", ROOT / "data"))
TO_UTM = Transformer.from_crs(4326, 32639, always_xy=True)
TO_WGS = Transformer.from_crs(32639, 4326, always_xy=True)

t0 = time.time()
core = load_core(DATA)
C = pd.read_parquet(DATA / "candidates.parquet")
A = sparse.load_npz(DATA / "coverage.npz").tocsr()
PARAMS = json.loads((DATA / "params.json").read_text())
COMP = core.cells[["transit_n", "pop_n", "poi_n"]].values
GAP = core.cells.gap.values
OK = C.action.ne("rejected").values
PXY = C[["px", "py"]].values
STARTUP_S = round(time.time() - t0, 1)

app = FastAPI(title="AYAN Geo Engine", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def to_ll(x, y):
    lon, lat = TO_WGS.transform(x, y)
    return round(lon, 6), round(lat, 6)


def poly_ll(poly):
    g = transform(lambda x, y, z=None: TO_WGS.transform(x, y), poly)
    return json.loads(json.dumps(mapping(g)), parse_float=lambda v: round(float(v), 6))


@app.on_event("startup")
def _startup():
    seed = json.loads((DATA / "hubs_seed.json").read_text()) if (DATA / "hubs_seed.json").exists() else []
    init_db(seed)
    apar.warm()


@app.get("/health")
def health():
    return {"ok": True, "startup_s": STARTUP_S, "cells": len(core.cells), "candidates": len(C),
            "graph_nodes": core.net.G.number_of_nodes()}


# --- what-if: istifadəçinin qoyduğu hub ---------------------------------------
class EvalIn(BaseModel):
    lon: float
    lat: float


def run_evaluate(lon: float, lat: float) -> dict:
    """What-if: (lon, lat) nöqtəsinə qoyulan hub (icazəli yerə köçürülür) → göstəricilər + izoxron."""
    t = time.time()
    x, y = TO_UTM.transform(lon, lat)
    blocked = core.blocked_by(Point(x, y))
    p, off = core.place(x, y, r_min=0)
    if p is None:
        raise HTTPException(422, detail={"msg": "Bu nöqtənin 60 m piyada radiusunda hub üçün icazəli yer tapılmadı",
                                         "blocked": blocked})
    ev = core.evaluate(p.x, p.y)
    # yaxınlıqda nəqliyyat düyünü (≤ 60 m piyada): hub-un mənası keçid nöqtəsidir
    reach = core.net.reach(p.x, p.y, 60)
    near_transit = any(core._within(n, reach, 60).any() for n in ("metro", "stops", "stations"))
    plon, plat = to_ll(p.x, p.y)
    apar_live = apar.near(plon, plat, HUB_WALK_M) if apar.enabled() else {"has_live": False, "count": 0}
    return {"lon": plon, "lat": plat, "yaw": core.street_yaw(p.x, p.y), "moved_m": off, "clicked_blocked_by": blocked,
            "near_transit_60m": near_transit, "isochrone": poly_ll(core.net.isochrone_polygon(p.x, p.y, HUB_WALK_M)), **ev,
            "apar_live": apar_live, "ms": round((time.time() - t) * 1000)}


@app.post("/evaluate")
def evaluate(q: EvalIn):
    return run_evaluate(q.lon, q.lat)


# --- MCLP: istifadəçi çəkiləri ilə -----------------------------------------------
class OptIn(BaseModel):
    transit: float = Field(0.45, ge=0)
    pop: float = Field(0.35, ge=0)
    poi: float = Field(0.20, ge=0)
    n: int = Field(10, ge=1, le=50)
    exclude_upgrade: bool = False


def run_optimize(transit=0.45, pop=0.35, poi=0.20, n=10, exclude_upgrade=False,
                 center_lon: float | None = None, center_lat: float | None = None, radius_km: float | None = None) -> dict:
    """MCLP: xidmətsiz tələbatı maksimallaşdıran sıralı hub seçimi (istəyə görə ərazi ilə məhdud)."""
    t = time.time()
    wv = np.array([transit, pop, poi], float)
    if wv.sum() <= 0:
        raise HTTPException(400, "Çəkilərin cəmi sıfırdan böyük olmalıdır")
    wv /= wv.sum()
    w = (COMP @ wv) * GAP
    allowed = OK.copy()
    if exclude_upgrade:
        allowed &= C.action.eq("new").values
    if center_lon is not None and center_lat is not None and radius_km:
        cx, cy = TO_UTM.transform(center_lon, center_lat)
        allowed &= np.hypot(PXY[:, 0] - cx, PXY[:, 1] - cy) <= radius_km * 1000
    left = w.copy()
    total = float(w.sum())
    taken = np.zeros(len(w), bool)
    out = []
    for rank in range(1, n + 1):
        g = A @ left
        g[~allowed] = -1
        i = int(np.argmax(g))
        if g[i] <= 0:
            break
        cov = A[i].indices
        new = cov[~taken[cov]]
        taken[cov] = True
        left[cov] = 0
        allowed &= np.hypot(PXY[:, 0] - PXY[i, 0], PXY[:, 1] - PXY[i, 1]) >= PARAMS["min_spacing"]
        c = C.iloc[i]
        ev = core.evaluate(c.px, c.py, cov=cov, new=new)
        lon, lat = to_ll(c.px, c.py)
        out.append({"rank": rank, "cand": i, "label": c.label, "anchor_kind": c.kind, "action": c.action,
                    "lon": lon, "lat": lat, "yaw": core.street_yaw(c.px, c.py), "gain_share": round(float(g[i]) / total, 4), **ev})
    return {"weights": dict(zip(("transit", "pop", "poi"), wv.round(3).tolist())), "hubs": out,
            "closed_share": round(sum(h["gain_share"] for h in out), 4), "ms": round((time.time() - t) * 1000)}


@app.post("/optimize")
def optimize(q: OptIn):
    return run_optimize(q.transit, q.pop, q.poi, q.n, q.exclude_upgrade)


# --- təsdiq axını -----------------------------------------------------------------
class HubIn(BaseModel):
    label: str
    lon: float
    lat: float
    type: str
    action: str = "new"
    docks: int
    data: dict = {}


class HubPatch(BaseModel):
    status: str | None = None
    note: str | None = None


@app.get("/hubs")
def list_hubs():
    with Session(engine) as s:
        return [h.as_dict() for h in s.query(Hub).order_by(Hub.rank.is_(None), Hub.rank, Hub.updated_at.desc())]


@app.post("/hubs")
def create_hub(h: HubIn):
    hid = f"AYAN-{datetime.now(timezone.utc):%Y%m%d}-u{uuid.uuid4().hex[:8]}-{h.type}"
    with Session(engine) as s:
        row = Hub(id=hid, rank=None, label=h.label, lon=h.lon, lat=h.lat, type=h.type, action=h.action,
                  docks=h.docks, status="Təklif", source="istifadəçi", data=h.data)
        s.add(row)
        s.commit()
        return row.as_dict()


@app.patch("/hubs/{hid}")
def patch_hub(hid: str, p: HubPatch):
    if p.status is not None and p.status not in STATUSES:
        raise HTTPException(400, f"Status bunlardan biri olmalıdır: {', '.join(STATUSES)}")
    with Session(engine) as s:
        row = s.get(Hub, hid)
        if row is None:
            raise HTTPException(404, "Hub tapılmadı")
        if p.status is not None:
            row.status = p.status
        if p.note is not None:
            row.note = p.note
        row.updated_at = datetime.now(timezone.utc)
        s.commit()
        return row.as_dict()


@app.get("/hubs/export.geojson")
def export_geojson(status: str | None = None):
    with Session(engine) as s:
        q = s.query(Hub)
        if status:
            q = q.filter(Hub.status == status)
        feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [h.lon, h.lat]},
                  "properties": {k: v for k, v in h.as_dict().items() if k not in ("lon", "lat")}} for h in q]
    return {"type": "FeatureCollection", "features": feats}


# --- canlı gəlişlər (AYNA MaaS SIRI) ------------------------------------------------
STOP_XY = np.c_[core.stops.geometry.x, core.stops.geometry.y]


@app.get("/live/near")
def live_near(lon: float, lat: float, radius: float = 300):
    if not live.enabled():
        return {"enabled": False, "stops": [], "has_live": False}
    x, y = TO_UTM.transform(lon, lat)
    d = np.hypot(STOP_XY[:, 0] - x, STOP_XY[:, 1] - y)
    idx = [i for i in np.argsort(d)[:4] if d[i] <= radius]
    stops = [{"code": str(core.stops.code.iat[i]), "name": str(core.stops["name"].iat[i]), "dist_m": round(float(d[i]))} for i in idx]
    return {"enabled": True, **live.arrivals(stops)}


STOP_NR = core.stops.n_routes.values


@app.get("/live/buses")
def live_buses(w: float, s: float, e: float, n: float, max_stops: int = 20):
    """Ekrandakı ərazidə real avtobuslar: hər xanadan ən çox marşrutlu dayanacaq.

    Şəbəkə mütləqdir (xana ölçüsü 250 m-dən 8 km-ə qədər, koordinata bağlı): xəritə azca sürüşəndə eyni
    dayanacaqlar seçilir, avtobuslar yox olmur.
    """
    if not live.enabled():
        return {"enabled": False, "buses": []}
    x0, y0 = TO_UTM.transform(w, s)
    x1, y1 = TO_UTM.transform(e, n)
    inside = np.flatnonzero((STOP_XY[:, 0] >= x0) & (STOP_XY[:, 0] <= x1) & (STOP_XY[:, 1] >= y0) & (STOP_XY[:, 1] <= y1))
    span = max(x1 - x0, y1 - y0) / 5
    cell = next((c for c in (250, 500, 1000, 2000, 4000) if c >= span), 8000)
    best: dict[tuple[int, int], int] = {}
    for i in inside:
        key = (int(STOP_XY[i, 0] // cell), int(STOP_XY[i, 1] // cell))
        if key not in best or STOP_NR[i] > STOP_NR[best[key]]:
            best[key] = i
    picked = sorted(best.values(), key=lambda i: -STOP_NR[i])[:max(1, min(max_stops, 20))]
    return {"enabled": True, **live.buses([str(core.stops.code.iat[i]) for i in picked])}


# --- canlı Apar vasitələri (Tripy Mobility) ------------------------------------------
@app.get("/live/apar")
def live_apar(lon: float, lat: float, radius: float = HUB_WALK_M):
    if not apar.enabled():
        return {"enabled": False, "has_live": False, "count": 0}
    return {"enabled": True, **apar.near(lon, lat, radius)}


# --- Data keyfiyyət mərkəzi ------------------------------------------------------------
SAMPLES = {  # açıq datanın real (çirkli) faylları: demo üçün
    "metro_cixislari.csv": "Metro çıxışları (Bakı Metropoliteni)",
    "velosiped_parkinqleri.kmz": "Velo/scooter parkinqləri (AYNA)",
    "ayna_stopsV4.json": "Dayanacaqlar (AYNA xəritə API-si)",
    "bakubus_gundelik_sernisin_2026.csv": "BakuBus sərnişin datası",
}
RAW = ROOT.parent / "datas"


@app.post("/quality/check")
async def quality_check(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > 25_000_000:
        raise HTTPException(413, "Fayl 25 MB-dan böyükdür")
    try:
        return quality.check(file.filename or "fayl.csv", raw)
    except Exception as e:
        raise HTTPException(422, f"Fayl oxunmadı: {type(e).__name__}: {e}")


@app.get("/quality/samples")
def quality_samples():
    return [{"file": f, "label": l} for f, l in SAMPLES.items() if (RAW / f).exists()]


@app.get("/quality/sample/{name}")
def quality_sample(name: str):
    if name not in SAMPLES or not (RAW / name).exists():
        raise HTTPException(404, "Nümunə tapılmadı")
    return quality.check(name, (RAW / name).read_bytes())


# --- AYAN Kopilot (Claude) ---------------------------------------------------------------
SEED = json.loads((DATA / "hubs_seed.json").read_text()) if (DATA / "hubs_seed.json").exists() else []
METRICS = json.loads((DATA / "metrics.json").read_text()) if (DATA / "metrics.json").exists() else {}
_TR = str.maketrans({"ә": "ə", "Ә": "Ə"})


def _norm(s: str) -> str:
    return str(s).translate(_TR).lower().replace("m/st", "").strip()


def _places():
    out = []
    for name, gdf, kind in ((None, core.metro, "metro"), (None, core.official, "AYNA mübadilə mərkəzi"),
                            (None, core.rail, "qatar stansiyası"), (None, core.stations, "avtovağzal"),
                            (None, core.stops, "dayanacaq")):
        col = "station_az" if kind == "metro" else "name"
        for _, r in gdf.iterrows():
            lon, lat = to_ll(r.geometry.x, r.geometry.y)
            out.append({"name": str(r[col]).translate(_TR), "kind": kind, "lon": lon, "lat": lat})
    return out


PLACES = _places()
_COMPACT = ("rank", "label", "action", "type", "docks", "pop_covered", "pop_newly_served", "transit_daily", "trips_day",
            "trips_gross_day", "co2_t_year", "metro_stations", "rail_stations", "official_hub", "bus_routes", "parkings_400",
            "stability", "gain_share", "lon", "lat")


def _compact(h: dict) -> dict:
    d = {k: h[k] for k in _COMPACT if k in h}
    if "bus_routes" in d:
        d["bus_routes"] = len(d["bus_routes"])
    return d


def t_city(_):
    h = METRICS.get("hubs", {})
    return {"şəhər": h.get("city"), "doğrulama": h.get("validation"), "proqram": h.get("program"),
            "xidmətsiz_tələbatın_bağlanan_payı": h.get("mclp", {}).get("share_closed")}, []


def t_top(a):
    hubs = [h for h in SEED if a["action"] == "all" or h["action"] == a["action"]][: max(1, min(50, a["n"]))]
    return {"hubs": [_compact(h) for h in hubs]}, [{"type": "show_base"}]


def t_details(a):
    h = next((x for x in SEED if x["rank"] == a["rank"]), None)
    if not h:
        raise ValueError("Bu sıra nömrəli hub yoxdur (1–50)")
    return _compact(h) | {"qa": h.get("qa")}, [{"type": "select_hub", "rank": h["rank"], "lon": h["lon"], "lat": h["lat"]}]


def t_find(a):
    q = _norm(a["query"])
    scored = []
    for p in PLACES:
        n = _norm(p["name"])
        s = 1.0 if q in n else difflib.SequenceMatcher(None, q, n).ratio()
        if s >= 0.6:
            scored.append((s + (0.1 if p["kind"] != "dayanacaq" else 0), p))
    scored.sort(key=lambda t: -t[0])
    res = [p for _, p in scored[:5]]
    acts = [{"type": "fly", "lon": res[0]["lon"], "lat": res[0]["lat"], "zoom": 14}] if res else []
    return {"nəticələr": res or "tapılmadı"}, acts


def t_opt(a):
    r = run_optimize(a["transit"], a["pop"], a["poi"], max(1, min(50, a["n"])), a["exclude_upgrade"],
                     a.get("center_lon"), a.get("center_lat"), a.get("radius_km"))
    return {"weights": r["weights"], "closed_share": r["closed_share"], "hubs": [_compact(h) for h in r["hubs"]]}, \
        [{"type": "show_scenario", "hubs": r["hubs"]}]


def t_eval(a):
    r = run_evaluate(a["lon"], a["lat"])
    return {k: v for k, v in r.items() if k != "isochrone"} | {"bus_routes": len(r["bus_routes"])}, [{"type": "whatif", "hub": r}]


IMPL = {"city_overview": t_city, "top_hubs": t_top, "hub_details": t_details, "find_place": t_find,
        "optimize_hubs": t_opt, "evaluate_location": t_eval}


class ChatIn(BaseModel):
    session_id: str | None = None
    message: str = Field(min_length=1, max_length=2000)


@app.get("/copilot/status")
def copilot_status():
    return {"enabled": copilot.enabled(), "model": copilot.MODEL}


@app.post("/copilot/chat")
def copilot_chat(q: ChatIn):
    if not copilot.enabled():
        raise HTTPException(503, "Kopilot üçün engine/.env faylına ANTHROPIC_API_KEY əlavə edin")
    return copilot.chat(q.session_id, q.message, IMPL)


class MemoIn(BaseModel):
    hub: dict


@app.post("/copilot/memo")
def copilot_memo(q: MemoIn):
    if not copilot.enabled():
        raise HTTPException(503, "Kopilot üçün engine/.env faylına ANTHROPIC_API_KEY əlavə edin")
    ctx = {k: METRICS.get("hubs", {}).get(k) for k in ("city", "program")}
    return copilot.memo(_compact(q.hub) | {"qa": q.hub.get("qa"), "id": q.hub.get("id")}, ctx)
