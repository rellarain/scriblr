import type { ModelBind, ModelPoint, ModelShape, ModelSlide } from '../../../../../api/types'
import { bezierAt, type BuiltPoint } from './geometry'

// Sliders (shape types T5). A point locked onto a segment of another shape (an edge link) can be made a slider: it moves along the other shape's outline between two
// stops. A place along an outline is its edge and how far along it (e + t, 0 up to the number of edges), so the stops may lie on different segments: on a pivot circle a
// slider runs along an arc of the ring. Dragged while the shape is edited, the point's drawn place moves (e and t); dragged in Pose mode, its posed place (`at`) moves and
// Reset pose takes it away. Either is held between the stops.

export const SLIDE_MAX = 60
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const fin = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(SLIDE_MAX, Math.max(0, v)) : fallback)

// As the server keeps it: stops in order, a posed place between them (or none); only on an edge link.
export function repairSlide(v: unknown, kind: string): ModelSlide | null {
  if (kind !== 'edge' || !v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  let lo = r3(fin(s.lo, 0)), hi = r3(fin(s.hi, 1))
  if (lo > hi) [lo, hi] = [hi, lo]
  const at = typeof s.at === 'number' && Number.isFinite(s.at) ? r3(Math.min(hi, Math.max(lo, s.at))) : null
  return { lo, hi, at }
}

export const isSlider = (p: Pick<ModelPoint, 'bind'> | undefined): boolean => !!p?.bind && p.bind.kind === 'edge' && !!p.bind.slide
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

// Where a slider is now along the outline: its posed place, else where it is drawn, held between its stops.
export function heldPlace(b: ModelBind): number {
  const drawn = b.e + b.t
  return b.slide ? clamp(b.slide.at ?? drawn, b.slide.lo, b.slide.hi) : drawn
}
// A place along an outline of n edges as an edge and how far along it.
export function edgeOf(u: number, n: number): [number, number] {
  if (n < 1) return [0, 0]
  const v = clamp(u, 0, n), e = Math.min(Math.floor(v), n - 1)
  return [e, clamp(v - e, 0, 1)]
}
// For the solver: the edge and place along it where an edge link sits.
export const slidPlace = (b: ModelBind, n: number): [number, number] => (b.slide ? edgeOf(heldPlace(b), n) : [n > 0 ? b.e % n : 0, b.t])

// The place between lo and hi along an outline (canvas space) nearest (x, y).
export function nearestPlace(a: BuiltPoint[], lo: number, hi: number, x: number, y: number): number {
  const n = a.length
  if (n < 2) return lo
  const at = (u: number) => { const [e, t] = edgeOf(u, n), q = bezierAt(a, e, t); return Math.hypot(q.x - x, q.y - y) }
  let best = lo, bd = Infinity
  const steps = Math.max(8, Math.ceil((hi - lo) * 40))
  for (let k = 0; k <= steps; k++) { const u = lo + ((hi - lo) * k) / steps, d = at(u); if (d < bd) { bd = d; best = u } }
  const span = (hi - lo) / steps
  for (let k = -10; k <= 10; k++) { const u = clamp(best + (span * k) / 10, lo, hi), d = at(u); if (d < bd) { bd = d; best = u } }
  return r3(best)
}
// Where on the outline (canvas space) a place is.
export function placeAt(a: BuiltPoint[], u: number): [number, number] {
  const [e, t] = edgeOf(u, a.length), q = bezierAt(a, e, t)
  return [q.x, q.y]
}

type Made = { ok: true; shape: ModelShape } | { ok: false; reason: string }
const withBind = (s: ModelShape, i: number, f: (b: ModelBind) => ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i && p.bind ? { ...p, bind: f(p.bind) } : p)) })

// Point i made a slider (its stops at the two ends of the segment it is on), or made a plain edge link again (where it is drawn).
export function makeSlider(s: ModelShape, i: number): Made {
  const b = s.pts[i]?.bind
  if (!b || b.kind !== 'edge') return { ok: false, reason: 'Only a point locked onto a segment of another shape slides: drop it on a segment first.' }
  return { ok: true, shape: withBind(s, i, x => ({ ...x, slide: { lo: x.e, hi: x.e + 1, at: null } })) }
}
export const stopSlider = (s: ModelShape, i: number): ModelShape => withBind(s, i, x => ({ ...x, slide: null }))

// A stop moved to place u (of an outline of n edges): the stops stay in order, and the drawn and posed places stay between them.
export function setStop(s: ModelShape, i: number, which: 'lo' | 'hi', u: number, n: number): ModelShape {
  return withBind(s, i, b => {
    if (!b.slide) return b
    const v = r3(clamp(u, 0, n))
    const lo = which === 'lo' ? Math.min(v, b.slide.hi) : b.slide.lo, hi = which === 'hi' ? Math.max(v, b.slide.lo) : b.slide.hi
    const [e, t] = edgeOf(clamp(b.e + b.t, lo, hi), n)
    return { ...b, e, t: r3(t), slide: { lo, hi, at: b.slide.at === null ? null : r3(clamp(b.slide.at, lo, hi)) } }
  })
}
// The posed place of a slider.
export const slideAt = (s: ModelShape, i: number, u: number | null): ModelShape => withBind(s, i, b => (b.slide ? { ...b, slide: { ...b.slide, at: u === null ? null : r3(clamp(u, b.slide.lo, b.slide.hi)) } } : b))
