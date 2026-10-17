# AYAN: Layihə Planı

> TransportTech hakatonu · İRİA × AYNA · 17–18 oktyabr 2026
> İstiqamət: **"AYNA Mobility Hub & Last-Mile"**, yəni multimodal nəqliyyat habları və vahid rəqəmsal əkiz
> Komanda: 1 nəfər (hamısını özüm edirəm), buna görə plan prioritetlərə (P0 / P1 / P2) bölünüb

**Qəbul olunmuş qərarlar:**
- Məhsul adı: **AYAN**.
- Əhatə: **yalnız Bakı**.
- Hub radiusu: **400 m**, yəni ~5 dəqiqəlik piyada məsafəsi.
- Saatlıq plan təsdiqlənib.

---

## 1. Problem (AYNA-nın öz sözləri ilə)

1. Nəqliyyat növləri təcrid olunub: avtovağzaldan avtobusa və mikromobilliyə keçid zəifdir.
2. Mobility Hub-ları və çatışmayan infrastrukturu real vaxtda göstərən vahid idarəetmə mərkəzi yoxdur.
3. Yaşıl nəqliyyata keçidin ekoloji və karbon effekti ölçülmür.

**Kontekst (2026, AYNA rəqəmləri, mətbuatdan):**
- Mikromobillik zolaqları oktyabrın əvvəlinə **67.5 km**-dir, dövlət hədəfi 100 km-dir.
- Parkinq yerləri: 623 velosiped və 872 scooter.
- Yanvar–iyul 2026: **2.3 mln** sifariş, 1.16 mln istifadəçi, 4.9 mln km. Bu, ötən ilin eyni dövründən 1.2 dəfə çoxdur.
- Sentyabr 2026: 547 758 sifariş. İstifadəçi sayı +19%, məsafə +98%.
- Mikromobillik mərkəzdə başlayan və ya bitən qısa səfərlərin ~12%-ni təşkil edir.
- **AYNA-nın 2026 prioritetləri arasında "Bakının rəqəmsal əkizi" layihəsi var.** Bizim məhsul onların öz strategiyasına birbaşa uyğundur, pitch-də bunu vurğulayacağıq.

Tələbat sürətlə böyüyür, amma infrastruktur **planlaşdırma alətsiz** genişlənir. Bizim boşluğumuz da budur.

---

## 2. Bizi nə fərqləndirəcək (qalibiyyət strategiyası)

Komandaların çoxu "4 qatı xəritəyə qoyub dashboard düzəltmək" edəcək. Biz bir pillə yuxarı çıxırıq: **xəritə yox, qərar aləti**.

| # | Fərqləndirici | Niyə münsiflərə təsir edir |
|---|---|---|
| 1 | **Real tələbat datası**: BakuBus və metro sərnişin sayları xəritəyə bağlanır | Rəqəmsiz "burada xətt var" əvəzinə "gündə 12 000 nəfər" deyə bilirik |
| 2 | **Əhali qatı** (WorldPop 100 m): kimə xidmət etmədiyimizi göstəririk | "Boşluq" anlayışı insan sayı ilə ölçülür |
| 3 | **Optimallaşdırma alqoritmi** (MCLP, maksimal əhatə): "ən yaxşı N hub harada?" | Münsiflər arasında AYNA-nın Data Science rəhbəri var, real metod görəcək |
| 4 | **What-if rəqəmsal əkiz**: hub qoyursan, əhatə və CO₂ dərhal yenilənir | Canlı demo, "wow" anı |
| 5 | **Şəffaf CO₂ metodologiyası**: mənbəli əmsallar və ssenari sürgüləri | Problemin 3-cü bəndini birbaşa həll edir |
| 6 | **Hub tipologiyası (S/M/L)** və standart avadanlıq dəsti | Təklif dərhal tətbiq oluna bilir |
| 7 | **Təsdiq axını**: Təklif → Təsdiq gözləyir → Təsdiqləndi, GeoJSON eksportu | Real idarəetmə alətinə bənzəyir, sadəcə demoya yox |
| 8 | **Açıq data keyfiyyət hesabatı**: dublikatlar, qırıq zolaqlar | AYNA-ya əlavə dəyər, ciddilik göstəricisi |

**Pitch-in əsas cümləsi:**
> "Biz AYNA-ya hub-ların harada olduğunu göstərmirik, onları **harada qurmalı olduğunu** sübut edirik: hansı sırayla, neçə nəfərə xidmət edəcəyini və neçə ton CO₂ qənaət edəcəyini."

---

## 3. Datalar

### 3.1 Hakatonun verdiyi datalar (yüklənib → `datas/`)

