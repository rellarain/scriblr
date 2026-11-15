import type { ModelBind, ModelContent, ModelJoint, ModelPivot, ModelShape, ModelShapePivot } from '../../../../../api/types'
import { IDENTITY, apply, bezierAt, build, inverse, mul, nearestEdge, rotate, type Mat } from './geometry'
import { anchorsOf, placeMat } from './anchors'
import { treeRank } from './order'
import { orbitOf } from './symmetry'
import type { Solved } from './rig'

// Pivot points (joints J2). Any link between shapes of two different objects can be made a pivot point: the shapes on its two sides turn about the linked point. Objects are
// the bodies (all of an object's shapes move together); pivot links are the joints between them. What is saved is the drawing plus a turn per pivot (and where the first object
// of a figure has been posed), so a pose can be put back.
//
// How it is worked out (`poseOf`): the objects joined through pivots are a figure. Each figure is walked out from its root (its first anchored object, else its first object in
// the tree), placed where it has been posed (`ModelObject.place`): at each pivot the object further out turns about the pivot point by the pivot's turn, carrying what lies
// beyond it. An object met again from another side closes a loop: the pivots round it do not turn, and neither do those between the root and another anchored object. Links
// that are not pivots join nothing: a point linked across objects follows the shape it is linked to.
//
// Pivot circles (shape types T3: a point with circles round it that shapes hung on) were replaced by pivot points; `migrateJoints` turns an old model's circles into pivot links.

export const TURN_LIMIT = 180
const r2 = (v: number): number => Math.round(v * 100) / 100
const angle = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? r2(Math.min(TURN_LIMIT, Math.max(-TURN_LIMIT, v))) : fallback)
const wrap = (a: number): number => { const t = ((a % 360) + 360) % 360; return t > 180 ? t - 360 : t }

// A pivot's settings as the server keeps them: lo <= 0 <= hi, the turn held between them.
export function repairJoint(v: unknown): ModelJoint | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  const lo = Math.min(0, angle(p.lo, -TURN_LIMIT)), hi = Math.max(0, angle(p.hi, TURN_LIMIT))
  return { turn: Math.min(hi, Math.max(lo, angle(p.turn, 0))), lo, hi }
}
export const NEW_JOINT: ModelJoint = { turn: 0, lo: -TURN_LIMIT, hi: TURN_LIMIT }

// ---- the old pivot circles (kept so an old model can be read and converted) ----

export function repairShapePivot(v: unknown): ModelShapePivot | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  if (typeof p.at !== 'string' || !p.at) return null
  const j = repairJoint(p)!
  return { at: p.at, ...j }
}
export function repairPivot(p: ModelPivot): ModelPivot {
  const place = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? r2(Math.min(1e5, Math.max(-1e5, v))) : fallback)
  return { id: p.id, name: typeof p.name === 'string' ? p.name.trim().slice(0, 40) : '', x: place(p.x, 100), y: place(p.y, 200) }
}
export const isPivotCircle = (s: Pick<ModelShape, 'kind' | 'pivot'> | undefined | null): boolean => !!s && s.kind === 'pivot' && !!s.pivot
export const pivotsOf = (c: ModelContent): ModelPivot[] => c.pivots ?? []
export const circlesOf = (c: ModelContent, pivotId: string): ModelShape[] => c.shapes.filter(s => isPivotCircle(s) && s.pivot!.at === pivotId)
// Pivot points no circle turns about any more go (after a circle, an object or a group was deleted).
export function prunePivots(c: ModelContent): ModelContent {
  if (!(c.pivots ?? []).length) return c
  const used = new Set(c.shapes.flatMap(s => (isPivotCircle(s) ? [s.pivot!.at] : [])))
  const kept = pivotsOf(c).filter(p => used.has(p.id))
  return kept.length === pivotsOf(c).length ? c : { ...c, pivots: kept }
}

// ---- pivot links ----

