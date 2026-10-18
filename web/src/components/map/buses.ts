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

/** AYNA SIRI-dən gələn real avtobus (engine /live/buses) */
export interface LiveBus {
  id: string;
  line: string | null;
  destination: string | null;
  lon: number;
  lat: number;
  /** avtobusdan yaxınlaşdığı dayanacağa istiqamət */
  yaw: number | null;
  occupancy: string | null;
}

/** fade: 0..1, görünmə/yox olma animasiyası (model ölçüsünə vurulur) */
export type LiveBusObj = Bus & { live: LiveBus; fade: number };

/** brauzerin engine-dən yeni mövqe istəmə intervalı */
export const LIVE_POLL_MS = 5000;
// AYNA hər avtobusun mövqeyini ~5–15 s-dən bir yeniləyir (ölçülüb): animasiya müddəti hər avtobusun
// öz yenilənmə tezliyinə uyğunlaşır, avtobus "gedib-dayanmır"
const ANIM_MIN_MS = 5000;
const ANIM_MAX_MS = 20000;
const ANIM_INIT_MS = 10000;
// animasiya təxmini intervaldan bir qədər uzundur: növbəti ölçü adətən avtobus dayanmazdan əvvəl gəlir
const ANIM_STRETCH = 1.3;
const GRACE_MS = 30000; // cavabda görünməyən avtobus bu müddət son yerində qalır (sorğu dəyişəndə yox olmasın)
const FADE_MS = 700; // görünmə və yox olma birdən yox, kiçilib-böyüyərək
const YAW_TAU_MS = 250; // istiqamətin hamarlanması
const SNAP_M = 40; // GPS nöqtəsinin marşrut xəttinə maksimal məsafəsi
const Z = BUS_DIM.hgt / 2;

interface Line {
  pts: [number, number][];
  cum: number[];
}

interface Track {
  bus: LiveBusObj;
  a: [number, number];
  b: [number, number];
  t0: number;
  dur: number;
  line?: Line;
  s0: number;
  s1: number;
  /** başlanğıcda göstərilən yer ilə xətt üzərindəki proyeksiyası arasındakı fərq: animasiya boyu sıfıra enir (sıçrayış olmasın) */
  off: [number, number];
  /** hədəf istiqamət; göstərilən bus.yaw ona hamar yaxınlaşır */
  yaw: number;
  /** son mövqe dəyişikliyinin vaxtı və bu avtobusun orta yenilənmə intervalı */
  fixAt: number;
  interval: number;
  seenAt: number;
  bornAt: number;
  dyingAt?: number;
}

function toLine(pts: [number, number][]): Line {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * mLon(pts[i - 1][1]), (pts[i][1] - pts[i - 1][1]) * M_LAT));
  }
  return { pts, cum };
}

const meters = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * mLon(a[1]), (b[1] - a[1]) * M_LAT);
const bearing = (a: [number, number], b: [number, number]) => (Math.atan2((b[1] - a[1]) * M_LAT, (b[0] - a[0]) * mLon(a[1])) * 180) / Math.PI;

