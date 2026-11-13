// Outlines for the seed model: the old portrait engine's shapes (a list of [x, y, mode, hix, hiy, hox, hoy]) as the app's points, with the many samples of a drawn curve fitted
// by a few points and handles (within a tolerance), and the test of whether one outline is the mirror image of another.
import type { ModelPoint, ModelPointMode } from '../../src/api/types'
import { build, flatten, hasIn, hasOut, reflectList } from '../../src/assets/Interfaces/admin/characters/engine/geometry'
import { fitCurve, type Bez, type V, norm } from './fit'

export type Exact = Array<[number, number, string, number?, number?, number?, number?]>

// The old drawing is 92 units from the top of the head to the chin in a 200-unit tile; the mannequin's head is 54 tall (the same proportions, a figure of seven and a half heads).
export const HS = 54 / 92
// Where the chin is: the realistic body (phase O4b) stands seven and a half heads tall on the same feet, so the head is higher than the mockup's (its chin was at 62).
export const CHIN_Y = 41
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const r2 = (v: number): number => Math.round(v * 100) / 100
const oldX = (x: number): number => 100 + (x - 100) * HS
const oldY = (y: number): number => CHIN_Y - (123 - y) * HS

export function exactPoint(a: Exact[number]): ModelPoint {
  const m = a[2] as ModelPointMode, p: ModelPoint = { x: r3(oldX(a[0])), y: r3(oldY(a[1])), m, hi: null, ho: null }
  const f = (v: number | undefined) => r3((v ?? 0) * HS)
  if (m === 'c') { p.hi = [f(a[3]), f(a[4])]; p.ho = [f(a[5]), f(a[6])] }
  else if (m === 'cs') p.hi = [f(a[3]), f(a[4])]
  else if (m === 'sc') p.ho = [f(a[3]), f(a[4])]
  return p
}
export const exactList = (n: Exact): ModelPoint[] => n.map(exactPoint)

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const dist = (a: V, b: V): number => Math.hypot(a[0] - b[0], a[1] - b[1])

// The dense polyline of the segments from point a up to point b (cyclic), sampled `steps` times per curve.
function sampleRun(list: ModelPoint[], a: number, b: number, steps = 6): V[] {
  const bp = build(list, true), n = list.length, out: V[] = []
  for (let i = a; i !== b; i = (i + 1) % n) {
    const p = bp[i], q = bp[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
    if (!o && !ii) { out.push([p.x, p.y]); continue }
    const c1: V = o ? [p.hox, p.hoy] : [p.x, p.y], c2: V = ii ? [q.hix, q.hiy] : [q.x, q.y]
    for (let s = 0; s < steps; s++) {
      const t = s / steps, u = 1 - t
      out.push([u * u * u * p.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q.x, u * u * u * p.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q.y])
    }
  }
  const e = bp[b]
  out.push([e.x, e.y])
  return out
}

function straightness(d: V[]): number {
  const a = d[0], b = d[d.length - 1], ab = sub(b, a), l = Math.hypot(ab[0], ab[1]) || 1
  let worst = 0
  for (const p of d) worst = Math.max(worst, Math.abs((p[0] - a[0]) * ab[1] - (p[1] - a[1]) * ab[0]) / l)
  return worst
}

interface Slot { x: number; y: number; hi: V | null; ho: V | null }
const nonzero = (h: V | null): V | null => (h && Math.hypot(h[0], h[1]) > 0.004 ? [r2(h[0]), r2(h[1])] : null)

const rounded = (list: ModelPoint[]): ModelPoint[] => list.map(p => ({ ...p, x: r2(p.x), y: r2(p.y), hi: p.hi ? [r2(p.hi[0]), r2(p.hi[1])] : null, ho: p.ho ? [r2(p.ho[0]), r2(p.ho[1])] : null }))

// A sharp point where the outline turns by less than `limit` degrees is a sample of a smooth curve (the old drawing made circles and ovals as polygons of 36 sharp points).
function smoothed(list: ModelPoint[], limit = 30): ModelPoint[] {
  const n = list.length
  return list.map((p, i) => {
    if (p.m !== 's') return p
    const a = list[(i + n - 1) % n], b = list[(i + 1) % n]
    const ux = p.x - a.x, uy = p.y - a.y, vx = b.x - p.x, vy = b.y - p.y
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
    if (lu < 1e-6 || lv < 1e-6) return p
    const turn = (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) * 180) / Math.PI
    return turn < limit && a.m !== 'c' && b.m !== 'c' ? { ...p, m: 'c' as const } : p
  })
}

