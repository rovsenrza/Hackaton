/**
 * 3D rəqəmsal əkiz üçün avtobus parkı: SİMULYASİYA (real GPS deyil).
 *
 * - Həndəsə: AYNA xəritə API-sinin cari marşrutları (bus_routes.geojson)
 * - Avtobus sayı: AYNA-nın gündəlik xəttə çıxan ~2 350 avtobusu, marşrutlara sərnişin payına görə bölünür
 * - Sürət: Bakı avtobuslarının orta sürəti ~17 km/saat, vizual olaraq PLAYBACK dəfə sürətləndirilir
 */

export const FLEET_TOTAL = 2350;
export const BUS_SPEED_MS = 17 / 3.6;
export const PLAYBACK = 6;
// BakuBus ölçüləri (m): uzunluq × en × hündürlük
export const BUS_DIM = { len: 12, wid: 2.55, hgt: 3.1 };

interface Seg {
  pts: [number, number][];
  cum: number[]; // kumulyativ məsafə (m)
  L: number;
}

export interface Bus {
  seg: number;
  off: number; // marşrut üzrə başlanğıc ofseti (m)
  route: string;
  position: [number, number, number];
  yaw: number;
}

export interface Fleet {
  segs: Seg[];
  buses: Bus[];
}

const M_LAT = 110540;
const mLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function buildFleet(routes: GeoJSON.FeatureCollection, total = FLEET_TOTAL): Fleet {
  const segs: Seg[] = [];
  const perRoute: { segIdx: number[]; pax: number; route: string; len: number }[] = [];
  for (const f of routes.features) {
    const g = f.geometry;
    const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    const idx: number[] = [];
    let len = 0;
    for (const l of lines) {
      const pts = l as [number, number][];
      if (pts.length < 2) continue;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        cum.push(cum[i - 1] + Math.hypot((x1 - x0) * mLon(y0), (y1 - y0) * M_LAT));
      }
      const L = cum[cum.length - 1];
      if (L < 200) continue;
      idx.push(segs.length);
      segs.push({ pts, cum, L });
      len += L;
    }
    if (idx.length) perRoute.push({ segIdx: idx, pax: Number(f.properties?.pax ?? 0), route: String(f.properties?.route ?? ""), len });
  }
  const paxSum = perRoute.reduce((a, r) => a + Math.max(r.pax, 1), 0);
  const buses: Bus[] = [];
  for (const r of perRoute) {
    const n = Math.max(1, Math.round((total * Math.max(r.pax, 1)) / paxSum));
    // marşrutun istiqamətləri arasında uzunluğa görə bölünür, intervallar bərabərdir
    for (const si of r.segIdx) {
      const k = Math.max(1, Math.round((n * segs[si].L) / r.len));
      for (let j = 0; j < k; j++) {
        buses.push({ seg: si, off: (segs[si].L * j) / k, route: r.route, position: [0, 0, 0], yaw: 0 });
      }
    }
  }
  return { segs, buses };
}

/** t (s) anında hər avtobusun mövqeyi və istiqaməti (obyektlər yerində yenilənir). */
export function updateFleet(fleet: Fleet, t: number, z = BUS_DIM.hgt / 2): Bus[] {
  const d = t * BUS_SPEED_MS * PLAYBACK;
  for (const b of fleet.buses) {
    const s = fleet.segs[b.seg];
    const pos = (b.off + d) % s.L;
    // ikili axtarış: pos-un düşdüyü seqment
    let lo = 0;
    let hi = s.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s.cum[mid] <= pos) lo = mid;
      else hi = mid;
    }
    const [x0, y0] = s.pts[lo];
    const [x1, y1] = s.pts[hi];
    const segL = s.cum[hi] - s.cum[lo] || 1;
    const u = (pos - s.cum[lo]) / segL;
    b.position[0] = x0 + (x1 - x0) * u;
    b.position[1] = y0 + (y1 - y0) * u;
    b.position[2] = z;
    b.yaw = (Math.atan2((y1 - y0) * M_LAT, (x1 - x0) * mLon(y0)) * 180) / Math.PI;
  }
  return fleet.buses;
}
