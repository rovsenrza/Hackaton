"use client";

import type { StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { approx, pct } from "@/lib/format";
import { C, actionStyle } from "@/lib/theme";
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
    <section className="ayan-card absolute inset-x-4 bottom-4 z-20 px-5 pb-3 pt-3" aria-label="Hub prioritet xətti">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-bold tracking-tight">
          Tikinti ardıcıllığı{s.optimized ? " (sizin ssenari)" : ""}
        </h2>
        <p className="text-[12.5px] font-medium text-[var(--muted)] tabular-nums">
          İlk {hubs.length} hub xidmətsiz tələbatın <b className="text-[var(--text)]">{pct(closed.at(-1), 1)}</b>-ni bağlayır · <b className="text-[var(--text)]">{approx(newPop)}</b> sakin ilk dəfə 5 dəqiqəlik çıxış qazanır
        </p>
      </div>
      <div className="relative overflow-x-auto">
        <ol className="relative flex w-full items-start">
          {hubs.map((h, i) => {
            // yolun eni = hub-ın qazancı (loqodakı yol: asfalt, ağ zolaq cizgisi)
            const th = 6 + (h.gain_share / maxGain) * 8;
            const st = actionStyle(h.action);
            const on = sel === h.rank;
            return (
              <li key={h.rank} className="relative min-w-[3.6rem] flex-1">
                {i < hubs.length - 1 && (
                  <span aria-hidden className="absolute left-1/2 top-[15px] w-full -translate-y-1/2 rounded-full bg-[#2B3748]" style={{ height: th }}>
                    <span className="absolute inset-x-2 top-1/2 h-[1.5px] -translate-y-1/2 bg-[repeating-linear-gradient(90deg,#fff_0_6px,transparent_6px_11px)] opacity-90" />
                  </span>
                )}
                <button
                  onClick={() => {
                    s.set({ selected: { kind: "hub", rank: h.rank } });
                    getMap()?.getMap().flyTo({ center: [h.lon, h.lat], zoom: 15, duration: 900 });
                  }}
                  className="group relative mx-auto flex w-full flex-col items-center"
                  aria-label={`#${h.rank} ${h.label}`}
                  aria-pressed={on}
                >
                  <span className="relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full text-[12px] font-extrabold tabular-nums transition-transform duration-150 group-hover:scale-110"
                    style={on
                      ? { background: C.ink, color: "#fff", boxShadow: `0 0 0 3px ${st.fill}` }
                      : { background: st.fill, color: st.text,
                          boxShadow: st.outer ? `inset 0 0 0 2.5px #fff, 0 0 0 3px ${st.outer}, 0 0 0 4.5px #fff` : st.ring === "#FFFFFF" ? "0 0 0 2.5px #fff" : `inset 0 0 0 2.6px ${st.ring}, 0 0 0 2px #fff` }}>
                    {h.rank}
                  </span>
                  <span className={`mt-1.5 line-clamp-2 w-full px-0.5 text-center text-[10.5px] font-medium leading-tight ${on ? "text-[var(--text)]" : "text-[var(--muted)] group-hover:text-[var(--text)]"}`}>{h.label}</span>
                  <span className="text-[10px] font-semibold tabular-nums text-[var(--muted)]" title="Xidmətsiz tələbatın kumulyativ bağlanan payı">{pct(closed[i], 1)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
