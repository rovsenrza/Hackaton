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
from hubcore import HubCore, build_masks, co2_t, parse_routes
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
stops = gpd.read_file(BUILD / "bus_stops.gpkg").to_crs(UTM)       # AYNA rəsmi dayanacaqları
rail = gpd.read_file(BUILD / "rail_stations.gpkg").to_crs(UTM)
official = gpd.read_file(BUILD / "official_hubs.gpkg").to_crs(UTM)
stops["routes"] = stops.routes.apply(parse_routes)
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
core = HubCore(net, cells, metro, stops, stations, parks, masks, K=1.0, rail=rail, official=official)
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
    C.append({"kind": "bus_stop", "ref": f"S{r.code}", "label": nm, "x": r.geometry.x, "y": r.geometry.y})
for _, r in rail.iterrows():
    C.append({"kind": "rail_station", "ref": f"R{r['name'][:12]}", "label": f"{r['name']} qatar stansiyası", "x": r.geometry.x, "y": r.geometry.y})
for _, r in official.iterrows():
    C.append({"kind": "official_hub", "ref": r.id, "label": r["name"], "x": r.geometry.x, "y": r.geometry.y})
for _, r in parks.iterrows():
    C.append({"kind": "parking", "ref": r.id, "label": r["name"] or "Mövcud parkinq", "x": r.geometry.x, "y": r.geometry.y,
              "ptype": r.ptype})
C = pd.DataFrame(C)
rep["candidates"] = C.kind.value_counts().to_dict()

# --- 3. Hər namizədin yerləşməsi (tövsiyə növü + icazəli nöqtə) ----------------
park_xy = np.c_[parks.geometry.x, parks.geometry.y]
act, px, py, off, qa = [], [], [], [], []
off_n, off_d = net.snap(np.c_[official.geometry.x, official.geometry.y]) if len(official) else (np.empty(0), np.empty(0))
for c in C.itertuples():
    near = core.nearest_parking(c.x, c.y, 150)
    r150 = net.reach(c.x, c.y, 150)
    near_off = any((n in r150) and r150[n] + d <= 150 for n, d in zip(off_n, off_d))
    if c.kind == "official_hub" or near_off:
        # AYNA-nın rəsmi mübadilə mərkəzi: yeni hub yox, mikromobilliyin inteqrasiyası
        p, o = core.place(c.x, c.y, r_min=0)
        if p is None:
            act.append("rejected"); px.append(np.nan); py.append(np.nan); off.append(np.nan)
            qa.append("60 m daxilində icazəli yer yoxdur")
        else:
            act.append("integrate"); px.append(p.x); py.append(p.y); off.append(o)
            qa.append("AYNA rəsmi mübadilə mərkəzi: səki zolağında, yoldan ≥2,5 m, bina/dəmir yolu/su xaricində")
        continue
    if c.kind == "parking" or near is not None:
        k = int(np.flatnonzero(parks.id.values == c.ref)[0]) if c.kind == "parking" else near[0]
        # AYNA koordinatı icazəli ərazidədirsə saxlanılır; yolun üstünə düşürsə ən yaxın səki nöqtəsinə köçürülür
        p, o = core.place(park_xy[k, 0], park_xy[k, 1], r_min=0, existing=True)
        act.append("upgrade")
        if p is None:
            px.append(park_xy[k, 0]); py.append(park_xy[k, 1]); off.append(0.0)
            qa.append("mövcud parkinq koordinatı (AYNA); 60 m-də icazəli səki tapılmadı, yoxlanmalıdır")
        elif o == 0:
            px.append(p.x); py.append(p.y); off.append(0.0)
            qa.append("mövcud parkinq koordinatı (AYNA), icazəli ərazidədir")
        else:
            px.append(p.x); py.append(p.y); off.append(o)
            qa.append(f"AYNA parkinq koordinatı yolun hərəkət hissəsinə düşürdü, {o} m kənara, səkiyə köçürüldü")
    else:
        p, o = core.place(c.x, c.y)
        if p is None:
            act.append("rejected"); px.append(np.nan); py.append(np.nan); off.append(np.nan)
            qa.append("60 m daxilində icazəli yer yoxdur")
        else:
            act.append("new"); px.append(p.x); py.append(p.y); off.append(o)
            qa.append("səki zolağında: yoldan ≥2,5 m, bina/dəmir yolu/su xaricində, düyünə ≤60 m piyada")
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


