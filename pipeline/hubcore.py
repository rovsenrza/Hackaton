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
ROAD_CLEAR = 2.5       # hərəkət hissəsindən minimum məsafə (m)
SIDEWALK_TARGET = 5.0  # hub-un yol kənarından ideal məsafəsi: səki zolağının ortası (m)
MAJOR = ("motorway", "trunk", "primary", "motorway_link", "trunk_link", "primary_link")
# `lanes` yalnız hərəkət zolaqlarını sayır: magistrallarda avtobus/parklanma zolağı və çiyin əlavə olunur
LANE_EXTRA = {"motorway": 3.5, "trunk": 3.5, "primary": 3.5, "secondary": 2.5, "tertiary": 1.5}
MOTOR = ("motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
         "tertiary", "tertiary_link", "residential", "unclassified", "living_street", "service")
# Hərəkət hissəsinin tam eni (m): Bakı prospektlərində `lanes` teqi çox vaxt yoxdur,
# buna görə defolt enlər ehtiyatlı (geniş) götürülür; peyk yoxlaması ilə kalibrlənib.
WIDTH = {"motorway": 28, "motorway_link": 8, "trunk": 24, "trunk_link": 8, "primary": 18, "primary_link": 8,
         "secondary": 14, "secondary_link": 7, "tertiary": 10, "tertiary_link": 7, "residential": 7,
         "unclassified": 7, "living_street": 6, "service": 5}

# CO₂ parametrləri (bax: PLAN.md 4.11)
CO2 = {"car": 0.173, "scooter": {"low": 0.030, "base": 0.060, "high": 0.124}, "mix_scooter": 0.70,
       "km": 4.918839e6 / 2.297405e6, "shift": {"low": 0.10, "base": 0.20, "high": 0.30}}
CASE_EF = {"low": "high", "base": "base", "high": "low"}  # pessimist: az keçid + yüksək scooter izi
DOCK_RANGE = {"S": (6, 10), "M": (12, 20), "L": (24, 40)}
DOCK_TURNOVER = 4  # səfər / yer / gün


def parse_routes(v) -> list[str]:
    """Marşrut siyahısı: GPKG/parquet-də mətn kimi saxlana bilər ("['1', '2']")."""
    import ast
    if v is None:
        return []
    if isinstance(v, str):
        return [str(r) for r in ast.literal_eval(v)] if v.startswith("[") else [v]
    return [str(r) for r in v]


def co2_t(trips: float, case: str) -> float:
    ef_new = CO2["mix_scooter"] * CO2["scooter"][CASE_EF[case]]
    return trips * CO2["shift"][case] * CO2["km"] * (CO2["car"] - ef_new) * 365 / 1000


def build_masks(lines: gpd.GeoDataFrame, mpoly: gpd.GeoDataFrame, buildings: gpd.GeoSeries, crs) -> gpd.GeoSeries:
    """Hub qoyula bilməyən ərazilər: yol hərəkət hissəsi (+1.5 m), dəmir yolu, su/tikinti, binalar."""
    roads = lines[lines.highway.isin(MOTOR)].to_crs(crs)
    lanes = roads.other_tags.fillna("").str.extract(r'"lanes"=>"(\d+)"')[0].astype(float)
    width = np.where(lanes.notna(), lanes * 3.5 + roads.highway.map(LANE_EXTRA).fillna(0), roads.highway.map(WIDTH))
    clear = np.where(roads.highway.isin(MAJOR), ROAD_CLEAR + 1.0, ROAD_CLEAR)
    road_m = roads.geometry.buffer(width / 2 + clear, cap_style="flat")
    rail = lines[lines.railway.isin(["rail", "light_rail", "tram", "narrow_gauge"])].to_crs(crs).buffer(4)
    water = mpoly[(mpoly.natural == "water") | mpoly.other_tags.fillna("").str.contains('"landuse"=>"construction"')].to_crs(crs).geometry
    kind = (["road"] * len(road_m) + ["rail"] * len(rail) + ["water"] * len(water) + ["building"] * len(buildings)
            + ["roadline"] * len(roads))
    widths = [0.0] * (len(road_m) + len(rail) + len(water) + len(buildings)) + list(width)
    geoms = list(road_m) + list(rail) + list(water) + list(buildings.to_crs(crs)) + list(roads.geometry)
    return gpd.GeoDataFrame({"kind": kind, "width": widths}, geometry=geoms, crs=crs)


