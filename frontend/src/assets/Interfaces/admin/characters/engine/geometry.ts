import type { ModelPoint, ModelPointMode } from '../../../../../api/types'

// The geometry of the character designer, ported 1:1 from the mockup's engine (docs/mannequin-mockup/designer-engine.js). Pure functions, no DOM, so they
// are tested in node. A shape is a closed list of points in the four modes; this module turns it into curves, finds what a click hits, and mirrors it.

export type Mat = [number, number, number, number, number, number]
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

// The handle length as a share of the chord: four curve points make a true circle.
export const K = 0.3905

export const r2 = (v: number): number => Math.round(v * 100) / 100
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))

export function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}
export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y]
export function rotate(deg: number, px: number, py: number): Mat {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py]
}
export const scale = (sx: number, sy: number, px: number, py: number): Mat => [sx, 0, 0, sy, px - sx * px, py - sy * py]
// A stretch by `f` along the unit direction (ux, uy) about the point (px, py): lengths along the direction change, lengths across it do not.
export function scaleAlong(f: number, ux: number, uy: number, px: number, py: number): Mat {
  const k = f - 1, a = 1 + k * ux * ux, b = k * ux * uy, d = 1 + k * uy * uy
  return [a, b, b, d, px - (a * px + b * py), py - (b * px + d * py)]
}
// The turn in a matrix (degrees): the angle of the rotation nearest to its linear part, so a scale or a shear on top of a turn is not counted.
export const turnOf = (m: Mat): number => (Math.atan2(m[1] - m[2], m[0] + m[3]) * 180) / Math.PI
// The matrix that undoes `m` (a flat or singular matrix has no undo: the determinant is held away from zero, so the result is finite).
export function inverse(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}

// ---- points ----

export const SWAP: Record<ModelPointMode, ModelPointMode> = { c: 'c', s: 's', cs: 'sc', sc: 'cs' }
// Does a point have a curve coming in / going out? (c = both, cs = in only, sc = out only, s = neither)
export const hasIn = (m: ModelPointMode): boolean => m === 'c' || m === 'cs'
export const hasOut = (m: ModelPointMode): boolean => m === 'c' || m === 'sc'
export const MODE_NAMES: Record<ModelPointMode, string> = { c: 'Curve', s: 'Sharp', cs: 'Curve, then sharp', sc: 'Sharp, then curve' }
export const MODES: ModelPointMode[] = ['c', 's', 'cs', 'sc']

export function makePoint(x: number, y: number, m: ModelPointMode = 'c'): ModelPoint {
  return { x, y, m, hi: null, ho: null }
}

export function reflectPoint(p: ModelPoint, axis: number): ModelPoint {
  const q: ModelPoint = {
    x: 2 * axis - p.x, y: p.y, m: SWAP[p.m],
    hi: p.ho ? [-p.ho[0], p.ho[1]] : null, ho: p.hi ? [-p.hi[0], p.hi[1]] : null,
  }
  if (p.w != null) q.w = p.w
  return q
}
// The mirror image of a closed outline: the order is reversed so it still runs the same way round.
export function reflectList(list: ModelPoint[], axis: number): ModelPoint[] {
  const out: ModelPoint[] = []
  for (let i = list.length - 1; i >= 0; i--) out.push(reflectPoint(list[i], axis))
  return out
}
// A symmetric outline from its half: the half runs from the top of the axis to the bottom of it; the other half is its mirror.
export function symmetric(half: ModelPoint[], axis = 100): ModelPoint[] {
  const back: ModelPoint[] = []
  for (let i = half.length - 2; i >= 1; i--) back.push(reflectPoint(half[i], axis))
  return half.concat(back)
}
// The point that mirrors point i about the axis (within `tol` units), or i itself when there is none.
export function twinIndex(list: ModelPoint[], i: number, axis = 100, tol = 6): number {
  const p = list[i], tx = 2 * axis - p.x
  let best = i, bd = 1e9
  for (let j = 0; j < list.length; j++) {
    const d = Math.hypot(list[j].x - tx, list[j].y - p.y)
    if (d < bd) { bd = d; best = j }
  }
  return bd < tol ? best : i
}

