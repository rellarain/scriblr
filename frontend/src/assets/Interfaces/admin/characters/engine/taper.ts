import type { ModelPoint } from '../../../../../api/types'
import { r2 } from './geometry'

// The taper tool (phase O3): a ribbon along a spine, as the old portrait drew its brows, lashes, folds, collarbones and neck cords (its `band()`, portrait/paths.ts). The width
// runs from the start through the middle to the end, centred on the spine or pushed to one side, and the ends may come to a point. The result is an ordinary closed outline, so it
// costs nothing more than any other shape. Pure, so it is tested in node.

export type SpinePoint = [number, number]
export const TAPER_MAX_SPINE = 12
// the widest a ribbon may be anywhere (model units: a quarter of the model's width)
export const TAPER_MAX_WIDTH = 50

// The spine as at most `most` points, evenly spaced along its length (the first and last kept; a spine of one point, or none, stays as it is).
export function resample(spine: SpinePoint[], most = TAPER_MAX_SPINE): SpinePoint[] {
  const pts = spine.filter((p, i) => i === 0 || Math.hypot(p[0] - spine[i - 1][0], p[1] - spine[i - 1][1]) > 1e-6)
  if (pts.length <= 2) return pts.map(p => [p[0], p[1]])
  const lens = [0]
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = lens[lens.length - 1], n = Math.min(most, pts.length)
  if (n === pts.length) return pts.map(p => [p[0], p[1]])
  const out: SpinePoint[] = []
  for (let k = 0; k < n; k++) {
    const at = (total * k) / (n - 1)
    let i = 1
    while (i < lens.length - 1 && lens[i] < at) i++
    const span = lens[i] - lens[i - 1] || 1, t = (at - lens[i - 1]) / span
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t])
  }
  return out
}

export interface TaperSpec {
  // the full width at the start, the middle and the end of the spine (model units, 0 or more)
  w0: number
  wm: number
  w1: number
  // where the width lies: 0 centred on the spine, 1 all of it to the left of the way the spine runs, -1 all to the right
  side: number
  // the two ends come to a single sharp point each
  pointed: boolean
}
export const TAPER_DEFAULT: TaperSpec = { w0: 1, wm: 4, w1: 1, side: 0, pointed: true }

// The width at t (0..1 along the spine): from the start to the middle, then from the middle to the end.
const width = (w: number): number => (Number.isFinite(w) ? Math.max(0, Math.min(TAPER_MAX_WIDTH, w)) : 0)
const widthAt = (s: TaperSpec, t: number): number => {
  const w0 = width(s.w0), wm = width(s.wm), w1 = width(s.w1)
  return t < 0.5 ? w0 + (wm - w0) * t * 2 : wm + (w1 - wm) * (t - 0.5) * 2
}

// The closed outline of the ribbon: up one side of the spine and back down the other (curve points, so the sides are smooth; the ends are sharp points when `pointed`). Null
// for a spine of fewer than two points.
export function taperOutline(spine: SpinePoint[], spec: TaperSpec = TAPER_DEFAULT): ModelPoint[] | null {
  const c = resample(spine)
  if (c.length < 2) return null
  // a straight spine of two points gets its middle, so the ribbon has sides to swell
  if (c.length === 2) c.splice(1, 0, [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2])
  const n = c.length
  const side = Math.max(-1, Math.min(1, Number.isFinite(spec.side) ? spec.side : 0))
  const top: SpinePoint[] = [], bot: SpinePoint[] = []
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len, half = widthAt(spec, i / (n - 1)) / 2
    const o1 = half * (1 + side), o2 = half * (1 - side)
    top.push([c[i][0] + nx * o1, c[i][1] + ny * o1])
    bot.push([c[i][0] - nx * o2, c[i][1] - ny * o2])
  }
  const point = (p: SpinePoint, m: ModelPoint['m'] = 'c'): ModelPoint => ({ x: r2(p[0]), y: r2(p[1]), m, hi: null, ho: null })
  if (spec.pointed) {
    // the ends are the spine's own ends, sharp; the sides run between them
    return [point(c[0], 's'), ...top.slice(1, -1).map(p => point(p)), point(c[n - 1], 's'), ...bot.slice(1, -1).reverse().map(p => point(p))]
  }
  return [...top.map(p => point(p)), ...bot.reverse().map(p => point(p))]
}
