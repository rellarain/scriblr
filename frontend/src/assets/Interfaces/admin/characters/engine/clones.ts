import type { ModelCloneAt, ModelContent, ModelObject, ModelPoint, ModelShape } from '../../../../../api/types'
import { NAME_MAX, addShape, freshId, groupOfObject, objectById, objectOfShape, outlineSize, randomId, shapeById, type MakeId } from '../modelContent'
import { affineOf } from './anchors'
import { carryPoints, cloneAtOf, cloneMat, middleOf, middleOfAll } from './cloneAt'
import { inverse, mul, type Mat } from './geometry'
import { LIMITS } from './limits'
import { keepCarried } from './mirrors'
import { solveAtRest, type Solved } from './rig'
import { done, fail, type Edit } from './rigEdit'

// Clones (Z4), the edits: make a clone of a shape or an object (a little right of and below its original), detach one, keep a clone object in step with its original, and
// tell a move, turn or flip of a clone (which places that clone) from a change of its outline (which goes to its original, so every clone changes). Pure.

const cloneName = (name: string) => (name ? `${name} (clone)`.slice(0, NAME_MAX) : '')
// how far from its original a new clone stands
export const CLONE_STEP = 10

// Why a shape or an object cannot be cloned (or null when it can).
function uncloneable(c: ModelContent, kind: 'shape' | 'object', id: string): string | null {
  if (kind === 'shape') {
    const s = shapeById(c, id)
    if (!s) return 'There is no such shape.'
    if (s.cloneOf) return 'A clone cannot be cloned: clone its original.'
    if (s.mirrorOf) return 'A mirror cannot be cloned: clone its original.'
    if (s.kind === 'pivot') return 'A pivot circle cannot be cloned.'
    if (outlineSize(c, s) < 3) return 'The shape has no outline yet: draw it first.'
    return null
  }
  const o = objectById(c, id)
  if (!o) return 'There is no such object.'
  if (o.cloneOf) return 'A clone cannot be cloned: clone its original.'
  if (o.mirrorOf) return 'A mirror cannot be cloned: clone its original.'
  return null
}

// The shapes of an object a clone object has clones of: its own drawn shapes (not mirrors, clones, pattern copies or pivot circles).
const clonable = (c: ModelContent, o: ModelObject): ModelShape[] =>
  o.shapes.map(id => shapeById(c, id)).filter((s): s is ModelShape => !!s && !s.mirrorOf && !s.cloneOf && !s.copyOf && s.kind !== 'pivot' && outlineSize(c, s) >= 3)

// A clone of a shape: right after it in its object, with no points of its own.
function cloneShapeOf(s: ModelShape, id: string, at: ModelCloneAt | null): ModelShape {
  return { id, name: cloneName(s.name), closed: s.closed, z: s.z, op: s.op, view: s.view, pts: [], half: 0, template: null, kind: s.kind ?? 'base', outline: s.outline ?? null, cloneOf: s.id, cloneAt: at }
}

