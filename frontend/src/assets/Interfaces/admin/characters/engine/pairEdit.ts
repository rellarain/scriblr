import type { ModelAttach, ModelBind, ModelContent, ModelDrive, ModelObject, ModelPoint, ModelShape } from '../../../../../api/types'
import { NAME_MAX, addShape, freshId, groupById, groupOfObject, objectById, objectOfShape, outlineSize, randomId, shapeById, twinsOf, type MakeId } from '../modelContent'
import { IDENTITY, apply, boxOf, clamp, inverse, nearestEdge, r2, reflectList, transformList, twinIndex, type Mat } from './geometry'
import { LIMITS, linkCount } from './limits'
import { descendantsOf, restPivot, solveAtRest, type Solved } from './rig'
import { attachGroup, done, fail, type Edit } from './rigEdit'
import { drawOrder } from './order'

// The pure operations behind pairs, point links and the back view: making a twin of a shape, an object or a group (a derived mirror image that follows
// every edit of the original) and breaking the pair into two independent things; welding or following a point, or locking it to the edge of another shape
// (clothes that follow the body); giving a shape an outline of its own for the back view; and moving a shape in front of or behind its neighbour in one view.
// Each returns new content (or why it cannot) and leaves the content it was given alone.

export type PairKind = 'shape' | 'object' | 'group'
const twinName = (name: string) => `${name.trim() || 'Untitled'} (twin)`.slice(0, NAME_MAX)
const label = (name: string, id: string) => name || id
const owns = (c: ModelContent, kind: PairKind, id: string): boolean => (kind === 'shape' ? !!shapeById(c, id) : kind === 'object' ? !!objectById(c, id) : !!groupById(c, id))

// ---- making a twin ----

function twinShape(src: ModelShape, id: string): ModelShape {
  return { id, name: twinName(src.name), closed: src.closed, z: src.z, op: src.op, view: src.view, pts: [], half: 0, template: src.template ?? null, mirrorOf: src.id, back: null, zBack: src.zBack ?? null, loose: null }
}

// Why a shape, object or group cannot be given a twin (or null when it can): it is a twin, has one, or holds something that does.
function untwinnable(c: ModelContent, kind: PairKind, id: string): string | null {
  if (kind === 'shape') {
    const s = shapeById(c, id)
    if (!s) return 'There is no such shape.'
    if (s.mirrorOf) return `${label(s.name, s.id)} is a twin already.`
    if (twinsOf(c, 'shape', id).length) return `${label(s.name, s.id)} already has a twin.`
    if (outlineSize(c, s) < 3) return `${label(s.name, s.id)} has no outline yet: draw it first.`
    return null
  }
  if (kind === 'object') {
    const o = objectById(c, id)
    if (!o) return 'There is no such object.'
    if (o.mirrorOf) return `${label(o.name, o.id)} is a twin already.`
    if (twinsOf(c, 'object', id).length) return `${label(o.name, o.id)} already has a twin.`
    for (const sid of o.shapes) {
      const s = shapeById(c, sid)
      if (s && (s.mirrorOf || twinsOf(c, 'shape', sid).length)) return `${label(s.name, s.id)}, in ${label(o.name, o.id)}, is a twin or has one already.`
    }
    return null
  }
  const g = groupById(c, id)
  if (!g) return 'There is no such group.'
  if (g.mirrorOf) return `${label(g.name, g.id)} is a twin already.`
  if (twinsOf(c, 'group', id).length) return `${label(g.name, g.id)} already has a twin.`
  for (const oid of g.objects) {
    const why = untwinnable(c, 'object', oid)
    if (why) return why
  }
  return null
}

function twinObject(c: ModelContent, o: ModelObject, groupId: string, make: MakeId): ModelContent {
  const id = freshId(c, 'o', make)
  let next: ModelContent = {
    ...c,
    objects: [...c.objects, { id, name: twinName(o.name), layer: o.layer, shapes: [], mirrorOf: o.id }],
    groups: c.groups.map(g => {
      if (g.id !== groupId) return g
      const at = g.objects.indexOf(o.id)
      return { ...g, objects: at >= 0 ? [...g.objects.slice(0, at + 1), id, ...g.objects.slice(at + 1)] : [...g.objects, id] }
    }),
  }
  for (const sid of o.shapes) {
    const s = shapeById(next, sid)
    if (s && outlineSize(next, s) >= 3) next = addShape(next, id, twinShape(s, freshId(next, 's', make)))
  }
  return next
}

