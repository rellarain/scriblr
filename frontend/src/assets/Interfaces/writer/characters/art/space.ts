// Space for the figure. The figure is drawn from a little 3D: x to the right, y down, z towards the viewer. A view turns it about the vertical axis (its yaw), and a
// point's screen place is its turned x and its y; the turned z is its depth (greater is nearer), which is what the painter's order of the pieces goes by.

export type View = 'front' | 'threeQuarter' | 'side' | 'back'
export const VIEWS: ReadonlyArray<{ id: View; name: string; yaw: number }> = [
  { id: 'front', name: 'Front', yaw: 0 },
  { id: 'threeQuarter', name: 'Three-quarter', yaw: 35 },
  { id: 'side', name: 'Side', yaw: 90 },
  { id: 'back', name: 'Back', yaw: 180 },
]
export const viewOf = (id: string): View => (VIEWS.some(v => v.id === id) ? (id as View) : 'front')

export interface Turn { yaw: number; c: number; s: number }
export function turnOf(view: View): Turn {
  const yaw = VIEWS.find(v => v.id === view)?.yaw ?? 0
  const r = (yaw * Math.PI) / 180
  return { yaw, c: Math.round(Math.cos(r) * 1e6) / 1e6, s: Math.round(Math.sin(r) * 1e6) / 1e6 }
}

export type V3 = [number, number, number]
export type V2 = [number, number]

// The screen x, the y and the depth of a 3D point in a turn.
export function turn(t: Turn, p: V3): V3 {
  return [p[0] * t.c + p[2] * t.s, p[1], -p[0] * t.s + p[2] * t.c]
}

export const rad = (deg: number) => (deg * Math.PI) / 180
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
// A number as the shortest text that is still exact enough for a drawing.
export const num = (v: number) => String(Math.round(v * 100) / 100)

export function polyPath(pts: V2[], closed = true): string {
  if (pts.length === 0) return ''
  return `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}${closed ? 'Z' : ''}`
}

// A smooth curve through the points (Catmull-Rom as cubic Beziers); `k` is how round it is (0 is straight).
export function smoothPath(pts: V2[], closed = true, k = 1): string {
  const n = pts.length
  if (n < 3 || k <= 0) return polyPath(pts, closed)
  const at = (i: number): V2 => (closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)])
  let d = `M${num(pts[0][0])} ${num(pts[0][1])}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i += 1) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * k, c1y = p1[1] + ((p2[1] - p0[1]) / 6) * k
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * k, c2y = p2[1] - ((p3[1] - p1[1]) / 6) * k
    d += `C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(p2[0])} ${num(p2[1])}`
  }
  return closed ? `${d}Z` : d
}

// A tapered limb: a round cap of radius ra at a and rb at b.
export function capsulePath(a: V2, b: V2, ra: number, rb: number): string {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 0.5) {
    const r = Math.max(ra, rb)
    return `M${num(a[0] - r)} ${num(a[1])}a${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0Z`
  }
  const nx = -dy / len, ny = dx / len
  const p = (c: V2, r: number, sign: number): string => `${num(c[0] + nx * r * sign)} ${num(c[1] + ny * r * sign)}`
  return `M${p(a, ra, 1)}L${p(b, rb, 1)}A${num(rb)} ${num(rb)} 0 0 0 ${p(b, rb, -1)}L${p(a, ra, -1)}A${num(ra)} ${num(ra)} 0 0 0 ${p(a, ra, 1)}Z`
}

// A small deterministic random sequence from a text (freckles, strands): the same mark is always drawn the same way.
export function seeded(text: string): () => number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}