class HubCore:
    def __init__(self, net: WalkNet, cells: pd.DataFrame, metro: gpd.GeoDataFrame, stops: gpd.GeoDataFrame,
                 stations: gpd.GeoDataFrame, parks: gpd.GeoDataFrame, masks: gpd.GeoDataFrame, K: float):
        self.net, self.cells, self.K = net, cells, K
        self.metro, self.stops, self.stations, self.parks = metro, stops, stations, parks
        net.attach_points(cells[["x", "y"]].values)
        self._snaps = {name: net.snap(np.c_[g.geometry.x, g.geometry.y]) if len(g) else (np.empty(0), np.empty(0))
                       for name, g in (("metro", metro), ("stops", stops), ("stations", stations), ("parks", parks))}
        poly = masks[masks.kind != "roadline"]
        lines = masks[masks.kind == "roadline"]
        self.mask_tree = STRtree(list(poly.geometry))
        self.mask_kind = poly.kind.values
        self.road_tree = STRtree(list(lines.geometry))
        self.road_half = lines.width.values / 2

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

    def edge_distance(self, pts) -> np.ndarray:
        """Nöqtələrdən ən yaxın yolun hərəkət hissəsinin kənarına məsafə (m)."""
        idx, d = self.road_tree.query_nearest(pts, return_distance=True, all_matches=False)
        out = np.full(len(pts), np.inf)
        out[idx[0]] = d - self.road_half[idx[1]]
        return out

    def between_roads(self, p: Point, radius: float = 25.0) -> bool:
        """Nöqtə iki yol xəttinin arasındadırmı (məs. ikiistiqamətli magistralın aralıq zolağı)?"""
        idx = self.road_tree.query(p.buffer(radius))
        idx = idx[self.road_half[idx] >= 5.0]  # yalnız geniş (≥ 10 m) yollar: median problemi magistrallardadır
        vecs = []
        for i in idx:
            q = self.road_tree.geometries[i].interpolate(self.road_tree.geometries[i].project(p))
            v = np.array([q.x - p.x, q.y - p.y])
            n = np.hypot(*v)
            if n > 0.1:
                vecs.append(v / n)
        for i in range(len(vecs)):
            for j in range(i + 1, len(vecs)):
                if vecs[i] @ vecs[j] < -0.5:  # 120°-dən çox: qarşı tərəflərdə
                    return True
        return False

    def place(self, x: float, y: float, r_min: float = 4.0):
        """(x, y) düyününə ≤ 60 m piyada, icazəli ərazidə ən yaxşı nöqtə → (Point, ofset m) və ya (None, None).

        Ən yaxşı = səki zolağının ortası (yol kənarından ~4 m) və düyünə mümkün qədər yaxın.
        """
        from shapely import points as mk_points
        if r_min == 0:
            p0 = Point(x, y)
            if self.is_free(p0) and self.edge_distance([p0])[0] >= ROAD_CLEAR + 0.5 and not self.between_roads(p0):
                return p0, 0.0
        rr, aa = np.meshgrid(np.arange(r_min, 46, 2.0), np.linspace(0, 2 * np.pi, 48, endpoint=False))
        rr, aa = rr.ravel(), aa.ravel()
        if r_min == 0:
            rr, aa = np.r_[0.0, rr], np.r_[0.0, aa]
        P = mk_points(x + rr * np.cos(aa), y + rr * np.sin(aa))
        hit = np.zeros(len(P), bool)
        # 0,5 m marja: koordinat yuvarlaqlaşdırılanda belə maska sərhədini keçməsin
        hit[np.unique(self.mask_tree.query(P, predicate="dwithin", distance=0.5)[0])] = True
        edge = self.edge_distance(P)
        ok = ~hit & (edge >= ROAD_CLEAR + 0.5)
        if not ok.any():
            return None, None
        score = np.abs(np.minimum(edge, 15) - SIDEWALK_TARGET) + 0.15 * rr
        score[~ok] = np.inf
        # piyada cəbhəsi bonusu: 20 m daxilində bina varsa (səki adətən bina ilə yol arasındadır)
        near_b = np.zeros(len(P), bool)
        bi = self.mask_tree.query(P, predicate="dwithin", distance=20)
        near_b[np.unique(bi[0][self.mask_kind[bi[1]] == "building"])] = True
        score = score - 1.0 * near_b
        reach = self.net.reach(x, y, NODE_WALK_MAX)
        for k in np.argsort(score)[:60]:
            if not np.isfinite(score[k]):
                break
            p = P[k]
            if self.between_roads(p):
                continue
            n, d = self.net.snap([p.x, p.y])
            if n[0] in reach and reach[n[0]] + d[0] <= NODE_WALK_MAX:
                return Point(p.x, p.y), round(float(rr[k]), 1)
        return None, None

    # --- qiymətləndirmə -------------------------------------------------------------
    # Tip həddləri və yer sayı paylanması 05_hubs.py-də namizədlər üzrə hesablanır (params.json)
    route_m: int = 3
    gross_q: np.ndarray = np.array([0.0, 1.0])

    def classify(self, ctx: dict) -> str:
        if ctx["bus_station"] or (ctx["metro_pax"] >= 30_000 and ctx["bus_routes"]):
            return "L"
        if ctx["metro_stations"] or len(ctx["bus_routes"]) >= self.route_m:
            return "M"
        return "S"

    def evaluate(self, x: float, y: float, cov: np.ndarray | None = None, new: np.ndarray | None = None) -> dict:
        """(x, y)-dəki hub üçün göstəricilər.

        cov: hub-un 400 m piyada əhatəsindəki xanalar (verilməyibsə hesablanır).
        new: əvvəlki hub-ların əhatə etmədiyi xanalar (artım hesabı üçün; verilməyibsə = cov).
        Səfər və CO₂ yalnız ARTIMDIR: mövcud parkinqlərin xidmət etmədiyi tələbat (D × boşluq).
        """
        c = self.cells
        cov = self.net.covered(x, y, HUB_WALK_M) if cov is None else cov
        new = cov if new is None else new
        ctx = self.context(x, y)
        typ = self.classify(ctx)
        D, gap, pop, dpark = c.D.values, c.gap.values, c["pop"].values, c.d_park.values
        gross = float(self.K * D[cov].sum())                 # hub-un ümumi istifadəsi (yer sayı üçün)
        trips = float(self.K * (D[new] * gap[new]).sum())    # yeni (artım) səfərlər
        q = float(np.searchsorted(self.gross_q, gross) / max(len(self.gross_q), 1))
        lo, hi = DOCK_RANGE[typ]
        unserved = ~(dpark[new] <= 400)
        return {
            "type": typ, "docks": int(round(lo + (hi - lo) * min(q, 1.0))),
            "pop_covered": round(float(pop[cov].sum()), -2),
            "pop_newly_served": round(float(pop[new][unserved].sum()), -2),
            "transit_daily": round(float(c.transit.values[cov].sum()), -2),
            "trips_gross_day": round(gross), "trips_day": round(trips),
            "co2_t_year": {k: round(co2_t(trips, k), 2) for k in ("low", "base", "high")},
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
    stops["routes"] = stops.routes.apply(parse_routes)
    core = HubCore(net, cells, rd("metro.parquet"), stops, rd("stations.parquet"), rd("parks.parquet"),
                   rd("masks.parquet"), params["K"])
    core.route_m = params.get("route_m", 3)
    core.gross_q = np.array(params.get("gross_q", [0.0, 1.0]))
    return core