| Fayl | Məzmun | Qeyd |
|---|---|---|
| `avtovagzal_avtostansiyalar.geojson` | 69 nöqtə | **Bütün ölkə üzrə**, Bakı daxilindəkiləri filtrləmək lazımdır. Atributlar HTML içindədir, parse olunmalıdır |
| `avtobus_trayektoriyalari.kmz` | ~243 marşrut, 270 xətt | Placemark adı marşrut nömrəsidir, CSV ilə join olunur |
| `velosiped_parkinqleri.kmz` | 844 nöqtə və 45 xətt | Daxilində köhnə zolaq qatları da var, təmizlənməlidir |
| `velosiped_zolaqlari.kmz` | 61 xətt | "VELO YOL 2026, Mövcud zolaqlar" |

Hakatonun 4 datası opendata.az-da **24.09.2026**-da yenilənib. Avtobus trayektoriyası 23.09, velo-zolaqlar 24.09 tarixlidir, yəni aktualdır.

### 3.2 Əlavə datalar: seçim meyarı

Hər mənbə üçün 3 şərt qoyduq:
1. **Ən yeni versiya** olmalıdır.
2. **Layihədə konkret bir funksiyanı** işlətməlidir (dekor yox).
3. Pulsuz, açıq lisenziyalı və hakaton müddətində yüklənə bilən olmalıdır.

#### opendata.az: rəsmi və ən təzə datalar

| Data | Yenilənib | Fayl | Niyə seçildi |
|---|---|---|---|
| BakuBus gündəlik gedişlər (65 marşrut, yan–sen 2026) ✅ | 13.10.2026 | `bakubus_gundelik_sernisin_2026.csv` | Avtobus xətlərinə **real tələbat çəkisi** verir. Marşrut nömrəsi ilə KMZ-yə join olunur |
| **Metro çıxışlarının koordinatları (98 çıxış)** ✅ | 10.02.2026 | `metro_cixislari.csv` | **5-ci qat.** Metro hub üçün ən güclü ankerdir. Tapşırıqda verilməyib, çoxu bunu istifadə etməyəcək. Qeyd: "Avtovağzal" stansiyası Beynəlxalq Avtovağzalla birbaşa bağlıdır |
| **Metro stansiyaları üzrə gündəlik sərnişin (2026)** ✅ | 13.10.2026 | `metro_sernisin_2026.csv` | Stansiya tələbatı. Hub prioritetləşdirməsinin əsas girişidir |
| Metro sərnişin (2025) ✅ | 10.02.2026 | `metro_sernisin_2025.csv` | İl-il müqayisə və trend (pitch: "tələbat artır") |
| Metro turniket ödəniş növləri (2026) ✅ | 13.10.2026 | `metro_turniket_odenis_2026.csv` | P2: QR/NFC payı göstərir ki, vahid rəqəmsal bilet hub-da işləyə bilər |
| BakuBus ödəniş növləri ✅ | 14.10.2026 | `bakubus_odenis_novleri_2026.csv` | P2: eyni məqsəd, avtobus üzrə |

Linklər:
- https://opendata.az/dataset/bakubus-marsrutlari-uzre-gundelik-sernisin-gedislerinin-sayi-2026
- https://opendata.az/dataset/metro-cixislari-uzre-koordinatlar
- https://opendata.az/dataset/stansiyalar-uzre-gundelik-sernisin-gedislerinin-sayi
- https://opendata.az/dataset/baki-metro-stansiyalarinda-gundelik-turniket-kecidlerinin-odenis-novleri-uzre-bolgusu
- https://opendata.az/dataset/baku-bus-marsrutlari-uzre-odenis-novlerinin-ayliq-bolgusu-2026

#### Xarici mənbələr

| Mənbə | Versiya / tarix | Fayl | Niyə seçildi |
|---|---|---|---|
| **WorldPop Global2 R2025A, 100 m, constrained, il: 2026** ✅ | İstehsal 09.2025, 2026 proqnozu | `ext/worldpop_aze_2026_100m.tif` (9.7 MB) | Mövcud ən yeni yüksək dəqiqlikli əhali rastrıdır. Köhnə 2020 versiyasını əvəz edir. UN WPP 2024 ilə kalibrlənib. "Boşluq neçə nəfərə toxunur?" sualına cavab verir |
| **OpenStreetMap, Geofabrik Azerbaijan** ✅ | **16.10.2026** (2 gün əvvəl) | `ext/osm_azerbaijan_latest.osm.pbf` (46 MB) | Avtobus **dayanacaqları** (KMZ-də yalnız xətlər var), Bakı inzibati sərhədi, piyada yol şəbəkəsi. Overpass API bloklandığı üçün ekstrakt seçildi |
| **Overture Maps Places**, release 2026-09-23.1 | 23.09.2026 | pipeline zamanı DuckDB ilə bbox üzrə | **Tələbat generatorları**: universitet, ticarət mərkəzi, xəstəxana, ofis. Meta və Microsoft mənbələri ilə OSM-dən daha dolğundur |
| DEFRA / DESNZ GHG Conversion Factors **2026** | 06.2026 | — | CO₂ modeli üçün beynəlxalq standart. Rəsmi gov.uk cədvəlindən yoxlanacaq |
| Ember / LowCarbonPower: Azərbaycan şəbəkə intensivliyi | 2025 / apr 2025–mar 2026 | — | E-scooter və e-velosipedin elektrik izini **yerli şəbəkəyə** görə hesablamaq üçün |
| Chalmers (Jia & Gao, 2025), e-scooter həyat dövrü (100 AB şəhəri) | 2025 | — | E-scooter üçün ən yeni geniş tədqiqat. Kiçik bir şəhər nümunəsi əvəzinə diapazon verir |
| CARTO Dark Matter basemap | canlı | — | Açarsız və pulsuz. "İdarəetmə mərkəzi" estetikası verir |

