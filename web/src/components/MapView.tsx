"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { useControl, type MapRef } from "react-map-gl/maplibre";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { GeoJsonLayer, IconLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { H3HexagonLayer, TripsLayer } from "@deck.gl/geo-layers";
import { AmbientLight, DirectionalLight, LightingEffect, type PickingInfo } from "@deck.gl/core";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import type { StyleSpecification } from "maplibre-gl";
import circle from "@turf/circle";
import "maplibre-gl/dist/maplibre-gl.css";

import { EngineOffline, post, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { ACTION_LABEL, C, GAP_STOPS, actionColor, rgb, type RGBA } from "@/lib/theme";
import type { H3Row, Hub, WhatIfHub } from "@/lib/types";
import { approx } from "@/lib/format";
import { BASEMAP_URL, BEFORE_LABELS, BEFORE_ROADS, BUILDINGS_3D, loadCaspianStyle } from "./map/basemap";
import { icon } from "./map/symbols";
import { PLAYBACK, buildFleet, updateFleet, type Bus } from "./map/buses";
import { BUS_MESH, HUB_CANOPY, HUB_DIM, HUB_STRUCT, HUB_TOP_M } from "./map/meshes";
import { declutter, square, textW, worldPx, type Box, type Candidate } from "./map/declutter";

export const BASEMAP = BASEMAP_URL;
export const BAKU_VIEW = { longitude: 49.86, latitude: 40.405, zoom: 11.2, pitch: 0, bearing: 0 };
let mapInstance: MapRef | null = null;
export const getMap = () => mapInstance;

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

type Path = { path: [number, number][]; route: string; pax: number; status: string };
type Pt = { position: [number, number]; p: Record<string, unknown> };
type MetroStation = { position: [number, number]; name: string; pax: number; exits: number };

function flattenLines(fc: GeoJSON.FeatureCollection): Path[] {
  const out: Path[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const l of lines)
      out.push({ path: l as [number, number][], route: String(p.route ?? p.name ?? ""), pax: Number(p.pax ?? 0), status: String(p.pax_status ?? "") });
  }
  return out;
}

function points(fc: GeoJSON.FeatureCollection | undefined): Pt[] {
  const out: Pt[] = [];
  for (const f of fc?.features ?? []) {
    if (f.geometry?.type !== "Point") continue;
    const [x, y] = f.geometry.coordinates;
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ position: [x, y], p: (f.properties ?? {}) as Record<string, unknown> });
  }
  return out;
}

// Kvantil sinifləri: legend ilə eyni sərhədlər
export const FIXED_BREAKS: Partial<Record<string, number[]>> = { gap: [0.2, 0.4, 0.6, 0.8] };

// İsti nöqtə sinifləri: aşağı siniflər solğun, ən yüksək 5% parlaq
export const HOT_PROBS = [0.5, 0.7, 0.85, 0.95];
export function quantileBreaks(vals: number[], probs = HOT_PROBS): number[] {
  const s = vals.filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return [0];
  return probs.map((p) => s[Math.floor(p * (s.length - 1))]);
}

export const METRIC_IDX = { pop: 1, transit: 2, D: 3, w: 4, gap: 5 } as const;

const MODE_AZ: Record<string, string> = { city_bus: "şəhər avtobusu", intercity_bus: "şəhərlərarası avtobus", suburban_bus: "şəhərətrafı avtobus", bus: "avtobus", metro: "metro", rail: "elektrik qatarı", train: "elektrik qatarı", bike: "velosiped", taxi: "taksi", ferry: "bərə" };

// ADY məlumatında adlar latın transliterasiyasındadır: ekranda azərbaycanca göstərilir
const RAIL_AZ: Record<string, string> = {
  Baku: "Bakı", Bakikhanov: "Bakıxanov", Bilajari: "Biləcəri", Goradil: "Goradil", Keshle: "Keşlə", Khirdalan: "Xırdalan",
  Koroghlu: "Koroğlu", Mammadli: "Məmmədli", Novkhani: "Novxanı", Pirshaghi: "Pirşağı", Sabunchu: "Sabunçu", Zabrat1: "Zabrat-1", Zabrat2: "Zabrat-2",
};
const railName = (p: Record<string, unknown>) => {
  const n = String(p.name ?? "");
  return RAIL_AZ[n] ?? n;
};
/** Xəritə yazısı üçün qısa ad: "Koroğlu Nəqliyyat Mübadilə Mərkəzi" → "Koroğlu NMM" */
const officialShort = (p: Record<string, unknown>) =>
  String(p.name ?? "")
    .replace(/\s*Nəqliyyat\s+Mübadilə\s+(Mərkəzi|Məntəqəsi)\s*$/i, " NMM")
    .replace(/\s*metro stansiyası\s*$/i, " NMM")
    .trim();

// 3D əkiz üçün işıqlandırma: yumşaq ətraf işığı + cənub-qərbdən axşam günəşi
const LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [235, 242, 250], intensity: 0.75 }),
  sun: new DirectionalLight({ color: [255, 236, 210], intensity: 1.05, direction: [-1.2, -3, -4] }),
  fill: new DirectionalLight({ color: [120, 175, 210], intensity: 0.35, direction: [2, 3, -2] }),
});
const NO_EFFECTS: LightingEffect[] = [];
// 3D sütunlar üçün daha tünd, doymuş variant (işıqlandırma altında solmasın)
const TWIN_STOPS: RGBA[] = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [96, 34, 112, 255],
  [128, 38, 128, 255],
  [196, 62, 132, 255],
  [236, 112, 146, 255],
];
/** interleaved rejimdə baza xəritəsinin hansı qatından əvvəl çəkiləcəyi (@deck.gl/mapbox) */
type Before = { beforeId?: string };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const HUB_R = { S: 6, M: 7.5, L: 9.5 } as const;

