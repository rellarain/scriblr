import type { ModelCloneAt, ModelPoint } from '../../../../../api/types'
import { IDENTITY, apply, boxOf, build, flatten, mul, rotate, scale, translate, type Mat } from './geometry'
import { mirrorPoints } from './mirrorLine'

// Clones (Z4), the geometry: a clone is its original's outline (as resolved in the original's own space: links and drives, not its pose) carried by its own place: flipped
// across the original's middle when it says so, turned about it, and taken to (x, y). Pure.

// The middle of an outline (of its box).
export function middleOf(pts: readonly ModelPoint[], closed: boolean): [number, number] {
  if (pts.length === 0) return [0, 0]
  const b = boxOf(flatten(build([...pts], closed), closed))
  return [b.x + b.w / 2, b.y + b.h / 2]
}
// The middle of several outlines together (an object's).
export function middleOfAll(outlines: ReadonlyArray<{ pts: readonly ModelPoint[]; closed: boolean }>): [number, number] {
  const poly = outlines.filter(o => o.pts.length > 0).flatMap(o => flatten(build([...o.pts], o.closed), o.closed))
  if (poly.length === 0) return [0, 0]
  const b = boxOf(poly)
  return [b.x + b.w / 2, b.y + b.h / 2]
}

// The matrix that takes the original's own space to the clone's, the original's middle being (cx, cy).
export function cloneMat(at: ModelCloneAt, cx: number, cy: number): Mat {
  const flip = at.flip ? scale(-1, 1, cx, cy) : IDENTITY
  return mul(translate(at.x - cx, at.y - cy), mul(rotate(at.turn, cx, cy), flip))
}

// The place a clone matrix gives (the original's middle being (cx, cy)): where the middle goes, the turn and whether it is flipped.
export function cloneAtOf(m: Mat, cx: number, cy: number): ModelCloneAt {
  const [x, y] = apply(m, cx, cy)
  const flip = m[0] * m[3] - m[1] * m[2] < 0
  const turn = (Math.atan2(flip ? -m[1] : m[1], flip ? -m[0] : m[0]) * 180) / Math.PI
  const r2 = (v: number) => Math.round(v * 100) / 100
  return { x: r2(x), y: r2(y), turn: r2(turn > 180 ? turn - 360 : turn <= -180 ? turn + 360 : turn), flip }
}

// An outline carried by a matrix: turned over (a flip) it runs the other way round, so that it still goes the same way round.
export function carryPoints(pts: readonly ModelPoint[], m: Mat): ModelPoint[] {
  if (m[0] * m[3] - m[1] * m[2] < 0) return mirrorPoints(pts, m)
  const lin = (v: [number, number] | null | undefined): [number, number] | null => (v ? [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]] : null)
  return pts.map(p => { const [x, y] = apply(m, p.x, p.y); return { x, y, m: p.m, hi: lin(p.hi), ho: lin(p.ho) } })
}

// The turn of a clone's frame: the original's turn, the other way round when flipped, and the clone's own turn on top.
export const cloneTurn = (at: ModelCloneAt, originalTurn: number): number => {
  const t = (((at.flip ? -originalTurn : originalTurn) + at.turn) % 360 + 540) % 360 - 180
  return Math.round(t * 100) / 100
}
