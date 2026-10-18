"""Canlı avtobus gəlişləri: AYNA MaaS gateway (SIRI StopMonitoring) üzərindən, ehtiyatla.

- Açar yalnız mühit dəyişənindən oxunur (AYNA_MAAS_TOKEN); koda və brauzerə düşmür.
- Hər dayanacaq cavabı 5 s keşlənir (bütün baxanlar üçün ortaq). Hub kartı ən çox 4, xəritədəki real
  avtobuslar ən çox 20 dayanacaq sorğulayır: AYNA serverinə yük məhduddur.
- Cavab strukturu xidmət saatlarında hələ tam görülməyib, ona görə parser müdafiəlidir.
"""
from __future__ import annotations

import json
import math
import os
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

GATEWAY = "https://service.necpt.xyz/api/index.php"
TTL = 5  # AYNA avtobus mövqelərini ~5–15 s-dən bir yeniləyir (ölçülüb, median 10 s)
_cache: dict[str, tuple[float, dict]] = {}


def enabled() -> bool:
    return bool(os.environ.get("AYNA_MAAS_TOKEN"))


def _call(stop_code: str) -> dict:
    now = time.time()
    hit = _cache.get(stop_code)
    if hit and now - hit[0] < TTL:
        return hit[1]
    body = urllib.parse.urlencode({
        "method": "otpGateway", "token": os.environ["AYNA_MAAS_TOKEN"],
        "endpoint": f"/siri-stop-monitoring-detailV2?stopCode={stop_code}", "methodType": "GET",
        "payload": "{}", "version": "3", "page": "ayan_hub_card", "platform": "ios", "appVersion": "V4.0.6",
    }).encode()
    req = urllib.request.Request(GATEWAY, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.loads(r.read().decode())
    _cache[stop_code] = (now, data)
    return data


def _get(d, *keys):
    for k in keys:
        if isinstance(d, dict):
            for cand in (k, k[0].upper() + k[1:]):
                if cand in d:
                    d = d[cand]
                    break
            else:
                return None
        else:
            return None
    return d


def _first(v):
    return v[0] if isinstance(v, list) and v else v


def parse(data: dict) -> list[dict]:
    """SIRI monitoredStopVisit → [{line, destination, expected, aimed, lon, lat}] (sahələr olmaya bilər)."""
    out = []
    deliv = _first(_get(data, "data", "siri", "serviceDelivery", "stopMonitoringDelivery")) or {}
    for v in _get(deliv, "monitoredStopVisit") or []:
        j = _get(v, "monitoredVehicleJourney") or {}
        call = _get(j, "monitoredCall") or {}
        loc = _get(j, "vehicleLocation") or {}
        at_stop = _get(call, "vehicleLocationAtStop") or {}
        out.append({
            "line": _first(_get(j, "publishedLineName")) or _get(j, "lineRef"),
            "destination": _first(_get(j, "destinationName")),
            "expected": _get(call, "expectedArrivalTime") or _get(call, "expectedDepartureTime"),
            "aimed": _get(call, "aimedArrivalTime"),
            "lon": _get(loc, "longitude"), "lat": _get(loc, "latitude"),
            "stop_lon": _get(at_stop, "longitude"), "stop_lat": _get(at_stop, "latitude"),
            "vehicle": _get(j, "vehicleRef"),
            "occupancy": _get(j, "occupancy"),
        })
    return out


def _yaw(v: dict) -> float | None:
    """Avtobusdan yaxınlaşdığı dayanacağa istiqamət (dərəcə, şərqdən saat əqrəbinin əksinə)."""
    if not all(isinstance(v.get(k), (int, float)) for k in ("lon", "lat", "stop_lon", "stop_lat")):
        return None
    dx = (v["stop_lon"] - v["lon"]) * 111_320 * math.cos(math.radians(v["lat"]))
    dy = (v["stop_lat"] - v["lat"]) * 110_540
    return round(math.degrees(math.atan2(dy, dx)), 1) if math.hypot(dx, dy) > 15 else None


def buses(stop_codes: list[str]) -> dict:
    """Bir neçə dayanacağın SIRI cavablarından real avtobus mövqeləri, avtobus nömrəsinə görə təkrarsız."""
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(lambda c: _safe(c), stop_codes))
    seen: dict[str, dict] = {}
    for visits in results:
        for v in visits or []:
            vid = v.get("vehicle")
            lon, lat = v.get("lon"), v.get("lat")
            # AYNA GPS-i olmayan avtobusları (0, 0) ilə qaytarır (~25%): Bakı ətrafından kənar mövqe atılır
            if not vid or not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)) \
                    or not (39.5 <= lat <= 41.0 and 48.5 <= lon <= 50.8):
                continue
            if vid not in seen or (seen[vid]["yaw"] is None and _yaw(v) is not None):
                seen[vid] = {"id": str(vid), "line": v["line"], "destination": v["destination"],
                             "lon": round(v["lon"], 6), "lat": round(v["lat"], 6), "yaw": _yaw(v), "occupancy": v["occupancy"]}
    return {"buses": list(seen.values()), "n_stops": len(stop_codes), "n_failed": sum(r is None for r in results), "ttl_s": TTL}


def _safe(code: str) -> list[dict] | None:
    try:
        return parse(_call(code))
    except Exception:
        return None


def arrivals(stops: list[dict]) -> dict:
    res, raw_sample = [], None
    for s in stops[:4]:
        try:
            d = _call(s["code"])
            visits = parse(d)
            if raw_sample is None and visits:
                raw_sample = d
            res.append({**s, "visits": visits})
        except Exception as e:  # şəbəkə və ya format xətası: kartı sındırmasın
            res.append({**s, "visits": [], "error": type(e).__name__})
    return {"stops": res, "has_live": any(r["visits"] for r in res), "ttl_s": TTL}
