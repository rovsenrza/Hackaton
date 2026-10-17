"""Hub məntiqi (pipeline və engine üçün ortaq): kontekst, yerləşdirmə, tip, qiymətləndirmə, CO₂.

Bütün koordinatlar UTM 39N (metr).
"""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point
from shapely.strtree import STRtree

from walk import WalkNet

HUB_WALK_M = 400
NODE_WALK_MAX = 60     # hub nəqliyyat düyünündən ≤ 60 m piyada
ROAD_CLEAR = 1.5       # hərəkət hissəsindən minimum məsafə (m)
MOTOR = ("motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
         "tertiary", "tertiary_link", "residential", "unclassified", "living_street", "service")
WIDTH = {"motorway": 24, "motorway_link": 8, "trunk": 21, "trunk_link": 7, "primary": 14, "primary_link": 7,
         "secondary": 10.5, "secondary_link": 6, "tertiary": 7, "tertiary_link": 6, "residential": 6,
         "unclassified": 6, "living_street": 5, "service": 4}

# CO₂ parametrləri (bax: PLAN.md 4.11)
CO2 = {"car": 0.173, "scooter": {"low": 0.030, "base": 0.060, "high": 0.124}, "mix_scooter": 0.70,
       "km": 4.918839e6 / 2.297405e6, "shift": {"low": 0.10, "base": 0.20, "high": 0.30}}
CASE_EF = {"low": "high", "base": "base", "high": "low"}  # pessimist: az keçid + yüksək scooter izi
DOCK_RANGE = {"S": (6, 10), "M": (12, 20), "L": (24, 40)}
DOCK_TURNOVER = 4  # səfər / yer / gün


def co2_t(trips: float, case: str) -> float:
    ef_new = CO2["mix_scooter"] * CO2["scooter"][CASE_EF[case]]
    return trips * CO2["shift"][case] * CO2["km"] * (CO2["car"] - ef_new) * 365 / 1000


def build_masks(lines: gpd.GeoDataFrame, mpoly: gpd.GeoDataFrame, buildings: gpd.GeoSeries, crs) -> gpd.GeoSeries:
    """Hub qoyula bilməyən ərazilər: yol hərəkət hissəsi (+1.5 m), dəmir yolu, su/tikinti, binalar."""
    roads = lines[lines.highway.isin(MOTOR)].to_crs(crs)
    lanes = roads.other_tags.fillna("").str.extract(r'"lanes"=>"(\d+)"')[0].astype(float)
    width = np.where(lanes.notna(), lanes * 3.5, roads.highway.map(WIDTH))
    road_m = roads.geometry.buffer(width / 2 + ROAD_CLEAR, cap_style="flat")
    rail = lines[lines.railway.isin(["rail", "light_rail", "tram", "narrow_gauge"])].to_crs(crs).buffer(4)
    water = mpoly[(mpoly.natural == "water") | mpoly.other_tags.fillna("").str.contains('"landuse"=>"construction"')].to_crs(crs).geometry
    kind = ["road"] * len(road_m) + ["rail"] * len(rail) + ["water"] * len(water) + ["building"] * len(buildings)
    geoms = list(road_m) + list(rail) + list(water) + list(buildings.to_crs(crs))
    return gpd.GeoDataFrame({"kind": kind}, geometry=geoms, crs=crs)


