// Rəng tokenləri: Bakı nəqliyyat nişanlarından (metro qırmızı, avtobus mavi, velo yaşıl, hub kəhrəba)
export const C = {
  bg: "#0F2430",
  surface: "#16313F",
  surface2: "#1D3E4F",
  line: "#2A5163",
  text: "#E8EEF0",
  muted: "#8FA6B2",
  metro: "#D6403A",
  bus: "#3D8FD6",
  bike: "#3CB37A",
  hub: "#F2A93B",
  upgrade: "#C9A0FF",
  station: "#F0E3C2",
} as const;

export type RGBA = [number, number, number, number];
export function rgb(hex: string, a = 255): RGBA {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
}

// Boşluq şkalası (kvantil siniflər, rəng korluğuna davamlı: işıqlıq monoton artır)
export const GAP_STOPS: RGBA[] = [
  [40, 70, 86, 0],
  [120, 70, 110, 0],
  [168, 52, 80, 70],
  [222, 92, 52, 150],
  [242, 169, 59, 210],
  [252, 226, 150, 245],
];
