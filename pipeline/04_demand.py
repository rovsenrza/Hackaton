"""Mərhələ 2b: tələbat, avtobus sərnişin proqnozu, boşluq.

Çıxışlar (build/):
  cells.parquet          H3 res11 tələbat xanaları: pop, transit, poi, D, gap, w=D×gap
  bus_stops.gpkg         OSM dayanacaqları + marşrutlar + gündəlik minik (boardings)
  bus_routes_pax.gpkg    marşrutlar: ölçülmüş 🟢 / proqnoz 🟡 sərnişin
  demand_report.json     model metrikaları və yoxlamalar
"""
import json

import geopandas as gpd
import h3
import networkx as nx
import numpy as np
import pandas as pd
import rasterio
from rasterio.mask import mask
from shapely.geometry import box
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from common import RAW, BUILD, ENGINE_DATA, EXT, HUB_WALK_M, OSM_PBF, UTM, WGS84, baku_boundary
from walk import WalkNet

RES = 11
W = {"transit": 0.45, "pop": 0.35, "poi": 0.20}
CENTER = (49.8352, 40.3716)  # Fəvvarələr meydanı
STOP_ROUTE_M = 25            # dayanacaq marşruta aiddir, əgər xəttə ≤ 25 m-dirsə
rep: dict = {}

baku = baku_boundary()
baku_u = baku.to_crs(UTM).union_all()
net = WalkNet(ENGINE_DATA / "walk_graph.pkl")
gx0, gy0, gx1, gy1 = net.xy[:, 0].min(), net.xy[:, 1].min(), net.xy[:, 0].max(), net.xy[:, 1].max()
zone_u = baku_u.intersection(box(gx0, gy0, gx1, gy1))

# --- 1. Əhali: WorldPop 2026 → H3 res11 (sahəyə görə bölüşdürmə) -----------
with rasterio.open(EXT / "worldpop_aze_2026_100m.tif") as r:
    arr, tr = mask(r, gpd.GeoSeries([zone_u], crs=UTM).to_crs(WGS84), crop=True)
    arr = np.where(arr[0] == r.nodata, 0, arr[0]).astype(float)
rows, cols = np.nonzero(arr > 0)
px_lon, px_lat = rasterio.transform.xy(tr, rows, cols)
px_pop = arr[rows, cols]
rep["pop_zone_total"] = round(float(px_pop.sum()))

# hər pikseli res11 xanalarına böl: piksel ərazisindəki xanalar pikselin əhalisini bərabər paylaşır
half = abs(tr.a) / 2
pop_cells: dict[str, float] = {}
for lon, lat, p in zip(px_lon, px_lat, px_pop):
    poly = h3.LatLngPoly([(lat - half, lon - half), (lat - half, lon + half), (lat + half, lon + half), (lat + half, lon - half)])
    cs = h3.polygon_to_cells(poly, RES) or [h3.latlng_to_cell(lat, lon, RES)]
    share = p / len(cs)
    for c in cs:
        pop_cells[c] = pop_cells.get(c, 0.0) + share
rep["pop_cells_sum"] = round(sum(pop_cells.values()))

# --- 2. Avtobus dayanacaqları (OSM) və marşrut bağlantısı ------------------
pts = gpd.read_file(OSM_PBF, layer="points", bbox=tuple(gpd.GeoSeries([zone_u], crs=UTM).to_crs(WGS84).total_bounds))
st = pts[pts.highway.eq("bus_stop")][["osm_id", "name", "geometry"]].to_crs(UTM)
st = st[st.within(zone_u)].reset_index(drop=True)
routes = gpd.read_file(BUILD / "bus_routes.gpkg").to_crs(UTM)

pairs = gpd.sjoin(st, routes[["route", "geometry"]].assign(geometry=routes.buffer(STOP_ROUTE_M)), predicate="within")
stop_routes = pairs.groupby(level=0).route.apply(list)
st["routes"] = stop_routes.reindex(st.index).apply(lambda v: v if isinstance(v, list) else [])
st["n_routes"] = st.routes.str.len()
n_stops = pairs.groupby("route").size()
routes["n_stops"] = routes.route.map(n_stops).fillna(0).astype(int)
rep["bus_stops"] = {"osm_in_zone": len(st), "with_route": int((st.n_routes > 0).sum()),
                    "routes_without_stops": int((routes.n_stops == 0).sum())}