Linklər:
- https://hub.worldpop.org/geodata/summary?id=72399
- https://download.geofabrik.de/asia/azerbaijan.html
- https://docs.overturemaps.org/release-calendar/
- https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting
- https://lowcarbonpower.org/region/Azerbaijan
- https://research.chalmers.se/en/publication/548649

**Seçilməyənlər və səbəbi:**
- WorldPop 2020 və Kontur 2023: köhnədir, WorldPop 2026 onları əvəz edir.
- GTFS feed: Bakı üçün açıq feed tapılmadı.
- Azstat avtomobil qeydiyyatı: hub hesablamasına birbaşa təsir etmir. Lazım olsa pitch-də bir rəqəm kimi istifadə olunar.

---

## 4. Metodologiya: məhsulun "beyni" (təsdiqlənib ✅)

> Prinsip: **ən dəqiq variant seçilir.** Hər rəqəmin mənbəyi, dəqiqliyi və statusu (🟢 ölçülmüş · 🟡 proqnoz · ⚪ ssenari) göstərilir.

### 4.0 Datada tapılanlar (modelə təsir edir)

| Tapıntı | Həll |
|---|---|
| Bakıda yalnız **3 avtovağzal** var: Beynəlxalq, Cənub stansiyası, Abşeron TM | Ayrıca qat kimi saxlanır və "Gəliş balı" hekayəsi üçün istifadə olunur. Dəqiq Bakı sərhədi OSM-dən götürülür, bbox kifayət etmir |
| 239 avtobus marşrutundan **yalnız 63-ünün** sərnişin datası var (BakuBus) | 4.2-də model əsaslı proqnoz |
| Metro sərnişin faylında adlar ingiliscə transliterasiyadadır (Koroghlu ↔ Koroğlu) | 27 stansiya üçün əl ilə uyğunluq cədvəli |
| Metro çıxış koordinatları tam ədəddir (`40421499`) | ÷10⁶ |
| Velo-parkinq KMZ-də iki dövr var: **649 köhnə** ("12 iyul") + **185 yeni** ("11 sentyabr") + 10 turist nöqtəsi. Köhnə zolaq qatı da daxildir | Dublikatlar silinir (≤ 5 m). Zaman testi üçün iki dövr ayrıca saxlanır (4.8) |

Tələbatın miqyası (2026 orta göstəricilər):
- metro stansiyası: median 18 500/gün, ən yüksək Koroğlu 51 400/gün;
- BakuBus marşrutu: median 8 900/gün, cəmi 621 000/gün.

### 4.1 Hub namizədləri
Mobility hub keçid nöqtəsidir, buna görə **namizədlər yalnız nəqliyyat düyünləridir**:
- 98 metro çıxışı;
- 3 avtovağzal;
- ≥ 2 marşrut keçən OSM avtobus dayanacaqları;
- mövcud parkinqlər ("hub-a çevrilmə" üçün).

Cəmi ~2 000 namizəd olur. Hər biri üçün real piyada izoxronu (400 m) əvvəlcədən hesablanır.

### 4.2 Avtobus tələbatı: 176 özəl marşrut üçün model əsaslı proqnoz
- **Xüsusiyyətlər:**
  - marşrut uzunluğu;
  - dayanacaq sayı;
  - **400 m piyada zonasında yaşayan əhali** (WorldPop 2026);
  - metro çıxışlarına bağlantı sayı;
  - mərkəzə məsafə;
  - cazibə nöqtələrinin sayı.
- **Öyrətmə:** 63 BakuBus marşrutu. Log-xətti model və gradient boosting müqayisə olunur, seçim **cross-validation** ilə aparılır.
- **Çıxış:** proqnoz 🟡 + CV xətası (±X%). UI-də "proqnoz" nişanı göstərilir.
- **Məhdudiyyət (metodologiyada yazılır):** özəl marşrutların avtobusları fərqli ola bilər, ona görə proqnoz bir qədər yüksək çıxa bilər.

### 4.3 Tələbat (hər H3 res10 xanası, ~66 m)
| Komponent | Hesab | Çəki (default) |
|---|---|---|
| Nəqliyyat | Metro: stansiyanın sərnişini çıxışlar arasında bərabər bölünür. Avtobus: marşrut sərnişini marşrutun dayanacaqlarına bərabər bölünür | 0.45 |
| Əhali | WorldPop 2026 | 0.35 |
| Cazibə nöqtələri | Overture: universitet, ticarət mərkəzi, xəstəxana, ofis | 0.20 |

