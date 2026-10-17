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

    def reach(self, x: float, y: float, limit: float, k: int = 3) -> dict:
        """(x, y)-dən `limit` m piyada daxilində çatılan düyünlər → {düyün: ümumi məsafə}.

        Başlanğıc ən yaxın `k` düyünə (40 m daxilində) bağlanır: nöqtə bir neçə metr sürüşəndə
        nəticə sıçrayışla dəyişmir (ən yaxın tək düyünə bağlanma qeyri-sabitdir).
        """
        d0, i0 = self.tree.query([x, y], k=k)
        d0, i0 = np.atleast_1d(d0), np.atleast_1d(i0)
        keep = (d0 <= max(40.0, d0.min())) & (d0 < limit)
        if not keep.any():
            return {}
        SRC = "__src__"
        G = self.G
        G.add_node(SRC)
        try:
            for dd, ii in zip(d0[keep], i0[keep]):
                G.add_edge(SRC, self.ids[ii], length=float(dd))
            dist = nx.single_source_dijkstra_path_length(G, SRC, cutoff=limit, weight="length")
        finally:
            G.remove_node(SRC)
        dist.pop(SRC, None)
        return dist

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
