"""Mərhələ 3: hub optimallaşdırması, yerləşdirmə, tipologiya, yoxlama, CO₂.

Çıxış: build/hubs.json, build/hubs_report.json
"""
import json
import time

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import sparse
from shapely.geometry import Point
from shapely.strtree import STRtree

from common import BUILD, ENGINE_DATA, EXT, HUB_WALK_M, OSM_PBF, UTM, WGS84
from walk import WalkNet

T0 = time.time()
N_MAX = 50              # sıralanan hub sayı
MIN_SPACING = 300       # hub-lar arası minimum məsafə (m)
NODE_WALK_MAX = 60      # hub nəqliyyat düyünündən ≤ 60 m piyada
ROAD_CLEAR = 1.5        # hərəkət hissəsindən minimum məsafə (m)
W_DEFAULT = {"transit": 0.45, "pop": 0.35, "poi": 0.20}
rng = np.random.default_rng(42)
rep: dict = {}


def log(msg):
    print(f"[{time.time() - T0:5.0f}s] {msg}", flush=True)


# --- 0. Data ----------------------------------------------------------------
cells = pd.read_parquet(BUILD / "cells.parquet")
net = WalkNet(ENGINE_DATA / "walk_graph.pkl")
net.attach_points(cells[["x", "y"]].values)
metro = gpd.read_file(BUILD / "metro_exits.gpkg").to_crs(UTM)
stations = gpd.read_file(BUILD / "bus_stations.gpkg").to_crs(UTM)
stops = gpd.read_file(BUILD / "bus_stops.gpkg").to_crs(UTM)
stops["routes"] = stops.routes.apply(lambda v: list(v) if v is not None else [])
parks = gpd.read_file(BUILD / "parkings.gpkg").to_crs(UTM)
lanes = gpd.read_file(BUILD / "bike_lanes.gpkg").to_crs(UTM)
log("data yükləndi")

# --- 1. Namizədlər: yalnız nəqliyyat düyünləri + mövcud parkinqlər ------------
C = []
for _, r in metro.iterrows():
    C.append({"kind": "metro", "ref": r.id, "label": f"{r.station_az} m/st., {r.exit}", "x": r.geometry.x, "y": r.geometry.y,
              "station_pax": r.station_pax})
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

# əhatə matrisi: namizəd × xana (400 m real piyada)
rows, cols = [], []
for i, (x, y) in enumerate(C[["x", "y"]].values):
    cov = net.covered(x, y, HUB_WALK_M)
    rows.append(np.full(len(cov), i))
    cols.append(cov)
A = sparse.csr_matrix((np.ones(sum(map(len, rows))), (np.concatenate(rows), np.concatenate(cols))),
                      shape=(len(C), len(cells)))
log(f"əhatə matrisi: {A.shape}, nnz={A.nnz}")

# hər namizəd üçün 400 m-də nəqliyyat konteksti
def context(x, y):
    reach = net.reach(x, y, HUB_WALK_M)
    def within(gdf):
        if len(gdf) == 0:
            return np.zeros(0, bool)
        n, d = net.snap(np.c_[gdf.geometry.x, gdf.geometry.y])
        return np.array([(k in reach) and (reach[k] + dd <= HUB_WALK_M) for k, dd in zip(n, d)])
    ms = within(metro); ss = within(stops); bs = within(stations); ps = within(parks)
    routes = sorted({r for rr in stops.routes[ss] for r in rr}) if ss.any() else []
    return {"metro_stations": sorted(set(metro.key[ms])), "metro_pax": float(metro.station_pax[ms].groupby(metro.key[ms]).first().sum()) if ms.any() else 0.0,
            "bus_routes": routes, "bus_station": bool(bs.any()), "parkings_400": int(ps.sum())}