/** nöqtənin xətt üzrə proyeksiyası: məsafə (m), xətt boyunca mövqe s (m), seqmentin istiqaməti */
function project(l: Line, lon: number, lat: number) {
  const kx = mLon(lat);
  let d = Infinity, s = 0, dir = 0;
  for (let i = 1; i < l.pts.length; i++) {
    const ax = (l.pts[i - 1][0] - lon) * kx, ay = (l.pts[i - 1][1] - lat) * M_LAT;
    const dx = (l.pts[i][0] - lon) * kx - ax, dy = (l.pts[i][1] - lat) * M_LAT - ay;
    const u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const di = Math.hypot(ax + u * dx, ay + u * dy);
    if (di < d) {
      d = di;
      s = l.cum[i - 1] + u * (l.cum[i] - l.cum[i - 1]);
      dir = (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  }
  return { d, s, dir };
}

function along(l: Line, s: number): [number, number, number] {
  let lo = 0;
  let hi = l.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (l.cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = l.pts[lo];
  const [x1, y1] = l.pts[hi];
  const u = Math.max(0, Math.min(1, (s - l.cum[lo]) / (l.cum[hi] - l.cum[lo] || 1)));
  return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, bearing([x0, y0], [x1, y1])];
}

/**
 * Real avtobusların axıcı hərəkəti. Hər yeni GPS ölçüsündə avtobus ekrandakı yerindən yeni ölçüyə doğru
 * öz marşrut xətti boyunca hərəkət edir (xətt tapılmasa düz xətlə); müddət həmin avtobusun yenilənmə
 * intervalıdır. Göstərilən mövqe həmişə iki real ölçü arasındadır, irəli təxmin yoxdur: qiyməti ~5–15 s gecikmədir.
 */
export class LiveTracker {
  private byRoute = new Map<string, Line[]>();
  private all: Line[] = [];
  private tracks = new Map<string, Track>();

  constructor(paths: { path: [number, number][]; route: string }[]) {
    for (const p of paths) {
      if (p.path.length < 2) continue;
      const l = toLine(p.path);
      this.all.push(l);
      this.byRoute.set(p.route, [...(this.byRoute.get(p.route) ?? []), l]);
    }
  }

  private own(b: LiveBus) {
    return this.byRoute.get(String(b.line ?? "").replace(/_+$/, "")) ?? [];
  }

  /** ilk istiqamət: ən yaxın xətt seqmenti, avtobusun yaxınlaşdığı dayanacağa doğru tərəfə */
  private initialYaw(b: LiveBus): number {
    let best = { d: Infinity, s: 0, dir: 0 };
    for (const lines of [this.own(b), this.all]) {
      for (const l of lines) {
        const p = project(l, b.lon, b.lat);
        if (p.d < best.d) best = p;
      }
      if (best.d <= SNAP_M) break;
    }
    if (best.d > SNAP_M) return b.yaw ?? 0;
    return b.yaw != null && Math.abs(((best.dir - b.yaw + 540) % 360) - 180) > 90 ? best.dir + 180 : best.dir;
  }

  update(live: LiveBus[], now: number) {
    const next = new Map<string, Track>();
    for (const b of live) {
      const to: [number, number] = [b.lon, b.lat];
      const prev = this.tracks.get(b.id);
      if (!prev) {
        const yaw = this.initialYaw(b);
        const bus: LiveBusObj = { seg: -1, off: 0, route: String(b.line ?? ""), position: [b.lon, b.lat, Z], yaw, live: b, fade: 0 };
        next.set(b.id, { bus, a: to, b: to, t0: now, dur: ANIM_INIT_MS, s0: 0, s1: 0, off: [0, 0], yaw, fixAt: now, interval: ANIM_INIT_MS, seenAt: now, bornAt: now });
        continue;
      }
      prev.bus.live = b;
      prev.bus.route = String(b.line ?? "");
      prev.seenAt = now;
      if (prev.dyingAt != null) {
        prev.dyingAt = undefined; // yenidən göründü
        prev.bornAt = now - FADE_MS * prev.bus.fade;
      }
      if (prev.b[0] === to[0] && prev.b[1] === to[1]) {
        next.set(b.id, prev); // yeni ölçü yoxdur: hərəkət davam edir
        continue;
      }
      // bu avtobusun yenilənmə intervalı (sürüşən orta): növbəti ölçü təxminən bu qədər sonra gələcək
      const interval = Math.min(ANIM_MAX_MS, Math.max(ANIM_MIN_MS, 0.5 * prev.interval + 0.5 * (now - prev.fixAt)));
      const from: [number, number] = [prev.bus.position[0], prev.bus.position[1]];
      const jump = meters(from, to);
      const t: Track = { ...prev, a: from, b: to, t0: now, dur: Math.min(ANIM_MAX_MS, interval * ANIM_STRETCH), line: undefined, s0: 0, s1: 0, off: [0, 0], fixAt: now, interval };
      if (jump > 1500) {
        t.a = to; // ölçülər arası boşluq çox böyükdür: sıçrayış, uydurma marşrut yox
      } else {
        let bestD = Infinity;
        for (const l of this.own(b)) {
          const p0 = project(l, from[0], from[1]);
          const p1 = project(l, to[0], to[1]);
          const ok = p0.d <= SNAP_M && p1.d <= SNAP_M && p1.s >= p0.s - 5 && p1.s - p0.s <= 2 * jump + 300;
          if (ok && p0.d + p1.d < bestD) {
            bestD = p0.d + p1.d;
            const [lx, ly] = along(l, p0.s);
            Object.assign(t, { line: l, s0: p0.s, s1: p1.s, off: [from[0] - lx, from[1] - ly] });
          }
        }
      }
      next.set(b.id, t);
    }
    // bu cavabda olmayan avtobuslar: başqa dayanacaqlar sorğulandığı üçün ola bilər, bir müddət saxlanır
    for (const [id, t] of this.tracks) {
      if (next.has(id)) continue;
      if (now - t.seenAt < GRACE_MS) next.set(id, t);
      else if (t.dyingAt == null) next.set(id, { ...t, dyingAt: now });
      else if (now - t.dyingAt < FADE_MS) next.set(id, t);
    }
    this.tracks = next;
  }

  clear() {
    this.tracks.clear();
  }

  /** now anında bütün avtobusların mövqeyi və istiqaməti (obyektlər yerində yenilənir) */
  frame(now: number): LiveBusObj[] {
    const dt = Math.min(200, Math.max(0, now - this.lastFrame));
    this.lastFrame = now;
    const k = 1 - Math.exp(-dt / YAW_TAU_MS);
    const out: LiveBusObj[] = [];
    for (const t of this.tracks.values()) {
      const u = Math.min(1, (now - t.t0) / t.dur);
      const p = t.bus.position;
      if (t.line && t.s1 - t.s0 > 1) {
        const [x, y, yaw] = along(t.line, t.s0 + (t.s1 - t.s0) * u);
        p[0] = x + t.off[0] * (1 - u);
        p[1] = y + t.off[1] * (1 - u);
        t.yaw = yaw;
      } else {
        p[0] = t.a[0] + (t.b[0] - t.a[0]) * u;
        p[1] = t.a[1] + (t.b[1] - t.a[1]) * u;
        if (meters(t.a, t.b) > 5) t.yaw = bearing(t.a, t.b);
      }
      // ən qısa bucaq fərqi ilə hamar dönmə
      const d = ((((t.yaw - t.bus.yaw) % 360) + 540) % 360) - 180;
      t.bus.yaw += d * k;
      const fadeIn = Math.min(1, (now - t.bornAt) / FADE_MS);
      t.bus.fade = t.dyingAt == null ? fadeIn : Math.min(fadeIn, Math.max(0, 1 - (now - t.dyingAt) / FADE_MS));
      if (t.bus.fade > 0) out.push(t.bus);
    }
    return out;
  }

  private lastFrame = 0;
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
