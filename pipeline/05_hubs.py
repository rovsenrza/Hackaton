"""Mərhələ 3: hub optimallaşdırması, yerləşdirmə, tipologiya, yoxlama, CO₂ + engine datası.

Çıxış: build/hubs.json, build/hubs_report.json, engine/data/*
"""
import json
import time

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from scipy import sparse
from shapely.geometry import Point
from sklearn.metrics import roc_auc_score

from common import BUILD, ENGINE_DATA, EXT, HUB_WALK_M, OSM_PBF, UTM, WGS84
from hubcore import HubCore, build_masks, co2_t
from walk import WalkNet

T0 = time.time()
N_MAX = 50              # sıralanan hub sayı
MIN_SPACING = 300       # hub-lar arası minimum məsafə (m)
W_DEFAULT = {"transit": 0.45, "pop": 0.35, "poi": 0.20}
rng = np.random.default_rng(42)
rep: dict = {}


def log(msg):
    print(f"[{time.time() - T0:5.0f}s] {msg}", flush=True)


# --- 0. Data ----------------------------------------------------------------
cells = pd.read_parquet(BUILD / "cells.parquet")
net = WalkNet(ENGINE_DATA / "walk_graph.pkl")
metro = gpd.read_file(BUILD / "metro_exits.gpkg").to_crs(UTM)
stations = gpd.read_file(BUILD / "bus_stations.gpkg").to_crs(UTM)
stops = gpd.read_file(BUILD / "bus_stops.gpkg").to_crs(UTM)
stops["routes"] = stops.routes.apply(lambda v: list(v) if v is not None else [])
parks = gpd.read_file(BUILD / "parkings.gpkg").to_crs(UTM)
lanes = gpd.read_file(BUILD / "bike_lanes.gpkg").to_crs(UTM)

ZONE_BB = (49.38, 39.93, 50.35, 40.60)
lines = gpd.read_file(OSM_PBF, layer="lines", bbox=ZONE_BB, columns=["highway", "railway", "other_tags"])
mpoly = gpd.read_file(OSM_PBF, layer="multipolygons", bbox=ZONE_BB, columns=["natural", "other_tags"])
blds = gpd.read_parquet(EXT / "overture_buildings.parquet", columns=["geometry"]).geometry
masks = build_masks(lines, mpoly, blds, UTM)
rep["placement_masks"] = masks.kind.value_counts().to_dict()
log(f"data və maskalar yükləndi ({len(masks)} maska)")

# --- 1. Kalibrləmə: tələbat → gündəlik mikromobillik səfəri --------------------
# AYNA, sentyabr 2026: 547 758 sifariş / 30 gün; 1 495 parkinq nöqtəsi (623 velo + 872 scooter)
TRIPS_PER_POINT = 547_758 / 30 / 1_495
core = HubCore(net, cells, metro, stops, stations, parks, masks, K=1.0)
Dcov_parks = np.array([cells.D.values[net.covered(g.x, g.y, HUB_WALK_M)].sum() for g in parks.geometry])
core.K = K = TRIPS_PER_POINT / Dcov_parks.mean()
rep["calibration"] = {"trips_per_point_day": round(TRIPS_PER_POINT, 2), "k": round(float(K), 4)}

# --- 2. Namizədlər: nəqliyyat düyünləri + mövcud parkinqlər ---------------------
C = []
for _, r in metro.iterrows():
    C.append({"kind": "metro", "ref": r.id, "label": f"{r.station_az} m/st., {r.exit}", "x": r.geometry.x, "y": r.geometry.y})
for _, r in stations.iterrows():
    C.append({"kind": "bus_station", "ref": r.id, "label": r["name"], "x": r.geometry.x, "y": r.geometry.y})
for _, r in stops[stops.routes.str.len() >= 2].iterrows():
    nm = r["name"] if isinstance(r["name"], str) and r["name"] else "Avtobus dayanacağı"
    C.append({"kind": "bus_stop", "ref": f"S{r.osm_id}", "label": nm, "x": r.geometry.x, "y": r.geometry.y})