Hər komponent faizlə (percentile) normallaşdırılır. Çəkilər UI-də sürgü ilə dəyişdirilir.

### 4.4 Boşluq
Mövcud parkinqə **real piyada məsafəsi** ölçülür:
- ≤ 150 m: boşluq 0;
- ≥ 400 m: boşluq 1;
- arada xətti keçid.

```
Boşluq = 0.7 × parkinq_boşluğu + 0.3 × zolaq_boşluğu      (zolaq: 200 m → 0, 800 m → 1)
```

### 4.5 Optimallaşdırma: MCLP
- **Məqsəd:** N hub ilə `Σ tələbat × boşluq` maksimum olsun, yəni xidmət olunmamış tələbatın maksimum əhatəsi. Əhatə = 400 m real piyada izoxronu.
- Bir xana bir dəfə sayılır, buna görə hub-lar təbii olaraq bir-birindən aralı düşür.
- **Həll:** greedy (əsas), PuLP dəqiq həlli ilə müqayisə (P2).
- **Çıxış:** sıralı siyahı və **fayda əyrisi** ("ilk 10 hub boşluğun X%-ni bağlayır").

### 4.6 İki tövsiyə növü
- 🆕 **Yeni hub:** boşluq böyükdür, yeni infrastruktur qurulmalıdır.
- ⬆️ **Hub-a çevrilmə:** tələbat yüksəkdir, parkinq artıq var, amma inteqrasiya yoxdur. Bu, ucuz addımdır.

### 4.7 Ölçü və yer sayı: AYNA datası ilə kalibrləmə
- Sentyabr 2026: 547 758 sifariş → ~18 260 səfər/gün, 1 495 parkinq nöqtəsi.
- "Tələbat → səfər" əmsalı elə seçilir ki, mövcud parkinqlər üçün model **real səfər sayını** versin.
- Yer sayı = gözlənilən səfər / dövriyyə.
- Tiplər:
  - **L:** avtovağzal və ya metro (≥ 30 000/gün) + avtobus;
  - **M:** metro və ya ≥ 3 marşrut;
  - **S:** qalanları.

### 4.8 Yoxlama: beyin düz işləyirmi?
- **Zaman testi:**
  - Modelə yalnız 649 köhnə parkinq (iyul) göstərilir.
  - Modelin təklifləri AYNA-nın **sentyabrda real qurduğu 185 parkinqlə** müqayisə olunur.
  - Nəticə: "model AYNA-nın sonrakı seçimlərinin X%-ni tapdı, təsadüfi seçim Y%-ni".
- **Stabillik testi:** çəkilər ±30% dəyişdirilərək 500 dəfə hesablanır. Hub kartında "stabillik %" göstərilir.

### 4.9 Avtovağzal "Gəliş balı"
3 avtovağzalın hər biri üçün:
- ən yaxın metroya **piyada** məsafəsi;
- 400 m-də marşrut sayı;
- ən yaxın parkinq;
- velo-zolağa məsafə.

Nəticə 0–5 bal şkalasındadır.

### 4.10 Velo-şəbəkə boşluqları (P1)
- Zolaqlar qraf kimi qurulur və qopuq komponentlər tapılır.
- Parkinq klasterlərini zolağa bağlayan "çatışmayan halqalar" km ilə hesablanır. Bu, 100 km hədəfinə gedən yol xəritəsidir.

### 4.11 CO₂ modeli
```
Gündəlik hub səfəri (4.7) × avtomobil/taksi əvəzetmə payı (ssenari 10% / 20% / 30%)
  × orta məsafə (~2.1 km, AYNA yan–iyl 2026: 4.92 mln km / 2.30 mln sifariş)
  × (EF_avtomobil − EF_yeni_növ) × 365
```
| Əmsal | Dəyər | Mənbə |
|---|---|---|
| Avtomobil (orta) | ~0.173 kg CO₂e/km (benzin ~0.162) | DEFRA 2026, ikinci dərəcəli mənbələr, rəsmi cədvəldən yoxlanacaq |
| Avtobus | ~0.10 kg CO₂e/sərnişin-km | DEFRA 2026, ikinci dərəcəli mənbələr, rəsmi cədvəldən yoxlanacaq |
| Velosiped | 0 | — |
| E-scooter (paylaşımlı) | 30–124 g/km, baza ~60 g | Chalmers 2025 |
| AZ şəbəkə intensivliyi | 422–632 g CO₂/kWh | LowCarbonPower / Ember |

Çıxış diapazon kimi verilir: "~184 t/il (120–250)" ⚪.

### 4.12 Məkan dəqiqliyi qaydaları (məcburi)

**Hub-un yerləşdirilməsi:** xam koordinat istifadə olunmur, hub icazəli əraziyə qoyulur.

