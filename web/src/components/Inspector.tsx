"use client";

import { api, EngineOffline, post, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { approx, meters, pct, tons } from "@/lib/format";
import { C } from "@/lib/theme";
import type { Hub, WhatIfHub } from "@/lib/types";
import { getMap } from "./MapView";

const STATUSES = ["Təklif", "Təsdiq gözləyir", "Təsdiqləndi", "Rədd edildi"];
type Src = "measured" | "model" | "scenario";
const SRC: Record<Src, { c: string; t: string }> = {
  measured: { c: C.bike, t: "ölçülmüş" },
  model: { c: C.hub, t: "model" },
  scenario: { c: "#C8D3D8", t: "ssenari" },
};

function Badge({ s }: { s: Src }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-[10px] text-[var(--muted)]" title={SRC[s].t}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: SRC[s].c }} />
      {SRC[s].t}
    </span>
  );
}

function Row({ k, v, s, hint }: { k: string; v: string; s?: Src; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)]/60 py-1.5 text-sm">
      <dt className="text-[var(--muted)]" title={hint}>{k}</dt>
      <dd className="text-right tabular-nums">{v}{s && <Badge s={s} />}</dd>
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

function CityOverview({ data }: { data: StaticData }) {
  const m = data.metrics.hubs;
  const v = m.validation;
  const set = useStore((s) => s.set);
  return (
    <div className="space-y-4">
      <div>
        <p className="font-display text-[2.6rem] font-bold leading-none tabular-nums">{pct(m.city.pop_without_parking_share, 0)}</p>
        <p className="mt-1.5 text-sm leading-snug">
          Analiz zonasındakı sakinlərin ({approx(m.city.pop_without_parking_400m)} nəfər) 5 dəqiqəlik piyada məsafəsində heç bir velosiped və ya scooter parkinqi yoxdur.
        </p>
      </div>
      <dl>
        <Row k="Metro çıxışı, yanında parkinq yoxdur" v={`${m.city.metro_exits_without_parking_400m} / ${m.city.metro_exits_total}`} s="measured" />
        <Row k="MPV məntəqələri MPS şəbəkəsinin yanında" v={`${pct(v.mpv_vs_mps.share_within_400m)} (təsadüfi: ${pct(v.mpv_vs_mps.random_resident_share_within_400m)})`} s="measured"
          hint="Yeni məntəqələr artıq xidmət olunan ərazilərdə toplanır" />
        <Row k="Tələbat modeli AYNA seçimlərini tanıyır" v={`AUC ${String(v.demand_auc_within_8km.D).replace(".", ",")}`} s="model"
          hint={`Mərkəzdən 8 km halqasında; təkcə mərkəzə yaxınlıq ${v.demand_auc_within_8km["yalnız_mərkəzə_yaxınlıq"]}, təkcə əhali ${v.demand_auc_within_8km.pop_n}`} />
        {v.official_hub_recall && (
          <Row k="Model AYNA mübadilə mərkəzlərini özü tapır" v={`${Math.round(v.official_hub_recall.by_k["20"].model * v.official_hub_recall.n_official)} / ${v.official_hub_recall.n_official} (təsadüfi: ${(v.official_hub_recall.by_k["20"].random * v.official_hub_recall.n_official).toFixed(1).replace(".", ",")})`} s="model"
            hint="Top-20 hub, rəsmi hub namizədləri çıxarılmaqla; model “hub” bayrağını bilmir" />
        )}
        <Row k="İlk 20 hub xidmətsiz tələbatı bağlayır" v={pct(m.mclp.share_closed["20"])} s="model" />
      </dl>
      <button onClick={() => set({ placing: true, toast: "Xəritədə hub qoymaq istədiyiniz yerə klikləyin" })}
        className="w-full rounded border border-[var(--hub)] px-3 py-2 text-sm font-semibold text-[var(--hub)] hover:bg-[var(--hub)] hover:text-[var(--bg)]">
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
    <aside className="absolute right-4 top-20 z-20 max-h-[calc(100%-15rem)] w-[22rem] overflow-y-auto rounded-md bg-[var(--surface)]/95 p-4 shadow-xl ring-1 ring-[var(--line)]" aria-label="Göstəricilər">
      {sel && (
        <button onClick={() => s.set({ selected: null })} className="mb-2 text-xs text-[var(--muted)] hover:text-[var(--text)]">← Şəhər üzrə göstəricilər</button>
      )}

      {!sel && <CityOverview data={data} />}

      {hub && (
        <div>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-base font-bold text-[var(--bg)]"
              style={{ background: hub.action === "new" ? C.hub : hub.action === "integrate" ? C.station : C.upgrade }}>{hub.rank}</span>
            <div>
              <h2 className="font-display text-lg font-semibold leading-tight">{hub.label}</h2>
              <p className="text-xs text-[var(--muted)]">
                {{ new: "Yeni hub: 150 m daxilində parkinq yoxdur",
                   upgrade: "Hub-a çevrilmə: yaxındakı parkinq nəqliyyatla inteqrasiya olunur",
                   integrate: "AYNA mübadilə mərkəzinə mikromobillik inteqrasiyası" }[hub.action]}
                {" · "}
                {{ metro: "metro çıxışı", bus_station: "avtovağzal", parking: "mövcud parkinq", bus_stop: "avtobus dayanacağı",
                   rail_station: "qatar stansiyası", official_hub: "AYNA mübadilə mərkəzi" }[hub.anchor_kind]}
              </p>
            </div>
          </div>
          <div className="mt-3"><HubMetrics h={hub} /></div>
          {hub.stability != null && hub.rank <= 20 && (
            <Row k="Stabillik: çəkilər ±30% dəyişəndə top-20-də qalır" v={pct(hub.stability)} s="model" hint="500 təsadüfi ssenari" />
          )}
          {hub.qa && <p className="mt-2 text-xs leading-snug text-[var(--muted)]">Yerləşdirmə: {hub.qa}{hub.offset_m ? ` (nəqliyyat düyünündən ${hub.offset_m} m)` : ""}.</p>}
          {!s.optimized && (
            <label className="mt-3 block text-sm">
              <span className="text-[var(--muted)]">Təsdiq statusu</span>
              <select value={s.statuses[hub.id] ?? "Təklif"} onChange={(e) => setStatus(hub.id, e.target.value)} disabled={!s.engineOnline}
                className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface2)] px-2 py-1.5 disabled:opacity-50">
                {STATUSES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={() => fly(hub.lon, hub.lat)} className="flex-1 rounded border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface2)]">Xəritədə göstər</button>
            <a href={`https://www.google.com/maps/@${hub.lat},${hub.lon},60m/data=!3m1!1e3`} target="_blank" rel="noreferrer"
              className="flex-1 rounded border border-[var(--line)] px-3 py-1.5 text-center text-sm hover:bg-[var(--surface2)]">Peyk görüntüsündə yoxla</a>
          </div>
          {!s.optimized && <p className="mt-2 font-mono text-[10px] text-[var(--muted)]">{hub.id}</p>}
        </div>
      )}

      {wi && (
        <div>
          <h2 className="font-display text-lg font-semibold">Sizin hub təklifiniz</h2>
          {offline ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Geo Engine əlçatan deyil. Xəritədə 400 m düz xətt buferi göstərilir. Real küçə izoxronu və göstəricilər engine qoşulanda hesablanır.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Real piyada izoxronu {wi.ms} ms-də hesablandı.
                {wi.moved_m > 0 && ` Hub icazəli yerə ${wi.moved_m} m köçürüldü.`}
              </p>
              {!wi.near_transit_60m && (
                <p className="mt-2 rounded border border-[var(--hub)]/60 px-2 py-1.5 text-xs text-[var(--hub)]">
                  60 m daxilində metro, avtobus dayanacağı və ya avtovağzal yoxdur. Hub keçid nöqtəsi kimi zəif işləyəcək.
                </p>
              )}
              <div className="mt-3"><HubMetrics h={wi} /></div>
            </>
          )}
          <div className="mt-3 flex gap-2">
            {!offline && <button onClick={() => saveWhatIf(wi)} className="flex-1 rounded bg-[var(--hub)] px-3 py-2 text-sm font-semibold text-[var(--bg)]">Təklif kimi saxla</button>}
            <button onClick={() => removeWhatIf(wi.key)} className="rounded border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]">Sil</button>
          </div>
        </div>
      )}

      {st && (
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight">{st.name}</h2>
          <p className="mt-2 font-display text-5xl font-bold tabular-nums">{String(st.score).replace(".", ",")}<span className="text-xl text-[var(--muted)]"> / 5</span></p>
          <p className="text-sm text-[var(--muted)]">Gəliş balı: şəhərə çatan sərnişin son kilometri nə ilə qət edə bilər</p>
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
