"""Pipeline üçün ümumi sabitlər və köməkçi funksiyalar."""
from pathlib import Path
import zipfile
from xml.etree import ElementTree as ET

import geopandas as gpd
from shapely.geometry import LineString, MultiLineString, Point

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "datas"
EXT = RAW / "ext"
BUILD = ROOT / "build"
WEB_DATA = ROOT / "web" / "public" / "data"
ENGINE_DATA = ROOT / "engine" / "data"
OSM_PBF = EXT / "osm_azerbaijan_latest.osm.pbf"

WGS84 = 4326
UTM = 32639  # UTM Zone 39N: Bakı üçün metrik hesablamalar yalnız bu CRS-də aparılır

HUB_WALK_M = 400  # hub əhatəsi: real piyada şəbəkəsi ilə 400 m (~5 dəq)

KML_NS = {"k": "http://www.opengis.net/kml/2.2"}

for d in (BUILD, WEB_DATA, ENGINE_DATA):
    d.mkdir(parents=True, exist_ok=True)


def _coords(text: str):
    pts = []
    for tok in text.split():
        parts = tok.split(",")
        if len(parts) >= 2:
            pts.append((float(parts[0]), float(parts[1])))
    return pts


def read_kmz(path: Path) -> list[dict]:
    """KMZ-dəki bütün Placemark-ları qovluq yolu ilə birlikdə qaytarır."""
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read(next(n for n in z.namelist() if n.endswith(".kml"))))
    out = []

    def walk(node, folder):
        for child in node:
            tag = child.tag.split("}")[1]
            if tag in ("Folder", "Document"):
                name = child.findtext("k:name", default="", namespaces=KML_NS).strip()
                walk(child, f"{folder}/{name}" if name else folder)
            elif tag == "Placemark":
                name = child.findtext("k:name", default="", namespaces=KML_NS).strip()
                points = [Point(_coords(c.text)[0]) for c in child.iterfind(".//k:Point/k:coordinates", KML_NS) if c.text]
                lines = [LineString(cs) for c in child.iterfind(".//k:LineString/k:coordinates", KML_NS)
                         if c.text and len(cs := _coords(c.text)) >= 2]
                if points:
                    out.append({"name": name, "folder": folder, "geometry": points[0]})
                elif lines:
                    geom = lines[0] if len(lines) == 1 else MultiLineString(lines)
                    out.append({"name": name, "folder": folder, "geometry": geom})

    walk(root, "")
    return out


def to_gdf(rows, crs=WGS84) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(rows, geometry="geometry", crs=crs)


def baku_boundary() -> gpd.GeoDataFrame:
    p = BUILD / "baku_boundary.gpkg"
    if p.exists():
        return gpd.read_file(p)
    # OSM-də Bakı sərhədi natamamdır (164 km²; Səbail, Xətai, Qaradağ yoxdur),
    # buna görə geoBoundaries ADM2 "Baku City" (2 113 km²) istifadə olunur.
    gb = gpd.read_file(EXT / "gb_aze_adm2.geojson")
    b = gb[gb.shapeName == "Baku City"].rename(columns={"shapeName": "name"})[["name", "geometry"]].to_crs(WGS84)
    b.to_file(p)
    return b
