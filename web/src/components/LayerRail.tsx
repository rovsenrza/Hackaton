"use client";

import { useMemo, useState } from "react";
import { EngineOffline, post, type StaticData } from "@/lib/data";
import { useStore, type LayerKey } from "@/lib/store";
import { C, GAP_STOPS, actionStyle } from "@/lib/theme";
import { int } from "@/lib/format";
import type { CellMetric, Hub } from "@/lib/types";
import { FIXED_BREAKS, quantileBreaks } from "./MapView";
import { SYMBOL_URL, hubRingUrl, type SymbolId } from "./map/symbols";

const METRICS: { id: CellMetric; label: string; unit: string }[] = [
  { id: "w", label: "Xidmət olunmamış tələbat", unit: "tələbat × boşluq, xana cəmi" },
  { id: "gap", label: "Son kilometr boşluğu", unit: "əhali ilə çəkilmiş, 0–1, sabit siniflər" },
  { id: "D", label: "Tələbat indeksi", unit: "xana cəmi" },
  { id: "pop", label: "Əhali (WorldPop 2026)", unit: "nəfər" },
  { id: "transit", label: "Nəqliyyat minikləri", unit: "gündəlik" },
];
const IDX = { pop: 1, transit: 2, D: 3, w: 4, gap: 5 } as const;
const LAND = [237, 241, 245]; // baza xəritəsinin quru rəngi (leqend rəngləri xəritədəki kimi qarışdırılır)

/** Leqend nişanları: xəritədəki simvollarla eyni SVG */
function Sym({ id, size = 16 }: { id: SymbolId; size?: number }) {
  return <span aria-hidden className="inline-block bg-contain bg-center bg-no-repeat" style={{ width: size, height: size, backgroundImage: `url("${SYMBOL_URL[id]}")` }} />;
}
function Ring({ action, label = "", size = 16 }: { action: string; label?: string; size?: number }) {
  return <span aria-hidden className="inline-block bg-contain bg-center bg-no-repeat" style={{ width: size, height: size, backgroundImage: `url("${hubRingUrl(actionStyle(action), label)}")` }} />;
}
function Line({ color, w = 3 }: { color: string; w?: number }) {
  return <span aria-hidden className="inline-block w-4 rounded" style={{ height: w, background: color }} />;
}
function Dots({ a, b }: { a: string; b?: string }) {
  return (
    <span aria-hidden className="inline-flex items-center gap-[3px]">
      <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: a }} />
      {b && <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: b }} />}
    </span>
  );
}
function Hex() {
  return (
    <span aria-hidden className="inline-block h-[14px] w-4"
      style={{ clipPath: "polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%)", background: "linear-gradient(90deg,#FDD696,#F59A62,#D44C30)" }} />
  );
}
function Iso() {
  return <span aria-hidden className="inline-block h-3 w-4 rounded-[4px] border-2" style={{ borderColor: C.hub, background: "rgba(31,91,181,.16)" }} />;
}

type Row = { k: LayerKey; label: string; count?: string; hint: string; sw: React.ReactNode };

