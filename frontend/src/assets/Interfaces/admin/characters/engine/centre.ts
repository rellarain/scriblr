import type { ModelPoint, ModelShape } from '../../../../../api/types'
import { apply, type Mat } from './geometry'
import { frameOf } from './transform'

// Every shape has a centre (shape editor C1): the middle of its box, which turns with the shape (its frame: `rot`), or, on a symmetric shape, the point its lines of
// symmetry cross. It is not stored: it is worked out from the outline, so it follows every edit. Another shape's point may be linked to it (a link of kind `center`,
// which can be a pivot), a shape may be anchored at it (a mark with `c`), and the turn handle and Ctrl + resize work about it. Everything here is pure.

type Centred = Pick<ModelShape, 'pts' | 'closed' | 'rot' | 'sym'>

// The centre of a shape in its own drawing space (null for a shape with no points). `pts` replaces the stored points (an outline as drawn, links applied).
export function centreOf(s: Centred, pts: ModelPoint[] = s.pts): [number, number] | null {
  if (s.sym) return [s.sym.cx, s.sym.cy]
  if (pts.length === 0) return null
  const f = pts.length >= 2 ? frameOf({ ...s, pts } as ModelShape) : null
  if (f && Number.isFinite(f.cx) && Number.isFinite(f.cy)) return [f.cx, f.cy]
  return [pts.reduce((a, p) => a + p.x, 0) / pts.length, pts.reduce((a, p) => a + p.y, 0) / pts.length]
}

// The centre carried by a matrix (a solved shape's: its own space to the canvas, or its group's alone).
export function centreThrough(s: Centred, m: Mat, pts: ModelPoint[] = s.pts): [number, number] | null {
  const c = centreOf(s, pts)
  return c ? apply(m, c[0], c[1]) : null
}

// The centre of a shape as it is drawn on the canvas: of the outline the rig drew (`local`, links applied), through its matrix.
export function drawnCentre(s: Centred, solved: { local: ModelPoint[]; matrix: Mat } | undefined): [number, number] | null {
  if (!solved) return null
  return centreThrough(s, solved.matrix, solved.local.length ? solved.local : s.pts)
}
