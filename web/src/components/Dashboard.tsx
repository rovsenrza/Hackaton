"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ENGINE, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { approx, int, pct, tons } from "@/lib/format";
import { C } from "@/lib/theme";

// CO₂ modeli (PLAN.md 4.11): əlavə səfər × əvəzetmə payı × 2,14 km × (avtomobil − yeni növ) × 365
const KM = 4.918839e6 / 2.297405e6;
const EF_CAR = 0.173;
const EF_NEW = 0.7 * 0.06;

// Eyni büdcə müqayisəsi (09_value_tests): təsadüfi seçim üçün orta dəyər götürülür
type Alt = Record<string, number | { mean: number }>;
const ALTS: [string, string][] = [
  ["model_mclp", "AYAN (MCLP)"],
  ["yüksək_tələbat_boşluqsuz", "Ən yüksək tələbat (boşluğa baxmadan)"],
  ["mərkəzə_ən_yaxın", "Mərkəzə ən yaxın"],
  ["təsadüfi", "Təsadüfi seçim (orta)"],
];
const val = (a: Alt | undefined, k: string) => {
  const v = a?.[k];
  return typeof v === "number" ? v : (v?.mean ?? 0);
};
const times = (a: number, b: number) => (b > 0 ? `×${(a / b).toFixed(a / b >= 10 ? 0 : 1).replace(".", ",")}` : "—");

/** Validator lövhəsinin bir hücrəsi: tikişlə ayrılmış, mürəkkəb fonda böyük tabular rəqəm */
function Kpi({ v, label, src }: { v: string; label: string; src: string }) {
  return (
    <div className="border-t border-white/10 px-5 py-4 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0">
      <p className="ayan-lcd text-[2.4rem]">{v}</p>
      <p className="mt-2 text-[13.5px] leading-snug text-[var(--ink-text)]">{label}</p>
      <p className="mt-1 text-[11.5px] text-[var(--ink-muted)]">{src}</p>
    </div>
  );
}