# --- 3. Cazibə nöqtələri (Overture Places) ---------------------------------
POI_W = {  # Overture basic_category → çəki (gündəlik cəlbetmə gücünə görə)
    "college_university": 5, "campus_building": 3, "shopping_mall": 4, "hospital": 4,
    "education": 2, "place_of_learning": 2, "high_school": 2, "middle_school": 2, "specialty_school": 1,
    "government_office": 2, "corporate_or_business_office": 2, "food_and_beverage_store": 1,
    "stadium_arena": 2, "museum": 1, "park": 1, "bank_or_credit_union": 1, "outpatient_care_facility": 1,
    "travel_and_transportation": 2, "movie_theater": 1, "shopping": 1,
}
poi = gpd.GeoDataFrame(columns=["w", "geometry"], geometry="geometry", crs=UTM)
pf = EXT / "overture_places.parquet"
if pf.exists():
    pl = gpd.read_parquet(pf)
    pl = pl.assign(cat=pl["basic_category"])
    pl = pl[pl.cat.isin(POI_W)]
    if "confidence" in pl:
        pl = pl[pl.confidence >= 0.5]
    poi = gpd.GeoDataFrame({"cat": pl.cat, "w": pl.cat.map(POI_W)}, geometry=pl.geometry.to_crs(WGS84)).to_crs(UTM)
    poi = poi[poi.within(zone_u)].reset_index(drop=True)
rep["poi"] = {"count": len(poi), "by_cat": poi.cat.value_counts().to_dict() if len(poi) else {}}

# --- 4. Xanalar cədvəli (pop) və şəbəkəyə bağlanma --------------------------
cells = pd.DataFrame({"h3": list(pop_cells), "pop": list(pop_cells.values())})


def add_points(df_cells, lonlat, values, col):
    ids = [h3.latlng_to_cell(la, lo, RES) for lo, la in lonlat]
    s = pd.Series(values, index=ids).groupby(level=0).sum()
    df_cells = df_cells.set_index("h3").join(s.rename(col), how="outer").fillna({col: 0}).reset_index()
    return df_cells.rename(columns={"index": "h3"})


poi_ll = poi.to_crs(WGS84)
cells = add_points(cells, list(zip(poi_ll.geometry.x, poi_ll.geometry.y)), poi.w.values, "poi")
cells["pop"] = cells["pop"].fillna(0)
lat, lon = zip(*[h3.cell_to_latlng(c) for c in cells.h3])
cxy = gpd.GeoSeries(gpd.points_from_xy(lon, lat), crs=WGS84).to_crs(UTM)
cells["x"], cells["y"] = cxy.x.values, cxy.y.values
net.attach_points(cells[["x", "y"]].values)

# --- 5. Marşrut xüsusiyyətləri və sərnişin proqnoz modeli -------------------
metro = gpd.read_file(BUILD / "metro_exits.gpkg").to_crs(UTM)
stop_cov = {i: net.covered(g.x, g.y, HUB_WALK_M) for i, g in st.geometry.items()}
metro_xy = metro[["geometry"]].assign(x=metro.geometry.x, y=metro.geometry.y)
mnodes, md = net.snap(metro_xy[["x", "y"]].values)


def route_features(r):
    sidx = st.index[st.routes.apply(lambda v: r.route in v)]
    cov = np.unique(np.concatenate([stop_cov[i] for i in sidx])) if len(sidx) else np.empty(0, int)
    # metro bağlantısı: dayanacaqlardan 400 m piyada daxilində metro çıxışı olan stansiya sayı
    mlinks = set()
    for i in sidx:
        reach = net.reach(st.geometry[i].x, st.geometry[i].y, HUB_WALK_M)
        for k, (n, d) in enumerate(zip(mnodes, md)):
            if n in reach and reach[n] + d <= HUB_WALK_M:
                mlinks.add(metro.key[k])
    c = r.geometry.centroid
    return pd.Series({
        "length_km": r.geometry.length / 1000,
        "n_stops": len(sidx),
        "pop_catch": cells["pop"].values[cov].sum() if len(cov) else 0.0,
        "poi_catch": cells["poi"].values[cov].sum() if len(cov) else 0.0,
        "metro_links": len(mlinks),
        "dist_center_km": np.hypot(c.x - cxy_center.x, c.y - cxy_center.y) / 1000,
    })


cxy_center = gpd.GeoSeries(gpd.points_from_xy([CENTER[0]], [CENTER[1]]), crs=WGS84).to_crs(UTM).iloc[0]
F = routes.apply(route_features, axis=1)
routes = pd.concat([routes.drop(columns=["length_km"]), F.drop(columns=["n_stops"])], axis=1)

