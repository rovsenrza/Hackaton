export type HubType = "S" | "M" | "L";
export type HubAction = "new" | "upgrade";

export interface Co2Range {
  low: number;
  base: number;
  high: number;
}

export interface Hub {
  rank: number;
  id: string;
  cand?: number;
  action: HubAction;
  anchor_kind: "metro" | "bus_stop" | "bus_station" | "parking";
  label: string;
  lon: number;
  lat: number;
  offset_m: number;
  qa: string;
  gain_share: number;
  stability?: number;
  type: HubType;
  docks: number;
  pop_covered: number;
  pop_unserved_covered: number;
  transit_daily: number;
  trips_day: number;
  co2_t_year: Co2Range;
  metro_stations: string[];
  metro_pax: number;
  bus_routes: string[];
  bus_station: boolean;
  parkings_400: number;
}

export interface Arrival {
  id: string;
  name: string;
  lon: number;
  lat: number;
  score: number;
  parts: { metro: number; bus: number; parking: number; lane: number };
  metro_walk_m: number | null;
  parking_walk_m: number | null;
  lane_walk_m: number | null;
  bus_routes_400: number;
}

export interface HubsFile {
  generated: string;
  walk_m: number;
  weights: { transit: number; pop: number; poi: number };
  curve: number[];
  hubs: Hub[];
  arrival: Arrival[];
}

/** H3 res9 sətri: [h, pop, transit, D, w, gap, dpark] */
export type H3Row = [string, number, number, number, number, number | null, number | null];

export interface WhatIfHub extends Omit<Hub, "rank" | "id" | "anchor_kind" | "qa" | "gain_share"> {
  key: string;
  moved_m: number;
  clicked_blocked_by: string[];
  near_transit_60m: boolean;
  isochrone: GeoJSON.Geometry;
  ms: number;
}

export type Mode = "plan" | "twin";
export type Panel = "map" | "dashboard" | "method";
export type CellMetric = "w" | "gap" | "D" | "pop" | "transit";