// The link a pivot toggle on point i of a shape works on: the point's own link; on a symmetric shape, the link of the copy that holds it; else the first point of another
// shape welded to it. Null when the point is not linked.
export function jointHolder(c: ModelContent, shapeId: string, i: number): { shapeId: string; i: number } | null {
  const s = c.shapes.find(x => x.id === shapeId)
  if (!s || !s.pts[i]) return null
  if (s.pts[i].bind) return { shapeId, i }
  if (s.sym) { const j = orbitOf(s, i).find(k => !!s.pts[k]?.bind); if (j !== undefined) return { shapeId, i: j } }
  for (const o of c.shapes) {
    if (o.id === shapeId) continue
    const k = o.pts.findIndex(p => p.bind?.kind === 'point' && p.bind.s === shapeId && p.bind.i === i)
    if (k >= 0) return { shapeId: o.id, i: k }
  }
  return null
}
export const jointAt = (c: ModelContent, shapeId: string, i: number): ModelJoint | null => {
  const h = jointHolder(c, shapeId, i)
  return h ? c.shapes.find(x => x.id === h.shapeId)?.pts[h.i]?.bind?.pivot ?? null : null
}

const objectOfShapeIn = (c: ModelContent, shapeId: string): string | null => c.objects.find(o => o.shapes.includes(shapeId))?.id ?? null
const withBind = (c: ModelContent, shapeId: string, i: number, f: (b: ModelBind) => ModelBind): ModelContent => ({
  ...c, shapes: c.shapes.map(s => (s.id === shapeId ? { ...s, pts: s.pts.map((p, k) => (k === i && p.bind ? { ...p, bind: f(p.bind) } : p)) } : s)),
})

// A linked point made a pivot point, or a plain link again. A pivot joins two objects, so a link between shapes of one object cannot be one.
export function toggleJoint(c: ModelContent, shapeId: string, i: number): { ok: true; content: ModelContent; on: boolean } | { ok: false; reason: string } {
  const h = jointHolder(c, shapeId, i)
  if (!h) return { ok: false, reason: 'Only a linked point can be a pivot point: connect it to another shape first.' }
  const b = c.shapes.find(x => x.id === h.shapeId)!.pts[h.i].bind!
  if (b.pivot) return { ok: true, content: withBind(c, h.shapeId, h.i, x => ({ ...x, pivot: null })), on: false }
  const a = objectOfShapeIn(c, h.shapeId), t = objectOfShapeIn(c, b.s)
  if (!a || !t || a === t) return { ok: false, reason: 'A pivot point joins two objects: these shapes are in one object. Put them in different objects to bend them there.' }
  return { ok: true, content: withBind(c, h.shapeId, h.i, x => ({ ...x, pivot: { ...NEW_JOINT } })), on: true }
}

// A pivot's turn or its limits changed: the turn stays inside the limits, and the limits keep the rest (0) inside them.
export function setJointSetting(c: ModelContent, shapeId: string, i: number, key: 'turn' | 'lo' | 'hi', value: number): ModelContent {
  const h = jointHolder(c, shapeId, i)
  if (!h) return c
  return withBind(c, h.shapeId, h.i, b => {
    if (!b.pivot) return b
    const v = r2(Math.min(TURN_LIMIT, Math.max(-TURN_LIMIT, value)))
    const lo = key === 'lo' ? Math.min(0, v) : b.pivot.lo, hi = key === 'hi' ? Math.max(0, v) : b.pivot.hi
    return { ...b, pivot: { lo, hi, turn: Math.min(hi, Math.max(lo, key === 'turn' ? v : b.pivot.turn)) } }
  })
}
// A pivot turned by some degrees more, held to its limits (posing).
export function addJointTurn(c: ModelContent, jointId: string, by: number): ModelContent {
  const [shapeId, k] = jointId.split(':'), i = Number(k)
  const b = c.shapes.find(s => s.id === shapeId)?.pts[i]?.bind
  if (!b?.pivot) return c
  return withBind(c, shapeId, i, x => ({ ...x, pivot: { ...x.pivot!, turn: r2(Math.min(x.pivot!.hi, Math.max(x.pivot!.lo, x.pivot!.turn + by))) } }))
}

// ---- the pose ----

// A pivot link: the point that holds it (`shape`, `i`; its id is "shape:i"), the object of that point (`from`) and of the shape it is linked to (`to`), the pivot point where it is
// drawn at rest, and the pivot's turn (how far `from` is turned from `to`).
export interface Joint { id: string; shape: string; i: number; from: string; to: string; at: [number, number]; turn: number; lo: number; hi: number }