# öyrətmə: yalnız ≥ 60 gün datası olan marşrutlar (yeni açılmış və ya qısa müddətli marşrutlar sapmadır)
bb_days = pd.read_csv(RAW / "bakubus_gundelik_sernisin_2026.csv", encoding="utf-8-sig")
bb_days = bb_days.groupby(bb_days.iloc[:, 1].astype(str).str.replace(r"\s+", "", regex=True).str.upper()).size()
routes["data_days"] = routes.route.map(bb_days).fillna(0).astype(int)
routes["express"] = routes.route.str.endswith("E").astype(float)

feat = ["n_stops", "pop_catch", "poi_catch", "metro_links", "dist_center_km", "express"]
Xall = routes[feat].assign(n_stops=routes.n_stops).astype(float)
Xall_t = Xall.assign(pop_catch=np.log1p(Xall.pop_catch), poi_catch=np.log1p(Xall.poi_catch),
                     n_stops=np.log1p(Xall.n_stops))
train = routes.pax_measured.notna() & (routes.data_days >= 60)
X, y = Xall_t[train].values, np.log(routes.loc[train, "pax_measured"].values)

models = {
    "ridge_log": make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-2, 3, 30))),
    "gbr": GradientBoostingRegressor(n_estimators=300, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=0),
}
cv = {}
for name, m in models.items():
    p = cross_val_predict(m, X, y, cv=LeaveOneOut())
    ape = np.abs(np.exp(p) - np.exp(y)) / np.exp(y)
    ss_res, ss_tot = ((p - y) ** 2).sum(), ((y - y.mean()) ** 2).sum()
    cv[name] = {"MdAPE": round(float(np.median(ape)), 3), "MAPE": round(float(ape.mean()), 3),
                "R2_log": round(float(1 - ss_res / ss_tot), 3)}
# baza xətti: hamıya median vermək
base_ape = np.abs(np.median(np.exp(y)) - np.exp(y)) / np.exp(y)
cv["baseline_median"] = {"MdAPE": round(float(np.median(base_ape)), 3), "MAPE": round(float(base_ape.mean()), 3)}
best = min(models, key=lambda k: cv[k]["MdAPE"])
models[best].fit(X, y)
lo, hi = np.exp(y.min()), np.exp(y.max())
pred = np.clip(np.exp(models[best].predict(Xall_t.values)), lo, hi)  # öyrətmə diapazonundan kənara çıxmır
# Kalibrləmə: AYNA rəsmi cəmi, yanvar–avqust 2026: 335.6 mln gediş / 243 gün (report.az, ayna.az)
OFFICIAL_DAILY = 335.6e6 / 243
measured_sum = routes.pax_measured.sum()
raw_pred_sum = pred[routes.pax_measured.isna().values].sum()
calib = (OFFICIAL_DAILY - measured_sum) / raw_pred_sum
routes["pax_pred"] = pred * calib
routes["pax"] = routes.pax_measured.fillna(routes.pax_pred)
rep["route_calibration"] = {"official_daily": round(OFFICIAL_DAILY), "measured_sum": round(float(measured_sum)),
                            "raw_pred_sum": round(float(raw_pred_sum)), "factor": round(float(calib), 3)}
routes["pax_status"] = np.where(routes.pax_measured.notna(), "measured", "predicted")
# dayanacağı olmayan marşrut: sərnişin dayanacaqlara paylanmır (qeyd olunur)
rep["route_model"] = {"cv_leave_one_out": cv, "chosen": best, "train_n": int(train.sum()),
                      "excluded_short_data": routes.route[routes.pax_measured.notna() & ~train].tolist(),
                      "predicted_n": int(routes.pax_measured.isna().sum()),
                      "predicted_daily_total": round(float(routes.loc[routes.pax_measured.isna(), "pax"].sum())),
                      "measured_daily_total": round(float(routes.loc[routes.pax_measured.notna(), "pax"].sum()))}
routes.to_crs(WGS84).to_file(BUILD / "bus_routes_pax.gpkg")

# --- 6. Dayanacaq minikləri: marşrut sərnişini dayanacaqlarına bərabər bölünür
route_pax = routes.set_index("route").pax
route_ns = routes.set_index("route").n_stops.replace(0, np.nan)
st["boardings"] = st.routes.apply(lambda v: float(sum(route_pax[r] / route_ns[r] for r in v if route_ns.get(r) == route_ns.get(r))))
st["pax_status"] = st.routes.apply(lambda v: "measured" if v and all(routes.set_index("route").pax_status[r] == "measured" for r in v) else ("mixed" if v else "none"))
st.to_crs(WGS84).to_file(BUILD / "bus_stops.gpkg")