# --- 2. Greedy MCLP ------------------------------------------------------------
def greedy(w, n=N_MAX, allowed=None):
    """Xidmət olunmamış tələbatı (w) maksimallaşdıran sıralı hub seçimi."""
    allowed = np.ones(len(C), bool) if allowed is None else allowed.copy()
    left = w.astype(float).copy()
    xy = C[["x", "y"]].values
    picks, gains = [], []
    for _ in range(n):
        g = A @ left
        g[~allowed] = -1
        i = int(np.argmax(g))
        if g[i] <= 0:
            break
        picks.append(i)
        gains.append(float(g[i]))
        left[A[i].indices] = 0
        allowed &= np.hypot(xy[:, 0] - xy[i, 0], xy[:, 1] - xy[i, 1]) >= MIN_SPACING
    return picks, gains


W_TOTAL = float(cells.w.sum())
picks, gains = greedy(cells.w.values)
curve = np.cumsum(gains) / W_TOTAL
rep["mclp"] = {"picked": len(picks), "w_total": round(W_TOTAL, 1),
               "share_closed": {k: round(float(curve[k - 1]), 3) for k in (5, 10, 20, 30, 50) if k <= len(curve)}}
log(f"MCLP: {len(picks)} hub, ilk 10 → {curve[min(9, len(curve)-1)]:.1%}")

# --- 3. Stabillik: çəkilər ±30%, 500 dəfə --------------------------------------
comp = cells[["transit_n", "pop_n", "poi_n"]].values
base_set = set(picks[:20])
hits = np.zeros(len(C))
RUNS = 500
for _ in range(RUNS):
    wv = np.array([W_DEFAULT["transit"], W_DEFAULT["pop"], W_DEFAULT["poi"]]) * rng.uniform(0.7, 1.3, 3)
    wv /= wv.sum()
    p, _ = greedy((comp @ wv) * cells.gap.values, n=20)
    hits[p] += 1
stability = hits / RUNS
log("stabillik testi bitdi")

# --- 4. Yoxlama -------------------------------------------------------------------
# 4a. Tələbat indeksi AYNA mütəxəssislərinin seçdiyi yerləri tanıyırmı? (AUC)
#     Müsbət: parkinq olan xanalar. Mənfi: parkinqsiz, məskunlaşmış təsadüfi xanalar.
from sklearn.metrics import roc_auc_score
import h3
pll = parks.to_crs(WGS84)
pos_h = {h3.latlng_to_cell(g.y, g.x, 11) for g in pll.geometry}
is_pos = cells.h3.isin(pos_h).values
neg_pool = np.flatnonzero(~is_pos & (cells["pop"].values > 0))
neg = rng.choice(neg_pool, min(20000, len(neg_pool)), replace=False)
pos = np.flatnonzero(is_pos)
yv = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
auc = {col: round(float(roc_auc_score(yv, cells[col].values[np.r_[pos, neg]])), 3)
       for col in ("D", "transit_n", "pop_n", "poi_n")}
# 4b. AYNA-nın sentyabr genişlənməsi: sıxlaşdırma, yoxsa boşluq bağlama?
jul, sep = parks[parks.period == "jul"], parks[parks.period == "sep"]
d_sep_jul = sep.geometry.apply(lambda g: jul.distance(g).min())
rep["validation"] = {
    "demand_auc_vs_ayna_parkings": auc, "positives": int(len(pos)), "negatives": int(len(neg)),
    "sep_expansion": {"n": len(sep), "median_m_to_existing": round(float(d_sep_jul.median())),
                      "share_within_400m_of_existing": round(float((d_sep_jul < 400).mean()), 3)},
}
log(f"yoxlama: AUC={auc}")

# --- 5. Yerləşdirmə qaydaları (yol, bina, dəmir yolu, su) ----------------------
hub_pts = C.iloc[picks]
bb = gpd.GeoSeries(gpd.points_from_xy(hub_pts.x, hub_pts.y), crs=UTM).buffer(150).to_crs(WGS84).total_bounds
MOTOR = ("motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
         "tertiary", "tertiary_link", "residential", "unclassified", "living_street", "service")