export default function Dashboard({ data }: { data: StaticData }) {
  const { statuses, engineOnline, optimized, nHubs, set } = useStore();
  const m = data.metrics.hubs;
  const hubs = optimized ?? data.hubs.hubs;
  const [shift, setShift] = useState(0.2);
  const [budget, setBudget] = useState("10");
  const n = Math.min(nHubs, hubs.length);
  const eq: Record<string, Record<string, Alt>> = data.metrics.value?.equal_budget ?? {};
  const eqRow = eq[budget];
  const modelTrips = val(eqRow?.model_mclp, "trips_day_new");
  // bütün sətirlər bir sabit miqyasda: ən böyük dəyər = tam en
  const eqMax = Math.max(1, ...ALTS.map(([k]) => val(eqRow?.[k], "trips_day_new")));

  const curve = useMemo(() => {
    let closed = 0;
    let pop = 0;
    return hubs.map((h) => {
      closed += h.gain_share;
      pop += h.pop_newly_served;
      return { n: h.rank, closed: Math.round(closed * 1000) / 10, pop: Math.round(pop) };
    });
  }, [hubs]);

  const sel = hubs.slice(0, n);
  const trips = sel.reduce((a, h) => a + h.trips_day, 0);
  const pop = sel.reduce((a, h) => a + h.pop_newly_served, 0);
  const docks = sel.reduce((a, h) => a + h.docks, 0);
  const co2 = (trips * shift * KM * (EF_CAR - EF_NEW) * 365) / 1000;
  const closed = curve[n - 1]?.closed ?? 0;
  const counts = Object.values(statuses).reduce<Record<string, number>>((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {});

  const exportGeoJSON = () => {
    const fc = {
      type: "FeatureCollection",
      features: hubs.map((h) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [h.lon, h.lat] },
        properties: { rank: h.rank, id: h.id, label: h.label, action: h.action, type: h.type, docks: h.docks,
          status: statuses[h.id] ?? "Təklif", pop_newly_served: h.pop_newly_served, trips_day: h.trips_day },
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(fc)], { type: "application/geo+json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ayan_hubs.geojson";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[var(--bg)] px-6 pb-10 pt-20">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[2rem] font-extrabold tracking-tight">Rəhbərlik paneli</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-[var(--muted)]">
          Bakının son kilometr vəziyyəti və hub proqramının gözlənilən təsiri{optimized ? " (sizin ssenari)" : ""}. Rəqəmlər real piyada şəbəkəsi ilə hesablanıb, faydalar yalnız əlavə (artım) kimi sayılır.
        </p>

        <section className="ayan-screen mt-7 grid overflow-hidden md:grid-cols-4">
          <Kpi v={pct(m.city.pop_without_parking_share)} label={`sakinin (${approx(m.city.pop_without_parking_400m)}) 5 dəqiqəlik piyada məsafəsində parkinqi yoxdur`} src="Analiz zonası · WorldPop 2026 + AYNA parkinqləri" />
          <Kpi v={`${m.city.metro_exits_without_parking_400m}/${m.city.metro_exits_total}`} label="metro çıxışının yanında velo/scooter parkinqi yoxdur" src="Bakı Metropoliteni + AYNA" />
          <Kpi v={pct(m.validation.mpv_vs_mps.share_within_400m)} label={`MPV məntəqələri artıq MPS olan yerlərdədir (təsadüfi sakin üçün ${pct(m.validation.mpv_vs_mps.random_resident_share_within_400m)})`} src="AYNA parkinq datası, 400 m" />
          <Kpi v={pct(m.mclp.share_closed["20"])} label="xidmətsiz tələbat ilk 20 hub ilə bağlanır" src="MCLP, nəqliyyat 45% · əhali 35% · cazibə 20%" />
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-[18px] font-bold tracking-tight">Fayda əyrisi</h2>
            <p className="text-sm text-[var(--muted)]">Xidmətsiz tələbatın bağlanan payı, hub-lar MCLP ardıcıllığı ilə qurulduqca</p>
            <div className="mt-3 h-64">
              <ResponsiveContainer>
                <AreaChart data={curve} margin={{ left: 8, right: 8, top: 8, bottom: 14 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="n" stroke={C.muted} fontSize={11} tickLine={false} label={{ value: "hub sayı", position: "insideBottomRight", offset: -2, fill: C.muted, fontSize: 11 }} />
                  <YAxis stroke={C.muted} fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.line}`, color: C.text }}
                    formatter={(v) => [`${String(v).replace(".", ",")}%`, "bağlanan pay"]}
                    labelFormatter={(l) => `${l} hub`} />
                  <Area type="monotone" dataKey="closed" stroke={C.hub} fill={C.hub} fillOpacity={0.18} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Azalan qazanc gözləniləndir: ilk hub-lar ən böyük xidmətsiz keçid nöqtələrini (metro, avtovağzal) bağlayır. Xidmətsiz əhali 2 100 km²-ə səpələnib, ona görə tam bağlanma yüzlərlə nöqtə tələb edir.
            </p>
          </div>

          <div className="ayan-card p-5">
            <h2 className="text-[18px] font-bold tracking-tight">Proqram ssenarisi</h2>
            <label className="mt-3 block text-sm">
              <span className="flex justify-between font-medium"><span>Qurulacaq hub sayı</span><span className="font-bold tabular-nums text-[var(--cobalt)]">{n}</span></span>
              <input type="range" min={5} max={hubs.length} value={n} onChange={(e) => set({ nHubs: Number(e.target.value) })} className="w-full" />
            </label>
            <label className="mt-2 block text-sm">
              <span className="flex justify-between font-medium"><span>Avtomobil/taksi səfərini əvəz etmə payı</span><span className="font-bold tabular-nums text-[var(--cobalt)]">{pct(shift)}</span></span>
              <input type="range" min={0.05} max={0.4} step={0.05} value={shift} onChange={(e) => setShift(Number(e.target.value))} className="w-full" />
            </label>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div><dt className="text-xs text-[var(--muted)]">Xidmətsiz tələbatın bağlanan payı</dt><dd className="font-display text-2xl font-bold tabular-nums">{String(closed).replace(".", ",")}%</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">İlk dəfə xidmət alan sakin</dt><dd className="font-display text-2xl font-bold tabular-nums">{approx(pop)}</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">Əlavə səfər</dt><dd className="font-display text-2xl font-bold tabular-nums">{approx(trips)}/gün</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">CO₂ qənaəti</dt><dd className="font-display text-2xl font-bold tabular-nums">{tons(co2)} t/il</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">Velo/scooter yeri</dt><dd className="font-display text-2xl font-bold tabular-nums">{int(docks)}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-snug text-[var(--muted)]">
              Əlavə səfər: yalnız mövcud parkinqlərin xidmət etmədiyi tələbat, AYNA-nın orta nöqtə dövriyyəsi ilə (12,2 səfər/gün) kalibrlənib. CO₂: 2,14 km orta səfər (AYNA, yanvar–iyul 2026), avtomobil 0,173 kq/km (DEFRA 2026), paylaşımlı scooter 60 q/km (Chalmers 2025).
              Boşluq tam bağlansa, yuxarı hədd {approx(m.city.gap_potential_upper_bound_trips_day)} səfər/gün və ~{int(m.city.gap_potential_upper_bound_co2_t_year.base)} t CO₂/il olardı.
            </p>
          </div>
        </section>

        {eqRow && (
          <section className="ayan-card mt-10 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold tracking-tight">Eyni büdcə, fərqli seçim</h2>
                <p className="text-sm text-[var(--muted)]">Eyni sayda hub qurulsa, yeri necə seçmək nəticəni dəyişir. Fayda yalnız artım kimi sayılır</p>
              </div>
              <div className="ayan-seg flex" role="group" aria-label="Büdcə">
                {Object.keys(eq).map((k) => (
                  <button key={k} onClick={() => setBudget(k)} aria-pressed={k === budget}
                    className={`px-3 py-1 text-sm font-semibold tabular-nums ${k === budget ? "" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
                    {k} hub
                  </button>
                ))}
              </div>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr><th className="py-1.5 font-semibold">Seçim qaydası</th><th className="w-[34%] font-semibold">Əlavə səfər/gün (bir miqyasda)</th><th className="font-semibold">AYAN üstünlüyü</th><th className="font-semibold">İlk dəfə xidmət alan sakin</th><th className="font-semibold">CO₂, t/il</th></tr>
              </thead>
              <tbody>
                {ALTS.filter(([k]) => eqRow[k]).map(([k, label]) => {
                  const t = val(eqRow[k], "trips_day_new");
                  const me = k === "model_mclp";
                  return (
                    <tr key={k} className={`border-t border-[var(--line)] ${me ? "bg-[var(--cobalt-tint)]" : ""}`}>
                      <td className={`py-2.5 pl-2 pr-2 font-semibold ${me ? "text-[var(--cobalt)]" : ""}`}>{label}</td>
                      <td className="pr-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-3 rounded-[3px]" style={{ width: `${Math.max(1.5, (t / eqMax) * 100) * 0.7}%`, background: me ? C.cobalt : "#AEB9C6" }} />
                          <span className={`text-[17px] font-extrabold tabular-nums ${me ? "text-[var(--cobalt)]" : ""}`}>{approx(t)}</span>
                        </div>
                      </td>
                      <td className={`font-bold tabular-nums ${me ? "text-[var(--muted)]" : "text-[var(--cobalt)]"}`}>{me ? "—" : times(modelTrips, t)}</td>
                      <td className="tabular-nums">{approx(val(eqRow[k], "pop_newly_served"))}</td>
                      <td className="tabular-nums">{tons(val(eqRow[k], "co2_t_year_base"))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Mənbə: 09_value_tests, eyni piyada şəbəkəsi və eyni K×D səfər modeli. Təsadüfi seçim nəqliyyat düyünləri arasından 200 dəfə təkrarlanıb. Dəyər “harada qurmamalı”nı göstərib büdcəni xidmətsiz tələbata yönəltməkdədir.
            </p>
          </section>
        )}

        <section className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-[18px] font-bold tracking-tight">Avtovağzallar: gəliş balı</h2>
            <p className="text-sm text-[var(--muted)]">Şəhərə gələn sərnişin son kilometri nə ilə qət edə bilər (0–5)</p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="py-1.5 font-semibold">Avtovağzal</th><th className="font-semibold">Bal</th><th className="font-semibold">Metro</th><th className="font-semibold">Marşrut</th><th className="font-semibold">Şəhərlərarası</th><th className="font-semibold">Parkinq</th></tr></thead>
              <tbody>
                {data.hubs.arrival.map((a) => (
                  <tr key={a.id} className="border-t border-[var(--line)]">
                    <td className="py-2.5 pr-2 font-medium">{a.name}</td>
                    <td><span className="inline-flex items-center gap-1.5 text-[17px] font-extrabold tabular-nums"><span className={`ayan-led ${a.score >= 2.5 ? "text-[#8E9AA8]" : "text-[var(--deny)]"}`} />{String(a.score).replace(".", ",")}</span></td>
                    <td className="tabular-nums">{a.metro_walk_m ? `${a.metro_walk_m} m` : "> 1,5 km"}</td>
                    <td className="tabular-nums">{a.bus_routes_400}</td>
                    <td className="tabular-nums">{a.intercity_routes ?? 0}</td>
                    <td className="tabular-nums">{a.parking_walk_m ? `${a.parking_walk_m} m` : "> 1,5 km"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="text-[18px] font-bold tracking-tight">Təsdiq axını</h2>
            <p className="text-sm text-[var(--muted)]">{engineOnline ? "Statuslar Geo Engine bazasında saxlanılır" : "Geo Engine qoşulduqda statuslar görünəcək"}</p>
            <ul className="ayan-card mt-3 grid grid-cols-2 overflow-hidden p-0 sm:grid-cols-4">
              {(["Təklif", "Təsdiq gözləyir", "Təsdiqləndi", "Rədd edildi"] as const).map((k, i) => (
                <li key={k} className={`p-4 ${i ? "border-l border-[var(--line)]" : ""}`}>
                  <p className="flex items-center gap-2 text-[1.7rem] font-extrabold tabular-nums leading-none">
                    <span className={`ayan-led ${{ "Təklif": "text-[var(--cobalt)]", "Təsdiq gözləyir": "text-[#8E9AA8]", "Təsdiqləndi": "text-[var(--ok)]", "Rədd edildi": "text-[var(--deny)]" }[k]}`} />
                    {counts[k] ?? 0}
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium text-[var(--muted)]">{k}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              {engineOnline && !optimized ? (
                <a href={`${ENGINE}/hubs/export.geojson`} download className="rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface2)]">Hub-ları GeoJSON kimi yüklə</a>
              ) : (
                <button onClick={exportGeoJSON} className="rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface2)]">Hub-ları GeoJSON kimi yüklə</button>
              )}
              <button onClick={() => set({ panel: "map" })} className="rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface2)]">Xəritəyə qayıt</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