# --- 7. Nəqliyyat tələbatı xanalara ----------------------------------------
mll = metro.to_crs(WGS84)
sll = st.to_crs(WGS84)
tr_lonlat = list(zip(mll.geometry.x, mll.geometry.y)) + list(zip(sll.geometry.x, sll.geometry.y))
tr_val = np.concatenate([metro.exit_pax.values, st.boardings.values])
cells = cells.drop(columns=["x", "y"])
cells = add_points(cells, tr_lonlat, tr_val, "transit")
cells = cells.fillna(0)
lat, lon = zip(*[h3.cell_to_latlng(c) for c in cells.h3])
cxy = gpd.GeoSeries(gpd.points_from_xy(lon, lat), crs=WGS84).to_crs(UTM)
cells["x"], cells["y"] = cxy.x.values, cxy.y.values
cells = cells[gpd.GeoSeries(cxy.values, crs=UTM).within(zone_u).values].reset_index(drop=True)

# --- 8. Tələbat indeksi D: hər komponent şəhər üzrə payına normallaşdırılır ------
# (cəm = 1), buna görə çəkilər (45/35/20) D-nin real tərkibini ifadə edir.
# D vahidi: "şəhər tələbatının milyonda biri".
total = {}
for k in W:
    total[k] = float(cells[k].sum())
    cells[f"{k}_n"] = cells[k] / total[k] * 1e6
cells["D"] = sum(W[k] * cells[f"{k}_n"] for k in W)
rep["demand_share"] = {k: round(float((W[k] * cells[f"{k}_n"]).sum() / cells.D.sum()), 3) for k in W}

# --- 9. Boşluq: mövcud parkinqə və velo-zolağa real piyada məsafəsi ----------
net.attach_points(cells[["x", "y"]].values)
cnode, cd = net._pts["node"], net._pts["d"]


def multi_source(points_xy, cutoff):
    """Bütün mənbələrdən ən qısa piyada məsafəsi (mənbə→şəbəkə məsafəsi daxil)."""
    G = net.G
    nodes, d0 = net.snap(points_xy)
    SUPER = "SRC"
    G.add_node(SUPER)
    for n, d in zip(nodes, d0):
        if not G.has_edge(SUPER, n) or G[SUPER][n]["length"] > d:
            G.add_edge(SUPER, n, length=float(d))
    dist = nx.single_source_dijkstra_path_length(G, SUPER, cutoff=cutoff, weight="length")
    G.remove_node(SUPER)
    return dist


def cell_dist(dist, cutoff):
    out = np.full(len(cells), np.inf)
    for i, (n, d) in enumerate(zip(cnode, cd)):
        v = dist.get(n)
        if v is not None and v + d <= cutoff:
            out[i] = v + d
    return out


parks = gpd.read_file(BUILD / "parkings.gpkg").to_crs(UTM)
lanes = gpd.read_file(BUILD / "bike_lanes.gpkg").to_crs(UTM)
lane_pts = np.vstack([np.array([ls.interpolate(t).coords[0] for t in np.arange(0, ls.length, 20)])
                      for g in lanes.geometry for ls in getattr(g, "geoms", [g])])


def gap_from(park_subset):
    dp = cell_dist(multi_source(np.c_[park_subset.geometry.x, park_subset.geometry.y], 400), 400)
    return np.clip((dp - 150) / 250, 0, 1), dp


dl = cell_dist(multi_source(lane_pts, 800), 800)
lane_gap = np.clip((dl - 200) / 600, 0, 1)
pgap_all, dp_all = gap_from(parks)
cells["d_park"], cells["d_lane"] = dp_all, dl
cells["gap"] = 0.7 * pgap_all + 0.3 * lane_gap
cells["w"] = cells.D * cells.gap

cells.to_parquet(BUILD / "cells.parquet")
rep["cells"] = {"n": len(cells), "pop_sum": round(float(cells["pop"].sum())),
                "transit_sum": round(float(cells.transit.sum())),
                "unserved_pop_share": round(float(cells["pop"][cells.gap >= 0.99].sum() / cells["pop"].sum()), 3)}
(BUILD / "demand_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2, default=float))
print(json.dumps(rep, ensure_ascii=False, indent=2, default=float))
