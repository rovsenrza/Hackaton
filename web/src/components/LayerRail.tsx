"use client";

import { useMemo, useState } from "react";
import { post, type StaticData } from "@/lib/data";
import { useStore, type LayerKey } from "@/lib/store";
import { C, GAP_STOPS } from "@/lib/theme";
import { int } from "@/lib/format";
import type { CellMetric, Hub } from "@/lib/types";
import { FIXED_BREAKS, quantileBreaks } from "./MapView";

const METRICS: { id: CellMetric; label: string; unit: string }[] = [
  { id: "w", label: "Xidmət olunmamış tələbat", unit: "tələbat × boşluq, xana cəmi" },
  { id: "gap", label: "Son kilometr boşluğu", unit: "əhali ilə çəkilmiş, 0–1, sabit siniflər" },
  { id: "D", label: "Tələbat indeksi", unit: "xana cəmi" },
  { id: "pop", label: "Əhali (WorldPop 2026)", unit: "nəfər" },
  { id: "transit", label: "Nəqliyyat minikləri", unit: "gündəlik" },
];
const IDX = { pop: 1, transit: 2, D: 3, w: 4, gap: 5 } as const;

function Swatch({ color, shape = "dot" }: { color: string; shape?: "dot" | "line" | "ring" }) {
  if (shape === "line") return <span className="inline-block h-[3px] w-4 rounded" style={{ background: color }} />;
  if (shape === "ring") return <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: color, background: C.bg }} />;
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}

export default function LayerRail({ data }: { data: StaticData }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const rows: { k: LayerKey; label: string; note: string; sw: React.ReactNode }[] = [
    { k: "hubs", label: "Təklif olunan hub-lar", note: "kəhrəba: yeni · bənövşəyi: hub-a çevrilmə", sw: <Swatch color={C.hub} /> },
    { k: "isochrones", label: "5 dəqiqəlik piyada zonası", note: "seçilmiş hub üçün, real küçə şəbəkəsi", sw: <Swatch color={C.hub} shape="ring" /> },
    { k: "metro", label: "Metro çıxışları", note: `${data.metro.features.length} çıxış`, sw: <Swatch color={C.metro} /> },
    { k: "routes", label: "Avtobus marşrutları", note: `${data.routes.features.length} marşrut, qalınlıq √sərnişin`, sw: <Swatch color={C.bus} shape="line" /> },
    { k: "stops", label: "Avtobus dayanacaqları", note: `${int(data.stops.features.length)} (OSM)`, sw: <Swatch color={C.bus} /> },
    { k: "stations", label: "Avtovağzallar", note: `${data.hubs.arrival.length} Bakıda`, sw: <Swatch color={C.station} /> },
    { k: "parkings", label: "Velo/scooter parkinqləri", note: `${data.parkings.features.length} (AYNA)`, sw: <Swatch color={C.bike} /> },
    { k: "lanes", label: "Velo-zolaqlar", note: "AYNA, 2026", sw: <Swatch color={C.bike} shape="line" /> },
    { k: "cells", label: "İstilik xəritəsi", note: "H3 altıbucaqlılar", sw: <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "linear-gradient(90deg,#4A406E,#D6564C,#FADE8C)" }} /> },
  ];

  const mi = IDX[s.cellMetric];
  const breaks = useMemo(() => FIXED_BREAKS[s.cellMetric] ?? quantileBreaks(data.h3.filter((r) => r[1] >= 1).map((r) => Number(r[mi] ?? 0))), [data.h3, mi, s.cellMetric]);
  const fmt = (v: number) => (s.cellMetric === "gap" ? Math.round(v * 100) + "%" : v >= 10 ? int(v) : v.toFixed(2).replace(".", ","));

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
      s.set({ toast: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const w = s.weights;
  const setW = (k: keyof typeof w, v: number) => s.set({ weights: { ...w, [k]: v } });

  return (
    <aside className="absolute left-4 top-20 z-20 flex max-h-[calc(100%-15rem)] w-72 flex-col gap-3 overflow-y-auto rounded-md bg-[var(--surface)]/95 p-4 shadow-xl ring-1 ring-[var(--line)]" aria-label="Qatlar">
      <section>
        <h2 className="mb-2 text-sm font-semibold">Qatlar</h2>
        <ul className="space-y-0.5">
          {rows.map((r) => (
            <li key={r.k}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded px-1.5 py-0.5 hover:bg-[var(--surface2)]">
                <input type="checkbox" checked={s.layers[r.k]} onChange={() => s.toggle(r.k)} className="mt-1 accent-[var(--hub)]" />
                <span className="mt-1.5 w-4 shrink-0">{r.sw}</span>
                <span className="leading-tight">
                  <span className="block text-sm">{r.label}</span>
                  <span className="block text-xs text-[var(--muted)]">{r.note}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="metric">İstilik xəritəsi göstəricisi</label>
        <select id="metric" value={s.cellMetric} onChange={(e) => s.set({ cellMetric: e.target.value as CellMetric })}
          className="w-full rounded border border-[var(--line)] bg-[var(--surface2)] px-2 py-1.5 text-sm">
          {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-sm">
          {GAP_STOPS.slice(1).map((c, i) => <span key={i} className="flex-1" style={{ background: `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0.55, c[3] / 255)})` }} />)}
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--muted)]">
          <span>az</span>
          {breaks.map((b, i) => <span key={i}>{fmt(b)}</span>)}
          <span>çox</span>
        </div>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{s.cellMetric === "gap" ? "Sabit siniflər" : "Kvantillər 50/70/85/95%: parlaq = ən yüksək 5%"}. {METRICS.find((m) => m.id === s.cellMetric)?.unit}</p>
      </section>

      <details className="group border-t border-[var(--line)] pt-3" open={!!s.optimized}>
        <summary className="cursor-pointer list-none text-sm font-semibold">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> Ssenari çəkiləri
        </summary>
        <p className="mb-2 mt-1 text-xs text-[var(--muted)]">Tələbatın tərkibini dəyişin və hub-ları yenidən seçin.</p>
        {([["transit", "Nəqliyyat minikləri"], ["pop", "Əhali"], ["poi", "Cazibə nöqtələri"]] as const).map(([k, label]) => (
          <label key={k} className="mb-1.5 block text-xs">
            <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-[var(--muted)]">{Math.round((w[k] / (w.transit + w.pop + w.poi)) * 100)}%</span></span>
            <input type="range" min={0} max={1} step={0.05} value={w[k]} onChange={(e) => setW(k, Number(e.target.value))} className="w-full accent-[var(--hub)]" />
          </label>
        ))}
        <label className="mb-2 block text-xs">
          <span className="flex justify-between"><span>Hub sayı</span><span className="tabular-nums text-[var(--muted)]">{s.nHubs}</span></span>
          <input type="range" min={5} max={50} step={1} value={s.nHubs} onChange={(e) => s.set({ nHubs: Number(e.target.value) })} className="w-full accent-[var(--hub)]" />
        </label>
        <div className="flex gap-2">
          <button onClick={reoptimize} disabled={busy}
            className="flex-1 rounded bg-[var(--hub)] px-3 py-2 text-sm font-semibold text-[var(--bg)] hover:brightness-110 disabled:opacity-60">
            {busy ? "Hesablanır…" : "Hub-ları yenidən seç"}
          </button>
          {s.optimized && (
            <button onClick={() => s.set({ optimized: null, weights: { transit: 0.45, pop: 0.35, poi: 0.2 }, selected: null })}
              className="rounded border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]">Baza</button>
          )}
        </div>
      </details>
    </aside>
  );
}