// A clone of a shape or an object, a little right of and below its original. The result names the clone.
export function makeClone(c: ModelContent, kind: 'shape' | 'object', id: string, make: MakeId = randomId, most: { shapes: number; objects: number } = { shapes: LIMITS.shapesPerObjectMax, objects: LIMITS.objectsPerGroupMax }): { edit: Edit; cloneId?: string } {
  const why = uncloneable(c, kind, id)
  if (why) return { edit: fail(why) }
  if (kind === 'shape') {
    const s = shapeById(c, id)!, owner = objectOfShape(c, id)
    if (!owner) return { edit: fail('The shape is not in an object.') }
    if (owner.shapes.length >= most.shapes) return { edit: fail(`An object may have at most ${most.shapes} shapes.`) }
    if (c.shapes.length >= LIMITS.shapesMax) return { edit: fail(`A model may have at most ${LIMITS.shapesMax} shapes.`) }
    const [cx, cy] = middleOf(s.pts, s.closed), cloneId = freshId(c, 's', make)
    return { edit: done(addShape(c, owner.id, cloneShapeOf(s, cloneId, { x: cx + CLONE_STEP, y: cy + CLONE_STEP, turn: 0, flip: false }), id)), cloneId }
  }
  const o = objectById(c, id)!, g = groupOfObject(c, id)
  if (!g) return { edit: fail('The object is not in a group.') }
  if (g.objects.length >= most.objects) return { edit: fail(`A group may have at most ${most.objects} objects.`) }
  const shapes = clonable(c, o)
  if (c.shapes.length + shapes.length > LIMITS.shapesMax) return { edit: fail(`A model may have at most ${LIMITS.shapesMax} shapes.`) }
  const [cx, cy] = middleOfAll(shapes.map(s => ({ pts: s.pts, closed: s.closed })))
  const cloneId = freshId(c, 'o', make)
  let next: ModelContent = {
    ...c,
    objects: [...c.objects, { id: cloneId, name: cloneName(o.name), layer: o.layer, shapes: [], cloneOf: o.id, cloneAt: { x: cx + CLONE_STEP, y: cy + CLONE_STEP, turn: 0, flip: false } }],
    groups: c.groups.map(x => {
      if (x.id !== g.id) return x
      const at = x.objects.indexOf(o.id)
      return { ...x, objects: [...x.objects.slice(0, at + 1), cloneId, ...x.objects.slice(at + 1)] }
    }),
  }
  for (const s of shapes) next = addShape(next, cloneId, cloneShapeOf(s, freshId(next, 's', make), null))
  return { edit: done(next), cloneId }
}

// A clone object keeps a clone of every shape of its original: a shape added to the original gets one in each clone object.
export function reconcileClones(c: ModelContent, make: MakeId = randomId): ModelContent {
  let next = c
  for (const o of c.objects) {
    if (!o.cloneOf) continue
    const original = objectById(next, o.cloneOf)
    if (!original || original.cloneOf || original.mirrorOf) continue
    const have = new Set(o.shapes.map(id => shapeById(next, id)?.cloneOf).filter((x): x is string => !!x))
    for (const s of clonable(next, original)) if (!have.has(s.id)) next = addShape(next, o.id, cloneShapeOf(s, freshId(next, 's', make), null))
  }
  return next
}

// A clone made a shape of its own: its outline as drawn now (at rest) becomes its points. A clone object: each of its shapes, and the object.
export function detachClone(c: ModelContent, kind: 'shape' | 'object', id: string, solved: Solved = solveAtRest(c)): Edit {
  const bake = (cur: ModelContent, sid: string): ModelContent => {
    const pts = (solved.shapes[sid]?.rig ?? []).map(p => ({ ...p }))
    return { ...cur, shapes: cur.shapes.map(s => (s.id === sid && s.cloneOf ? { ...s, pts, cloneOf: null, cloneAt: null } : s)) }
  }
  if (kind === 'shape') {
    const s = shapeById(c, id)
    if (!s?.cloneOf) return fail('That shape is not a clone.')
    return done(bake(c, id))
  }
  const o = objectById(c, id)
  if (!o?.cloneOf) return fail('That object is not a clone.')
  let next = c
  for (const sid of o.shapes) next = bake(next, sid)
  return done({ ...next, objects: next.objects.map(x => (x.id === id ? { ...x, cloneOf: null, cloneAt: null } : x)) })
}

// ---- editing a clone ----

// The change from one outline to another when it moves the whole outline without changing its shape (a move, a turn, a flip): the matrix, else null (a point, a handle or
// a size changed).
export function rigidChange(before: readonly ModelPoint[], after: readonly ModelPoint[]): Mat | null {
  const m = affineOf([...before], [...after])
  if (!m) return null
  const [a, b, c, d] = m, tol = 1e-3
  if (Math.abs(a * a + b * b - 1) > tol || Math.abs(c * c + d * d - 1) > tol || Math.abs(a * c + b * d) > tol) return null
  const lin = (v: [number, number] | null | undefined): [number, number] | null => (v ? [a * v[0] + c * v[1], b * v[0] + d * v[1]] : null)
  const same = (u: [number, number] | null | undefined, v: [number, number] | null | undefined) => (!u && !v) || (!!u && !!v && Math.abs(u[0] - v[0]) < 0.03 && Math.abs(u[1] - v[1]) < 0.03)
  return before.every((p, i) => same(lin(p.hi), after[i].hi) && same(lin(p.ho), after[i].ho)) ? m : null
}

