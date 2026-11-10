import type { ModelContent } from '../../../../../api/types'
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
