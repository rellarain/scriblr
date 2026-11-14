import type { ModelAngleOutline, ModelContent, ModelForm, ModelObject, ModelPoint, ModelShape, ModelTurn } from '../../../../../api/types'
import { axesOf } from './forms'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'
import { ANGLE_OUTLINES_MAX, DEPTH_RANGE, LAYER_THICK, THICK_RANGE, carryKey, isKeySpot } from './turn'

// Editing how shapes turn (phase A3): outlines drawn at key angles, a shape's depth and roundness, depths point by point, and what an object lies on. Pure: each returns new
// content (or a reason it cannot be done), as rigEdit does.

const blankTurn = (): ModelTurn => ({ depth: 0, thick: null, dz: [], angles: [], seen: null })
const r2 = (v: number) => Math.round(v * 100) / 100
const clampTo = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v))
const copyPts = (list: ModelPoint[]): ModelPoint[] => list.map(p => ({ x: p.x, y: p.y, m: p.m, hi: p.hi ? [p.hi[0], p.hi[1]] : p.hi ?? null, ho: p.ho ? [p.ho[0], p.ho[1]] : p.ho ?? null, ...(p.w != null ? { w: p.w } : {}) }))
const normAt = (a: number) => ((Math.round(a) % 360) + 360) % 360

const mapShape = (c: ModelContent, id: string, change: (s: ModelShape) => ModelShape): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === id ? change(s) : s)) })
const turnOf = (s: ModelShape): ModelTurn => s.turn ?? blankTurn()
// A turn with nothing in it is not kept.
const tidy = (t: ModelTurn): ModelTurn | null => (t.depth === 0 && t.thick == null && t.dz.length === 0 && t.angles.length === 0 && !t.seen ? null : t)

// Why a shape's own turning cannot be changed here (null when it can): a twin turns as its original does, and a shape that follows its pattern as the pattern's shape does.
function refusal(s: ModelShape | undefined): string | null {
  if (!s) return 'There is no such shape.'
  if (s.mirrorOf) return 'A twin turns as its original does: change the original, or break the pair.'
  if (s.copyOf && s.pts.length < 3) return 'This shape follows its pattern: change the pattern’s shape, or detach the member.'
  return null
}

// Outlines at key angles: put one in (in place of one at the same angle and nod), or take one out.
function putAngle(list: readonly ModelAngleOutline[], at: number, tilt: number, pts: ModelPoint[] | null): ModelAngleOutline[] | string {
  const rest = list.filter(a => !(a.at === at && a.tilt === tilt))
  if (pts === null) return rest
  if (rest.length >= ANGLE_OUTLINES_MAX) return `A shape may have outlines at ${ANGLE_OUTLINES_MAX} angles at most.`
  return [...rest, { at, tilt, pts: copyPts(pts) }].sort((a, b) => a.tilt - b.tilt || a.at - b.at)
}
function checkSpot(at: number, tilt: number, pts: ModelPoint[] | null): string | null {
  if (!isKeySpot(at, tilt)) return 'An outline is drawn at a key angle: a multiple of 15 degrees, and not the front or the back seen level.'
  if (pts !== null && pts.length < 3) return 'An outline needs at least 3 points.'
  if (pts !== null && pts.length > LIMITS.pointsMax) return `A shape may have at most ${LIMITS.pointsMax} points.`
  return null
}

// The shape's outline at a key angle (its own, the outline of its base form). null takes it away, so the shape is turned there again.
export function setAngleOutline(c: ModelContent, shapeId: string, at: number, tilt: number, pts: ModelPoint[] | null): Edit {
  const s = c.shapes.find(x => x.id === shapeId), no = refusal(s) ?? checkSpot(at, tilt, pts)
  if (no) return fail(no)
  const t = turnOf(s!), angles = putAngle(t.angles, normAt(at), Math.round(tilt), pts)
  if (typeof angles === 'string') return fail(angles)
  return done(mapShape(c, shapeId, x => ({ ...x, turn: tidy({ ...t, angles }) })))
}

