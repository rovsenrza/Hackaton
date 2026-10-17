// Saxta dəqiqlik yoxdur: rəqəmlər etibarlılığa uyğun yuvarlaqlaşdırılır (PLAN.md 4.12)
// Azərbaycan standartı: minliklər boşluqla, onluq vergüllə (2 065 000; 0,9)
const nf = { format: (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") };

export function approx(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  const step = a >= 100000 ? 1000 : a >= 10000 ? 100 : a >= 1000 ? 10 : 1;
  return "~" + nf.format(Math.round(n / step) * step);
}

export function int(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return nf.format(Math.round(n));
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x == null || !isFinite(x)) return "—";
  return (x * 100).toFixed(digits).replace(".", ",") + "%";
}

export function tons(n: number): string {
  if (n < 10) return n.toFixed(1).replace(".", ",");
  return nf.format(Math.round(n));
}

export function meters(m: number | null | undefined): string {
  if (m == null || !isFinite(m)) return "1,5 km-dən uzaq";
  return m >= 1000 ? (m / 1000).toFixed(1).replace(".", ",") + " km" : Math.round(m) + " m";
}
