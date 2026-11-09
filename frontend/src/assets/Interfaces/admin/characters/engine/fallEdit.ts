import type { ModelContent, ModelFallSide, ModelPoint, ModelPreset } from '../../../../../api/types'
import { objectById, shapeById } from '../modelContent'
import { FALL_SIDES } from '../modelContent'
import { fallRuns, hangs, weightOf } from './fall'
import { done, fail, type Edit } from './rigEdit'
import { LIMITS } from './limits'

// Fall (phase 5b), the editing side: the weight of a point, the Fall drive that lets a shape hang with a slider, and the side things fall to. A weight is kept on
// the point (`w`, a quarter at a time); none is no weight at all.

export const SIDE_NAMES: Record<ModelFallSide, string> = { down: 'Down', left: 'Left', right: 'Right', behind: 'Behind' }
export { FALL_SIDES }

// A point with this weight (none takes the weight away).
export function withWeight(p: ModelPoint, w: number): ModelPoint {
  const { w: _old, ...rest } = p
  void _old
  return w > 0 ? { ...rest, w: Math.min(1, w) } : rest
}

// The shapes of a model that have a run of weighted points: the ones that can hang.
export const hangingShapes = (c: ModelContent): string[] => c.shapes.filter(s => !s.mirrorOf && hangs(s.pts, s.closed)).map(s => s.id)

// Does the shape have any weighted point at all (marked, whether or not it can hang yet).
export const hasWeights = (pts: ModelPoint[]): boolean => pts.some(p => weightOf(p) > 0)

// Let a shape hang with a slider: the drive starts at none at rest and all of the way at the slider's largest value (the steppers change that).
export function addFall(c: ModelContent, rangeId: string, shapeId: string): Edit {
  const r = c.ranges.find(x => x.id === rangeId), s = shapeById(c, shapeId)
  if (!r) return fail('There is no such slider.')
  if (!s) return fail('There is no such shape.')
  if (s.mirrorOf) return fail('A twin follows its original: let the original fall, or break the pair.')
  if (s.pts.length < 3) return fail('Draw the outline first: a fall moves the points of the shape.')
  if (r.drives.some(d => d.kind === 'fall' && d.shape === shapeId)) return fail('That slider already lets this shape fall.')
  if (r.drives.length >= LIMITS.drivesMax) return fail(`A slider may drive at most ${LIMITS.drivesMax} things.`)
  const drive = { kind: 'fall' as const, group: null, target: null, id: null, axis: 'xy' as const, shape: shapeId, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 100, mirror: true }
  return done({ ...c, ranges: c.ranges.map(x => (x.id === rangeId ? { ...x, drives: [...x.drives, drive] } : x)) })
}

// Let every shape of an object that has weighted points fall with the slider (a scarf, a cape: one button instead of one shape at a time). The shapes that already
// fall with it are left as they are.
export function addFallToObject(c: ModelContent, rangeId: string, objectId: string): Edit & { added?: number } {
  const o = objectById(c, objectId), r = c.ranges.find(x => x.id === rangeId)
  if (!o) return fail('There is no such object.')
  if (!r) return fail('There is no such slider.')
  const ids = o.shapes.filter(sid => { const s = shapeById(c, sid); return !!s && !s.mirrorOf && hangs(s.pts, s.closed) && !r.drives.some(d => d.kind === 'fall' && d.shape === sid) })
  if (ids.length === 0) return fail(o.shapes.some(sid => { const s = shapeById(c, sid); return !!s && !s.mirrorOf && hangs(s.pts, s.closed) }) ? 'Every weighted shape of this object falls with that slider already.' : 'No shape of this object has weighted points yet: mark them with the Weights tool first.')
  if (r.drives.length + ids.length > LIMITS.drivesMax) return fail(`A slider may drive at most ${LIMITS.drivesMax} things.`)
  let next = c
  for (const sid of ids) {
    const e = addFall(next, rangeId, sid)
    if (!e.ok) return e
    next = e.content
  }
  return { ...done(next), added: ids.length }
}

// Move what a Fall drive does at the slider's minimum or maximum one step (a percent; five with `big`), from none to all of the way.
export function stepFall(c: ModelContent, rangeId: string, index: number, field: 'atMin' | 'atMax', dir: -1 | 1, big = false): ModelContent {
  return {
    ...c,
    ranges: c.ranges.map(r => (r.id !== rangeId ? r : {
      ...r, drives: r.drives.map((d, i) => (i === index && d.kind === 'fall' ? { ...d, [field]: Math.min(100, Math.max(0, d[field] + dir * (big ? 5 : 1))) } : d)),
    })),
  }
}

// The weighted points of a shape as the runs that hang, for a note on the canvas (how many runs, how many points).
export function hangSummary(pts: ModelPoint[], closed: boolean): { runs: number; points: number } {
  const runs = fallRuns(pts, closed)
  return { runs: runs.length, points: runs.reduce((n, r) => n + r.forward.length + r.backward.length, 0) }
}

// ---- the side things fall to ----

export const sideOf = (side: ModelFallSide | null | undefined): ModelFallSide => (side && FALL_SIDES.includes(side) ? side : 'down')

// A preset keeps the side when it is not the usual one (down).
export const presetSide = (p: Pick<ModelPreset, 'fall'>): ModelFallSide | null => (p.fall && FALL_SIDES.includes(p.fall) ? p.fall : null)
