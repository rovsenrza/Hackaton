"use client";

import { ENGINE, post, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { approx, int, meters, pct, tons } from "@/lib/format";
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
  getMap()?.getMap().flyTo({ center: [lon, lat], zoom: Math.max(getMap()?.getMap().getZoom() ?? 14, 15), duration: 900 });
}

function HubMetrics({ h }: { h: Pick<Hub, "pop_covered" | "pop_unserved_covered" | "transit_daily" | "trips_day" | "docks" | "type" | "co2_t_year" | "metro_stations" | "bus_routes" | "parkings_400" | "bus_station"> }) {
  return (
    <dl>
      <Row k="5 dəq. piyada zonasında əhali" v={approx(h.pop_covered)} s="model" hint="WorldPop 2026, real piyada şəbəkəsi" />
      <Row k="Onlardan parkinqə çıxışı olmayan" v={approx(h.pop_unserved_covered)} s="model" />
      <Row k="Zonadakı nəqliyyat minikləri" v={`${approx(h.transit_daily)}/gün`} s="model" hint="Metro 🟢 + avtobus (BakuBus 🟢, özəl 🟡)" />
      <Row k="Metro" v={h.metro_stations.length ? h.metro_stations.join(", ") : "yoxdur"} s="measured" />
      <Row k="Avtobus marşrutları (400 m)" v={String(h.bus_routes.length)} s="measured" />
      <Row k="Mövcud parkinqlər (400 m)" v={String(h.parkings_400)} s="measured" />
      <Row k="Gözlənilən səfər" v={`${approx(h.trips_day)}/gün`} s="model" hint="AYNA sentyabr 2026 datası ilə kalibrlənib: 12,2 səfər/nöqtə/gün" />
      <Row k="Tip və yer sayı" v={`${h.type} · ${h.docks} yer`} s="model" />
      <Row k="CO₂ qənaəti" v={`${tons(h.co2_t_year.base)} t/il (${tons(h.co2_t_year.low)}–${tons(h.co2_t_year.high)})`} s="scenario" />
    </dl>
  );
}