// Where a clone stands and the middle it is placed about: its own place about its original's middle, or (a shape of a clone object) the object's place about the middle of
// the original object. `localOf` gives a shape's outline as resolved in its own space.
export interface ClonePlace { at: ModelCloneAt; mid: [number, number]; owner: 'shape' | 'object'; ownerId: string }
export function clonePlace(c: ModelContent, clone: ModelShape, localOf: (shapeId: string) => ModelPoint[] | undefined): ClonePlace | null {
  const original = clone.cloneOf ? shapeById(c, clone.cloneOf) : undefined
  if (!original) return null
  if (clone.cloneAt) return { at: clone.cloneAt, mid: middleOf(localOf(original.id) ?? original.pts, original.closed), owner: 'shape', ownerId: clone.id }
  const home = objectOfShape(c, clone.id), homeOriginal = home?.cloneOf ? objectById(c, home.cloneOf) : undefined
  if (!home?.cloneAt || !homeOriginal) return null
  const mid = middleOfAll(homeOriginal.shapes.flatMap(id => { const s = shapeById(c, id), pts = localOf(id); return s && pts ? [{ pts, closed: s.closed }] : [] }))
  return { at: home.cloneAt, mid, owner: 'object', ownerId: home.id }
}

// A clone's (or a clone object's) place.
export function setCloneAt(c: ModelContent, owner: 'shape' | 'object', id: string, at: ModelCloneAt): ModelContent {
  return owner === 'shape'
    ? { ...c, shapes: c.shapes.map(s => (s.id === id ? { ...s, cloneAt: at } : s)) }
    : { ...c, objects: c.objects.map(o => (o.id === id ? { ...o, cloneAt: at } : o)) }
}

// What an edit made on a clone does: a move, turn or flip places the clone (or its clone object); any other change goes to the original, carried back through the clone's
// place, so every clone changes; a clone shape's original keeps its middle where it was (the clones stay put).
export type CloneEdit = { kind: 'place'; owner: 'shape' | 'object'; id: string; at: ModelCloneAt } | { kind: 'outline'; id: string; pts: ModelPoint[] }
export function cloneEdit(c: ModelContent, clone: ModelShape, drawnNow: readonly ModelPoint[], next: readonly ModelPoint[], localOf: (shapeId: string) => ModelPoint[] | undefined): CloneEdit | null {
  const place = clonePlace(c, clone, localOf), original = clone.cloneOf ? shapeById(c, clone.cloneOf) : undefined
  if (!place || !original) return null
  const M = cloneMat(place.at, place.mid[0], place.mid[1])
  const rigid = next.length === drawnNow.length ? rigidChange(drawnNow, next) : null
  if (rigid) return { kind: 'place', owner: place.owner, id: place.ownerId, at: cloneAtOf(mul(rigid, M), place.mid[0], place.mid[1]) }
  // carried back through the clone's place (a flipped clone runs the other way round, and is put back the right way round)
  let pts = carryPoints(next, inverse(M))
  if (place.owner === 'shape') {
    // the original keeps its middle: the outline is moved back onto it
    const [ox, oy] = middleOf(localOf(original.id) ?? original.pts, original.closed), [nx, ny] = middleOf(pts, original.closed)
    pts = pts.map(p => ({ ...p, x: p.x + ox - nx, y: p.y + oy - ny }))
  }
  return { kind: 'outline', id: original.id, pts: keepCarried(original.pts, pts) }
}
