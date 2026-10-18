"use client";

import { useEffect, useRef, useState } from "react";
import { ENGINE } from "@/lib/data";
import { useStore } from "@/lib/store";
import { int } from "@/lib/format";
import type { StaticData } from "@/lib/data";
import DataRequests from "./DataRequests";

interface Issue {
  row: number;
  rule: string;
  before: string;
  after: string;
  action: "avto" | "yoxlama";
}
interface Report {
  file: string;
  rows_in: number;
  rows_out: number;
  auto_fixed: number;
  needs_review: number;
  removed_duplicates: number;
  columns: Record<string, string | null>;
  rules: { rule: string; count: number; action: "avto" | "yoxlama" }[];
  issues: Issue[];
  clean: GeoJSON.FeatureCollection;
}

function Pill({ a }: { a: "avto" | "yoxlama" }) {
  return a === "avto" ? (
    <span className="rounded bg-[var(--bike)]/20 px-1.5 py-0.5 text-[11px] text-[var(--bike)]">avtomatik düzəldildi</span>
  ) : (
    <span className="rounded bg-[var(--hub)]/20 px-1.5 py-0.5 text-[11px] text-[var(--hub)]">insan yoxlaması</span>
  );
}

export default function Quality({ data }: { data: StaticData }) {
  const online = useStore((s) => s.engineOnline);
  const [samples, setSamples] = useState<{ file: string; label: string }[]>([]);
  const [rep, setRep] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!online) return;
    fetch(`${ENGINE}/quality/samples`).then((r) => r.json()).then(setSamples).catch(() => {});
  }, [online]);

  const run = async (p: Promise<Response>) => {
    setBusy(true);
    setErr(null);
    setFilter(null);
    try {
      const r = await p;
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail ?? `Xəta (${r.status})`);
      setRep(d);
    } catch (e) {
      setErr(e instanceof TypeError ? "Geo Engine əlçatan deyil" : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    run(fetch(`${ENGINE}/quality/check`, { method: "POST", body: fd }));
  };
  const download = () => {
    if (!rep) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(rep.clean)], { type: "application/geo+json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = rep.file.replace(/\.[^.]+$/, "") + "_temiz.geojson";
    a.click();
    URL.revokeObjectURL(url);
  };
  const shown = rep ? rep.issues.filter((i) => !filter || i.rule === filter).slice(0, 80) : [];

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[var(--bg)]/92 px-6 pb-12 pt-20 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl">
        <DataRequests data={data} />
        <h1 className="mt-12 font-display text-3xl font-bold tracking-tight">Data keyfiyyət mərkəzi</h1>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">
          Nəqliyyat faylını atın: koordinat formatı, yerdəyişmiş enlik və uzunluq, dublikatlar, Bakıdan kənar nöqtələr, Excel təhrifləri, kiril simvollar və köhnə marşrutlar avtomatik yoxlanılır.
        </p>

        <section className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) upload(f);
            }}
            onClick={() => input.current?.click()}
            className="grid cursor-pointer place-items-center rounded-md border-2 border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center hover:border-[var(--hub)]"
            role="button"
            tabIndex={0}
            aria-label="Fayl seçin"
          >
            <div>
              <p className="font-semibold">{busy ? "Yoxlanılır…" : "Faylı bura atın və ya klikləyib seçin"}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">CSV, GeoJSON, JSON (AYNA API), KMZ · 25 MB-a qədər</p>
            </div>
            <input ref={input} type="file" accept=".csv,.geojson,.json,.kmz" className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
          <div className="rounded-md bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
            <p className="text-sm font-semibold">Real açıq data ilə sınayın</p>
            <p className="mb-2 text-xs text-[var(--muted)]">Bu fayllar opendata.az və AYNA API-dən olduğu kimi götürülüb</p>
            <ul className="space-y-1.5">
              {samples.map((s) => (
                <li key={s.file}>
                  <button onClick={() => run(fetch(`${ENGINE}/quality/sample/${encodeURIComponent(s.file)}`))} disabled={busy}
                    className="w-full rounded border border-[var(--line)] px-3 py-1.5 text-left text-sm hover:bg-[var(--surface2)] disabled:opacity-50">
                    {s.label} <span className="text-xs text-[var(--muted)]">· {s.file}</span>
                  </button>
                </li>
              ))}
              {!samples.length && <li className="text-xs text-[var(--muted)]">{online ? "Yüklənir…" : "Geo Engine qoşulduqda görünəcək"}</li>}
            </ul>
          </div>
        </section>

        {err && <p className="mt-4 rounded border border-[var(--metro)]/60 px-3 py-2 text-sm text-[var(--metro)]">{err}</p>}

        {rep && (
          <>
            <section className="mt-8 grid gap-6 md:grid-cols-4">
              {[
                [int(rep.rows_in), "sətir daxil oldu"],
                [int(rep.auto_fixed), "avtomatik düzəliş"],
                [int(rep.needs_review), "sətir insan yoxlaması tələb edir"],
                [int(rep.rows_out), "sətir təmiz faylda"],
              ].map(([v, l]) => (
                <div key={l} className="border-l-2 border-[var(--line)] pl-3">
                  <p className="font-display text-3xl font-bold tabular-nums leading-none">{v}</p>
                  <p className="mt-1.5 text-sm">{l}</p>
                </div>
              ))}
            </section>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Fayl: {rep.file} · tanınan sütunlar: {Object.entries(rep.columns).filter(([, v]) => v).map(([k, v]) => `${k} = “${v}”`).join(", ") || "—"}
            </p>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <h2 className="text-lg font-semibold">Tapılan problemlər</h2>
                <ul className="mt-2 space-y-1.5">
                  {rep.rules.map((r) => (
                    <li key={r.rule}>
                      <button onClick={() => setFilter(filter === r.rule ? null : r.rule)}
                        className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm ring-1 ${filter === r.rule ? "bg-[var(--surface2)] ring-[var(--hub)]" : "bg-[var(--surface)] ring-[var(--line)]"}`}>
                        <span>{r.rule}</span>
                        <span className="flex items-center gap-2"><Pill a={r.action} /><b className="tabular-nums">{int(r.count)}</b></span>
                      </button>
                    </li>
                  ))}
                  {!rep.rules.length && <li className="text-sm text-[var(--bike)]">Problem tapılmadı: fayl təmizdir.</li>}
                </ul>
                <button onClick={download} className="mt-4 rounded bg-[var(--hub)] px-4 py-2 text-sm font-semibold text-[var(--bg)]">
                  Təmiz faylı yüklə (GeoJSON)
                </button>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Dəyişikliklər{filter ? `: ${filter}` : ""}</h2>
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-xs text-[var(--muted)]">
                    <tr><th className="py-1 font-normal">Sətir</th><th className="font-normal">Əvvəl</th><th className="font-normal">Sonra</th><th className="font-normal">Qayda</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((i, k) => (
                      <tr key={k} className="border-t border-[var(--line)] align-top">
                        <td className="py-1.5 pr-2 tabular-nums text-[var(--muted)]">{i.row}</td>
                        <td className="pr-2 text-[var(--metro)]/90 line-through decoration-1">{i.before}</td>
                        <td className="pr-2 text-[var(--bike)]">{i.after || "—"}</td>
                        <td className="text-xs text-[var(--muted)]">{i.rule}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rep.issues.length > shown.length && <p className="mt-2 text-xs text-[var(--muted)]">İlk {shown.length} dəyişiklik göstərilir.</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
