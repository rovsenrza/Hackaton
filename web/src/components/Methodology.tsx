"use client";

import type { StaticData } from "@/lib/data";
import { int, pct } from "@/lib/format";

const SOURCES = [
  ["Avtovağzallar, avtobus trayektoriyaları, velo-parkinqlər, velo-zolaqlar", "AYNA · opendata.az", "24.09.2026"],
  ["BakuBus gündəlik sərnişin (63 marşrut)", "Bakı Metropoliteni · opendata.az", "13.10.2026"],
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
    ["Tələbat", "H3 res11 (~25 m) xanalarında: nəqliyyat minikləri 45%, əhali 35%, cazibə nöqtələri 20%. Hər komponent p99-a görə miqyaslanır, beləcə nisbətlər qorunur."],
    ["Özəl marşrutların sərnişini", `${rm.train_n} BakuBus marşrutunda öyrədilmiş log-ridge modeli (leave-one-out median xəta ${pct(rm.cv_leave_one_out.ridge_log.MdAPE)}, baza xətti ${pct(rm.cv_leave_one_out.baseline_median.MdAPE)}). Sonra AYNA-nın rəsmi gündəlik cəminə (${int(cal.official_daily)}) kalibrlənib, əmsal ${String(cal.factor).replace(".", ",")}.`],
    ["Boşluq", "Mövcud parkinqə real piyada məsafəsi: 150 m-ə qədər xidmət olunur, 400 m-dən uzaqda tam boşluqdur. Velo-zolaq 30% çəki ilə daxildir."],
    ["Hub seçimi", "Maksimal əhatə modeli (MCLP, greedy): 400 m piyada zonasında xidmət olunmamış tələbatı maksimallaşdırır, hub-lar arası ≥ 300 m."],
    ["Yerləşdirmə", `Hub yolun hərəkət hissəsinə (yarım-en + 1,5 m), binaya, dəmir yoluna və suya düşmür, nəqliyyat düyünündən ≤ 60 m piyada məsafədədir. ${int(M.hubs.placement_all?.new ?? 0)} yeni yer yoxlanıb, ${int(M.hubs.placement_all?.rejected ?? 0)} namizəd rədd edilib.`],
    ["Kalibrləmə", "Gözlənilən səfər AYNA-nın real dövriyyəsinə bağlanıb: mövcud parkinqlər üçün model orta 12,2 səfər/nöqtə/gün verir."],
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
            <li>Tələbat indeksi AYNA-nın seçdiyi {v.positives} parkinq yerini {int(v.negatives)} təsadüfi məskunlaşmış xanadan <b>AUC {String(v.demand_auc_vs_ayna_parkings.D).replace(".", ",")}</b> ilə ayırır. Model AYNA mütəxəssislərinin məntiqini tanıyır.</li>
            <li>AYNA-nın sentyabrda qurduğu {v.sep_expansion.n} yeni parkinqin {pct(v.sep_expansion.share_within_400m_of_existing)}-i mövcud parkinqə 400 m-dən yaxındır (median {v.sep_expansion.median_m_to_existing} m). Şəbəkə sıxlaşır, boşluqlar isə açıq qalır. AYAN məhz bu boşluqları hədəfləyir.</li>
            <li>Stabillik: çəkilər ±30% dəyişdirilərək 500 dəfə hesablanıb. Hər hub kartında top-20-də qalma faizi göstərilir.</li>
            <li>Yerləşdirmə: {qa.placed} hub-un hamısı avtomatik yoxlamadan keçib, minimum aralıq {String(qa.min_spacing_m).replace(".", ",")} m-dir.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Açıq datada tapdığımız problemlər</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--muted)]">
            <li>Velo-parkinq faylında "yeni" adlanan {conv.parkings.raw.sep} nöqtədən {conv.parkings.raw.sep - conv.parkings.after_dedup_5m_in_baku.sep}-i köhnə məntəqələrin 5 m daxilində dublikatdır.</li>
            <li>Velo-zolaq datasında {String(conv.bike_lanes.total_km).replace(".", ",")} km var, AYNA-nın açıqladığı rəqəm isə 67,5 km-dir.</li>
            <li>OSM-də Bakının inzibati sərhədi natamamdır (164 km²); geoBoundaries sərhədi ({int(conv.baku_area_km2)} km²) istifadə olunub.</li>
            <li>Metro sərnişin faylında stansiya adları ingilis transliterasiyasındadır; çıxış faylında "28 May" Excel tərəfindən tarixə çevrilib.</li>
            <li>OSM-də velo-parkinqlərin cəmi ~10%-i var; AYNA datası bu boşluğu bağlayır.</li>
            <li>{conv.bus_routes.routes} avtobus marşrutundan yalnız {conv.bus_routes.with_ridership}-nin sərnişin datası açıqdır.</li>
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