WIDTH = {"motorway": 24, "motorway_link": 8, "trunk": 21, "trunk_link": 7, "primary": 14, "primary_link": 7,
         "secondary": 10.5, "secondary_link": 6, "tertiary": 7, "tertiary_link": 6, "residential": 6,
         "unclassified": 6, "living_street": 5, "service": 4}
lines = gpd.read_file(OSM_PBF, layer="lines", bbox=tuple(bb))
roads = lines[lines.highway.isin(MOTOR)].to_crs(UTM)
lanes_tag = roads.other_tags.fillna("").str.extract(r'"lanes"=>"(\d+)"')[0].astype(float)
roads["width"] = np.where(lanes_tag.notna(), lanes_tag * 3.5, roads.highway.map(WIDTH))
road_mask = roads.geometry.buffer(roads.width / 2 + ROAD_CLEAR, cap_style="flat")
rail = lines[lines.railway.isin(["rail", "light_rail", "tram", "narrow_gauge"])].to_crs(UTM).buffer(4)
mpoly = gpd.read_file(OSM_PBF, layer="multipolygons", bbox=tuple(bb))
water = mpoly[(mpoly.natural == "water") | mpoly.other_tags.fillna("").str.contains('"landuse"=>"construction"')].to_crs(UTM).geometry
blds = gpd.read_parquet(EXT / "overture_buildings.parquet", bbox=tuple(bb), columns=["geometry"]).to_crs(UTM).geometry
blocked = list(road_mask) + list(rail) + list(water) + list(blds)
tree = STRtree(blocked)
rep["placement_masks"] = {"roads": len(roads), "rail": len(rail), "water_construction": len(water), "buildings": len(blds)}
log("yerləşdirmə maskaları hazırdır")


def is_free(p: Point) -> bool:
    return len(tree.query(p, predicate="intersects")) == 0


def place(x, y):
    """Düyünə (x, y) ≤ 60 m piyada, icazəli ərazidə ən yaxın nöqtə."""
    reach = net.reach(x, y, NODE_WALK_MAX)
    for r in np.arange(8, 46, 3):
        for a in np.linspace(0, 2 * np.pi, 36, endpoint=False):
            p = Point(x + r * np.cos(a), y + r * np.sin(a))
            if not is_free(p):
                continue
            n, d = net.snap([p.x, p.y])
            if n[0] in reach and reach[n[0]] + d[0] <= NODE_WALK_MAX:
                return p, round(float(r), 1)
    return None, None


# --- 6. Kalibrləmə: tələbat → gündəlik mikromobillik səfəri --------------------
# AYNA, sentyabr 2026: 547 758 sifariş / 30 gün; 1 495 parkinq nöqtəsi (623 velo + 872 scooter)
TRIPS_PER_POINT = 547_758 / 30 / 1_495
p_idx = np.flatnonzero((C.kind == "parking").values)
Dcov = A @ cells.D.values
K = TRIPS_PER_POINT / Dcov[p_idx].mean()
rep["calibration"] = {"trips_per_point_day": round(TRIPS_PER_POINT, 2), "k": round(float(K), 4)}

# --- 7. Hub-lar: tövsiyə növü, yer, tip, yer sayı, CO₂ ---------------------------
CO2 = {"car": 0.173, "scooter": {"low": 0.030, "base": 0.060, "high": 0.124}, "mix_scooter": 0.70,
       "km": 4.918839e6 / 2.297405e6, "shift": {"low": 0.10, "base": 0.20, "high": 0.30}}


CASE_EF = {"low": "high", "base": "base", "high": "low"}  # pessimist: az keçid + yüksək scooter izi


def co2_t(trips, case):
    ef_new = CO2["mix_scooter"] * CO2["scooter"][CASE_EF[case]]
    return trips * CO2["shift"][case] * CO2["km"] * (CO2["car"] - ef_new) * 365 / 1000