// Give a shape, an object (with its shapes) or a group (with everything in it and under it) a twin: a derived mirror image about the model's axis, with no
// points of its own, that follows every edit of the original and every slider that moves it. The twin of a group hangs from the twin of the group's
// parent when that is twinned in the same go, and from the same parent otherwise.
export function makeTwin(c: ModelContent, kind: PairKind, id: string, make: MakeId = randomId): Edit {
  if (!owns(c, kind, id)) return fail(`There is no such ${kind}.`)
  if (kind === 'shape') {
    const why = untwinnable(c, 'shape', id)
    if (why) return fail(why)
    const owner = objectOfShape(c, id)
    if (!owner) return fail('The shape is not in an object.')
    if (c.shapes.length >= LIMITS.shapesMax) return fail(`A model may have at most ${LIMITS.shapesMax} shapes.`)
    if (owner.shapes.length >= LIMITS.shapesPerObjectMax) return fail(`An object may have at most ${LIMITS.shapesPerObjectMax} shapes.`)
    return done(addShape(c, owner.id, twinShape(shapeById(c, id)!, freshId(c, 's', make)), id))
  }
  if (kind === 'object') {
    const why = untwinnable(c, 'object', id)
    if (why) return fail(why)
    const o = objectById(c, id)!, g = groupOfObject(c, id)
    if (!g) return fail('The object is not in a group.')
    if (g.objects.length >= LIMITS.objectsPerGroupMax) return fail(`A group may have at most ${LIMITS.objectsPerGroupMax} objects.`)
    if (c.objects.length >= LIMITS.objectsMax) return fail(`A model may have at most ${LIMITS.objectsMax} objects.`)
    if (c.shapes.length + o.shapes.length > LIMITS.shapesMax) return fail(`A model may have at most ${LIMITS.shapesMax} shapes.`)
    return done(twinObject(c, o, g.id, make))
  }
  // a group: itself and every group under it, parents first
  const ids = [id, ...descendantsOf(c, id)]
  for (const gid of ids) {
    const why = untwinnable(c, 'group', gid)
    if (why) return fail(why)
  }
  const objects = ids.reduce((n, gid) => n + groupById(c, gid)!.objects.length, 0)
  const shapes = ids.reduce((n, gid) => n + groupById(c, gid)!.objects.reduce((m, oid) => m + (objectById(c, oid)?.shapes.length ?? 0), 0), 0)
  if (c.groups.length + ids.length > LIMITS.groupsMax) return fail(`A model may have at most ${LIMITS.groupsMax} groups.`)
  if (c.objects.length + objects > LIMITS.objectsMax) return fail(`A model may have at most ${LIMITS.objectsMax} objects.`)
  if (c.shapes.length + shapes > LIMITS.shapesMax) return fail(`A model may have at most ${LIMITS.shapesMax} shapes.`)
  const twinOfGroup = new Map<string, string>()
  let next = c
  for (const gid of ids) {
    const g = groupById(c, gid)!
    const ng = freshId(next, 'g', make)
    twinOfGroup.set(gid, ng)
    next = { ...next, groups: [...next.groups, { id: ng, name: twinName(g.name), parent: (g.parent && twinOfGroup.get(g.parent)) || g.parent, objects: [], pivot: null, attach: null, mirrorOf: gid }] }
    for (const oid of g.objects) {
      const o = objectById(c, oid)
      if (o) next = twinObject(next, o, ng, make)
    }
  }
  return done(next)
}

// ---- breaking a pair ----

const mirrorMove = (m: ModelDrive['moves'][number], n: number) => ({ i: n - 1 - m.i, dx: -m.dx, dy: m.dy, dxMin: -m.dxMin, dyMin: m.dyMin })

// The sliders that moved a shape also move its (now independent) twin: the same drives, mirrored (the angle of a bend turns the other way, a recorded
// point moves the other way across, the points are numbered from the other end because a twin's outline runs the other way round).
function mirrorShapeDrives(c: ModelContent, originalId: string, twinId: string, size: number): ModelContent {
  const axis = c.axis ?? 100
  return {
    ...c,
    ranges: c.ranges.map(r => {
      const extra: ModelDrive[] = []
      for (const d of r.drives) {
        if (d.kind === 'points' && d.shape === originalId) extra.push({ ...d, shape: twinId, moves: d.moves.map(m => mirrorMove(m, size)) })
        else if (d.kind === 'bend' && d.shape === originalId) extra.push({ ...d, shape: twinId, pivot: d.pivot ? [r2(2 * axis - d.pivot[0]), d.pivot[1]] : null, atMin: -d.atMin, atMax: -d.atMax })
        else if (d.kind === 'scale' && d.target === 'shape' && d.id === originalId) extra.push({ ...d, id: twinId })
      }
      return extra.length && r.drives.length + extra.length <= LIMITS.drivesMax ? { ...r, drives: [...r.drives, ...extra] } : r
    }),
  }
}