for _, r in parks.iterrows():
    C.append({"kind": "parking", "ref": r.id, "label": r["name"] or "Mövcud parkinq", "x": r.geometry.x, "y": r.geometry.y,
              "period": r.period})
C = pd.DataFrame(C)
rep["candidates"] = C.kind.value_counts().to_dict()

# --- 3. Hər namizədin yerləşməsi (tövsiyə növü + icazəli nöqtə) ----------------
park_xy = np.c_[parks.geometry.x, parks.geometry.y]
act, px, py, off, qa = [], [], [], [], []
for c in C.itertuples():
    near = core.nearest_parking(c.x, c.y, 150)
    if c.kind == "parking" or near is not None:
        k = int(np.flatnonzero(parks.id.values == c.ref)[0]) if c.kind == "parking" else near[0]
        act.append("upgrade"); px.append(park_xy[k, 0]); py.append(park_xy[k, 1]); off.append(0.0)
        qa.append("mövcud parkinq koordinatı (real dünyada sınanmış)")
    else:
        p, o = core.place(c.x, c.y)
        if p is None:
            act.append("rejected"); px.append(np.nan); py.append(np.nan); off.append(np.nan)
            qa.append("60 m daxilində icazəli yer yoxdur")
        else:
            act.append("new"); px.append(p.x); py.append(p.y); off.append(o)
            qa.append("yoldan ≥1.5 m, bina/dəmir yolu/su xaricində, düyünə ≤60 m piyada")
C["action"], C["px"], C["py"], C["offset_m"], C["qa"] = act, px, py, off, qa
rep["placement_all"] = C.action.value_counts().to_dict()
log(f"namizəd yerləşməsi: {rep['placement_all']}")

# --- 4. Əhatə matrisi (yerləşdirilmiş nöqtədən 400 m real piyada) ---------------
ok = C.action.ne("rejected").values
rows, cols = [], []
for i, (x, y) in enumerate(C[["px", "py"]].values):
    if ok[i]:
        cov = net.covered(x, y, HUB_WALK_M)
        rows.append(np.full(len(cov), i)); cols.append(cov)
A = sparse.csr_matrix((np.ones(sum(map(len, rows)), dtype=np.float32), (np.concatenate(rows), np.concatenate(cols))),
                      shape=(len(C), len(cells)))
log(f"əhatə matrisi: {A.shape}, nnz={A.nnz}")


# --- 5. Greedy MCLP ---------------------------------------------------------------
def greedy(w, n=N_MAX, allowed=None):
    """Xidmət olunmamış tələbatı (w) maksimallaşdıran sıralı hub seçimi."""
    allowed = ok.copy() if allowed is None else allowed & ok
    left = w.astype(float).copy()
    xy = C[["px", "py"]].values
    picks, gains = [], []
    for _ in range(n):
        g = A @ left
        g[~allowed] = -1
        i = int(np.argmax(g))
        if g[i] <= 0:
            break
        picks.append(i); gains.append(float(g[i]))
        left[A[i].indices] = 0
        allowed &= np.hypot(xy[:, 0] - xy[i, 0], xy[:, 1] - xy[i, 1]) >= MIN_SPACING
    return picks, gains


W_TOTAL = float(cells.w.sum())
picks, gains = greedy(cells.w.values)
curve = np.cumsum(gains) / W_TOTAL
rep["mclp"] = {"picked": len(picks), "w_total": round(W_TOTAL, 1),
               "share_closed": {k: round(float(curve[k - 1]), 3) for k in (5, 10, 20, 30, 50) if k <= len(curve)}}
log(f"MCLP: {len(picks)} hub")

# --- 6. Stabillik: çəkilər ±30%, 500 dəfə ------------------------------------------
comp = cells[["transit_n", "pop_n", "poi_n"]].values
hits = np.zeros(len(C))
RUNS = 500
for _ in range(RUNS):
    wv = np.array([W_DEFAULT["transit"], W_DEFAULT["pop"], W_DEFAULT["poi"]]) * rng.uniform(0.7, 1.3, 3)
    p, _ = greedy((comp @ (wv / wv.sum())) * cells.gap.values, n=20)
    hits[p] += 1