hubs, rejected = [], []
park_xy = np.c_[parks.geometry.x, parks.geometry.y]
for rank, (i, g) in enumerate(zip(picks, gains), 1):
    c = C.iloc[i]
    ctx = context(c.x, c.y)
    # mövcud parkinq 150 m piyada daxilindədirsə → hub-a çevrilmə
    reach150 = net.reach(c.x, c.y, 150)
    pn, pd_ = net.snap(park_xy)
    near = [k for k, (n, d) in enumerate(zip(pn, pd_)) if n in reach150 and reach150[n] + d <= 150]
    if c.kind == "parking" or near:
        k = i if c.kind == "parking" else None
        pk = parks.iloc[near[0]] if near else parks[parks.id == c.ref].iloc[0]
        action, pt, offset = "upgrade", pk.geometry, 0.0
        qa = "mövcud parkinq koordinatı (real dünyada sınanmış)"
    else:
        action = "new"
        pt, offset = place(c.x, c.y)
        if pt is None:
            rejected.append({"rank": rank, "ref": c.ref, "label": c.label, "reason": "60 m daxilində icazəli yer yoxdur"})
            continue
        qa = "yoldan ≥1.5 m, bina/dəmir yolu/su xaricində, düyünə ≤60 m piyada"
    trips = float(K * Dcov[i])
    if ctx["bus_station"] or (ctx["metro_pax"] >= 30_000 and ctx["bus_routes"]):
        typ = "L"
    elif ctx["metro_stations"] or len(ctx["bus_routes"]) >= 3:
        typ = "M"
    else:
        typ = "S"
    lo, hi = {"S": (6, 10), "M": (12, 20), "L": (24, 40)}[typ]
    docks = int(np.clip(np.ceil(trips / 4), lo, hi))  # dövriyyə: 4 səfər/yer/gün
    cov = A[i].indices
    ll = gpd.GeoSeries([pt], crs=UTM).to_crs(WGS84).iloc[0]
    hubs.append({
        "rank": rank, "id": f"AYAN-20261018-{c.ref.lower()[:6]}-{typ}", "action": action, "type": typ,
        "anchor_kind": c.kind, "label": c.label, "lon": round(ll.x, 6), "lat": round(ll.y, 6),
        "x": round(pt.x, 1), "y": round(pt.y, 1), "offset_m": offset, "qa": qa,
        "gain_w": round(g, 2), "gain_share": round(g / W_TOTAL, 4),
        "pop_covered": round(float(cells["pop"].values[cov].sum()), -2),
        "pop_unserved_covered": round(float((cells["pop"].values[cov] * cells.gap.values[cov]).sum()), -2),
        "transit_daily": round(float(cells.transit.values[cov].sum()), -2),
        "trips_day": round(trips), "docks": docks,
        "co2_t_year": {k: round(co2_t(trips, k), 1) for k in ("low", "base", "high")},
        "stability": round(float(stability[i]), 2), **ctx,
    })
log(f"{len(hubs)} hub yerləşdirildi, {len(rejected)} rədd edildi")

# avtomatik yoxlama: yerləşdirilmiş hub-lar arası məsafə
hxy = np.array([[h["x"], h["y"]] for h in hubs])
dmin = [float(np.sort(np.hypot(*(hxy - p).T))[1]) for p in hxy] if len(hxy) > 1 else []
rep["placement_qa"] = {"placed": len(hubs), "rejected": rejected,
                       "new": sum(h["action"] == "new" for h in hubs), "upgrade": sum(h["action"] == "upgrade" for h in hubs),
                       "min_spacing_m": round(min(dmin), 1) if dmin else None,
                       "new_hubs_free_check": all(is_free(Point(h["x"], h["y"])) for h in hubs if h["action"] == "new")}

# --- 8. Avtovağzal "Gəliş balı" (0–5) --------------------------------------------
def lin(v, good, bad):
    return float(np.clip((bad - v) / (bad - good), 0, 1))