const mapForm = (c: ModelContent, objectId: string, axisId: string, formId: string, change: (f: ModelForm) => ModelForm): ModelContent => ({
  ...c, objects: c.objects.map(o => (o.id !== objectId ? o : { ...o, axes: axesOf(o).map(a => (a.id !== axisId ? a : { ...a, options: a.options.map(f => (f.id === formId ? change(f) : f)) })) })),
})
// A form's outline of a shape at a key angle (drawn by hand: at the other angles the base's is carried to the form). A form that does not change the shape yet is given the
// shape's own outline, so it changes the shape only at that angle.
export function setFormAngleOutline(c: ModelContent, objectId: string, axisId: string, formId: string, shapeId: string, at: number, tilt: number, pts: ModelPoint[] | null): Edit {
  const o = c.objects.find(x => x.id === objectId), axis = o && axesOf(o).find(a => a.id === axisId), form = axis?.options.find(f => f.id === formId)
  if (!o || !form) return fail('There is no such form.')
  const s = c.shapes.find(x => x.id === shapeId)
  if (!s || !o.shapes.includes(shapeId)) return fail('That shape is not in the object.')
  const no = refusal(s) ?? checkSpot(at, tilt, pts)
  if (no) return fail(no)
  const ov = form.ovr.find(v => v.shape === shapeId)
  if (!ov && pts === null) return done(c)
  if (ov && ov.pts.length === 0) return fail('This form hides the shape: show it in the form first.')
  const angles = putAngle(ov?.angles ?? [], normAt(at), Math.round(tilt), pts)
  if (typeof angles === 'string') return fail(angles)
  const next = { shape: shapeId, pts: ov ? ov.pts : copyPts(s.pts), angles: angles.length ? angles : null }
  return done(mapForm(c, objectId, axisId, formId, f => ({ ...f, ovr: ov ? f.ovr.map(v => (v.shape === shapeId ? next : v)) : [...f.ovr, next] })))
}

// How far the shape's middle stands toward the viewer from its group's pivot: steps of 1 (Shift: 10).
export function stepShapeDepth(c: ModelContent, shapeId: string, dir: -1 | 1, big: boolean): Edit {
  const s = c.shapes.find(x => x.id === shapeId), no = refusal(s)
  if (no) return fail(no)
  const t = turnOf(s!)
  return done(mapShape(c, shapeId, x => ({ ...x, turn: tidy({ ...t, depth: r2(clampTo(t.depth + dir * (big ? 10 : 1), DEPTH_RANGE)) }) })))
}

// How deep the shape is for its width when turned as a rounded cut-out (its roundness): steps of 0.05 (Shift: 0.25), from its layer's when it has none of its own.
export function stepThick(c: ModelContent, shapeId: string, dir: -1 | 1, big: boolean): Edit {
  const s = c.shapes.find(x => x.id === shapeId), no = refusal(s)
  if (no) return fail(no)
  const t = turnOf(s!), from = t.thick ?? layerThick(c, shapeId)
  return done(mapShape(c, shapeId, x => ({ ...x, turn: tidy({ ...t, thick: r2(clampTo(from + dir * (big ? 0.25 : 0.05), THICK_RANGE)) }) })))
}
export function clearThick(c: ModelContent, shapeId: string): Edit {
  const s = c.shapes.find(x => x.id === shapeId), no = refusal(s)
  if (no) return fail(no)
  return done(mapShape(c, shapeId, x => ({ ...x, turn: tidy({ ...turnOf(x), thick: null }) })))
}
// The roundness a shape with none of its own turns with: its layer's.
export function layerThick(c: ModelContent, shapeId: string): number {
  const o = c.objects.find(x => x.shapes.includes(shapeId))
  return LAYER_THICK[o?.layer ?? 'body'] ?? 0.8
}

// How far point i stands toward the viewer from the shape's middle (its depths, one per point, start at 0): steps of 1 (Shift: 10).
export function stepPointDepth(c: ModelContent, shapeId: string, i: number, dir: -1 | 1, big: boolean): Edit {
  const s = c.shapes.find(x => x.id === shapeId), no = refusal(s)
  if (no) return fail(no)
  if (i < 0 || i >= s!.pts.length) return fail('There is no such point.')
  const t = turnOf(s!), dz = s!.pts.map((_, k) => t.dz[k] ?? 0)
  dz[i] = r2(clampTo(dz[i] + dir * (big ? 10 : 1), DEPTH_RANGE))
  return done(mapShape(c, shapeId, x => ({ ...x, turn: tidy({ ...t, dz: dz.every(v => v === 0) ? [] : dz }) })))
}
export function clearPointDepths(c: ModelContent, shapeId: string): Edit {
  const s = c.shapes.find(x => x.id === shapeId), no = refusal(s)
  if (no) return fail(no)
  return done(mapShape(c, shapeId, x => ({ ...x, turn: tidy({ ...turnOf(x), dz: [] }) })))
}