// The handles of every point: the point's own, or an automatic one along the line between its neighbours.
export interface Handles { hi: [number, number]; ho: [number, number] }
export function autoHandles(list: ModelPoint[], closed: boolean): Handles[] {
  const n = list.length, out: Handles[] = []
  for (let i = 0; i < n; i++) {
    const p = list[i], pr = list[closed ? (i + n - 1) % n : Math.max(i - 1, 0)], nx = list[closed ? (i + 1) % n : Math.min(i + 1, n - 1)]
    let tx = nx.x - pr.x, ty = nx.y - pr.y
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl; ty /= tl
    const dn = Math.hypot(nx.x - p.x, nx.y - p.y), dp = Math.hypot(p.x - pr.x, p.y - pr.y)
    out.push({ ho: p.ho ?? [tx * dn * K, ty * dn * K], hi: p.hi ?? [-tx * dp * K, -ty * dp * K] })
  }
  return out
}

// The absolute control points of a point list under a matrix.
export interface BuiltPoint { x: number; y: number; m: ModelPointMode; hix: number; hiy: number; hox: number; hoy: number }
export function build(list: ModelPoint[], closed: boolean, mat: Mat = IDENTITY): BuiltPoint[] {
  const h = autoHandles(list, closed), out: BuiltPoint[] = []
  for (let i = 0; i < list.length; i++) {
    const p = list[i], a = apply(mat, p.x, p.y), hi = apply(mat, p.x + h[i].hi[0], p.y + h[i].hi[1]), ho = apply(mat, p.x + h[i].ho[0], p.y + h[i].ho[1])
    out.push({ x: a[0], y: a[1], m: p.m, hix: hi[0], hiy: hi[1], hox: ho[0], hoy: ho[1] })
  }
  return out
}

// SVG path text: a straight line where neither end has a curve, a cubic otherwise.
export function pathText(a: BuiltPoint[], closed: boolean): string {
  if (!a.length) return ''
  const n = a.length, last = closed ? n : n - 1
  let s = `M${r2(a[0].x)} ${r2(a[0].y)}`
  for (let i = 0; i < last; i++) {
    const p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
    if (!o && !ii) s += `L${r2(q.x)} ${r2(q.y)}`
    else s += `C${r2(o ? p.hox : p.x)} ${r2(o ? p.hoy : p.y)} ${r2(ii ? q.hix : q.x)} ${r2(ii ? q.hiy : q.y)} ${r2(q.x)} ${r2(q.y)}`
  }
  return s + (closed ? 'Z' : '')
}

// The outline as a polyline (eight steps per curve), for hit tests and boxes.
export function flatten(a: BuiltPoint[], closed: boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [], n = a.length, last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
    if (!o && !ii) { out.push([p.x, p.y]); continue }
    const c1: [number, number] = o ? [p.hox, p.hoy] : [p.x, p.y], c2: [number, number] = ii ? [q.hix, q.hiy] : [q.x, q.y]
    for (let s = 0; s < 8; s++) {
      const t = s / 8, u = 1 - t
      out.push([
        u * u * u * p.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q.x,
        u * u * u * p.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q.y,
      ])
    }
  }
  if (!closed && n) out.push([a[n - 1].x, a[n - 1].y])
  return out
}

export function inPolygon(poly: Array<[number, number]>, x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c
  }
  return c
}

export interface Box { x: number; y: number; w: number; h: number }
export function boxOf(poly: Array<[number, number]>): Box {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) }
  return poly.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 0, h: 0 }
}

// A transformed copy of a point list (handles turn and scale with it).
export function transformList(list: ModelPoint[], m: Mat): ModelPoint[] {
  return list.map(p => {
    const a = apply(m, p.x, p.y)
    const q: ModelPoint = { ...p, x: a[0], y: a[1] }
    if (p.hi) q.hi = [m[0] * p.hi[0] + m[2] * p.hi[1], m[1] * p.hi[0] + m[3] * p.hi[1]]
    if (p.ho) q.ho = [m[0] * p.ho[0] + m[2] * p.ho[1], m[1] * p.ho[0] + m[3] * p.ho[1]]
    return q
  })
}

