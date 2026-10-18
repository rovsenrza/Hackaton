/**
 * Prosedur 3D modellər (kənar model faylı yoxdur: lisenziya riski yoxdur, yükləmə ani).
 * Vahid: metr; x = uzunluq (irəli), y = en, z = yuxarı; mənşə yerdə, mərkəzdə.
 * Vertex rəngləri SimpleMeshLayer-in getColor-u ilə vurulur (getColor ağ = öz rəngləri).
 */

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

interface Part {
  x: [number, number];
  y: [number, number];
  z: [number, number];
  c: string;
}

// qutunun 6 üzü: [normal, 4 künc indeksi (x,y,z min/max seçimi)]
const FACES: [RGB, [number, number, number][]][] = [
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]]],
  [[0, 1, 0], [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]]],
];

export interface Mesh {
  attributes: {
    POSITION: { value: Float32Array; size: 3 };
    NORMAL: { value: Float32Array; size: 3 };
    COLOR_0: { value: Float32Array; size: 3 };
  };
}

function build(parts: Part[]): Mesh {
  const n = parts.length * 36;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let k = 0;
  for (const p of parts) {
    const c = hex(p.c);
    for (const [nrm, q] of FACES) {
      const v = q.map(([ix, iy, iz]) => [p.x[ix], p.y[iy], p.z[iz]]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.set(v[i], k * 3);
        nor.set(nrm, k * 3);
        col.set(c, k * 3);
        k++;
      }
    }
  }
  return { attributes: { POSITION: { value: pos, size: 3 }, NORMAL: { value: nor, size: 3 }, COLOR_0: { value: col, size: 3 } } };
}

// --- Bakı şəhər avtobusu (12 m, alçaq döşəməli): ağ gövdə, mavi alt zolaq, tünd şüşə, kəhrəba LED tablo ---
const W = 1.27;
export const BUS_MESH = build([
  { x: [-6, 6], y: [-W, W], z: [0.32, 3.0], c: "#EEF2F4" },               // gövdə
  { x: [-6.02, 6.02], y: [-W - 0.02, W + 0.02], z: [0.32, 1.0], c: "#1E6FB8" }, // alt zolaq
  { x: [-6.03, 6.03], y: [-W - 0.03, W + 0.03], z: [1.0, 1.12], c: "#3CB37A" }, // yaşıl xətt
  { x: [-5.3, 5.5], y: [-W - 0.03, W + 0.03], z: [1.3, 2.55], c: "#16252F" },   // yan şüşələr
  { x: [5.96, 6.05], y: [-1.12, 1.12], z: [0.95, 2.62], c: "#0E1C26" },         // ön şüşə
  { x: [6.0, 6.08], y: [-0.95, 0.95], z: [2.66, 2.94], c: "#FFB020" },          // ön LED marşrut tablosu
  { x: [-6.06, -5.98], y: [-0.7, 0.7], z: [2.66, 2.9], c: "#FFB020" },          // arxa tablo
  { x: [-3.2, 2.2], y: [-0.85, 0.85], z: [3.0, 3.32], c: "#C3CDD3" },           // dam bloku (kondisioner/batareya)
  { x: [3.7, 4.6], y: [-W - 0.06, -W + 0.25], z: [0, 0.75], c: "#121619" },     // təkərlər
  { x: [3.7, 4.6], y: [W - 0.25, W + 0.06], z: [0, 0.75], c: "#121619" },
  { x: [-4.0, -3.1], y: [-W - 0.06, -W + 0.25], z: [0, 0.75], c: "#121619" },
  { x: [-4.0, -3.1], y: [W - 0.25, W + 0.06], z: [0, 0.75], c: "#121619" },
]);

// --- Mobility hub pavilyonu (M tipi: 14 × 3,8 m; S/L getScale ilə) ---
export const HUB_DIM = { S: { len: 8, wid: 3.2 }, M: { len: 14, wid: 3.8 }, L: { len: 20, wid: 4.6 } } as const;
const HL = 7;   // yarım uzunluq (M)
const HW = 1.9; // yarım en (M)
const docks: Part[] = Array.from({ length: 9 }, (_, i) => {
  const x = -HL + 1.2 + i * 1.3;
  return { x: [x, x + 0.08], y: [-HW + 0.25, -HW + 0.95], z: [0.18, 1.05], c: "#3CB37A" };
});
const pillars: Part[] = [-1, 1].flatMap((sx) =>
  [-1, 1].map((sy) => ({ x: [sx * (HL - 0.5) - 0.13, sx * (HL - 0.5) + 0.13] as [number, number],
    y: [sy * (HW - 0.35) - 0.13, sy * (HW - 0.35) + 0.13] as [number, number], z: [0.18, 3.1] as [number, number], c: "#A7B4BC" })),
);
/** Neytral hissələr (öz rəngləri ilə): platforma, dirəklər, dok yerləri, skamya, nişan dirəyi */
export const HUB_STRUCT = build([
  { x: [-HL - 0.4, HL + 0.4], y: [-HW - 0.3, HW + 0.3], z: [0, 0.18], c: "#5C7482" },   // platforma
  ...pillars,
  ...docks,
  { x: [-HL + 1.4, -HL + 3.6], y: [HW - 0.75, HW - 0.35], z: [0.18, 0.62], c: "#8C6A4A" }, // skamya
  { x: [HL - 2.6, HL - 0.8], y: [HW - 0.42, HW - 0.3], z: [0.6, 2.4], c: "#1B2B36" },     // məlumat ekranı
  { x: [HL + 1.0, HL + 1.5], y: [-0.25, 0.25], z: [0, 3.6], c: "#EDF1F3" },              // nişan dirəyi
]);
/** Hub növünün rəngində olan hissələr (getColor = növ rəngi): örtük və nişan dirəyinin başlığı */
export const HUB_CANOPY = build([
  { x: [-HL - 0.6, HL + 0.6], y: [-HW - 0.5, HW + 0.5], z: [3.1, 3.38], c: "#FFFFFF" },
  { x: [HL + 0.9, HL + 1.6], y: [-0.4, 0.4], z: [3.6, 4.5], c: "#FFFFFF" },
]);
export const HUB_TOP_M = 4.5;
