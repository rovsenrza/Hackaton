"use client";

import type { StaticData } from "@/lib/data";
import { int, pct } from "@/lib/format";

const SOURCES = [
  ["Cari marşrutlar (184 şəhərdaxili, 81 şəhərlərarası, 114 qatar), rəsmi dayanacaqlar və marşrut ardıcıllığı, mübadilə mərkəzləri", "AYNA xəritə API-si", "18.10.2026"],
  ["Avtovağzallar, avtobus trayektoriyaları, velo-parkinqlər, velo-zolaqlar", "AYNA · opendata.az", "24.09.2026"],
  ["BakuBus gündəlik sərnişin (63 marşrut)", "Dərcçi: Bakı Metropoliteni QSC · opendata.az", "13.10.2026"],
  ["Metro çıxışları və stansiya sərnişinləri", "Bakı Metropoliteni · opendata.az", "13.10.2026"],
  ["Avtobusla gedişlərin rəsmi cəmi (yanvar–avqust 2026: 335,6 mln)", "AYNA, report.az", "09.2026"],
  ["Mikromobillik sifarişləri (sentyabr 2026: 547 758)", "AYNA, report.az", "10.2026"],
  ["Əhali 100 m, 2026", "WorldPop Global2 R2025A", "09.2025"],
  ["Yollar, piyada şəbəkəsi, dayanacaqlar", "OpenStreetMap (Geofabrik)", "16.10.2026"],
  ["Binalar və cazibə nöqtələri", "Overture Maps 2026-09-23.1", "23.09.2026"],
  ["Bakı sərhədi", "geoBoundaries ADM2", "2023"],
  ["CO₂ əmsalları", "DEFRA 2026, Chalmers 2025", "2025–2026"],
];

