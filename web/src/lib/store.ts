import { create } from "zustand";
import type { CellMetric, Hub, Mode, Panel, WhatIfHub } from "./types";

export type LayerKey = "cells" | "routes" | "metro" | "stops" | "stations" | "parkings" | "lanes" | "hubs" | "isochrones" | "official" | "rail";

interface S {
  mode: Mode;
  panel: Panel;
  layers: Record<LayerKey, boolean>;
  cellMetric: CellMetric;
  selected: { kind: "hub"; rank: number } | { kind: "whatif"; key: string } | { kind: "station"; id: string } | null;
  placing: boolean;
  whatIf: WhatIfHub[];
  optimized: Hub[] | null;
  weights: { transit: number; pop: number; poi: number };
  nHubs: number;
  engineOnline: boolean | null;
  statuses: Record<string, string>;
  toast: string | null;
  set: (p: Partial<S>) => void;
  toggle: (k: LayerKey) => void;
}

export const useStore = create<S>((set) => ({
  mode: "plan",
  panel: "map",
  layers: { cells: true, routes: true, metro: true, stops: false, stations: true, parkings: true, lanes: true, hubs: true, isochrones: true, official: true, rail: true },
  cellMetric: "w",
  selected: null,
  placing: false,
  whatIf: [],
  optimized: null,
  weights: { transit: 0.45, pop: 0.35, poi: 0.2 },
  nHubs: 20,
  engineOnline: null,
  statuses: {},
  toast: null,
  set: (p) => set(p),
  toggle: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
}));
