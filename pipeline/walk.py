"""Real piyada şəbəkəsi üzrə məsafə hesabları (pipeline və engine üçün ortaq).

Bütün koordinatlar UTM 39N (metr). Ümumi piyada məsafəsi:
    başlanğıcdan şəbəkəyə məsafə + şəbəkə üzrə məsafə + şəbəkədən hədəfə məsafə
"""
from __future__ import annotations

import pickle
from pathlib import Path

import networkx as nx
import numpy as np
from scipy.spatial import cKDTree


class WalkNet:
    def __init__(self, graph_path: Path):
        with open(graph_path, "rb") as f:
            self.G: nx.Graph = pickle.load(f)
        self.ids = np.array(list(self.G.nodes))
        self.xy = np.array([[self.G.nodes[n]["x"], self.G.nodes[n]["y"]] for n in self.ids])
        self.tree = cKDTree(self.xy)
        self._pts = None  # bağlanmış tələbat nöqtələri

    def snap(self, xy) -> tuple[np.ndarray, np.ndarray]:
        """Nöqtələri ən yaxın şəbəkə düyününə bağlayır → (düyün id, məsafə m)."""
        d, i = self.tree.query(np.atleast_2d(xy))
        return self.ids[i], d

    def reach(self, x: float, y: float, limit: float) -> dict:
        """(x, y)-dən `limit` m piyada daxilində çatılan düyünlər → {düyün: ümumi məsafə}."""
        node, d0 = self.snap([x, y])
        node, d0 = node[0], float(d0[0])
        if d0 >= limit:
            return {}
        dist = nx.single_source_dijkstra_path_length(self.G, node, cutoff=limit - d0, weight="length")
        return {n: d + d0 for n, d in dist.items()}

    # --- tələbat nöqtələri ------------------------------------------------
    def attach_points(self, xy: np.ndarray):
        """Tələbat nöqtələrini (məs. H3 xana mərkəzləri) şəbəkəyə bağlayır."""
        nodes, d = self.snap(xy)
        order = np.argsort(nodes, kind="stable")
        self._pts = {"node": nodes, "d": d, "order": order, "sorted_nodes": nodes[order]}

    def covered(self, x: float, y: float, limit: float) -> np.ndarray:
        """`limit` m piyada daxilində olan tələbat nöqtələrinin indeksləri."""
        r = self.reach(x, y, limit)
        if not r:
            return np.empty(0, dtype=int)
        P = self._pts
        ns = np.fromiter(r.keys(), dtype=self.ids.dtype)
        ds = np.fromiter(r.values(), dtype=float)
        lo = np.searchsorted(P["sorted_nodes"], ns, "left")
        hi = np.searchsorted(P["sorted_nodes"], ns, "right")
        out = []
        for a, b, dn in zip(lo, hi, ds):
            if b > a:
                idx = P["order"][a:b]
                out.append(idx[dn + P["d"][idx] <= limit])
        return np.concatenate(out) if out else np.empty(0, dtype=int)

    def isochrone_polygon(self, x: float, y: float, limit: float, edge_buffer: float = 20.0):
        """Çatılan küçə seqmentləri boyunca izoxron poliqonu (UTM)."""
        from shapely.geometry import MultiLineString
        r = self.reach(x, y, limit)
        segs = []
        for u in r:
            for v in self.G.neighbors(u):
                if v in r and u < v:
                    a, b = self.G.nodes[u], self.G.nodes[v]
                    segs.append(((a["x"], a["y"]), (b["x"], b["y"])))
        if not segs:
            from shapely.geometry import Point
            return Point(x, y).buffer(edge_buffer)
        return MultiLineString(segs).buffer(edge_buffer, cap_style="round").simplify(2)
