import type { H3Row, HubsFile } from "./types";

export const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8000";

async function j<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export interface StaticData {
  hubs: HubsFile;
  h3: H3Row[];
  routes: GeoJSON.FeatureCollection;
  metro: GeoJSON.FeatureCollection;
  stations: GeoJSON.FeatureCollection;
  parkings: GeoJSON.FeatureCollection;
  lanes: GeoJSON.FeatureCollection;
  stops: GeoJSON.FeatureCollection;
  isochrones: GeoJSON.FeatureCollection;
  metrics: Metrics;
}

export async function loadStatic(): Promise<StaticData> {
  const [hubs, h3, routes, metro, stations, parkings, lanes, stops, isochrones, metrics] = await Promise.all([
    j<HubsFile>("/data/hubs.json"),
    j<{ rows: H3Row[] }>("/data/h3_r9.json").then((d) => d.rows),
    j<GeoJSON.FeatureCollection>("/data/bus_routes.geojson"),
    j<GeoJSON.FeatureCollection>("/data/metro_exits.geojson"),
    j<GeoJSON.FeatureCollection>("/data/bus_stations.geojson"),
    j<GeoJSON.FeatureCollection>("/data/parkings.geojson"),
    j<GeoJSON.FeatureCollection>("/data/bike_lanes.geojson"),
    j<GeoJSON.FeatureCollection>("/data/bus_stops.geojson"),
    j<GeoJSON.FeatureCollection>("/data/isochrones.geojson"),
    j<Metrics>("/data/metrics.json"),
  ]);
  return { hubs, h3, routes, metro, stations, parkings, lanes, stops, isochrones, metrics };
}

/** Engine əlçatandırmı? (ehtiyat rejimi üçün) */
export async function engineAlive(): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2500);
    const r = await fetch(`${ENGINE}/health`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${ENGINE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Object.assign(new Error(d?.detail?.msg ?? d?.detail ?? "Engine xətası"), { detail: d?.detail });
  return d as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Metrics = Record<string, any>;