export default function Methodology({ data }: { data: StaticData }) {
  const M = data.metrics;
  const rm = M.demand.route_model;
  const cal = M.demand.route_calibration;
  const v = M.hubs.validation;
  const qa = M.hubs.placement_qa;
  const conv = M.convert;
  const g = M.walk_graph;

  const steps: [string, string][] = [
    ["Piyada şəbəkəsi", `OSM-dən ${int(g.nodes)} düyünlü qraf, kənarlar 25 m addımla sıxlaşdırılıb. Bütün məsafələr UTM 39N-də metrlə ölçülür; Web Mercator Bakının enində məsafəni ~31% təhrif etdiyi üçün hesablamada istifadə olunmur.`],
    ["Tələbat", "H3 res11 (~25 m) xanalarında üç komponent: nəqliyyat minikləri (metro çıxışları və avtobus dayanacaqları), əhali və cazibə nöqtələri. Hər komponent şəhər üzrə öz payına normallaşdırılır (cəm = 1), beləcə 45 / 35 / 20 çəkiləri tələbatın real tərkibini ifadə edir."],
    ["Özəl marşrutların sərnişini", `${rm.train_n} BakuBus marşrutunda öyrədilmiş log-ridge modeli (leave-one-out median xəta ${pct(rm.cv_leave_one_out.ridge_log.MdAPE)}, baza xətti ${pct(rm.cv_leave_one_out.baseline_median.MdAPE)}). Sonra AYNA-nın rəsmi gündəlik cəminə (${int(cal.official_daily)}) kalibrlənib, əmsal ${String(cal.factor).replace(".", ",")}.`],
    ["Boşluq", "Mövcud parkinqə real piyada məsafəsi: 150 m-ə qədər xidmət olunur, 400 m-dən uzaqda tam boşluqdur. Velo-zolaq 30% çəki ilə daxildir."],
    ["Hub seçimi", "Maksimal əhatə modeli (MCLP, greedy): 400 m piyada zonasında xidmət olunmamış tələbatı maksimallaşdırır, hub-lar arası ≥ 300 m. Namizədlər: metro çıxışları, avtovağzallar, elektrik qatarı stansiyaları, AYNA mübadilə mərkəzləri, ≥ 2 marşrutlu rəsmi dayanacaqlar və mövcud parkinqlər. Mübadilə mərkəzinə 150 m-dən yaxın namizəd “inteqrasiya” kimi işarələnir."],
    ["Yerləşdirmə", `Hub yolun hərəkət hissəsinə düşmür: OSM eni (zolaq × 3,5 m, magistrallarda +3,5 m avtobus/parklanma zolağı) + 2,5–3,5 m təhlükəsizlik. İkiistiqamətli yolun aralıq zolağı, binalar, dəmir yolu və su istisna olunur. Hub səki zolağına (yol kənarından ~5 m, bina cəbhəsinə yaxın), nəqliyyat düyünündən ≤ 60 m piyada məsafəyə qoyulur. AYNA parkinq koordinatı icazəli yerdədirsə saxlanılır. ${int(M.hubs.placement_all?.new ?? 0)} yeni yer tapılıb, ${int(M.hubs.placement_all?.rejected ?? 0)} namizəd rədd edilib.`],
    ["Kalibrləmə və artım", "Səfər proqnozu AYNA-nın real dövriyyəsinə bağlanıb: sentyabr 2026, 547 758 sifariş / 30 gün / 1 495 nöqtə = 12,2 səfər/nöqtə/gün. Hub-un ümumi istifadəsi yer sayını müəyyən edir; əlavə səfər və CO₂ isə yalnız mövcud parkinqlərin xidmət etmədiyi və əvvəlki hub-ların əhatə etmədiyi tələbatdan hesablanır."],
  ];

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[var(--bg)]/92 px-6 pb-12 pt-20 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Metodologiya və data keyfiyyəti</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">Hər rəqəmin haradan gəldiyi və nə qədər etibarlı olduğu.</p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Hesablama addımları</h2>
          <ol className="mt-3 space-y-3">
            {steps.map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[2rem_1fr] gap-2">
                <span className="font-display text-lg font-bold text-[var(--hub)] tabular-nums">{i + 1}</span>
                <div><p className="font-semibold">{t}</p><p className="text-sm leading-relaxed text-[var(--muted)]">{d}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Doğrulama</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">
            <li>
              Tələbat indeksi AYNA-nın seçdiyi {v.demand_auc_vs_ayna_parkings.n_pos} parkinq yerini təsadüfi məskunlaşmış xanalardan <b>AUC {String(v.demand_auc_vs_ayna_parkings.D).replace(".", ",")}</b> ilə ayırır.
              Bunun bir hissəsi “mərkəz effekti”dir: təkcə mərkəzə yaxınlıq {String(v.demand_auc_vs_ayna_parkings["yalnız_mərkəzə_yaxınlıq"]).replace(".", ",")} verir.
              Mərkəzdən 8 km halqası daxilində müqayisə edəndə model <b>{String(v.demand_auc_within_8km.D).replace(".", ",")}</b> verir (təkcə əhali {String(v.demand_auc_within_8km.pop_n).replace(".", ",")}, təkcə mərkəzə yaxınlıq {String(v.demand_auc_within_8km["yalnız_mərkəzə_yaxınlıq"]).replace(".", ",")}).
              Bu, istifadə datası ilə doğrulama deyil: AYNA nöqtə üzrə sifariş datası verərsə, dəqiq test mümkündür.
            </li>
            <li>
              AYNA datasında iki aktiv növü var: MPS ({conv.parkings.after_dedup_5m_same_type_in_baku.MPS}) və MPV ({conv.parkings.after_dedup_5m_same_type_in_baku.MPV}, “yeni velosiped məntəqələri” qovluğu).
              MPV-lərin {pct(v.mpv_vs_mps.share_within_400m)}-i MPS-ə 400 m-dən yaxındır (median {v.mpv_vs_mps.median_m_to_mps} m), təsadüfi sakin üçün bu pay {pct(v.mpv_vs_mps.random_resident_share_within_400m)}-dir: yeni məntəqələr artıq xidmət olunan ərazilərdə toplanır.
            </li>
            {v.official_hub_recall && (
              <li>
                AYNA-nın {v.official_hub_recall.n_official} rəsmi Nəqliyyat Mübadilə Mərkəzi skorinqdə istifadə olunmur. Rəsmi hub namizədləri çıxarılmaqla seçilən top-20 hub onların {Math.round(v.official_hub_recall.by_k["20"].model * v.official_hub_recall.n_official)}-ni 400 m piyada daxilində tapır (təsadüfi seçim: {(v.official_hub_recall.by_k["20"].random * v.official_hub_recall.n_official).toFixed(1).replace(".", ",")}): {v.official_hub_recall.by_k["20"].found.join(", ") || "—"}.
              </li>
            )}
            <li>Stabillik: çəkilər ±30% dəyişdirilərək 500 dəfə hesablanıb. Hər hub kartında top-20-də qalma faizi göstərilir.</li>
            <li>Yerləşdirmə: {qa.placed} hub-dan {qa.placed - qa.needs_review}-i avtomatik yoxlamadan keçib{qa.needs_review ? `, ${qa.needs_review}-i əl ilə yoxlanmalıdır` : ""}; {qa.moved} hub nəqliyyat düyünündən səki zolağına köçürülüb. Minimum aralıq {String(qa.min_spacing_m).replace(".", ",")} m-dir. Top-20 peyk görüntüsü üzərində əl ilə yoxlanılıb.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Açıq datada tapdığımız problemlər</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--muted)]">
            <li>Velo-parkinq faylının qovluq adları («12 iyul», «11 sentyabr») tarix kimi görünür, amma nöqtələr ad prefiksinə görə tam ayrılır (MPS / MPV): bu, tarix deyil, aktiv növüdür.</li>
            <li>Velo-zolaq datasında {String(conv.bike_lanes.total_km).replace(".", ",")} km var, AYNA-nın açıqladığı rəqəm isə 67,5 km-dir.</li>
            <li>OSM-də Bakının inzibati sərhədi natamamdır (164 km²); geoBoundaries sərhədi ({int(conv.baku_area_km2)} km²) istifadə olunub.</li>
            <li>Metro sərnişin faylında stansiya adları ingilis transliterasiyasındadır; çıxış faylında «28 May» Excel tərəfindən tarixə çevrilib.</li>
            <li>OSM-də velo-parkinqlərin cəmi ~10%-i var; AYNA datası bu boşluğu bağlayır.</li>
            <li>Açıq KMZ-də {conv.bus_routes.routes} avtobus marşrutu var; AYNA-nın cari şəbəkəsində isə {M.ayna?.city_bus_routes_baku ?? "—"} şəhərdaxili marşrut. KMZ-dəki {M.ayna?.kmz_routes_not_in_ayna?.length ?? "—"} marşrut cari şəbəkədə yoxdur, ona görə analiz AYNA API-sinin cari şəbəkəsi ilə aparılıb.</li>
            <li>Cari {M.ayna?.city_bus_routes_baku ?? "—"} marşrutdan yalnız {M.demand?.bus_stops?.routes_with_ridership ?? "—"}-nin (BakuBus) sərnişin datası açıqdır.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Mənbələr</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {SOURCES.map(([d, s, t]) => (
                <tr key={d} className="border-t border-[var(--line)]"><td className="py-2 pr-3">{d}</td><td className="pr-3 text-[var(--muted)]">{s}</td><td className="whitespace-nowrap tabular-nums text-[var(--muted)]">{t}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