| Qadağan zona | Müəyyənetmə |
|---|---|
| Yolun hərəkət hissəsi | OSM mərkəz xətti + yarım-en (`lanes` × 3.5 m; teq yoxdursa sinfə görə: magistral ~12, əsas ~8, küçə ~4 m) + 1.5 m |
| Binalar | Overture və OSM konturları |
| Dəmir yolu, su, tikinti | OSM `railway`, `water`, `landuse=construction` |
| Yol ortasındakı adalar | Hər tərəfdən hərəkət hissəsi ilə əhatələnmiş kiçik poliqonlar |

- Hub nəqliyyat düyünündən **≤ 60 m piyada məsafəsində** olmalıdır.
- Prioritet: piyada sahəsi və meydan → mövcud parkinq → səki zolağı.
- "Hub-a çevrilmə" tövsiyələrində AYNA-nın real parkinq koordinatı saxlanılır.

**Avtomatik yoxlama (hər hub):**
- yoldan ≥ 1.5 m;
- bina daxilində deyil;
- düyünə ≤ 60 m piyada;
- digər hub-a ≥ 300 m.

Şərti pozan hub yenidən yerləşdirilir və ya rədd edilir. Nəticələr keyfiyyət hesabatına yazılır.

**Gözlə yoxlama:**
- UI-də "Peyk" qatı olacaq (lisenziya yoxlanacaq).
- Top-20 hub demodan əvvəl əl ilə yoxlanılır.

**Xətlər:**
- Avtobus xətlərinin OSM yollarından sürüşməsi ölçülür.
- Sadələşdirmə UTM-də, ≤ 2 m tolerantlıqla aparılır.
- Dayanacaq xəttə ≤ 25 m məsafədədirsə, həmin marşruta aid sayılır.

**Göstəricilərin göstərilməsi:**

| Qayda | Nümunə |
|---|---|
| Saxta dəqiqlik yoxdur | "~12 400 nəfər", "~184 t" |
| Təxminlər diapazonla göstərilir | "184 t/il (120–250)" |
| Mənbə nişanı | 🟢 ölçülmüş · 🟡 proqnoz · ⚪ ssenari |
| Vahid həmişə yazılır | nəfər/gün, km, t CO₂/il |
| Simvollar üst-üstə düşmür | Toqquşma nəzarəti, ölçü tipə görə (S/M/L) |
| Rəng şkalası | Kvantil siniflər, legend həmişə görünür, rəng korluğuna uyğun palitra |
| Avtobus xəttinin qalınlığı | √sərnişin sayı |

---

## 5. Məhsul: ekranlar

1. **Rəqəmsal əkiz (xəritə)**
   - 5 qat: avtovağzal, avtobus, metro, velo-parkinq, velo-zolaq. Hər qatı açıb-bağlamaq olur.
   - H3 istilik xəritəsi: MBİ və ya SKB.
   - Avtobus xətlərinin qalınlığı sərnişin sayına görədir.
   - Xanaya klik edəndə bütün göstəricilər açılır.
2. **Hub planlayıcı**
   - N sürgüsü, MCLP nəticələri, sıralı siyahı, fayda əyrisi.
   - **What-if:** xəritəyə klik edib hub əlavə et və ya sil, rəqəmlər canlı yenilənir.
3. **Rəhbərlik paneli**
   - KPI-lar: əhatə olunan əhali %, boşluq zonaları, hub sayı, CO₂ ton/il.
   - Avtovağzal "Gəliş balı" cədvəli.
   - CO₂ ssenari sürgüləri.
4. **Hub kartı və təsdiq axını**: status, tip, yer sayı, GeoJSON eksportu.
5. **Metodologiya və data keyfiyyəti**: mənbələr və fərziyyələr.

Dil: Azərbaycanca. Dizayn: tünd fon, AYNA rəngləri, "idarəetmə mərkəzi" estetikası.

---

## 6. Texniki arxitektura

```
datas/ (xam) ──► pipeline/ (Python, offline) ──► web/public/data/*  (statik qatlar, əvvəlcədən hesablanmış nəticələr)
                                            └──► engine/data/*      (piyada qrafı, tələbat nöqtələri)

Brauzer ──► web/ (Next.js) ──┬──► statik qatlar (ani açılır, backend olmasa da işləyir)
                             ├──► /api/hubs (Next route handlers) ──► engine
                             └──► engine/ (FastAPI Geo Engine) ──► SQLite (hub-lar, statuslar)
                                    • POST /isochrone   real piyada izoxronu (< 1 s)
                                    • POST /optimize    MCLP, istifadəçi çəkiləri ilə
                                    • POST /co2         ssenari hesabı
                                    • GET/POST/PATCH /hubs   təklif → təsdiq axını
```
- **Pipeline (Python):**
  - geopandas, shapely, pyproj, h3, rasterio, pyosmium, osmnx (bax: 6.3).
  - KMZ → GeoJSON, təmizləmə, join-lər.
  - H3 aqreqasiya, indekslər, MCLP, CO₂.
  - Çıxış: kiçik, sadələşdirilmiş JSON-lar (cəmi < 5 MB).