export interface Pose {
  // each shape that moves: the matrix it is drawn through (in the model's space); each object that moves
  mats: Map<string, Mat>
  objectMats: Map<string, Mat>
  // every pivot link, and where its pivot point is now
  joints: Map<string, Joint>
  points: Map<string, [number, number]>
  // pivots that do not turn (their two sides meet again, or an anchor holds the side beyond them)
  blocked: Set<string>
  // each shape's object, and each object's shapes
  bodyOf: Map<string, string>
  bodies: Map<string, string[]>
  // each object's figure (by its root object), and the way from each object back toward the root: the pivot, the object it hangs from, and which way the pivot's turn turns it
  rootOf: Map<string, string>
  parentOf: Map<string, { joint: string; parent: string; sign: 1 | -1 }>
  // how many anchors each object has, and each figure (by its root)
  anchors: Map<string, number>
  figureAnchors: Map<string, number>
  // the shapes a drag in Pose mode can pose (every shape of an object)
  posable: Set<string>
}

const cache = new WeakMap<ModelContent, Pose>()

export function poseOf(c: ModelContent): Pose {
  const hit = cache.get(c)
  if (hit) return hit
  const made = work(c)
  cache.set(c, made)
  return made
}

// Where a link's point lies at rest, read from the drawing: a weld on the point it is welded to (followed to the point at the end of its welds), a lock at its place on the
// segment.
function restPlace(byId: Map<string, ModelShape>, b: ModelBind): [number, number] | null {
  let t = byId.get(b.s), bind: ModelBind = b
  for (let k = 0; k < 8 && t && bind.kind === 'point'; k++) {
    const q = t.pts[bind.i % Math.max(1, t.pts.length)]
    if (!q) return null
    if (!q.bind || q.bind.kind !== 'point' || Math.abs(q.bind.d[0]) > 1e-6 || Math.abs(q.bind.d[1]) > 1e-6) return [q.x + bind.d[0], q.y + bind.d[1]]
    bind = q.bind
    t = byId.get(bind.s)
  }
  if (!t || t.pts.length < 2) return null
  if (bind.kind === 'point') { const q = t.pts[bind.i % t.pts.length]; return q ? [q.x, q.y] : null }
  const a = build(t.pts, t.closed), e = bezierAt(a, bind.e % a.length, bind.t)
  return [e.x, e.y]
}

