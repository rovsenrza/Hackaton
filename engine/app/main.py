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
from fastapi import FastAPI, HTTPException
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


@app.get("/health")
def health():
    return {"ok": True, "startup_s": STARTUP_S, "cells": len(core.cells), "candidates": len(C),
            "graph_nodes": core.net.G.number_of_nodes()}


# --- what-if: istifadəçinin qoyduğu hub ---------------------------------------
class EvalIn(BaseModel):
    lon: float
    lat: float


@app.post("/evaluate")
def evaluate(q: EvalIn):
    t = time.time()
    x, y = TO_UTM.transform(q.lon, q.lat)
    clicked = Point(x, y)
    blocked = core.blocked_by(clicked)
    p, off = core.place(x, y, r_min=0)
    if p is None:
        raise HTTPException(422, detail={"msg": "Bu nöqtənin 60 m piyada radiusunda hub üçün icazəli yer tapılmadı",
                                         "blocked": blocked})
    ev = core.evaluate(p.x, p.y)
    # yaxınlıqda nəqliyyat düyünü (≤ 60 m piyada): hub-un mənası keçid nöqtəsidir
    reach = core.net.reach(p.x, p.y, 60)
    near_transit = any(core._within(n, reach, 60).any() for n in ("metro", "stops", "stations"))
    lon, lat = to_ll(p.x, p.y)
    return {"lon": lon, "lat": lat, "moved_m": off, "clicked_blocked_by": blocked, "near_transit_60m": near_transit,
            "isochrone": poly_ll(core.net.isochrone_polygon(p.x, p.y, HUB_WALK_M)), **ev,
            "ms": round((time.time() - t) * 1000)}


# --- MCLP: istifadəçi çəkiləri ilə -----------------------------------------------
class OptIn(BaseModel):
    transit: float = Field(0.45, ge=0)
    pop: float = Field(0.35, ge=0)
    poi: float = Field(0.20, ge=0)
    n: int = Field(10, ge=1, le=50)
    exclude_upgrade: bool = False


@app.post("/optimize")
def optimize(q: OptIn):
    t = time.time()
    wv = np.array([q.transit, q.pop, q.poi], float)
    if wv.sum() <= 0:
        raise HTTPException(400, "Çəkilərin cəmi sıfırdan böyük olmalıdır")
    wv /= wv.sum()
    w = (COMP @ wv) * GAP
    allowed = OK.copy()
    if q.exclude_upgrade:
        allowed &= C.action.eq("new").values
    left = w.copy()
    total = float(w.sum())
    taken = np.zeros(len(w), bool)
    out = []
    for rank in range(1, q.n + 1):
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
                    "lon": lon, "lat": lat, "gain_share": round(float(g[i]) / total, 4), **ev})
    return {"weights": dict(zip(("transit", "pop", "poi"), wv.round(3).tolist())), "hubs": out,
            "closed_share": round(sum(h["gain_share"] for h in out), 4), "ms": round((time.time() - t) * 1000)}


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