- **Frontend: Next.js** (App Router) + TypeScript + Tailwind + Recharts.
- **Backend: FastAPI "Geo Engine" + SQLite** (variant B, təsdiqlənib ✅, bax: bölmə 6.2).

### 6.1 Xəritə steki (təsdiqlənib ✅)

| Komponent | Seçim | Niyə |
|---|---|---|
| Render | **MapLibre GL JS** | Açıq koddur, tokensiz və lisenziyasızdır, AYNA serverində tam offline işləyir. Mapbox lisenziyası on-prem imkan vermir |
| Analitik qatlar | **deck.gl**: H3HexagonLayer, PathLayer, TripsLayer, ArcLayer, ScatterplotLayer | H3, 3D ekstruziya, avtobus axını animasiyası. Yüksək dəqiqlikli rejimdə yaxın zoomda titrəmir |
| Fon xəritəsi | **OpenFreeMap** (OSM vektor, 3D binalar) | Açarsız və limitsizdir. Analiz datası ilə eyni mənbədir (OSM), mövqe fərqi ~7 m-dir |
| Offline ehtiyat | **Protomaps PMTiles**, yalnız Bakı ekstraktı (~30–60 MB) | Demo internetsiz də işləyir, on-prem arqumentini gücləndirir |
| 3D binalar | **Overture Buildings** (2026-09-23.1) | OSM-də Bakı üzrə ~30 000 bina var, natamamdır. Overture-da ML ilə çıxarılmış binalar da var |
| Brauzer hesabları | h3-js + Turf.js (geodezik) | What-if üçün sürətli təxmin verir |

**Rejimlər:**
- **2D "Planlaşdırma":** analiz, what-if, ölçmə.
- **3D "Rəqəmsal əkiz":** tələbat "dağları", avtobus axını (simulyasiya olduğu açıq deyilir), binalar, kinematik giriş.

**Dəqiqlik qaydaları (məcburi):**
1. Bütün məsafə və bufer hesabları **UTM Zone 39N (EPSG:32639)**-də, metrlə aparılır. Web Mercator yalnız ekranda göstərmək üçündür. Bakının enində o, məsafəni **~31%** təhrif edir.
2. Hub əhatəsi **real piyada şəbəkəsi ilə** ölçülür (400 m, ~5 dəqiqə). Şəbəkə OSM yollarıdır (magistrallar çıxılmaqla), izoxronlar osmnx və ya pandana ilə qurulur.
3. H3 yalnız aqreqasiya və vizual üçündür. Əhatə hesabı real nöqtədən nöqtəyə aparılır.
4. Bütün giriş dataları WGS84-ə gətirilir və yoxlanır.
5. What-if-də yeni hub üçün əvvəlcə geodezik bufer (dərhal), sonra izoxron (P1) göstərilir.

**Qat → ən dəqiq mənbə** (OSM ölçməsi, 16.10.2026, Bakı):

| Qat | Mənbə | Ölçmə |
|---|---|---|
| Velo-parkinq, velo-zolaq, avtobus xətləri, avtovağzal | AYNA | OSM-də velo-parkinq 86-dır, AYNA-da 844. OSM-də avtobus marşrutu ümumiyyətlə yoxdur |
| Metro çıxışları | Bakı Metropoliteni | OSM ilə median fərq **7 m**, 98 çıxışdan 96-sı < 30 m |
| Yollar və avtobus dayanacaqları | OSM | 68 543 yol seqmenti, 1 431 dayanacaq |
| Binalar | Overture | OSM natamamdır |
- **Miqyaslanma (pitch slaydı üçün):** eyni pipeline real vaxt feed-ləri ilə işləyə bilər (GPS, BakıKart validasiyaları, scooter operator API-ləri). Arxitektura buna hazırdır.

### 6.2 Backend (variant B, təsdiqlənib ✅)

| Komponent | Seçim | Niyə |
|---|---|---|
| Geo Engine | **Python FastAPI** | Dəqiqlik alətlərinin hamısı Python-dadır: pyproj (UTM), osmnx/pandana (piyada qrafı), MCLP, rasterio. Qraf servis başlayanda yaddaşa yüklənir, izoxron < 1 s çəkir |
| Baza | **SQLite** (SQLAlchemy ORM) | Hub-lar və təsdiq statusları üçündür. Tək fayldır, deploy riski sıfırdır |
| İstehsal hədəfi (yalnız pitch-də, qurulmayıb) | SQLite → **PostGIS** (eyni ORM), **Docker Compose**, AYNA serverində on-prem | — |
| Deploy | Next.js → Vercel. Engine → Railway və ya Fly.io (Docker) | Ehtiyat: lokal `docker compose up` |
| Ehtiyat rejimi | Engine əlçatan deyilsə, UI statik nəticələrə və geodezik buferə keçir | Demo heç vaxt dayanmır |