function work(c: ModelContent): Pose {
  const pose: Pose = {
    mats: new Map(), objectMats: new Map(), joints: new Map(), points: new Map(), blocked: new Set(), bodyOf: new Map(), bodies: new Map(), rootOf: new Map(),
    parentOf: new Map(), anchors: new Map(), figureAnchors: new Map(), posable: new Set(),
  }
  const byId = new Map(c.shapes.map(s => [s.id, s]))
  const rank = treeRank(c), objectRank = new Map<string, number>()
  for (const o of c.objects) {
    const ids = o.shapes.filter(id => byId.has(id))
    pose.bodies.set(o.id, ids)
    for (const id of ids) { pose.bodyOf.set(id, o.id); pose.posable.add(id) }
    objectRank.set(o.id, Math.min(Infinity, ...ids.map(id => rank.get(id) ?? Infinity)))
    const n = ids.reduce((k, id) => k + anchorsOf(byId.get(id)).length, 0)
    if (n) pose.anchors.set(o.id, n)
  }
  const rankOf = (o: string) => objectRank.get(o) ?? Infinity
  // the joints: pivot links between shapes of two objects
  const near = new Map<string, string[]>()
  for (const s of c.shapes) {
    s.pts.forEach((p, i) => {
      const b = p.bind
      if (!b?.pivot) return
      const from = pose.bodyOf.get(s.id), to = pose.bodyOf.get(b.s), at = restPlace(byId, b)
      if (!from || !to || from === to || !at) return
      const id = `${s.id}:${i}`
      pose.joints.set(id, { id, shape: s.id, i, from, to, at, turn: b.pivot.turn, lo: b.pivot.lo, hi: b.pivot.hi })
      near.set(from, [...(near.get(from) ?? []), id])
      near.set(to, [...(near.get(to) ?? []), id])
    })
  }
  const placeOfObject = (o: string) => placeMat(c.objects.find(x => x.id === o)?.place)
  const seen = new Set<string>()
  const objects = [...pose.bodies.keys()].sort((a, b) => rankOf(a) - rankOf(b))
  for (const first of objects) {
    if (seen.has(first)) continue
    // the figure: the objects joined through pivots
    const members = [first]
    seen.add(first)
    for (let k = 0; k < members.length; k++) {
      for (const jid of near.get(members[k]) ?? []) {
        const j = pose.joints.get(jid)!, other = j.from === members[k] ? j.to : j.from
        if (!seen.has(other)) { seen.add(other); members.push(other) }
      }
    }
    members.sort((a, b) => rankOf(a) - rankOf(b))
    const anchored = members.filter(o => pose.anchors.has(o))
    const root = anchored[0] ?? members[0]
    pose.figureAnchors.set(root, anchored.reduce((k, o) => k + (pose.anchors.get(o) ?? 0), 0))
    // walked out from the root
    const order = [root], visited = new Set([root]), used = new Set<string>(), loops: Array<[string, string, string]> = []
    pose.rootOf.set(root, root)
    for (let k = 0; k < order.length; k++) {
      const o = order[k]
      for (const jid of near.get(o) ?? []) {
        if (used.has(jid)) continue
        used.add(jid)
        const j = pose.joints.get(jid)!, other = j.from === o ? j.to : j.from
        if (visited.has(other)) { loops.push([o, other, jid]); continue }
        visited.add(other)
        order.push(other)
        pose.parentOf.set(other, { joint: jid, parent: o, sign: other === j.from ? 1 : -1 })
        pose.rootOf.set(other, root)
      }
    }
    // a pivot does not turn when its two sides meet again (each pivot round the loop), or when an anchor holds the side beyond it (each pivot between the root and that anchor)
    const chain = (o: string): string[] => { const out = [o]; let x = o; while (pose.parentOf.has(x)) { x = pose.parentOf.get(x)!.parent; out.push(x) } return out }
    const blockBetween = (a: string, b: string) => {
      const ca = chain(a), cb = chain(b), inA = new Set(ca), meet = cb.find(x => inA.has(x)) ?? root
      for (const x of [...ca.slice(0, ca.indexOf(meet)), ...cb.slice(0, cb.indexOf(meet))]) pose.blocked.add(pose.parentOf.get(x)!.joint)
    }
    for (const [a, b, jid] of loops) { pose.blocked.add(jid); blockBetween(a, b) }
    for (const o of anchored) if (o !== root) blockBetween(o, root)
    // the root where it has been posed, and each object from the one it hangs from
    pose.objectMats.set(root, placeOfObject(root))
    for (const o of order.slice(1)) {
      const pp = pose.parentOf.get(o)!, Mp = pose.objectMats.get(pp.parent)!, j = pose.joints.get(pp.joint)!
      const by = pose.blocked.has(pp.joint) ? 0 : pp.sign * j.turn
      pose.objectMats.set(o, by ? mul(Mp, rotate(by, j.at[0], j.at[1])) : Mp)
    }
  }
  for (const [jid, j] of pose.joints) pose.points.set(jid, apply(pose.objectMats.get(j.to) ?? IDENTITY, j.at[0], j.at[1]))
  for (const [o, M] of pose.objectMats) if (M !== IDENTITY) for (const id of pose.bodies.get(o) ?? []) pose.mats.set(id, M)
  return pose
}

// ---- converting old pivot circles (once, when the shape editor opens an old model) ----

// Whether a model still has what pivot points replaced: pivot circles, pivot points of circles, or a figure's place kept on a shape.
export const needsJoints = (c: ModelContent): boolean => pivotsOf(c).length > 0 || c.shapes.some(s => s.kind === 'pivot' || !!s.place)

