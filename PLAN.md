
---

## 11. İcra vəziyyəti (18.10.2026, 01:53)

| Hissə | Vəziyyət |
|---|---|
| Pipeline (01–06) | ✅ Uçdan-uca işləyir, 8 dəqiqlik testi keçir |
| Geo Engine (FastAPI) | ✅ `/evaluate` ~130–250 ms, `/optimize` ~20 ms, təsdiq axını (SQLite) |
| Web (Next.js) | ✅ 2D/3D, what-if, ssenari, tikinti ardıcıllığı, rəhbərlik paneli, metodologiya |
| Deploy | ⬜ Vercel və Railway hesabları lazımdır |
| Offline PMTiles | ⬜ P1 |
| Pitch | ⬜ Sona saxlanılıb |

**Plandan fərqlər (qəbul olunmuş qərarlar):**
- Bakı sərhədi OSM əvəzinə geoBoundaries-dən götürüldü, çünki OSM sərhədi natamamdır (164 km²).
- Zaman testi (iyul → sentyabr) doğrulama kimi işləmədi: AYNA sentyabrda boşluqları bağlamır, şəbəkəni sıxlaşdırır (97% < 400 m). Əvəzində tələbat indeksi AYNA-nın seçdiyi yerlərlə AUC üzrə doğrulandı (0.946). Sıxlaşdırma faktı isə əsas tapıntı kimi istifadə olunur.
- 176 özəl marşrutun proqnozu AYNA-nın rəsmi gündəlik cəminə kalibrləndi (1.38 mln/gün, əmsal 0.602).
- Tələbat normallaşdırması sıra əsaslı faiz yox, p99 miqyaslamadır, çünki bu nisbətləri qoruyur.
- İstilik xəritəsinin default göstəricisi "xidmət olunmamış tələbat"dır, siniflər isə isti nöqtə kvantilləridir (50/70/85/95%).
- shadcn/ui istifadə olunmadı, komponentlər Tailwind ilə yazıldı (sürət üçün).
- MapLibre v6 əvəzinə v5 seçildi, çünki v6-nın worker-i Next.js webpack-də yüklənmir.

### 11.1 Müstəqil rəy (münsif gözü ilə) və düzəlişlər

| # | Tapıntı | Düzəliş |
|---|---|---|
| 1 | Tələbat indeksinin ~99%-i əhali idi: p99 miqyaslaması seyrək nəqliyyat nöqtələrini sıfıra endirirdi | Hər komponent şəhər üzrə öz payına normallaşdırılır (cəm = 1). İndi tərkib dəqiq 45/35/20-dir və top hub-lar metro və avtovağzal keçid nöqtələridir |
| 2 | Eyni ekranda iki səfər modeli (~60× fərq) | Hub faydaları vahid K×D modeli ilə hesablanır. Şəhər potensialı "yuxarı hədd ekstrapolyasiyası" kimi ayrıca işarələnir |
| 3 | "Hub-a çevrilmə" səfərləri artım deyildi | Əlavə səfər = K × Σ(D × boşluq), yalnız əvvəlki hub-ların əhatə etmədiyi xanalar. Ümumi istifadə yalnız yer sayı üçündür |
| 4 | "Xidmətsiz sakin" iki tərifi qarışırdı | "Yeni xidmət alan sakin" sərt tərifə əsaslanır: 400 m-də parkinq yox idi və artım kimi sayılır |
| 5 | Dürüst əhatə əyrisi gizli idi | Fayda əyrisi indi "xidmətsiz tələbatın bağlanan payı"nı göstərir (20 hub ≈ 13–15%) |
| 6 | AYNA koordinatları yoxlanmadan "köçürüldü" qeyd olunurdu | Koordinat icazəli yerdədirsə saxlanılır, QA mətni real yoxlamadan yazılır |
| 7 | Ən yaxın tək düyünə bağlanma 2 m sürüşmədə sıçrayış yaradırdı | 40 m daxilində 3 ən yaxın düyünə çoxmənbəli bağlanma |
| 8 | Yer sayı həmişə minimumda idi | Tip həddi namizədlərin 75-ci faizinə, yer sayı isə ümumi istifadənin paylanmasına görə təyin olunur |
| 9 | AUC 0.946 əsasən "mərkəz effekti" idi | Baza xətləri əlavə olundu: tam şəhər 0.951 (mərkəzə yaxınlıq 0.922), 8 km halqada 0.832 (əhali 0.784, mərkəzə yaxınlıq 0.767) |
| 10 | "İyul/sentyabr" əslində MPS/MPV aktiv növüdür | Növ kimi işlənir, növlər arası dublikat silinmir. MPV-lərin 97.8%-i MPS-in 400 m-liyindədir (təsadüfi sakin üçün 39%) |
| 11 | Engine düşəndə UI xətaları tutulmurdu | `api()` köməkçisi, `EngineOffline`, hər 15 s sağlamlıq yoxlaması, uuid ID-lər, toxum sinxronlaşdırması (statuslar qorunur) |
| 12 | Panel optimallaşdırılmış ssenarini nəzərə almırdı | Panel `optimized ?? static` göstərir, hub sayı ortaqdır |
| 13 | Gəliş balı avtovağzalın mərkəz nöqtəsindən ölçülürdü | Bina konturundan ölçülür (Beynəlxalq → metro 320 m), marşrut həddi 20-dir, `metro_no_park` xətası düzəldilib |
| 14–15 | Yanlış etiketlər, offline sil və eksport, 3D taymer | Düzəldilib |

**Peyk QA ilə yerləşdirmə düzəlişləri:**
- Bakı prospektləri üçün enlər artırıldı, magistrallara avtobus/parklanma zolağı əlavə olundu (+3.5 m).
- Səki zolağı hədəflənir (yol kənarından ~5 m) və bina cəbhəsinə üstünlük verilir.
- İkiistiqamətli magistralların aralıq zolağı (median) istisna edilir.
- 0.5 m yuvarlaqlaşdırma marjası qoyulub.
