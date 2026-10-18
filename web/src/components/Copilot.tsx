"use client";

import { useEffect, useRef, useState } from "react";
import { api, EngineOffline } from "@/lib/data";
import { useStore } from "@/lib/store";
import type { Hub, WhatIfHub } from "@/lib/types";
import { getMap } from "./MapView";

type Action =
  | { type: "fly"; lon: number; lat: number; zoom?: number }
  | { type: "show_scenario"; hubs: Hub[] }
  | { type: "show_base" }
  | { type: "select_hub"; rank: number; lon: number; lat: number }
  | { type: "whatif"; hub: WhatIfHub };
interface Reply { session_id: string; text: string; actions: Action[]; tools: string[]; ms?: number; error?: boolean }
interface Msg { role: "user" | "assistant"; text: string; tools?: string[] }

const SUGGEST = [
  "Bakıda vəziyyət necədir? 3 əsas rəqəm de",
  "Xətai rayonunda 5 hub qursam ən vacibləri hansılardır?",
  "Koroğlu metrosunun yanında hub qoysam neçə nəfərə xidmət edər?",
  "Yalnız yeni hub-larla, əhaliyə daha çox çəki verməklə 10 hub seç",
];
const TOOL_AZ: Record<string, string> = {
  city_overview: "şəhər göstəriciləri", top_hubs: "hub siyahısı", hub_details: "hub kartı", find_place: "yer axtarışı",
  optimize_hubs: "MCLP optimallaşdırma", evaluate_location: "real piyada izoxronu",
};

/** Sadə Markdown: **qalın**, sətir sonları və siyahılar (kənar kitabxanasız) */
export function MiniMd({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para.replace(/^#+\s*/gm, "").split(/(\*\*[^*]+\*\*)/g).map((t, j) =>
            t.startsWith("**") ? <b key={j}>{t.slice(2, -2)}</b> : <span key={j}>{t}</span>,
          )}
        </p>
      ))}
    </div>
  );
}

export default function Copilot() {
  const s = useStore();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sid, setSid] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!s.engineOnline) return;
    api<{ enabled: boolean }>("/copilot/status").then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false));
  }, [s.engineOnline]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const apply = (acts: Action[]) => {
    const map = getMap()?.getMap();
    for (const a of acts) {
      const st = useStore.getState();
      if (a.type === "fly") map?.flyTo({ center: [a.lon, a.lat], zoom: a.zoom ?? 14, duration: 1200 });
      if (a.type === "show_scenario") {
        st.set({ optimized: a.hubs.map((h) => ({ ...h, id: `opt-${h.rank}`, qa: h.qa ?? "", offset_m: h.offset_m ?? 0 })), selected: null });
        const xs = a.hubs.map((h) => h.lon), ys = a.hubs.map((h) => h.lat);
        if (xs.length && map) map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 160, maxZoom: 14.5, duration: 1200 });
      }
      if (a.type === "show_base") st.set({ optimized: null });
      if (a.type === "select_hub") {
        st.set({ optimized: null, selected: { kind: "hub", rank: a.rank } });
        map?.flyTo({ center: [a.lon, a.lat], zoom: 15, duration: 1200 });
      }
      if (a.type === "whatif") {
        const key = `c${Date.now()}`;
        st.set({ whatIf: [...st.whatIf, { ...a.hub, key }] });
        map?.flyTo({ center: [a.hub.lon, a.hub.lat], zoom: 15, duration: 1200 });
      }
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api<Reply>("/copilot/chat", { method: "POST", body: JSON.stringify({ session_id: sid, message: text }) });
      setSid(r.session_id);
      setMsgs((m) => [...m, { role: "assistant", text: r.text, tools: r.tools }]);
      apply(r.actions ?? []);
    } catch (e) {
      if (e instanceof EngineOffline) s.set({ engineOnline: false });
      setMsgs((m) => [...m, { role: "assistant", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="absolute right-4 top-20 z-20 flex max-h-[calc(100%-15rem)] w-[24rem] flex-col rounded-md bg-[var(--surface)]/97 shadow-xl ring-1 ring-[var(--line)]" aria-label="AYAN Kopilot">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
        <div>
          <p className="font-display text-base font-semibold">AYAN Kopilot</p>
          <p className="text-[11px] text-[var(--muted)]">Rəqəmlər AYAN modelindən gəlir, AI yalnız soruşur və izah edir</p>
        </div>
        <button onClick={() => s.set({ copilotOpen: false })} className="text-sm text-[var(--muted)] hover:text-[var(--text)]" aria-label="Bağla">✕</button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {enabled === false && (
          <p className="rounded border border-[var(--hub)]/60 px-3 py-2 text-xs text-[var(--hub)]">
            Kopilot aktiv deyil: engine/.env faylına ANTHROPIC_API_KEY əlavə edib engine-i yenidən başladın.
          </p>
        )}
        {!msgs.length && (
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--muted)]">Nümunə suallar:</p>
            {SUGGEST.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={!enabled || busy}
                className="block w-full rounded border border-[var(--line)] px-3 py-1.5 text-left text-sm hover:bg-[var(--surface2)] disabled:opacity-50">{q}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="ml-8 rounded-md bg-[var(--surface2)] px-3 py-2 text-sm">{m.text}</p>
          ) : (
            <div key={i} className="mr-4">
              <MiniMd text={m.text} />
              {!!m.tools?.length && (
                <p className="mt-1 text-[10px] text-[var(--muted)]">Hesablama: {Array.from(new Set(m.tools)).map((t) => TOOL_AZ[t] ?? t).join(" · ")}</p>
              )}
            </div>
          ),
        )}
        {busy && <p className="text-xs text-[var(--muted)]">Model hesablayır…</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-[var(--line)] p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={!enabled || busy} placeholder="Sualınızı yazın…"
          className="flex-1 rounded border border-[var(--line)] bg-[var(--surface2)] px-3 py-2 text-sm disabled:opacity-50" />
        <button type="submit" disabled={!enabled || busy || !input.trim()} className="rounded bg-[var(--hub)] px-3 py-2 text-sm font-semibold text-[var(--bg)] disabled:opacity-50">Göndər</button>
      </form>
    </aside>
  );
}