stability = hits / RUNS
log("stabillik testi bitdi")

# --- 7. Doğrulama -------------------------------------------------------------------
pll = parks.to_crs(WGS84)
pos_h = {h3.latlng_to_cell(g.y, g.x, 11) for g in pll.geometry}
is_pos = cells.h3.isin(pos_h).values
neg_pool = np.flatnonzero(~is_pos & (cells["pop"].values > 0))
neg = rng.choice(neg_pool, min(20000, len(neg_pool)), replace=False)
pos = np.flatnonzero(is_pos)
yv = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
auc = {col: round(float(roc_auc_score(yv, cells[col].values[np.r_[pos, neg]])), 3) for col in ("D", "transit_n", "pop_n", "poi_n")}
jul, sep = parks[parks.period == "jul"], parks[parks.period == "sep"]
d_sep_jul = sep.geometry.apply(lambda g: jul.distance(g).min())
rep["validation"] = {
    "demand_auc_vs_ayna_parkings": auc, "positives": int(len(pos)), "negatives": int(len(neg)),
    "sep_expansion": {"n": len(sep), "median_m_to_existing": round(float(d_sep_jul.median())),
                      "share_within_400m_of_existing": round(float((d_sep_jul < 400).mean()), 3)},
}
log(f"doğrulama: AUC={auc}")

# --- 8. Top hub-lar ------------------------------------------------------------------
hubs = []
for rank, (i, g) in enumerate(zip(picks, gains), 1):
    c = C.iloc[i]
    ev = core.evaluate(c.px, c.py, cov=A[i].indices)
    ll = gpd.GeoSeries([Point(c.px, c.py)], crs=UTM).to_crs(WGS84).iloc[0]
    hubs.append({"rank": rank, "id": f"AYAN-20261018-{c.ref.lower()[:7]}-{ev['type']}", "cand": int(i),
                 "action": c.action, "anchor_kind": c.kind, "label": c.label,
                 "lon": round(ll.x, 6), "lat": round(ll.y, 6), "x": round(c.px, 1), "y": round(c.py, 1),
                 "offset_m": c.offset_m, "qa": c.qa, "gain_w": round(g, 2), "gain_share": round(g / W_TOTAL, 4),
                 "stability": round(float(stability[i]), 2), **ev})
hxy = np.array([[h["x"], h["y"]] for h in hubs])
dmin = [float(np.sort(np.hypot(*(hxy - p).T))[1]) for p in hxy]
rep["placement_qa"] = {"placed": len(hubs), "new": sum(h["action"] == "new" for h in hubs),
                       "upgrade": sum(h["action"] == "upgrade" for h in hubs), "min_spacing_m": round(min(dmin), 1),
                       "new_hubs_free_check": all(core.is_free(Point(h["x"], h["y"])) for h in hubs if h["action"] == "new")}
log(f"{len(hubs)} hub")


# --- 9. Avtovağzal "Gəliş balı" (0–5) ---------------------------------------------------
def lin(v, good, bad):
    return float(np.clip((bad - v) / (bad - good), 0, 1))


def walk_to(xy_targets, x, y, limit=1500):
    reach = net.reach(x, y, limit)
    n, d = net.snap(xy_targets)
    vals = [reach[k] + dd for k, dd in zip(n, d) if k in reach]
    return min(vals) if vals else np.inf


lane_xy = np.array([ls.interpolate(t).coords[0] for g in lanes.geometry for ls in getattr(g, "geoms", [g])
                    for t in np.arange(0, ls.length, 20)])
