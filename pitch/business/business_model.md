# AYAN: biznes modeli, xərclər və maliyyə

> TransportTech hakatonu · İRİA × AYNA · 18.10.2026 · Komanda: Rövşən Rzayev, Talib İsgəndərli, İlham Süleymanov
>
> **Statuslar:** 🟢 **fakt** — modelin real çıxışı və ya açıq data · 🟡 **fərziyyə** — komandanın təxmini, AYNA ilə pilotda təsdiqlənməli · ⚪ **ssenari** — fərziyyələrdən hesablanıb.
> Bütün manat rəqəmləri ⚪ ssenaridir. Təqdimatda onları "təxmini" kimi göstərin. Maşın üçün oxunaqlı data: [`financials.json`](financials.json), cədvəllər: `*.csv`. Rəqəmləri yenidən hesablamaq: `python3 pitch/business/build_financials.py`.

## 1. Bir cümlədə

AYAN nəqliyyat agentliklərinə mobility hub-ları **harada, hansı sırayla** qurmağı və **nə qədər fayda** verəcəyini hesablayan B2G planlaşdırma platformasıdır. Pul lisenziya ilə qazanılır, şəhər isə hub büdcəsini xidmətsiz tələbata yönəldərək qənaət edir.

## 2. Problem və dəyər (🟢 fakt)

- Bakı sakinlərinin **71,5%-nin (~2 065 000 nəfər)** 5 dəqiqəlik piyada məsafəsində velo/scooter parkinqi yoxdur.
- AYNA-nın sentyabrda qurduğu yeni məntəqələrin **97,8%-i** artıq parkinq olan yerlərin 400 m-liyindədir. Təsadüfi sakin üçün bu pay 40%-dir. Yəni şəbəkə sıxlaşır, amma boşluq bağlanmır.
- **Eyni büdcə ilə daha çox nəticə:** 10 hub üçün AYAN-ın seçimi gündə **223** əlavə səfər verir. Bu, təsadüfi seçimdən **×7,5** (orta 30), "mərkəzə ən yaxın" qaydasından **×20** (11), "ən yüksək tələbat" qaydasından isə **×1,5** (150) çoxdur. Nisbət vahid qiymətdən asılı deyil: eyni pulla 7,5 dəfə çox istifadə. Üstünlük ilk hub-larda ən böyükdür: 20 hub-da təsadüfi seçimdən ×5,2, 50 hub-da ×3,4 çox.
- Model doğrulanıb. Mərkəz effekti çıxılanda tələbat indeksi AYNA-nın parkinq yerlərini **AUC 0,76** ilə tanıyır (baza xətti 0,54). Müstəqil Apar datası ilə AUC **0,69**-dur.

## 3. Biznes modeli kanvası

| Blok | Məzmun |
|---|---|
| **Müştəri seqmentləri** | 1) AYNA (ilk müştəri və birgə tərtibatçı). 2) Digər şəhərlərin nəqliyyat agentlikləri və bələdiyyələr (Gəncə, Sumqayıt). 3) Mikromobillik operatorları (Apar və s.), yerləşmə analitikası üçün |
| **İstifadəçilər** | AYNA-nın planlaşdırma və strategiya şöbələri, rəhbərlik |
| **Dəyər təklifi** | Hub büdcəsini xidmətsiz tələbata yönəltmək: eyni sayda hub ilə ×7,5 çox yeni səfər. Hər hub üçün sübut kartı: neçə nəfər, neçə səfər, nə qədər CO₂. Qurmazdan əvvəl what-if ilə sınamaq (~0,5 s). Təsdiq axını və GeoJSON eksportu |
| **Kanallar** | Hakaton → AYNA ilə 3 aylıq pilot → İRİA startap dəstəyi → regional şəhərlərə istinad |
| **Müştəri münasibətləri** | Uzunmüddətli lisenziya, rüblük model kalibrləməsi, birgə inkişaf |
| **Gəlir mənbələri** | 1) Şəhər üzrə illik platforma lisenziyası və dəstək. 2) Birdəfəlik quraşdırma və yeni şəhərə uyğunlaşdırma. 3) Operatorlar üçün analitika abunəsi |
| **Əsas resurslar** | Pipeline (real piyada qrafı, MCLP, doğrulama), Geo Engine, açıq data, AYNA-nın rəsmi data axını |
| **Əsas fəaliyyətlər** | Data inteqrasiyası, model kalibrləməsi, sahə auditi, platformanın inkişafı |
| **Əsas tərəfdaşlar** | AYNA, İRİA, Bakı Metropoliteni, BakuBus, opendata.az, mikromobillik operatorları |
| **Xərc strukturu** | Komanda (əsas xərc), on-prem quraşdırma, infrastruktur, sahə auditi |