**Seçilməyənlər və səbəbi:**
- PostGIS (indi): demoda fərq yaratmır, deploy riski və ~1 saat əlavə iş deməkdir.
- Yalnız statik variant: canlı izoxron və yenidən optimallaşdırma itir, dəqiqlik üstünlüyümüz görünmür.
- iOS app: alıcı masaüstündə işləyir, solo vaxtı bölünür. Əvəzinə responsive Next.js qururuq, roadmap-də "PWA sahə audit modulu" qeyd olunur.

### 6.3 Detallı texniki qərarlar (təsdiqlənib ✅)

**Python mühiti və geo kitabxanalar**

| Məsələ | Qərar | Niyə |
|---|---|---|
| Mühit | **Python 3.12 + uv** | Bəzi geo paketlərin Python 3.13 wheel-ləri yoxdur |
| Piyada qrafı | **pyosmium** ilə Bakı bbox-u `.osm`-ə çıxarılır, sonra **osmnx `graph_from_xml`** (network_type=walk) | Overpass API bloklanıb (406), qraf lokal OSM faylından (16.10.2026) qurulur |
| İzoxron | **networkx Dijkstra**, cutoff 400 m | Bakı qrafında ~50–200 ms. pandana quraşdırma riskinə görə seçilmədi |
| MCLP | **Greedy** (əsas), **PuLP** dəqiq həll (P2, müqayisə üçün) | Saniyələrlə işləyir, (1−1/e) zəmanəti var |
| Overture | **`overturemaps` CLI**, bbox üzrə | DuckDB lazım deyil |
| Digər | geopandas, shapely, pyproj, h3, rasterio | — |

**Frontend (Next.js)**

| Məsələ | Qərar |
|---|---|
| Versiya | **Next.js 15, App Router**, TypeScript |
| Xəritə inteqrasiyası | **react-map-gl/maplibre + @deck.gl/mapbox `MapboxOverlay` (interleaved)**. deck.gl qatları 3D binalarla düzgün üst-üstə düşür |
| SSR | Xəritə komponenti **`dynamic(..., { ssr: false })`** ilə yüklənir, çünki WebGL serverdə işləmir |
| UI | **shadcn/ui + Tailwind** |
| State | **Zustand**: qatlar, seçilmiş hub, what-if |
| Qrafiklər | **Recharts** |
| Dil | Yalnız azərbaycanca, i18n yoxdur |

**Data formatları**

| Data | Format |
|---|---|
| Nöqtə və xətt qatları | **GeoJSON**, sadələşdirilmiş (avtobus xətləri 5 MB → < 1 MB) |
| H3 xanaları | **Kompakt JSON** `{h3, pop, skb, mbi, ...}`, həndəsəsiz (~20 000 xana, ~1–2 MB) |
| 3D binalar | **OpenFreeMap OSM binaları** (əsas). Overture → PMTiles, tippecanoe ilə (P2) |
| Offline fon | **Protomaps `pmtiles extract`**, Bakı bbox, ~30–60 MB |

**Engine və deploy**

| Məsələ | Qərar |
|---|---|
| Stek | FastAPI + uvicorn + Pydantic + SQLAlchemy + SQLite |
| Qraf | Pipeline qrafı **pickle** kimi saxlayır, engine başlayanda ~2–3 s-də yükləyir |
| RAM | Bakı piyada qrafı ~300–600 MB → **Railway** |
| Ehtiyat | Lokal maşında tam stek (web + engine) qalxır |

**Layihə idarəsi**

| Məsələ | Qərar |
|---|---|
| Versiya nəzarəti | **`git init` + GitHub**, Vercel GitHub-dan avtomatik deploy edir |
| Testlər | **Yalnız kritik nöqtələr üçün pytest**: UTM məsafə doğruluğu, izoxron 400 m-i keçmir, MCLP əhatə hesabı |

### Qovluq strukturu
```
hackaton/
├── PLAN.md
├── datas/                 # xam data (+ ext/: WorldPop, OSM)
├── pipeline/              # Python, offline
│   ├── 01_convert.py      # KMZ/GeoJSON/CSV → təmiz GeoJSON (UTM 39N yoxlaması)
│   ├── 02_enrich.py       # sərnişin join, metro, OSM dayanacaqlar, WorldPop, Overture
│   ├── 03_walk_graph.py   # Bakı piyada qrafı (osmnx/pandana)
│   ├── 04_h3_index.py     # H3 aqreqasiya, MBİ, SKB
│   ├── 05_hubs.py         # MCLP, tipologiya, izoxronlar, CO₂
│   └── 06_quality.py      # data keyfiyyət hesabatı
├── engine/                # FastAPI Geo Engine + SQLite
├── web/                   # Next.js tətbiqi
├── docker-compose.yml
└── pitch/                 # pitch deck
```

---

## 7. İş planı (solo, prioritetli)