function CityOverview({ data }: { data: StaticData }) {
  const m = data.metrics.hubs;
  const city = m.city;
  const v = m.validation;
  const set = useStore((s) => s.set);
  return (
    <div className="space-y-4">
      <div>
        <p className="font-display text-[2.6rem] font-bold leading-none tabular-nums">{pct(city.pop_without_parking_share, 0)}</p>
        <p className="mt-1.5 text-sm leading-snug">
          Bakı sakinlərinin ({approx(city.pop_without_parking_400m)} nəfər) 5 dəqiqəlik piyada məsafəsində heç bir velosiped və ya scooter parkinqi yoxdur.
        </p>
      </div>
      <dl>
        <Row k="Metro çıxışı, yanında parkinq yoxdur" v={`${city.metro_exits_without_parking_400m} / ${city.metro_exits_total}`} s="measured" />
        <Row k="Sentyabrda yeni parkinqlər" v={`${pct(v.sep_expansion.share_within_400m_of_existing)} mövcudların yanında`} s="measured"
          hint="AYNA 124 yeni parkinqin medianı mövcud parkinqdən 35 m-dədir: şəbəkə sıxlaşır, boşluqlar bağlanmır" />
        <Row k="Tələbat indeksinin AYNA seçimləri ilə uyğunluğu" v={`AUC ${String(v.demand_auc_vs_ayna_parkings.D).replace(".", ",")}`} s="model" />
        <Row k="Boşluq bağlansa, əlavə səfər" v={`${approx(city.gap_potential_trips_day)}/gün`} s="scenario" />
        <Row k="Boşluq bağlansa, CO₂ qənaəti" v={`${int(city.gap_potential_co2_t_year.base)} t/il`} s="scenario" />
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

  const setStatus = async (id: string, status: string) => {
    if (!s.engineOnline) return s.set({ toast: "Status dəyişikliyi Geo Engine tələb edir" });
    const r = await fetch(`${ENGINE}/hubs/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (r.ok) s.set({ statuses: { ...s.statuses, [id]: status }, toast: `Status yeniləndi: ${status}` });
  };

  const saveWhatIf = async (h: WhatIfHub) => {
    if (!s.engineOnline) return s.set({ toast: "Təklifi yadda saxlamaq Geo Engine tələb edir" });
    const r = await post<{ id: string; status: string }>("/hubs", {
      label: `İstifadəçi təklifi (${h.lat.toFixed(4)}, ${h.lon.toFixed(4)})`, lon: h.lon, lat: h.lat, type: h.type, docks: h.docks, action: "new",
      data: { pop_unserved_covered: h.pop_unserved_covered, trips_day: h.trips_day, co2_t_year: h.co2_t_year },
    });
    s.set({ statuses: { ...s.statuses, [r.id]: r.status }, toast: `Təklif yadda saxlandı: ${r.id}` });
  };

  return (
    <aside className="absolute right-4 top-20 bottom-44 z-20 w-[22rem] overflow-y-auto rounded-md bg-[var(--surface)]/95 p-4 shadow-xl ring-1 ring-[var(--line)]" aria-label="Göstəricilər">
      {sel && (
        <button onClick={() => s.set({ selected: null })} className="mb-2 text-xs text-[var(--muted)] hover:text-[var(--text)]">← Şəhər üzrə göstəricilər</button>
      )}

      {!sel && <CityOverview data={data} />}

      {hub && (
        <div>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-base font-bold text-[var(--bg)]"
              style={{ background: hub.action === "new" ? C.hub : C.upgrade }}>{hub.rank}</span>
            <div>
              <h2 className="font-display text-lg font-semibold leading-tight">{hub.label}</h2>
              <p className="text-xs text-[var(--muted)]">
                {hub.action === "new" ? "Yeni hub: burada heç bir parkinq yoxdur" : "Hub-a çevrilmə: mövcud parkinq inteqrasiya olunur"} · {hub.anchor_kind === "metro" ? "metro çıxışı" : hub.anchor_kind === "bus_station" ? "avtovağzal" : hub.anchor_kind === "parking" ? "mövcud parkinq" : "avtobus dayanacağı"}
              </p>
            </div>
          </div>
          <div className="mt-3"><HubMetrics h={hub} /></div>
          {hub.stability != null && <Row k="Stabillik (çəkilər ±30%, 500 dəfə)" v={pct(hub.stability)} s="model" />}
          <Row k="Boşluğun bağlanan payı" v={pct(hub.gain_share, 2)} s="model" />
          {hub.qa && <p className="mt-2 text-xs leading-snug text-[var(--muted)]">Yerləşdirmə yoxlaması: {hub.qa}{hub.offset_m ? `, düyündən ${hub.offset_m} m` : ""}.</p>}
          {!s.optimized && (
            <label className="mt-3 block text-sm">
              <span className="text-[var(--muted)]">Təsdiq statusu</span>
              <select value={s.statuses[hub.id] ?? "Təklif"} onChange={(e) => setStatus(hub.id, e.target.value)}
                className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface2)] px-2 py-1.5">
                {STATUSES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={() => fly(hub.lon, hub.lat)} className="flex-1 rounded border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--surface2)]">Xəritədə göstər</button>
            <a href={`https://www.google.com/maps/@${hub.lat},${hub.lon},60m/data=!3m1!1e3`} target="_blank" rel="noreferrer"
              className="flex-1 rounded border border-[var(--line)] px-3 py-1.5 text-center text-sm hover:bg-[var(--surface2)]">Peyk görüntüsündə yoxla</a>
          </div>
          <p className="mt-2 font-mono text-[10px] text-[var(--muted)]">{hub.id}</p>
        </div>
      )}

      {wi && (
        <div>
          <h2 className="font-display text-lg font-semibold">Sizin hub təklifiniz</h2>
          {(wi as unknown as { offline?: boolean }).offline ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Engine əlçatan deyil. Xəritədə 400 m düz xətt buferi göstərilir, real küçə şəbəkəsi üzrə izoxron və göstəricilər Geo Engine ilə hesablanır.</p>
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
              <div className="mt-3 flex gap-2">
                <button onClick={() => saveWhatIf(wi)} className="flex-1 rounded bg-[var(--hub)] px-3 py-2 text-sm font-semibold text-[var(--bg)]">Təklif kimi saxla</button>
                <button onClick={() => s.set({ whatIf: s.whatIf.filter((x) => x.key !== wi.key), selected: null })}
                  className="rounded border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]">Sil</button>
              </div>
            </>
          )}
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
            <Row k="Ən yaxın parkinq" v={meters(st.parking_walk_m)} s="measured" />
            <Row k="Ən yaxın velo-zolaq" v={meters(st.lane_walk_m)} s="measured" />
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">Bal: metro 35%, avtobus 25%, parkinq 25%, velo-zolaq 15%. Məsafələr real piyada şəbəkəsi ilə ölçülüb.</p>
        </div>
      )}
    </aside>
  );
}
