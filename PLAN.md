
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

**Plandan fərqlər (mənim qərarlarım):**
- Bakı sərhədi OSM əvəzinə geoBoundaries-dən götürüldü, çünki OSM sərhədi natamamdır (164 km²).
- Zaman testi (iyul → sentyabr) doğrulama kimi işləmədi: AYNA sentyabrda boşluqları bağlamır, şəbəkəni sıxlaşdırır (97% < 400 m). Əvəzində tələbat indeksi AYNA-nın seçdiyi yerlərlə AUC üzrə doğrulandı (0.946). Sıxlaşdırma faktı isə əsas tapıntı kimi istifadə olunur.
- 176 özəl marşrutun proqnozu AYNA-nın rəsmi gündəlik cəminə kalibrləndi (1.38 mln/gün, əmsal 0.602).
- Tələbat normallaşdırması sıra əsaslı faiz yox, p99 miqyaslamadır, çünki bu nisbətləri qoruyur.
- İstilik xəritəsinin default göstəricisi "xidmət olunmamış tələbat"dır, siniflər isə isti nöqtə kvantilləridir (50/70/85/95%).
- shadcn/ui istifadə olunmadı, komponentlər Tailwind ilə yazıldı (sürət üçün).
- MapLibre v6 əvəzinə v5 seçildi, çünki v6-nın worker-i Next.js webpack-də yüklənmir.
