"""Mərhələ 1b: AYNA xəritə API-si (OpenTripPlanner formatı) → rəsmi marşrutlar, dayanacaqlar, hub-lar.

Mənbə: datas/ayna_routesV5.json, datas/ayna_stopsV4.json (AYNA xəritə API-si, 18.10.2026)
Çıxış (build/):
  ayna_routes.gpkg       cari şəhərdaxili avtobus marşrutları (həndəsə: OTP pattern polyline)
  ayna_route_stops.csv   marşrut → dayanacaq ardıcıllığı (rəsmi bağlantı)
  ayna_stops.gpkg        şəhərdaxili avtobus dayanacaqları (Bakı)
  rail_stations.gpkg     elektrik qatarı (ADY) stansiyaları
  official_hubs.gpkg     AYNA-nın rəsmi Nəqliyyat Mübadilə Mərkəzləri (stop.hub = true)
  intercity.csv          şəhərlərarası marşrutların dayanacaqları (avtovağzal gəlişləri üçün)
"""
import ast
import json
import re

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString, MultiLineString, Point

from common import BUILD, RAW, UTM, WGS84, baku_boundary

rep: dict = {}
routes_raw = json.loads((RAW / "ayna_routesV5.json").read_text())["data"]["routes"]
stops_raw = json.loads((RAW / "ayna_stopsV4.json").read_text())["data"]
baku = baku_boundary().union_all()


def decode_polyline(s: str, precision: int = 5) -> list[tuple[float, float]]:
    """Google/OTP encoded polyline → [(lon, lat)]."""
    coords, idx, lat, lon, f = [], 0, 0, 0, 10 ** precision
    while idx < len(s):
        for which in (0, 1):
            shift = result = 0
            while True:
                b = ord(s[idx]) - 63
                idx += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else result >> 1
            if which == 0:
                lat += d
            else:
                lon += d
        coords.append((lon / f, lat / f))
    return coords


def pattern_points(p) -> str | None:
    g = p.get("patternGeometry")
    if isinstance(g, str):  # bəzən dict-in mətn təsviri kimi gəlir
        try:
            g = ast.literal_eval(g)
        except (ValueError, SyntaxError):
            m = re.search(r"'points':\s*'(.*)'", g)
            return m.group(1) if m else None
    return (g or {}).get("points")


norm = lambda s: re.sub(r"\s+", "", str(s)).upper()

# --- 1. Marşrutlar və dayanacaq ardıcıllıqları ---------------------------------
rows, rs_rows = [], []
for r in routes_raw:
    name, mode = r["shortName"].strip(), r["mode"]
    kind = "intercity" if name.startswith("IN_") else {"BUS": "city_bus", "RAIL": "rail", "SUBWAY": "subway"}[mode]
    lines = []
    for p in r.get("patterns") or []:
        pts = pattern_points(p)
        if pts:
            c = decode_polyline(pts)
            if len(c) >= 2:
                lines.append(LineString(c))
    for s in r.get("stops") or []:
        lon, lat = s["geometries"]["geoJson"]["coordinates"]
        rs_rows.append({"route": norm(name), "long": r.get("longName") or name, "kind": kind, "code": s["code"], "name": s["name"], "lon": lon, "lat": lat,
                        "seq": int(s.get("sequenceNumber") or 0), "hub": bool(s.get("hub"))})
    if kind == "city_bus" and lines:
        rows.append({"route": norm(name), "long_name": r.get("longName"), "operator": r.get("operatorName"),
                     "geometry": lines[0] if len(lines) == 1 else MultiLineString(lines)})
rs = pd.DataFrame(rs_rows)
# qatar "route"-u əslində reysdir ("Baku-Pirshagi-Sumgayit-6609"): xətt = nömrəsiz, istiqamətdən asılı olmayan ad
rs["line"] = rs["long"].astype(str).str.replace(r"-\d+$", "", regex=True).map(lambda t: "–".join(sorted(t.split("-"))))
rs["in_baku"] = gpd.GeoSeries(gpd.points_from_xy(rs.lon, rs.lat), crs=WGS84).within(baku).values
routes = gpd.GeoDataFrame(rows, geometry="geometry", crs=WGS84)
routes = routes[routes.intersects(baku)].reset_index(drop=True)
city_rs = rs[(rs.kind == "city_bus") & rs.route.isin(routes.route)]
routes["n_stops"] = routes.route.map(city_rs.groupby("route").code.nunique()).fillna(0).astype(int)
routes["length_km"] = routes.to_crs(UTM).length / 1000
routes.to_file(BUILD / "ayna_routes.gpkg")
city_rs[["route", "code", "seq"]].to_csv(BUILD / "ayna_route_stops.csv", index=False)

# --- 2. Şəhərdaxili avtobus dayanacaqları (Bakı) ------------------------------------
st = city_rs[city_rs.in_baku].groupby("code").agg(name=("name", "first"), lon=("lon", "first"), lat=("lat", "first"),
                                                  routes=("route", lambda v: sorted(set(v))), hub=("hub", "max")).reset_index()