function breakShape(c: ModelContent, id: string): Edit {
  const s = shapeById(c, id)
  if (!s || !s.mirrorOf) return fail('That shape is not a twin.')
  const axis = c.axis ?? 100, orig = shapeById(c, s.mirrorOf)
  if (!orig || orig.mirrorOf) return done({ ...c, shapes: c.shapes.map(x => (x.id === id ? { ...x, mirrorOf: null } : x)) }, 'Its original is missing, so it has no outline until you draw one.')
  const rest = solveAtRest(c), o = rest.shapes[orig.id]
  const pts: ModelPoint[] = o ? reflectList(o.rig, axis) : []
  let back: ModelPoint[] | null = null
  if (orig.back && orig.back.length >= 3) {
    const ob = solveAtRest(c, 'back').shapes[orig.id]
    if (ob && ob.local.length >= 3) back = reflectList(ob.local, axis)
  }
  const linked = orig.pts.some(p => p.bind)
  let next: ModelContent = { ...c, shapes: c.shapes.map(x => (x.id === id ? { ...x, mirrorOf: null, pts, back, half: 0 } : x)) }
  next = mirrorShapeDrives(next, orig.id, id, pts.length)
  return done(next, linked ? 'Its point links are not copied: link its points again.' : undefined)
}

function breakObject(c: ModelContent, id: string): Edit {
  const o = objectById(c, id)
  if (!o || !o.mirrorOf) return fail('That object is not a twin.')
  let next = c
  const notes: string[] = []
  for (const sid of o.shapes) {
    if (!shapeById(next, sid)?.mirrorOf) continue
    const e = breakShape(next, sid)
    if (!e.ok) return e
    next = e.content
    if (e.note) notes.push(e.note)
  }
  next = { ...next, objects: next.objects.map(x => (x.id === id ? { ...x, mirrorOf: null } : x)) }
  return done(next, notes[0])
}

// The anchor of a twin, mirrored: where on the twin of the original's target shape it is fixed (the same point, edge or place, counted from the other end),
// or, when the target is its own mirror image (a symmetric torso), the place that mirrors the original's. Null when no such place can be found.
export function mirrorAttach(c: ModelContent, att: ModelAttach): ModelAttach | null {
  const axis = c.axis ?? 100, target = shapeById(c, att.shape)
  if (!target) return null
  const partner = target.mirrorOf ? shapeById(c, target.mirrorOf) : c.shapes.find(s => s.mirrorOf === target.id)
  const n = outlineSize(c, target)
  if (partner) {
    const base = { ...att, shape: partner.id }
    if (att.kind === 'point') return { ...base, i: n - 1 - att.i }
    if (att.kind === 'edge' || att.kind === 'range') return { ...base, i: (2 * n - 2 - att.i) % n, t: r2(1 - att.t) }
    return { ...base, rx: r2(1 - att.rx) }
  }
  const pts = target.pts
  if (att.kind === 'inside') {
    const bb = boxOf(pts.map((p): [number, number] => [p.x, p.y]))
    return Math.abs(bb.x + bb.w / 2 - axis) > 3 ? null : { ...att, rx: r2(1 - att.rx) }
  }
  if (att.kind === 'point') {
    const j = twinIndex(pts, att.i, axis, 6)
    return j === att.i && Math.abs(pts[att.i].x - axis) > 6 ? null : { ...att, i: j }
  }
  const a = twinIndex(pts, (att.i + 1) % n, axis, 6), b = twinIndex(pts, att.i, axis, 6)
  return (a + 1) % n === b ? { ...att, i: a, t: r2(1 - att.t) } : null
}

