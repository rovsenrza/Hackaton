# AYAN: Bakı üçün mobility hub planlayıcısı

> TransportTech hakatonu · İRİA × AYNA · 17–18 oktyabr 2026 · İstiqamət: "AYNA Mobility Hub & Last-Mile"

AYAN hub-ların harada olduğunu göstərməklə kifayətlənmir, onları **harada qurmalı olduğunu** hesablayır: hansı ardıcıllıqla, neçə nəfərə xidmət edəcəyini və nə qədər CO₂ qənaət edəcəyini. Bütün hesablamalar real piyada şəbəkəsində aparılır (400 m, ~5 dəqiqə).

- **Rəqəmsal əkiz (2D/3D):** 5 nəqliyyat qatı, xidmət olunmamış tələbatın istilik xəritəsi, real AYNA avtobusları və canlı gəlişlər.
- **Hub planlayıcı:** MCLP optimallaşdırması, fayda əyrisi, what-if (xəritəyə klik edib hub əlavə et, rəqəmlər dərhal yenilənir).
- **Rəhbərlik paneli:** KPI-lar, eyni büdcə ilə seçim qaydalarının müqayisəsi, avtovağzalların gəliş balı, CO₂ ssenarisi, təsdiq axını, GeoJSON eksportu.
- **Data keyfiyyət mərkəzi:** çirkli fayl → avtomatik düzəlişlər → insan yoxlaması → təmiz GeoJSON.
- **Kopilot (istəyə bağlı):** planlaşdırma sualları üçün Claude. Rəqəmləri yalnız engine alətlərindən götürür.

Metodologiya, data mənbələri və qərarlar: [`docs/PLAN.md`](docs/PLAN.md). Pitch ssenarisi və sual-cavab: [`pitch/PITCH.md`](pitch/PITCH.md).

**Təqdimat hazırlayanlar üçün:**
- Biznes modeli, xərclər və maliyyə: [`pitch/business/business_model.md`](pitch/business/business_model.md). Maşın üçün data: [`financials.json`](pitch/business/financials.json) və `*.csv`. Manat rəqəmləri ssenaridir (fərziyyələr faylın içində işarələnib).
- Məhsulun ekran görüntüləri (yeni dizayn): [`pitch/screenshots/`](pitch/screenshots/). Brend işarəsi: `web/public/brand/ayan-mark.png`.
- Dizayn sistemi: [`DESIGN.md`](DESIGN.md), məhsul faktları: [`PRODUCT.md`](PRODUCT.md).

## Struktur

```
datas/      hakatonun və opendata.az-ın xam dataları (+ ext/: böyük xarici fayllar, git-də deyil)
pipeline/   Python, offline: çevirmə → piyada qrafı → tələbat → hub-lar → doğrulama → eksport
engine/     FastAPI Geo Engine: /evaluate, /optimize, təsdiq axını (SQLite), canlı data, kopilot
web/        Next.js + MapLibre + deck.gl; web/public/data/ əvvəlcədən hesablanmış qatlardır (git-dədir)
docs/       layihə planı
pitch/      pitch deck və ssenari
```

## İşə salma

### 1. Yalnız veb (ən sürətli, engine-siz)

Əvvəlcədən hesablanmış qatlar `web/public/data/`-dadır. Ona görə xəritə, panel və metodologiya engine olmadan da işləyir. What-if və canlı data üçün isə engine lazımdır.

```bash
cd web && npm install && npm run dev      # http://localhost:3000
```

### 2. Pipeline (engine datası və testlər üçün)

Bu faylları `datas/ext/`-ə yükləyin (mənbələr `docs/PLAN.md`-in 3.2 bölməsindədir):

| Fayl | Mənbə |
|---|---|
| `osm_azerbaijan_latest.osm.pbf` | Geofabrik, Azerbaijan |
| `worldpop_aze_2026_100m.tif` | WorldPop Global2 R2025A, 100 m, constrained |
| `overture_places.parquet`, `overture_buildings.parquet` | Overture Maps 2026-09-23.1, Bakı bbox |
| `gb_aze_adm2.geojson` | geoBoundaries ADM2 |

```bash
cd pipeline
uv sync
for s in 01_convert 02_ayna 03_walk_graph 04_demand 05_hubs 08_apar_validate 09_value_tests 06_export; do uv run python $s.py; done
uv run pytest -q
```

Nəticələr `build/` və `engine/data/` qovluqlarına yazılır, bu qovluqlar git-də deyil. Onlar yoxdursa, bu nəticələrdən asılı testlər səbəbini göstərib keçilir.

### 3. Engine

```bash
cd engine
uv sync
uv run --env-file .env uvicorn main:app --app-dir app --port 8000
```

Veb engine-ə `NEXT_PUBLIC_ENGINE_URL` vasitəsilə qoşulur (default `http://localhost:8000`). Engine əlçatan olmayanda UI statik nəticələrə keçir.

`engine/.env` git-də deyil. Bütün dəyişənlər istəyə bağlıdır: hansı verilməyibsə, ona aid funksiya sadəcə söndürülür.

| Dəyişən | Funksiya |
|---|---|
| `AYNA_MAAS_TOKEN` | Canlı AYNA avtobusları və gəlişlər |
| `APAR_JWT_TOKEN` | Apar vasitə sıxlığı (müstəqil tələbat siqnalı) |
| `ANTHROPIC_API_KEY` | Kopilot. Model `AYAN_COPILOT_MODEL` ilə seçilir |

## Data və məxfilik

- Kopilot modelə yalnız engine alətlərinin aqreqat nəticələrini göndərir: hub göstəriciləri, xana cəmləri, ərazi adları. Fərdi data göndərilmir. Açar verilməyəndə kopilot tam sönür, sistemin qalan hissəsi eyni qaydada işləyir.
- Pilot mərhələsində canlı mənbələr rəsmi data mübadiləsi ilə əvəz olunmalıdır. Engine-də hər mənbə ayrıca moduldur (`live.py`, `apar.py`), ona görə bu dəyişiklik bir modulla məhdudlaşır.
- İstehsal hədəfi on-prem quraşdırmadır: SQLite → PostGIS, Docker Compose, AYNA serveri. Xəritə steki (MapLibre, OpenFreeMap) açar və lisenziya tələb etmir.