metro_xy = np.c_[metro.geometry.x, metro.geometry.y]
arrival = []
for _, s in stations.iterrows():
    x, y = s.geometry.x, s.geometry.y
    ctx = core.context(x, y)
    dm, dp, dl = walk_to(metro_xy, x, y), walk_to(park_xy, x, y), walk_to(lane_xy, x, y)
    parts = {"metro": lin(dm, 300, 800), "bus": min(len(ctx["bus_routes"]) / 10, 1.0),
             "parking": lin(dp, 150, 400), "lane": lin(dl, 200, 800)}
    score = 5 * (0.35 * parts["metro"] + 0.25 * parts["bus"] + 0.25 * parts["parking"] + 0.15 * parts["lane"])
    ll = gpd.GeoSeries([s.geometry], crs=UTM).to_crs(WGS84).iloc[0]
    arrival.append({"id": s.id, "name": s["name"], "lon": round(ll.x, 6), "lat": round(ll.y, 6), "score": round(score, 1),
                    "parts": {k: round(v, 2) for k, v in parts.items()},
                    "metro_walk_m": None if np.isinf(dm) else round(dm), "parking_walk_m": None if np.isinf(dp) else round(dp),
                    "lane_walk_m": None if np.isinf(dl) else round(dl), "bus_routes_400": len(ctx["bus_routes"])})
rep["arrival"] = arrival

# --- 10. Şəhər göstəriciləri və boşluq potensialı ----------------------------------------
served = cells.d_park <= 400
served_pop = float(cells["pop"][served].sum())
trips_per_1000 = 547_758 / 30 / served_pop * 1000
pot_trips = trips_per_1000 * float(cells["pop"][~served].sum()) / 1000
metro_no_park = sum(1 for x, y in metro_xy if not np.isfinite(walk_to(park_xy, x, y, 400)))
rep["city"] = {
    "pop_total": round(float(cells["pop"].sum()), -3),
    "pop_without_parking_400m": round(float(cells["pop"][~served].sum()), -3),
    "pop_without_parking_share": round(float(cells["pop"][~served].sum() / cells["pop"].sum()), 3),
    "transit_daily_without_parking_share": round(float(cells.transit[~served].sum() / cells.transit.sum()), 3),
    "metro_exits_without_parking_400m": int(metro_no_park), "metro_exits_total": len(metro),
    "trips_per_1000_served_pop_day": round(trips_per_1000, 1),
    "gap_potential_trips_day": round(pot_trips, -2),
    "gap_potential_co2_t_year": {k: round(co2_t(pot_trips, k)) for k in ("low", "base", "high")},
}
top10 = hubs[:10]
rep["top10"] = {"pop_unserved_covered": round(sum(h["pop_unserved_covered"] for h in top10), -3),
                "trips_day": round(sum(h["trips_day"] for h in top10)),
                "co2_t_year": {k: round(sum(h["co2_t_year"][k] for h in top10)) for k in ("low", "base", "high")}}

out = {"generated": "2026-10-18", "walk_m": HUB_WALK_M, "weights": W_DEFAULT, "curve": [round(float(v), 4) for v in curve],
       "hubs": hubs, "arrival": arrival}
(BUILD / "hubs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=float))
(BUILD / "hubs_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2, default=float))

# --- 11. Engine datası ----------------------------------------------------------------------
E = ENGINE_DATA
cells[["h3", "x", "y", "pop", "transit", "poi", "transit_n", "pop_n", "poi_n", "D", "gap", "d_park"]].to_parquet(E / "cells.parquet")
C.to_parquet(E / "candidates.parquet")
sparse.save_npz(E / "coverage.npz", A)
metro.to_parquet(E / "metro.parquet"); stops.to_parquet(E / "stops.parquet")
stations.to_parquet(E / "stations.parquet"); parks.to_parquet(E / "parks.parquet")
masks.to_parquet(E / "masks.parquet")
(E / "params.json").write_text(json.dumps({"K": K, "weights": W_DEFAULT, "min_spacing": MIN_SPACING,
                                           "w_total": W_TOTAL, "walk_m": HUB_WALK_M}, indent=1))
print(json.dumps({k: v for k, v in rep.items() if k != "arrival"}, ensure_ascii=False, indent=2, default=float))
log("bitdi")
