"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ENGINE, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { approx, int, pct, tons } from "@/lib/format";
import { C } from "@/lib/theme";

// CO₂ modeli (PLAN.md 4.11): səfər × əvəzetmə payı × 2,14 km × (avtomobil − yeni növ) × 365
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
  const { statuses, engineOnline, set } = useStore();
  const m = data.metrics.hubs;
  const hubs = data.hubs.hubs;
  const [n, setN] = useState(20);
  const [shift, setShift] = useState(0.2);

  const curve = useMemo(() => {
    let acc = 0;
    return hubs.map((h) => {
      acc += h.pop_unserved_covered;
      return { n: h.rank, pop: Math.round(acc) };
    });
  }, [hubs]);

  const sel = hubs.slice(0, n);
  const trips = sel.reduce((a, h) => a + h.trips_day, 0);
  const pop = sel.reduce((a, h) => a + h.pop_unserved_covered, 0);
  const docks = sel.reduce((a, h) => a + h.docks, 0);
  const co2 = (trips * shift * KM * (EF_CAR - EF_NEW) * 365) / 1000;
  const counts = Object.values(statuses).reduce<Record<string, number>>((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {});

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[var(--bg)]/92 px-6 pb-10 pt-20 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Rəhbərlik paneli</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">
          Bakının son kilometr vəziyyəti və hub proqramının gözlənilən təsiri. Rəqəmlər real piyada şəbəkəsi ilə hesablanıb və etibarlılığa uyğun yuvarlaqlaşdırılıb.
        </p>

        <section className="mt-8 grid gap-6 md:grid-cols-4">
          <Kpi v={pct(m.city.pop_without_parking_share)} label={`sakin (${approx(m.city.pop_without_parking_400m)}) 5 dəqiqəlik piyada məsafəsində parkinqsizdir`} src="WorldPop 2026 + AYNA parkinqləri" />
          <Kpi v={`${m.city.metro_exits_without_parking_400m}/${m.city.metro_exits_total}`} label="metro çıxışının yanında velo/scooter parkinqi yoxdur" src="Bakı Metropoliteni + AYNA" />
          <Kpi v={pct(m.validation.sep_expansion.share_within_400m_of_existing)} label="sentyabrda qurulan yeni parkinqlər mövcud parkinqlərin 400 m-liyindədir" src="AYNA, 124 yeni məntəqə" />
          <Kpi v={`${approx(m.city.gap_potential_trips_day)}`} label="əlavə gündəlik səfər, əgər boşluq bağlansa" src="AYNA səfər intensivliyi: 22 səfər / 1000 sakin" />
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-lg font-semibold">Fayda əyrisi</h2>
            <p className="text-sm text-[var(--muted)]">Hər yeni hub neçə xidmət almayan sakinə çıxış verir (MCLP ardıcıllığı ilə)</p>
            <div className="mt-3 h-64">
              <ResponsiveContainer>
                <AreaChart data={curve} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="n" stroke={C.muted} fontSize={11} tickLine={false} label={{ value: "hub sayı", position: "insideBottomRight", offset: -2, fill: C.muted, fontSize: 11 }} />
                  <YAxis stroke={C.muted} fontSize={11} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)} min` : v)} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.line}`, color: C.text }} formatter={(v) => [approx(Number(v)), "sakin"]} labelFormatter={(l) => `${l} hub`} />
                  <Area type="monotone" dataKey="pop" stroke={C.hub} fill={C.hub} fillOpacity={0.18} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-md bg-[var(--surface)] p-5 ring-1 ring-[var(--line)]">
            <h2 className="text-lg font-semibold">Proqram ssenarisi</h2>
            <label className="mt-3 block text-sm">
              <span className="flex justify-between"><span>Qurulacaq hub sayı</span><span className="tabular-nums">{n}</span></span>
              <input type="range" min={5} max={50} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-full accent-[var(--hub)]" />
            </label>
            <label className="mt-2 block text-sm">
              <span className="flex justify-between"><span>Avtomobil/taksi səfərini əvəz etmə payı</span><span className="tabular-nums">{pct(shift)}</span></span>
              <input type="range" min={0.05} max={0.4} step={0.05} value={shift} onChange={(e) => setShift(Number(e.target.value))} className="w-full accent-[var(--hub)]" />
            </label>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div><dt className="text-xs text-[var(--muted)]">Xidmət alan yeni sakin</dt><dd className="font-display text-2xl font-bold tabular-nums">{approx(pop)}</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">Velo/scooter yeri</dt><dd className="font-display text-2xl font-bold tabular-nums">{int(docks)}</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">Gözlənilən səfər</dt><dd className="font-display text-2xl font-bold tabular-nums">{approx(trips)}/gün</dd></div>
              <div><dt className="text-xs text-[var(--muted)]">CO₂ qənaəti</dt><dd className="font-display text-2xl font-bold tabular-nums">{tons(co2)} t/il</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-snug text-[var(--muted)]">
              Səfər proqnozu AYNA-nın real dövriyyəsi ilə kalibrlənib (12,2 səfər/nöqtə/gün), buna görə ehtiyatlıdır. CO₂: 2,14 km orta səfər (AYNA, yanvar–iyul 2026), avtomobil 0,173 kq/km (DEFRA 2026), paylaşımlı scooter 60 q/km (Chalmers 2025).
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Avtovağzallar: gəliş balı</h2>
            <p className="text-sm text-[var(--muted)]">Şəhərə gələn sərnişin son kilometri nə ilə qət edə bilər (0–5)</p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]"><tr><th className="py-1.5 font-normal">Avtovağzal</th><th className="font-normal">Bal</th><th className="font-normal">Metro</th><th className="font-normal">Marşrut</th><th className="font-normal">Parkinq</th></tr></thead>
              <tbody>
                {data.hubs.arrival.map((a) => (
                  <tr key={a.id} className="border-t border-[var(--line)]">
                    <td className="py-2 pr-2">{a.name}</td>
                    <td className="font-display text-lg font-bold tabular-nums">{String(a.score).replace(".", ",")}</td>
                    <td className="tabular-nums">{a.metro_walk_m ? `${a.metro_walk_m} m` : "yox"}</td>
                    <td className="tabular-nums">{a.bus_routes_400}</td>
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
              <a href={engineOnline ? `${ENGINE}/hubs/export.geojson` : "/data/hubs.json"} download className="rounded border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--surface2)]">
                Hub-ları GeoJSON kimi yüklə
              </a>
              <button onClick={() => set({ panel: "map" })} className="rounded border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--surface2)]">Xəritəyə qayıt</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
