// "Xəzər" baza xəritəsi: OpenFreeMap fiord üslubu (OSM, açarsız) işləmə vaxtında yenidən rənglənir.
// Məqsəd: sakit fon, aydın sahil xətti, oxunaqlı rayon və əsas küçə adları (azərbaycanca),
// analitik qatlar üçün yüksək kontrast.
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export const BASEMAP_URL = "https://tiles.openfreemap.org/styles/fiord";

/** deck.gl qatlarının baza xəritəsi daxilində yerləşdirilməsi (interleaved) */
export const BEFORE_ROADS = "tunnel_motorway_casing"; // istilik xəritəsi yolların altında
export const BEFORE_LABELS = "water_name"; // xətlər yazıların altında

const K = {
  land: "#132B38",
  water: "#0A1A23",
  coast: "#2C5A6C",
  urban: "#183343",
  park: "#163A36",
  wood: "#15332F",
  building: "#1C3949",
  minor: "#1F3E4D",
  major: "#2B5061",
  motorway: "#35606F",
  rail: "#5F717A",
  halo: "#0F2430",
  district: "#A9C0CA",
  neighbourhood: "#7593A0",
  street: "#86A0AB",
  waterLabel: "#4F8396",
};

const NAME: unknown = ["coalesce", ["get", "name:az"], ["get", "name"]];
const lin = (...stops: number[]) => ["interpolate", ["linear"], ["zoom"], ...stops];
const exp = (base: number, ...stops: number[]) => ["interpolate", ["exponential", base], ["zoom"], ...stops];

type Patch = { paint?: Record<string, unknown>; layout?: Record<string, unknown>; minzoom?: number; maxzoom?: number; filter?: unknown };

const HIDE = new Set([
  "landcover_ice_shelf",
  "park_outline",
  "highway_major_casing",
  "highway_motorway_casing",
  "highway_ref",
  "boundary_state",
  "place_city_large",
  "place_state",
  "place_continent",
  "railway_transit",
  "railway_transit_dashline",
  "railway_service_dashline",
]);

const textBase = { "text-halo-color": K.halo, "text-halo-width": 1.4, "text-halo-blur": 0.4 };

const PATCH: Record<string, Patch> = {
  background: { paint: { "background-color": K.land } },
  water: { paint: { "fill-color": K.water, "fill-antialias": true, "fill-outline-color": K.coast } },
  landuse_residential: { paint: { "fill-color": K.urban, "fill-opacity": lin(9, 0.35, 13, 0.7) } },
  landcover_wood: { paint: { "fill-color": K.wood, "fill-opacity": lin(9, 0, 12, 0.8) } },
  park: { paint: { "fill-color": K.park, "fill-opacity": 0.75 } },
  waterway: { paint: { "line-color": K.water, "line-opacity": 1 } },
  building: { minzoom: 13, paint: { "fill-color": K.building, "fill-opacity": lin(13, 0, 14.5, 0.9), "fill-antialias": true, "fill-outline-color": "#21414F" } },
  "aeroway-area": { paint: { "fill-color": K.minor, "fill-opacity": 0.8 } },
  "aeroway-runway": { paint: { "line-color": K.minor } },
  "aeroway-runway-casing": { paint: { "line-color": K.minor } },
  "aeroway-taxiway": { paint: { "line-color": K.minor } },
  road_area_pier: { paint: { "fill-color": K.minor } },
  road_pier: { paint: { "line-color": K.minor } },
  tunnel_motorway_casing: { paint: { "line-color": K.land, "line-opacity": 0 } },
  tunnel_motorway_inner: { paint: { "line-color": K.major, "line-opacity": 0.6, "line-width": exp(1.4, 6, 0.6, 12, 1.6, 20, 22) } },
  highway_path: { minzoom: 15, paint: { "line-color": K.minor, "line-width": exp(1.2, 15, 0.6, 20, 2.5) } },
  highway_minor: { minzoom: 12, paint: { "line-color": K.minor, "line-opacity": lin(12, 0.4, 14, 1), "line-width": exp(1.55, 12, 0.4, 14, 1.2, 16, 3.5, 20, 16) } },
  highway_major_inner: { minzoom: 11, paint: { "line-color": K.major, "line-width": exp(1.3, 11, 0.9, 13, 1.6, 16, 5, 20, 18) } },
  highway_major_subtle: { paint: { "line-color": K.major, "line-opacity": 0.8, "line-width": 0.9 } },
  highway_motorway_inner: { paint: { "line-color": K.motorway, "line-width": exp(1.4, 6, 0.6, 11, 1.6, 16, 7, 20, 26) } },
  highway_motorway_subtle: { paint: { "line-color": K.motorway, "line-opacity": 0.6 } },
  railway_service: { paint: { "line-color": K.rail, "line-width": 1 } },
  railway: { minzoom: 10, paint: { "line-color": K.rail, "line-opacity": lin(10, 0.55, 13, 0.9), "line-width": exp(1.3, 10, 0.8, 14, 1.6, 18, 4) } },
  railway_dashline: { minzoom: 14, paint: { "line-color": K.land, "line-dasharray": [2, 3], "line-width": exp(1.3, 14, 0.6, 18, 2.4) } },
  water_name: {
    layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 12, "text-letter-spacing": 0.1 },
    paint: { ...textBase, "text-color": K.waterLabel },
  },
  highway_name_other: {
    minzoom: 13.5,
    filter: ["all", ["!=", ["get", "class"], "motorway"], ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false], ["!=", ["slice", ["coalesce", ["get", "name"], ""], 0, 3], ">>>"]],
    layout: { "text-field": NAME, "text-transform": "none", "text-size": lin(13.5, 9.5, 17, 12), "text-font": ["Noto Sans Regular"], "symbol-spacing": 420, "text-letter-spacing": 0.02 },
    paint: { ...textBase, "text-color": K.street, "text-opacity": lin(13.5, 0, 14, 1) },
  },
  "boundary_country_z5-": { paint: { "line-color": "#3E6475", "line-opacity": 0.6 } },
  place_other: {
    minzoom: 13,
    layout: { "text-field": NAME, "text-size": 10, "text-letter-spacing": 0.08, "text-font": ["Noto Sans Regular"] },
    paint: { ...textBase, "text-color": K.neighbourhood },
  },
  place_suburb: {
    layout: { "text-field": NAME, "text-size": lin(10, 10.5, 14, 12.5), "text-letter-spacing": 0.14, "text-font": ["Noto Sans Bold"] },
    paint: { ...textBase, "text-color": K.district, "text-opacity": lin(14, 1, 15, 0.6) },
  },
  place_village: {
    layout: { "text-field": NAME, "text-size": 10, "text-letter-spacing": 0.08, "icon-image": "" },
    paint: { ...textBase, "text-color": K.neighbourhood },
  },
  place_town: {
    layout: { "text-field": NAME, "text-size": 11, "text-letter-spacing": 0.1, "icon-image": "" },
    paint: { ...textBase, "text-color": K.district },
  },
  place_city: {
    layout: { "text-field": NAME, "text-size": 12, "text-letter-spacing": 0.12, "text-font": ["Noto Sans Bold"] },
    paint: { ...textBase, "text-color": K.district },
  },
};

