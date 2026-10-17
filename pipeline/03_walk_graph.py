"""Mərhələ 2a: Bakı piyada qrafı (lokal OSM, Overpass olmadan).

1. pyosmium: analiz bbox-u daxilində piyada üçün yararlı yolları .osm XML-ə çıxarır
2. osmnx graph_from_xml: topologiya, sadələşdirmə, ən böyük komponent
3. UTM 39N-ə proyeksiya; engine üçün pickle

Piyada filtri osmnx-in "walk" filtrinə uyğundur.
"""
import json
import pickle
import time

import networkx as nx
import osmium
import osmnx as ox

from common import BUILD, ENGINE_DATA, OSM_PBF, UTM

BBOX = (49.38, 39.93, 50.35, 40.60)  # analiz zonası (nəqliyyat şəbəkəsi + 1 km, Bakı daxilində)
EXCLUDE_HW = {"abandoned", "bus_guideway", "construction", "cycleway", "motor", "no", "planned",
              "platform", "proposed", "raceway", "razed", "motorway", "motorway_link"}
OSM_XML = BUILD / "baku_walk.osm"

t0 = time.time()


def walkable(tags) -> bool:
    hw = tags.get("highway")
    if hw is None or hw in EXCLUDE_HW:
        return False
    if tags.get("area") == "yes" or tags.get("foot") == "no":
        return False
    if tags.get("access") == "private" or tags.get("service") == "private":
        return False
    return True


def in_bbox(way) -> bool:
    for n in way.nodes:
        if n.location.valid():
            x, y = n.location.lon, n.location.lat
            if BBOX[0] <= x <= BBOX[2] and BBOX[1] <= y <= BBOX[3]:
                return True
    return False


n_ways = 0
with osmium.BackReferenceWriter(str(OSM_XML), ref_src=str(OSM_PBF), overwrite=True) as w:
    fp = (osmium.FileProcessor(str(OSM_PBF), osmium.osm.NODE | osmium.osm.WAY)
          .with_locations()
          .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
          .with_filter(osmium.filter.KeyFilter("highway")))
    for way in fp:
        if way.is_way() and walkable(way.tags) and in_bbox(way):
            w.add_way(way)
            n_ways += 1
print(f"[1] {n_ways} piyada yolu çıxarıldı ({time.time()-t0:.0f}s)")

G = ox.graph_from_xml(OSM_XML, bidirectional=True, simplify=True, retain_all=False)
print(f"[2] qraf: {G.number_of_nodes()} düyün, {G.number_of_edges()} kənar ({time.time()-t0:.0f}s)")

G = ox.project_graph(G, to_crs=f"EPSG:{UTM}")
Gu = ox.convert.to_undirected(G)

# Engine üçün yığcam qraf: yalnız x, y və uzunluq (metr).
# Kənarlar real həndəsə üzrə ≤ STEP m addımlarla sıxlaşdırılır, beləcə 400 m həddi
# uzun kənarın ortasına düşəndə izoxron sərhədi ±STEP/2 dəqiqliklə müəyyən olunur.
STEP = 25.0
H = nx.Graph()
for n, d in Gu.nodes(data=True):
    H.add_node(n, x=round(d["x"], 2), y=round(d["y"], 2))
next_id = -1
for u, v, d in Gu.edges(data=True):
    geom = d.get("geometry")
    L = float(geom.length) if geom is not None else float(d["length"])
    k = int(L // STEP)
    if geom is None or k == 0:
        if not H.has_edge(u, v) or H[u][v]["length"] > L:
            H.add_edge(u, v, length=L)
        continue
    # geometriya u → v istiqamətində olmaya bilər
    p0 = geom.coords[0]
    if (p0[0] - H.nodes[u]["x"]) ** 2 + (p0[1] - H.nodes[u]["y"]) ** 2 > (p0[0] - H.nodes[v]["x"]) ** 2 + (p0[1] - H.nodes[v]["y"]) ** 2:
        u, v = v, u
    seg = L / (k + 1)
    prev = u
    for i in range(1, k + 1):
        p = geom.interpolate(i * seg)
        H.add_node(next_id, x=round(p.x, 2), y=round(p.y, 2))
        H.add_edge(prev, next_id, length=seg)
        prev, next_id = next_id, next_id - 1
    H.add_edge(prev, v, length=seg)

with open(ENGINE_DATA / "walk_graph.pkl", "wb") as f:
    pickle.dump(H, f, protocol=pickle.HIGHEST_PROTOCOL)

stats = {"ways": n_ways, "nodes": H.number_of_nodes(), "edges": H.number_of_edges(),
         "total_km": round(sum(d["length"] for *_, d in H.edges(data=True)) / 1000),
         "seconds": round(time.time() - t0)}
(BUILD / "walk_graph_report.json").write_text(json.dumps(stats, indent=2))
print("[3]", stats)