st["n_routes"] = st.routes.str.len()
st = gpd.GeoDataFrame(st, geometry=gpd.points_from_xy(st.lon, st.lat), crs=WGS84).drop(columns=["lon", "lat"])
st["routes"] = st.routes.apply(json.dumps)
st.to_file(BUILD / "ayna_stops.gpkg")

# --- 3. Elektrik qatarı stansiyaları ----------------------------------------------------
# ADY datasında adlar ingilis transliterasiyasındadır; "route" əslində reysdir → xətt = unikal longName
RAIL_AZ = {"Baku": "Bakı", "Bakikhanov": "Bakıxanov", "Bilajari": "Biləcəri", "Goradil": "Goradil", "Keshle": "Keşlə",
           "Khirdalan": "Xırdalan", "Koroghlu": "Koroğlu", "Mammadli": "Məmmədli", "Novkhani": "Novxanı",
           "Pirshaghi": "Pirşağı", "Sabunchu": "Sabunçu", "Zabrat1": "Zabrat-1", "Zabrat2": "Zabrat-2"}
rail = rs[(rs.kind == "rail") & rs.in_baku].groupby("name").agg(lon=("lon", "mean"), lat=("lat", "mean"),
                                                               n_trips=("route", "nunique"), n_routes=("line", "nunique")).reset_index()
rail["name"] = rail.name.map(lambda n: RAIL_AZ.get(n, n))
rail = gpd.GeoDataFrame(rail, geometry=gpd.points_from_xy(rail.lon, rail.lat), crs=WGS84).drop(columns=["lon", "lat"])
rail.to_file(BUILD / "rail_stations.gpkg")

# --- 4. Rəsmi Nəqliyyat Mübadilə Mərkəzləri (stop.hub = true), 300 m klasterləşmə ------------
hs = pd.DataFrame([s for s in stops_raw if s.get("hub")])
hg = gpd.GeoDataFrame(hs, geometry=gpd.points_from_xy(hs.lon, hs.lat), crs=WGS84).to_crs(UTM)
lab = -np.ones(len(hg), int)
for i in range(len(hg)):
    if lab[i] < 0:
        lab[i] = lab.max() + 1
        near = hg.geometry.distance(hg.geometry.iloc[i]) <= 300
        lab[(near.values) & (lab < 0)] = lab[i]
hg["cl"] = lab
hub_rs = rs[rs.hub]
offs = []
for cl, g in hg.groupby("cl"):
    names = g.name.value_counts()
    nm = next((n for n in names.index if "Mübadilə" in n), names.index[0])
    c = g.geometry.union_all().centroid
    near_rs = hub_rs[gpd.GeoSeries(gpd.points_from_xy(hub_rs.lon, hub_rs.lat), crs=WGS84).to_crs(UTM).distance(c).values <= 300]
    offs.append({"name": nm, "n_stops": len(g), "n_routes": int(near_rs.route.nunique()),
                 "modes": json.dumps(sorted(set(near_rs.kind))), "geometry": c})
off = gpd.GeoDataFrame(offs, geometry="geometry", crs=UTM)
# eyni adlı, 1 km daxilindəki klasterlər bir mərkəzdir (məs. Koroğlu kompleksinin iki tərəfi)
merged = []
for nm, g in off.groupby("name"):
    used = np.zeros(len(g), bool)
    for i in range(len(g)):
        if used[i]:
            continue
        grp = (g.geometry.distance(g.geometry.iloc[i]) <= 1000).values & ~used
        used |= grp
        gg = g[grp]
        merged.append({"name": nm, "n_stops": int(gg.n_stops.sum()), "n_routes": int(gg.n_routes.max()),
                       "modes": json.dumps(sorted(set(sum((json.loads(m) for m in gg.modes), [])))),
                       "geometry": gg.geometry.union_all().centroid})
off = gpd.GeoDataFrame(merged, geometry="geometry", crs=UTM).to_crs(WGS84)
off = off[off.within(baku)].reset_index(drop=True)
off["id"] = [f"NMM{i+1}" for i in range(len(off))]
off.to_file(BUILD / "official_hubs.gpkg")

# --- 5. Şəhərlərarası marşrut dayanacaqları -------------------------------------------------
rs[rs.kind == "intercity"][["route", "code", "name", "lon", "lat"]].to_csv(BUILD / "intercity.csv", index=False)

kmz = set(gpd.read_file(BUILD / "bus_routes.gpkg").route)
rep = {"routes_total": len(routes_raw), "by_kind": rs.drop_duplicates("route").kind.value_counts().to_dict(),
       "city_bus_routes_baku": len(routes), "city_bus_stops_baku": len(st), "rail_stations_baku": len(rail),
       "official_hubs": off[["name", "n_stops", "n_routes"]].to_dict("records"),
       "kmz_routes_not_in_ayna": sorted(kmz - set(routes.route)), "source": "AYNA xəritə API-si, 18.10.2026"}
(BUILD / "ayna_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2))
print(json.dumps({k: v for k, v in rep.items() if k != "kmz_routes_not_in_ayna"}, ensure_ascii=False, indent=1))
print("KMZ-də olub AYNA cari şəbəkəsində olmayan:", len(rep["kmz_routes_not_in_ayna"]))
