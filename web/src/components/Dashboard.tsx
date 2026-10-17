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

function Kpi({ v, label, src }: { v: string; label: string; src: string }) {
  return (
    <div className="border-l-2 border-[var(--line)] pl-3">
      <p className="font-display text-3xl font-bold tabular-nums leading-none">{v}</p>
      <p className="mt-1.5 text-sm leading-snug">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">{src}</p>
    </div>
  );
}

export default function Dashboard({ data }: { data: StaticData }) {
  const { statuses, engineOnline, optimized, nHubs, set } = useStore();
  const m = data.metrics.hubs;
  const hubs = optimized ?? data.hubs.hubs;
  const [shift, setShift] = useState(0.2);
  const n = Math.min(nHubs, hubs.length);

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
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[var(--bg)]/92 px-6 pb-10 pt-20 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Rəhbərlik paneli</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">
          Bakının son kilometr vəziyyəti və hub proqramının gözlənilən təsiri{optimized ? " (sizin ssenari)" : ""}. Rəqəmlər real piyada şəbəkəsi ilə hesablanıb, faydalar yalnız əlavə (artım) kimi sayılır.
        </p>

        <section className="mt-8 grid gap-6 md:grid-cols-4">
          <Kpi v={pct(m.city.pop_without_parking_share)} label={`sakinin (${approx(m.city.pop_without_parking_400m)}) 5 dəqiqəlik piyada məsafəsində parkinqi yoxdur`} src="Analiz zonası · WorldPop 2026 + AYNA parkinqləri" />
          <Kpi v={`${m.city.metro_exits_without_parking_400m}/${m.city.metro_exits_total}`} label="metro çıxışının yanında velo/scooter parkinqi yoxdur" src="Bakı Metropoliteni + AYNA" />
          <Kpi v={pct(m.validation.mpv_vs_mps.share_within_400m)} label={`MPV məntəqələri artıq MPS olan yerlərdədir (təsadüfi sakin üçün ${pct(m.validation.mpv_vs_mps.random_resident_share_within_400m)})`} src="AYNA parkinq datası, 400 m" />
          <Kpi v={pct(m.mclp.share_closed["20"])} label="xidmətsiz tələbat ilk 20 hub ilə bağlanır" src="MCLP, nəqliyyat 45% · əhali 35% · cazibə 20%" />
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-lg font-semibold">Fayda əyrisi</h2>
            <p className="text-sm text-[var(--muted)]">Xidmətsiz tələbatın bağlanan payı, hub-lar MCLP ardıcıllığı ilə qurulduqca</p>
            <div className="mt-3 h-64">
              <ResponsiveContainer>
                <AreaChart data={curve} margin={{ left: 8, right: 8, top: 8 }}>
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

          <div className="rounded-md bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]">
            <h2 className="text-lg font-semibold">Proqram ssenarisi</h2>
            <label className="mt-3 block text-sm">
              <span className="flex justify-between"><span>Qurulacaq hub sayı</span><span className="tabular-nums">{n}</span></span>
              <input type="range" min={5} max={hubs.length} value={n} onChange={(e) => set({ nHubs: Number(e.target.value) })} className="w-full accent-[var(--hub)]" />
            </label>
            <label className="mt-2 block text-sm">
              <span className="flex justify-between"><span>Avtomobil/taksi səfərini əvəz etmə payı</span><span className="tabular-nums">{pct(shift)}</span></span>
              <input type="range" min={0.05} max={0.4} step={0.05} value={shift} onChange={(e) => setShift(Number(e.target.value))} className="w-full accent-[var(--hub)]" />
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

        <section className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Avtovağzallar: gəliş balı</h2>
            <p className="text-sm text-[var(--muted)]">Şəhərə gələn sərnişin son kilometri nə ilə qət edə bilər (0–5)</p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="py-1.5 font-normal">Avtovağzal</th><th className="font-normal">Bal</th><th className="font-normal">Metro</th><th className="font-normal">Marşrut</th><th className="font-normal">Şəhərlərarası</th><th className="font-normal">Parkinq</th></tr></thead>
              <tbody>
                {data.hubs.arrival.map((a) => (
                  <tr key={a.id} className="border-t border-[var(--line)]">
                    <td className="py-2 pr-2">{a.name}</td>
                    <td className="font-display text-lg font-bold tabular-nums">{String(a.score).replace(".", ",")}</td>
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
            <h2 className="text-lg font-semibold">Təsdiq axını</h2>
            <p className="text-sm text-[var(--muted)]">{engineOnline ? "Statuslar Geo Engine bazasında saxlanılır" : "Geo Engine qoşulduqda statuslar görünəcək"}</p>
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {["Təklif", "Təsdiq gözləyir", "Təsdiqləndi", "Rədd edildi"].map((k) => (
                <li key={k} className="rounded-md bg-[var(--surface)] p-3 ring-1 ring-[var(--line)]">
                  <p className="font-display text-2xl font-bold tabular-nums">{counts[k] ?? 0}</p>
                  <p className="text-sm text-[var(--muted)]">{k}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              {engineOnline && !optimized ? (
                <a href={`${ENGINE}/hubs/export.geojson`} download className="rounded border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--surface2)]">Hub-ları GeoJSON kimi yüklə</a>
              ) : (
                <button onClick={exportGeoJSON} className="rounded border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--surface2)]">Hub-ları GeoJSON kimi yüklə</button>
              )}
              <button onClick={() => set({ panel: "map" })} className="rounded border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--surface2)]">Xəritəyə qayıt</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