class HubCore:
    def __init__(self, net: WalkNet, cells: pd.DataFrame, metro: gpd.GeoDataFrame, stops: gpd.GeoDataFrame,
                 stations: gpd.GeoDataFrame, parks: gpd.GeoDataFrame, masks: gpd.GeoDataFrame, K: float):
        self.net, self.cells, self.K = net, cells, K
        self.metro, self.stops, self.stations, self.parks = metro, stops, stations, parks
        net.attach_points(cells[["x", "y"]].values)
        self._snaps = {name: net.snap(np.c_[g.geometry.x, g.geometry.y]) if len(g) else (np.empty(0), np.empty(0))
                       for name, g in (("metro", metro), ("stops", stops), ("stations", stations), ("parks", parks))}
        self.mask_tree = STRtree(list(masks.geometry))
        self.mask_kind = masks.kind.values

    # --- kontekst ---------------------------------------------------------------
    def _within(self, name, reach, limit):
        n, d = self._snaps[name]
        return np.array([(k in reach) and (reach[k] + dd <= limit) for k, dd in zip(n, d)], dtype=bool)

    def context(self, x: float, y: float) -> dict:
        reach = self.net.reach(x, y, HUB_WALK_M)
        ms, ss = self._within("metro", reach, HUB_WALK_M), self._within("stops", reach, HUB_WALK_M)
        bs, ps = self._within("stations", reach, HUB_WALK_M), self._within("parks", reach, HUB_WALK_M)
        routes = sorted({r for rr in self.stops.routes[ss] for r in rr}) if ss.any() else []
        mk = self.metro[ms]
        return {"metro_stations": sorted(set(mk.station_az)),
                "metro_pax": float(mk.groupby("key").station_pax.first().sum()) if len(mk) else 0.0,
                "bus_routes": routes, "bus_station": bool(bs.any()), "parkings_400": int(ps.sum())}

    def nearest_parking(self, x: float, y: float, limit: float = 150):
        reach = self.net.reach(x, y, limit)
        n, d = self._snaps["parks"]
        best = None
        for k, (nn, dd) in enumerate(zip(n, d)):
            if nn in reach and reach[nn] + dd <= limit and (best is None or reach[nn] + dd < best[1]):
                best = (k, reach[nn] + dd)
        return best

    # --- yerləşdirmə --------------------------------------------------------------
    def blocked_by(self, p: Point) -> list[str]:
        return sorted({self.mask_kind[i] for i in self.mask_tree.query(p, predicate="intersects")})

    def is_free(self, p: Point) -> bool:
        return len(self.mask_tree.query(p, predicate="intersects")) == 0

    def place(self, x: float, y: float, r_min: float = 8.0):
        """(x, y)-yə ≤ 60 m piyada, icazəli ərazidə ən yaxın nöqtə → (Point, ofset m) və ya (None, None)."""
        reach = self.net.reach(x, y, NODE_WALK_MAX)
        if r_min == 0 and self.is_free(Point(x, y)):
            return Point(x, y), 0.0
        for r in np.arange(max(r_min, 3.0), 46, 3):
            for a in np.linspace(0, 2 * np.pi, 36, endpoint=False):
                p = Point(x + r * np.cos(a), y + r * np.sin(a))
                if not self.is_free(p):
                    continue
                n, d = self.net.snap([p.x, p.y])
                if n[0] in reach and reach[n[0]] + d[0] <= NODE_WALK_MAX:
                    return p, round(float(r), 1)
        return None, None

    # --- qiymətləndirmə -------------------------------------------------------------
    def classify(self, ctx: dict) -> str:
        if ctx["bus_station"] or (ctx["metro_pax"] >= 30_000 and ctx["bus_routes"]):
            return "L"
        if ctx["metro_stations"] or len(ctx["bus_routes"]) >= 3:
            return "M"
        return "S"

    def evaluate(self, x: float, y: float, gap: np.ndarray | None = None, cov: np.ndarray | None = None) -> dict:
        """(x, y)-dəki hub üçün göstəricilər. `cov` verilməyibsə 400 m real piyada ilə hesablanır."""
        c = self.cells
        cov = self.net.covered(x, y, HUB_WALK_M) if cov is None else cov
        gap = c.gap.values if gap is None else gap
        ctx = self.context(x, y)
        typ = self.classify(ctx)
        trips = float(self.K * c.D.values[cov].sum())
        lo, hi = DOCK_RANGE[typ]
        return {
            "type": typ, "docks": int(np.clip(np.ceil(trips / DOCK_TURNOVER), lo, hi)),
            "pop_covered": round(float(c["pop"].values[cov].sum()), -2),
            "pop_unserved_covered": round(float((c["pop"].values[cov] * gap[cov]).sum()), -2),
            "transit_daily": round(float(c.transit.values[cov].sum()), -2),
            "trips_day": round(trips),
            "co2_t_year": {k: round(co2_t(trips, k), 1) for k in ("low", "base", "high")},
            **ctx,
        }


def load_core(data_dir: Path) -> HubCore:
    """Engine üçün: engine/data qovluğundan HubCore yaradır."""
    import geopandas as gpd
    params = json.loads((data_dir / "params.json").read_text())
    net = WalkNet(data_dir / "walk_graph.pkl")
    cells = pd.read_parquet(data_dir / "cells.parquet")
    rd = lambda f: gpd.read_parquet(data_dir / f)
    stops = rd("stops.parquet")
    stops["routes"] = stops.routes.apply(lambda v: list(v) if v is not None else [])
    return HubCore(net, cells, rd("metro.parquet"), stops, rd("stations.parquet"), rd("parks.parquet"),
                   rd("masks.parquet"), params["K"])
