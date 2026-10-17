"""Mərhələ 1: xam datanı təmiz, yoxlanmış qatlara çevirir.

Çıxış: build/*.gpkg (WGS84) + build/convert_report.json
"""
import json
import re

import geopandas as gpd
import pandas as pd

from common import BUILD, RAW, UTM, WGS84, baku_boundary, read_kmz, to_gdf

report: dict = {}
baku = baku_boundary()
baku_utm = baku.to_crs(UTM)
report["baku_area_km2"] = round(float(baku_utm.area.sum()) / 1e6, 1)
in_baku = lambda g: g[g.within(baku.geometry.union_all())]


# --- 1. Avtovağzallar ------------------------------------------------------
av = gpd.read_file(RAW / "avtovagzal_avtostansiyalar.geojson")[["name", "geometry"]].to_crs(WGS84)
av_b = in_baku(av).reset_index(drop=True)
av_b["id"] = [f"AV{i+1}" for i in range(len(av_b))]
av_b.to_file(BUILD / "bus_stations.gpkg")
report["bus_stations"] = {"total": len(av), "baku": len(av_b), "names": av_b.name.tolist()}


# --- 2. Avtobus marşrutları + BakuBus sərnişin datası ----------------------
bus = to_gdf(read_kmz(RAW / "avtobus_trayektoriyalari.kmz"))
bus["route"] = bus["name"].str.replace(r"\s+", "", regex=True).str.upper()
bus = bus.dissolve(by="route", as_index=False)[["route", "geometry"]]

bb = pd.read_csv(RAW / "bakubus_gundelik_sernisin_2026.csv", encoding="utf-8-sig")
bb.columns = ["date", "route", "trips"]
bb["route"] = bb.route.astype(str).str.replace(r"\s+", "", regex=True).str.upper()
bb_avg = bb.groupby("route").trips.mean()

bus["pax_measured"] = bus.route.map(bb_avg)  # 🟢 yalnız BakuBus marşrutları
bus["length_km"] = bus.to_crs(UTM).length / 1000
bus.to_file(BUILD / "bus_routes.gpkg")
report["bus_routes"] = {
    "routes": len(bus),
    "with_ridership": int(bus.pax_measured.notna().sum()),
    "bakubus_not_in_kmz": sorted(set(bb_avg.index) - set(bus.route)),
    "bakubus_daily_total": round(float(bb_avg.sum())),
}


# --- 3. Velo/scooter parkinqləri (iki dövr: iyul və sentyabr) --------------
pk = to_gdf(read_kmz(RAW / "velosiped_parkinqleri.kmz"))
pk = pk[pk.geom_type == "Point"].copy()


def period(folder: str) -> str:
    if "Sightseeing" in folder:
        return "tour"
    if "yeni" in folder:
        return "sep"   # 11 sentyabr: yeni məntəqələr
    return "jul"       # 12 iyul: ümumi siyahı


pk["period"] = pk.folder.map(period)
pk = pk[pk.period != "tour"].to_crs(UTM)

# Dublikatlar: 5 m daxilində olan nöqtələr bir məntəqədir; köhnə (iyul) üstünlük alır
pk = pk.sort_values("period", key=lambda s: s.map({"jul": 0, "sep": 1})).reset_index(drop=True)
keep, taken = [], set()
sidx = pk.sindex
for i, geom in enumerate(pk.geometry):
    if i in taken:
        continue
    keep.append(i)
    for j in sidx.query(geom.buffer(5)):
        if j != i:
            taken.add(int(j))
raw_counts = pk.period.value_counts().to_dict()
pk = pk.loc[keep].to_crs(WGS84)
pk = in_baku(pk).reset_index(drop=True)
pk["id"] = [f"P{i+1}" for i in range(len(pk))]
pk[["id", "name", "period", "geometry"]].to_file(BUILD / "parkings.gpkg")
report["parkings"] = {
    "raw": {k: int(v) for k, v in raw_counts.items()},
    "after_dedup_5m_in_baku": pk.period.value_counts().to_dict(),
    "total": len(pk),
}


# --- 4. Velo-zolaqlar (VELO YOL 2026 / Mövcud zolaqlar) --------------------
ln = to_gdf(read_kmz(RAW / "velosiped_zolaqlari.kmz"))
ln = ln[ln.geom_type.isin(["LineString", "MultiLineString"])].reset_index(drop=True)
ln["id"] = [f"L{i+1}" for i in range(len(ln))]
ln["length_km"] = ln.to_crs(UTM).length / 1000
ln[["id", "name", "length_km", "geometry"]].to_file(BUILD / "bike_lanes.gpkg")
report["bike_lanes"] = {"segments": len(ln), "total_km": round(float(ln.length_km.sum()), 1)}


# --- 5. Metro çıxışları + stansiya sərnişinləri ----------------------------
ex = pd.read_csv(RAW / "metro_cixislari.csv", sep=";")
ex.columns = ["station_az", "station_en", "lat", "lon", "address", "exit"]
ex["lat"], ex["lon"] = ex.lat / 1e6, ex.lon / 1e6  # tam ədəd formatı → dərəcə

# Çıxış faylının ingiliscə adı → sərnişin faylının adı (2026)
EN_FIX = {"28 May": "28-May", "8 Novabr": "8 Noyabr", "Azadliq prospekti": "Azadlig Prospekti",
          "Elmler Akademiyasi": "Elmlar Akademiyasi", "Insahatchilar": "Inshaatchilar",
          "Jafar Jabbarly": "Jafar Jabbarli", "Khojasan": "Khocasen", "Koroglu": "Koroghlu",
          "Shah Ismail Khatai": "Khatai"}
AZ_FIX = {"28.05.2026 00:00:00": "28 May"}  # Excel tarixə çevirib
ex["key"] = ex.station_en.str.strip().replace(EN_FIX)
ex["station_az"] = ex.station_az.str.strip().replace(AZ_FIX)
ex["exit"] = ex.exit.str.strip()

mp = pd.read_csv(RAW / "metro_sernisin_2026.csv", encoding="utf-8-sig")
mp.columns = ["date", "key", "trips"]
st_avg = mp.groupby("key").trips.mean()
unmatched = sorted(set(ex.key) - set(st_avg.index))
assert not unmatched, f"Metro adları uyğun gəlmir: {unmatched}"

ex["station_pax"] = ex.key.map(st_avg)
ex["exits_n"] = ex.groupby("key").key.transform("size")
ex["exit_pax"] = ex.station_pax / ex.exits_n  # stansiya sərnişini çıxışlara bərabər bölünür
mx = gpd.GeoDataFrame(ex, geometry=gpd.points_from_xy(ex.lon, ex.lat), crs=WGS84)
mx["id"] = [f"M{i+1}" for i in range(len(mx))]
mx[["id", "station_az", "key", "exit", "address", "station_pax", "exit_pax", "geometry"]].to_file(BUILD / "metro_exits.gpkg")

m25 = pd.read_csv(RAW / "metro_sernisin_2025.csv", sep=";")
m25.columns = ["date", "st", "trips"]
report["metro"] = {
    "exits": len(mx), "stations": int(mx.key.nunique()),
    "daily_total_2026": round(float(st_avg.sum())),
    "daily_total_2025": round(float(m25.groupby("st").trips.mean().sum())),
    "top5_2026": st_avg.sort_values(ascending=False).head(5).round().astype(int).to_dict(),
}

(BUILD / "convert_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
