"use client";

import { useEffect, useState } from "react";
import { api, EngineOffline, post, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { approx, meters, pct, tons } from "@/lib/format";
import { C, actionStyle } from "@/lib/theme";
import type { AparLive, Hub, WhatIfHub } from "@/lib/types";
import { getMap } from "./MapView";
import { MiniMd } from "./Copilot";

/** Hub üçün AI ilə rəsmi əsaslandırma sənədi (rəqəmlər yalnız hub kartından) */
function MemoButton({ hub }: { hub: Hub }) {
  const [md, setMd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ markdown?: string; error?: string }>("/copilot/memo", { method: "POST", body: JSON.stringify({ hub }) });
      setMd(r.markdown ?? r.error ?? "Sənəd alınmadı");
    } catch (e) {
      setMd((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    if (!md) return;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${hub.id}_esaslandirma.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="mt-3">
      <button onClick={run} disabled={busy} className="w-full rounded-[9px] border border-[var(--cobalt)] px-3 py-2 text-sm font-semibold text-[var(--cobalt)] transition-colors hover:bg-[var(--cobalt-tint)] disabled:opacity-50">
        {busy ? "Sənəd hazırlanır…" : "Əsaslandırma sənədi hazırla (AI)"}
      </button>
      {md && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-[10px] border border-[var(--line)] bg-[var(--surface2)] p-3">
          <MiniMd text={md} />
          <button onClick={download} className="mt-2 text-xs font-semibold text-[var(--cobalt)] underline">.md kimi yüklə</button>
        </div>
      )}
    </div>
  );
}

const STATUSES = ["Təklif", "Təsdiq gözləyir", "Təsdiqləndi", "Rədd edildi"];
type Src = "measured" | "model" | "scenario";
const SRC: Record<Src, { c: string; t: string }> = {
  measured: { c: C.ok, t: "ölçülmüş" },
  model: { c: C.cobalt, t: "model" },
  scenario: { c: "#8E9AA8", t: "ssenari" },
};

function Badge({ s }: { s: Src }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-[10.5px] font-semibold" style={{ color: SRC[s].c }} title={SRC[s].t}>
      <span className="h-1.5 w-1.5 rounded-full" style={s === "scenario" ? { boxShadow: `inset 0 0 0 1.5px ${SRC[s].c}` } : { background: SRC[s].c }} />
      {SRC[s].t}
    </span>
  );
}

function Row({ k, v, s, hint, sub }: { k: string; v: string; s?: Src; hint?: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-[7px] text-[13.5px] last:border-b-0">
      <dt className="text-[var(--muted)]" title={hint}>{k}{sub && <span className="mt-0.5 block text-[12px] text-[var(--muted)]/90">{sub}</span>}</dt>
      <dd className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">{v}{s && <Badge s={s} />}</dd>
    </div>
  );
}

/** Validator ekranı: mürəkkəb lövhə, həlledici rəqəm, qısa izah */
function Screen({ value, unit, caption, tag }: { value: string; unit?: string; caption: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <div className="ayan-screen px-4 pb-3 pt-3.5">
      <p className="ayan-lcd text-[2.9rem]">{value}{unit && <span className="ml-1 text-[1.15rem] font-bold text-[var(--ink-muted)]">{unit}</span>}</p>
      <p className="mt-2 text-[13px] leading-snug text-[var(--ink-text)]/85">{caption}</p>
      {tag && <div className="mt-2.5 flex items-center gap-2 border-t border-white/10 pt-2 text-[11.5px] font-semibold text-[var(--ink-muted)]">{tag}</div>}
    </div>
  );
}

