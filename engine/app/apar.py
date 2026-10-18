"""Canlı Apar (Tripy Mobility) vasitə mövqeləri: hub kartı üçün müstəqil tələbat siqnalı.

- JWT yalnız mühit dəyişənindən oxunur (APAR_JWT_TOKEN); koda və brauzerə düşmür.
- Bütün Bakı bbox-u bir sorğuda yüklənir və 30 s keşlənir: hər /evaluate çağırışı yeni
  şəbəkə sorğusu açmır.
- Refresh-token axını təsdiqlənməyib (bax: docs/APAR-TRIPY-API.md "Known gaps"), ona görə
  token vaxtı bitəndə əl ilə yenilənməlidir (7 gün ömür).
- Cavab strukturu vendor tərəfindən sənədləşdirilmir, ona görə parser müdafiəlidir.
"""
from __future__ import annotations

import json
import math
import os
import time
import urllib.parse
import urllib.request

BASE_URL = "https://app.tripy.mobi"
VEHICLES_PATH = "/api/vehicle/get-avaliable-vehicles"
# Bakı bbox: pipeline/05_hubs.py-dəki ZONE_BB ilə eyni, tam şəhəri bir sorğuda əhatə edir
BBOX = {"sw_lat": 39.93, "sw_lon": 49.38, "ne_lat": 40.60, "ne_lon": 50.35}
CENTER_LAT, CENTER_LON = 40.3777, 49.892  # hər çağırışda tələb olunan "cari mövqe" (bax: gotcha)
TTL = 30

_cache: tuple[float, list[dict]] | None = None


def enabled() -> bool:
    return bool(os.environ.get("APAR_JWT_TOKEN"))


def _fetch() -> list[dict]:
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < TTL:
        return _cache[1]
    qs = urllib.parse.urlencode({
        "southwest_lat": BBOX["sw_lat"], "southwest_lon": BBOX["sw_lon"],
        "northeast_lat": BBOX["ne_lat"], "northeast_lon": BBOX["ne_lon"],
        "zoom_level": 12, "lat": CENTER_LAT, "lon": CENTER_LON,
    })
    req = urllib.request.Request(
        f"{BASE_URL}{VEHICLES_PATH}?{qs}",
        headers={
            # Cloudflare (error 1010) rədd edir, əgər app-ın öz başlıqları göndərilmirsə
            # (sadəcə Authorization kifayət etmir, default urllib UA bloklanır)
            "Authorization": f"Bearer {os.environ['APAR_JWT_TOKEN']}",
            "Platform": "ios",
            "App-Type": "TripyBike",
            "Accept-Language": "az-AZ,az;q=0.9",
            "User-Agent": "Apar/v60.0.7+6009 (iOS; Version 27.0 (Build 24A437))",
        },
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.loads(r.read().decode())
    vehicles = data if isinstance(data, list) else []
    _cache = (now, vehicles)
    return vehicles


def near(lon: float, lat: float, radius_m: float) -> dict:
    """Nöqtənin radius_m ətrafında canlı Apar vasitələri: say, növ/status bölgüsü, orta enerji."""
    try:
        vehicles = _fetch()
    except Exception as e:  # şəbəkə, auth və ya format xətası: kartı sındırmasın
        return {"has_live": False, "error": type(e).__name__, "count": 0}
    m_per_deg_lon = 111_320 * math.cos(math.radians(lat))
    close = [
        v for v in vehicles
        if isinstance(v.get("lat"), (int, float)) and isinstance(v.get("lon"), (int, float))
        and ((v["lat"] - lat) * 111_320) ** 2 + ((v["lon"] - lon) * m_per_deg_lon) ** 2 <= radius_m ** 2
    ]
    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}
    charges = []
    for v in close:
        by_type[v.get("type") or "?"] = by_type.get(v.get("type") or "?", 0) + 1
        by_status[v.get("operation_status") or "?"] = by_status.get(v.get("operation_status") or "?", 0) + 1
        if isinstance(v.get("charge_level"), (int, float)):
            charges.append(v["charge_level"])
    return {
        "has_live": True, "count": len(close), "by_type": by_type, "by_status": by_status,
        "avg_charge": round(sum(charges) / len(charges), 1) if charges else None, "ttl_s": TTL,
    }