**Rəqabət üstünlüyü:** xəritəni hamı göstərir, AYAN isə qərar verir. Hesablama real piyada şəbəkəsində (750 631 düyün) aparılır, baza xətləri ilə doğrulanıb, nəticə yerləşdirmə qaydaları ilə səki zolağına qədər dəqiqləşdirilir. Sistem on-prem işləyir və xəritə steki açar və lisenziya tələb etmir.

## 4. Hub proqramının xərci (⚪ ssenari, 🟢 fiziki həcm faktdır)

Hub-ların tipi, sayı və yer sayı modelin MCLP ardıcıllığından götürülüb.

| Proqram | Tərkib (🟢) | Yer (🟢) | Kapital xərci, aşağı / **baza** / yuxarı | İllik saxlama (baza) | Yeni sakin başına (baza) |
|---|---|---|---|---|---|
| **10 hub** | 6 L, 4 M · 3 yeni, 6 çevrilmə, 1 inteqrasiya | 315 | 170 350 / **322 750** / 566 000 AZN | ~25 800 AZN | ~81 AZN |
| **20 hub** | 6 L, 14 M · 12 yeni, 7 çevrilmə, 1 inteqrasiya | 499 | 291 550 / **546 550** / 948 200 AZN | ~43 700 AZN | ~44 AZN |
| **50 hub** | 7 L, 33 M, 10 S · 31 yeni, 17 çevrilmə, 2 inteqrasiya | 952 | 557 800 / **1 041 600** / 1 797 600 AZN | ~83 300 AZN | ~31 AZN |

Bütün ssenarilər [`hub_program_costs.csv`](hub_program_costs.csv) faylındadır.

**Necə hesablanıb (🟡 fərziyyələr):**
- Kapital xərci = sabit xərc × əməliyyat əmsalı + yer sayı × bir yerin qiyməti.
- Sabit xərc tipə görədir: S 6 000, M 15 000, L 40 000 AZN.
- Əməliyyat əmsalı: yeni 1,0, çevrilmə 0,4 (parkinq artıq var), inteqrasiya 0,5.
- Bir yerin qiyməti baza ssenaridə 450 AZN-dir.
- İllik saxlama kapital xərcinin 8%-i götürülüb.

**Təsir (🟢):**

| Proqram | Yeni sakin | Əlavə səfər/gün | CO₂, t/il | Xidmətsiz tələbatın bağlanan payı |
|---|---|---|---|---|
| 10 hub | ~4 000 | ~222 | ~4,6 | 8,2% |
| 20 hub | ~12 300 | ~328 | ~6,7 | 12,1% |
| 50 hub | ~33 300 | ~513 | ~10,6 | 19,0% |

> CO₂ rəqəmi kiçikdir və biz bunu dürüst göstəririk. Dəyər CO₂-də deyil, büdcənin düzgün yerə xərclənməsindədir. Boşluq tam bağlansa, yuxarı hədd ~45 900 səfər/gün və ~939 t CO₂/il olardı.

## 5. Pilot: 3 ay, 10 hub (⚪ ssenari)

