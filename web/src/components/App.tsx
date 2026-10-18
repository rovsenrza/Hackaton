"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { engineAlive, ENGINE, loadStatic, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import TopBar from "./TopBar";
import LayerRail from "./LayerRail";
import Inspector from "./Inspector";
import HubLine from "./HubLine";
import Dashboard from "./Dashboard";
import Methodology from "./Methodology";
import Quality from "./Quality";
import Copilot from "./Copilot";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export default function App() {
  const [data, setData] = useState<StaticData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { panel, toast, set, copilotOpen } = useStore();

  useEffect(() => {
    loadStatic().then(setData).catch((e) => setErr(String(e)));
    // engine-in sağlamlığı dövri yoxlanılır: demo zamanı düşsə, UI ehtiyat rejiminə keçir, qalxsa qayıdır
    let prev: boolean | null = null;
    const check = async () => {
      const ok = await engineAlive();
      if (ok !== prev) {
        prev = ok;
        set({ engineOnline: ok });
        if (ok) {
          try {
            const rows: { id: string; status: string }[] = await fetch(`${ENGINE}/hubs`).then((r) => r.json());
            set({ statuses: Object.fromEntries(rows.map((r) => [r.id, r.status])) });
          } catch {
            /* statuslar yalnız engine ilə */
          }
        }
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [set]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => set({ toast: null }), 6000);
    return () => clearTimeout(t);
  }, [toast, set]);

  if (err) return <div className="grid h-dvh place-items-center text-[var(--muted)]">Data yüklənmədi: {err}</div>;
  if (!data)
    return (
      <div className="grid h-dvh place-items-center">
        <div className="text-center">
          <div className="font-display text-4xl tracking-tight text-[var(--text)]">AYAN</div>
          <div className="mt-2 text-sm text-[var(--muted)]">Bakının nəqliyyat əkizi yüklənir…</div>
        </div>
      </div>
    );

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView data={data} />
      <TopBar />
      {panel === "map" && (
        <>
          <LayerRail data={data} />
          {copilotOpen ? <Copilot /> : <Inspector data={data} />}
          <HubLine data={data} />
        </>
      )}
      {panel === "dashboard" && <Dashboard data={data} />}
      {panel === "method" && <Methodology data={data} />}
      {panel === "quality" && <Quality data={data} />}
      {toast && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-20 z-40 max-w-xl -translate-x-1/2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