**P0** mütləqdir, demo onsuz olmur. **P1** fərqləndiricidir. **P2** vaxt qalsa edilir.

| Mərhələ | Vaxt | İş | Pr. |
|---|---|---|---|
| 0 | 00:30–01:00 | Əlavə dataları yüklə (metro ×2, WorldPop, OSM). Mühiti qur | P0 |
| 1 | 01:00–03:00 | `01_convert`: KMZ parse, avtovağzal HTML atributları, Bakı filtri, BakuBus join | P0 |
| 2 | 03:00–05:00 | `03_h3_index`: H3 qatları, MBİ, SKB | P0 |
| 3 | 05:00–06:30 | `04_hubs`: MCLP, tipologiya, CO₂, avtovağzal "Gəliş balı" | P0 |
| — | 06:30–08:30 | Yuxu ☕ | — |
| 4 | 08:30–11:00 | App: xəritə, 5 qat, H3 istilik xəritəsi, klik paneli | P0 |
| 5 | 11:00–12:30 | Hub planlayıcı, fayda əyrisi, **what-if** | P0/P1 |
| 6 | 12:30–13:30 | Rəhbərlik paneli, KPI, CO₂ sürgüləri. **Deploy №1** | P0 |
| 7 | 14:00–14:45 | Təsdiq axını və eksport, velo-şəbəkə boşluqları, data keyfiyyəti | P1/P2 |
| 8 | 14:45–16:00 | Pitch deck (aşağıda) və demo ssenarisi. **Deploy №2 (son)** | P0 |
| 9 | 16:00–16:30 | 3× məşq (taymerlə), offline ehtiyat (video və screenshot-lar) | P0 |

**Qırmızı xətt:** saat 13:30-da P0 deploy olunmuş və işləyir vəziyyətdə olmalıdır. Ondan sonra yeni risk götürülmür.

---

## 8. Pitch (4 dəqiqə + 3 dəqiqə sual-cavab)

| Vaxt | Slayd | Məzmun |
|---|---|---|
| 0:00–0:30 | Hekayə | "Gəncədən Beynəlxalq Avtovağzala gəldiniz. İndi necə evə gedəcəksiniz?" Tapdığımız real rəqəm |
| 0:30–1:00 | Problem | AYNA-nın 3 problemi və datada tapdığımız boşluq rəqəmi |
| 1:00–2:45 | **Canlı demo** | Rəqəmsal əkiz → SKB istilik xəritəsi → MCLP top-10 → what-if hub əlavə → CO₂ |
| 2:45–3:20 | Təsir | "İlk 10 hub: X nəfər, Y% boşluq, Z ton CO₂/il" |
| 3:20–3:45 | Miqyas | Real vaxt feed-ləri, digər şəhərlər (Gəncə, Sumqayıt) |
| 3:45–4:00 | Bağlanış | "Qərarı qurmazdan əvvəl sınayın." |

**Kriteriyalara uyğunluq:**
- Aktuallıq: real rəqəmlər.
- İnnovativlik: MCLP və what-if əkiz.
- Prototip: canlı və deploy olunmuş tətbiq.
- Təqdimat: məşq olunmuş ssenari.
- Komanda: solo, uçdan-uca icra.

**Gözlənilən suallar:**
- "CO₂ rəqəmi necə hesablanıb?" → Metodologiya paneli.
- "Data nə qədər etibarlıdır?" → Keyfiyyət hesabatı.
- "Real vaxt necə olacaq?" → Arxitektura slaydı.

---

## 9. Risklər və ehtiyat planı

| Risk | Ehtiyat |
|---|---|
| KMZ strukturu qarışıqdır (köhnə qatlar) | Qovluq və ad üzrə filtr, lazım olsa əl ilə yoxlama |
| BakuBus marşrut adı ilə KMZ adı uyğun gəlmir | Normallaşdırma (rəqəm çıxarışı). Uyğun gəlməyənlər üçün orta dəyər, "uyğunluq %" göstərilir |
| WorldPop və ya OSM yüklənmir | Kontur H3 ehtiyatı, OSM-siz davam (POI çəkisi 0) |
| deck.gl performansı | Res 8-ə keç, xanaları Bakı sərhədi ilə məhdudlaşdır |
| İnternet demo zamanı kəsilir | Lokal build və ekran videosu |
| Vaxt çatmır | P1/P2-ni kəs, P0 + pitch kifayətdir |

---

## 10. Açıq suallar

1. ~~Əhatə~~: Bakı ✅
2. ~~Radius~~: 400 m ✅
3. ~~Ad~~: AYAN ✅
4. Velo-parkinq KMZ-də velosiped və scooter ayrılırmı? Rəsmi rəqəm 623 + 872 = 1495-dir, bizdə 844 nöqtə var. Mərhələ 1-də yoxlanacaq.
5. Metro çıxış koordinatları tam ədəd formatındadır (`40421499`), 10⁶-ya bölünməlidir.