# tip həddi: namizədlərin 400 m-dəki marşrut sayının 75-ci faizi; yer sayı: ümumi istifadənin paylanması
ctx_routes = np.array([len(core.context(x, y)["bus_routes"]) for x, y in C[["px", "py"]].values[ok]])
core.route_m = ROUTE_M = int(max(3, np.percentile(ctx_routes, 75)))
gross_all = K * (A @ cells.D.values)[ok]
core.gross_q = GROSS_Q = np.sort(gross_all)
rep["typology"] = {"route_m_threshold": ROUTE_M, "gross_trips_p50": round(float(np.median(gross_all)), 1),
                   "gross_trips_p90": round(float(np.percentile(gross_all, 90)), 1)}

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

# --- 7. Doğrulama ---------------------------------------------------------------------
# Tələbat indeksi AYNA-nın seçdiyi parkinq yerlərini tanıyırmı? Baza xətləri ilə birlikdə.
pll = parks.to_crs(WGS84)
pos_h = {h3.latlng_to_cell(g.y, g.x, 11) for g in pll.geometry}
is_pos = cells.h3.isin(pos_h).values
cen = gpd.GeoSeries(gpd.points_from_xy([49.8352], [40.3716]), crs=WGS84).to_crs(UTM).iloc[0]
dcen = np.hypot(cells.x.values - cen.x, cells.y.values - cen.y)


def auc_set(neg_mask, n=20000):
    neg_pool = np.flatnonzero(~is_pos & neg_mask)
    neg = rng.choice(neg_pool, min(n, len(neg_pool)), replace=False)
    pos = np.flatnonzero(is_pos & neg_mask) if neg_mask is not True else np.flatnonzero(is_pos)
    yv = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
    idx = np.r_[pos, neg]
    out = {col: round(float(roc_auc_score(yv, cells[col].values[idx])), 3) for col in ("D", "transit_n", "pop_n", "poi_n")}
    out["yalnız_mərkəzə_yaxınlıq"] = round(float(roc_auc_score(yv, -dcen[idx])), 3)
    out["n_pos"], out["n_neg"] = int(len(pos)), int(len(neg))
    return out


populated = cells["pop"].values > 0
auc_all = auc_set(populated)
auc_ring = auc_set(populated & (dcen <= 8000))  # mərkəzdən 8 km halqası: "mərkəz effekti" çıxarılır

# AYNA-nın rəsmi mübadilə mərkəzləri: model onları müstəqil tapırmı? (skorinq "hub" bayrağını bilmir)
def official_recall(sel, radius=400):
    hit = np.zeros(len(official), bool)
    for i in sel:
        r = net.reach(C.px.iat[i], C.py.iat[i], radius)
        hit |= np.array([(n in r) and r[n] + d <= radius for n, d in zip(off_n, off_d)])
    return hit


non_off = np.flatnonzero(ok & (C.kind != "official_hub").values)
p_wo, _ = greedy(cells.w.values, n=N_MAX, allowed=(C.kind != "official_hub").values)  # rəsmi hub namizədləri çıxarılmış
rec = {}
for k in (10, 20, 50):
    hit = official_recall(p_wo[:k])
    rand = np.mean([official_recall(rng.choice(non_off, k, replace=False)).mean() for _ in range(40)])
    rec[k] = {"model": round(float(hit.mean()), 3), "random": round(float(rand), 3),
              "found": [str(official.name.iat[j]) for j in np.flatnonzero(hit)]}

# MPV (yeni velosiped məntəqələri qovluğu) MPS şəbəkəsinin yanında yerləşirmi? Təsadüfi baza ilə.
mps, mpv = parks[parks.ptype == "MPS"], parks[parks.ptype == "MPV"]
mps_tree = __import__("shapely").STRtree(list(mps.geometry))
d_mpv = np.array([mps.geometry.iloc[mps_tree.nearest(g)].distance(g) for g in mpv.geometry])
pw = cells["pop"].values / cells["pop"].values.sum()
rnd = rng.choice(len(cells), 5000, p=pw)
d_rnd = np.array([mps.geometry.iloc[mps_tree.nearest(Point(cells.x.values[i], cells.y.values[i]))].distance(Point(cells.x.values[i], cells.y.values[i])) for i in rnd])
rep["validation"] = {
    "official_hub_recall": {"n_official": len(official), "by_k": rec},
    "demand_auc_vs_ayna_parkings": auc_all,
    "demand_auc_within_8km": auc_ring,
    "mpv_vs_mps": {"n_mpv": int(len(mpv)), "median_m_to_mps": round(float(np.median(d_mpv))),
                   "share_within_400m": round(float((d_mpv < 400).mean()), 3),
                   "random_resident_share_within_400m": round(float((d_rnd < 400).mean()), 3)},
}
log(f"doğrulama: AUC={auc_all['D']} (8 km: {auc_ring['D']})")

