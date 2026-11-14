import type { ModelContent } from '../../../../../api/types'
import { segmentCrossing } from './crossings'
import { inPolygon } from './geometry'
import type { CastKind } from './kinds'
import type { Solved } from './rig'

// Lights and shadows may not overlap (shape types T1): an edit that would make a light and a shadow overlap is refused. Tested on the outlines as they are drawn.
type Poly = Array<[number, number]>

// Two outlines overlap when their edges cross properly (not where they only touch at a point or run along each other) or a point of one lies inside the other and away from its edge.
const TOUCH = 0.35
function nearEdge(poly: Poly, x: number, y: number): boolean {
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length]
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) < TOUCH) return true
  }
  return false
}
function properlyCross(a: Poly, b: Poly): boolean {
  for (let i = 0; i < a.length; i++) {
    const s: [[number, number], [number, number]] = [a[i], a[(i + 1) % a.length]]
    for (let j = 0; j < b.length; j++) {
      const t: [[number, number], [number, number]] = [b[j], b[(j + 1) % b.length]]
      const hit = segmentCrossing(s, t)
      if (!hit) continue
      // where they only meet at an end of one of the segments, they touch rather than cross
      const atEnd = [s[0], s[1], t[0], t[1]].some(([px, py]) => Math.hypot(px - hit[0], py - hit[1]) < 1e-3)
      if (!atEnd) return true
    }
  }
  return false
}
function inside(a: Poly, b: Poly): boolean {
  return a.some(([x, y]) => inPolygon(b, x, y) && !nearEdge(b, x, y))
}
export function outlinesOverlap(a: Poly, b: Poly): boolean {
  if (a.length < 3 || b.length < 3) return false
  return properlyCross(a, b) || inside(a, b) || inside(b, a)
}

// The pairs of a light and a shadow that overlap as the model is drawn, as [light, shadow] ids.
export function castOverlaps(c: ModelContent, solved: Solved): Array<[string, string]> {
  const drawn = (k: CastKind) => c.shapes.filter(s => s.kind === k && solved.shapes[s.id]?.visible && (solved.shapes[s.id]?.poly.length ?? 0) >= 3)
  const lights = drawn('light'), shadows = drawn('shadow')
  const out: Array<[string, string]> = []
  for (const l of lights) for (const s of shadows) if (outlinesOverlap(solved.shapes[l.id].poly, solved.shapes[s.id].poly)) out.push([l.id, s.id])
  return out
}
// Whether a model has both a light and a shadow (only then can they overlap).
export const hasBothCasts = (c: ModelContent): boolean => c.shapes.some(s => s.kind === 'light') && c.shapes.some(s => s.kind === 'shadow')
