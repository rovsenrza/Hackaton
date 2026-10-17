"""Mərhələ 5: top-20 hub-un peyk görüntüsü üzərində vizual yoxlaması (Esri World Imagery).

Narıncı dairə = hub, mavi kvadrat = nəqliyyat düyünü. Çıxış: build/qa/sat_*.jpg
"""
import io
import json
import math
import urllib.request

import pandas as pd
from PIL import Image, ImageDraw
from pyproj import Transformer

from common import BUILD, ENGINE_DATA

N, HALF, SZ = 20, 70, 360
hubs = json.loads((BUILD / "hubs.json").read_text())["hubs"][:N]
C = pd.read_parquet(ENGINE_DATA / "candidates.parquet")
T = Transformer.from_crs(32639, 4326, always_xy=True)
(BUILD / "qa").mkdir(exist_ok=True)
tiles = []
for h in hubs:
    c = C.iloc[h["cand"]]
    alon, alat = T.transform(c.x, c.y)
    lat, lon = h["lat"], h["lon"]
    dlat, dlon = HALF / 110540, HALF / (111320 * math.cos(math.radians(lat)))
    bb = (lon - dlon, lat - dlat, lon + dlon, lat + dlat)
    url = ("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?"
           f"bbox={bb[0]},{bb[1]},{bb[2]},{bb[3]}&bboxSR=4326&imageSR=4326&size={SZ},{SZ}&format=jpg&f=image")
    im = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=30).read())).convert("RGB")
    d = ImageDraw.Draw(im)
    px = lambda lo, la: ((lo - bb[0]) / (bb[2] - bb[0]) * SZ, (bb[3] - la) / (bb[3] - bb[1]) * SZ)
    ax, ay = px(alon, alat)
    d.rectangle([ax - 6, ay - 6, ax + 6, ay + 6], outline=(0, 200, 255), width=3)
    x, y = px(lon, lat)
    d.ellipse([x - 8, y - 8, x + 8, y + 8], outline=(255, 170, 0), width=4)
    d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 170, 0))
    d.rectangle([0, 0, SZ, 22], fill=(0, 0, 0))
    d.text((4, 5), f"#{h['rank']} {h['action']} {h['anchor_kind']} off={h['offset_m']}m", fill=(255, 255, 255))
    tiles.append(im)
for k in range(math.ceil(len(tiles) / 10)):
    sheet = Image.new("RGB", (SZ * 5, SZ * 2))
    for i, im in enumerate(tiles[k * 10:(k + 1) * 10]):
        sheet.paste(im, ((i % 5) * SZ, (i // 5) * SZ))
    sheet.save(BUILD / "qa" / f"sat_{k + 1}.jpg", quality=85)
print("ok")