// The shape an object lies on (its points read their depths off its rounded surface: an eye on the skull), or none.
export function setWrap(c: ModelContent, objectId: string, shapeId: string | null): Edit {
  const o = c.objects.find(x => x.id === objectId)
  if (!o) return fail('There is no such object.')
  if (o.mirrorOf) return fail('A twin lies on the twin of what its original lies on: change the original.')
  if (shapeId !== null) {
    if (!c.shapes.some(s => s.id === shapeId)) return fail('There is no such shape.')
    if (o.shapes.includes(shapeId)) return fail('An object cannot lie on one of its own shapes.')
  }
  return done({ ...c, objects: c.objects.map(x => (x.id === objectId ? ({ ...x, wrap: shapeId } as ModelObject) : x)) })
}

// After an edit: a shape whose number of points changed keeps its depths and its outlines at key angles in step (a point put in takes the depth of the point nearest it,
// and its place on each key outline follows its place on the edge it was put on; a point taken away takes its depth and its key points with it). The same for a form's
// outlines at key angles when the form's outline changes.
export function alignTurns(before: ModelContent, after: ModelContent): ModelContent {
  const old = new Map(before.shapes.map(s => [s.id, s]))
  let changed = false
  const shapes = after.shapes.map(s => {
    const prev = old.get(s.id), t = s.turn
    if (!t || !prev || prev.pts.length === s.pts.length || prev.turn !== t) return s
    changed = true
    return { ...s, turn: tidy({ ...t, dz: alignDepths(t.dz, prev.pts, s.pts), angles: t.angles.map(a => ({ ...a, pts: alignKey(a.pts, prev.pts, s.pts, s.closed) })) }) }
  })
  const shapeMap = new Map(after.shapes.map(s => [s.id, s]))
  const prevObjects = new Map(before.objects.map(o => [o.id, o]))
  const objects = after.objects.map(o => {
    const p = prevObjects.get(o.id)
    if (!p || p === o) return o
    let moved = false
    const axes = axesOf(o).map(axis => {
      const pa = axesOf(p).find(a => a.id === axis.id)
      return { ...axis, options: axis.options.map(f => {
        const pf = pa?.options.find(x => x.id === f.id)
        return { ...f, ovr: f.ovr.map(v => {
          const pv = pf?.ovr.find(x => x.shape === v.shape)
          if (!pv || !v.angles?.length || pv.angles !== v.angles || pv.pts.length === v.pts.length) return v
          moved = true
          const closed = shapeMap.get(v.shape)?.closed ?? true
          return { ...v, angles: v.angles.map(a => ({ ...a, pts: alignKey(a.pts, pv.pts, v.pts, closed) })) }
        }) }
      }) }
    })
    if (!moved) return o
    changed = true
    return { ...o, axes }
  })
  return changed ? { ...after, shapes, objects } : after
}
function alignDepths(dz: number[], prev: ModelPoint[], next: ModelPoint[]): number[] {
  if (dz.length !== prev.length) return dz
  return next.map(p => {
    let best = 0, d = Infinity
    prev.forEach((q, i) => { const e = Math.hypot(q.x - p.x, q.y - p.y); if (e < d) { d = e; best = i } })
    return dz[best] ?? 0
  })
}
// A key outline after its base outline gained or lost points: a point still where it was keeps its key point; a new one is placed on the key as it lies on the base.
function alignKey(key: ModelPoint[], prev: ModelPoint[], next: ModelPoint[], closed: boolean): ModelPoint[] {
  if (key.length !== prev.length) return key
  const carried = carryKey(key, prev, next, closed)
  return next.map((p, i) => {
    const same = prev.findIndex(q => q === p || (q.x === p.x && q.y === p.y))
    return same >= 0 ? key[same] : { ...carried[i], hi: null, ho: null }
  })
}