/** 3D binalar (rəqəmsal əkiz rejimi): hündürlüyə görə işıqlanan, şaquli qradiyentli */
export const BUILDINGS_3D: LayerSpecification = {
  id: "ayan-buildings-3d",
  type: "fill-extrusion",
  source: "openmaptiles",
  "source-layer": "building",
  minzoom: 13,
  layout: { visibility: "none" },
  paint: {
    "fill-extrusion-color": [
      "interpolate", ["linear"], ["coalesce", ["get", "render_height"], 9],
      0, "#1E3C4B", 20, "#28505F", 60, "#3A6A7B", 140, "#5A8E9E",
    ],
    "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 14, ["coalesce", ["get", "render_height"], 9]],
    "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
    "fill-extrusion-opacity": 0.88,
    "fill-extrusion-vertical-gradient": true,
  },
} as LayerSpecification;

function transform(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = [];
  for (const l0 of style.layers) {
    const l = { ...l0 } as LayerSpecification & Patch;
    if (HIDE.has(l.id)) l.layout = { ...(l.layout ?? {}), visibility: "none" } as never;
    const p = PATCH[l.id];
    if (p) {
      if (p.paint) l.paint = { ...(l.paint ?? {}), ...p.paint } as never;
      if (p.layout) l.layout = { ...(l.layout ?? {}), ...p.layout } as never;
      if (p.minzoom != null) l.minzoom = p.minzoom;
      if (p.maxzoom != null) l.maxzoom = p.maxzoom;
      if (p.filter) (l as { filter?: unknown }).filter = p.filter;
    }
    if (l.id === BEFORE_LABELS) layers.push(BUILDINGS_3D);
    layers.push(l);
  }
  if (!layers.some((l) => l.id === BUILDINGS_3D.id)) layers.push(BUILDINGS_3D);
  return {
    ...style,
    layers,
    sky: {
      "sky-color": "#0B1D27",
      "horizon-color": "#1D4354",
      "fog-color": "#102733",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.7,
      "fog-ground-blend": 0.35,
      "atmosphere-blend": 0,
    },
  };
}

/** Üslubu yükləyib yenidən rəngləyir; uğursuz olarsa orijinal URL qaytarılır (xəritə yenə işləyir). */
export async function loadCaspianStyle(): Promise<StyleSpecification | string> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 6000);
    const r = await fetch(BASEMAP_URL, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return BASEMAP_URL;
    return transform((await r.json()) as StyleSpecification);
  } catch {
    return BASEMAP_URL;
  }
}