export default function LayerRail({ data }: { data: StaticData }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const nStations = useMemo(() => new Set(data.metro.features.map((f) => f.properties?.station_az)).size, [data.metro]);
  const nMps = useMemo(() => data.parkings.features.filter((f) => f.properties?.ptype !== "MPV").length, [data.parkings]);
  const hubs = s.optimized ?? data.hubs.hubs;
  const nAct = (a: string) => hubs.filter((h) => h.action === a).length;

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "Təklif",
      rows: [
        { k: "hubs", label: "Təklif olunan hub-lar", count: String(hubs.length), hint: "Rəqəm: tikinti sırası. Ölçü: tip S/M/L", sw: <Ring action="new" label="1" /> },
        { k: "isochrones", label: "5 dəq. piyada zonası", hint: "Seçilmiş hub üçün, real küçə şəbəkəsi ilə", sw: <Iso /> },
      ],
    },
    {
      title: "Mövcud infrastruktur",
      rows: [
        { k: "official", label: "AYNA mübadilə mərkəzləri", count: data.official.features.length ? String(data.official.features.length) : "—", hint: "Mövcud nəqliyyat mübadilə mərkəzləri/məntəqələri (AYNA)", sw: <Sym id="official" /> },
        { k: "metro", label: "Metro", count: `${nStations}`, hint: `${nStations} stansiya, ${data.metro.features.length} çıxış (yaxın miqyasda çıxışlar ayrıca)`, sw: <Sym id="metro" /> },
        { k: "rail", label: "Elektrik qatarı stansiyaları", count: data.rail.features.length ? String(data.rail.features.length) : "—", hint: "ADY şəhərətrafı qatar stansiyaları", sw: <Sym id="rail" /> },
        { k: "stations", label: "Avtovağzallar", count: String(data.hubs.arrival.length), hint: "Bakıdakı şəhərlərarası avtovağzallar", sw: <Sym id="terminal" /> },
        { k: "routes", label: "Avtobus marşrutları", count: String(data.routes.features.length), hint: "Qalınlıq √sərnişin; tünd = ölçülmüş (BakuBus), solğun = proqnoz", sw: <Line color={C.bus} /> },
        { k: "stops", label: "Avtobus dayanacaqları", count: int(data.stops.features.length), hint: "OSM", sw: <Dots a={C.bus} /> },
        { k: "parkings", label: "Velo/scooter parkinqləri", count: String(data.parkings.features.length), hint: `AYNA: ${nMps} MPS (tünd yaşıl) və ${data.parkings.features.length - nMps} MPV (açıq yaşıl)`, sw: <Dots a={C.mps} b={C.mpv} /> },
        { k: "lanes", label: "Velo-zolaqlar", hint: "AYNA, 2026", sw: <Line color={C.bike} /> },
      ],
    },
    {
      title: "Analiz",
      rows: [{ k: "cells", label: "İstilik xəritəsi", hint: "H3 altıbucaqlılar (res 9, ~0,1 km²)", sw: <Hex /> }],
    },
  ];

  const mi = IDX[s.cellMetric];
  const breaks = useMemo(() => FIXED_BREAKS[s.cellMetric] ?? quantileBreaks(data.h3.filter((r) => r[1] >= 1).map((r) => Number(r[mi] ?? 0))), [data.h3, mi, s.cellMetric]);
  const fmt = (v: number) => (s.cellMetric === "gap" ? Math.round(v * 100) + "%" : v >= 10 ? int(v) : v.toFixed(2).replace(".", ","));
  // xəritədəki görünüşü təkrarlamaq üçün rənglər quru fonuna alfa ilə qarışdırılır (oxunaqlılıq üçün min. 30%)
  const classColor = (i: number) => {
    const c = GAP_STOPS[i];
    const a = Math.max(0.3, (c[3] / 255) * 0.92);
    return `rgb(${c.slice(0, 3).map((v, j) => Math.round(v * a + LAND[j] * (1 - a))).join(",")})`;
  };

  const reoptimize = async () => {
    if (!s.engineOnline) {
      s.set({ toast: "Yenidən optimallaşdırma Geo Engine tələb edir. Statik nəticələr göstərilir." });
      return;
    }
    setBusy(true);
    try {
      const r = await post<{ hubs: Hub[]; closed_share: number; ms: number }>("/optimize", { ...s.weights, n: s.nHubs });
      s.set({ optimized: r.hubs.map((h) => ({ ...h, id: `opt-${h.rank}`, qa: "", offset_m: 0 })), selected: null,
        toast: `${r.hubs.length} hub ${r.ms} ms-də yenidən hesablandı` });
    } catch (e) {
      if (e instanceof EngineOffline) s.set({ engineOnline: false, toast: "Geo Engine əlçatan deyil: statik nəticələr göstərilir" });
      else s.set({ toast: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const w = s.weights;
  const setW = (k: keyof typeof w, v: number) => s.set({ weights: { ...w, [k]: v } });

  return (
    <aside className="ayan-card absolute left-4 top-[5.25rem] z-20 flex max-h-[calc(100%-16rem)] w-[18.5rem] flex-col gap-3 overflow-y-auto p-3.5" aria-label="Qatlar">
      <section>
        <h2 className="mb-1 px-1.5 text-[15px] font-bold tracking-tight">Qatlar</h2>
        {groups.map((g) => (
          <div key={g.title} className="mt-2 border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0">
            <h3 className="mb-1 px-1.5 text-[11.5px] font-semibold text-[var(--muted)]">{g.title}</h3>
            <ul>
              {g.rows.map((r) => (
                <li key={r.k}>
                  <label title={r.hint} className="flex cursor-pointer items-center gap-2 rounded-[8px] px-1.5 py-[4px] transition-colors hover:bg-[var(--surface2)]">
                    <input type="checkbox" checked={s.layers[r.k]} onChange={() => s.toggle(r.k)} className="h-3.5 w-3.5" />
                    <span className="grid w-5 shrink-0 place-items-center">{r.sw}</span>
                    <span className={`flex-1 truncate text-[13px] font-medium ${s.layers[r.k] ? "" : "text-[var(--muted)]"}`}>{r.label}</span>
                    {r.count && <span className="text-[11px] tabular-nums text-[var(--muted)]">{r.count}</span>}
                  </label>
                  {r.k === "hubs" && s.layers.hubs && (
                    <ul className="mb-1 ml-[2.1rem] mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-[var(--muted)]">
                      {([["new", "yeni", "Yeni hub"], ["upgrade", "çevrilmə", "Mövcud parkinqin hub-a çevrilməsi"], ["integrate", "inteqrasiya", "AYNA mübadilə mərkəzinə mikromobillik inteqrasiyası"]] as const).map(([a, t, hint]) => (
                        <li key={a} className="flex items-center gap-1" title={hint}>
                          <Ring action={a} size={12} />
                          <span>{t}</span>
                          <span className="tabular-nums opacity-80">{nAct(a)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.k === "cells" && (
                    <div className="mb-1 ml-[2.1rem] mt-1">
                      <label className="sr-only" htmlFor="metric">İstilik xəritəsi göstəricisi</label>
                      <select id="metric" value={s.cellMetric} onChange={(e) => s.set({ cellMetric: e.target.value as CellMetric })}
                        className="w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[13px] font-medium">
                        {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                      <div className="mt-1.5 flex h-2.5 gap-[2px]" aria-hidden>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <span key={i} className="flex-1 first:rounded-l-sm last:rounded-r-sm"
                            style={i === 1 ? { border: `1px dashed ${C.line}` } : { background: classColor(i) }} />
                        ))}
                      </div>
                      <div className="relative mt-0.5 h-3.5 text-[10.5px] tabular-nums text-[var(--muted)]">
                        {breaks.map((b, i) => (
                          <span key={i} className="absolute -translate-x-1/2" style={{ left: `${((i + 1) / 5) * 100}%` }}>{fmt(b)}</span>
                        ))}
                      </div>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--muted)]"
                        title={`${METRICS.find((m) => m.id === s.cellMetric)?.unit}. Küçə miqyasında gizlənir.`}>
                        {s.cellMetric === "gap" ? "Sabit siniflər" : "Kvantillər 50/70/85/95%, median altı göstərilmir"}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>


      <details className="group border-t border-[var(--line)] pt-2.5" open={!!s.optimized}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1.5 text-[13.5px] font-bold">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 text-[var(--muted)] transition-transform group-open:rotate-90"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> Ssenari çəkiləri
        </summary>
        <p className="mb-2 mt-1 text-xs text-[var(--muted)]">Tələbatın tərkibini dəyişin və hub-ları yenidən seçin.</p>
        {([["transit", "Nəqliyyat minikləri"], ["pop", "Əhali"], ["poi", "Cazibə nöqtələri"]] as const).map(([k, label]) => (
          <label key={k} className="mb-1.5 block text-xs">
            <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-[var(--muted)]">{Math.round((w[k] / (w.transit + w.pop + w.poi)) * 100)}%</span></span>
            <input type="range" min={0} max={1} step={0.05} value={w[k]} onChange={(e) => setW(k, Number(e.target.value))} className="w-full" />
          </label>
        ))}
        <label className="mb-2 block text-xs">
          <span className="flex justify-between"><span>Hub sayı</span><span className="tabular-nums text-[var(--muted)]">{s.nHubs}</span></span>
          <input type="range" min={5} max={50} step={1} value={s.nHubs} onChange={(e) => s.set({ nHubs: Number(e.target.value) })} className="w-full" />
        </label>
        <div className="flex gap-2">
          <button onClick={reoptimize} disabled={busy}
            className="ayan-btn-primary flex-1 px-3 py-2 text-sm">
            {busy ? "Hesablanır…" : "Hub-ları yenidən seç"}
          </button>
          {s.optimized && (
            <button onClick={() => s.set({ optimized: null, weights: { transit: 0.45, pop: 0.35, poi: 0.2 }, selected: null })}
              className="rounded-[9px] border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]">Baza</button>
          )}
        </div>
      </details>
    </aside>
  );
}
