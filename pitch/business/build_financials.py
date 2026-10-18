"""AYAN: xərc və maliyyə modeli (təqdimat üçün data).

Fiziki həcmlər (hub sayı, tip, yer sayı, yeni sakin, səfər, CO2) modelin real çıxışından oxunur:
  web/public/data/hubs.json, web/public/data/metrics.json
Vahid qiymətlər və gəlir rəqəmləri FƏRZİYYƏDİR (aşağı / baza / yuxarı). Onlar ASSUMPTIONS-da bir yerdədir,
hər biri "status": "fərziyyə" ilə işarələnib və AYNA ilə pilotda təsdiqlənməlidir.

İşə salma (repo kökündən):  python3 pitch/business/build_financials.py
Çıxış: pitch/business/financials.json və *.csv
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
HUBS = json.loads((ROOT / "web/public/data/hubs.json").read_text())["hubs"]
M = json.loads((ROOT / "web/public/data/metrics.json").read_text())

SC = ("low", "base", "high")
USD_AZN = 1.70  # fakt: manatın dollara sabit məzənnəsi

# ---------------------------------------------------------------------------------------------
# FƏRZİYYƏLƏR (AZN). Hamısı təxminidir; mənbə: komanda fərziyyəsi, pilotda AYNA ilə təsdiqlənməli.
# ---------------------------------------------------------------------------------------------
ASSUMPTIONS = {
    "dock_capex_azn": {
        "desc": "Bir velo/scooter yeri: dayaq/rəf, işarələmə, quraşdırma (dok-stansiyasız, AYNA MPS tipli)",
        "low": 250, "base": 450, "high": 800,
    },
    "hub_fixed_capex_azn": {
        "desc": "Hub-ın sabit hissəsi tipə görə: istiqamət lövhəsi/totem, səki işləri, boya, işıqlandırma",
        "S": {"low": 3000, "base": 6000, "high": 10000},
        "M": {"low": 8000, "base": 15000, "high": 25000},
        "L": {"low": 20000, "base": 40000, "high": 70000},
    },
    "action_fixed_factor": {
        "desc": "Sabit xərc əmsalı əməliyyata görə: çevrilmədə parkinq artıq var, inteqrasiyada mərkəz mövcuddur",
        "new": 1.0, "upgrade": 0.4, "integrate": 0.5,
    },
    "opex_share_of_capex_per_year": {
        "desc": "İllik saxlama/təmir/təmizlik, kapital xərcinin payı kimi",
        "low": 0.06, "base": 0.08, "high": 0.12,
    },
    "platform_license_azn_per_year": {
        "desc": "AYAN platformasının bir şəhər üçün illik lisenziyası + dəstək (B2G, on-prem)",
        "low": 60000, "base": 120000, "high": 200000,
    },
    "onprem_setup_azn": {
        "desc": "Birdəfəlik quraşdırma: AYNA serverində yerləşdirmə, PostGIS, rəsmi data feed-lərinə inteqrasiya",
        "low": 25000, "base": 45000, "high": 70000,
    },
    "new_city_onboarding_azn": {
        "desc": "Yeni şəhərə uyğunlaşdırma (data hazırlığı, kalibrləmə) birdəfəlik",
        "low": 20000, "base": 35000, "high": 55000,
    },
    "team_monthly_cost_azn": {
        "desc": "Komandanın aylıq xərci (4 nəfər: data/model, backend, frontend/GIS, biznes), vergilər daxil",
        "low": 12000, "base": 16000, "high": 22000,
    },
    "infra_monthly_azn": {
        "desc": "Server, monitorinq, xəritə məlumatı yeniləmələri (on-prem olduqda AYNA tərəfdə qismən)",
        "low": 300, "base": 600, "high": 1200,
    },
    "field_audit_per_hub_azn": {
        "desc": "Pilotda hər hub üçün sahə auditi (səki eni, maneələr, foto)",
        "low": 150, "base": 300, "high": 500,
    },
    "operator_analytics_azn_per_year": {
        "desc": "Mikromobillik operatoruna (Apar və s.) yerləşmə analitikası abunəsi, bir operator",
        "low": 12000, "base": 24000, "high": 40000,
    },
}


def hub_capex(h: dict, sc: str) -> float:
    a = ASSUMPTIONS
    fixed = a["hub_fixed_capex_azn"][h["type"]][sc] * a["action_fixed_factor"][h["action"]]
    return fixed + h["docks"] * a["dock_capex_azn"][sc]


def r(x: float, n: int = 0) -> float:
    return round(x, n) if n else int(round(x))


# --- 1. Hub proqramı: 10 / 20 / 50 hub (MCLP ardıcıllığı ilə) -------------------------------
program_rows = []
program = {}
for n in (10, 20, 50):
    sel = HUBS[:n]
    pm = M["hubs"]["program"][str(n)]
    eq = M["value"]["equal_budget"][str(n)]
    rnd_trips = eq["təsadüfi"]["trips_day_new"]["mean"]
    composition = {
        "types": {t: sum(1 for h in sel if h["type"] == t) for t in ("S", "M", "L")},
        "actions": {a: sum(1 for h in sel if h["action"] == a) for a in ("new", "upgrade", "integrate")},
        "docks": sum(h["docks"] for h in sel),
    }
    by_sc = {}
    for sc in SC:
        capex = sum(hub_capex(h, sc) for h in sel)
        opex = capex * ASSUMPTIONS["opex_share_of_capex_per_year"][sc]
        trips_year = pm["trips_day_new"] * 365
        by_sc[sc] = {
            "capex_azn": r(capex),
            "opex_azn_per_year": r(opex),
            "capex_per_dock_azn": r(capex / composition["docks"]),
            "capex_per_new_resident_azn": r(capex / pm["pop_newly_served"]),
            "capex_per_daily_new_trip_azn": r(capex / pm["trips_day_new"]),
            "cost_per_new_trip_azn_5y": r((capex + 5 * opex) / (5 * trips_year), 2),
            "random_placement_cost_per_daily_new_trip_azn": r(capex / rnd_trips),
        }
        program_rows.append({
            "hubs": n, "scenario": sc, **composition["types"], **{f"action_{k}": v for k, v in composition["actions"].items()},
            "docks": composition["docks"], **by_sc[sc],
            "pop_newly_served": pm["pop_newly_served"], "trips_day_new": pm["trips_day_new"],
            "co2_t_year_base": pm["co2_t_year_base"],
        })
    program[str(n)] = {
        "composition": composition,
        "impact_measured_by_model": {
            "pop_newly_served": pm["pop_newly_served"],
            "trips_day_new": pm["trips_day_new"],
            "co2_t_year_base": pm["co2_t_year_base"],
            "share_of_unserved_demand_closed": M["hubs"]["mclp"]["share_closed"][str(n)],
            "random_placement_trips_day_new_mean": round(rnd_trips, 1),
            # eyni büdcə testi (09_value_tests): AYAN-ın seçimi / təsadüfi seçimin ortası
            "ayan_vs_random_x": round(eq["model_mclp"]["trips_day_new"] / rnd_trips, 1),
        },
        "costs_by_scenario": by_sc,
    }

# --- 2. Pilot büdcəsi: 3 ay, 10 hub ----------------------------------------------------------
PILOT_MONTHS = 3
pilot_items = [
    ("Komanda (3 ay)", "team", lambda sc: ASSUMPTIONS["team_monthly_cost_azn"][sc] * PILOT_MONTHS),
    ("On-prem quraşdırma və data inteqrasiyası", "setup", lambda sc: ASSUMPTIONS["onprem_setup_azn"][sc]),
    ("Top-10 hub sahə auditi", "audit", lambda sc: ASSUMPTIONS["field_audit_per_hub_azn"][sc] * 10),
    ("İnfrastruktur (3 ay)", "infra", lambda sc: ASSUMPTIONS["infra_monthly_azn"][sc] * PILOT_MONTHS),
    ("Ehtiyat (10%)", "contingency", None),
]
pilot = {}
pilot_rows = []
for sc in SC:
    lines = {}
    for name, key, fn in pilot_items[:-1]:
        lines[key] = {"label": name, "azn": r(fn(sc))}
    sub = sum(v["azn"] for v in lines.values())
    lines["contingency"] = {"label": "Ehtiyat (10%)", "azn": r(sub * 0.10)}
    software_total = sum(v["azn"] for v in lines.values())
    hubs10 = program["10"]["costs_by_scenario"][sc]["capex_azn"]
    pilot[sc] = {
        "software_and_team": lines,
        "software_total_azn": software_total,
        "physical_hubs_capex_azn": hubs10,
        "physical_hubs_note": "10 hub-ın fiziki qurulması adətən şəhərin/AYNA-nın kapital büdcəsindəndir, AYAN-ın gəlirinə daxil deyil",
        "pilot_total_incl_hubs_azn": software_total + hubs10,
    }
    for key, v in lines.items():
        pilot_rows.append({"scenario": sc, "item": v["label"], "azn": v["azn"], "payer": "AYNA (pilot müqaviləsi)"})
    pilot_rows.append({"scenario": sc, "item": "10 hub-ın fiziki qurulması (kapital)", "azn": hubs10, "payer": "AYNA/şəhər kapital büdcəsi"})

# --- 3. Gəlir proqnozu: 3 il (ssenari) -------------------------------------------------------
# İl 1: AYNA pilotu (setup) + lisenziya 9 ay; İl 2: AYNA + Gəncə; İl 3: AYNA + Gəncə + Sumqayıt + 2 operator
revenue_rows = []
revenue = {}
for sc in SC:
    lic = ASSUMPTIONS["platform_license_azn_per_year"][sc]
    onb = ASSUMPTIONS["new_city_onboarding_azn"][sc]
    op = ASSUMPTIONS["operator_analytics_azn_per_year"][sc]
    team = ASSUMPTIONS["team_monthly_cost_azn"][sc] * 12
    infra = ASSUMPTIONS["infra_monthly_azn"][sc] * 12
    years = {
        1: {"cities": 1, "operators": 0, "license": lic * 0.75, "onboarding": ASSUMPTIONS["onprem_setup_azn"][sc], "operator": 0},
        2: {"cities": 2, "operators": 1, "license": lic * 2, "onboarding": onb, "operator": op},
        3: {"cities": 3, "operators": 2, "license": lic * 3, "onboarding": onb, "operator": op * 2},
    }
    revenue[sc] = {}
    for y, d in years.items():
        rev = d["license"] + d["onboarding"] + d["operator"]
        cost = team * (1 if y == 1 else 1.25 if y == 2 else 1.5) + infra * d["cities"]
        row = {
            "year": y, "scenario": sc, "cities": d["cities"], "operators": d["operators"],
            "license_revenue_azn": r(d["license"]), "onboarding_revenue_azn": r(d["onboarding"]),
            "operator_analytics_revenue_azn": r(d["operator"]), "total_revenue_azn": r(rev),
            "operating_cost_azn": r(cost), "operating_result_azn": r(rev - cost),
        }
        revenue_rows.append(row)
        revenue[sc][f"year_{y}"] = row

# --- 4. Dəyər: eyni büdcə ilə nə alınır -----------------------------------------------------
eq10 = M["value"]["equal_budget"]["10"]
value = {
    "statement": "Eyni sayda hub (≈ eyni büdcə) ilə AYAN-ın seçimi daha çox yeni səfər verir; nisbət vahid qiymətdən asılı deyil",
    "budget_10_hubs_trips_day_new": {
        "AYAN (MCLP)": eq10["model_mclp"]["trips_day_new"],
        "Ən yüksək tələbat (boşluğa baxmadan)": eq10["yüksək_tələbat_boşluqsuz"]["trips_day_new"],
        "Təsadüfi seçim (orta, 200 təkrar)": round(eq10["təsadüfi"]["trips_day_new"]["mean"], 1),
        "Mərkəzə ən yaxın": eq10["mərkəzə_ən_yaxın"]["trips_day_new"],
    },
    "ayan_vs_random_x": 7.5, "ayan_vs_center_x": 20, "ayan_vs_high_demand_x": 1.5,
    "upper_bound_if_gap_fully_closed": {
        "trips_day": M["hubs"]["city"]["gap_potential_upper_bound_trips_day"],
        "co2_t_year": M["hubs"]["city"]["gap_potential_upper_bound_co2_t_year"],
    },
}

out = {
    "_readme": "AYAN xərc və maliyyə modeli. 'model_facts' və 'impact_measured_by_model' modelin real çıxışıdır. "
               "Bütün AZN rəqəmləri FƏRZİYYƏYƏ əsaslanan ssenarilərdir (low/base/high) və AYNA ilə təsdiqlənməlidir. "
               "Təqdimatda 'təxmini' və ya 'ssenari' kimi göstərin. Valyuta: AZN (1 USD = 1,70 AZN).",
    "currency": "AZN",
    "usd_azn": USD_AZN,
    "status_legend": {"fakt": "modelin çıxışı və ya açıq data", "fərziyyə": "komanda təxmini, təsdiqlənməli", "ssenari": "fərziyyələrdən hesablanmış"},
    "model_facts": {
        "residents_without_parking_5min": M["hubs"]["city"]["pop_without_parking_400m"],
        "residents_without_parking_share": M["hubs"]["city"]["pop_without_parking_share"],
        "candidate_transit_nodes": sum(M["hubs"]["candidates"].values()),
        "hub_walk_radius_m": 400,
        "calibration_trips_per_point_day": M["hubs"]["calibration"]["trips_per_point_day"],
    },
    "assumptions": {k: {**v, "status": "fərziyyə"} for k, v in ASSUMPTIONS.items()},
    "hub_program": program,
    "pilot_3_months_10_hubs": pilot,
    "revenue_projection_3_years": revenue,
    "value_same_budget": value,
}
(OUT / "financials.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))


def write_csv(name: str, rows: list[dict]) -> None:
    with (OUT / name).open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


write_csv("hub_program_costs.csv", program_rows)
write_csv("pilot_budget.csv", pilot_rows)
write_csv("revenue_projection.csv", revenue_rows)
print("ok:", ", ".join(p.name for p in sorted(OUT.glob("*.csv"))), "+ financials.json")
for n in ("10", "20", "50"):
    b = program[n]["costs_by_scenario"]["base"]
    print(f"{n} hub (baza): capex {b['capex_azn']:,} AZN, yer başına {b['capex_per_dock_azn']} AZN, yeni sakin başına {b['capex_per_new_resident_azn']} AZN")
print("pilot (baza): proqram+komanda", pilot["base"]["software_total_azn"], "AZN; 10 hub kapital", pilot["base"]["physical_hubs_capex_azn"], "AZN")
for y in (1, 2, 3):
    row = revenue["base"][f"year_{y}"]
    print(f"İl {y} (baza): gəlir {row['total_revenue_azn']:,}, xərc {row['operating_cost_azn']:,}, nəticə {row['operating_result_azn']:,}")
