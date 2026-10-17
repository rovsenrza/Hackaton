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
  /** MPS: AYNA ümumi parkinq siyahısı (tünd yaşıl) */
  mps: "#2E9A63",
  /** MPV: yeni velosiped məntəqələri (açıq yaşıl) */
  mpv: "#9BE3B8",
  hub: "#F2A93B",
  upgrade: "#C9A0FF",
  /** AYNA-nın mövcud mübadilə mərkəzləri və onlara mikromobillik inteqrasiyası */
  official: "#4FD2D9",
  integrate: "#4FD2D9",
  /** Elektrik qatarı (ADY): neytral, dəmiryol nişanı kimi */
  rail: "#DDE3E6",
  railDark: "#26323A",
  station: "#F0E3C2",
} as const;

export type RGBA = [number, number, number, number];
export function rgb(hex: string, a = 255): RGBA {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
}

/** Hub əməliyyatının rəngi: yeni / hub-a çevrilmə / AYNA mərkəzinə inteqrasiya */
export function actionColor(action: string): string {
  return action === "upgrade" ? C.upgrade : action === "integrate" ? C.integrate : C.hub;
}
export const ACTION_LABEL: Record<string, string> = {
  new: "Yeni hub",
  upgrade: "Parkinqin hub-a çevrilməsi",
  integrate: "AYNA mübadilə mərkəzinə inteqrasiya",
};

// İstilik şkalası (ColorBrewer RdPu əsaslı, ardıcıl, rəng korluğuna davamlı: işıqlıq monoton artır).
// Kəhrəba hub-larla, qırmızı metro ilə toqquşmasın deyə bənövşəyi-çəhrayı tondadır.
// İndeks 0 və 1 (median altı) tam şəffafdır: yalnız diqqətə layiq xanalar görünür.
export const GAP_STOPS: RGBA[] = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [112, 40, 128, 34],
  [164, 46, 140, 78],
  [226, 88, 150, 145],
  [250, 172, 182, 210],
];
