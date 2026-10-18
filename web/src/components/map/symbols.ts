// Xəritə nişanları: eyni SVG həm deck.gl IconLayer-də, həm də leqenddə istifadə olunur (uyğunluq zəmanəti).
import { C } from "@/lib/theme";

export type SymbolId = "metro" | "official" | "rail" | "terminal";

const S = 48; // atlas üçün 2x ölçü (retina-da kəskin)

const svg: Record<SymbolId, string> = {
  // Bakı metrosunun nişanı kimi: qırmızı dairə, ağ "M"
  metro: `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10.6" fill="${C.metro}" stroke="#FFFFFF" stroke-width="1.6"/>
    <path d="M6.6 16.4V7.8L12 13.2L17.4 7.8V16.4" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  // AYNA mübadilə mərkəzi: firuzəyi kvadrat, ağ qarşılıqlı oxlar (köçürmə)
  official: `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 24 24">
    <rect x="1.8" y="1.8" width="20.4" height="20.4" rx="5" fill="${C.official}" stroke="#FFFFFF" stroke-width="1.8"/>
    <path d="M6.5 9.2H16.6M13.8 6.4L16.6 9.2L13.8 12" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17.5 14.8H7.4M10.2 12L7.4 14.8L10.2 17.6" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  // Elektrik qatarı stansiyası: tünd kvadrat, ağ qatar siluyeti
  rail: `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 24 24">
    <rect x="1.6" y="1.6" width="20.8" height="20.8" rx="4" fill="${C.railDark}" stroke="${C.rail}" stroke-width="1.8"/>
    <rect x="7" y="4.6" width="10" height="11.4" rx="2.6" fill="#FFFFFF"/>
    <rect x="8.7" y="6.6" width="6.6" height="3.6" rx="0.8" fill="${C.railDark}"/>
    <circle cx="9.6" cy="13.2" r="1" fill="${C.railDark}"/><circle cx="14.4" cy="13.2" r="1" fill="${C.railDark}"/>
    <path d="M9 17.6L7.6 19.6M15 17.6L16.4 19.6" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`,
  // Avtovağzal: mürəkkəb kvadrat, ağ avtobus siluyeti
  terminal: `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 24 24">
    <rect x="1.6" y="1.6" width="20.8" height="20.8" rx="4" fill="${C.station}" stroke="#FFFFFF" stroke-width="1.6"/>
    <rect x="6" y="4.8" width="12" height="12.6" rx="2.2" fill="#FFFFFF"/>
    <rect x="7.6" y="6.6" width="8.8" height="4.6" rx="0.8" fill="${C.station}"/>
    <circle cx="8.8" cy="14.4" r="1" fill="${C.station}"/><circle cx="15.2" cy="14.4" r="1" fill="${C.station}"/>
    <path d="M8 17.4V19.2M16 17.4V19.2" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,
};

const url = (id: SymbolId) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg[id].replace(/\s+/g, " "))}`;
export const SYMBOL_URL: Record<SymbolId, string> = {
  metro: url("metro"),
  official: url("official"),
  rail: url("rail"),
  terminal: url("terminal"),
};

/** IconLayer üçün nişan təsviri */
export const icon = (id: SymbolId) => ({ id, url: SYMBOL_URL[id], width: S, height: S, anchorY: S / 2, mask: false });

/** Hub nişanı (leqend üçün): xəritədəki kimi doldurulmuş disk, ağ haşiyə, istəyə görə rəqəm */
export function hubRingUrl(st: { fill: string; ring: string; text: string; outer?: string }, label = "") {
  const ring = st.outer ? st.outer : st.ring === "#FFFFFF" ? st.fill : st.ring;
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${st.fill}" stroke="${ring}" stroke-width="3.2"/>
    ${st.outer ? `<circle cx="12" cy="12" r="7.2" fill="none" stroke="#FFFFFF" stroke-width="1.6"/>` : ""}
    ${label ? `<text x="12" y="15.6" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-weight="800" font-size="10" fill="${st.text}">${label}</text>` : ""}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.replace(/\s+/g, " "))}`;
}
