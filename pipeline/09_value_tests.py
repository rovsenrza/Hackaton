"""Modelin əlavə dəyəri: iki test (hər ikisi əvvəlcədən müəyyən edilib, nəticədən asılı olmayaraq hesabata yazılır).

1. Mərkəz effekti çıxarılmış AUC: xanalar mərkəzdən 1 km-lik halqalara bölünür, AUC hər halqanın içində
   hesablanır (≥ 10 müsbət xanası olan halqalar), müsbət sayına görə çəkili orta + bootstrap 95% interval.
   Müsbətlər: AYNA parkinqləri və Apar vasitələri (H3 res11), mənfilər: məskunlaşmış xanalar.
2. Eyni büdcə: N hub (10/20/50) dörd qaydaya görə seçilir, göstəricilər eyni düsturla birləşmiş
   əhatə üzrə hesablanır (hub-lar arası təkrar sayılmır). Hamısında eyni namizədlər və 300 m aralıq.

Çıxış: build/value_report.json (+ metrics.json-a "value" açarı)
"""
import json

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.metrics import roc_auc_score

from common import BUILD, ENGINE_DATA, RAW, UTM, WEB_DATA, WGS84
from hubcore import co2_t

RING_M = 1000
MIN_POS = 10
NEG_CAP = 5000
BOOT = 200
rng = np.random.default_rng(42)

