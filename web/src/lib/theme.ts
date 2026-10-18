// Rəng tokenləri: BakıKart validatoru dünyası. Kart kağızı fon, kobalt brend (AYAN işarəsi),
// mürəkkəb validator ekranı; xəritədə Bakı nəqliyyat nişanları (metro qırmızı, velo yaşıl) saxlanılır.
export const C = {
  /** xəritə arxasındakı fon (kart kağızı) */
  bg: "#F5F7FA",
  /** panellər: ağ kart */
  surface: "#FFFFFF",
  surface2: "#F2F5F9",
  /** 1px polad tikiş */
  line: "#D3DAE3",
  text: "#0E1A2B",
  muted: "#5A6779",
  /** validator ekranı (mürəkkəb) */
  ink: "#0E1A2B",
  /** xəritədə simvol konturları */
  paper: "#FFFFFF",
  /** brend: AYAN işarəsinin kobalt mavisi */
  cobalt: "#1F5BB5",
  ok: "#12A150",
  deny: "#D7372F",
  metro: "#D6403A",
  /** avtobus şəbəkəsi: sakit kontekst, kobalt hub-larla qarışmasın deyə polad-mavi */
  bus: "#6683A8",
  bike: "#12A150",
  /** MPS: AYNA ümumi parkinq siyahısı (tünd yaşıl) */
  mps: "#16864A",
  /** MPV: yeni velosiped məntəqələri (açıq yaşıl) */
  mpv: "#56C487",
  /** yeni hub: kobalt */
  hub: "#1F5BB5",
  /** parkinqin hub-a çevrilməsi */
  upgrade: "#7A4CC2",
  /** AYNA-nın mövcud mübadilə mərkəzləri və onlara mikromobillik inteqrasiyası */
  official: "#0A8C8C",
  integrate: "#0A8C8C",
  /** Elektrik qatarı (ADY): neytral, dəmiryol nişanı kimi */
  rail: "#5F6B78",
  railDark: "#2A323B",
  station: "#0E1A2B",
} as const;

export type RGBA = [number, number, number, number];
export function rgb(hex: string, a = 255): RGBA {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
}

/** Polad: validator lövhəsinin neytral halqası (ssenari, inteqrasiya) */
export const STEEL = "#8E9AA8";

/** Hub əməliyyatının rəngi: yeni = göy, çevrilmə = açıq yaşıl, inteqrasiya = sarı (ağ haşiyə ilə) */
export const HUB_FILL = { new: "#1F5BB5", upgrade: "#7ED957", integrate: "#F5C518" } as const;
export function actionStyle(action: string): { fill: string; ring: string; text: string; outer?: string } {
  if (action === "upgrade") return { fill: HUB_FILL.upgrade, ring: "#FFFFFF", text: C.ink };
  if (action === "integrate") return { fill: HUB_FILL.integrate, ring: "#FFFFFF", text: C.ink };
  return { fill: HUB_FILL.new, ring: "#FFFFFF", text: "#FFFFFF" };
}
/** xətlər, izoxron, yazılar üçün: açıq fonda oxunsun deyə eyni tonun tünd variantı */
export function actionColor(action: string): string {
  return action === "upgrade" ? "#2F8F3A" : action === "integrate" ? "#A77C00" : C.cobalt;
}
export const ACTION_LABEL: Record<string, string> = {
  new: "Yeni hub",
  upgrade: "Parkinqin hub-a çevrilməsi",
  integrate: "AYNA mübadilə mərkəzinə inteqrasiya",
};

// İstilik şkalası (ColorBrewer YlOrRd əsaslı, ardıcıl: işıqlıq monoton azalır).
// Xidmətsiz tələbat = validatorun "rədd" ailəsi; kobalt hub-larla maksimum kontrast.
// İndeks 0 və 1 (median altı) tam şəffafdır: yalnız diqqətə layiq xanalar görünür.
export const GAP_STOPS: RGBA[] = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [253, 214, 150, 52],
  [250, 176, 104, 88],
  [240, 128, 74, 128],
  [212, 76, 48, 168],
];
