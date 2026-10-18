"""Data keyfiyyət mərkəzi: çirkli nəqliyyat faylı → avtomatik düzəlişlər + insan yoxlaması + təmiz fayl.

Qaydalar AYAN pipeline-ında real açıq datada tapılmış problemlərdən yaranıb:
  koordinat formatı (×10⁶), lat/lon yerdəyişməsi, Bakı sərhədindən kənar nöqtələr, 5 m dublikatlar,
  Excel-in mətnləri tarixə çevirməsi ("28 May" → "28.05.2026"), kiril "ә" (U+04D9) ↔ "ə" (U+0259),
  ingilis transliterasiyası, boşluqlar, cari AYNA şəbəkəsində olmayan marşrutlar, koordinatsız sətirlər.
"""
from __future__ import annotations

import io
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry import LineString, Point, mapping, shape

DATA = Path(__file__).resolve().parents[1] / "data"
TO_UTM = Transformer.from_crs(4326, 32639, always_xy=True)
_BAKU = None
_REF = None

# Azərbaycan hərfləri ilə qarışdırılan kiril/digər simvollar
CONFUSABLE = {"ә": "ə", "Ә": "Ə", "ı̇": "i", " ": " "}
# ingilis transliterasiyası → azərbaycanca (metro, qatar stansiyaları və tez-tez rast gəlinənlər)
TRANSLIT = {
    "Koroghlu": "Koroğlu", "Koroglu": "Koroğlu", "Ganjlik": "Gənclik", "Nariman Narimanov": "Nəriman Nərimanov",
    "Khatai": "Xətai", "Shah Ismail Khatai": "Şah İsmayıl Xətai", "Icherisheher": "İçərişəhər", "Inshaatchilar": "İnşaatçılar",
    "Elmlar Akademiyasi": "Elmlər Akademiyası", "Jafar Jabbarli": "Cəfər Cabbarlı", "Khalglar Dostlughu": "Xalqlar Dostluğu",
    "Hazi Aslanov": "Həzi Aslanov", "Gara Garayev": "Qara Qarayev", "Memar Ajami": "Memar Əcəmi", "Darnagul": "Dərnəgül",
    "Akhmedli": "Əhmədli", "Avtovaghzal": "Avtovağzal", "Azadlig Prospekti": "Azadlıq prospekti", "Neftchilar": "Neftçilər",
    "Nasimi": "Nəsimi", "Khocasen": "Xocəsən", "Khojasan": "Xocəsən", "Bakikhanov": "Bakıxanov", "Bilajari": "Biləcəri",
    "Keshle": "Keşlə", "Khirdalan": "Xırdalan", "Mammadli": "Məmmədli", "Novkhani": "Novxanı", "Pirshaghi": "Pirşağı",
    "Sabunchu": "Sabunçu", "Baku": "Bakı",
}
MONTHS = {1: "Yanvar", 2: "Fevral", 3: "Mart", 4: "Aprel", 5: "May", 6: "İyun", 7: "İyul", 8: "Avqust",
          9: "Sentyabr", 10: "Oktyabr", 11: "Noyabr", 12: "Dekabr"}
EXCEL_DATE = re.compile(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})( 00:00(:00)?)?$")
LAT_NAMES = ("lat", "latitude", "enlik", "coğrafi enliyi", "y")
LON_NAMES = ("lon", "lng", "long", "longitude", "uzunluq", "coğrafi uzunluğu", "x")
NAME_NAMES = ("name", "ad", "adı", "stansiya", "station", "label", "title")
ROUTE_NAMES = ("route", "marşrut", "marsrut", "route_name", "shortname", "marşrutun adı")


def baku():
    global _BAKU
    if _BAKU is None:
        _BAKU = gpd.read_file(DATA / "baku_boundary.gpkg").to_crs(4326).union_all()
    return _BAKU


def ref():
    global _REF
    if _REF is None:
        _REF = json.loads((DATA / "quality_ref.json").read_text())
    return _REF


# --- oxuma ------------------------------------------------------------------------
def _read_kmz(raw: bytes) -> pd.DataFrame:
    z = zipfile.ZipFile(io.BytesIO(raw))
    root = ET.fromstring(z.read(next(n for n in z.namelist() if n.endswith(".kml"))))
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    rows = []
    for pm in root.iter("{http://www.opengis.net/kml/2.2}Placemark"):
        name = (pm.findtext("k:name", default="", namespaces=ns) or "").strip()
        pt = pm.find(".//k:Point/k:coordinates", ns)
        if pt is not None and pt.text:
            lon, lat = map(float, pt.text.strip().split(",")[:2])
            rows.append({"name": name, "lon": lon, "lat": lat})
        else:
            ls = pm.find(".//k:LineString/k:coordinates", ns)
            if ls is not None and ls.text:
                cs = [tuple(map(float, t.split(",")[:2])) for t in ls.text.split()]
                rows.append({"name": name, "geometry": LineString(cs) if len(cs) > 1 else None})
    return pd.DataFrame(rows)


