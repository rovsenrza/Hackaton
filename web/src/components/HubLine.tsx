"use client";

import type { StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { approx, pct } from "@/lib/format";
import { C } from "@/lib/theme";
import { getMap } from "./MapView";

/** Sıralanmış hub-lar metro xətti sxemi kimi: stansiyalar = hub-lar (MCLP sırası), qalınlıq = qazanc. */
export default function HubLine({ data }: { data: StaticData }) {
  const s = useStore();
  const hubs = (s.optimized ?? data.hubs.hubs).slice(0, 20);
  if (!hubs.length) return null;
  const maxGain = Math.max(...hubs.map((h) => h.gain_share));
  // xidmətsiz tələbatın bağlanan payı (MCLP-nin öz meyarı), kumulyativ
  const closed = hubs.reduce<number[]>((a, h) => [...a, (a.at(-1) ?? 0) + h.gain_share], []);
  const newPop = hubs.reduce((a, h) => a + h.pop_newly_served, 0);
  const sel = s.selected?.kind === "hub" ? s.selected.rank : null;

  return (
    <section className="absolute inset-x-4 bottom-4 z-20 rounded-md bg-[var(--surface)]/95 px-5 pb-3 pt-3 shadow-xl ring-1 ring-[var(--line)]" aria-label="Hub prioritet xətti">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">
          Tikinti ardıcıllığı{s.optimized ? " (sizin ssenari)" : ""}
        </h2>
        <p className="text-xs text-[var(--muted)] tabular-nums">
          İlk {hubs.length} hub xidmətsiz tələbatın {pct(closed.at(-1), 1)}-ni bağlayır · {approx(newPop)} sakin ilk dəfə 5 dəqiqəlik çıxış qazanır
        </p>
      </div>
      <div className="relative overflow-x-auto">
        <ol className="relative flex w-full items-start">
          {hubs.map((h, i) => {
            const th = 3 + (h.gain_share / maxGain) * 7;
            const col = h.action === "new" ? C.hub : C.upgrade;
            return (
              <li key={h.rank} className="relative min-w-0 flex-1">
                {i < hubs.length - 1 && <span className="absolute left-1/2 top-[13px] w-full -translate-y-1/2" style={{ height: th, background: col, opacity: 0.85 }} aria-hidden />}
                <button
                  onClick={() => {
                    s.set({ selected: { kind: "hub", rank: h.rank } });
                    getMap()?.getMap().flyTo({ center: [h.lon, h.lat], zoom: 15, duration: 900 });
                  }}
                  className="group relative mx-auto flex w-full flex-col items-center"
                  aria-label={`#${h.rank} ${h.label}`}
                >
                  <span className="relative z-10 grid h-[26px] w-[26px] place-items-center rounded-full border-[3px] bg-[var(--bg)] text-[11px] font-bold tabular-nums"
                    style={{ borderColor: col, background: sel === h.rank ? col : C.bg, color: sel === h.rank ? C.bg : C.text }}>
                    {h.rank}
                  </span>
                  <span className="mt-1 line-clamp-2 w-full px-0.5 text-center text-[10.5px] leading-tight text-[var(--muted)] group-hover:text-[var(--text)]">{h.label}</span>
                  <span className="text-[10px] tabular-nums text-[var(--muted)]" title="Xidmətsiz tələbatın kumulyativ bağlanan payı">{pct(closed[i], 1)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