# --- 1. Mərkəz effekti çıxarılmış AUC ----------------------------------------------
cells = pd.read_parquet(BUILD / "cells.parquet")
cen = gpd.GeoSeries(gpd.points_from_xy([49.8352], [40.3716]), crs=WGS84).to_crs(UTM).iloc[0]
dcen = np.hypot(cells.x.values - cen.x, cells.y.values - cen.y)
ring = (dcen // RING_M).astype(int)
populated = cells["pop"].values > 0


def positives_parkings():
    p = gpd.read_file(BUILD / "parkings.gpkg").to_crs(WGS84)
    return cells.h3.isin({h3.latlng_to_cell(g.y, g.x, 11) for g in p.geometry}).values


def positives_apar():
    snaps = sorted(RAW.glob("apar_vehicles*.json"), key=lambda f: -len(json.loads(f.read_text())))
    raw = json.loads(snaps[0].read_text())
    pts = {h3.latlng_to_cell(r["lat"], r["lon"], 11) for r in raw
           if isinstance(r.get("lat"), (int, float)) and isinstance(r.get("lon"), (int, float))
           and r.get("operation_status") != "lost_signal"}
    return cells.h3.isin(pts).values, snaps[0].name


def ring_auc(is_pos, scores: dict) -> dict:
    strata = []
    for r in np.unique(ring[populated]):
        m = populated & (ring == r)
        pos, neg = np.flatnonzero(is_pos & m), np.flatnonzero(~is_pos & m)
        if len(pos) < MIN_POS or len(neg) < MIN_POS:
            continue
        neg = rng.choice(neg, min(NEG_CAP, len(neg)), replace=False)
        strata.append((int(r), pos, neg))
    w = np.array([len(p) for _, p, _ in strata], float)

    def wauc(score, picks):
        return float(np.average([roc_auc_score(np.r_[np.ones(len(p)), np.zeros(len(n))], score[np.r_[p, n]])
                                 for p, n in picks], weights=w))

    out = {"rings_used": [r for r, _, _ in strata], "n_pos": int(w.sum())}
    for name, score in scores.items():
        est = wauc(score, [(p, n) for _, p, n in strata])
        boot = [wauc(score, [(rng.choice(p, len(p)), rng.choice(n, len(n))) for _, p, n in strata]) for _ in range(BOOT)]
        out[name] = {"auc": round(est, 3), "ci95": [round(float(np.percentile(boot, 2.5)), 3), round(float(np.percentile(boot, 97.5)), 3)]}
    return out


scores = {"D": cells.D.values, "pop_n": cells.pop_n.values, "transit_n": cells.transit_n.values,
          "poi_n": cells.poi_n.values, "yalnız_mərkəzə_yaxınlıq": -dcen}
apar_pos, apar_file = positives_apar()
rep = {"ring_auc": {"method": f"{RING_M} m halqalar, halqa başına ≥ {MIN_POS} müsbət, mənfilər ≤ {NEG_CAP}/halqa, bootstrap {BOOT}",
                    "ayna_parkings": ring_auc(positives_parkings(), scores),
                    "apar": {**ring_auc(apar_pos, scores), "file": apar_file}}}
for k in ("ayna_parkings", "apar"):
    r = rep["ring_auc"][k]
    print(f"halqa AUC [{k}]: D={r['D']['auc']} {r['D']['ci95']} | əhali={r['pop_n']['auc']} | mərkəz={r['yalnız_mərkəzə_yaxınlıq']['auc']} (n_pos={r['n_pos']})")

# --- 2. Eyni büdcə: N hub dörd qaydaya görə ---------------------------------------------
ec = pd.read_parquet(ENGINE_DATA / "cells.parquet")
C = pd.read_parquet(ENGINE_DATA / "candidates.parquet")
A = sparse.load_npz(ENGINE_DATA / "coverage.npz").tocsr()
P = json.loads((ENGINE_DATA / "params.json").read_text())
K, SPACING, W = P["K"], P["min_spacing"], P["weights"]
wv = np.array([W["transit"], W["pop"], W["poi"]], float)
wv /= wv.sum()
demand = ec[["transit_n", "pop_n", "poi_n"]].values @ wv
gap, pop, dpark = ec.gap.values, ec["pop"].values, ec.d_park.values
PXY = C[["px", "py"]].values
OK = C.action.ne("rejected").values
dc = np.hypot(PXY[:, 0] - cen.x, PXY[:, 1] - cen.y)


def spaced(order, n):
    """Sıraya görə ilk n namizəd, bir-birindən ≥ SPACING."""
    sel = []
    for i in order:
        if OK[i] and all(np.hypot(*(PXY[i] - PXY[j])) >= SPACING for j in sel):
            sel.append(i)
            if len(sel) == n:
                break
    return sel


def greedy(w, n):
    """MCLP: hər addımda hələ əhatə olunmamış çəkini ən çox artıran namizəd (engine /optimize ilə eyni)."""
    left, allowed, sel = w.copy(), OK.copy(), []
    for _ in range(n):
        g = A @ left
        g[~allowed] = -1
        i = int(np.argmax(g))
        if g[i] <= 0:
            break
        sel.append(i)
        left[A[i].indices] = 0
        allowed &= np.hypot(PXY[:, 0] - PXY[i, 0], PXY[:, 1] - PXY[i, 1]) >= SPACING
    return sel


def metrics(sel):
    u = np.zeros(len(ec), bool)
    for i in sel:
        u[A[i].indices] = True
    trips = float(K * (demand[u] * gap[u]).sum())
    return {"pop_covered": float(pop[u].sum()), "pop_newly_served": float(pop[u & ~(dpark <= 400)].sum()),
            "trips_day_new": trips, "trips_day_gross": float(K * demand[u].sum()), "co2_t_year_base": co2_t(trips, "base")}


def rounded(m):
    return {"pop_covered": round(m["pop_covered"], -2), "pop_newly_served": round(m["pop_newly_served"], -2),
            "trips_day_new": round(m["trips_day_new"]), "trips_day_gross": round(m["trips_day_gross"]),
            "co2_t_year_base": round(m["co2_t_year_base"], 1)}


budget = {}
for n in (10, 20, 50):
    res = {"model_mclp": metrics(greedy(demand * gap, n)),
           "yüksək_tələbat_boşluqsuz": metrics(greedy(demand, n)),
           "mərkəzə_ən_yaxın": metrics(spaced(np.argsort(dc), n))}
    rnd = [metrics(spaced(rng.permutation(len(C)), n)) for _ in range(200)]
    res = {k: rounded(v) for k, v in res.items()}
    res["təsadüfi"] = {k: {"mean": round(float(np.mean([r[k] for r in rnd])), 1),
                           "p5": round(float(np.percentile([r[k] for r in rnd], 5)), 1),
                           "p95": round(float(np.percentile([r[k] for r in rnd], 95)), 1)} for k in rnd[0]}
    budget[str(n)] = res
    mm = res["model_mclp"]
    print(f"N={n}: yeni sakin model={mm['pop_newly_served']:.0f} | yüksək tələbat={res['yüksək_tələbat_boşluqsuz']['pop_newly_served']:.0f} | "
          f"mərkəz={res['mərkəzə_ən_yaxın']['pop_newly_served']:.0f} | təsadüfi={res['təsadüfi']['pop_newly_served']['mean']:.0f}; "
          f"əlavə səfər model={mm['trips_day_new']} | yüksək tələbat={res['yüksək_tələbat_boşluqsuz']['trips_day_new']} | "
          f"mərkəz={res['mərkəzə_ən_yaxın']['trips_day_new']} | təsadüfi={res['təsadüfi']['trips_day_new']['mean']:.0f}")
rep["equal_budget"] = budget

(BUILD / "value_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2))
for p in (WEB_DATA / "metrics.json", ENGINE_DATA / "metrics.json"):
    if p.exists():
        m = json.loads(p.read_text())
        m["value"] = rep
        p.write_text(json.dumps(m, ensure_ascii=False, separators=(",", ":"), default=float))