def read_any(filename: str, raw: bytes) -> pd.DataFrame:
    f = filename.lower()
    if f.endswith(".kmz"):
        return _read_kmz(raw)
    if f.endswith((".geojson", ".json")):
        d = json.loads(raw.decode("utf-8-sig"))
        if isinstance(d, dict) and d.get("type") == "FeatureCollection":
            rows = []
            for ft in d["features"]:
                pr = dict(ft.get("properties") or {})
                g = ft.get("geometry")
                if g and g["type"] == "Point":
                    pr["lon"], pr["lat"] = g["coordinates"][:2]
                elif g:
                    pr["geometry"] = shape(g)
                rows.append(pr)
            return pd.DataFrame(rows)
        if isinstance(d, dict) and isinstance(d.get("data"), list):  # AYNA API cavabı
            d = d["data"]
        return pd.json_normalize(d)
    text = raw.decode("utf-8-sig", errors="replace")
    sep = ";" if text.split("\n", 1)[0].count(";") > text.split("\n", 1)[0].count(",") else ","
    return pd.read_csv(io.StringIO(text), sep=sep, dtype=str, keep_default_na=False)


def _col(df: pd.DataFrame, names) -> str | None:
    low = {c.lower().strip(): c for c in df.columns}
    for n in names:
        if n in low:
            return low[n]
    for c in df.columns:
        cl = c.lower()
        if any(n in cl for n in names if len(n) > 2):
            return c
    return None


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(",", ".", regex=False).str.strip(), errors="coerce").astype(float)