# --- 8. Top hub-lar (göstəricilər ARTIM kimi: əvvəlki hub-ların əhatə etmədiyi xanalar) -----
hubs = []
taken = np.zeros(len(cells), bool)
for rank, (i, g) in enumerate(zip(picks, gains), 1):
    c = C.iloc[i]
    cov = A[i].indices
    new = cov[~taken[cov]]
    taken[cov] = True
    ev = core.evaluate(c.px, c.py, cov=cov, new=new)
    ll = gpd.GeoSeries([Point(c.px, c.py)], crs=UTM).to_crs(WGS84).iloc[0]
    hubs.append({"rank": rank, "id": f"AYAN-20261018-{c.ref.lower()}-{ev['type']}", "cand": int(i),
                 "action": c.action, "anchor_kind": c.kind, "label": c.label,
                 "lon": round(ll.x, 7), "lat": round(ll.y, 7), "x": round(c.px, 2), "y": round(c.py, 2),
                 "offset_m": c.offset_m, "qa": c.qa, "gain_w": round(g, 2), "gain_share": round(g / W_TOTAL, 4),
                 "stability": round(float(stability[i]), 2), **ev})
hxy = np.array([[h["x"], h["y"]] for h in hubs])
dmin = [float(np.sort(np.hypot(*(hxy - p).T))[1]) for p in hxy]
rep["placement_qa"] = {"placed": len(hubs), "needs_review": sum("yoxlanmalıdır" in h["qa"] for h in hubs),
                       "integrate": sum(h["action"] == "integrate" for h in hubs),
                       "moved": sum(h["offset_m"] > 0 for h in hubs), "new": sum(h["action"] == "new" for h in hubs),
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
intercity = pd.read_csv(BUILD / "intercity.csv")
_ic = gpd.GeoSeries(gpd.points_from_xy(intercity.lon, intercity.lat), crs=WGS84).to_crs(UTM)
ic_xy = np.c_[_ic.x, _ic.y]
arrival = []
bld = masks[masks.kind == "building"]
bld_tree = __import__("shapely").STRtree(list(bld.geometry))
for _, s in stations.iterrows():
    x, y = s.geometry.x, s.geometry.y
    ctx = core.context(x, y)
    # avtovağzal nöqtəsi binanın mərkəzidir; məsafələr binanın konturundakı ən yaxşı nöqtədən ölçülür
    near = bld_tree.query(s.geometry.buffer(40))
    if len(near):
        fp = max((bld.geometry.iloc[j] for j in near), key=lambda g: g.area)
        ring = fp.exterior
        origins = [ring.interpolate(t).coords[0] for t in np.arange(0, ring.length, 15)] + [(x, y)]
    else:
        origins = [(x, y)]
    dm = min(walk_to(metro_xy, ox, oy) for ox, oy in origins)
    dp = min(walk_to(park_xy, ox, oy) for ox, oy in origins)
    dl = min(walk_to(lane_xy, ox, oy) for ox, oy in origins)
    ic = intercity[np.hypot(ic_xy[:, 0] - x, ic_xy[:, 1] - y) <= 500].route.nunique()
    parts = {"metro": lin(dm, 300, 800), "bus": min(len(ctx["bus_routes"]) / 20, 1.0),
             "parking": lin(dp, 150, 400), "lane": lin(dl, 200, 800)}
    score = 5 * (0.35 * parts["metro"] + 0.25 * parts["bus"] + 0.25 * parts["parking"] + 0.15 * parts["lane"])
    ll = gpd.GeoSeries([s.geometry], crs=UTM).to_crs(WGS84).iloc[0]
    arrival.append({"id": s.id, "name": s["name"], "lon": round(ll.x, 6), "lat": round(ll.y, 6), "score": round(score, 1),
                    "parts": {k: round(v, 2) for k, v in parts.items()},
                    "metro_walk_m": None if np.isinf(dm) else round(dm), "parking_walk_m": None if np.isinf(dp) else round(dp),
                    "lane_walk_m": None if np.isinf(dl) else round(dl), "bus_routes_400": len(ctx["bus_routes"]),
                    "intercity_routes": int(ic)})
rep["arrival"] = arrival

# --- 10. Şəhər göstəriciləri və boşluq potensialı ----------------------------------------
served = cells.d_park <= 400
served_pop = float(cells["pop"][served].sum())
trips_per_1000 = 547_758 / 30 / served_pop * 1000
pot_trips = trips_per_1000 * float(cells["pop"][~served].sum()) / 1000
metro_no_park = sum(1 for x, y in metro_xy if not walk_to(park_xy, x, y, 400) <= 400)
rep["city"] = {
    "pop_total": round(float(cells["pop"].sum()), -3),
    "pop_without_parking_400m": round(float(cells["pop"][~served].sum()), -3),
    "pop_without_parking_share": round(float(cells["pop"][~served].sum() / cells["pop"].sum()), 3),
    "transit_daily_without_parking_share": round(float(cells.transit[~served].sum() / cells.transit.sum()), 3),
    "metro_exits_without_parking_400m": int(metro_no_park), "metro_exits_total": len(metro),
    "trips_per_1000_served_pop_day": round(trips_per_1000, 1),
    # YUXARI HƏDD ekstrapolyasiyası: xidmət olunan zonaların səfər intensivliyi bütün xidmətsiz əhaliyə
    "gap_potential_upper_bound_trips_day": round(pot_trips, -2),
    "gap_potential_upper_bound_co2_t_year": {k: round(co2_t(pot_trips, k)) for k in ("low", "base", "high")},
}
# fayda əyrisi: sərt tərif (400 m-də parkinq yoxdur) üzrə yeni xidmət alan sakinlər, artım kimi
unserved_pop_total = float(cells["pop"][~served].sum())
cum = np.cumsum([h["pop_newly_served"] for h in hubs])
rep["program"] = {k: {"pop_newly_served": round(float(cum[k - 1]), -2),
                      "share_of_unserved": round(float(cum[k - 1] / unserved_pop_total), 4),
                      "trips_day_new": round(sum(h["trips_day"] for h in hubs[:k])),
                      "co2_t_year_base": round(sum(h["co2_t_year"]["base"] for h in hubs[:k]), 1)}
                  for k in (10, 20, 50) if k <= len(hubs)}
top10 = hubs[:10]
rep["top10"] = {"pop_newly_served": round(sum(h["pop_newly_served"] for h in top10), -3),
                "trips_day": round(sum(h["trips_day"] for h in top10)),
                "co2_t_year": {k: round(sum(h["co2_t_year"][k] for h in top10)) for k in ("low", "base", "high")}}

out = {"generated": "2026-10-18", "walk_m": HUB_WALK_M, "weights": W_DEFAULT, "curve": [round(float(v), 4) for v in curve],
       "unserved_pop_total": round(unserved_pop_total, -3),
       "hubs": hubs, "arrival": arrival}
(BUILD / "hubs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=float))
(BUILD / "hubs_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2, default=float))

# --- 11. Engine datası ----------------------------------------------------------------------
E = ENGINE_DATA
cells[["h3", "x", "y", "pop", "transit", "poi", "transit_n", "pop_n", "poi_n", "D", "gap", "d_park"]].to_parquet(E / "cells.parquet")
C.to_parquet(E / "candidates.parquet")
sparse.save_npz(E / "coverage.npz", A)
metro.to_parquet(E / "metro.parquet"); stops.to_parquet(E / "stops.parquet")
rail.to_parquet(E / "rail.parquet"); official.to_parquet(E / "official.parquet")
stations.to_parquet(E / "stations.parquet"); parks.to_parquet(E / "parks.parquet")
masks.to_parquet(E / "masks.parquet")
(E / "params.json").write_text(json.dumps({"K": K, "weights": W_DEFAULT, "min_spacing": MIN_SPACING,
                                           "w_total": W_TOTAL, "walk_m": HUB_WALK_M, "route_m": ROUTE_M,
                                           "gross_q": [round(float(v), 3) for v in GROSS_Q[:: max(1, len(GROSS_Q) // 200)]]}, indent=1))
print(json.dumps({k: v for k, v in rep.items() if k != "arrival"}, ensure_ascii=False, indent=2, default=float))
log("bitdi")