// Each shape hung on a circle is linked instead to the shape hung on that pivot's first circle (on its nearest point within half a unit, else locked on its nearest segment)
// and the link is made a pivot with the circle's turn (from the first circle's) and limits; a shape alone on its pivot, and a shadow or a light held on a ring, is unlinked
// where it is drawn. The circles and the pivot points go. A figure's place kept on its first shape moves to that shape's object.
export function migrateJoints(c: ModelContent, solved: Solved): ModelContent {
  const byId = new Map(c.shapes.map(s => [s.id, s])), rank = treeRank(c)
  const circleIds = new Set(c.shapes.filter(s => s.kind === 'pivot').map(s => s.id))
  const pts = new Map(c.shapes.map(s => [s.id, s.pts.map(p => ({ ...p }))]))
  const drawnAt = (sid: string, i: number): [number, number] | null => {
    const r = solved.shapes[sid], q = r?.local[i]
    return r && q ? apply(r.matrix, q.x, q.y) : null
  }
  const ownSpace = (sid: string, w: [number, number]): [number, number] => {
    const r = solved.shapes[sid]
    return r ? apply(inverse(r.matrix), w[0], w[1]) : w
  }
  const unlink = (sid: string, i: number) => {
    const list = pts.get(sid)!, at = drawnAt(sid, i), [x, y] = at ? ownSpace(sid, at) : [list[i].x, list[i].y]
    list[i] = { ...list[i], x: r2(x), y: r2(y), bind: null }
  }
  for (const pivot of pivotsOf(c)) {
    const circles = circlesOf(c, pivot.id).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    const hung = circles.map(ci => c.shapes.flatMap(s => (circleIds.has(s.id) ? [] : s.pts.flatMap((p, i) => (p.bind?.s === ci.id ? [{ s: s.id, i }] : [])))))
    const k0 = hung.findIndex(h => h.some(x => !byId.get(x.s)?.kind || byId.get(x.s)!.kind === 'base' || byId.get(x.s)!.kind === 'stretch'))
    const holder = k0 >= 0 ? hung[k0].find(x => { const k = byId.get(x.s)?.kind ?? 'base'; return k === 'base' || k === 'stretch' })!.s : null
    const r0 = circles[k0]?.pivot
    hung.forEach((list, k) => list.forEach(({ s, i }) => {
      const kind = byId.get(s)?.kind ?? 'base', at = drawnAt(s, i), T = holder ? solved.shapes[holder] : undefined
      if (!holder || s === holder || kind === 'shadow' || kind === 'light' || !at || !T || T.local.length < 3) { unlink(s, i); return }
      const built = build(T.local, byId.get(holder)!.closed, T.matrix)
      let best = -1, bd = 0.5
      built.forEach((q, j) => { const d = Math.hypot(q.x - at[0], q.y - at[1]); if (d <= bd) { bd = d; best = j } })
      const ci = circles[k].pivot!, sameObject = objectOfShapeIn(c, s) === objectOfShapeIn(c, holder)
      const pivot: ModelJoint | null = k === k0 || sameObject ? null : { turn: r2(Math.min(ci.hi, Math.max(ci.lo, wrap(ci.turn - (r0?.turn ?? 0))))), lo: ci.lo, hi: ci.hi }
      let bind: ModelBind
      if (best >= 0) bind = { kind: 'point', s: holder, i: best, d: [0, 0], e: 0, t: 0, o: 0 }
      else {
        const [lx, ly] = ownSpace(holder, at), hit = nearestEdge(T.local, lx, ly)
        if (!hit) { unlink(s, i); return }
        bind = { kind: 'edge', s: holder, i: 0, d: [0, 0], e: hit.e, t: r2(hit.t * 1000) / 1000, o: 0 }
      }
      const list = pts.get(s)!, [x, y] = ownSpace(s, at)
      list[i] = { ...list[i], x: r2(x), y: r2(y), bind: { ...bind, ...(pivot ? { pivot } : {}) } }
    }))
  }
  // anything else linked to a circle (a circle of no pivot, a slider on a ring) is let go where it is drawn
  for (const s of c.shapes) if (!circleIds.has(s.id)) s.pts.forEach((p, i) => { const now = pts.get(s.id)![i]; if (now.bind && circleIds.has(now.bind.s)) unlink(s.id, i) })
  // a figure's place goes to its object
  const places = new Map<string, NonNullable<ModelShape['place']>>()
  for (const s of c.shapes) { const o = objectOfShapeIn(c, s.id); if (s.place && o && !places.has(o)) places.set(o, s.place) }
  return {
    ...c,
    pivots: [],
    shapes: c.shapes.filter(s => !circleIds.has(s.id)).map(s => ({ ...s, pts: pts.get(s.id)!, place: null })),
    objects: c.objects.map(o => ({ ...o, shapes: o.shapes.filter(id => !circleIds.has(id)), ...(places.has(o.id) && !o.place ? { place: places.get(o.id)! } : {}) })),
  }
}
