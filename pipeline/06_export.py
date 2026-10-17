"""Mərhələ 4: veb üçün yığcam statik data (web/public/data/).

Həndəsə sadələşdirmə yalnız UTM-də (metr) aparılır: tolerantlıq ≤ 2 m.
"""
import json

import geopandas as gpd
import h3
import numpy as np
import pandas as pd

from common import BUILD, ENGINE_DATA, HUB_WALK_M, UTM, WEB_DATA, WGS84
from walk import WalkNet

SIMPLIFY_M = 2.0
sizes = {}


def write_geojson(gdf, name, props, simplify=True, precision=6):
    g = gdf.to_crs(UTM)
    if simplify:
        g["geometry"] = g.geometry.simplify(SIMPLIFY_M, preserve_topology=True)
    g = g.to_crs(WGS84)[props + ["geometry"]]
    p = WEB_DATA / f"{name}.geojson"
    p.write_text(g.to_json(drop_id=True, to_wgs84=False, na="drop", show_bbox=False).replace(", ", ","))
    # koordinat dəqiqliyi: 6 rəqəm ≈ 0.1 m
    data = json.loads(p.read_text())
    for f in data["features"]:
        f["geometry"] = json.loads(json.dumps(f["geometry"]), parse_float=lambda v: round(float(v), precision))
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    sizes[p.name] = round(p.stat().st_size / 1024)


r = lambda v, n=0: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), n)

routes = gpd.read_file(BUILD / "bus_routes_pax.gpkg")     # AYNA cari şəbəkəsi
routes["pax"] = routes.pax.round(-1)
write_geojson(routes, "bus_routes", ["route", "pax", "pax_status", "n_stops", "operator"])
off = gpd.read_file(BUILD / "official_hubs.gpkg")
off["modes"] = off.modes.apply(json.loads)
write_geojson(off, "official_hubs", ["id", "name", "n_stops", "n_routes", "modes"], simplify=False)
write_geojson(gpd.read_file(BUILD / "rail_stations.gpkg"), "rail_stations", ["name", "n_routes"], simplify=False)

metro = gpd.read_file(BUILD / "metro_exits.gpkg")
metro["station_pax"] = metro.station_pax.round(-2)
write_geojson(metro, "metro_exits", ["id", "station_az", "exit", "address", "station_pax"], simplify=False)

write_geojson(gpd.read_file(BUILD / "bus_stations.gpkg"), "bus_stations", ["id", "name"], simplify=False)
write_geojson(gpd.read_file(BUILD / "parkings.gpkg"), "parkings", ["id", "name", "ptype"], simplify=False)
lanes = gpd.read_file(BUILD / "bike_lanes.gpkg")
lanes["length_km"] = lanes.length_km.round(2)
write_geojson(lanes, "bike_lanes", ["id", "name", "length_km"])
stops = gpd.read_file(BUILD / "bus_stops.gpkg")
stops = stops[stops.n_routes > 0].copy()
stops["boardings"] = stops.boardings.round(-1)
write_geojson(stops, "bus_stops", ["name", "n_routes", "boardings", "pax_status"], simplify=False)

# --- H3 res9 aqreqasiya (xəritə qatı) ---------------------------------------
cells = pd.read_parquet(BUILD / "cells.parquet")
cells["h9"] = [h3.cell_to_parent(c, 9) for c in cells.h3]
cells["pop_gap"] = cells["pop"] * cells.gap
agg = cells.groupby("h9").agg(pop=("pop", "sum"), transit=("transit", "sum"), poi=("poi", "sum"),
                             D=("D", "sum"), w=("w", "sum"), pop_gap=("pop_gap", "sum"), dpark=("d_park", "min"))
agg["gap"] = np.where(agg["pop"] > 0, agg.pop_gap / agg["pop"].replace(0, np.nan), np.nan)
agg = agg[(agg["pop"] >= 1) | (agg.transit > 0)]
rows = [[h, r(a["pop"]), r(a.transit), r(a.D, 2), r(a.w, 2), r(a.gap, 2), (None if np.isinf(a.dpark) else r(a.dpark))]
        for h, a in agg.iterrows()]
(WEB_DATA / "h3_r9.json").write_text(json.dumps({"cols": ["h", "pop", "transit", "D", "w", "gap", "dpark"], "rows": rows},
                                                 separators=(",", ":")))
sizes["h3_r9.json"] = round((WEB_DATA / "h3_r9.json").stat().st_size / 1024)

# --- Hub-lar + izoxron poliqonları --------------------------------------------
net = WalkNet(ENGINE_DATA / "walk_graph.pkl")
hubs = json.loads((BUILD / "hubs.json").read_text())
feats = []
for h in hubs["hubs"]:
    poly = net.isochrone_polygon(h["x"], h["y"], HUB_WALK_M)
    g = gpd.GeoSeries([poly], crs=UTM).simplify(SIMPLIFY_M).to_crs(WGS84).iloc[0]
    feats.append({"type": "Feature", "properties": {"rank": h["rank"], "id": h["id"]},
                  "geometry": json.loads(json.dumps(g.__geo_interface__), parse_float=lambda v: round(float(v), 6))})
(WEB_DATA / "isochrones.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
sizes["isochrones.geojson"] = round((WEB_DATA / "isochrones.geojson").stat().st_size / 1024)
for h in hubs["hubs"]:
    h.pop("x"), h.pop("y")
(WEB_DATA / "hubs.json").write_text(json.dumps(hubs, ensure_ascii=False, separators=(",", ":")))
sizes["hubs.json"] = round((WEB_DATA / "hubs.json").stat().st_size / 1024)

# --- Metrikalar (panel, metodologiya, keyfiyyət) -------------------------------
metrics = {}
for f in ("convert_report", "demand_report", "hubs_report", "walk_graph_report", "ayna_report"):
    metrics[f.replace("_report", "")] = json.loads((BUILD / f"{f}.json").read_text())
(WEB_DATA / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, separators=(",", ":"), default=float))
sizes["metrics.json"] = round((WEB_DATA / "metrics.json").stat().st_size / 1024)

print(json.dumps(sizes, indent=1), "cəmi KB:", sum(sizes.values()))

# --- Engine üçün hub toxumu (təsdiq axınının başlanğıc siyahısı) ---------------
(ENGINE_DATA / "hubs_seed.json").write_text(json.dumps(hubs["hubs"], ensure_ascii=False))
