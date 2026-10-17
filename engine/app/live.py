"""Canlı avtobus gəlişləri: AYNA MaaS gateway (SIRI StopMonitoring) üzərindən, ehtiyatla.

- Açar yalnız mühit dəyişənindən oxunur (AYNA_MAAS_TOKEN); koda və brauzerə düşmür.
- Hər dayanacaq cavabı 30 s keşlənir, bir sorğuda ən çox 4 dayanacaq: AYNA serverinə yük minimaldır.
- Cavab strukturu xidmət saatlarında hələ tam görülməyib, ona görə parser müdafiəlidir.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

GATEWAY = "https://service.necpt.xyz/api/index.php"
TTL = 30
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
        out.append({
            "line": _first(_get(j, "publishedLineName")) or _get(j, "lineRef"),
            "destination": _first(_get(j, "destinationName")),
            "expected": _get(call, "expectedArrivalTime") or _get(call, "expectedDepartureTime"),
            "aimed": _get(call, "aimedArrivalTime"),
            "lon": _get(loc, "longitude"), "lat": _get(loc, "latitude"),
            "vehicle": _get(j, "vehicleRef"),
        })
    return out


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