/** Validator hökmü: yaşıl (yerləşdi) və ya kəhrəba (xəbərdarlıq) zolaq */
function Verdict({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  const c = tone === "ok" ? { fg: "var(--ok)", bg: "var(--ok-tint)", bd: "transparent" } : { fg: "var(--text)", bg: "transparent", bd: "#8E9AA8" };
  return (
    <div className="ayan-verdict mt-2 flex items-start gap-2 rounded-[9px] border px-2.5 py-2 text-[12.5px] font-semibold leading-snug" style={{ color: c.fg, background: c.bg, borderColor: c.bd }}>
      <svg aria-hidden viewBox="0 0 16 16" className="mt-[1px] h-4 w-4 shrink-0">
        {tone === "ok"
          ? <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M8 3.5v5.5M8 12v.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
      </svg>
      <span>{children}</span>
    </div>
  );
}

function fly(lon: number, lat: number) {
  const m = getMap()?.getMap();
  m?.flyTo({ center: [lon, lat], zoom: Math.max(m.getZoom(), 15), duration: 900 });
}

type Metrics = Pick<Hub, "pop_covered" | "pop_newly_served" | "transit_daily" | "trips_day" | "trips_gross_day" | "docks" | "type" | "co2_t_year" | "metro_stations" | "bus_routes" | "parkings_400"> &
  Partial<Pick<Hub, "rail_stations" | "official_hub">>;

function HubMetrics({ h }: { h: Metrics }) {
  return (
    <dl>
      <Row k="5 dəq. piyada zonasında əhali" v={approx(h.pop_covered)} s="model" hint="WorldPop 2026, real piyada şəbəkəsi" />
      <Row k="Yeni xidmət alan sakin" v={approx(h.pop_newly_served)} s="model" hint="Bu hub-dan əvvəl 400 m-də heç bir parkinqi olmayan sakinlər" />
      <Row k="Zonadakı nəqliyyat minikləri" v={`${approx(h.transit_daily)}/gün`} s="model" hint="Metro (ölçülmüş) + avtobus (BakuBus ölçülmüş, özəl marşrutlar proqnoz)" />
      {h.official_hub && <Row k="AYNA mübadilə mərkəzi" v={h.official_hub} s="measured" />}
      <Row k="Metro" v={h.metro_stations.length ? h.metro_stations.join(", ") : "yoxdur"} s="measured" />
      {!!h.rail_stations?.length && <Row k="Elektrik qatarı" v={h.rail_stations.join(", ")} s="measured" />}
      <Row k="Avtobus marşrutları (400 m)" v={String(h.bus_routes.length)} s="measured" hint="AYNA rəsmi marşrut–dayanacaq ardıcıllığı" />
      <Row k="Mövcud parkinqlər (400 m)" v={String(h.parkings_400)} s="measured" />
      <Row k="Əlavə səfər" v={`${approx(h.trips_day)}/gün`} s="model"
        hint="Yalnız mövcud parkinqlərin xidmət etmədiyi tələbat. AYNA sentyabr 2026 dövriyyəsi ilə kalibrlənib (12,2 səfər/nöqtə/gün)" />
      <Row k="Hub-un ümumi istifadəsi" v={`${approx(h.trips_gross_day)}/gün`} s="model" hint="Yer sayı bu rəqəmlə ölçülür" />
      <Row k="Tip və yer sayı" v={`${h.type} · ${h.docks} yer`} s="model" />
      <Row k="CO₂ qənaəti (əlavə səfərlər)" v={`${tons(h.co2_t_year.base)} t/il (${tons(h.co2_t_year.low)}–${tons(h.co2_t_year.high)})`} s="scenario" />
    </dl>
  );
}

type Visit = { line?: string; destination?: string; expected?: string; lon?: number; lat?: number };
type LiveStop = { code: string; name: string; dist_m: number; visits: Visit[] };

/** AYNA MaaS (SIRI) canlı gəlişləri: hub-a ən yaxın 4 dayanacaq, engine üzərindən (30 s keş). */
function LiveArrivals({ lon, lat }: { lon: number; lat: number }) {
  const online = useStore((s) => s.engineOnline);
  const [d, setD] = useState<{ enabled: boolean; has_live: boolean; stops: LiveStop[] } | null>(null);
  useEffect(() => {
    if (!online) return;
    let alive = true;
    const load = () =>
      api<{ enabled: boolean; has_live: boolean; stops: LiveStop[] }>(`/live/near?lon=${lon}&lat=${lat}`)
        .then((r) => alive && setD(r))
        .catch(() => alive && setD(null));
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [lon, lat, online]);
  if (!d?.enabled) return null;
  const mins = (iso?: string) => {
    if (!iso) return "";
    const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
    return m <= 0 ? "indi" : `${m} dəq`;
  };
  const now = Date.now();
  const visits = d.stops
    .flatMap((s) => s.visits.map((v) => ({ ...v, stop: s.name, t: v.expected ? new Date(v.expected).getTime() : Infinity })))
    .filter((v) => v.t >= now - 60000)
    .sort((a, b) => a.t - b.t)
    .slice(0, 6);
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface2)] p-2.5">
      <p className="flex items-center gap-2 text-xs font-bold">
        <span className={`ayan-led ${d.has_live ? "text-[var(--ok)]" : "text-[var(--muted)]"}`} />
        Canlı gəlişlər · AYNA
      </p>
      {visits.length ? (
        <ul className="mt-1.5 space-y-1 text-xs">
          {visits.map((v, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span><b>{v.line ?? "—"}</b> → {v.destination ?? "—"} <span className="text-[var(--muted)]">({v.stop})</span></span>
              <span className="tabular-nums">{mins(v.expected)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-[var(--muted)]">Yaxın {d.stops.length} dayanacağa hazırda yaxınlaşan avtobus yoxdur (və ya xidmət saatlarından kənardır).</p>
      )}
    </div>
  );
}

/** Canlı Apar vasitə sıxlığı: AYNA-nın öz parkinq şəbəkəsindən müstəqil, real bazar tələbatı sübutu */
function AparSignal({ d }: { d: AparLive }) {
  if (!d?.has_live) return null;
  const types = Object.entries(d.by_type ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface2)] p-2.5">
      <p className="flex items-center gap-2 text-xs font-bold">
        <span className="ayan-led text-[var(--ok)]" />
        Canlı Apar sıxlığı · 400 m
      </p>
      <p className="mt-1.5 text-xs">
        Hazırda <b>{d.count}</b> vasitə{types ? ` (${types})` : ""}{d.avg_charge != null ? `, orta enerji ${d.avg_charge}%` : ""}.
      </p>
      <p className="mt-1 text-[10px] text-[var(--muted)]">AYNA parkinq şəbəkəsindən ayrı operator (Apar/Tripy): real istifadəçi davranışı, müstəqil tələbat sübutu.</p>
    </div>
  );
}

function CityOverview({ data }: { data: StaticData }) {
  const m = data.metrics.hubs;
  const v = m.validation;
  const ring = data.metrics.value?.ring_auc?.ayna_parkings;
  const set = useStore((s) => s.set);
  return (
    <div className="space-y-4">
      <Screen value={pct(m.city.pop_without_parking_share, 0)}
        tag={<><span className="ayan-led text-[var(--deny)]" /> Bakı · son kilometr boşluğu</>}
        caption={<>Analiz zonasındakı sakinlərin (<b className="text-white">{approx(m.city.pop_without_parking_400m)} nəfər</b>) 5 dəqiqəlik piyada məsafəsində heç bir velosiped və ya scooter parkinqi yoxdur.</>} />
      <dl>
        <Row k="Metro çıxışı, yanında parkinq yoxdur" v={`${m.city.metro_exits_without_parking_400m} / ${m.city.metro_exits_total}`} s="measured" />
        <Row k="MPV məntəqələri MPS şəbəkəsinin yanında" sub={`təsadüfi sakin üçün ${pct(v.mpv_vs_mps.random_resident_share_within_400m)}`} v={pct(v.mpv_vs_mps.share_within_400m)} s="measured"
          hint="Yeni məntəqələr artıq xidmət olunan ərazilərdə toplanır" />
        {ring ? (
          <Row k="Tələbat modeli AYNA seçimlərini tanıyır" v={`AUC ${ring.D.auc.toFixed(2).replace(".", ",")}`} s="model"
            hint={`Mərkəz effekti çıxılmaqla (1 km halqalar); təkcə mərkəzə yaxınlıq ${ring["yalnız_mərkəzə_yaxınlıq"].auc.toFixed(2).replace(".", ",")}`} />
        ) : (
          <Row k="Tələbat modeli AYNA seçimlərini tanıyır" v={`AUC ${String(v.demand_auc_within_8km.D).replace(".", ",")}`} s="model"
            hint={`Mərkəzdən 8 km halqasında; təkcə mərkəzə yaxınlıq ${v.demand_auc_within_8km["yalnız_mərkəzə_yaxınlıq"]}, təkcə əhali ${v.demand_auc_within_8km.pop_n}`} />
        )}
        {v.official_hub_recall && (
          <Row k="Model AYNA mübadilə mərkəzlərini özü tapır" sub={`təsadüfi seçim: ${(v.official_hub_recall.by_k["20"].random * v.official_hub_recall.n_official).toFixed(1).replace(".", ",")}`} v={`${Math.round(v.official_hub_recall.by_k["20"].model * v.official_hub_recall.n_official)} / ${v.official_hub_recall.n_official}`} s="model"
            hint="Top-20 hub, rəsmi hub namizədləri çıxarılmaqla; model “hub” bayrağını bilmir" />
        )}
        <Row k="İlk 20 hub xidmətsiz tələbatı bağlayır" v={pct(m.mclp.share_closed["20"])} s="model" />
      </dl>
      <button onClick={() => set({ placing: true, toast: "Xəritədə hub qoymaq istədiyiniz yerə klikləyin" })}
        className="ayan-btn-primary w-full px-3 py-2.5 text-[14px]">
        Öz hub-unuzu yoxlayın
      </button>
      <p className="text-xs text-[var(--muted)]">Xəritədə hub-a və ya avtovağzala klikləyin: göstəricilər burada açılacaq.</p>
    </div>
  );
}

export default function Inspector({ data }: { data: StaticData }) {
  const s = useStore();
  const hubs = s.optimized ?? data.hubs.hubs;
  const sel = s.selected;
  const hub = sel?.kind === "hub" ? hubs.find((h) => h.rank === sel.rank) : undefined;
  const wi = sel?.kind === "whatif" ? s.whatIf.find((h) => h.key === sel.key) : undefined;
  const st = sel?.kind === "station" ? data.hubs.arrival.find((a) => a.id === sel.id) : undefined;
  const offline = (wi as unknown as { offline?: boolean } | undefined)?.offline;

  const fail = (e: unknown) =>
    e instanceof EngineOffline
      ? s.set({ engineOnline: false, toast: "Geo Engine əlçatan deyil: dəyişiklik saxlanmadı" })
      : s.set({ toast: (e as Error).message });

  const setStatus = async (id: string, status: string) => {
    if (!s.engineOnline) return s.set({ toast: "Status dəyişikliyi Geo Engine tələb edir" });
    try {
      await api(`/hubs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      s.set({ statuses: { ...s.statuses, [id]: status }, toast: `Status yeniləndi: ${status}` });
    } catch (e) {
      fail(e);
    }
  };

  const saveWhatIf = async (h: WhatIfHub) => {
    if (!s.engineOnline) return s.set({ toast: "Təklifi saxlamaq Geo Engine tələb edir" });
    try {
      const r = await post<{ id: string; status: string }>("/hubs", {
        label: `İstifadəçi təklifi (${h.lat.toFixed(4)}, ${h.lon.toFixed(4)})`, lon: h.lon, lat: h.lat, type: h.type, docks: h.docks, action: "new",
        data: { pop_newly_served: h.pop_newly_served, trips_day: h.trips_day, co2_t_year: h.co2_t_year },
      });
      s.set({ statuses: { ...s.statuses, [r.id]: r.status }, toast: `Təklif saxlandı: ${r.id}` });
    } catch (e) {
      fail(e);
    }
  };

  const removeWhatIf = (key: string) => s.set({ whatIf: s.whatIf.filter((x) => x.key !== key), selected: null });

  return (
    <aside className="ayan-card absolute right-4 top-[5.25rem] z-20 max-h-[calc(100%-16rem)] w-[22.5rem] overflow-y-auto p-4" aria-label="Göstəricilər">
      {sel && (
        <button onClick={() => s.set({ selected: null })} className="mb-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--muted)] hover:text-[var(--cobalt)]"><svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Şəhər üzrə göstəricilər</button>
      )}

      {!sel && <CityOverview data={data} />}

      {hub && (
        <div>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-extrabold"
              style={{ background: actionStyle(hub.action).fill, color: actionStyle(hub.action).text,
                boxShadow: actionStyle(hub.action).outer ? `inset 0 0 0 3px #fff, 0 0 0 3px ${actionStyle(hub.action).outer}` : actionStyle(hub.action).ring === "#FFFFFF" ? "0 0 0 1px var(--line)" : `inset 0 0 0 3px ${actionStyle(hub.action).ring}` }}>{hub.rank}</span>
            <div>
              <h2 className="text-[18px] font-bold leading-tight tracking-tight">{hub.label}</h2>
              <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                {{ new: "Yeni hub: 150 m daxilində parkinq yoxdur",
                   upgrade: "Hub-a çevrilmə: yaxındakı parkinq nəqliyyatla inteqrasiya olunur",
                   integrate: "AYNA mübadilə mərkəzinə mikromobillik inteqrasiyası" }[hub.action]}
                {" · "}
                {{ metro: "metro çıxışı", bus_station: "avtovağzal", parking: "mövcud parkinq", bus_stop: "avtobus dayanacağı",
                   rail_station: "qatar stansiyası", official_hub: "AYNA mübadilə mərkəzi" }[hub.anchor_kind]}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Screen value={approx(hub.pop_newly_served)} unit="sakin"
              tag={<><span className="ayan-led text-[var(--ok)]" /> Tikinti sırası #{hub.rank} · tip {hub.type}</>}
              caption="ilk dəfə 5 dəqiqəlik piyada məsafəsində velo/scooter parkinqi qazanır" />
          </div>
          <div className="mt-2"><HubMetrics h={hub} /></div>
          <LiveArrivals lon={hub.lon} lat={hub.lat} />
          {hub.stability != null && hub.rank <= 20 && (
            <Row k="Stabillik: çəkilər ±30% dəyişəndə top-20-də qalır" v={pct(hub.stability)} s="model" hint="500 təsadüfi ssenari" />
          )}
          {hub.qa && <p className="mt-2 text-xs leading-snug text-[var(--muted)]">Yerləşdirmə: {hub.qa}{hub.offset_m ? ` (nəqliyyat düyünündən ${hub.offset_m} m)` : ""}.</p>}
          {!s.optimized && (
            <label className="mt-3 block text-sm">
              <span className="text-[var(--muted)]">Təsdiq statusu</span>
              <select value={s.statuses[hub.id] ?? "Təklif"} onChange={(e) => setStatus(hub.id, e.target.value)} disabled={!s.engineOnline}
                className="mt-1 w-full rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-2 py-2 font-semibold disabled:opacity-50">
                {STATUSES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={() => fly(hub.lon, hub.lat)} className="flex-1 rounded-[9px] border border-[var(--line)] px-3 py-2 text-[13px] font-semibold hover:bg-[var(--surface2)]">Xəritədə göstər</button>
            <a href={`https://www.google.com/maps/@${hub.lat},${hub.lon},60m/data=!3m1!1e3`} target="_blank" rel="noreferrer"
              className="flex-1 rounded-[9px] border border-[var(--line)] px-3 py-2 text-center text-[13px] font-semibold hover:bg-[var(--surface2)]">Peyk görüntüsündə yoxla</a>
          </div>
          {s.engineOnline && <MemoButton hub={hub} />}
          {!s.optimized && <p className="mt-2 font-mono text-[10px] text-[var(--muted)]">{hub.id}</p>}
        </div>
      )}

      {wi && (
        <div>
          <h2 className="text-[18px] font-bold tracking-tight">Sizin hub təklifiniz</h2>
          {offline ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Geo Engine əlçatan deyil. Xəritədə 400 m düz xətt buferi göstərilir. Real küçə izoxronu və göstəricilər engine qoşulanda hesablanır.</p>
          ) : (
            <>
              <Verdict tone="ok" key={wi.key}>
                Hub yerləşdirildi · real piyada izoxronu {wi.ms} ms
                {wi.moved_m > 0 && <span className="font-medium"> · icazəli yerə {wi.moved_m} m köçürüldü</span>}
              </Verdict>
              {!wi.near_transit_60m && (
                <Verdict tone="warn">60 m daxilində metro, avtobus dayanacağı və ya avtovağzal yoxdur. Hub keçid nöqtəsi kimi zəif işləyəcək.</Verdict>
              )}
              <div className="mt-3">
                <Screen value={approx(wi.pop_newly_served)} unit="sakin" tag={<><span className="ayan-led text-[var(--ok)]" /> Tip {wi.type} · {wi.docks} yer</>}
                  caption="bu nöqtədə hub qurulsa, ilk dəfə 5 dəqiqəlik çıxış qazanır" />
              </div>
              <div className="mt-2"><HubMetrics h={wi} /></div>
              <AparSignal d={wi.apar_live} />
            </>
          )}
          <div className="mt-3 flex gap-2">
            {!offline && <button onClick={() => saveWhatIf(wi)} className="ayan-btn-primary flex-1 px-3 py-2.5 text-sm">Təklif kimi saxla</button>}
            <button onClick={() => removeWhatIf(wi.key)} className="rounded-[9px] border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:border-[var(--deny)] hover:text-[var(--deny)]">Sil</button>
          </div>
        </div>
      )}

      {st && (
        <div>
          <h2 className="text-[18px] font-bold leading-tight tracking-tight">{st.name}</h2>
          <div className="mt-3">
            <Screen value={String(st.score).replace(".", ",")} unit="/ 5"
              tag={<><span className={`ayan-led ${st.score >= 2.5 ? "text-[#8E9AA8]" : "text-[var(--deny)]"}`} /> Avtovağzal · gəliş balı</>}
              caption="Şəhərə çatan sərnişin son kilometri nə ilə qət edə bilər" />
          </div>
          <dl className="mt-3">
            <Row k="Metroya piyada" v={meters(st.metro_walk_m)} s="measured" />
            <Row k="Avtobus marşrutları (400 m)" v={String(st.bus_routes_400)} s="measured" />
            <Row k="Şəhərlərarası marşrutlar" v={String(st.intercity_routes ?? 0)} s="measured" hint="AYNA xəritə API-si" />
            <Row k="Ən yaxın parkinq" v={meters(st.parking_walk_m)} s="measured" />
            <Row k="Ən yaxın velo-zolaq" v={meters(st.lane_walk_m)} s="measured" />
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Bal: metro 35% (300 m → tam, 800 m → 0), avtobus 25% (20+ marşrut → tam), parkinq 25% (150 → 400 m), velo-zolaq 15% (200 → 800 m).
            Məsafələr avtovağzal binasının konturundan, real piyada şəbəkəsi ilə ölçülüb.
          </p>
        </div>
      )}
    </aside>
  );
}
