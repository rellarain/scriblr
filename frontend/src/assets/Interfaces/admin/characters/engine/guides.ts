import type { ModelContent } from '../../../../../api/types'
import { boneById, boneEnds } from './bones'
import { apply, build } from './geometry'
import type { Solved } from './rig'

// The alignment guides of the canvas: while something is dragged, thin lines show where it lines up with another shape's point, its box (edges and middle), the mirror line or
// a frame's edge, and with Snap on it lands on them. Everything here is in the canvas's space and pure.

export interface GuideTargets { xs: number[]; ys: number[] }
export interface GuideHit {
  // The move that lands the dragged thing on the line it lines up with (0 when it lines up with none).
  dx: number
  dy: number
  // The lines to draw: the position of the vertical line and of the horizontal one (null: none within reach).
  x: number | null
  y: number | null
}

const unique = (list: number[]): number[] => {
  const seen = new Set<number>(), out: number[] = []
  for (const v of list) {
    const k = Math.round(v * 100)
    if (!Number.isFinite(v) || seen.has(k)) continue
    seen.add(k); out.push(v)
  }
  return out
}

// What the dragged thing can line up with: the points and the box edges and middles of every other drawn shape, the mirror line (the model's `axis`), and the sides of any
// frames given as boxes.
export function guideTargets(c: ModelContent, solved: Solved, except: string[], frames: Array<{ x: number; y: number; w: number; h: number }> = []): GuideTargets {
  const skip = new Set(except)
  const xs: number[] = [apply(solved.global, c.axis ?? 100, 0)[0]], ys: number[] = []
  for (const id of solved.order) {
    if (skip.has(id)) continue
    const r = solved.shapes[id], sh = c.shapes.find(s => s.id === id)
    if (!r || !sh || !r.visible || r.off) continue
    xs.push(r.box.x, r.box.x + r.box.w / 2, r.box.x + r.box.w)
    ys.push(r.box.y, r.box.y + r.box.h / 2, r.box.y + r.box.h)
    for (const p of build(r.local, sh.closed, r.matrix)) { xs.push(p.x); ys.push(p.y) }
  }
  for (const f of frames) { xs.push(f.x, f.x + f.w); ys.push(f.y, f.y + f.h) }
  return { xs: unique(xs), ys: unique(ys) }
}

const nearest = (values: number[], targets: number[], reach: number): { delta: number; at: number } | null => {
  let best: { delta: number; at: number } | null = null
  for (const v of values) {
    for (const t of targets) {
      const d = t - v
      if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t }
    }
  }
  return best
}

// Where the dragged thing's own lines (a point: its x and its y; a shape: its left, middle and right, its top, middle and bottom) come within `reach` of a target line.
export function alignTo(own: { xs: number[]; ys: number[] }, targets: GuideTargets, reach: number): GuideHit {
  const hx = nearest(own.xs, targets.xs, reach), hy = nearest(own.ys, targets.ys, reach)
  return { dx: hx?.delta ?? 0, dy: hy?.delta ?? 0, x: hx?.at ?? null, y: hy?.at ?? null }
}

// ---- head units (phase O3) ----

// Where a figure 7.5 heads tall has its landmarks, in heads from the crown (the artist's canon the guide is checked against).
export const HEAD_MARKS: ReadonlyArray<{ at: number; name: string }> = [
  { at: 1, name: 'Chin' }, { at: 2, name: 'Nipples' }, { at: 3, name: 'Navel' }, { at: 3.75, name: 'Crotch' }, { at: 5.5, name: 'Knees' }, { at: 7.5, name: 'Soles' },
]
// The most lines the guide draws (a head bone far too short for its figure would otherwise ask for hundreds).
export const HEAD_LINES_MAX = 24

export interface HeadGuide {
  // one head (the head bone's length as drawn) and the crown (the higher end of the head bone), in the canvas's space
  unit: number
  top: number
  // how far the lines run across: the figure's width and half a head each side
  x0: number
  x1: number
  // a line every head from the crown (n = 0) to past the lowest drawn point
  lines: Array<{ n: number; y: number }>
  // the canon's landmarks
  marks: Array<{ at: number; name: string; y: number }>
  // the lowest drawn point, and how many heads it lies below the crown (to the hundredth)
  bottom: number
  heads: number
}

// The head-units guide: lines one head apart from the crown down, read from the head bone as the rig has put it (so it follows the sliders: an Age preset moves it). Null with no
// head bone, or one that cannot be found or has no length.
export function headGuide(c: ModelContent, solved: Solved): HeadGuide | null {
  const bone = c.headBone ? boneById(c, c.headBone) : undefined
  const ends = bone ? boneEnds(solved, bone) : null
  if (!ends) return null
  const a = apply(solved.global, ends.a[0], ends.a[1]), b = apply(solved.global, ends.b[0], ends.b[1])
  const unit = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (!Number.isFinite(unit) || unit < 1e-3) return null
  const top = Math.min(a[1], b[1])
  let x0 = Infinity, x1 = -Infinity, bottom = -Infinity
  for (const id of solved.order) {
    const r = solved.shapes[id]
    if (!r || !r.visible || r.off || (r.box.w <= 0 && r.box.h <= 0)) continue
    x0 = Math.min(x0, r.box.x); x1 = Math.max(x1, r.box.x + r.box.w); bottom = Math.max(bottom, r.box.y + r.box.h)
  }
  if (!Number.isFinite(x0)) { x0 = Math.min(a[0], b[0]) - unit; x1 = Math.max(a[0], b[0]) + unit }
  if (!(bottom > top)) bottom = top + 7.5 * unit
  const heads = (bottom - top) / unit
  const count = Math.min(HEAD_LINES_MAX, Math.ceil(heads - 1e-6))
  const lines = Array.from({ length: count + 1 }, (_, n) => ({ n, y: top + n * unit }))
  const marks = HEAD_MARKS.map(m => ({ ...m, y: top + m.at * unit }))
  return { unit, top, x0: x0 - unit / 2, x1: x1 + unit / 2, lines, marks, bottom, heads: Math.round(heads * 100) / 100 }
}
