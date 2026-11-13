import type { ModelAttach, ModelBone, ModelBoneEnd, ModelContent, ModelDrive, ModelFallSide, ModelGroup, ModelObject, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { IDENTITY, apply, bezierAt, boxOf, build, clamp, edgeAt, flatten, inverse, mul, pathText, reflectList, rotate, roundCorners, scale, scaleAlong, translate, turnOf, twinIndex, windSign, type Box, type BuiltPoint, type Mat } from './geometry'
import { carriesOutline, classKey, classesOf, lookOf, membersOf, overrideFor, type Choices } from './forms'
import { applyDrape, applyFall, hangDirection, squeezeOf } from './fall'
import { drawOrder } from './order'
import { PROPS, ROUND_MAX, isDrawingProp, isPaintProp, type PropKey } from './props'
import { creaseCorners, influencesFor, isSkinned, skinPoints, type PointSkin, type SkinRig } from './skin'
import { texturedPath } from './texture'

// The rig: groups hang from parent groups, are fixed to a shape of the parent by an anchor and turn about a pivot, and sliders (ranges) drive them.
// `solve` turns a model and the slider values into the place and outline of every shape. Ported from the mockup's `M.solve` (docs/mannequin-mockup/
// designer-engine.js) without colour and shading, which come in later phases. Pure and finite for any input, so it is tested in node.

export type Values = Record<string, number>
export type View = 'front' | 'back'

// ---- sliders ----

export const rangeById = (c: ModelContent, id: string): ModelRange | undefined => c.ranges.find(r => r.id === id)

// Every slider at rest: what the model is drawn as.
export function defaultValues(c: ModelContent): Values {
  const out: Values = {}
  for (const r of c.ranges) out[r.id] = r.rest
  return out
}

// A slider's value, held to its range (rest when it is missing or not a number).
export function valueOf(r: ModelRange, values: Values): number {
  const v = values[r.id]
  return clamp(Number.isFinite(v) ? v : r.rest, r.min, r.max)
}

// How far the value is from rest toward one end: 0 at rest, 1 at the end it is moving toward.
function pull(r: ModelRange, v: number): { t: number; up: boolean } {
  if (v >= r.rest) {
    const span = r.max - r.rest
    return { t: span > 0 ? (v - r.rest) / span : 0, up: true }
  }
  const span = r.rest - r.min
  return { t: span > 0 ? (r.rest - v) / span : 0, up: false }
}

// What a drive does at this value: `base` at rest, `atMax` at the maximum, `atMin` at the minimum, and in a straight line between (0 degrees at rest for a
// turn or a bend, 100 percent for a scale).
export function amount(r: ModelRange, d: ModelDrive, v: number, base = 0): number {
  const { t, up } = pull(r, v)
  return base + ((up ? d.atMax : d.atMin) - base) * t
}

// The sliders that change a shape's own points (a recorded move, a bend, a scale of the shape), as opposed to turning or scaling its group.
// What an authored field's slider (a `prop` drive, phase D3c) does to the points of a shape: a position, a size, a rotation, a point, an edge. Opacity and paint do not.
const movesPoints = (d: ModelDrive): boolean => d.kind === 'prop' && !!d.prop && !isPaintProp(d.prop) && !isDrawingProp(d.prop)
export const drivesShapePoints = (d: ModelDrive, shapeId: string, objectId?: string): boolean =>
  (d.kind === 'points' && d.shape === shapeId) || (d.kind === 'bend' && d.shape === shapeId) || (d.kind === 'fall' && d.shape === shapeId) || (d.kind === 'scale' && d.target === 'shape' && d.id === shapeId)
  || (movesPoints(d) && (d.feature === 'object' ? !!objectId && d.id === objectId : d.shape === shapeId))

export function pointDrivers(c: ModelContent, shapeId: string): ModelRange[] {
  const objectId = c.objects.find(o => o.shapes.includes(shapeId))?.id
  return c.ranges.filter(r => r.drives.some(d => drivesShapePoints(d, shapeId, objectId)))
}

// What a prop drive comes to at a slider value: the amount at rest is the property's own (0 for a move, 100 percent for a size).
export const propAmount = (r: ModelRange, d: ModelDrive, v: number): number => amount(r, d, v, d.prop && d.prop in PROPS ? PROPS[d.prop as PropKey].rest : 0)

// Whether a slider that changes this shape's points is away from rest, so the points on the canvas are not the ones that were drawn. A skinned shape is also driven when a
// slider that moves one of the groups it follows against its own group is away from rest.
export function isPointDriven(c: ModelContent, values: Values, shapeId: string): boolean {
  return pointDrivers(c, shapeId).some(r => valueOf(r, values) !== r.rest) || isSkinPosed(c, values, shapeId)
}

// Whether a skinned shape is posed: a group between its own group and a group it follows (below where their chains meet) is turned, scaled, lengthened or slid by a slider that
// is away from rest. A twin group moves with its original, so the original's sliders count too.
export function isSkinPosed(c: ModelContent, values: Values, shapeId: string): boolean {
  const s = c.shapes.find(x => x.id === shapeId)
  if (!s || !isSkinned(s)) return false
  const oid = c.objects.find(o => o.shapes.includes(shapeId))?.id
  const own = oid ? c.groups.find(g => g.objects.includes(oid))?.id : undefined
  const ownChain = own ? chainOf(c, own) : []
  const moving = new Set<string>()
  for (const k of s.skin ?? []) {
    if (!k.w.some(w => w > 0)) continue
    const theirs = chainOf(c, k.g)
    for (const g of theirs) if (!ownChain.includes(g)) moving.add(g)
    for (const g of ownChain) if (!theirs.includes(g)) moving.add(g)
  }
  for (const g of c.groups) if (g.mirrorOf && moving.has(g.id)) moving.add(g.mirrorOf)
  if (moving.size === 0) return false
  const bones = new Map((c.bones ?? []).map(b => [b.id, b]))
  const away = c.ranges.filter(r => valueOf(r, values) !== r.rest)
  if (away.some(r => r.drives.some(d => (d.kind === 'turn' && !!d.group && moving.has(d.group)) || (d.kind === 'scale' && d.target === 'group' && !!d.id && moving.has(d.id))
    || (d.kind === 'length' && !!d.id && moving.has(bones.get(d.id)?.start ?? ''))))) return true
  const awayIds = new Set(away.map(r => r.id))
  return c.groups.some(g => moving.has(g.id) && g.attach?.kind === 'range' && !!g.attach.slider && awayIds.has(g.attach.slider))
}

// ---- groups ----

// Groups with the parents first (a cycle is cut where it closes, so every group comes out once).
export function groupOrder(c: ModelContent): ModelGroup[] {
  const byId = new Map(c.groups.map(g => [g.id, g]))
  const out: ModelGroup[] = [], done = new Set<string>()
  const visit = (g: ModelGroup, stack: Set<string>) => {
    if (done.has(g.id) || stack.has(g.id)) return
    stack.add(g.id)
    const parent = g.parent ? byId.get(g.parent) : undefined
    if (parent) visit(parent, stack)
    stack.delete(g.id)
    if (!done.has(g.id)) { done.add(g.id); out.push(g) }
  }
  for (const g of c.groups) visit(g, new Set())
  return out
}

// The groups from the root down to this one (empty for an unknown id; cycle-safe).
export function chainOf(c: ModelContent, groupId: string): string[] {
  const byId = new Map(c.groups.map(g => [g.id, g]))
  const chain: string[] = []
  let cur: ModelGroup | undefined = byId.get(groupId)
  while (cur && !chain.includes(cur.id)) {
    chain.unshift(cur.id)
    cur = cur.parent ? byId.get(cur.parent) : undefined
  }
  return chain
}
export const chainDepth = (c: ModelContent, groupId: string): number => chainOf(c, groupId).length

export function descendantsOf(c: ModelContent, groupId: string): Set<string> {
  const out = new Set<string>()
  const walk = (id: string) => { for (const g of c.groups) if (g.parent === id && !out.has(g.id) && g.id !== groupId) { out.add(g.id); walk(g.id) } }
  walk(groupId)
  return out
}

// How many levels this group and everything under it take (1 for a group with no child).
export function subtreeHeight(c: ModelContent, groupId: string): number {
  const walk = (id: string, seen: Set<string>): number => {
    let best = 0
    for (const g of c.groups) if (g.parent === id && !seen.has(g.id)) best = Math.max(best, walk(g.id, new Set([...seen, g.id])))
    return best + 1
  }
  return walk(groupId, new Set([groupId]))
}

// ---- the solver ----

export interface SolvedShape {
  id: string
  group: string | null
  // The points as drawn in the group's own space, after links and sliders (what the canvas edits when no slider changes the points). In the back view a
  // shape with an outline of its own for the back shows that one.
  local: ModelPoint[]
  // The same for the rig: always the front outline, which anchors, links and recorded moves refer to by number, so both views move together.
  rig: ModelPoint[]
  // The curve points of the rig outline with the group's matrix only (an anchor or a link reads these).
  pre: BuiltPoint[]
  // Local space to canvas space.
  matrix: Mat
  // The group's matrix alone: local space to the model's space, before the whole-model transform.
  frame: Mat
  d: string
  poly: Array<[number, number]>
  box: Box
  visible: boolean
  // Switched off with the eye (its object, its group or a group above it), or by its class (a pattern that has members, a member of a family that is not the
  // one shown): it is solved all the same, but not drawn.
  off: boolean
  // How much of the shape shows, 0..1: a shape that fades in with a slider (a crease) is 0 until the slider reaches it. 1 for every other shape.
  fade: number
  // For a shape of a class member that has an outline of its own: the outline it would have following the template, drawn the same way ('' otherwise).
  ghost: string
  z: number
  // Skin weights (phase O1), for a shape whose points follow other groups or are linked to a shape that does: see SolvedSkin. Absent for every other shape.
  skin?: SolvedSkin
}
// The rig outline of a skinned shape before the skin moved it (each point in the space of its base group: see skin.ts PointSkin) and what each point follows (null: a point a link
// has already put in the shape's own space). A point linked to the shape is placed on this outline and follows the same groups; a twin reflects it and skins itself. `drawn` is
// the same for the outline that is drawn when it is not the rig outline (a form, the back view; null when that one is not skinned).
export interface SolvedSkin {
  rest: ModelPoint[]
  pts: Array<PointSkin | null>
  drawn?: { rest: ModelPoint[]; pts: Array<PointSkin | null> } | null
}
export interface Solved {
  shapes: Record<string, SolvedShape>
  // The visible shapes, back to front.
  order: string[]
  // Each group's matrix (local space to the model's space, before the whole-model transform) and its pivot in that space.
  mats: Record<string, Mat>
  pivots: Record<string, [number, number]>
  // Where each attached group is fixed (null when its anchor cannot be found).
  anchors: Record<string, [number, number] | null>
  global: Mat
  // Each group's whole turn in degrees, its own and those of the groups above it added up (not wrapped): skin weights blend the turn between two groups by it.
  turns?: Record<string, number>
}

const finiteMat = (m: Mat): boolean => m.every(Number.isFinite)
const NO_BOX: Box = { x: 0, y: 0, w: 0, h: 0 }
const copyPoint = (p: ModelPoint): ModelPoint => ({ ...p, hi: p.hi ? [p.hi[0], p.hi[1]] : p.hi, ho: p.ho ? [p.ho[0], p.ho[1]] : p.ho })
const factorOf = (r: ModelRange, d: ModelDrive, v: number): number => Math.max(0.05, amount(r, d, v, 100) / 100)
// How far along its edge the outline of a bridge keeps going before it turns toward the other part, as a share of the gap.
const BRIDGE_REACH = 0.42

function centreOfPoints(list: ModelPoint[], closed: boolean): [number, number] {
  if (list.length < 3) return [100, 200]
  const b = boxOf(flatten(build(list, closed), closed))
  return [b.x + b.w / 2, b.y + b.h / 2]
}

// Where a group turns when it has no pivot of its own: the middle of its shapes as drawn.
export function restPivot(c: ModelContent, g: ModelGroup): [number, number] {
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const objects = new Map(c.objects.map(o => [o.id, o]))
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false
  for (const oid of g.objects) {
    for (const sid of objects.get(oid)?.shapes ?? []) {
      const s = shapes.get(sid)
      if (!s || s.pts.length < 3) continue
      const b = boxOf(flatten(build(s.pts, s.closed), s.closed))
      any = true
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
  }
  return any ? [(x0 + x1) / 2, (y0 + y1) / 2] : [c.axis ?? 100, 200]
}

// Where a group turns with every slider at rest, in the model's own space: its pivot, or for a twin the reflection of its original's.
export function pivotAtRest(c: ModelContent, g: ModelGroup): [number, number] {
  const original = g.mirrorOf && g.mirrorOf !== g.id ? c.groups.find(x => x.id === g.mirrorOf) : undefined
  if (original && !original.mirrorOf) { const p = pivotAtRest(c, original); return [2 * (c.axis ?? 100) - p[0], p[1]] }
  return g.pivot ?? restPivot(c, g)
}

// Where a bone's end is with every slider at rest (null when the group, shape or point it names is not there).
export function boneEndAtRest(c: ModelContent, e: ModelBoneEnd): [number, number] | null {
  if (e.kind === 'group') { const g = c.groups.find(x => x.id === e.id); return g ? pivotAtRest(c, g) : null }
  const p = c.shapes.find(x => x.id === e.id)?.pts[e.i]
  return p ? [p.x, p.y] : null
}

// A bone at rest: from the pivot of its group to its end, in the model's own space (null when either cannot be found).
export function boneAtRest(c: ModelContent, b: ModelBone): { a: [number, number]; b: [number, number] } | null {
  const g = c.groups.find(x => x.id === b.start), end = boneEndAtRest(c, b.end)
  return g && end ? { a: pivotAtRest(c, g), b: end } : null
}

// Where an anchor is, from the solved points of the shape it is on: a point, a spot along an edge, anywhere along an edge that a slider moves, or a
// relative place inside the shape's box. `shapes` holds what is solved so far.
export function anchorFrom(c: ModelContent, shapes: Record<string, { pre: BuiltPoint[]; rig?: ModelPoint[]; frame?: Mat }>, att: ModelAttach, values: Values): [number, number] | null {
  const a = shapes[att.shape]?.pre
  if (!a || a.length < 1) return null
  const n = a.length
  if (att.kind === 'point') { const q = a[att.i % n]; return q ? [q.x, q.y] : null }
  if (att.kind === 'edge' || att.kind === 'range') {
    let t = att.t
    if (att.kind === 'range') {
      const r = att.slider ? rangeById(c, att.slider) : undefined
      t = r && r.max > r.min ? clamp((valueOf(r, values) - r.min) / (r.max - r.min), 0, 1) : att.t
    }
    const p0 = a[att.i % n], p1 = a[(att.i + 1) % n]
    return [p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t]
  }
  // a relative place inside the shape's box in the shape's own space, carried to the model's space by its group (so a turning shape takes the place with it)
  const own = shapes[att.shape]
  if (own.rig && own.frame && own.rig.length >= 3) {
    const lb = boxOf(own.rig.map((p): [number, number] => [p.x, p.y]))
    return apply(own.frame, lb.x + lb.w * att.rx, lb.y + lb.h * att.ry)
  }
  const bb = boxOf(a.map((p): [number, number] => [p.x, p.y]))
  return [bb.x + bb.w * att.rx, bb.y + bb.h * att.ry]
}

// How loose a shape is: the value of its looseness slider over the slider's rest (1 at rest, or with no slider). Links keep their distance times this.
export function looseFactor(c: ModelContent, shape: Pick<ModelShape, 'loose'>, values: Values): number {
  const r = shape.loose ? rangeById(c, shape.loose) : undefined
  return r && r.rest > 0 ? clamp(valueOf(r, values) / r.rest, 0, 4) : 1
}

// What the admin has set besides the sliders (test state, never saved): the form each axis shows and the member each family shows (see forms.ts), the objects
// and groups switched off, and the objects to show whatever their class says (the pattern or the member being edited: a family then shows only those).
// `plain` draws every object scaled with its group, whatever its fit mode says (what fit modes are measured against).
// `fall` is the side things fall to (default: down).
// `order` is the order a style draws an object's shapes in (back to front), per object; `hidden` may also name shapes (a style hides some of its object's).
// `zoff` (phase 6b-3) is how far a garment or a hair part has been moved among the parts of its layer (see order.ts `layerUnits`), per part: a writer puts a jacket over a shirt.
export interface SolveOptions { forms?: Choices; hidden?: Iterable<string>; show?: Iterable<string>; plain?: boolean; fall?: ModelFallSide; order?: Record<string, string[]>; zoff?: Record<string, number> }

// The model with every slider at rest and every object scaled with its group, kept for the content it was solved from (a stretching object reads its target's
// box from it).
const roundUses = new WeakMap<ModelContent, boolean>()
function roundUse(c: ModelContent): boolean {
  let found = roundUses.get(c)
  if (found === undefined) {
    found = c.shapes.some(s => (s.round ?? 0) > 0) || c.ranges.some(r => r.drives.some(d => d.kind === 'prop' && d.prop === 'roundness'))
      || c.objects.some(o => (o.axes ?? []).some(a => a.options.some(f => (f.looks ?? []).some(l => l.round != null))))
    roundUses.set(c, found)
  }
  return found
}
// Whether any shape of the model has skin weights (phase O1): a model with none is solved exactly as it was before there were any.
const skinUses = new WeakMap<ModelContent, boolean>()
function skinUse(c: ModelContent): boolean {
  let found = skinUses.get(c)
  if (found === undefined) { found = c.shapes.some(isSkinned); skinUses.set(c, found) }
  return found
}
// What a spot t of the way along an edge follows: the two ends' groups mixed by t (when they are read in different groups, the nearer end's).
function mixSkin(a: PointSkin, b: PointSkin, t: number): PointSkin {
  if (a.base !== b.base) return t < 0.5 ? a : b
  const m = new Map<string, number>()
  for (const [g, w] of a.inf) m.set(g, (m.get(g) ?? 0) + w * (1 - t))
  for (const [g, w] of b.inf) m.set(g, (m.get(g) ?? 0) + w * t)
  return { base: a.base, inf: [...m.entries()].filter(([, w]) => w > 0) }
}
// Foreshortening (phase O2): a bone that points `deg` degrees toward the viewer (+) or away (-) is drawn shorter along itself by the cosine of the angle and a little wider
// across (narrower when it points away), about the joint it turns at. The most is 89 degrees either way.
export const DEPTH_MAX = 89
export function foreshorten(deg: number, ux: number, uy: number, px: number, py: number): Mat {
  const a = (clamp(deg, -DEPTH_MAX, DEPTH_MAX) * Math.PI) / 180
  return mul(scaleAlong(Math.cos(a), ux, uy, px, py), scaleAlong(1 + 0.12 * Math.sin(a), -uy, ux, px, py))
}
const plainRests = new WeakMap<ModelContent, Solved>()
function plainRest(c: ModelContent): Solved {
  let s = plainRests.get(c)
  if (!s) { s = solve(c, defaultValues(c), 'front', { plain: true }); plainRests.set(c, s) }
  return s
}

export function solve(c: ModelContent, values: Values = {}, view: View = 'front', opts: SolveOptions = {}): Solved {
  const axis = c.axis ?? 100
  const ranges = c.ranges ?? []
  const val = (r: ModelRange) => valueOf(r, values)
  const choices: Choices = opts.forms ?? {}
  const hidden = new Set(opts.hidden ?? [])
  const show = new Set(opts.show ?? [])
  const fallSide: ModelFallSide = opts.fall ?? 'down'

  // the whole model: sliders that scale it (Height) about its feet, and the back view, which turns the figure round
  let gx = 1, gy = 1
  for (const r of ranges) for (const d of r.drives) {
    if (d.kind !== 'scale' || d.target !== 'model') continue
    const f = factorOf(r, d, val(r))
    if (d.axis !== 'y') gx *= f
    if (d.axis !== 'x') gy *= f
  }
  const RF: Mat = [-1, 0, 0, 1, 2 * axis, 0]   // the reflection about the model's axis
  const flip: Mat = view === 'back' ? RF : IDENTITY
  const G = mul(scale(gx, gy, axis, 392), flip)

  const shapeMap = new Map(c.shapes.map(s => [s.id, s]))
  const groupMap = new Map(c.groups.map(g => [g.id, g]))
  const boneMap = new Map((c.bones ?? []).map(b => [b.id, b]))
  const groupOfShape = new Map<string, string>()
  const objectShapes = new Map(c.objects.map(o => [o.id, o.shapes]))
  for (const g of c.groups) for (const oid of g.objects) for (const sid of objectShapes.get(oid) ?? []) if (!groupOfShape.has(sid)) groupOfShape.set(sid, g.id)
  const objectMap = new Map(c.objects.map(o => [o.id, o]))
  const objectOfShape = new Map<string, string>()
  for (const o of c.objects) for (const sid of o.shapes) if (!objectOfShape.has(sid)) objectOfShape.set(sid, o.id)

  // The outline the chosen forms give a shape (undefined: it keeps its base outline; an empty list: the form hides it).
  const formOutline = (sid: string): ModelPoint[] | undefined => {
    const oid = objectOfShape.get(sid), o = oid ? objectMap.get(oid) : undefined
    return o ? overrideFor(o, sid, choices) : undefined
  }
  // The same for a shape of a class member that follows `tid`, a shape of the template: the template's forms, with the member's own choice on each axis.
  const memberForm = (tid: string, memberId: string | undefined): ModelPoint[] | undefined => {
    const oid = objectOfShape.get(tid), t = oid ? objectMap.get(oid) : undefined
    return t && memberId ? overrideFor(t, tid, choices, memberId) : undefined
  }
  // Whether that outline is carried (phase O8): what follows the shape reads it.
  const formCarries = (sid: string, memberId?: string): boolean => {
    const oid = objectOfShape.get(sid), o = oid ? objectMap.get(oid) : undefined, sh = shapeMap.get(sid)
    return !!o && !!sh && carriesOutline(o, sh, choices, memberId ?? o.id)
  }
  // What a class switches off: the template once it has members (it is a pattern; unless it is the thing being shown), and in a family every member but the one
  // shown. A twin goes with the object it mirrors.
  const classOff = new Set<string>()
  for (const k of classesOf(c)) {
    const tpl = objectMap.get(k.template), members = membersOf(c, k.id)
    if (!tpl || members.length === 0) continue
    if (!show.has(tpl.id)) classOff.add(tpl.id)
    if (!k.exclusive) continue
    const shown = members.filter(m => show.has(m.id))
    const pick = new Set(shown.length ? shown.map(m => m.id) : show.has(tpl.id) ? [] : [(members.find(m => m.id === choices[classKey(k.id)]) ?? members[0]).id])
    for (const m of members) if (!pick.has(m.id)) classOff.add(m.id)
  }
  for (const o of c.objects) if (o.mirrorOf && classOff.has(o.mirrorOf)) classOff.add(o.id)
  // The patterns a shape is a mark of (phase D4): hiding a pattern switches its marks off, and a twin goes with the mark it mirrors.
  const patternsOfMark = new Map<string, string[]>()
  for (const p of c.patterns ?? []) for (const m of p.marks) patternsOfMark.set(m, [...(patternsOfMark.get(m) ?? []), p.id])
  // Whether the shape's object, its group or a group above it is switched off (it is still solved: anchors and links read it).
  const switchedOff = (sid: string): boolean => {
    if (hidden.size === 0 && classOff.size === 0) return false
    if (patternsOfMark.size > 0) for (const id of [sid, shapeMap.get(sid)?.mirrorOf ?? '']) if ((patternsOfMark.get(id) ?? []).some(pid => hidden.has(pid))) return true
    // a shape a style hides, or one that mirrors it
    if (hidden.has(sid) || hidden.has(shapeMap.get(sid)?.mirrorOf ?? '')) return true
    const oid = objectOfShape.get(sid)
    if (oid && (hidden.has(oid) || classOff.has(oid))) return true
    const seen = new Set<string>()
    for (let gid = groupOfShape.get(sid); gid && !seen.has(gid); gid = groupMap.get(gid)?.parent ?? undefined) {
      if (hidden.has(gid)) return true
      seen.add(gid)
    }
    return false
  }

  const out: Solved = { shapes: {}, order: [], mats: {}, pivots: {}, anchors: {}, global: G, turns: {} }
  const turns = out.turns!
  // A group's matrix without its own foreshortening (phase O2), only for a group that has some: what hangs from it stands in this one, moved to where the shortened group puts
  // its joint, so a forearm hangs from the end of an upper arm that points at the viewer and keeps its own length (see carryFor).
  const bares: Record<string, Mat> = {}
  // Groups and shapes are solved when something asks for them (an anchor asks for a shape, a shape for its group, a link for another shape); a thing that
  // is being solved is not asked for again, so a circle of anchors or links cannot loop: it is cut where it closes.
  const busyGroups = new Set<string>(), busyShapes = new Set<string>()

  // Skin weights (phase O1). A model with none pays nothing: no outline is skinned and every link takes the path it always took.
  const anySkin = skinUse(c)
  // a group's twin, either way round (a group with no twin is its own): a twin shape follows the twins of the groups its original follows
  const twinOfGroup = new Map<string, string>()
  for (const g of c.groups) if (g.mirrorOf && g.mirrorOf !== g.id) { twinOfGroup.set(g.mirrorOf, g.id); twinOfGroup.set(g.id, g.mirrorOf) }
  const twinGroup = (g: string | null): string | null => (g === null ? null : twinOfGroup.get(g) ?? g)
  const restPivots = new Map<string, [number, number]>()
  const restPivotOf = (id: string): [number, number] | null => {
    let p = restPivots.get(id)
    if (!p) { const g = groupMap.get(id); if (!g) return null; p = pivotAtRest(c, g); restPivots.set(id, p) }
    return p
  }
  const isAbove = (a: string, b: string): boolean => {
    const seen = new Set<string>()
    for (let cur = groupMap.get(b)?.parent ?? null; cur !== null && !seen.has(cur); cur = groupMap.get(cur)?.parent ?? null) { if (cur === a) return true; seen.add(cur) }
    return false
  }
  const skinRig: SkinRig = {
    mat: g => (g ? groupMat(g) : IDENTITY),
    turn: g => { if (!g) return 0; groupMat(g); return turns[g] ?? 0 },
    // where two groups meet at rest: the pivot of the lower one when one hangs from the other
    joint: (a, b) => (a === null ? null : isAbove(a, b) ? restPivotOf(b) : isAbove(b, a) ? restPivotOf(a) : null),
  }
  // The rest outline of a skinned shape built as curves in its own space (what a point linked to it is placed on), once per shape.
  const restCurves = new Map<string, BuiltPoint[]>()
  const restBuilt = (id: string, s: SolvedSkin): BuiltPoint[] => {
    let b = restCurves.get(id)
    if (!b) { b = build(s.rest, shapeMap.get(id)?.closed ?? true); restCurves.set(id, b) }
    return b
  }
  // Skins a list of points (in place) and says what was done: the list as it was before, and what each point follows; null when nothing in it is skinned. `source` is the
  // stored outline the list was made from (the weights are read by number when it has as many points as the shape's own outline); `carried` are the points linked to a skinned
  // shape, which follow what that shape's point follows.
  function skinNow(sh: ModelShape, list: ModelPoint[], source: ModelPoint[], carried: Map<number, PointSkin> | null, own: string | null): { rest: ModelPoint[]; pts: Array<PointSkin | null> } | null {
    if (!anySkin) return null
    const inf = influencesFor(sh.skin, sh.pts, source)
    if (!inf.some(l => l.length > 0) && !(carried && carried.size > 0)) return null
    const rest = list.map(copyPoint)
    const pts = list.map((p, i): PointSkin | null => {
      const held = carried?.get(i)
      if (held) return held
      // a point a link has already placed (on a shape that is not skinned) is in this shape's own space as it stands
      if (p.bind && p.bind.s !== sh.id && shapeMap.has(p.bind.s)) return null
      return { base: own, inf: inf[i] ?? [] }
    })
    skinPoints(list, pts, own, skinRig)
    return { rest, pts }
  }

  // The place, size and turn authored fields give a whole shape or a whole object (phase D3c), added up over every field that changes it; the middle they are about is the
  // shape's own, or the object's at rest. The matrix is a scale, then a turn, then a move, whatever order the sliders are in.
  interface Wholly { dx: number; dy: number; sx: number; sy: number; turn: number; curve: number; len: number; flare: number; any: boolean }
  const noChange = (): Wholly => ({ dx: 0, dy: 0, sx: 1, sy: 1, turn: 0, curve: 0, len: 1, flare: 0, any: false })
  // The height the points that hold a lock of hair are at (the mean of the points with no weight), which a length stretches the weighted points away from; null for an outline with
  // no such points.
  const rootOf = (list: ModelPoint[]): number | null => {
    const roots = list.filter(p => !((p.w ?? 0) > 0))
    return roots.length > 0 && roots.length < list.length ? roots.reduce((n, p) => n + p.y, 0) / roots.length : null
  }
  function applyWholly(list: ModelPoint[], w: Wholly, about: [number, number], hang: { root: number | null; span: [number, number, number] | null }) {
    if (!w.any) return
    // length: the weighted points move away from the root height in proportion to their weight (the texture of the edge is drawn, not moved: see texture.ts)
    if (w.len !== 1 && hang.root !== null) for (const p of list) { const k = p.w ?? 0; if (k > 0) p.y += (p.y - hang.root) * (w.len - 1) * k }
    // flare (phase O8): the lower half widens about the middle (of the shape or object at rest), nothing at the middle and the most at the bottom, so every shape of an
    // object flares as one (a jaw and the shadow on it)
    if (w.flare !== 0 && hang.span) {
      const [cx, y0, y1] = hang.span, mid = (y0 + y1) / 2, half = Math.max(1e-6, y1 - mid)
      for (const p of list) {
        const f = 1 + (w.flare / 100) * clamp((p.y - mid) / half, 0, 1)
        p.x = cx + (p.x - cx) * f
        if (p.hi) p.hi = [p.hi[0] * f, p.hi[1]]
        if (p.ho) p.ho = [p.ho[0] * f, p.ho[1]]
      }
    }
    // a curve lifts the two ends of the outline against its middle (the ends are where it is furthest across: a smile for a positive amount), before it is moved or sized
    if (w.curve !== 0 && list.length > 0) {
      let x0 = Infinity, x1 = -Infinity
      for (const p of list) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x) }
      const mid = (x0 + x1) / 2, half = Math.max(1e-6, (x1 - x0) / 2)
      for (const p of list) { const u = (p.x - mid) / half; p.y -= w.curve * Math.min(1.6, u * u) }
    }
    const m = mul(translate(w.dx, w.dy), mul(rotate(w.turn, about[0], about[1]), scale(w.sx, w.sy, about[0], about[1])))
    if (!finiteMat(m)) return
    for (const p of list) {
      const a = apply(m, p.x, p.y)
      p.x = a[0]; p.y = a[1]
      if (p.hi) p.hi = [m[0] * p.hi[0] + m[2] * p.hi[1], m[1] * p.hi[0] + m[3] * p.hi[1]]
      if (p.ho) p.ho = [m[0] * p.ho[0] + m[2] * p.ho[1], m[1] * p.ho[0] + m[3] * p.ho[1]]
    }
  }
  const addWholly = (w: Wholly, prop: string | null | undefined, a: number) => {
    if (prop === 'x') w.dx += a
    else if (prop === 'y') w.dy += a
    else if (prop === 'width') w.sx *= Math.max(0.05, a / 100)
    else if (prop === 'height') w.sy *= Math.max(0.05, a / 100)
    else if (prop === 'rotation') w.turn += a
    else if (prop === 'curve') w.curve += a
    else if (prop === 'length') w.len *= Math.max(0, a / 100)
    else if (prop === 'flare') w.flare += a
    else return
    w.any = true
  }

  // what the sliders do to a list of points (a recorded move, a bend, a scale of the shape, an authored field); `own` is the shape's own outline, which the moves were recorded on
  function drive(sh: ModelShape, list: ModelPoint[], own: ModelPoint[], Mg: Mat) {
    if (list.length < 3) return
    let rest: [number, number] | null = null
    const whole = noChange(), objectWhole = noChange(), ownerId = objectOfShape.get(sh.id)
    for (const r of ranges) {
      const v = val(r), { t, up } = pull(r, v)
      if (t === 0) continue
      for (const d of r.drives) {
        if (d.kind === 'prop' && d.prop && !isPaintProp(d.prop) && !isDrawingProp(d.prop)) {
          const a = propAmount(r, d, v)
          if (d.feature === 'shape' && d.shape === sh.id) addWholly(whole, d.prop, a)
          else if (d.feature === 'object' && d.id && d.id === ownerId) addWholly(objectWhole, d.prop, a)
          else if (d.feature === 'point' && d.shape === sh.id && list.length === own.length) {
            const p = list[d.i ?? 0]
            if (p && d.prop === 'x') p.x += a
            else if (p && d.prop === 'y') p.y += a
          } else if (d.feature === 'edge' && d.shape === sh.id && d.prop === 'offset' && list.length === own.length) {
            // both points of the edge move along its normal, outward (away from the middle of the shape) for a positive amount
            const i = (d.i ?? 0) % list.length, j = (i + 1) % list.length, p = list[i], q = list[j], ex = q.x - p.x, ey = q.y - p.y, len = Math.hypot(ex, ey)
            if (len > 1e-9) {
              const mid = centreOfPoints(own, sh.closed)
              let nx = ey / len, ny = -ex / len
              if (nx * ((p.x + q.x) / 2 - mid[0]) + ny * ((p.y + q.y) / 2 - mid[1]) < 0) { nx = -nx; ny = -ny }
              p.x += nx * a; p.y += ny * a; q.x += nx * a; q.y += ny * a
            }
          }
          continue
        }
        if (d.kind === 'scale' && d.target === 'shape' && d.id === sh.id) {
          rest = rest ?? centreOfPoints(own, sh.closed)
          const f = factorOf(r, d, v), fx = d.axis === 'y' ? 1 : f, fy = d.axis === 'x' ? 1 : f
          for (const p of list) {
            p.x = rest[0] + (p.x - rest[0]) * fx; p.y = rest[1] + (p.y - rest[1]) * fy
            if (p.hi) p.hi = [p.hi[0] * fx, p.hi[1] * fy]
            if (p.ho) p.ho = [p.ho[0] * fx, p.ho[1] * fy]
          }
        } else if (d.kind === 'points' && d.shape === sh.id && list.length === own.length) {
          const moved = new Set(d.moves.map(m => m.i))
          for (const m of d.moves) {
            const p = list[m.i]
            if (!p) continue
            const dx = (up ? m.dx : m.dxMin) * t, dy = (up ? m.dy : m.dyMin) * t
            p.x += dx; p.y += dy
            if (d.sym) {
              const j = twinIndex(own, m.i, axis, 4)
              if (j !== m.i && !moved.has(j)) { list[j].x -= dx; list[j].y += dy }
            }
          }
        } else if (d.kind === 'bend' && d.shape === sh.id && d.pivot) {
          const angle = amount(r, d, v), [px, py] = d.pivot, span = d.y1 - d.y0 || 1
          for (const p of list) {
            let w = clamp((p.y - d.y0) / span, 0, 1)
            w = w * w * (3 - 2 * w)
            if (w <= 0) continue
            const m = rotate(angle * w, px, py), a = apply(m, p.x, p.y)
            p.x = a[0]; p.y = a[1]
            if (p.hi) p.hi = [m[0] * p.hi[0] + m[2] * p.hi[1], m[1] * p.hi[0] + m[3] * p.hi[1]]
            if (p.ho) p.ho = [m[0] * p.ho[0] + m[2] * p.ho[1], m[1] * p.ho[0] + m[3] * p.ho[1]]
          }
        }
      }
    }
    if (whole.any || objectWhole.any) {
      const mine = spanOf(own, sh.closed)
      applyWholly(list, whole, centreOfPoints(own, sh.closed), { root: rootOf(own), span: mine })
      const o = ownerId ? objectMap.get(ownerId) : undefined
      applyWholly(list, objectWhole, (o && objectCentre(o)) ?? centreOfPoints(own, sh.closed), { root: (o && objectRoot(o)) ?? rootOf(own), span: (o && objectSpan(o)) ?? mine })
    }
  }

  // The runs of weighted points hang, from where the other sliders (and the skin) have left them: toward the way things fall, which is a direction in the picture, so it is
  // read back into this shape's own space (a tilted head still lets its hair hang straight down). `sh` is the shape whose fall sliders count; a twin skinned on its own hangs
  // the mirror way.
  function fallNow(sh: ModelShape, list: ModelPoint[], Mg: Mat, mirrored = false) {
    if (list.length < 3) return
    let falling = 0
    for (const r of ranges) for (const d of r.drives) if (d.kind === 'fall' && d.shape === sh.id) falling += amount(r, d, val(r)) / 100
    if (falling > 0 && list.some(p => (p.w ?? 0) > 0)) {
      const inv = inverse(Mg), w0 = hangDirection(fallSide, view === 'back'), w: [number, number] = mirrored ? [-w0[0], w0[1]] : w0
      const dx = inv[0] * w[0] + inv[2] * w[1], dy = inv[1] * w[0] + inv[3] * w[1]
      applyFall(list, sh.closed, Math.min(1, falling), [dx, dy], squeezeOf(fallSide))
    }
  }

  // Whether the skin has moved a point from where it was before (a little more than rounding).
  const movedFrom = (p: ModelPoint | undefined, q: ModelPoint | undefined): boolean => !!p && !!q && Math.hypot(p.x - q.x, p.y - q.y) > 0.01

  // A draped garment's weighted runs hang back toward the way they were drawn (phase O6), from where the body (the pose, the links, the skin) has put them: the drawn way is a
  // direction in the picture, read into this shape's own space now. `sh` is the shape whose object's drape counts (a twin's is its original's); `rest` the points before the body
  // moved them.
  function drapeNow(sh: ModelShape, list: ModelPoint[], rest: ModelPoint[], Mg: Mat) {
    const oid = objectOfShape.get(sh.id), drape = (oid ? objectMap.get(oid)?.drape : 0) ?? 0
    if (!(drape > 0) || list.length < 3 || !list.some(p => (p.w ?? 0) > 0)) return
    const inv = inverse(Mg)
    if (!finiteMat(inv)) return
    applyDrape(list, sh.closed, Math.min(1, drape / 100), rest, (vx, vy) => [inv[0] * vx + inv[2] * vy, inv[1] * vx + inv[3] * vy])
  }

  // Points linked to another shape take its place: on one of its points (plus an offset), or at a spot along one of its edges, some way outward. The
  // target is read where the rig has put it (the model's space) and brought into this shape's group space. Looseness stretches the offsets.
  // A point linked to a skinned shape (phase O1) is placed on that shape's outline before its skin moved it, offsets and all, and is handed back with what that point follows
  // (the returned map): the skin then carries it with the shape, so it stays on the outline and its offset turns with it.
  function link(sh: ModelShape, list: ModelPoint[], Mg: Mat): Map<number, PointSkin> | null {
    if (!list.some(p => p.bind)) return null
    const f = looseFactor(c, sh, values)
    let inv: Mat | null = null
    let carried: Map<number, PointSkin> | null = null
    const leaves = new Map<number, [number, number]>()   // the points that leave along their edge, with the direction of that edge in this shape's space
    for (let k = 0; k < list.length; k++) {
      const p = list[k], b = p.bind
      if (!b || b.s === sh.id) continue
      const target = shapeOut(b.s)
      const a = target?.pre
      if (!target || !a || a.length < 1) continue
      if (target.skin) {
        const rest = restBuilt(b.s, target.skin), m = rest.length
        if (m < 1) continue
        const at = (i: number): PointSkin => target.skin!.pts[i % m] ?? { base: target.group, inf: [] }
        let x: number, y: number, held: PointSkin
        if (b.kind === 'point') { const q = rest[b.i % m]; x = q.x + b.d[0] * f; y = q.y + b.d[1] * f; held = at(b.i) }
        else { [x, y] = edgeAt(rest, windSign(rest), b.e % m, b.t, b.o * f); held = mixSkin(at(b.e), at(b.e + 1), b.t) }
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        p.x = x; p.y = y
        ;(carried ??= new Map()).set(k, held)
        if (b.kind === 'edge' && b.tan) {
          const e = bezierAt(rest, b.e % m, b.t), tl = Math.hypot(e.tx, e.ty)
          if (tl > 1e-9) leaves.set(k, [e.tx / tl, e.ty / tl])
        }
        continue
      }
      const n = a.length
      let wx: number, wy: number
      if (b.kind === 'point') { const q = a[b.i % n]; wx = q.x; wy = q.y }
      else [wx, wy] = edgeAt(a, windSign(a), b.e % n, b.t, b.o * f)
      inv = inv ?? inverse(Mg)
      const [lx, ly] = apply(inv, wx, wy)
      const x = lx + (b.kind === 'point' ? b.d[0] * f : 0), y = ly + (b.kind === 'point' ? b.d[1] * f : 0)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        p.x = x; p.y = y
        if (b.kind === 'edge' && b.tan) {
          const e = bezierAt(a, b.e % n, b.t), tx = inv[0] * e.tx + inv[2] * e.ty, ty = inv[1] * e.tx + inv[3] * e.ty, tl = Math.hypot(tx, ty)
          if (tl > 1e-9) leaves.set(k, [tx / tl, ty / tl])
        }
      }
    }
    if (leaves.size < 2) return carried
    // A side between two such points locked to different shapes (the two ends of a bridge) leaves one part along the direction of its edge and arrives at the
    // other along the direction of its edge, so the outline runs on smoothly through a bend however far the parts have turned.
    const n = list.length
    for (let i = 0; i < (sh.closed ? n : n - 1); i++) {
      const j = (i + 1) % n, ta = leaves.get(i), tb = leaves.get(j)
      if (!ta || !tb || list[i].bind?.s === list[j].bind?.s) continue
      const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, reach = Math.max(0.5, Math.hypot(dx, dy) * BRIDGE_REACH)
      const sa = ta[0] * dx + ta[1] * dy >= 0 ? 1 : -1, sb = tb[0] * -dx + tb[1] * -dy >= 0 ? 1 : -1
      a.ho = [ta[0] * sa * reach, ta[1] * sa * reach]
      b.hi = [tb[0] * sb * reach, tb[1] * sb * reach]
    }
    return carried
  }

  // The outline of a shape that has points of its own: the base outline linked and driven (what the rig reads), and what is drawn: a chosen form's outline in its
  // place, or in the back view the outline of its own for the back. An empty form outline hides the shape in every view. Each is linked, driven by its sliders, moved by its
  // skin weights, draped and then left to hang, in that order. A form whose axis carries what follows it (phase O8, `carry`) is what the rig reads too.
  function plainOutline(sh: ModelShape, Mg: Mat, form: ModelPoint[] | undefined, carry = false): { rig: ModelPoint[]; drawn: ModelPoint[]; skin?: SolvedSkin } {
    const own = groupOfShape.get(sh.id) ?? null
    const outline = (source: ModelPoint[], movesOn: ModelPoint[]) => {
      const list = source.map(copyPoint)
      const carried = link(sh, list, Mg)
      drive(sh, list, movesOn, Mg)
      const before = list.map(copyPoint)
      const skinned = skinNow(sh, list, source, carried, own)
      drapeNow(sh, list, skinned?.rest ?? before, Mg)
      fallNow(sh, list, Mg)
      // the inside of a sharp bend is a clean corner, not a dent
      if (skinned) creaseCorners(list, sh.closed, skinned.rest, i => movedFrom(list[i], skinned.rest[i]))
      return { list, skinned }
    }
    let held = outline(sh.pts, sh.pts)
    let drawn = held.list, other: { list: ModelPoint[]; skinned: ReturnType<typeof skinNow> } | null = null
    if (form) {
      other = outline(form, sh.pts); drawn = other.list
      if (carry && form.length >= 3 && form.length === sh.pts.length) held = other
    }
    if (view === 'back' && sh.back && sh.back.length >= 3 && !(form && form.length === 0)) { other = outline(sh.back, sh.back); drawn = other.list }
    const rig = held.list
    if (!held.skinned) return { rig, drawn }
    return { rig, drawn, skin: { ...held.skinned, ...(other && other !== held ? { drawn: other.skinned } : {}) } }
  }
  const groupMatOf = (shapeId: string): Mat => { const gid = groupOfShape.get(shapeId); return gid ? groupMat(gid) : IDENTITY }

  // The box (in the model's space, before the whole-model transform) a shape is drawn in; its object's fit mode is not counted.
  const boxIn = (s: SolvedShape | undefined): Box | null => {
    if (!s || s.local.length < 3) return null
    const closed = shapeMap.get(s.id)?.closed ?? true
    const poly = flatten(build(s.local, closed, s.frame), closed)
    return poly.length ? boxOf(poly) : null
  }

  // The middle of an object at rest, in its group's space (null when none of its shapes has an outline to take it from).
  function objectCentre(o: ModelObject): [number, number] | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const sid of o.shapes) {
      let s = shapeMap.get(sid)
      if (s && s.pts.length < 3 && s.copyOf) s = shapeMap.get(s.copyOf)   // a shape that follows its pattern lies where the pattern's shape does
      if (!s || s.pts.length < 3) continue
      const b = boxOf(flatten(build(s.pts, s.closed), s.closed))
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    return x1 >= x0 ? [(x0 + x1) / 2, (y0 + y1) / 2] : null
  }

  // The middle across and the top and bottom of a list of points at rest (what a flare widens about), or of an object's shapes at rest (null when none has an outline).
  function spanOf(pts: ModelPoint[], closed: boolean): [number, number, number] | null {
    if (pts.length < 3) return null
    const b = boxOf(flatten(build(pts, closed), closed))
    return [b.x + b.w / 2, b.y, b.y + b.h]
  }
  const objectSpans = new Map<string, [number, number, number] | null>()
  function objectSpan(o: ModelObject): [number, number, number] | null {
    if (objectSpans.has(o.id)) return objectSpans.get(o.id)!
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const sid of o.shapes) {
      let s = shapeMap.get(sid)
      if (s && s.pts.length < 3 && s.copyOf) s = shapeMap.get(s.copyOf)
      if (!s || s.pts.length < 3) continue
      const b = boxOf(flatten(build(s.pts, s.closed), s.closed))
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    const span: [number, number, number] | null = x1 >= x0 ? [(x0 + x1) / 2, y0, y1] : null
    objectSpans.set(o.id, span)
    return span
  }

  // The height an object's hair hangs from: the mean of the points with no weight in its shapes at rest (null when none has any).
  function objectRoot(o: ModelObject): number | null {
    let sum = 0, n = 0
    for (const sid of o.shapes) {
      let s = shapeMap.get(sid)
      if (s && s.pts.length < 3 && s.copyOf) s = shapeMap.get(s.copyOf)
      if (!s || s.pts.length < 3 || !s.pts.some(p => (p.w ?? 0) > 0)) continue
      for (const p of s.pts) if (!((p.w ?? 0) > 0)) { sum += p.y; n++ }
    }
    return n > 0 ? sum / n : null
  }

  // How an object that does not scale with its group is drawn (phase 5a): the matrix that stands in for its group's, or null for an object that does. 'keep'
  // is carried by its group (the middle of the object goes where the group puts it, and it turns as the group does) but is drawn at its own size: the scale and
  // the shear of the group and of the groups above it are taken out. 'stretch' follows the box of another shape: the object is scaled and moved as that box
  // has grown and moved since rest (no turn). Only the drawing changes: anchors and links read the outline as the group holds it. A twin is the mirror image
  // of its original's.
  function fitMatrix(sh: ModelShape): Mat | null {
    if (opts.plain) return null
    const original = sh.mirrorOf && sh.mirrorOf !== sh.id ? shapeMap.get(sh.mirrorOf) : undefined
    if (original && !original.mirrorOf) { const m = fitMatrix(original); return m ? mul(RF, mul(m, RF)) : null }
    const oid = objectOfShape.get(sh.id), o = oid ? objectMap.get(oid) : undefined
    const gid = groupOfShape.get(sh.id)
    if (!o || !gid || !o.fit || o.fit === 'scale') return null
    let m: Mat | null = null
    if (o.fit === 'keep') {
      const Mg = groupMat(gid), pw = out.pivots[gid]
      // the middle of the object (else the pivot of the group) goes where the group's matrix puts it, and only the turn is kept
      const [cx, cy] = objectCentre(o) ?? (pw ? apply(inverse(Mg), pw[0], pw[1]) : [0, 0])
      const [wx, wy] = apply(Mg, cx, cy), th = (turnOf(Mg) * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th)
      m = [cs, sn, -sn, cs, wx - (cs * cx - sn * cy), wy - (sn * cx + cs * cy)]
    } else {
      const target = o.fitTo ? shapeMap.get(o.fitTo) : undefined
      if (!target || objectOfShape.get(target.id) === o.id) return null
      const now = boxIn(shapeOut(target.id)), then = boxIn(plainRest(c).shapes[target.id])
      if (!now || !then) return null
      const kx = then.w > 1e-6 ? clamp(now.w / then.w, 0.05, 20) : 1, ky = then.h > 1e-6 ? clamp(now.h / then.h, 0.05, 20) : 1
      m = [kx, 0, 0, ky, now.x - kx * then.x, now.y - ky * then.y]
    }
    return finiteMat(m) ? m : null
  }

  // How much of a shape shows (a crease fades in with a slider): its own fade, else that of the shape it mirrors or follows; 1 for a shape that does not fade.
  function fadeOf(sh: ModelShape): number {
    const mirrored = sh.mirrorOf && sh.mirrorOf !== sh.id ? shapeMap.get(sh.mirrorOf) : undefined
    const followed = sh.copyOf ? shapeMap.get(sh.copyOf) : undefined
    const f = sh.opBy ?? mirrored?.opBy ?? followed?.opBy
    const r = f ? ranges.find(x => x.id === f.slider) : undefined
    let fade = 1
    if (f && r) {
      const span = f.shown - f.hidden
      fade = Math.abs(span) < 1e-9 ? (val(r) >= f.shown ? 1 : 0) : clamp((val(r) - f.hidden) / span, 0, 1)
    }
    return fade * opacityOf(sh, mirrored, followed)
  }
  // How much of its own opacity a shape keeps, from the authored fields that fade it or its object (a twin and a shape of a member go with the shape they follow).
  const anyOpacityField = ranges.some(r => r.drives.some(d => d.kind === 'prop' && d.prop === 'opacity'))
  function opacityOf(sh: ModelShape, ...others: Array<ModelShape | undefined>): number {
    if (!anyOpacityField) return 1
    const shapeIds = new Set([sh.id]), objectIds = new Set<string>()
    for (const o of others) if (o) shapeIds.add(o.id)
    for (const id of shapeIds) { const oid = objectOfShape.get(id); if (oid) { objectIds.add(oid); const m = objectMap.get(oid)?.mirrorOf; if (m) objectIds.add(m) } }
    let keep = 1
    for (const r of ranges) {
      const v = val(r)
      for (const d of r.drives) {
        if (d.kind !== 'prop' || d.prop !== 'opacity') continue
        if ((d.feature === 'shape' && d.shape && shapeIds.has(d.shape)) || (d.feature === 'object' && d.id && objectIds.has(d.id))) keep *= clamp(propAmount(r, d, v) / 100, 0, 1)
      }
    }
    return keep
  }

  // How much texture the edge of a shape is drawn with (phase O7, the `texture` property of the shape or its object, 0..99; see texture.ts): a twin and a shape of a member
  // go with the shape they follow.
  const textureDrives = ranges.flatMap(r => r.drives.filter(d => d.kind === 'prop' && d.prop === 'texture').map(d => ({ r, d })))
  function textureOf(sh: ModelShape, ...others: Array<ModelShape | undefined>): number {
    if (textureDrives.length === 0) return 0
    const shapeIds = new Set([sh.id]), objectIds = new Set<string>()
    for (const o of others) if (o) shapeIds.add(o.id)
    for (const id of shapeIds) { const oid = objectOfShape.get(id); if (oid) { objectIds.add(oid); const m = objectMap.get(oid)?.mirrorOf; if (m) objectIds.add(m) } }
    let amount = 0
    for (const { r, d } of textureDrives) {
      if ((d.feature === 'shape' && d.shape && shapeIds.has(d.shape)) || (d.feature === 'object' && d.id && objectIds.has(d.id))) amount += propAmount(r, d, val(r))
    }
    return clamp(amount, 0, 99)
  }
  // Whether any shape of the object a shape is in hangs (has points with a weight): a shape with none of its own in such an object (the cap under a lock of hair) is not
  // textured, since its edges are roots, not ends.
  const hangingObjects = new Map<string, boolean>()
  function inHangingObject(sid: string): boolean {
    const oid = objectOfShape.get(sid)
    if (!oid) return false
    let hangs = hangingObjects.get(oid)
    if (hangs === undefined) {
      const o = objectMap.get(oid)
      hangs = !!o && o.shapes.some(id => {
        let s = shapeMap.get(id)
        if (s && s.pts.length < 3 && s.copyOf) s = shapeMap.get(s.copyOf)
        return !!s && s.pts.some(p => (p.w ?? 0) > 0)
      })
      hangingObjects.set(oid, hangs)
    }
    return hangs
  }

  // How far authored fields move a shape in the drawing order (phase O2, the `z` property of the shape or its object): an arm that points away from the viewer drops behind the
  // body. A twin goes with the shape or object it mirrors unless that drive keeps to its own side (`mirror: false`, the two sides posed apart).
  const zDrives = ranges.flatMap(r => r.drives.filter(d => d.kind === 'prop' && d.prop === 'z').map(d => ({ r, d })))
  function zShift(sh: ModelShape): number {
    if (zDrives.length === 0) return 0
    const oid = objectOfShape.get(sh.id), o = oid ? objectMap.get(oid) : undefined
    let shift = 0
    for (const { r, d } of zDrives) {
      const mine = d.feature === 'object' ? !!d.id && (d.id === oid || (d.mirror !== false && d.id === o?.mirrorOf)) : !!d.shape && (d.shape === sh.id || (d.mirror !== false && d.shape === sh.mirrorOf))
      if (mine) shift += propAmount(r, d, val(r))
    }
    return shift
  }

  // Whether any corner of the model is rounded (a shape's own radius, a form's, or a field that adds to it): a model with none pays nothing.
  const anyRound = roundUse(c)
  // The radius the sharp corners of a shape are rounded to (phase D4): its own, or the radius a chosen form gives it, plus what authored fields add (0..ROUND_MAX). A twin
  // goes with the shape it mirrors, and a shape that follows a template with the template's (under the member's own choice of forms).
  function radiusOf(sh: ModelShape, twin: ModelShape | undefined, tpl: ModelShape | undefined, memberId: string | undefined): number {
    if (!anyRound) return 0
    const origin = twin ?? (tpl && sh.pts.length < 3 ? tpl : sh)
    const home = objectOfShape.get(origin.id), homeObject = home ? objectMap.get(home) : undefined
    const look = homeObject ? lookOf(homeObject, origin.id, choices, (origin === tpl ? memberId : undefined) ?? homeObject.id) : undefined
    let radius = look && look.round != null ? look.round : origin.round ?? 0
    const shapes = new Set([sh.id, origin.id]), objects = new Set<string>()
    for (const id of shapes) { const oid = objectOfShape.get(id); if (oid) { objects.add(oid); const m = objectMap.get(oid)?.mirrorOf; if (m) objects.add(m) } }
    for (const r of ranges) {
      const v = val(r)
      for (const d of r.drives) {
        if (d.kind !== 'prop' || d.prop !== 'roundness') continue
        if ((d.feature === 'shape' && d.shape && shapes.has(d.shape)) || (d.feature === 'object' && d.id && objects.has(d.id))) radius += propAmount(r, d, v)
      }
    }
    return clamp(radius, 0, ROUND_MAX)
  }

  function place(sh: ModelShape, groupId: string | null, Mg: Mat) {
    const original = sh.mirrorOf && sh.mirrorOf !== sh.id ? shapeMap.get(sh.mirrorOf) : undefined
    const twin = original && !original.mirrorOf ? original : undefined
    let rig: ModelPoint[], drawn: ModelPoint[], closed = sh.closed, ghost = '', skin: SolvedSkin | undefined
    // a shape of a class member follows a shape of the template; with no points of its own it is drawn as the template's shape is, in the member's own group,
    // under the member's own choice of form
    const followed = !twin && sh.copyOf ? shapeMap.get(sh.copyOf) : undefined
    const tpl = followed && !followed.mirrorOf && !followed.copyOf ? followed : undefined
    const memberObject = tpl ? objectMap.get(objectOfShape.get(sh.id) ?? '') : undefined
    const memberId = memberObject?.classOf ? memberObject.id : undefined
    if (twin) {
      // a twin is the mirror image of its original as the original is drawn: its points are the reflection of the original's (in the group's own space,
      // so a group turned with the original is turned the other way round on the twin's side)
      const o = shapeOut(twin.id)
      if (o?.skin) {
        // a skinned original: the twin reflects the outline before the skin moved it and skins itself with the twin groups (the two sides may be posed apart)
        const mirrored = (s: { rest: ModelPoint[]; pts: Array<PointSkin | null> }) => {
          const list = reflectList(s.rest, axis)
          const pts = [...s.pts].reverse().map(ps => (ps ? { base: twinGroup(ps.base), inf: ps.inf.map(([g, w]): [string, number] => [twinGroup(g) ?? g, w]) } : null))
          skinPoints(list, pts, groupId, skinRig)
          const before = reflectList(s.rest, axis)
          drapeNow(twin, list, before, Mg)
          fallNow(twin, list, Mg, true)
          creaseCorners(list, twin.closed, before, i => movedFrom(list[i], before[i]))
          return { list, pts }
        }
        const r = mirrored(o.skin)
        rig = r.list
        const d = o.skin.drawn
        drawn = d === undefined ? rig : d ? mirrored(d).list : reflectList(o.local, axis)
        skin = { rest: reflectList(o.skin.rest, axis), pts: r.pts }
      } else {
        rig = o ? reflectList(o.rig, axis) : []
        drawn = o ? reflectList(o.local, axis) : []
      }
      closed = twin.closed
    } else if (tpl && sh.pts.length < 3) {
      const o = plainOutline(tpl, groupMatOf(tpl.id), memberForm(tpl.id, memberId), formCarries(tpl.id, memberId))
      rig = o.rig; drawn = o.drawn; closed = tpl.closed; skin = o.skin
    } else {
      // The rig always reads the base outline. A form gives only the drawn outline (it still gets the shape's links and, when it has as many points as the
      // base, its recorded moves); an empty one hides the shape in every view.
      const o = plainOutline(sh, Mg, tpl ? memberForm(tpl.id, memberId) : formOutline(sh.id), tpl ? formCarries(tpl.id, memberId) : formCarries(sh.id))
      rig = o.rig; drawn = o.drawn; skin = o.skin
      if (tpl) {
        const g = plainOutline(tpl, groupMatOf(tpl.id), memberForm(tpl.id, memberId)).drawn
        ghost = g.length >= 3 ? pathText(build(g, tpl.closed, mul(G, Mg)), tpl.closed) : ''
      }
    }
    const ok = rig.length >= 3 && drawn.length >= 3
    const matrix = mul(G, (ok ? fitMatrix(sh) : null) ?? Mg)
    const off = switchedOff(sh.id)
    // the corners are rounded in the drawing only: `local` and `rig` keep the points as they were drawn, so editing, anchors and links are not affected
    const radius = ok ? radiusOf(sh, twin, tpl, memberId) : 0
    const shown = ok && radius > 0 ? roundCorners(drawn, closed, radius) : drawn
    const fin = ok ? build(shown, closed, matrix) : []
    const poly = ok ? flatten(fin, closed) : []
    // the texture of the edge is in the painted path only: the outline that hit tests and boxes read stays smooth
    const texture = ok ? textureOf(sh, twin, tpl) : 0, origin = twin ?? tpl ?? sh
    const textured = texture > 0 && (shown.some(p => (p.w ?? 0) > 0) || !inHangingObject(origin.id))
    const d = !ok ? '' : textured ? texturedPath(fin, closed, shown.map(p => p.w), texture, origin.id) : pathText(fin, closed)
    out.shapes[sh.id] = {
      id: sh.id, group: groupId, local: drawn, rig, matrix, frame: Mg, ghost,
      pre: rig.length >= 3 ? build(rig, closed, Mg) : [],   // from the base outline even where a form hides the shape: anchors and links still read it
      d, poly, box: poly.length ? boxOf(poly) : NO_BOX,
      visible: ok && (sh.view === 'both' || sh.view === view) && !off && !sh.hide, off, fade: fadeOf(sh), z: (view === 'back' && sh.zBack != null ? sh.zBack : sh.z) + zShift(sh),
      ...(skin ? { skin } : {}),
    }
  }

  function shapeOut(id: string): SolvedShape | undefined {
    const done = out.shapes[id]
    if (done) return done
    const sh = shapeMap.get(id)
    if (!sh || busyShapes.has(id)) return undefined
    busyShapes.add(id)
    const gid = groupOfShape.get(id) ?? null
    place(sh, gid, gid ? groupMat(gid) : IDENTITY)
    busyShapes.delete(id)
    return out.shapes[id]
  }

  // What a group does on top of where its parent and its anchor put it: its matrix and its pivot (in the parent's frame, before the group's own movement), with
  // `forTwin` leaving out the drives that a twin does not follow (a drive with `mirror: false`: the two sides are posed apart).
  // The matrix a group hangs from: its parent's, or for a parent that is foreshortened the parent's matrix without that, moved so that the group's joint `pv` is where the
  // shortened parent puts it (the group is carried, not squashed).
  function carryFor(parentId: string, pv: [number, number]): Mat {
    const D = groupMat(parentId), B = bares[parentId]
    if (!B) return D
    const [dx, dy] = apply(D, pv[0], pv[1]), [bx, by] = apply(B, pv[0], pv[1])
    return mul(translate(dx - bx, dy - by), B)
  }

  function movement(g: ModelGroup, forTwin: boolean): { Mg: Mat; bare: Mat | null; pw2: [number, number]; an: [number, number] | null; angle: number } {
    const id = g.id
    const pv = g.pivot ?? restPivot(c, g)
    const pm = g.parent ? carryFor(g.parent, pv) : IDENTITY
    let bm = pm
    let an: [number, number] | null = null
    if (g.attach) {
      const target = shapeOut(g.attach.shape)
      an = anchorFrom(c, target ? { [g.attach.shape]: target } : {}, g.attach, values)
      if (an) { const pw = apply(pm, pv[0], pv[1]); bm = mul(translate(an[0] - pw[0], an[1] - pw[1]), pm) }
    }
    const pw2 = apply(bm, pv[0], pv[1])
    let angle = 0, sx = 1, sy = 1
    // a bone starting at this group is stretched along its own rest direction (as the parent holds it now), about the pivot; all the groups that hang from
    // this one follow, since they stand in this group's matrix
    let lengthen = bm
    let depth: Mat | null = null
    for (const r of ranges) for (const d of r.drives) {
      if (forTwin && d.mirror === false) continue
      if (d.kind === 'turn' && d.group === id) angle += amount(r, d, val(r))
      else if (d.kind === 'scale' && d.target === 'group' && d.id === id) {
        const f = factorOf(r, d, val(r))
        if (d.axis !== 'y') sx *= f
        if (d.axis !== 'x') sy *= f
      } else if (d.kind === 'length' && d.id) {
        const bone = boneMap.get(d.id)
        const rest = bone && bone.start === id ? boneAtRest(c, bone) : null
        if (!rest) continue
        const vx = rest.b[0] - rest.a[0], vy = rest.b[1] - rest.a[1]
        const ux = bm[0] * vx + bm[2] * vy, uy = bm[1] * vx + bm[3] * vy, len = Math.hypot(ux, uy)
        if (len > 1e-6) lengthen = mul(scaleAlong(factorOf(r, d, val(r)), ux / len, uy / len, pw2[0], pw2[1]), lengthen)
      } else if (d.kind === 'depth' && d.id && !d.group) {
        // the bone points toward the viewer or away: the group is drawn shorter along the bone (as the parent holds it now) and a little wider or narrower across it,
        // about its joint; what hangs from it is carried to the shortened end, not squashed (a drive with a group of its own poses the twin of the bone's group)
        const bone = boneMap.get(d.id)
        const rest = bone && bone.start === id ? boneAtRest(c, bone) : null
        if (!rest) continue
        const vx = rest.b[0] - rest.a[0], vy = rest.b[1] - rest.a[1]
        const ux = bm[0] * vx + bm[2] * vy, uy = bm[1] * vx + bm[3] * vy, len = Math.hypot(ux, uy)
        if (len > 1e-6) depth = mul(foreshorten(amount(r, d, val(r)), ux / len, uy / len, pw2[0], pw2[1]), depth ?? IDENTITY)
      }
    }
    const R = rotate(angle, pw2[0], pw2[1]), S = scale(sx, sy, pw2[0], pw2[1])
    if (!depth) return { Mg: mul(R, mul(S, lengthen)), bare: null, pw2, an, angle }
    return { Mg: mul(R, mul(S, mul(depth, lengthen))), bare: mul(R, mul(S, lengthen)), pw2, an, angle }
  }
  // Whether a group has drives that its twin does not follow.
  const apartFrom = (id: string): boolean => ranges.some(r => r.drives.some(d => d.mirror === false && ((d.kind === 'turn' && d.group === id) || (d.kind === 'scale' && d.target === 'group' && d.id === id) || d.kind === 'length' || (d.kind === 'depth' && !d.group))))

  function groupMat(id: string): Mat {
    const done = out.mats[id]
    if (done) return done
    const g = groupMap.get(id)
    if (!g || busyGroups.has(id)) return IDENTITY
    busyGroups.add(id)
    const original = g.mirrorOf && g.mirrorOf !== id ? groupMap.get(g.mirrorOf) : undefined
    let Mg: Mat
    if (original && !original.mirrorOf) {
      // A twin group does what its original does, mirrored, from where its own parent stands: the original's movement relative to its parent (turned,
      // scaled, moved by its anchor), reflected about the axis, applied in the twin's parent's frame. With the same parent for both (the torso), a lean of
      // the torso carries both arms alike; with twin parents (left arm and forearm) it is the plain reflection of the original. The drives of the original that
      // do not mirror are left out, and the twin may have drives of its own (phase 5c): what the same slider would do to the original, as a mirror image
      // (a turn the other way round about the twin's own pivot), so the two sides are posed apart while the drawing stays mirrored.
      const pvo = original.pivot ?? restPivot(c, original), pvt: [number, number] = [2 * axis - pvo[0], pvo[1]]
      const Mpo = original.parent ? carryFor(original.parent, pvo) : IDENTITY
      const Mpt = g.parent ? carryFor(g.parent, pvt) : IDENTITY
      const apart = apartFrom(original.id) ? movement(original, true) : null
      const Mo = apart ? apart.Mg : groupMat(original.id)
      const mirrorIn = (m: Mat): Mat => mul(Mpt, mul(RF, mul(inverse(Mpo), mul(m, RF))))
      Mg = mirrorIn(Mo)
      // without the foreshortening: the original's, mirrored, for what hangs from the twin
      const Bo = apart ? apart.bare : bares[original.id] ?? null
      let B: Mat | null = Bo ? mirrorIn(Bo) : null
      // the whole turn: the twin's parent's, less the original's own turn (a mirror turns the other way round)
      const Tpo = original.parent ? turns[original.parent] ?? 0 : 0, Tpt = g.parent ? turns[g.parent] ?? 0 : 0
      const To = apart ? Tpo + apart.angle : turns[original.id] ?? Tpo
      turns[id] = Tpt - (To - Tpo)
      const po = out.pivots[original.id]
      const pw = po ? apply(Mpt, ...apply(RF, ...apply(inverse(Mpo), po[0], po[1]))) : [axis, 200]
      out.pivots[id] = [pw[0], pw[1]]
      out.anchors[id] = null
      let angle = 0, sx = 1, sy = 1
      let depth: Mat | null = null
      for (const r of ranges) for (const d of r.drives) {
        if (d.kind === 'turn' && d.group === id) angle += amount(r, d, val(r))
        else if (d.kind === 'scale' && d.target === 'group' && d.id === id) {
          const f = factorOf(r, d, val(r))
          if (d.axis !== 'y') sx *= f
          if (d.axis !== 'x') sy *= f
        } else if (d.kind === 'depth' && d.group === id && d.id) {
          // the twin's own foreshortening (the two sides posed apart): along the mirror image of the bone, as the twin is held now
          const bone = boneMap.get(d.id)
          const rest = bone && bone.start === original.id ? boneAtRest(c, bone) : null
          if (!rest) continue
          const vx = -(rest.b[0] - rest.a[0]), vy = rest.b[1] - rest.a[1]
          const ux = Mg[0] * vx + Mg[2] * vy, uy = Mg[1] * vx + Mg[3] * vy, len = Math.hypot(ux, uy)
          if (len > 1e-6) depth = mul(foreshorten(amount(r, d, val(r)), ux / len, uy / len, pw[0], pw[1]), depth ?? IDENTITY)
        }
      }
      if (depth) { B = B ?? Mg; Mg = mul(depth, Mg) }
      if (angle !== 0 || sx !== 1 || sy !== 1) {
        const R = rotate(-angle, pw[0], pw[1]), S = scale(sx, sy, pw[0], pw[1])
        Mg = mul(R, mul(S, Mg))
        if (B) B = mul(R, mul(S, B))
      }
      if (B && finiteMat(B)) bares[id] = B
      turns[id] -= angle
    } else {
      const m = movement(g, false)
      Mg = m.Mg
      if (m.bare && finiteMat(m.bare)) bares[id] = m.bare
      out.pivots[id] = [m.pw2[0], m.pw2[1]]
      out.anchors[id] = g.attach ? m.an : null
      turns[id] = (g.parent ? turns[g.parent] ?? 0 : 0) + m.angle
    }
    if (!finiteMat(Mg)) Mg = IDENTITY
    out.mats[id] = Mg
    busyGroups.delete(id)
    return Mg
  }

  for (const g of groupOrder(c)) groupMat(g.id)
  for (const sh of c.shapes) shapeOut(sh.id)   // a shape in no group stands still

  const visible = Object.values(out.shapes).filter(s => s.visible)
  out.order = drawOrder(c, visible.map(s => ({ id: s.id, z: s.z })), undefined, opts.order, opts.zoff).map(s => s.id)
  return out
}

// The solved model with every slider at rest.
export const solveAtRest = (c: ModelContent, view: View = 'front'): Solved => solve(c, defaultValues(c), view)