# --- qaydalar -----------------------------------------------------------------------
def check(filename: str, raw: bytes) -> dict:
    df = read_any(filename, raw).reset_index(drop=True)
    n0 = len(df)
    issues: list[dict] = []

    def add(row, rule, before, after, action):
        issues.append({"row": int(row) + 1, "rule": rule, "before": str(before)[:80], "after": str(after)[:80], "action": action})

    # 1) mətn sahələri: kiril qarışıq hərflər, boşluqlar, Excel tarixləri, transliterasiya
    text_cols = [c for c in df.columns if c not in ("geometry",) and (df[c].dtype == object or pd.api.types.is_string_dtype(df[c]))]
    name_col = _col(df, NAME_NAMES)
    for c in text_cols:
        vals = df[c].astype(str)
        date_share = vals.str.match(EXCEL_DATE).mean() if len(vals) else 0
        for i, v in vals.items():
            if not isinstance(v, str) or v in ("", "nan", "None"):
                continue
            nv = v
            for a, b in CONFUSABLE.items():
                nv = nv.replace(a, b)
            if nv != v:
                add(i, "Kiril/qarışıq simvol", v, nv, "avto")
            sv = re.sub(r"\s+", " ", nv).strip()
            if sv != nv:
                nv = sv
            m = EXCEL_DATE.match(nv)
            if m and date_share < 0.5:  # sütunun çoxu tarix deyilsə, bu Excel təhrifidir
                day, mon = int(m.group(1)), int(m.group(2))
                fixed = f"{day} {MONTHS.get(mon, mon)}"
                add(i, "Excel mətni tarixə çevirib", v, fixed, "avto")
                nv = fixed
            if c == name_col and nv in TRANSLIT:
                add(i, "İngilis transliterasiyası", nv, TRANSLIT[nv], "avto")
                nv = TRANSLIT[nv]
            df.at[i, c] = nv

    # 2) koordinatlar
    lat_c, lon_c = _col(df, LAT_NAMES), _col(df, LON_NAMES)
    has_pts = lat_c is not None and lon_c is not None
    if has_pts:
        lat, lon = _num(df[lat_c]), _num(df[lon_c])
        # ×10^k formatı (məs. 40421499 → 40.421499)
        for nm, ser, lo, hi in (("enlik", lat, 35, 45), ("uzunluq", lon, 44, 52)):
            for i, v in ser.items():
                if pd.notna(v) and abs(v) > 180:
                    k = 0
                    w = v
                    while abs(w) > 180 and k < 9:
                        w /= 10
                        k += 1
                    while not (lo <= abs(w) <= hi) and abs(w) > 1 and k < 12:
                        w /= 10
                        k += 1
                    add(i, f"Koordinat formatı ({nm} ×10^{k})", v, round(w, 6), "avto")
                    ser.at[i] = w
        # lat/lon yerdəyişməsi (Bakı: lat ~40, lon ~50)
        swap = lat.between(44, 52) & lon.between(35, 45)
        for i in np.flatnonzero(swap.values):
            add(i, "Enlik və uzunluq yerdəyişib", f"{lat.iat[i]}, {lon.iat[i]}", f"{lon.iat[i]}, {lat.iat[i]}", "avto")
        lat2 = np.where(swap, lon, lat)
        lon2 = np.where(swap, lat, lon)
        lat, lon = pd.Series(lat2), pd.Series(lon2)
        line_geom = df["geometry"] if "geometry" in df else pd.Series([None] * len(df))
        miss = (lat.isna() | lon.isna()).values & line_geom.isna().values
        for i in np.flatnonzero(miss):
            add(i, "Koordinat yoxdur", "", "", "yoxlama")
        df["_lat"], df["_lon"] = lat, lon
        geom = [Point(x, y) if pd.notna(x) and pd.notna(y) else (g if g is not None and not (isinstance(g, float)) else None)
                for x, y, g in zip(lon, lat, line_geom)]
    else:
        geom = list(df["geometry"]) if "geometry" in df else [None] * len(df)
    gdf = gpd.GeoDataFrame(df.drop(columns=[c for c in ("geometry",) if c in df]), geometry=geom, crs=4326)

    # 3) Bakı sərhədindən kənar
    b = baku()
    outside = gdf.geometry.notna() & ~gdf.geometry.intersects(b)
    for i in np.flatnonzero(outside.values):
        g = gdf.geometry.iat[i]
        add(i, "Bakı sərhədindən kənar", f"{g.centroid.y:.5f}, {g.centroid.x:.5f}", "", "yoxlama")

    # 4) 5 m dublikatlar (nöqtələr)
    drop = set()
    pts = gdf[gdf.geometry.notna() & (gdf.geom_type == "Point")]
    if len(pts) > 1:
        x, y = TO_UTM.transform(pts.geometry.x.values, pts.geometry.y.values)
        from scipy.spatial import cKDTree
        t = cKDTree(np.c_[x, y])
        for a, bb in sorted(t.query_pairs(5.0)):
            ia, ib = pts.index[a], pts.index[bb]
            if ia in drop or ib in drop:
                continue
            same = name_col is None or str(gdf.at[ia, name_col])[:3] == str(gdf.at[ib, name_col])[:3]
            if same:
                drop.add(ib)
                add(ib, "Dublikat (≤ 5 m)", f"sətir {ib + 1}", f"sətir {ia + 1} saxlanıldı", "avto")

    # 5) marşrut: AYNA-nın cari şəbəkəsində yoxdur
    route_c = _col(df, ROUTE_NAMES)
    if route_c:
        cur = set(ref()["ayna_routes"])
        norm = gdf[route_c].astype(str).str.replace(r"\s+", "", regex=True).str.upper()
        seen = set()
        for i, r in norm.items():
            if r and r not in cur and r not in seen:
                seen.add(r)
                add(i, "Marşrut AYNA-nın cari şəbəkəsində yoxdur", r, "", "yoxlama")

    clean = gdf.drop(index=list(drop))
    review_rows = {x["row"] - 1 for x in issues if x["action"] == "yoxlama"}
    clean["_status"] = ["yoxlama" if i in review_rows else "təmiz" for i in clean.index]
    keep_cols = [c for c in clean.columns if c not in ("_lat", "_lon")]
    feats = []
    for _, r in clean[keep_cols].iterrows():
        if r.geometry is None or not hasattr(r.geometry, "__geo_interface__"):
            continue
        props = {k: (None if (isinstance(v, float) and np.isnan(v)) else v) for k, v in r.drop("geometry").items()}
        feats.append({"type": "Feature", "geometry": mapping(r.geometry), "properties": props})

    by_rule: dict[str, dict] = {}
    for it in issues:
        e = by_rule.setdefault(it["rule"], {"rule": it["rule"], "count": 0, "action": it["action"]})
        e["count"] += 1
    return {
        "file": filename, "rows_in": n0, "rows_out": len(clean), "auto_fixed": sum(x["action"] == "avto" for x in issues),
        "needs_review": len(review_rows), "removed_duplicates": len(drop),
        "columns": {"lat": lat_c, "lon": lon_c, "name": name_col, "route": route_c},
        "rules": sorted(by_rule.values(), key=lambda e: -e["count"]),
        "issues": issues[:400], "clean": {"type": "FeatureCollection", "features": feats},
    }