function breakGroup(c: ModelContent, id: string): Edit {
  const first = groupById(c, id)
  if (!first || !first.mirrorOf) return fail('That group is not a twin.')
  // a twinned limb is broken as a whole: this group and the twin groups under it (so no anchor is left pointing at a pair that is gone)
  const ids = [id, ...[...descendantsOf(c, id)].filter(gid => groupById(c, gid)?.mirrorOf)]
  // every anchor is mirrored now, while the twin shapes still say which shape is the other's mirror
  const anchors = new Map<string, ModelAttach | null>()
  for (const gid of ids) {
    const orig = groupById(c, groupById(c, gid)!.mirrorOf!)
    anchors.set(gid, orig?.attach ? mirrorAttach(c, orig.attach) : null)
  }
  const axis = c.axis ?? 100
  const notes: string[] = []
  let next = c
  for (const gid of ids) {
    const g = groupById(next, gid)!, orig = groupById(next, g.mirrorOf ?? '')
    for (const oid of g.objects) {
      if (!objectById(next, oid)?.mirrorOf) continue
      const e = breakObject(next, oid)
      if (!e.ok) return e
      next = e.content
      if (e.note) notes.push(e.note)
    }
    if (!orig || orig.mirrorOf) { next = { ...next, groups: next.groups.map(x => (x.id === gid ? { ...x, mirrorOf: null } : x)) }; continue }
    // the twin's own rig: the mirrored pivot, and the sliders that turn and scale the original, turning and scaling it too (the other way round)
    const pv = orig.pivot ?? restPivot(c, orig)
    next = {
      ...next,
      groups: next.groups.map(x => (x.id === gid ? { ...x, mirrorOf: null, pivot: [r2(2 * axis - pv[0]), pv[1]] } : x)),
      ranges: next.ranges.map(r => {
        const extra: ModelDrive[] = []
        for (const d of r.drives) {
          if (d.kind === 'turn' && d.group === orig.id) extra.push({ ...d, group: gid, atMin: -d.atMin, atMax: -d.atMax })
          else if (d.kind === 'scale' && d.target === 'group' && d.id === orig.id) extra.push({ ...d, id: gid })
        }
        return extra.length && r.drives.length + extra.length <= LIMITS.drivesMax ? { ...r, drives: [...r.drives, ...extra] } : r
      }),
    }
  }
  for (const gid of ids) {
    const original = groupById(c, groupById(c, gid)!.mirrorOf!)
    if (!original?.attach) continue
    const att = anchors.get(gid)
    const e = att ? attachGroup(next, gid, att) : null
    if (e?.ok) next = e.content
    else notes.push('Its anchor could not be mirrored: attach it to a shape again.')
  }
  return done(next, notes[0])
}

// Break a pair: the twin becomes a shape, object or group of its own, drawn as it was a moment ago, that can be edited by itself. Its sliders are copied
// mirrored; its point links are not. A twin group is broken with the twin groups under it.
export function breakPair(c: ModelContent, kind: PairKind, id: string): Edit {
  return kind === 'shape' ? breakShape(c, id) : kind === 'object' ? breakObject(c, id) : breakGroup(c, id)
}

// ---- point links ----

// Where the point of a solved shape stands in the model's space (before the whole-model transform), and the group matrix that takes its own space there.
const frameOf = (solved: Solved, shapeId: string): Mat => {
  const group = solved.shapes[shapeId]?.group
  return (group ? solved.mats[group] : undefined) ?? IDENTITY
}

function reaches(c: ModelContent, from: string, goal: string): boolean {
  const seen = new Set<string>(), stack = [from]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === goal) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const p of shapeById(c, cur)?.pts ?? []) if (p.bind) stack.push(p.bind.s)
  }
  return false
}

function checkLink(c: ModelContent, shapeId: string, i: number, targetId: string): { shape: ModelShape } | string {
  const s = shapeById(c, shapeId)
  if (!s) return 'There is no such shape.'
  if (s.mirrorOf) return 'A twin has no points of its own: link the original\'s points, or break the pair.'
  if (!s.pts[i]) return 'There is no such point.'
  if (targetId === shapeId) return 'A point cannot be linked to its own shape.'
  const target = shapeById(c, targetId)
  if (!target || outlineSize(c, target) < 3) return 'Pick a shape with an outline.'
  if (reaches(c, targetId, shapeId)) return 'That would make the links go round in a circle.'
  if (!s.pts[i].bind && linkCount(c) >= LIMITS.linksMax) return `A model may have at most ${LIMITS.linksMax} point links.`
  return { shape: s }
}

