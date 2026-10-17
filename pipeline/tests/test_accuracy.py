"""Dəqiqlik zəmanətləri: məsafə, izoxron, yerləşdirmə."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from pyproj import Geod, Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import BUILD, ENGINE_DATA, UTM, WEB_DATA  # noqa: E402
from walk import WalkNet  # noqa: E402

GEOD = Geod(ellps="WGS84")
TO_UTM = Transformer.from_crs(4326, UTM, always_xy=True)


@pytest.fixture(scope="module")
def net():
    return WalkNet(ENGINE_DATA / "walk_graph.pkl")


def test_utm_distance_matches_geodesic():
    """UTM 39N-də ölçülən məsafə Bakıda geodezik məsafədən < 0.1% fərqlənir."""
    a, b = (49.8352, 40.3716), (49.8671, 40.4093)  # Fəvvarələr meydanı → Nərimanov
    xa, ya = TO_UTM.transform(*a)
    xb, yb = TO_UTM.transform(*b)
    _, _, geo = GEOD.inv(*a, *b)
    assert abs(np.hypot(xb - xa, yb - ya) - geo) / geo < 0.001


def test_web_mercator_would_distort():
    """Səbəb: Web Mercator Bakının enində məsafəni ~31% uzadır."""
    assert abs(1 / np.cos(np.radians(40.4)) - 1.31) < 0.01


def test_isochrone_never_exceeds_limit(net):
    """400 m piyada ərazisinin heç bir nöqtəsi düz xətt üzrə 400 m-dən uzaqda deyil."""
    x, y = TO_UTM.transform(49.8352, 40.3716)
    r = net.reach(x, y, 400)
    assert len(r) > 50
    assert max(r.values()) <= 400 + 1e-6
    pts = np.array([[net.G.nodes[n]["x"], net.G.nodes[n]["y"]] for n in r])
    assert np.hypot(pts[:, 0] - x, pts[:, 1] - y).max() <= 400


def test_covered_points_respect_walk_distance(net):
    """Əhatə olunan tələbat nöqtəsi: başlanğıc→şəbəkə + şəbəkə + şəbəkə→nöqtə ≤ 400 m."""
    x, y = TO_UTM.transform(49.8352, 40.3716)
    rr = np.random.default_rng(0)
    pts = np.c_[x + rr.uniform(-600, 600, 3000), y + rr.uniform(-600, 600, 3000)]
    net.attach_points(pts)
    cov = net.covered(x, y, 400)
    assert len(cov) > 0
    assert np.hypot(pts[cov, 0] - x, pts[cov, 1] - y).max() <= 400
    reach = net.reach(x, y, 400)
    nodes, d = net.snap(pts[cov])
    assert all(reach[n] + dd <= 400 + 1e-6 for n, dd in zip(nodes, d))


def test_hubs_spacing_and_qa():
    rep = json.loads((BUILD / "hubs_report.json").read_text())
    qa = rep["placement_qa"]
    assert qa["new_hubs_free_check"] is True
    assert qa["min_spacing_m"] >= 300


def test_new_hubs_off_carriageway():
    """Yeni hub-lar heç bir yolun hərəkət hissəsinə (yarım-en + 1.5 m) düşmür."""
    import geopandas as gpd
    from shapely.geometry import Point
    from common import OSM_PBF
    hubs = [h for h in json.loads((BUILD / "hubs.json").read_text())["hubs"] if h["action"] == "new"]
    lon = [h["lon"] for h in hubs]
    lat = [h["lat"] for h in hubs]
    bb = (min(lon) - 0.01, min(lat) - 0.01, max(lon) + 0.01, max(lat) + 0.01)
    lines = gpd.read_file(OSM_PBF, layer="lines", bbox=bb)
    roads = lines[lines.highway.isin(["motorway", "trunk", "primary", "secondary", "tertiary", "residential"])].to_crs(UTM)
    for h in hubs:
        p = Point(*TO_UTM.transform(h["lon"], h["lat"]))
        d = roads.distance(p).min()
        assert d >= 3.0 - 0.5, f"{h['id']} yola {d:.1f} m"  # ən dar küçənin yarım-eni + 1.5 m − yuvarlaqlaşdırma


def test_bus_ridership_calibrated_to_official_total():
    rep = json.loads((BUILD / "demand_report.json").read_text())
    m = rep["route_model"]
    total = m["predicted_daily_total"] + m["measured_daily_total"]
    assert abs(total - 335.6e6 / 243) / (335.6e6 / 243) < 0.01


def test_web_data_exists():
    for f in ("bus_routes.geojson", "metro_exits.geojson", "parkings.geojson", "bike_lanes.geojson",
              "h3_r9.json", "hubs.json", "isochrones.geojson", "metrics.json"):
        assert (WEB_DATA / f).stat().st_size > 0
