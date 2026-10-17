// Yazıların toqquşma filtri (ekran pikselində, prioritetə görə acgöz seçim).
// Qeyd: deck.gl CollisionFilterExtension MapboxOverlay interleaved rejimində TextLayer-i tam gizlədir,
// buna görə sadə və deterministik öz həllimiz: Web Mercator piksel koordinatları zoom üzrə hesablanır.

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Dünya piksel koordinatı (512 px kafel, MapLibre ilə eyni miqyas) */
export function worldPx(lon: number, lat: number, zoom: number): [number, number] {
  const scale = 512 * 2 ** zoom;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * scale, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale];
}

const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

export type Candidate = { key: string; prio: number; box: Box };

/** Prioritet azalan sırayla, maneələr və artıq qəbul olunmuş yazılarla kəsişməyənləri seçir. */
export function declutter(cands: Candidate[], obstacles: Box[] = []): Set<string> {
  const placed: Box[] = [];
  const keep = new Set<string>();
  for (const c of [...cands].sort((a, b) => b.prio - a.prio)) {
    if (placed.some((b) => hit(b, c.box))) continue;
    if (obstacles.some((b) => hit(b, c.box))) continue;
    placed.push(c.box);
    keep.add(c.key);
  }
  return keep;
}

/** Mətn eninin təxmini (Archivo, qarışıq registr) */
export const textW = (t: string, size: number, bold = false) => t.length * size * (bold ? 0.6 : 0.56);

/** Mərkəzi (x, y) olan kvadrat qutu */
export const square = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
