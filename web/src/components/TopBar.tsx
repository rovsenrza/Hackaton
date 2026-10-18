"use client";

import { useRef } from "react";
import { useStore } from "@/lib/store";
import { BAKU_VIEW, getMap } from "./MapView";
import type { Panel } from "@/lib/types";

const PANELS: { id: Panel; label: string }[] = [
  { id: "map", label: "Xəritə və hub planı" },
  { id: "dashboard", label: "Rəhbərlik paneli" },
  { id: "quality", label: "Data" },
  { id: "method", label: "Metodologiya" },
];

export default function TopBar() {
  const { mode, panel, engineOnline, copilotOpen, set } = useStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMode = (m: "plan" | "twin") => {
    set({ mode: m });
    if (timer.current) clearTimeout(timer.current);
    const map = getMap()?.getMap();
    if (!map) return;
    if (map.getLayer("ayan-buildings-3d")) map.setLayoutProperty("ayan-buildings-3d", "visibility", m === "twin" ? "visible" : "none");
    if (m === "twin") {
      // kinematik giriş: şəhər üzərindən Beynəlxalq Avtovağzala
      map.flyTo({ center: [49.87, 40.385], zoom: 11.6, pitch: 55, bearing: -22, duration: 2600, essential: true });
      timer.current = setTimeout(() => map.flyTo({ center: [49.80, 40.415], zoom: 13.3, pitch: 60, bearing: 18, duration: 4500, essential: true }), 2700);
    } else {
      map.flyTo({ ...BAKU_VIEW, center: [BAKU_VIEW.longitude, BAKU_VIEW.latitude], duration: 1600, essential: true });
    }
  };

  const led = engineOnline == null ? "text-[var(--muted)]" : engineOnline ? "text-[var(--ok)]" : "text-[#C77A0A]";

  return (
    <header className="absolute inset-x-0 top-0 z-30 flex items-center gap-3 px-4 py-3">
      <div className="ayan-card flex items-center gap-2.5 py-1.5 pl-2 pr-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ayan-mark.png" alt="" width={30} height={35} className="h-[35px] w-auto" />
        <div className="leading-none">
          <div className="font-wordmark text-[19px] font-bold text-[var(--cobalt)]">AYAN</div>
          <div className="mt-1 hidden text-[11px] font-medium text-[var(--muted)] md:block">Mobility hub planlayıcısı · Bakı</div>
        </div>
      </div>

      <nav className="ayan-card flex min-w-0 overflow-x-auto p-1" aria-label="Bölmələr">
        <div className="ayan-seg flex border-0 bg-transparent p-0">
          {PANELS.map((p) => (
            <button
              key={p.id}
              onClick={() => set({ panel: p.id })}
              aria-current={panel === p.id}
              className={`whitespace-nowrap px-3.5 py-1.5 text-[13.5px] font-semibold ${panel === p.id ? "text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        {panel === "map" && !copilotOpen && (
          <button onClick={() => set({ copilotOpen: true })} className="ayan-btn-primary px-4 py-2.5 text-[13.5px]">
            AYAN Kopilot
          </button>
        )}
        <div className="ayan-card p-1" role="group" aria-label="Görünüş rejimi">
          <div className="ayan-seg flex border-0 bg-transparent p-0">
            <button onClick={() => setMode("plan")} aria-pressed={mode === "plan"}
              className={`px-3 py-1.5 text-[13.5px] font-semibold ${mode === "plan" ? "" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
              2D planlaşdırma
            </button>
            <button onClick={() => setMode("twin")} aria-pressed={mode === "twin"}
              className={`px-3 py-1.5 text-[13.5px] font-semibold ${mode === "twin" ? "" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
              3D rəqəmsal əkiz
            </button>
          </div>
        </div>
        <span
          title={engineOnline ? "Geo Engine qoşuludur: real piyada izoxronu və canlı optimallaşdırma" : "Geo Engine əlçatan deyil: statik nəticələr və düz xətt buferi"}
          className="ayan-card flex items-center gap-2 px-3 py-2.5 text-[12.5px] font-semibold text-[var(--text)]"
        >
          <span className={`ayan-led ${led}`} />
          {engineOnline == null ? "Engine yoxlanır" : engineOnline ? "Engine qoşulub" : "Ehtiyat rejimi"}
        </span>
      </div>
    </header>
  );
}
