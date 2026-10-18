"""Müstəqil doğrulama: tələbat modeli Apar-ın (Tripy) real vasitə mövqelərini tanıyırmı?

Model Apar datasını heç görməyib (girişlər: nəqliyyat, əhali, POI). Metod 05_hubs.py-dəki
AYNA parkinq AUC-u ilə eynidir (H3 res11 xanaları, eyni baza xətləri), nəticələr müqayisəlidir.

Giriş:  datas/apar_vehicles*.json (canlı API snapshot-ları, hər biri ayrıca qiymətləndirilir)
Çıxış:  build/apar_report.json (+ metrics.json-a "apar" açarı)
"""
import json

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from shapely import STRtree
from sklearn.metrics import roc_auc_score

from common import BUILD, ENGINE_DATA, RAW, UTM, WEB_DATA, WGS84

rng = np.random.default_rng(42)
cells = pd.read_parquet(BUILD / "cells.parquet")
parks = gpd.read_file(BUILD / "parkings.gpkg").to_crs(UTM)
park_tree = STRtree(list(parks.geometry))

cen = gpd.GeoSeries(gpd.points_from_xy([49.8352], [40.3716]), crs=WGS84).to_crs(UTM).iloc[0]
dcen = np.hypot(cells.x.values - cen.x, cells.y.values - cen.y)
populated = cells["pop"].values > 0
no_ayna = ~np.isfinite(cells.d_park.values)  # 400 m piyada məsafəsində AYNA parkinqi yoxdur


def auc_set(is_pos, mask, n=20000):
    pos = np.flatnonzero(is_pos & mask)
    neg_pool = np.flatnonzero(~is_pos & mask)
    neg = rng.choice(neg_pool, min(n, len(neg_pool)), replace=False)
    yv = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
    idx = np.r_[pos, neg]
    out = {col: round(float(roc_auc_score(yv, cells[col].values[idx])), 3) for col in ("D", "transit_n", "pop_n", "poi_n")}
    out["yalnız_mərkəzə_yaxınlıq"] = round(float(roc_auc_score(yv, -dcen[idx])), 3)
    out["n_pos"], out["n_neg"] = int(len(pos)), int(len(neg))
    return out


snaps = []
for f in sorted(RAW.glob("apar_vehicles*.json")):
    raw = json.loads(f.read_text())
    v = pd.DataFrame([r for r in raw if isinstance(r.get("lat"), (int, float)) and isinstance(r.get("lon"), (int, float))])
    v = v[v.operation_status.ne("lost_signal")]  # siqnalı itmiş vasitənin mövqeyi köhnə ola bilər
    is_pos = cells.h3.isin({h3.latlng_to_cell(la, lo, 11) for la, lo in zip(v.lat, v.lon)}).values
    pts = gpd.GeoSeries(gpd.points_from_xy(v.lon, v.lat), crs=WGS84).to_crs(UTM)
    d_ayna = np.array([parks.geometry.iloc[park_tree.nearest(p)].distance(p) for p in pts])
    snaps.append({
        "file": f.name,
        "n_vehicles": len(raw),
        "n_used": int(len(v)),
        "by_type": v.type.value_counts().to_dict(),
        "n_cells": int(is_pos.sum()),
        "share_within_50m_of_ayna_parking": round(float((d_ayna <= 50).mean()), 3),
        "auc_all": auc_set(is_pos, populated),
        "auc_within_8km": auc_set(is_pos, populated & (dcen <= 8000)),
        "auc_outside_ayna_coverage": auc_set(is_pos, populated & no_ayna),
    })
    s = snaps[-1]
    print(f"{f.name}: {s['n_used']} vasitə, AUC={s['auc_all']['D']} (8 km: {s['auc_within_8km']['D']}, "
          f"AYNA-sız ərazi: {s['auc_outside_ayna_coverage']['D']}), AYNA parkinqinə ≤50 m: {s['share_within_50m_of_ayna_parking']}")

if not snaps:
    raise SystemExit("datas/apar_vehicles*.json tapılmadı")

rep = {"snapshots": snaps, "main": max(range(len(snaps)), key=lambda i: snaps[i]["n_used"])}
(BUILD / "apar_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2))
for p in (WEB_DATA / "metrics.json", ENGINE_DATA / "metrics.json"):
    if p.exists():
        m = json.loads(p.read_text())
        m["apar"] = rep
        p.write_text(json.dumps(m, ensure_ascii=False, separators=(",", ":"), default=float))
