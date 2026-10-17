"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { useControl, type MapRef } from "react-map-gl/maplibre";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { ColumnLayer, GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { H3HexagonLayer, TripsLayer } from "@deck.gl/geo-layers";
import type { PickingInfo } from "@deck.gl/core";
import circle from "@turf/circle";
import "maplibre-gl/dist/maplibre-gl.css";

import { post, type StaticData } from "@/lib/data";
import { useStore } from "@/lib/store";
import { C, GAP_STOPS, rgb, type RGBA } from "@/lib/theme";
import type { H3Row, Hub, WhatIfHub } from "@/lib/types";
import { approx } from "@/lib/format";

export const BASEMAP = "https://tiles.openfreemap.org/styles/fiord";
export const BAKU_VIEW = { longitude: 49.86, latitude: 40.405, zoom: 11.2, pitch: 0, bearing: 0 };
let mapInstance: MapRef | null = null;
export const getMap = () => mapInstance;

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

type Path = { path: [number, number][]; route: string; pax: number; status: string };

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

export default function MapView({ data }: { data: StaticData }) {
  const s = useStore();
  const [time, setTime] = useState(0);
  const [zoom, setZoom] = useState(BAKU_VIEW.zoom);
  const raf = useRef<number | null>(null);

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

  useEffect(() => {
    if (s.mode !== "twin") return;
    const t0 = performance.now();
    const tick = () => {
      setTime(((performance.now() - t0) / 1000) * 60 % loop);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [s.mode]);

  // --- H3 xanaları ---
  const mi = METRIC_IDX[s.cellMetric];
  const cells = useMemo(() => data.h3.filter((r) => (r[mi] ?? 0) > 0 && r[1] >= 1), [data.h3, mi]);
  const dMax = useMemo(() => Math.max(...data.h3.map((r) => r[3] || 0)), [data.h3]);
  const breaks = useMemo(() => FIXED_BREAKS[s.cellMetric] ?? quantileBreaks(cells.map((r) => Number(r[mi]))), [cells, mi, s.cellMetric]);
  const colorOf = useCallback(
    (v: number): RGBA => {
      let i = 0;
      while (i < breaks.length && v > breaks[i]) i++;
      return GAP_STOPS[i + 1] ?? GAP_STOPS[GAP_STOPS.length - 1];
    },
    [breaks],
  );

  const hubs: Hub[] = s.optimized ?? data.hubs.hubs;
  const selRank = s.selected?.kind === "hub" ? s.selected.rank : null;
  const selKey = s.selected?.kind === "whatif" ? s.selected.key : null;

  const onClick = useCallback(
    async (info: PickingInfo) => {
      const st = useStore.getState();
      if (!st.placing || !info.coordinate) return;
      const [lon, lat] = info.coordinate as [number, number];
      const key = `u${Date.now()}`;
      if (!st.engineOnline) {
        // ehtiyat rejimi: geodezik 400 m bufer (real izoxron engine tələb edir)
        const geom = circle([lon, lat], 0.4, { steps: 64, units: "kilometers" }).geometry;
        const h = { key, lon, lat, isochrone: geom, offline: true } as unknown as WhatIfHub;
        st.set({ whatIf: [...st.whatIf, h], selected: { kind: "whatif", key }, placing: false,
          toast: "Engine əlçatan deyil: düz xətt buferi göstərilir (real piyada izoxronu deyil)" });
        return;
      }
      try {
        const r = await post<WhatIfHub>("/evaluate", { lon, lat });
        const h = { ...r, key };
        st.set({ whatIf: [...useStore.getState().whatIf, h], selected: { kind: "whatif", key }, placing: false,
          toast: r.clicked_blocked_by.length
            ? `Nöqtə ${r.clicked_blocked_by.map((b) => ({ road: "yolun hərəkət hissəsinə", building: "binaya", rail: "dəmir yoluna", water: "su sahəsinə" }[b] ?? b)).join(", ")} düşürdü, hub ${r.moved_m} m kənara, icazəli yerə köçürüldü`
            : null });
      } catch (e) {
        st.set({ toast: (e as Error).message, placing: false });
      }
    },
    [],
  );

  const twin = s.mode === "twin";
  const L = s.layers;

  const layers = [
    L.cells &&
      (twin || zoom < 14.5) &&
      new H3HexagonLayer<H3Row>({
        id: "cells",
        data: cells,
        getHexagon: (r) => r[0],
        getFillColor: (r) => colorOf(Number(r[mi])),
        extruded: twin,
        getElevation: (r) => Math.sqrt(Math.max(0, r[3]) / dMax) * 520,
        elevationScale: 1,
        coverage: twin ? 0.86 : 1,
        stroked: false,
        pickable: true,
        opacity: twin ? 0.55 : 0.75,
        material: { ambient: 0.55, diffuse: 0.6, shininess: 20 },
        updateTriggers: { getFillColor: [mi, breaks] },
      }),
    L.routes &&
      new PathLayer<Path>({
        id: "routes",
        data: routePaths,
        getPath: (d) => d.path,
        getColor: (d) => rgb(C.bus, d.status === "measured" ? (twin ? 60 : 105) : twin ? 30 : 50),
        getWidth: (d) => 0.5 + Math.sqrt(d.pax) / 75,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        pickable: !twin,
      }),
    twin &&
      L.routes &&
      new TripsLayer({
        id: "trips",
        data: trips,
        getPath: (d: (typeof trips)[number]) => d.path,
        getTimestamps: (d: (typeof trips)[number]) => d.ts,
        getColor: rgb("#9FD3FF"),
        getWidth: 3,
        widthUnits: "pixels",
        trailLength: 120,
        currentTime: time,
        capRounded: true,
        jointRounded: true,
      }),
    L.lanes &&
      new GeoJsonLayer({
        id: "lanes",
        data: data.lanes,
        getLineColor: rgb(C.bike, 230),
        getLineWidth: 2.6,
        lineWidthUnits: "pixels",
        lineCapRounded: true,
        pickable: true,
      }),
    L.parkings &&
      new ScatterplotLayer({
        id: "parkings",
        data: data.parkings.features,
        getPosition: (f: GeoJSON.Feature) => (f.geometry as GeoJSON.Point).coordinates as [number, number],
        getFillColor: (f: GeoJSON.Feature) => rgb(C.bike, f.properties?.period === "sep" ? 255 : 200),
        getRadius: 2.6,
        radiusUnits: "pixels",
        radiusMinPixels: 1.5,
        pickable: true,
      }),
    L.stops &&
      new ScatterplotLayer({
        id: "stops",
        data: data.stops.features,
        getPosition: (f: GeoJSON.Feature) => (f.geometry as GeoJSON.Point).coordinates as [number, number],
        getFillColor: rgb(C.bus, 220),
        getRadius: 2,
        radiusUnits: "pixels",
        pickable: true,
      }),
    L.metro &&
      new ScatterplotLayer({
        id: "metro",
        data: data.metro.features,
        getPosition: (f: GeoJSON.Feature) => (f.geometry as GeoJSON.Point).coordinates as [number, number],
        getFillColor: rgb(C.metro),
        getLineColor: rgb("#FFFFFF", 230),
        stroked: true,
        lineWidthMinPixels: 1,
        getRadius: 4,
        radiusUnits: "pixels",
        pickable: true,
      }),
    L.stations &&
      new ScatterplotLayer({
        id: "stations",
        data: data.hubs.arrival,
        getPosition: (a) => [a.lon, a.lat],
        getFillColor: rgb(C.station),
        getLineColor: rgb(C.bg),
        stroked: true,
        lineWidthMinPixels: 2,
        getRadius: 8,
        radiusUnits: "pixels",
        pickable: true,
      }),
    L.isochrones &&
      new GeoJsonLayer({
        id: "isochrones",
        data: s.optimized || selRank == null ? { type: "FeatureCollection", features: [] } : { type: "FeatureCollection", features: data.isochrones.features.filter((f) => f.properties?.rank === selRank) },
        getFillColor: (f: GeoJSON.Feature) => rgb(C.hub, f.properties?.rank === selRank ? 70 : 22),
        getLineColor: (f: GeoJSON.Feature) => rgb(C.hub, f.properties?.rank === selRank ? 255 : 110),
        getLineWidth: (f: GeoJSON.Feature) => (f.properties?.rank === selRank ? 2.2 : 0.8),
        lineWidthUnits: "pixels",
        updateTriggers: { getFillColor: selRank, getLineColor: selRank, getLineWidth: selRank },
      }),
    new GeoJsonLayer({
      id: "whatif-iso",
      data: { type: "FeatureCollection", features: s.whatIf.map((h) => ({ type: "Feature", geometry: h.isochrone, properties: { key: h.key } })) } as GeoJSON.FeatureCollection,
      getFillColor: (f: GeoJSON.Feature) => rgb("#FFFFFF", f.properties?.key === selKey ? 50 : 20),
      getLineColor: rgb("#FFFFFF", 220),
      getLineWidth: 1.6,
      lineWidthUnits: "pixels",
      updateTriggers: { getFillColor: selKey },
    }),
    L.hubs &&
      new ScatterplotLayer<Hub>({
        id: "hubs",
        data: hubs,
        getPosition: (h) => [h.lon, h.lat],
        getFillColor: (h) => rgb(h.action === "new" ? C.hub : C.upgrade),
        getLineColor: (h) => (h.rank === selRank ? rgb("#FFFFFF") : rgb(C.bg)),
        stroked: true,
        lineWidthMinPixels: 2,
        getRadius: (h) => ({ S: 6, M: 8, L: 11 })[h.type] + (h.rank === selRank ? 3 : 0),
        radiusUnits: "pixels",
        pickable: true,
        updateTriggers: { getLineColor: selRank, getRadius: selRank },
      }),
    twin &&
      L.hubs &&
      new ColumnLayer<Hub>({
        id: "hub-beacons",
        data: hubs,
        diskResolution: 12,
        radius: 45,
        extruded: true,
        getPosition: (h) => [h.lon, h.lat],
        getElevation: (h) => 650 + (h.rank <= 10 ? 250 : 0),
        getFillColor: (h) => rgb(h.action === "new" ? C.hub : C.upgrade, h.rank === selRank ? 255 : 220),
        material: { ambient: 0.8, diffuse: 0.5 },
        pickable: true,
        updateTriggers: { getFillColor: selRank },
      }),
    L.hubs &&
      new TextLayer<Hub>({
        id: "hub-rank",
        data: hubs.filter((h) => h.rank <= 20),
        getPosition: (h) => [h.lon, h.lat],
        getText: (h) => String(h.rank),
        getSize: 11,
        getColor: rgb(C.bg),
        fontFamily: "Archivo, sans-serif",
        fontWeight: 700,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        billboard: true,
      }),
    new ScatterplotLayer<WhatIfHub>({
      id: "whatif",
      data: s.whatIf,
      getPosition: (h) => [h.lon, h.lat],
      getFillColor: rgb("#FFFFFF"),
      getLineColor: rgb(C.hub),
      stroked: true,
      lineWidthMinPixels: 3,
      getRadius: 9,
      radiusUnits: "pixels",
      pickable: true,
    }),
  ].filter(Boolean);

  const onPick = useCallback((info: PickingInfo) => {
    const st = useStore.getState();
    if (st.placing) return;
    if ((info.layer?.id === "hubs" || info.layer?.id === "hub-beacons") && info.object) st.set({ selected: { kind: "hub", rank: (info.object as Hub).rank } });
    else if (info.layer?.id === "whatif" && info.object) st.set({ selected: { kind: "whatif", key: (info.object as WhatIfHub).key } });
    else if (info.layer?.id === "stations" && info.object) st.set({ selected: { kind: "station", id: (info.object as { id: string }).id } });
  }, []);

  const getTooltip = useCallback(
    (info: PickingInfo) => {
      const o = info.object as Record<string, unknown> | undefined;
      if (!o) return null;
      const p = ((o as { properties?: Record<string, unknown> }).properties ?? o) as Record<string, unknown>;
      const style = { background: C.surface, color: C.text, fontFamily: "Archivo, sans-serif", fontSize: "12px", borderRadius: "6px", padding: "8px 10px", border: `1px solid ${C.line}` };
      const id = info.layer?.id;
      if (id === "cells") {
        const r = o as unknown as H3Row;
        return { html: `<b>H3 xana</b><br/>Əhali: ~${Math.round(r[1])}<br/>Nəqliyyat minikləri: ~${Math.round(r[2])}/gün<br/>Boşluq: ${r[5] == null ? "—" : Math.round(r[5] * 100) + "%"}<br/>Ən yaxın parkinq: ${r[6] == null ? "> 400 m" : Math.round(r[6]) + " m"}`, style };
      }
      if (id === "routes") {
        const d = o as unknown as Path;
        return { html: `<b>Marşrut ${d.route}</b><br/>~${Math.round(d.pax / 100) * 100} sərnişin/gün<br/>${d.status === "measured" ? "🟢 ölçülmüş (BakuBus)" : "🟡 proqnoz (model + AYNA cəminə kalibr)"}`, style };
      }
      if (id === "metro") return { html: `<b>${p.station_az} m/st.</b><br/>${p.exit}, ${p.address}<br/>Stansiya: ${approx(Number(p.station_pax))} sərnişin/gün 🟢`, style };
      if (id === "parkings") return { html: `<b>${p.name || "Parkinq"}</b><br/>${p.period === "sep" ? "Sentyabr 2026 (yeni)" : "İyul 2026 siyahısı"}`, style };
      if (id === "stops") return { html: `<b>${p.name || "Dayanacaq"}</b><br/>${p.n_routes} marşrut · ~${p.boardings} minik/gün`, style };
      if (id === "lanes") return { html: `<b>Velo-zolaq</b><br/>${p.name ?? ""}<br/>${p.length_km} km`, style };
      if (id === "hubs" || id === "hub-beacons") {
        const h = o as unknown as Hub;
        return { html: `<b>#${h.rank} ${h.label}</b><br/>${h.action === "new" ? "Yeni hub" : "Hub-a çevrilmə"} · tip ${h.type}`, style };
      }
      if (id === "stations") return { html: `<b>${p.name}</b><br/>Gəliş balı: ${p.score}/5`, style };
      return null;
    },
    [],
  );

  return (
    <Map
      ref={(r) => {
        mapInstance = r;
        if (typeof window !== "undefined") (window as unknown as { __ayanMap?: MapRef | null }).__ayanMap = r;
      }}
      initialViewState={BAKU_VIEW}
      mapStyle={BASEMAP}
      maxPitch={70}
      style={{ position: "absolute", inset: 0 }}
      cursor={s.placing ? "crosshair" : "grab"}
      attributionControl={{ compact: true }}
      onMove={(e) => {
        const z = e.viewState.zoom;
        if ((z >= 14.5) !== (zoom >= 14.5)) setZoom(z);
      }}
      onLoad={(e) => {
        const m = e.target;
        if (!m.getLayer("ayan-buildings-3d"))
          m.addLayer({
            id: "ayan-buildings-3d",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
            minzoom: 13,
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": "#2B5568",
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 9],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.75,
            },
          });
      }}
    >
      <DeckOverlay interleaved layers={layers} onClick={(i) => (useStore.getState().placing ? onClick(i) : onPick(i))} getTooltip={getTooltip} />
    </Map>
  );
}
