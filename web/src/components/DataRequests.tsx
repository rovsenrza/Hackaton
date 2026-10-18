"use client";

import { useEffect, useState } from "react";
import type { StaticData } from "@/lib/data";
import { approx, pct } from "@/lib/format";

type Status = "yox" | "göndərildi" | "gözlənilir" | "qoşuldu";
const KEY = "ayan.dataRequests.v1";
const FLOW: Status[] = ["yox", "göndərildi", "gözlənilir", "qoşuldu"];
const LABEL: Record<Status, string> = { yox: "Tələb et", göndərildi: "Tələb göndərildi", gözlənilir: "Data gözlənilir", qoşuldu: "Qoşuldu (mock)" };

interface Req {
  id: string;
  title: string;
  owner: string;
  now: string;      // hazırda nəyi əvəz edir
  impact: string;   // modeldən hesablanan təsir
  priority: 1 | 2 | 3;
  fields: string[];
}

function load(): Record<string, Status> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Data boşluğu analizatoru: modelin özü hansı datanın çatışmadığını və təsirini göstərir (tələb axını mock). */
export default function DataRequests({ data }: { data: StaticData }) {
  const m = data.metrics;
  const rm = m.demand?.route_model ?? {};
  const busPred = rm.predicted_daily_total ?? 0;
  const busMeas = rm.measured_daily_total ?? 0;
  const busShare = busPred / Math.max(busPred + busMeas, 1);
  const transitBusShare = (busPred + busMeas) / Math.max(m.demand?.cells?.transit_sum ?? 1, 1);
  const err = rm.cv_leave_one_out?.[rm.chosen]?.MdAPE;
  const co2 = m.hubs?.program?.["20"];
  const routes = m.demand?.bus_stops?.routes ?? 184;
  const routesMeas = m.demand?.bus_stops?.routes_with_ridership ?? 62;
  const rej = m.hubs?.placement_all?.rejected;

  const REQS: Req[] = [
    { id: "private-ridership", title: "Özəl operatorların marşrut üzrə gündəlik sərnişin sayı", owner: "AYNA → daşıyıcılar", priority: 1,
      now: `${routes - routesMeas} marşrut üçün proqnoz modeli (median xəta ${pct(err)})`,
      impact: `Avtobus sərnişinlərinin ${pct(busShare)}-i (${approx(busPred)}/gün) proqnozdan ölçülmüşə keçər`,
      fields: ["marşrut", "tarix", "gündəlik_gediş"] },
    { id: "bakikart-stops", title: "BakıKart validasiyaları: dayanacaq və saat üzrə minik", owner: "Bakı Metropoliteni / BakıKart", priority: 1,
      now: "Marşrutun sərnişini onun dayanacaqlarına bərabər bölünür",
      impact: `Nəqliyyat tələbatının ${pct(transitBusShare)}-i (avtobus minikləri) dayanacaq səviyyəsində ölçülmüş olar`,
      fields: ["dayanacaq_kodu", "tarix", "saat", "minik", "düşmə"] },
    { id: "micromobility-trips", title: "Mikromobillik səfərləri: parkinq nöqtəsi üzrə", owner: "AYNA → operatorlar (Apar və s.)", priority: 2,
      now: "Bütün nöqtələr üçün orta göstərici: 12,2 səfər/nöqtə/gün",
      impact: co2 ? `Əlavə səfər və CO₂ proqnozu nöqtə səviyyəsində kalibrlənər (20 hub: ${approx(co2.trips_day_new)} səfər/gün, ~${String(co2.co2_t_year_base).replace(".", ",")} t/il)` : "Kalibrləmə nöqtə səviyyəsinə enər",
      fields: ["parkinq_id", "tarix", "başlanğıc", "bitiş", "orta_km"] },
    { id: "trip-survey", title: "Səfər məqsədi və nəqliyyat növü sorğusu (OD)", owner: "AYNA / Statistika Komitəsi", priority: 2,
      now: "Avtomobil/taksi səfərinin əvəzetmə payı ssenaridir (10–30%)",
      impact: "CO₂ hesabının ən böyük fərziyyəsi ölçülmüş paya çevrilər, diapazon daralar",
      fields: ["respondent_zona", "məqsəd", "əvvəlki_növ", "yeni_növ", "məsafə_km"] },
    { id: "sidewalk-audit", title: "Səki eni və maneələr: hub yerləri üzrə sahə auditi", owner: "AYNA sahə qrupu", priority: 3,
      now: "Yol eni OSM teqlərindən təxmin olunur; yerləşdirmə peyk görüntüsü ilə yoxlanır",
      impact: `${rej ? `${rej} rədd edilmiş namizəd yenidən qiymətləndirilər; ` : ""}hər hub üçün səki eni təsdiqlənər`,
      fields: ["hub_id", "səki_eni_m", "maneələr", "işıqlandırma", "foto"] },
    { id: "bus-gps", title: "Avtobusların GPS axını (AVL)", owner: "AYNA idarəetmə mərkəzi", priority: 3,
      now: "3D əkizdə avtobuslar simulyasiyadır; canlı gəlişlər yalnız seçilmiş dayanacaqlar üçündür",
      impact: "Real vaxt idarəetmə: interval, gecikmə və keçid vaxtları hub səviyyəsində ölçülər",
      fields: ["avtobus_id", "marşrut", "vaxt", "lat", "lon", "sürət"] },
  ];

  const [st, setSt] = useState<Record<string, Status>>({});
  useEffect(() => setSt(load()), []);
  const advance = (id: string) => {
    const cur = st[id] ?? "yox";
    const next = FLOW[Math.min(FLOW.indexOf(cur) + 1, FLOW.length - 1)];
    const v = { ...st, [id]: next };
    setSt(v);
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* brauzer yaddaşı əlçatan deyil: status yalnız bu səhifədə qalır */
    }
  };
  const template = (r: Req) => {
    const url = URL.createObjectURL(new Blob(["﻿" + r.fields.join(",") + "\n"], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ayan_sablon_${r.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <h2 className="text-[1.6rem] font-extrabold tracking-tight">Data boşluğu: AYNA-dan tələb olunan datalar</h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
        Model hansı yerdə təxminə əsaslandığını özü göstərir. Kartlar dəqiqliyə təsirinə görə sıralanıb. Tələb axını nümayiş üçündür (mock).
      </p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {REQS.map((r) => {
          const s = st[r.id] ?? "yox";
          return (
            <li key={r.id} className="flex flex-col ayan-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold leading-snug">{r.title}</p>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${r.priority === 1 ? "bg-[var(--metro)]/20 text-[var(--metro)]" : r.priority === 2 ? "bg-[var(--hub)]/20 text-[var(--hub)]" : "bg-[var(--surface2)] text-[var(--muted)]"}`}>
                  {r.priority === 1 ? "yüksək" : r.priority === 2 ? "orta" : "aşağı"} prioritet
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">Sahibi: {r.owner}</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div><dt className="inline text-[var(--muted)]">İndi: </dt><dd className="inline">{r.now}</dd></div>
                <div><dt className="inline text-[var(--muted)]">Qazanc: </dt><dd className="inline text-[var(--bike)]">{r.impact}</dd></div>
              </dl>
              <div className="mt-auto flex gap-2 pt-3">
                <button onClick={() => advance(r.id)} disabled={s === "qoşuldu"}
                  className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold ${s === "yox" ? "bg-[var(--hub)] text-[var(--on-accent)]" : "border border-[var(--line)] text-[var(--text)]"} disabled:opacity-60`}>
                  {s === "yox" ? LABEL.yox : LABEL[s]}{s !== "yox" && s !== "qoşuldu" && <svg aria-hidden viewBox="0 0 16 16" className="ml-1 inline h-3 w-3 align-[-1px]"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <button onClick={() => template(r)} className="rounded border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface2)]">CSV şablonu</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