export default function MapView({ data }: { data: StaticData }) {
  const s = useStore();
  const [time, setTime] = useState(0);
  const [zoom, setZoom] = useState(BAKU_VIEW.zoom);
  const zoomRef = useRef(BAKU_VIEW.zoom);
  const raf = useRef<number | null>(null);
  const [style, setStyle] = useState<StyleSpecification | string | null>(null);
  useEffect(() => {
    let alive = true;
    loadCaspianStyle().then((st) => alive && setStyle(st));
    return () => {
      alive = false;
    };
  }, []);
  const font = useMemo(() => {
    if (typeof document === "undefined") return "Archivo, sans-serif";
    return getComputedStyle(document.body).fontFamily || "Archivo, sans-serif";
  }, []);

  // --- avtobus axını (yalnız 3D rəqəmsal əkiz): simulyasiya, real GPS deyil ---
  const routePaths = useMemo(() => flattenLines(data.routes), [data.routes]);
  const trips = useMemo(() => {
    const out: { path: [number, number][]; ts: number[]; pax: number }[] = [];
    const SPEED = 9; // m/s (vizual sürət)
    for (const r of routePaths) {
      const ts = [0];
      for (let i = 1; i < r.path.length; i++) {
        const [x0, y0] = r.path[i - 1];
        const [x1, y1] = r.path[i];
        const dx = (x1 - x0) * 111320 * Math.cos((y0 * Math.PI) / 180);
        const dy = (y1 - y0) * 110540;
        ts.push(ts[i - 1] + Math.hypot(dx, dy) / SPEED);
      }
      const veh = Math.max(1, Math.min(10, Math.round(r.pax / 1800)));
      const T = ts[ts.length - 1];
      for (let k = 0; k < veh; k++) out.push({ path: r.path, ts: ts.map((t) => t + (k * T) / veh), pax: r.pax });
    }
    return out;
  }, [routePaths]);
  const loop = 3600;
  // 3D avtobuslar: real marşrut həndəsəsi + sərnişinə görə park bölgüsü (simulyasiya)
  const fleet = useMemo(() => buildFleet(data.routes), [data.routes]);
  const busClock = useRef(performance.now());

  useEffect(() => {
    if (s.mode !== "twin") return;
    const t0 = performance.now();
    const tick = () => {
      setTime((((performance.now() - t0) / 1000) * 60) % loop);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [s.mode]);

  // --- nöqtə qatları ---
  const metroExits = useMemo(() => points(data.metro), [data.metro]);
  const metroStations = useMemo<MetroStation[]>(() => {
    const g = new Map<string, { x: number; y: number; n: number; pax: number }>();
    for (const e of metroExits) {
      const k = String(e.p.station_az ?? "");
      const a = g.get(k) ?? { x: 0, y: 0, n: 0, pax: 0 };
      a.x += e.position[0];
      a.y += e.position[1];
      a.n += 1;
      a.pax = Math.max(a.pax, Number(e.p.station_pax ?? 0));
      g.set(k, a);
    }
    return [...g.entries()].map(([name, a]) => ({ position: [a.x / a.n, a.y / a.n], name, pax: a.pax, exits: a.n }));
  }, [metroExits]);
  const parkings = useMemo(() => points(data.parkings), [data.parkings]);
  const stops = useMemo(() => points(data.stops), [data.stops]);
  const official = useMemo(() => points(data.official), [data.official]);
  const rail = useMemo(() => points(data.rail), [data.rail]);

  // --- H3 xanaları ---
  const mi = METRIC_IDX[s.cellMetric];
  const cells = useMemo(() => data.h3.filter((r) => (r[mi] ?? 0) > 0 && r[1] >= 1), [data.h3, mi]);
  const dMax = useMemo(() => Math.max(...data.h3.map((r) => r[3] || 0)), [data.h3]);
  const breaks = useMemo(() => FIXED_BREAKS[s.cellMetric] ?? quantileBreaks(cells.map((r) => Number(r[mi]))), [cells, mi, s.cellMetric]);
  const classOf = useCallback(
    (v: number) => {
      let i = 0;
      while (i < breaks.length && v > breaks[i]) i++;
      return Math.min(i + 1, GAP_STOPS.length - 1);
    },
    [breaks],
  );
  const twin = s.mode === "twin";
  // 3D-də yalnız ən yüksək 30% qaldırılır: oxunaqlı relyef, şəffaf sütunlar dərinlik buferini korlamır
  const twinMin = zoom >= 12.75 ? 4 : 3; // yaxında yalnız ən yüksək 15%
  const twinCells = useMemo(() => (twin ? cells.filter((r) => classOf(Number(r[mi])) >= twinMin) : cells), [twin, cells, classOf, mi, twinMin]);

  const hubs: Hub[] = s.optimized ?? data.hubs.hubs;
  // yuxarı sıra sonda çəkilir (üstdə görünür)
  const hubsDraw = useMemo(() => [...hubs].sort((a, b) => b.rank - a.rank), [hubs]);
  const selRank = s.selected?.kind === "hub" ? s.selected.rank : null;
  const selKey = s.selected?.kind === "whatif" ? s.selected.key : null;
  const selStation = s.selected?.kind === "station" ? data.hubs.arrival.find((a) => s.selected?.kind === "station" && a.id === s.selected.id) ?? null : null;
  const selHub = selRank == null ? null : hubs.find((h) => h.rank === selRank) ?? null;
  const selColor = selHub ? actionColor(selHub.action) : C.hub;

  // yenidən optimallaşdırılmış hub seçiləndə izoxron engine-dən gətirilir
  const [optIso, setOptIso] = useState<{ rank: number; geom: GeoJSON.Geometry } | null>(null);
  useEffect(() => {
    if (!s.optimized || selRank == null || !s.engineOnline) return;
    const h = s.optimized.find((x) => x.rank === selRank);
    if (!h) return;
    let alive = true;
    post<WhatIfHub>("/evaluate", { lon: h.lon, lat: h.lat })
      .then((r) => alive && setOptIso({ rank: selRank, geom: r.isochrone }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [s.optimized, selRank, s.engineOnline]);

  const onClick = useCallback(async (info: PickingInfo) => {
    const st = useStore.getState();
    if (!st.placing || !info.coordinate) return;
    const [lon, lat] = info.coordinate as [number, number];
    const key = `u${Date.now()}`;
    const offlineCircle = (msg: string) => {
      // ehtiyat rejimi: geodezik 400 m bufer (real izoxron engine tələb edir)
      const geom = circle([lon, lat], 0.4, { steps: 64, units: "kilometers" }).geometry;
      const h = { key, lon, lat, isochrone: geom, offline: true } as unknown as WhatIfHub;
      const cur = useStore.getState();
      cur.set({ whatIf: [...cur.whatIf, h], selected: { kind: "whatif", key }, placing: false, toast: msg });
    };
    if (!st.engineOnline) return offlineCircle("Engine əlçatan deyil: düz xətt buferi göstərilir (real piyada izoxronu deyil)");
    try {
      const r = await post<WhatIfHub>("/evaluate", { lon, lat });
      const h = { ...r, key };
      const cur = useStore.getState();
      cur.set({
        whatIf: [...cur.whatIf, h],
        selected: { kind: "whatif", key },
        placing: false,
        toast: r.clicked_blocked_by.length
          ? `Nöqtə ${r.clicked_blocked_by.map((b) => ({ road: "yolun hərəkət hissəsinə", building: "binaya", rail: "dəmir yoluna", water: "su sahəsinə" })[b] ?? b).join(", ")} düşürdü, hub ${r.moved_m} m kənara, icazəli yerə köçürüldü`
          : r.moved_m > 0
            ? `Hub ${r.moved_m} m kənara, səki zolağına köçürüldü`
            : null,
      });
    } catch (e) {
      if (e instanceof EngineOffline) {
        useStore.getState().set({ engineOnline: false });
        return offlineCircle("Engine bağlantısı kəsildi: düz xətt buferi göstərilir");
      }
      useStore.getState().set({ toast: (e as Error).message, placing: false });
    }
  }, []);

  const L = s.layers;

  // --- miqyasdan asılı ölçülər ---
  const z = zoom;
  const zf = clamp(1 + (z - 11.5) * 0.12, 0.88, 1.5); // hub ölçü əmsalı
  const city = z < 12.5; // şəhər miqyası: ikinci dərəcəli hub-lar kiçik və rəqəmsiz
  const hubR = (h: Hub) => HUB_R[h.type] * zf * (city && h.rank > 20 ? 0.68 : 1) + (h.rank === selRank ? 2.5 : 0);
  // mayak sütunları: şəhər miqyasında hündür, küçə miqyasında alçaq və nazik (binaları örtməsin)
  // 3D hub pavilyonları: küçə səviyyəsində real ölçü, uzaqda vizual böyüdülmə (görünsün deyə)
  const hubK = z >= 17 ? 1 : z >= 16 ? 1.6 : z >= 15 ? 2.8 : z >= 14 ? 5 : z >= 13 ? 9 : z >= 12 ? 15 : 22;
  const beaconK = hubK;
  const beaconH = (h: Hub) => (HUB_TOP_M + 1.5) * hubK * (h.type === "L" ? 1.15 : 1);
  const routeAlpha = (twin ? 0.45 : 1) * (z < 12 ? 0.62 : z < 14 ? 0.85 : 0.7);
  const sizeKey = `${z}|${selRank}|${twin}`;

  // --- yazıların seçimi (toqquşmasız): prioritet hub > AYNA mərkəzi > avtovağzal > metro > qatar ---
  const { shown, numbered } = useMemo(() => {
    const P = (lon: number, lat: number) => worldPx(lon, lat, z);
    const obstacles: Box[] = [];
    const nums: Candidate[] = [];
    const cands: Candidate[] = [];
    const lab = (key: string, prio: number, x0: number, yc: number, w: number, h: number) =>
      cands.push({ key, prio, box: { x0, y0: yc - h / 2, x1: x0 + w, y1: yc + h / 2 } });
    for (const h of L.hubs ? hubs : []) {
      const [x, y] = P(h.lon, h.lat);
      const r = hubR(h);
      obstacles.push(square(x, y, r + 2));
      if (twin || !city || h.rank <= 20) nums.push({ key: String(h.rank), prio: 1000 - h.rank, box: square(x, y, r * 0.8) });
      if (z >= 13 && (!twin || h.rank <= 20)) lab(`h${h.rank}`, 1000 - h.rank, x + r + 6, y, textW(h.label, 12.5, true), 16);
    }
    if (L.official)
      official.forEach((d, i) => {
        const [x, y] = P(...d.position);
        obstacles.push(square(x, y, 10));
        if (z >= 12) lab(`o${i}`, 500, x + 14, y, textW(officialShort(d.p), 11.5, true), 15);
      });
    if (L.stations)
      for (const a of data.hubs.arrival) {
        const [x, y] = P(a.lon, a.lat);
        obstacles.push(square(x, y, 9));
        if (z >= 12) lab(`t${a.id}`, 450, x + 13, y, textW(a.name, 11.5, true), 15);
      }
    if (L.metro && z >= 12.75)
      for (const m of metroStations) {
        const [x, y] = P(...m.position);
        const w = textW(m.name, 11, true);
        if (z < 14) lab(`m${m.name}`, 200 + Math.min(100, m.pax / 1000), x + 10, y, w, 14);
        else lab(`m${m.name}`, 200 + Math.min(100, m.pax / 1000), x - w / 2, y - 16, w, 14);
      }
    if (L.rail && z >= 13)
      rail.forEach((d, i) => {
        const [x, y] = P(...d.position);
        lab(`r${i}`, 100, x + 12, y, textW(railName(d.p), 10.5, true), 14);
      });
    // öz nişanı maneə sayılmasın deyə yazılar nişanın kənarından başlayır; hub dairələri maneədir
    return { shown: declutter(cands, obstacles), numbered: new Set([...declutter(nums)].map(Number)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z, hubs, selRank, twin, L.hubs, L.official, L.stations, L.metro, L.rail, official, rail, metroStations, data.hubs.arrival]);

  const label = {
    fontFamily: font,
    fontWeight: 600,
    characterSet: "auto" as const,
    fontSettings: { sdf: true, fontSize: 64, buffer: 8, radius: 10 },
    outlineWidth: 4,
    outlineColor: rgb(C.bg, 235),
    getTextAnchor: "start" as const,
    getAlignmentBaseline: "center" as const,
    billboard: true,
  };

  const busesNow = twin && zoom >= 14 ? updateFleet(fleet, (performance.now() - busClock.current) / 1000) : [];
  // orta zoomda avtobuslar vizual böyüdülür (real 12 m avtobus 14–16 zoomda bir neçə pikseldir); küçə səviyyəsində real ölçü
  const busK = zoom >= 17 ? 1 : zoom >= 16 ? 1.5 : zoom >= 15 ? 2.2 : 3.2;
  // marşrut nömrələri yalnız görünən avtobuslar üçün (performans)
  const busLabels = (() => {
    if (!(twin && zoom >= 15.5)) return [];
    const bb = getMap()?.getMap().getBounds();
    if (!bb) return [];
    return busesNow.filter((b) => bb.contains([b.position[0], b.position[1]])).slice(0, 250);
  })();

  const layers = [
    // 1) istilik xəritəsi: yolların və yazıların altında
    L.cells &&
      z < 14.5 &&
      new H3HexagonLayer<H3Row, Before>({
        id: "cells",
        data: twin ? twinCells : cells,
        beforeId: twin ? undefined : BEFORE_ROADS,
        getHexagon: (r) => r[0],
        getFillColor: (r): RGBA => {
          const c = GAP_STOPS[classOf(Number(r[mi]))];
          return twin ? TWIN_STOPS[classOf(Number(r[mi]))] : c;
        },
        extruded: twin,
        getElevation: (r) => 15 + Math.sqrt(Math.max(0, r[3]) / dMax) * 140, // pavilyonlar görünsün deyə alçaq
        // yaxınlaşdıqca relyef alçalır: binalar və avtobus axını görünür qalır
        elevationScale: twin ? clamp(1 - (z - 12) * 0.5, 0.22, 1) : 1,
        coverage: twin ? 0.78 : 1,
        stroked: false,
        pickable: true,
        autoHighlight: !twin,
        highlightColor: [255, 255, 255, 45],
        opacity: twin ? clamp(0.9 - (z - 12) * 0.22, 0.5, 0.9) : clamp(0.92 - (z - 12) * 0.4, 0.34, 0.92), // yaxınlaşdıqca küçə konteksti önə çıxır
        material: { ambient: 0.6, diffuse: 0.55, shininess: 12, specularColor: [30, 34, 40] },
        updateTriggers: { getFillColor: [mi, breaks, twin] },
      }),
    // 2) xətlər: yazıların altında
    L.routes &&
      new PathLayer<Path, Before>({
        id: "routes",
        data: routePaths,
        beforeId: BEFORE_LABELS,
        getPath: (d) => d.path,
        getColor: (d) => rgb(C.bus, Math.round((d.status === "measured" ? 120 : 62) * routeAlpha)),
        getWidth: (d) => (0.5 + Math.sqrt(d.pax) / 80) * (z < 12 ? 0.8 : 1),
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        pickable: !twin,
        autoHighlight: !twin,
        highlightColor: rgb("#8CC4F2", 230),
        updateTriggers: { getColor: [routeAlpha], getWidth: [z < 12] },
      }),
    L.lanes &&
      new GeoJsonLayer<Record<string, unknown>, Before>({
        id: "lanes",
        data: data.lanes,
        beforeId: BEFORE_LABELS,
        getLineColor: rgb(C.bike, 235),
        getLineWidth: z < 12 ? 1.8 : z < 14 ? 2.4 : 3,
        lineWidthUnits: "pixels",
        lineCapRounded: true,
        lineJointRounded: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: rgb(C.mpv, 255),
        updateTriggers: { getLineWidth: z },
      }),
    twin &&
      L.routes &&
      zoom >= 14 &&
      new SimpleMeshLayer<Bus>({
        id: "buses",
        data: busesNow,
        mesh: BUS_MESH,
        getPosition: (b) => [b.position[0], b.position[1], 0],
        getOrientation: (b) => [0, b.yaw, 0],
        getScale: [busK, busK, busK],
        getColor: [255, 255, 255],
        material: { ambient: 0.6, diffuse: 0.6, shininess: 70, specularColor: [230, 235, 255] },
        updateTriggers: { getPosition: time, getOrientation: time, getScale: busK },
      }),
    twin &&
      L.routes &&
      zoom >= 15.5 &&
      new TextLayer<Bus>({
        id: "bus-route",
        data: busLabels,
        getPosition: (b) => [b.position[0], b.position[1], 3.9 * busK],
        getText: (b) => b.route,
        getSize: 11,
        getColor: rgb("#FFB020"),
        background: true,
        getBackgroundColor: rgb("#101820", 235),
        backgroundPadding: [3, 1],
        fontFamily: font,
        fontWeight: 700,
        billboard: true,
        getTextAnchor: "middle",
        getAlignmentBaseline: "bottom",
        updateTriggers: { getPosition: [time, busK] },
      }),
    twin &&
      L.routes &&
      new TripsLayer({
        id: "trips",
        data: trips,
        getPath: (d: (typeof trips)[number]) => d.path,
        getTimestamps: (d: (typeof trips)[number]) => d.ts,
        getColor: rgb("#BDE5FF"),
        getWidth: z >= 14 ? 4 : 3,
        widthUnits: "pixels",
        trailLength: 160,
        fadeTrail: true,
        currentTime: time,
        capRounded: true,
        jointRounded: true,
      }),
    L.isochrones &&
      new GeoJsonLayer<Record<string, unknown>, Before>({
        id: "isochrones",
        beforeId: twin ? undefined : BEFORE_LABELS,
        data:
          selRank == null
            ? { type: "FeatureCollection", features: [] }
            : s.optimized
              ? { type: "FeatureCollection", features: optIso && optIso.rank === selRank ? [{ type: "Feature", geometry: optIso.geom, properties: { rank: selRank } }] : [] }
              : { type: "FeatureCollection", features: data.isochrones.features.filter((f) => f.properties?.rank === selRank) },
        getFillColor: rgb(selColor, 46),
        getLineColor: rgb(selColor, 255),
        getLineWidth: 2.2,
        lineWidthUnits: "pixels",
        lineJointRounded: true,
        updateTriggers: { getFillColor: selColor, getLineColor: selColor },
      }),
    new GeoJsonLayer({
      id: "whatif-iso",
      data: { type: "FeatureCollection", features: s.whatIf.map((h) => ({ type: "Feature", geometry: h.isochrone, properties: { key: h.key } })) } as GeoJSON.FeatureCollection,
      getFillColor: (f: GeoJSON.Feature) => rgb("#FFFFFF", f.properties?.key === selKey ? 46 : 18),
      getLineColor: rgb("#FFFFFF", 220),
      getLineWidth: 1.6,
      lineWidthUnits: "pixels",
      updateTriggers: { getFillColor: selKey },
    }),
    // 3) kontekst nöqtələri: parkinqlər və dayanacaqlar (sakit)
    L.parkings &&
      new ScatterplotLayer<Pt>({
        id: "parkings",
        data: parkings,
        getPosition: (d) => d.position,
        getFillColor: (d) => (d.p.ptype === "MPV" ? rgb(C.mpv, z < 12 ? 200 : 240) : rgb(C.mps, z < 12 ? 190 : 235)),
        getLineColor: rgb(C.bg, 220),
        stroked: z >= 13.5,
        lineWidthUnits: "pixels",
        getLineWidth: 1,
        getRadius: 11,
        radiusUnits: "meters",
        radiusMinPixels: 1.3,
        radiusMaxPixels: 4.5,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 200],
        updateTriggers: { getFillColor: z < 12 },
      }),
    L.stops &&
      new ScatterplotLayer<Pt>({
        id: "stops",
        data: stops,
        getPosition: (d) => d.position,
        getFillColor: rgb(C.bus, 230),
        getLineColor: rgb(C.bg, 220),
        stroked: z >= 13.5,
        lineWidthUnits: "pixels",
        getLineWidth: 1,
        getRadius: 10,
        radiusUnits: "meters",
        radiusMinPixels: 1.2,
        radiusMaxPixels: 3.8,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 200],
      }),
    // 4) mövcud nəqliyyat infrastrukturu: metro, elektrik qatarı, avtovağzal, AYNA mərkəzləri
    L.rail &&
      new IconLayer<Pt>({
        id: "rail",
        data: rail,
        getPosition: (d) => d.position,
        getIcon: () => icon("rail"),
        getSize: z < 12 ? 13 : z < 14 ? 16 : 19,
        sizeUnits: "pixels",
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        updateTriggers: { getSize: z },
      }),
    L.metro &&
      new IconLayer<Pt | MetroStation>({
        id: "metro",
        data: z < 14 ? metroStations : metroExits,
        getPosition: (d) => d.position,
        getIcon: () => icon("metro"),
        getSize: z < 12 ? 13 : z < 14 ? 16 : 15,
        sizeUnits: "pixels",
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        updateTriggers: { getSize: z },
      }),
    L.stations &&
      selStation &&
      new ScatterplotLayer({
        id: "station-sel",
        data: [selStation],
        getPosition: (a) => [a.lon, a.lat],
        getFillColor: rgb(C.station, 50),
        getLineColor: rgb("#FFFFFF", 240),
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 2,
        getRadius: 19,
        radiusUnits: "pixels",
      }),
    L.stations &&
      new IconLayer({
        id: "stations",
        data: data.hubs.arrival,
        getPosition: (a) => [a.lon, a.lat],
        getIcon: () => icon("terminal"),
        getSize: z < 12 ? 18 : 22,
        sizeUnits: "pixels",
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        updateTriggers: { getSize: z },
      }),
    L.official &&
      new IconLayer<Pt>({
        id: "official",
        data: official,
        getPosition: (d) => d.position,
        getIcon: () => icon("official"),
        getSize: z < 12 ? 19 : z < 14 ? 23 : 26,
        sizeUnits: "pixels",
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        updateTriggers: { getSize: z },
      }),
    // infrastruktur adları (toqquşma filtri ilə)
    L.official &&
      z >= 12 &&
      new TextLayer<Pt>({
        ...label,
        id: "official-label",
        data: official.filter((_, i) => shown.has(`o${i}`)),
        getPosition: (d) => d.position,
        getText: (d) => officialShort(d.p),
        getSize: 11.5,
        getColor: rgb(C.official, 255),
        getPixelOffset: [15, 0],
      }),
    L.stations &&
      z >= 12 &&
      new TextLayer<StaticData["hubs"]["arrival"][number]>({
        ...label,
        id: "stations-label",
        data: data.hubs.arrival.filter((a) => shown.has(`t${a.id}`)),
        getPosition: (a) => [a.lon, a.lat],
        getText: (a) => a.name,
        getSize: 11.5,
        getColor: rgb(C.station, 255),
        getPixelOffset: [14, 0],
      }),
    L.metro &&
      z >= 12.75 &&
      new TextLayer<MetroStation>({
        ...label,
        id: "metro-label",
        data: metroStations.filter((d) => shown.has(`m${d.name}`)),
        getPosition: (d) => d.position,
        getText: (d) => d.name,
        getSize: 11,
        getColor: rgb("#F2A7A2", 255),
        getPixelOffset: z < 14 ? [11, 0] : [0, -16],
        getTextAnchor: z < 14 ? "start" : "middle",
        updateTriggers: { getPixelOffset: z < 14, getTextAnchor: z < 14 },
      }),
    L.rail &&
      z >= 13 &&
      new TextLayer<Pt>({
        ...label,
        id: "rail-label",
        data: rail.filter((_, i) => shown.has(`r${i}`)),
        getPosition: (d) => d.position,
        getText: (d) => railName(d.p),
        getSize: 10.5,
        getColor: rgb(C.rail, 255),
        getPixelOffset: [12, 0],
      }),
    // 5) təklif olunan hub-lar: ən üst ierarxiya
    L.hubs &&
      selHub &&
      !(twin && z >= 14) &&
      new ScatterplotLayer<Hub>({
        id: "hub-sel-halo",
        data: [selHub],
        getPosition: (h) => [h.lon, h.lat, twin ? beaconH(h) : 0],
        getFillColor: rgb(selColor, 60),
        getLineColor: rgb("#FFFFFF", 240),
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: 2,
        getRadius: (h) => hubR(h) + 7,
        radiusUnits: "pixels",
        billboard: true,
        updateTriggers: { getRadius: sizeKey, getPosition: [twin, beaconK] },
      }),
    L.hubs &&
      !(twin && z >= 14) &&
      new ScatterplotLayer<Hub>({
        id: "hub-casing",
        data: hubsDraw,
        getPosition: (h) => [h.lon, h.lat],
        getFillColor: rgb(C.bg, 210),
        getRadius: (h) => hubR(h) + 3.2,
        radiusUnits: "pixels",
        updateTriggers: { getRadius: sizeKey },
      }),
    L.hubs &&
      !(twin && z >= 14) &&
      new ScatterplotLayer<Hub>({
        id: "hubs",
        data: hubsDraw,
        getPosition: (h) => [h.lon, h.lat],
        getFillColor: (h) => (h.rank === selRank ? rgb(actionColor(h.action)) : rgb(C.bg, 255)),
        getLineColor: (h) => rgb(actionColor(h.action)),
        stroked: true,
        lineWidthUnits: "pixels",
        getLineWidth: (h) => (city && h.rank > 20 ? 2.2 : 3),
        getRadius: (h) => hubR(h),
        radiusUnits: "pixels",
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 80],
        updateTriggers: { getFillColor: selRank, getRadius: sizeKey, getLineWidth: city },
      }),
    twin &&
      L.hubs &&
      new SimpleMeshLayer<Hub>({
        id: "hub-beacons",
        data: hubsDraw,
        mesh: HUB_STRUCT,
        getPosition: (h) => [h.lon, h.lat, 0],
        getOrientation: (h) => [0, h.yaw ?? 0, 0],
        getScale: (h) => [(HUB_DIM[h.type].len / HUB_DIM.M.len) * hubK, (HUB_DIM[h.type].wid / HUB_DIM.M.wid) * hubK, hubK * (h.type === "L" ? 1.15 : 1)],
        getColor: [255, 255, 255],
        material: { ambient: 0.6, diffuse: 0.6, shininess: 30, specularColor: [220, 220, 220] },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        updateTriggers: { getScale: hubK },
      }),
    twin &&
      L.hubs &&
      new SimpleMeshLayer<Hub>({
        id: "hub-canopy",
        data: hubsDraw,
        mesh: HUB_CANOPY,
        getPosition: (h) => [h.lon, h.lat, 0],
        getOrientation: (h) => [0, h.yaw ?? 0, 0],
        getScale: (h) => [(HUB_DIM[h.type].len / HUB_DIM.M.len) * hubK, (HUB_DIM[h.type].wid / HUB_DIM.M.wid) * hubK, hubK * (h.type === "L" ? 1.15 : 1)],
        getColor: (h) => rgb(actionColor(h.action), 255),
        material: { ambient: 0.85, diffuse: 0.5, shininess: 60, specularColor: [255, 240, 220] },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120],
        updateTriggers: { getScale: hubK, getColor: selRank },
      }),
    L.hubs &&
      new TextLayer<Hub>({
        id: "hub-rank",
        data: hubsDraw.filter((h) => numbered.has(h.rank)),
        getPosition: (h) => [h.lon, h.lat, twin ? beaconH(h) + 70 : 0],
        getText: (h) => String(h.rank),
        getSize: (h) => (h.type === "L" ? 12 : 11) * Math.min(zf, 1.25),
        getColor: (h) => (h.rank === selRank ? rgb(C.bg) : rgb("#FFFFFF")),
        fontFamily: font,
        fontWeight: 700,
        fontSettings: { sdf: true, fontSize: 64, buffer: 6 },
        outlineWidth: twin ? 4 : 0,
        outlineColor: rgb(C.bg, 255),
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        billboard: true,
        updateTriggers: { getColor: selRank, getSize: sizeKey, getPosition: [twin, beaconK] },
      }),
    L.hubs &&
      z >= 13 &&
      new TextLayer<Hub>({
        ...label,
        id: "hub-label",
        data: hubsDraw.filter((h) => shown.has(`h${h.rank}`)),
        getPosition: (h) => [h.lon, h.lat, twin ? beaconH(h) + 70 : 0],
        getText: (h) => h.label,
        getSize: 12.5,
        fontWeight: 700,
        getColor: (h) => rgb(actionColor(h.action), 255),
        getPixelOffset: (h) => [twin ? 14 : hubR(h) + 7, 0],
        updateTriggers: { getPixelOffset: sizeKey, getPosition: [twin, beaconK] },
      }),
    new ScatterplotLayer<WhatIfHub>({
      id: "whatif",
      data: s.whatIf,
      getPosition: (h) => [h.lon, h.lat],
      getFillColor: (h) => (h.key === selKey ? rgb("#FFFFFF") : rgb("#FFFFFF", 225)),
      getLineColor: rgb(C.bg),
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: 3,
      getRadius: (h) => (h.key === selKey ? 10 : 8),
      radiusUnits: "pixels",
      pickable: true,
      autoHighlight: true,
      highlightColor: rgb(C.hub, 160),
      updateTriggers: { getFillColor: selKey, getRadius: selKey },
    }),
  ].filter(Boolean);

  const onPick = useCallback((info: PickingInfo) => {
    const st = useStore.getState();
    if (st.placing) return;
    if ((info.layer?.id === "hubs" || info.layer?.id === "hub-beacons" || info.layer?.id === "hub-canopy") && info.object) st.set({ selected: { kind: "hub", rank: (info.object as Hub).rank } });
    else if (info.layer?.id === "whatif" && info.object) st.set({ selected: { kind: "whatif", key: (info.object as WhatIfHub).key } });
    else if (info.layer?.id === "stations" && info.object) st.set({ selected: { kind: "station", id: (info.object as { id: string }).id } });
  }, []);

  const getTooltip = useCallback((info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
    const p = ((o as { p?: Record<string, unknown>; properties?: Record<string, unknown> }).p ??
      (o as { properties?: Record<string, unknown> }).properties ??
      o) as Record<string, unknown>;
    const style = {
      background: C.surface,
      color: C.text,
      fontFamily: "var(--font-archivo), Archivo, sans-serif",
      fontSize: "12px",
      lineHeight: "1.45",
      borderRadius: "6px",
      padding: "8px 10px",
      border: `1px solid ${C.line}`,
      boxShadow: "0 6px 18px rgba(0,0,0,.35)",
      maxWidth: "280px",
    };
    const head = (color: string, kicker: string, title: string) =>
      `<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${color};margin-bottom:2px">${kicker}</div><div style="font-weight:700;font-size:13px">${title}</div>`;
    const sub = (t: string) => `<div style="color:${C.muted}">${t}</div>`;
    const id = info.layer?.id;
    if (id === "cells") {
      const r = o as unknown as H3Row;
      return {
        html: `${head("#F79CB4", "H3 xana (~0,1 km²)", `Əhali: ~${Math.round(r[1])}`)}${sub(`Nəqliyyat minikləri: ~${Math.round(r[2])}/gün`)}${sub(`Boşluq: ${r[5] == null ? "—" : Math.round(r[5] * 100) + "%"}`)}${sub(`Ən yaxın parkinq: ${r[6] == null ? "> 400 m" : Math.round(r[6]) + " m"}`)}`,
        style,
      };
    }
    if (id === "routes") {
      const d = o as unknown as Path;
      return {
        html: `${head(C.bus, "Avtobus marşrutu", `№ ${d.route}`)}${sub(`~${Math.round(d.pax / 100) * 100} sərnişin/gün`)}${sub(d.status === "measured" ? "ölçülmüş (BakuBus)" : "proqnoz (model + AYNA cəminə kalibr)")}`,
        style,
      };
    }
    if (id === "metro") {
      if ("exits" in o) {
        const m = o as unknown as MetroStation;
        return { html: `${head(C.metro, "Metro stansiyası", `${m.name} m/st.`)}${sub(`${m.exits} çıxış · ${approx(m.pax)} sərnişin/gün (ölçülmüş)`)}`, style };
      }
      return { html: `${head(C.metro, "Metro çıxışı", `${p.station_az} m/st.`)}${sub(`${p.exit}, ${p.address}`)}${sub(`Stansiya: ${approx(Number(p.station_pax))} sərnişin/gün (ölçülmüş)`)}`, style };
    }
    if (id === "parkings")
      return { html: `${head(p.ptype === "MPV" ? C.mpv : C.mps, p.ptype === "MPV" ? "MPV velosiped məntəqəsi" : "MPS parkinqi", String(p.name || "Parkinq"))}${sub(p.ptype === "MPV" ? "AYNA «yeni velosiped məntəqələri» qovluğu" : "AYNA ümumi siyahısı")}`, style };
    if (id === "stops") return { html: `${head(C.bus, "Avtobus dayanacağı", String(p.name || "Dayanacaq"))}${sub(`${p.n_routes} marşrut · ~${p.boardings} minik/gün`)}`, style };
    if (id === "lanes") return { html: `${head(C.bike, "Velo-zolaq", String(p.name ?? ""))}${sub(`${p.length_km} km`)}`, style };
    if (id === "hubs" || id === "hub-beacons") {
      const h = o as unknown as Hub;
      const col = actionColor(h.action);
      const off = h.action === "integrate" && h.official_hub ? sub(`Mərkəz: ${h.official_hub}`) : "";
      return { html: `${head(col, `Təklif olunan hub · #${h.rank}`, h.label)}${sub(`${ACTION_LABEL[h.action] ?? h.action} · tip ${h.type}, ${h.docks} yer`)}${off}`, style };
    }
    if (id === "stations") return { html: `${head(C.station, "Avtovağzal", String(p.name))}${sub(`Gəliş balı: ${p.score}/5`)}`, style };
    if (id === "official") {
      const modes = Array.isArray(p.modes) ? (p.modes as string[]).map((m) => MODE_AZ[m] ?? m).join(", ") : "";
      return {
        html: `${head(C.official, "AYNA mübadilə mərkəzi", String(p.name ?? ""))}${sub(`${p.n_routes ?? "—"} marşrut · ${p.n_stops ?? "—"} dayanacaq`)}${modes ? sub(modes) : ""}`,
        style,
      };
    }
    if (id === "rail") return { html: `${head(C.rail, "Elektrik qatarı stansiyası (ADY)", railName(p))}${p.n_routes != null ? sub(`Xətt: ${p.n_routes}${p.n_trips != null ? ` · reys: ${p.n_trips}` : ""}`) : ""}`, style };
    if (id === "whatif") return { html: `${head("#FFFFFF", "Sizin hub", "Yoxlanılan nöqtə")}`, style };
    return null;
  }, []);

  if (!style) return <div className="absolute inset-0 bg-[var(--bg)]" aria-hidden />;

  return (
    <MapGL
      ref={(r) => {
        mapInstance = r;
        if (typeof window !== "undefined") (window as unknown as { __ayanMap?: MapRef | null }).__ayanMap = r;
      }}
      initialViewState={BAKU_VIEW}
      mapStyle={style}
      maxPitch={70}
      style={{ position: "absolute", inset: 0, background: C.bg }}
      cursor={s.placing ? "crosshair" : "grab"}
      attributionControl={{ compact: true }}
      onMove={(e) => {
        const zb = Math.round(e.viewState.zoom * 4) / 4;
        if (zb !== zoomRef.current) {
          zoomRef.current = zb;
          setZoom(zb);
        }
      }}
      onLoad={(e) => {
        const m = e.target;
        if (!m.getLayer(BUILDINGS_3D.id)) m.addLayer(BUILDINGS_3D, m.getLayer(BEFORE_LABELS) ? BEFORE_LABELS : undefined);
        if (useStore.getState().mode === "twin") m.setLayoutProperty(BUILDINGS_3D.id, "visibility", "visible");
      }}
    >
      {twin && L.routes && (
        <div className="pointer-events-none absolute bottom-48 left-1/2 z-10 -translate-x-1/2 rounded bg-[var(--surface)]/90 px-3 py-1.5 text-[11px] text-[var(--muted)] ring-1 ring-[var(--line)]">
          Avtobuslar: simulyasiya · AYNA-nın real marşrutları, ~2 350 avtobus sərnişin payına görə · {PLAYBACK}× sürətləndirilmiş
        </div>
      )}
      <DeckOverlay
        interleaved
        layers={layers}
        effects={twin ? [LIGHTING] : NO_EFFECTS}
        onClick={(i) => (useStore.getState().placing ? onClick(i) : onPick(i))}
        getTooltip={getTooltip}
      />
    </MapGL>
  );
}