| Maddə | Aşağı | **Baza** | Yuxarı | Kim ödəyir |
|---|---|---|---|---|
| Komanda (3 ay) | 36 000 | **48 000** | 66 000 | AYNA (pilot müqaviləsi) |
| On-prem quraşdırma və data inteqrasiyası | 25 000 | **45 000** | 70 000 | AYNA |
| Top-10 hub sahə auditi | 1 500 | **3 000** | 5 000 | AYNA |
| İnfrastruktur (3 ay) | 900 | **1 800** | 3 600 | AYNA |
| Ehtiyat (10%) | 6 340 | **9 780** | 14 460 | AYNA |
| **Proqram təminatı və komanda cəmi** | **69 740** | **107 580** | **159 060** | |
| 10 hub-ın fiziki qurulması (kapital) | 170 350 | **322 750** | 566 000 | AYNA/şəhər kapital büdcəsi |

Fiziki hub-lar şəhərin kapital büdcəsindən qurulur və AYAN-ın gəlirinə daxil deyil. Pilotun nəticəsi faktiki səfərlərin proqnozla müqayisəsi və modelin yenidən kalibrlənməsidir. Detallar: [`pilot_budget.csv`](pilot_budget.csv).

## 6. Gəlir proqnozu: 3 il (⚪ ssenari, baza)

| İl | Müştərilər | Gəlir | Əməliyyat xərci | Nəticə |
|---|---|---|---|---|
| 1 | AYNA (9 ay lisenziya + quraşdırma) | 135 000 AZN | 199 200 AZN | −64 200 AZN |
| 2 | AYNA + Gəncə · 1 operator | 299 000 AZN | 254 400 AZN | +44 600 AZN |
| 3 | AYNA + Gəncə + Sumqayıt · 2 operator | 443 000 AZN | 309 600 AZN | +133 400 AZN |

**Fərziyyələr:**
- Lisenziya: bir şəhər üçün 120 000 AZN/il (aşağı 60 000, yuxarı 200 000).
- Yeni şəhərə uyğunlaşdırma: 35 000 AZN.
- Operator analitikası: 24 000 AZN/il.
- Komanda: 16 000 AZN/ay; 2-ci ildə ×1,25, 3-cü ildə ×1,5 artır.
- Baza ssenaridə 2-ci ildən müsbət nəticə gözlənilir.

Aşağı və yuxarı ssenarilər: [`revenue_projection.csv`](revenue_projection.csv).

## 7. Riskləri necə idarə edirik

- **Vahid qiymətlər təxminidir.** Pilotun ilk ayında AYNA-nın real tender qiymətləri ilə əvəz olunur. Model `build_financials.py`-də bir yerdən yenilənir.
- **Avtobus tələbat modeli zəifdir** (56 marşrut, MdAPE ~27%). BakıKart validasiyaları gələndə ölçülmüş data ilə əvəz olunur. Bu, "Data tələbi" panelindədir.
- **Canlı data qeyri-rəsmi endpoint-lərdəndir.** Pilotda rəsmi data mübadiləsinə keçilir. Hər mənbə ayrıca moduldur.
- **Bir müştəriyə asılılıq.** Metodika istənilən şəhərin açıq datası ilə işləyir. Regional şəhərlər və operatorlar ikinci gəlir xəttidir.

## 8. Təqdimat üçün hazır cümlələr

- "AYAN eyni büdcə ilə təsadüfi seçimdən 7,5 dəfə çox yeni səfər verir."
- "20 hub-lıq proqram təxminən yarım milyon manatdır və ~12 300 sakinə ilk dəfə 5 dəqiqəlik çıxış verir: bir sakin üçün ~44 manat (təxmini)."
- "Pilot: 3 ay, 10 hub, proqram təminatı və komanda üçün ~108 min manat (təxmini). Ölçülə bilən nəticə: faktiki səfər proqnozla müqayisə olunur."
- "Model: B2G illik lisenziya. AYNA ilk müştəridir, sonra Gəncə və Sumqayıt."