const setPoint = (c: ModelContent, shapeId: string, i: number, change: (p: ModelPoint) => ModelPoint): ModelContent =>
  ({ ...c, shapes: c.shapes.map(s => (s.id === shapeId ? { ...s, pts: s.pts.map((p, k) => (k === i ? change(p) : p)) } : s)) })

// Link point `i` of a shape to the point of `targetId` nearest the place (x, y) (in the model's space): a weld sits exactly on it; a follow keeps the
// point where it is and moves with the target from there.
export function linkToPoint(c: ModelContent, shapeId: string, i: number, targetId: string, x: number, y: number, mode: 'weld' | 'follow'): Edit {
  const ok = checkLink(c, shapeId, i, targetId)
  if (typeof ok === 'string') return fail(ok)
  const rest = solveAtRest(c), t = rest.shapes[targetId], f = rest.shapes[shapeId]
  if (!t || t.pre.length < 3 || !f) return fail('That shape cannot be found.')
  let best = 0, bd = Infinity
  t.pre.forEach((p, k) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = k } })
  const inv = inverse(frameOf(rest, shapeId)), here = f.rig[i], there = apply(inv, t.pre[best].x, t.pre[best].y)
  const d: [number, number] = mode === 'weld' ? [0, 0] : [r2(clamp(here.x - there[0], -200, 200)), r2(clamp(here.y - there[1], -200, 200))]
  const bind: ModelBind = { kind: 'point', s: targetId, i: best, d, e: 0, t: 0, o: 0 }
  return done(setPoint(c, shapeId, i, p => ({ ...p, x: r2(there[0] + d[0]), y: r2(there[1] + d[1]), bind })))
}

// Lock point `i` of a shape to the edge of `targetId` nearest the place (x, y) (in the model's space), as far outward as that place is: clothes that
// follow the body's edge, whatever turns it.
export function linkToEdge(c: ModelContent, shapeId: string, i: number, targetId: string, x: number, y: number): Edit {
  const ok = checkLink(c, shapeId, i, targetId)
  if (typeof ok === 'string') return fail(ok)
  const rest = solveAtRest(c), t = rest.shapes[targetId], f = rest.shapes[shapeId]
  if (!t || t.pre.length < 3 || !f) return fail('That shape cannot be found.')
  const hit = nearestEdge(transformList(t.rig, frameOf(rest, targetId)), x, y)
  if (!hit) return fail('That shape has no edge to lock to.')
  const bind: ModelBind = { kind: 'edge', s: targetId, i: 0, d: [0, 0], e: hit.e, t: r2(hit.t), o: r2(clamp(hit.o, -100, 100)) }
  const [lx, ly] = apply(inverse(frameOf(rest, shapeId)), hit.x + hit.nx * bind.o, hit.y + hit.ny * bind.o)
  return done(setPoint(c, shapeId, i, p => ({ ...p, x: r2(lx), y: r2(ly), bind })))
}

// Cut a link: the point stays where it is drawn now.
export function unlinkPoint(c: ModelContent, shapeId: string, i: number): ModelContent {
  const here = solveAtRest(c).shapes[shapeId]?.rig[i]
  return setPoint(c, shapeId, i, p => (p.bind ? { ...p, x: here ? r2(here.x) : p.x, y: here ? r2(here.y) : p.y, bind: null } : p))
}

// Move what a link does one step: how far outward an edge lock sits, where along the edge, or the offset of a follow (a unit for a distance, a
// fiftieth of the edge for a spot; five times that when `big`).
export function stepLink(c: ModelContent, shapeId: string, i: number, field: 'o' | 't' | 'dx' | 'dy', dir: -1 | 1, big = false): ModelContent {
  return setPoint(c, shapeId, i, p => {
    const b = p.bind
    if (!b) return p
    const k = big ? 5 : 1
    if (field === 'o') return { ...p, bind: { ...b, o: r2(clamp(b.o + dir * k, -100, 100)) } }
    if (field === 't') return { ...p, bind: { ...b, t: r2(clamp(b.t + dir * 0.02 * k, 0, 1)) } }
    return { ...p, bind: { ...b, d: field === 'dx' ? [r2(clamp(b.d[0] + dir * k, -200, 200)), b.d[1]] : [b.d[0], r2(clamp(b.d[1] + dir * k, -200, 200))] } }
  })
}

