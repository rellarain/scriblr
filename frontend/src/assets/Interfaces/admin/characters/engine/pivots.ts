import type { ModelContent, ModelPivot, ModelShape, ModelShapePivot } from '../../../../../api/types'
import { newShape } from './edit'
import { IDENTITY, apply, mul, rotate, type Mat } from './geometry'
import { actsAs } from './kinds'
import { anchorsOf, placeMat } from './anchors'
import { treeRank } from './order'

// Pivots (shape types T3). A pivot point is the middle that two or more pivot circles (of different sizes) share. A base shape hangs on a circle when one of its points follows that
// circle (a weld on one of its points or a lock on one of its segments); base shapes connected to each other move as one body. Turning a circle swings everything that hangs on it,
// and whatever hangs on that further out, round the pivot point. What is saved is the drawing plus an angle per circle, so a turn can be put back.
//
// How it is worked out (`poseOf`): the bodies and pivots that hang together are a figure. Each figure is walked out from its root (its first anchored body, else its first body
// in the tree; T4), placed where it has been posed (`place`):
// at each pivot, the circle on the root's side is held (the pivot point moves with that side) and every other circle swings by its turn less the held circle's, carrying the
// bodies on it. A body met again from another side closes a loop: the pivots round it do not swing, and neither do those between the root and another anchored body.
// Shadows, lights and stretch shapes do not swing; they follow their links.

export const TURN_LIMIT = 180
const r2 = (v: number): number => Math.round(v * 100) / 100
const angle = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? r2(Math.min(TURN_LIMIT, Math.max(-TURN_LIMIT, v))) : fallback)

// A pivot circle's settings as the server keeps them: lo <= 0 <= hi, the turn held between them; null without a pivot point.
export function repairShapePivot(v: unknown): ModelShapePivot | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  if (typeof p.at !== 'string' || !p.at) return null
  const lo = Math.min(0, angle(p.lo, -TURN_LIMIT)), hi = Math.max(0, angle(p.hi, TURN_LIMIT))
  return { at: p.at, turn: Math.min(hi, Math.max(lo, angle(p.turn, 0))), lo, hi }
}
export function repairPivot(p: ModelPivot): ModelPivot {
  const place = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? r2(Math.min(1e5, Math.max(-1e5, v))) : fallback)
  return { id: p.id, name: typeof p.name === 'string' ? p.name.trim().slice(0, 40) : '', x: place(p.x, 100), y: place(p.y, 200) }
}

export const isPivotCircle = (s: Pick<ModelShape, 'kind' | 'pivot'> | undefined | null): boolean => !!s && s.kind === 'pivot' && !!s.pivot
export const pivotsOf = (c: ModelContent): ModelPivot[] => c.pivots ?? []
export const pivotById = (c: ModelContent, id: string | null | undefined): ModelPivot | undefined => (id ? pivotsOf(c).find(p => p.id === id) : undefined)
export const circlesOf = (c: ModelContent, pivotId: string): ModelShape[] => c.shapes.filter(s => isPivotCircle(s) && s.pivot!.at === pivotId)
// The radius of a circle as drawn: the mean distance of its points from its pivot point.
export function radiusOf(c: ModelContent, s: ModelShape): number {
  const p = pivotById(c, s.pivot?.at)
  if (!p || s.pts.length === 0) return 0
  return s.pts.reduce((sum, q) => sum + Math.hypot(q.x - p.x, q.y - p.y), 0) / s.pts.length
}

// ---- the pose ----