def walk_to(gdf, x, y, limit=1500):
    reach = net.reach(x, y, limit)
    n, d = net.snap(np.c_[gdf.geometry.x, gdf.geometry.y])
    vals = [reach[k] + dd for k, dd in zip(n, d) if k in reach]
    return min(vals) if vals else np.inf


lane_pts = gpd.GeoSeries([Point(p) for g in lanes.geometry for ls in getattr(g, "geoms", [g])
                          for p in [ls.interpolate(t).coords[0] for t in np.arange(0, ls.length, 20)]], crs=UTM)
arrival = []
for _, s in stations.iterrows():
    x, y = s.geometry.x, s.geometry.y
    ctx = context(x, y)
    dm, dp, dl = walk_to(metro, x, y), walk_to(parks, x, y), walk_to(gpd.GeoDataFrame(geometry=lane_pts), x, y)
    parts = {"metro": lin(dm, 300, 800), "bus": min(len(ctx["bus_routes"]) / 10, 1.0),
             "parking": lin(dp, 150, 400), "lane": lin(dl, 200, 800)}
    score = 5 * (0.35 * parts["metro"] + 0.25 * parts["bus"] + 0.25 * parts["parking"] + 0.15 * parts["lane"])
    ll = s.geometry
    arrival.append({"id": s.id, "name": s["name"], "score": round(score, 1), "parts": {k: round(v, 2) for k, v in parts.items()},
                    "metro_walk_m": None if np.isinf(dm) else round(dm), "parking_walk_m": None if np.isinf(dp) else round(dp),
                    "lane_walk_m": None if np.isinf(dl) else round(dl), "bus_routes_400": len(ctx["bus_routes"]),
                    "metro_stations": ctx["metro_stations"]})
rep["arrival"] = arrival

# --- 9. Şəhər üzrə göstəricilər --------------------------------------------------
served = cells.d_park <= 400
rep["city"] = {
    "pop_total": round(float(cells["pop"].sum()), -3),
    "pop_without_parking_400m": round(float(cells["pop"][~served].sum()), -3),
    "pop_without_parking_share": round(float(cells["pop"][~served].sum() / cells["pop"].sum()), 3),
    "transit_daily_without_parking_share": round(float(cells.transit[~served].sum() / cells.transit.sum()), 3),
    "metro_exits_without_parking_400m": int(sum(1 for _, m in metro.iterrows()
                                               if not np.isfinite(walk_to(parks, m.geometry.x, m.geometry.y, 400)))),
}
# boşluğun bağlanma potensialı: xidmət olunan əhalinin indiki səfər intensivliyi ilə
served_pop = float(cells["pop"][served].sum())
trips_per_1000 = 547_758 / 30 / served_pop * 1000
pot_trips = trips_per_1000 * float(cells["pop"][~served].sum()) / 1000
rep["city"]["trips_per_1000_served_pop_day"] = round(trips_per_1000, 1)
rep["city"]["gap_potential_trips_day"] = round(pot_trips, -2)
rep["city"]["gap_potential_co2_t_year"] = {k: round(co2_t(pot_trips, k)) for k in ("low", "base", "high")}
top10 = hubs[:10]
rep["top10"] = {"pop_unserved_covered": round(sum(h["pop_unserved_covered"] for h in top10), -3),
                "trips_day": round(sum(h["trips_day"] for h in top10)),
                "co2_t_year": {k: round(sum(h["co2_t_year"][k] for h in top10)) for k in ("low", "base", "high")}}

out = {"generated": "2026-10-18", "walk_m": HUB_WALK_M, "weights": W_DEFAULT, "curve": [round(float(v), 4) for v in curve],
       "hubs": hubs, "arrival": arrival, "co2_params": CO2}
(BUILD / "hubs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=float))
(BUILD / "hubs_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2, default=float))
print(json.dumps({k: v for k, v in rep.items() if k != "arrival"}, ensure_ascii=False, indent=2, default=float))
print(json.dumps(arrival, ensure_ascii=False, indent=1))
log("bitdi")
