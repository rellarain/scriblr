import type { ModelContent, ModelMirrorLine, ModelPoint, ModelShape } from '../../../../../api/types'
import { SWAP, apply, type Mat } from './geometry'
import { reflectAbout } from './symmetry'
import { rotOf } from './transform'

// Mirrors (Z3), the geometry: the line a twin is reflected across, in the model's space, and an outline carried across it. A twin of a model with zones, or one with a
// line of its own, is drawn this way: its outline is its original's as drawn (so it follows a pose), reflected across the line, brought into the twin's own space. Twins of
// older models keep the old reflection about the model's axis in the group's own space. Pure.

// Is a twin drawn across a line in the model's space (rather than the old way)?
export const usesMirrorLine = (c: ModelContent, twin: Pick<ModelShape, 'mirrorLine'>): boolean => (c.zones ?? []).length > 0 || !!twin.mirrorLine

// The angle (degrees, in the model's space) and a point of a symmetric shape's axis k, given the matrix that takes the shape's own space to the model's (an axis past the
// last is read as the first). Null when the shape is not symmetric or the matrix squashes the axis.
export function axisOf(s: ModelShape, k: number, frame: Mat): { x: number; y: number; angle: number } | null {
  if (!s.sym) return null
  const n = s.sym.n, at = k >= 0 && k < n ? k : 0
  const a = ((rotOf(s) + s.sym.a + (at * 180) / n) * Math.PI) / 180
  const dx = frame[0] * Math.cos(a) + frame[2] * Math.sin(a), dy = frame[1] * Math.cos(a) + frame[3] * Math.sin(a)
  if (Math.hypot(dx, dy) < 1e-9) return null
  const [x, y] = apply(frame, s.sym.cx, s.sym.cy)
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
}

// The reflection across a twin's line, in the model's space: axis k of the symmetric shape it names, where that shape is drawn now (`frameOf` gives a shape's matrix
// from its own space to the model's); the model's centre line when it names none, or a shape that is not there, not symmetric, or one of `skip`.
export function mirrorLineMat(c: ModelContent, line: ModelMirrorLine | null | undefined, frameOf: (shapeId: string) => Mat | undefined, skip: readonly string[] = []): Mat {
  const s = line && !skip.includes(line.shape) ? c.shapes.find(x => x.id === line.shape) : undefined
  const f = s?.sym ? frameOf(s.id) : undefined
  const ax = s && f ? axisOf(s, line!.k, f) : null
  return ax ? reflectAbout(ax.x, ax.y, ax.angle) : reflectAbout(c.axis ?? 100, 0, 90)
}

// An outline carried by a matrix that turns it over (one with a reflection in it): each point with its handles, the run reversed so it still goes the same way round (each
// point's handles and curve modes swap ends). Only the drawing of a point is kept: no link, no weight.
export function mirrorPoints(pts: readonly ModelPoint[], m: Mat): ModelPoint[] {
  const lin = (v: [number, number] | null | undefined): [number, number] | null => (v ? [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]] : null)
  const out: ModelPoint[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i], [x, y] = apply(m, p.x, p.y)
    out.push({ x, y, m: SWAP[p.m], hi: lin(p.ho), ho: lin(p.hi) })
  }
  return out
}

// The turn of a frame seen across a reflection, kept the right way up: a reflection across a line at angle φ takes the frame's upward side (θ + 90) to 2φ - θ - 90, and
// the frame turned that way up has the turn 2φ - θ - 180 (degrees, -180..180). An upright frame mirrored across an upright line stays upright.
export function mirroredTurn(m: Mat, turn: number): number {
  const twoPhi = (Math.atan2(m[1], m[0]) * 180) / Math.PI
  const t = (((twoPhi - turn - 180) % 360) + 540) % 360 - 180
  return Math.round(t * 100) / 100
}