// ---- edges: where on an outline is the nearest edge to a place ----

export interface EdgePoint { x: number; y: number; tx: number; ty: number }
// The point at t (0..1) of the edge from point e to the next, with the unit direction of the edge there.
export function bezierAt(a: BuiltPoint[], e: number, t: number): EdgePoint {
  const n = a.length, p = a[e % n], q = a[(e + 1) % n], o = hasOut(p.m), ii = hasIn(q.m), u = 1 - t
  let x: number, y: number, dx: number, dy: number
  if (!o && !ii) { x = p.x + (q.x - p.x) * t; y = p.y + (q.y - p.y) * t; dx = q.x - p.x; dy = q.y - p.y }
  else {
    const c1: [number, number] = o ? [p.hox, p.hoy] : [p.x, p.y], c2: [number, number] = ii ? [q.hix, q.hiy] : [q.x, q.y]
    x = u * u * u * p.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q.x
    y = u * u * u * p.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q.y
    dx = 3 * u * u * (c1[0] - p.x) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (q.x - c2[0])
    dy = 3 * u * u * (c1[1] - p.y) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (q.y - c2[1])
    if (!dx && !dy) { dx = q.x - p.x; dy = q.y - p.y }
  }
  const l = Math.hypot(dx, dy) || 1
  return { x, y, tx: dx / l, ty: dy / l }
}
// Which way is outward: +1 when the outline runs clockwise on the screen.
export function windSign(a: BuiltPoint[]): 1 | -1 {
  let s = 0
  const n = a.length
  for (let i = 0; i < n; i++) { const p = a[i], q = a[(i + 1) % n]; s += p.x * q.y - q.x * p.y }
  return s >= 0 ? 1 : -1
}
// The place at t along the edge from point e, o units outward (negative: inward), with the outward normal: [x, y, nx, ny].
export function edgeAt(a: BuiltPoint[], sign: 1 | -1, e: number, t: number, o = 0): [number, number, number, number] {
  const b = bezierAt(a, e, t), nx = b.ty * sign, ny = -b.tx * sign
  return [b.x + nx * o, b.y + ny * o, nx, ny]
}
export interface NearestEdge { e: number; t: number; dist: number; x: number; y: number; nx: number; ny: number; o: number }
// The nearest place on the edge of an outline: the edge (from point e), t along it, the distance, the place, and the outward normal.
export function nearestEdge(list: ModelPoint[], x: number, y: number): NearestEdge | null {
  const a = build(list, true), sign = windSign(a), n = a.length
  let best: NearestEdge | null = null
  for (let e = 0; e < n; e++) {
    for (let k = 0; k <= 20; k++) {
      const t = k / 20, b = bezierAt(a, e, t), d = Math.hypot(b.x - x, b.y - y)
      if (!best || d < best.dist) best = { e, t, dist: d, x: b.x, y: b.y, nx: b.ty * sign, ny: -b.tx * sign, o: 0 }
    }
  }
  if (!best) return null
  let lo = Math.max(0, best.t - 0.05), hi = Math.min(1, best.t + 0.05)
  for (let it = 0; it < 8; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3, b1 = bezierAt(a, best.e, m1), b2 = bezierAt(a, best.e, m2)
    if (Math.hypot(b1.x - x, b1.y - y) < Math.hypot(b2.x - x, b2.y - y)) hi = m2
    else lo = m1
  }
  const tt = (lo + hi) / 2, bb = bezierAt(a, best.e, tt)
  return { e: best.e, t: r2(tt), x: bb.x, y: bb.y, nx: bb.ty * sign, ny: -bb.tx * sign, dist: Math.hypot(bb.x - x, bb.y - y), o: (x - bb.x) * (bb.ty * sign) + (y - bb.y) * (-bb.tx * sign) }
}