export interface Pose {
  // each shape that moves: the matrix it is drawn through (in the model's space)
  mats: Map<string, Mat>
  // each pivot circle: the matrix of the side it is held on (where a shadow or a light linked to it is placed: it does not swing)
  held: Map<string, Mat>
  // each pivot point where it is now
  points: Map<string, [number, number]>
  // pivots that do not swing (their two sides meet again, or an anchor holds the side beyond them)
  blocked: Set<string>
  // each body's shapes, by the body's first shape (what swings together)
  bodies: Map<string, string[]>
  // the body each base shape is in
  bodyOf: Map<string, string>
  // each figure's root body, and the pivot circle each body hangs from on the way to the root (its own side's circle)
  rootOf: Map<string, string>
  hangsFrom: Map<string, string>
  // the way from each body (other than a root) back toward its root: the pivot, the circle the body is on, the circle held on the root's side, the body it hangs from
  parentOf: Map<string, { pivot: string; circle: string; held: string; parent: string }>
  // each pivot's circle on the root's side (it holds still while the others swing)
  nearOf: Map<string, string>
  // the circles each body hangs on, and the bodies on each circle
  hangs: Map<string, string[]>
  onCircle: Map<string, string[]>
  // how many anchors each body has, and each figure (by its root)
  anchors: Map<string, number>
  figureAnchors: Map<string, number>
  // the shapes a drag in Pose mode can pose: the bodies of a figure with a pivot, and the circles of its pivots
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

function work(c: ModelContent): Pose {
  const pose: Pose = {
    mats: new Map(), held: new Map(), points: new Map(), blocked: new Set(), bodies: new Map(), bodyOf: new Map(), rootOf: new Map(), hangsFrom: new Map(),
    parentOf: new Map(), nearOf: new Map(), hangs: new Map(), onCircle: new Map(), anchors: new Map(), figureAnchors: new Map(), posable: new Set(),
  }
  const byId = new Map(c.shapes.map(s => [s.id, s]))
  const isBody = (s: ModelShape | undefined): boolean => !!s && !s.mirrorOf && actsAs(s) === 'base'
  // bodies: base shapes joined by their links to each other
  const parent = new Map<string, string>()
  const find = (id: string): string => { let r = id; while (parent.get(r) !== r) r = parent.get(r)!; return r }
  const rank = treeRank(c), rankOf = (id: string) => rank.get(id) ?? 0
  const bodyShapes = c.shapes.filter(isBody).sort((a, b) => rankOf(a.id) - rankOf(b.id))
  for (const s of bodyShapes) parent.set(s.id, s.id)
  for (const s of bodyShapes) {
    for (const p of s.pts) {
      const t = p.bind ? byId.get(p.bind.s) : undefined
      if (t && parent.has(t.id)) {
        const a = find(s.id), b = find(t.id)
        // the body is named by its first shape in the tree
        if (a !== b) { if (rankOf(a) <= rankOf(b)) parent.set(b, a); else parent.set(a, b) }
      }
    }
  }
  for (const s of bodyShapes) {
    const b = find(s.id)
    pose.bodyOf.set(s.id, b)
    pose.bodies.set(b, [...(pose.bodies.get(b) ?? []), s.id])
  }
  for (const [b, ids] of pose.bodies) {
    const n = ids.reduce((k, id) => k + anchorsOf(byId.get(id)).length, 0)
    if (n) pose.anchors.set(b, n)
  }
  // what hangs on what: a body on each circle one of its points follows
  const pivots = new Map(pivotsOf(c).map(p => [p.id, p]))
  for (const s of bodyShapes) {
    for (const p of s.pts) {
      const t = p.bind ? byId.get(p.bind.s) : undefined
      if (!t || !isPivotCircle(t) || !pivots.has(t.pivot!.at)) continue
      const b = pose.bodyOf.get(s.id)!
      if (!(pose.hangs.get(b) ?? []).includes(t.id)) pose.hangs.set(b, [...(pose.hangs.get(b) ?? []), t.id])
      if (!(pose.onCircle.get(t.id) ?? []).includes(b)) pose.onCircle.set(t.id, [...(pose.onCircle.get(t.id) ?? []), b])
    }
  }
  const circles = new Map<string, ModelShape[]>()
  for (const s of c.shapes) if (isPivotCircle(s) && pivots.has(s.pivot!.at)) circles.set(s.pivot!.at, [...(circles.get(s.pivot!.at) ?? []), s])
  const pivotOf = (cid: string) => byId.get(cid)!.pivot!.at
  const turnOf = (cid: string) => byId.get(cid)!.pivot!.turn ?? 0
  const bodyMat = new Map<string, Mat>()
  const seen = new Set<string>()
  // each figure (the bodies joined through pivots), walked out from its root: its first anchored body, else its first body in the tree
  for (const first of pose.bodies.keys()) {
    if (seen.has(first)) continue
    const members = [first]
    seen.add(first)
    for (let k = 0; k < members.length; k++) {
      for (const cid of pose.hangs.get(members[k]) ?? []) {
        for (const o of circles.get(pivotOf(cid)) ?? []) for (const b2 of pose.onCircle.get(o.id) ?? []) if (!seen.has(b2)) { seen.add(b2); members.push(b2) }
      }
    }
    members.sort((a, b) => rankOf(a) - rankOf(b))
    const anchored = members.filter(b => pose.anchors.has(b))
    const root = anchored[0] ?? members[0]
    pose.figureAnchors.set(root, anchored.reduce((k, b) => k + (pose.anchors.get(b) ?? 0), 0))
    pose.rootOf.set(root, root)
    const order = [root], visited = new Set([root]), from = new Map<string, string>()   // pivot -> the body it is reached from
    const loops: Array<[string, string, string]> = []
    for (let k = 0; k < order.length; k++) {
      const b = order[k]
      for (const cid of pose.hangs.get(b) ?? []) {
        const pid = pivotOf(cid)
        if (from.has(pid)) {
          // a pivot met again: the way this body came, another circle of its own pivot, or a loop
          if (pose.parentOf.get(b)?.pivot !== pid && from.get(pid) !== b) loops.push([b, from.get(pid)!, pid])
          continue
        }
        from.set(pid, b)
        pose.nearOf.set(pid, cid)
        for (const o of circles.get(pid) ?? []) {
          for (const b2 of pose.onCircle.get(o.id) ?? []) {
            if (b2 === b) continue
            if (visited.has(b2)) { if (pose.parentOf.get(b2)?.pivot !== pid) loops.push([b, b2, pid]); continue }
            visited.add(b2)
            order.push(b2)
            pose.parentOf.set(b2, { pivot: pid, circle: o.id, held: cid, parent: b })
            pose.rootOf.set(b2, root)
            pose.hangsFrom.set(b2, o.id)
          }
        }
      }
    }
    // a pivot does not swing when its two sides meet again (each pivot round the loop), or when an anchor holds the side beyond it (each pivot between the root and that anchor)
    const chain = (b: string): string[] => { const out = [b]; let x = b; while (pose.parentOf.has(x)) { x = pose.parentOf.get(x)!.parent; out.push(x) } return out }
    const blockBetween = (a: string, b: string) => {
      const ca = chain(a), cb = chain(b), inA = new Set(ca), meet = cb.find(x => inA.has(x)) ?? root
      for (const x of [...ca.slice(0, ca.indexOf(meet)), ...cb.slice(0, cb.indexOf(meet))]) pose.blocked.add(pose.parentOf.get(x)!.pivot)
    }
    for (const [a, b, pid] of loops) { pose.blocked.add(pid); blockBetween(a, b) }
    for (const b of anchored) if (b !== root) blockBetween(b, root)
    // the root where it has been posed, and each body from the one it hangs from
    bodyMat.set(root, placeMat(byId.get(root)?.place))
    for (const b of order.slice(1)) {
      const pp = pose.parentOf.get(b)!, Mp = bodyMat.get(pp.parent)!, pt = pivots.get(pp.pivot)!
      const swing = pose.blocked.has(pp.pivot) || pp.circle === pp.held ? 0 : turnOf(pp.circle) - turnOf(pp.held)
      bodyMat.set(b, swing ? mul(Mp, rotate(swing, pt.x, pt.y)) : Mp)
    }
    for (const [pid, b] of from) {
      const Mb = bodyMat.get(b)!, pt = pivots.get(pid)!, near = pose.nearOf.get(pid)!
      pose.points.set(pid, apply(Mb, pt.x, pt.y))
      for (const o of circles.get(pid) ?? []) {
        const swing = pose.blocked.has(pid) || o.id === near ? 0 : turnOf(o.id) - turnOf(near)
        pose.mats.set(o.id, swing ? mul(Mb, rotate(swing, pt.x, pt.y)) : Mb)
        pose.held.set(o.id, Mb)
      }
    }
    if (from.size) {
      for (const b of members) for (const id of pose.bodies.get(b) ?? []) pose.posable.add(id)
      for (const pid of from.keys()) for (const o of circles.get(pid) ?? []) pose.posable.add(o.id)
    }
  }
  for (const [b, M] of bodyMat) if (M !== IDENTITY) for (const id of pose.bodies.get(b) ?? []) pose.mats.set(id, M)
  // pivots no body holds stay where they are drawn
  for (const p of pivotsOf(c)) if (!pose.points.has(p.id)) pose.points.set(p.id, [p.x, p.y])
  return pose
}

// ---- edits ----

// A turn held to a circle's limits.
export const heldTurn = (p: ModelShapePivot, turn: number): number => r2(Math.min(p.hi, Math.max(p.lo, turn)))

// The sizes of a new pivot's circles (smallest first) and how many it may start with; how big a circle may be.
export const PIVOT_RADII = [12, 18, 24, 30]
export const PIVOT_CIRCLES = { min: 2, max: 4, start: 2 } as const
export const RADIUS = { min: 2, max: 120 } as const
const NEW_OUTLINE = 0.75

function circleAround(id: string, name: string, pivotId: string, x: number, y: number, r: number): ModelShape {
  const made = newShape(id, name, 'circle', { x: x - r, y: y - r, w: 2 * r, h: 2 * r })
  return { ...made, kind: 'pivot', pivot: { at: pivotId, turn: 0, lo: -TURN_LIMIT, hi: TURN_LIMIT }, outline: NEW_OUTLINE }
}
const withShapes = (c: ModelContent, objectId: string, shapes: ModelShape[]): ModelContent => ({
  ...c, shapes: [...c.shapes, ...shapes], objects: c.objects.map(o => (o.id === objectId ? { ...o, shapes: [...o.shapes, ...shapes.map(s => s.id)] } : o)),
})

// A new pivot at (x, y): its point and `circleIds.length` circles of growing sizes, in an object.
export function addPivot(c: ModelContent, objectId: string, x: number, y: number, ids: { pivot: string; circles: string[] }): ModelContent {
  const n = pivotsOf(c).length + 1, name = `Pivot ${n}`
  const circles = ids.circles.map((id, k) => circleAround(id, `${name} circle ${k + 1}`, ids.pivot, r2(x), r2(y), PIVOT_RADII[k] ?? PIVOT_RADII[PIVOT_RADII.length - 1] + 6 * (k - PIVOT_RADII.length + 1)))
  return withShapes({ ...c, pivots: [...pivotsOf(c), { id: ids.pivot, name, x: r2(x), y: r2(y) }] }, objectId, circles)
}

// One more circle on a pivot, a little bigger than its biggest.
export function addCircle(c: ModelContent, pivotId: string, objectId: string, id: string): ModelContent | null {
  const p = pivotById(c, pivotId)
  if (!p) return null
  const own = circlesOf(c, pivotId), r = Math.min(RADIUS.max, Math.max(PIVOT_RADII[0], ...own.map(s => radiusOf(c, s))) + 6)
  return withShapes(c, objectId, [circleAround(id, `${p.name || 'Pivot'} circle ${own.length + 1}`, pivotId, p.x, p.y, r2(r))])
}

// A circle drawn again round its pivot point at another size (its turn and limits stay).
export function setRadius(c: ModelContent, shapeId: string, r: number): ModelContent {
  const s = c.shapes.find(x => x.id === shapeId), p = pivotById(c, s?.pivot?.at)
  if (!s || !p) return c
  const size = r2(Math.min(RADIUS.max, Math.max(RADIUS.min, r)))
  const drawn = newShape(s.id, s.name, 'circle', { x: p.x - size, y: p.y - size, w: 2 * size, h: 2 * size })
  return { ...c, shapes: c.shapes.map(x => (x.id === shapeId ? { ...x, pts: drawn.pts } : x)) }
}

// A pivot moved: its point and every one of its circles.
export function movePivotBy(c: ModelContent, pivotId: string, dx: number, dy: number): ModelContent {
  if (!pivotById(c, pivotId) || (!dx && !dy)) return c
  return {
    ...c,
    pivots: pivotsOf(c).map(p => (p.id === pivotId ? { ...p, x: r2(p.x + dx), y: r2(p.y + dy) } : p)),
    shapes: c.shapes.map(s => (isPivotCircle(s) && s.pivot!.at === pivotId ? { ...s, pts: s.pts.map(q => ({ ...q, x: r2(q.x + dx), y: r2(q.y + dy) })) } : s)),
  }
}

export const renamePivot = (c: ModelContent, pivotId: string, name: string): ModelContent => ({ ...c, pivots: pivotsOf(c).map(p => (p.id === pivotId ? { ...p, name: name.slice(0, 40) } : p)) })

// A circle's turn or its limits changed: the turn stays inside the limits, and the limits keep the rest (0) inside them.
export function setPivotSetting(c: ModelContent, shapeId: string, key: 'turn' | 'lo' | 'hi', value: number): ModelContent {
  return {
    ...c,
    shapes: c.shapes.map(s => {
      if (s.id !== shapeId || !s.pivot) return s
      const v = r2(Math.min(TURN_LIMIT, Math.max(-TURN_LIMIT, value)))
      const lo = key === 'lo' ? Math.min(0, v) : s.pivot.lo, hi = key === 'hi' ? Math.max(0, v) : s.pivot.hi
      const turn = Math.min(hi, Math.max(lo, key === 'turn' ? v : s.pivot.turn))
      return { ...s, pivot: { ...s.pivot, lo, hi, turn } }
    }),
  }
}

// Pivot points no circle turns about any more go (after a circle, an object or a group was deleted).
export function prunePivots(c: ModelContent): ModelContent {
  if (!(c.pivots ?? []).length) return c
  const used = new Set(c.shapes.flatMap(s => (isPivotCircle(s) ? [s.pivot!.at] : [])))
  const kept = pivotsOf(c).filter(p => used.has(p.id))
  return kept.length === pivotsOf(c).length ? c : { ...c, pivots: kept }
}
