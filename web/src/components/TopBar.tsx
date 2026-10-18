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
  const { mode, panel, engineOnline, set } = useStore();
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

  return (
    <header className="absolute inset-x-0 top-0 z-30 flex items-center gap-4 px-4 py-3">
      <div className="flex items-baseline gap-3 rounded-md bg-[var(--surface)]/95 px-3 py-2 shadow-lg ring-1 ring-[var(--line)]">
        <span className="font-display text-xl font-bold tracking-tight">AYAN</span>
        <span className="hidden text-xs text-[var(--muted)] md:inline">Mobility hub planlayıcısı, Bakı</span>
      </div>

      <nav className="flex rounded-md bg-[var(--surface)]/95 p-1 shadow-lg ring-1 ring-[var(--line)]" aria-label="Bölmələr">
        {PANELS.map((p) => (
          <button
            key={p.id}
            onClick={() => set({ panel: p.id })}
            aria-current={panel === p.id}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${panel === p.id ? "bg-[var(--surface2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex rounded-md bg-[var(--surface)]/95 p-1 shadow-lg ring-1 ring-[var(--line)]" role="group" aria-label="Görünüş rejimi">
          <button onClick={() => setMode("plan")} aria-pressed={mode === "plan"}
            className={`rounded px-3 py-1.5 text-sm ${mode === "plan" ? "bg-[var(--surface2)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
            2D planlaşdırma
          </button>
          <button onClick={() => setMode("twin")} aria-pressed={mode === "twin"}
            className={`rounded px-3 py-1.5 text-sm ${mode === "twin" ? "bg-[var(--surface2)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
            3D rəqəmsal əkiz
          </button>
        </div>
        <span
          title={engineOnline ? "Geo Engine qoşuludur: real piyada izoxronu və canlı optimallaşdırma" : "Geo Engine əlçatan deyil: statik nəticələr və düz xətt buferi"}
          className="flex items-center gap-2 rounded-md bg-[var(--surface)]/95 px-3 py-2 text-xs text-[var(--muted)] shadow-lg ring-1 ring-[var(--line)]"
        >
          <span className={`h-2 w-2 rounded-full ${engineOnline == null ? "bg-[var(--muted)]" : engineOnline ? "bg-[var(--bike)]" : "bg-[var(--hub)]"}`} />
          {engineOnline == null ? "Engine yoxlanır" : engineOnline ? "Engine qoşulub" : "Ehtiyat rejimi"}
        </span>
      </div>
    </header>
  );
}