// The outline with fewer points: a point whose mode is not 'c' (a corner, or one side of it) is kept where it is, and the curve between two kept points is fitted again. The
// original stays when the fit is not smaller or strays more than twice the tolerance.
export function refit(original: ModelPoint[], tol: number): ModelPoint[] {
  const fitted = refitSmooth(smoothed(original), tol)
  const gap = outlineGap(original, fitted)
  if (fitted.length >= 3 && fitted.length < original.length && gap <= tol * 2) return fitted
  const plain = smoothed(original)
  if (plain.length <= original.length && outlineGap(original, plain) <= tol * 2) return rounded(plain)
  return rounded(original)
}

function refitSmooth(list: ModelPoint[], tol: number): ModelPoint[] {
  const n = list.length
  if (n <= 4) return rounded(list)
  let anchors: number[] = []
  list.forEach((p, i) => { if (p.m !== 'c') anchors.push(i) })
  // a smooth closed outline is split into four runs (a circle needs at least three curves)
  if (anchors.length === 0) anchors = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)]
  else if (anchors.length === 1) anchors.push((anchors[0] + Math.floor(n / 2)) % n)
  anchors.sort((a, b) => a - b)
  const slots = new Map<number, Slot>()
  const slotAt = (x: number, y: number): Slot => ({ x, y, hi: null, ho: null })
  const keep: Slot[] = []
  const bp = build(list, true)
  anchors.forEach(a => { const s = slotAt(bp[a].x, bp[a].y); slots.set(a, s) })
  for (let k = 0; k < anchors.length; k++) {
    const a = anchors[k], b = anchors[(k + 1) % anchors.length], span = (b - a + n) % n || n
    const sa = slots.get(a)!, sb = slots.get(b)!
    const pa = list[a], pb = list[b]
    if (span === 1) {
      if (hasOut(pa.m) && pa.ho) sa.ho = [pa.ho[0], pa.ho[1]]
      if (hasIn(pb.m) && pb.hi) sb.hi = [pb.hi[0], pb.hi[1]]
      keep.push(sa)
      continue
    }
    const d = sampleRun(list, a, b)
    keep.push(sa)
    if (straightness(d) < 0.02) continue
    const t1 = hasOut(pa.m) && pa.ho ? norm([pa.ho[0], pa.ho[1]]) : undefined
    const t2 = hasIn(pb.m) && pb.hi ? norm([pb.hi[0], pb.hi[1]]) : undefined
    const beziers: Bez[] = fitCurve(d, tol, t1, t2)
    beziers.forEach((z, i) => {
      if (i === 0) sa.ho = sub(z.c1, z.p0)
      else { const mid = slotAt(z.p0[0], z.p0[1]); mid.hi = sub(beziers[i - 1].c2, beziers[i - 1].p3); mid.ho = sub(z.c1, z.p0); keep.push(mid) }
      if (i === beziers.length - 1) sb.hi = sub(z.c2, z.p3)
    })
  }
  return keep.map(s => {
    const hi = nonzero(s.hi), ho = nonzero(s.ho)
    const m: ModelPointMode = hi && ho ? 'c' : hi ? 'cs' : ho ? 'sc' : 's'
    return { x: r2(s.x), y: r2(s.y), m, hi, ho }
  })
}

// The polyline of an outline (closed), eight steps per curve.
export const polyOf = (list: ModelPoint[]): V[] => flatten(build(list, true), true) as V[]

function segDist(p: V, a: V, b: V): number {
  const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1]
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))
}
// The largest distance from a point of one closed polyline to the other, both ways.
export function hausdorff(a: V[], b: V[]): number {
  const one = (p: V[], q: V[]): number => { let w = 0; for (const x of p) { let m = 1e9; for (let i = 0; i < q.length; i++) m = Math.min(m, segDist(x, q[i], q[(i + 1) % q.length])); w = Math.max(w, m) } return w }
  return Math.max(one(a, b), one(b, a))
}
// How far two outlines are from being the same shape (0 = identical outlines).
export const outlineGap = (a: ModelPoint[], b: ModelPoint[]): number => hausdorff(polyOf(a), polyOf(b))
// How far `b` is from being the mirror image of `a` about the line x = axis.
export const mirrorGap = (a: ModelPoint[], b: ModelPoint[], axis = 100): number => outlineGap(reflectList(a, axis), b)
export const pointCount = (lists: ModelPoint[][]): number => lists.reduce((n, l) => n + l.length, 0)
export { dist }