// Cut every link that points at a shape: when its points are renumbered (one added or deleted), the numbers the links hold are no longer true. Each point
// stays where it is drawn now. Returns the names of the shapes that lost a link.
export function clearLinksTo(c: ModelContent, shapeId: string): { content: ModelContent; cut: string[] } {
  if (!c.shapes.some(s => s.pts.some(p => p.bind?.s === shapeId))) return { content: c, cut: [] }
  const rest = solveAtRest(c), cut: string[] = []
  const shapes = c.shapes.map(s => {
    if (!s.pts.some(p => p.bind?.s === shapeId)) return s
    cut.push(label(s.name, s.id))
    const drawn = rest.shapes[s.id]?.rig
    return { ...s, pts: s.pts.map((p, i) => (p.bind?.s === shapeId ? { ...p, x: drawn?.[i] ? r2(drawn[i].x) : p.x, y: drawn?.[i] ? r2(drawn[i].y) : p.y, bind: null } : p)) }
  })
  return { content: { ...c, shapes }, cut }
}

// The points of a shape that are linked, with the shape each is linked to: for the Links list.
export function linksOf(c: ModelContent, shapeId: string): Array<{ index: number; bind: ModelBind }> {
  const out: Array<{ index: number; bind: ModelBind }> = []
  shapeById(c, shapeId)?.pts.forEach((p, index) => { if (p.bind) out.push({ index, bind: p.bind }) })
  return out
}

// Let the shapes take their looseness from a slider (or none): the distance of their links is then stretched by it.
export function setLoose(c: ModelContent, shapeIds: string[], rangeId: string | null): Edit {
  if (rangeId !== null && !c.ranges.some(r => r.id === rangeId)) return fail('There is no such slider.')
  const ids = new Set(shapeIds)
  return done({ ...c, shapes: c.shapes.map(s => (ids.has(s.id) && !s.mirrorOf ? { ...s, loose: rangeId } : s)) })
}

// ---- the back view ----

const copyPts = (list: ModelPoint[]): ModelPoint[] => list.map(p => ({ ...p, hi: p.hi ? [p.hi[0], p.hi[1]] : p.hi, ho: p.ho ? [p.ho[0], p.ho[1]] : p.ho }))

// An outline of its own for the back view (at least three points), or none: the front outline seen from behind.
export function setBack(c: ModelContent, shapeId: string, pts: ModelPoint[] | null): Edit {
  const s = shapeById(c, shapeId)
  if (!s) return fail('There is no such shape.')
  if (s.mirrorOf) return fail('A twin has no outline of its own: it mirrors its original, back and front.')
  if (pts !== null && pts.length < 3) return fail('An outline needs at least 3 points.')
  if (pts !== null && pts.length > LIMITS.pointsMax) return fail(`A shape may have at most ${LIMITS.pointsMax} points.`)
  return done({ ...c, shapes: c.shapes.map(x => (x.id === shapeId ? { ...x, back: pts ? copyPts(pts) : null } : x)) })
}

// The shape's own back outline, or the front one it starts from (so a first edit in the back view begins with what is shown).
export const backPoints = (s: ModelShape): ModelPoint[] => copyPts(s.back && s.back.length >= 3 ? s.back : s.pts)

// Move a shape one place toward the front (dir 1) or the back (-1) among the shapes shown in a view, by giving every shape of that view a depth that
// follows the new order (the depth of the front view is `z`, of the back view `zBack`).
export function moveInOrder(c: ModelContent, shapeId: string, view: 'front' | 'back', dir: -1 | 1): Edit {
  const shown = c.shapes.filter(s => s.view === 'both' || s.view === view)
  const zOf = (s: ModelShape) => (view === 'back' && s.zBack != null ? s.zBack : s.z)
  const order = drawOrder(c, shown, zOf)
  const at = order.findIndex(s => s.id === shapeId)
  if (at < 0) return fail('That shape is not shown in this view.')
  const to = at + dir
  if (to < 0 || to >= order.length) return fail(dir > 0 ? 'It is in front already.' : 'It is at the back already.')
  const next = [...order]
  ;[next[at], next[to]] = [next[to], next[at]]
  const depth = new Map(next.map((s, k) => [s.id, r2(10 + (next.length > 1 ? (80 * k) / (next.length - 1) : 40))]))
  return done({ ...c, shapes: c.shapes.map(s => (depth.has(s.id) ? (view === 'back' ? { ...s, zBack: depth.get(s.id)! } : { ...s, z: depth.get(s.id)! }) : s)) })
}

