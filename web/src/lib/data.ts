import type { H3Row, HubsFile } from "./types";

export const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8000";

async function j<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
/** İstəyə bağlı qat: fayl yoxdursa və ya pozulubsa boş kolleksiya (tətbiq heç vaxt sınmır) */
async function opt(path: string): Promise<GeoJSON.FeatureCollection> {
  try {
    const d = await j<GeoJSON.FeatureCollection>(path);
    return d && Array.isArray(d.features) ? d : EMPTY_FC;
  } catch {
    return EMPTY_FC;
  }
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
  /** AYNA-nın mövcud nəqliyyat mübadilə mərkəzləri (istəyə bağlı) */
  official: GeoJSON.FeatureCollection;
  /** ADY elektrik qatarı stansiyaları (istəyə bağlı) */
  rail: GeoJSON.FeatureCollection;
}

export async function loadStatic(): Promise<StaticData> {
  const [hubs, h3, routes, metro, stations, parkings, lanes, stops, isochrones, metrics, official, rail] = await Promise.all([
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
    opt("/data/official_hubs.geojson"),
    opt("/data/rail_stations.geojson"),
  ]);
  return { hubs, h3, routes, metro, stations, parkings, lanes, stops, isochrones, metrics, official, rail };
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

export class EngineOffline extends Error {}

/** Engine sorğusu: şəbəkə xətası EngineOffline atır, server xətası isə aydın mesajla. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${ENGINE}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new EngineOffline("Geo Engine əlçatan deyil");
  }
  let d: unknown = null;
  try {
    d = await r.json();
  } catch {
    /* JSON olmayan cavab */
  }
  if (!r.ok) {
    const det = (d as { detail?: { msg?: string } | string })?.detail;
    throw Object.assign(new Error(typeof det === "string" ? det : det?.msg ?? `Engine xətası (${r.status})`), { detail: det });
  }
  return d as T;
}

export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Metrics = Record<string, any>;
