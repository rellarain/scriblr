import type { ModelBind, ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { isAnchored } from './anchors'
import { edgeOf, nearestPlace, placeAt } from './sliders'
import { outlineSize, shapeById } from '../modelContent'
import { addPoint, movePoint } from './edit'
import { apply, bezierAt, build, inverse, nearestEdge, r2, transformList, type BuiltPoint, type Mat } from './geometry'
import { LIMITS, linkCount } from './limits'
import { reaches } from './pairEdit'
import { followSymmetry, orbitOf } from './symmetry'
import type { Solved } from './rig'
import { done, fail, type Edit } from './rigEdit'

// Connections in the shape editor (S5). A point dropped on a point of another shape is welded to it (it sits on it, and dragging either moves both); one dropped on a
// segment of another shape is locked onto it (it slides along it). In the data a connection is a link on the point that follows (`ModelPoint.bind`, one way): a weld is
// a point link with no offset, a lock an edge link with none. Two neighbouring points welded to two neighbouring points of one other shape make a shared segment: the
// solver draws the follower's segment as the other shape's (`rig.ts`), and the editor sends what is done to it there. Everything here is pure.

// What a dragged point is over: a point of another shape, or a spot on one of its segments (canvas space).
export type DropTarget =
  | { kind: 'point'; shapeId: string; i: number; x: number; y: number }
  | { kind: 'edge'; shapeId: string; e: number; t: number; x: number; y: number }

const ZERO = 1e-6
export const isWeld = (b: ModelBind | null | undefined): boolean => !!b && b.kind === 'point' && Math.abs(b.d[0]) < ZERO && Math.abs(b.d[1]) < ZERO

// The outline of a solved shape in canvas space (with its curve handles).
export const drawnOf = (c: ModelContent, solved: Solved, shapeId: string): BuiltPoint[] => {
  const r = solved.shapes[shapeId], s = shapeById(c, shapeId)
  return r && s && r.local.length >= 3 ? build(r.local, s.closed, r.matrix) : []
}

// The point or segment of another shape under (x, y), within `reach` (canvas units): a point wins over a segment. The dragged shape and shapes not drawn are left out.
// `ignore` holds the points (shape:index) that move with the dragged one: neither they nor the segments of their shapes are offered.
export function dropTargetAt(c: ModelContent, solved: Solved, dragged: string, x: number, y: number, reach: number, ignore: Set<string> = new Set()): DropTarget | null {
  let point: DropTarget | null = null, pd = reach
  let edge: DropTarget | null = null, ed = reach
  for (const s of c.shapes) {
    const r = solved.shapes[s.id]
    if (s.id === dragged || s.mirrorOf || s.cloneOf || s.helper || !r?.visible || r.off || r.local.length < 3) continue
    const a = build(r.local, s.closed, r.matrix)
    let moving = false
    a.forEach((p, i) => {
      if (ignore.has(`${s.id}:${i}`)) { moving = true; return }
      const d = Math.hypot(p.x - x, p.y - y)
      if (d <= pd) { pd = d; point = { kind: 'point', shapeId: s.id, i, x: p.x, y: p.y } }
    })
    if (moving) continue
    const hit = nearestEdge(transformList(r.local, r.matrix), x, y)
    if (hit && hit.dist <= ed) { ed = hit.dist; edge = { kind: 'edge', shapeId: s.id, e: hit.e, t: hit.t, x: hit.x, y: hit.y } }
  }
  return point ?? edge
}

// The point a weld leads back to: a welded point's own target, and so on (a point that follows nothing is its own root).
export function rootOf(c: ModelContent, shapeId: string, i: number): { shapeId: string; i: number } {
  let at = { shapeId, i }
  for (let guard = 0; guard < 32; guard++) {
    const b = shapeById(c, at.shapeId)?.pts[at.i]?.bind
    if (!b || !isWeld(b)) break
    at = { shapeId: b.s, i: b.i }
  }
  return at
}

// Why point i of a shape may not follow a point or segment of `target` (null: it may).
export function followRefusal(c: ModelContent, shapeId: string, i: number, target: string): string | null {
  const s = shapeById(c, shapeId)
  if (!s) return 'There is no such shape.'
  if (s.mirrorOf) return 'A twin has no points of its own.'
  if (s.cloneOf) return 'A clone has no points of its own.'
  if (s.kind === 'pivot') return 'A pivot circle follows nothing: hang shapes on it instead.'
  // a symmetric shape's point may follow (shape types T1), but only one copy of each point: the copies follow it
  if (s.sym && orbitOf(s, i).some(j => j !== i && !!s.pts[j]?.bind)) return 'Another copy of this point already follows a shape: the copies of a symmetric shape\'s point follow one shape together.'
  if (!s.pts[i]) return 'There is no such point.'
  if (isAnchored(s, i)) return 'An anchored point follows nothing: take its anchor off first.'
  if (target === shapeId) return 'A point cannot be connected to its own shape.'
  const t = shapeById(c, target)
  if (!t || outlineSize(c, t) < 3) return 'Pick a shape with an outline.'
  if (reaches(c, target, shapeId)) return 'That would make the connections go round in a circle.'
  if (!s.pts[i].bind && linkCount(c) >= LIMITS.linksMax) return `A model may have at most ${LIMITS.linksMax} connections.`
  return null
}

// One point changed; a symmetric shape's copies follow it (shape types T1: its points may be connected).
const setPoint = (c: ModelContent, shapeId: string, i: number, change: (p: ModelPoint) => ModelPoint): ModelContent =>
  ({ ...c, shapes: c.shapes.map(s => {
    if (s.id !== shapeId) return s
    const next = { ...s, pts: s.pts.map((p, k) => (k === i ? change(p) : p)) }
    return s.sym ? followSymmetry(s, next).shape : next
  }) })

// A place in canvas space, in a shape's own space.
export const into = (solved: Solved, shapeId: string, x: number, y: number): [number, number] => {
  const m: Mat | undefined = solved.shapes[shapeId]?.matrix
  const [lx, ly] = m ? apply(inverse(m), x, y) : [x, y]
  return [r2(lx), r2(ly)]
}

// A new link that keeps the name the point's old one had.
const named = (old: ModelBind | null | undefined, bind: ModelBind): ModelBind => (old?.name ? { ...bind, name: old.name } : bind)

// Connect point i of a shape to what it was dropped on. On a point it is welded to that point's root, or, when that would go round in a circle, the root is welded to it
// instead (both then sit where it was dropped); on a segment it is locked onto it where it was dropped.
export function connect(c: ModelContent, solved: Solved, shapeId: string, i: number, target: DropTarget): Edit {
  const s = shapeById(c, shapeId)
  if (!s?.pts[i]) return fail('There is no such point.')
  if (target.kind === 'edge') {
    const why = followRefusal(c, shapeId, i, target.shapeId)
    if (why) return fail(why)
    const bind: ModelBind = { kind: 'edge', s: target.shapeId, i: 0, d: [0, 0], e: target.e, t: r2(Math.min(1, Math.max(0, target.t))), o: 0 }
    const [x, y] = into(solved, shapeId, target.x, target.y)
    return done(setPoint(c, shapeId, i, p => ({ ...p, x, y, bind: named(p.bind, bind) })))
  }
  const root = rootOf(c, target.shapeId, target.i)
  if (root.shapeId === shapeId) return fail('A point cannot be connected to a point of its own shape.')
  const why = followRefusal(c, shapeId, i, root.shapeId)
  if (!why) {
    const at = drawnOf(c, solved, root.shapeId)[root.i]
    const [x, y] = at ? into(solved, shapeId, at.x, at.y) : [s.pts[i].x, s.pts[i].y]
    const bind: ModelBind = { kind: 'point', s: root.shapeId, i: root.i, d: [0, 0], e: 0, t: 0, o: 0 }
    return done(setPoint(c, shapeId, i, p => ({ ...p, x, y, bind: named(p.bind, bind) })))
  }
  // the other way round: the root follows the dropped point (which is where it was dropped)
  const back = followRefusal(c, root.shapeId, root.i, shapeId)
  if (back) return fail(why)
  const here = drawnOf(c, solved, shapeId)[i]
  const [x, y] = here ? into(solved, root.shapeId, here.x, here.y) : [0, 0]
  const bind: ModelBind = { kind: 'point', s: shapeId, i, d: [0, 0], e: 0, t: 0, o: 0 }
  return done(setPoint(c, root.shapeId, root.i, p => ({ ...p, x, y, bind: named(p.bind, bind) })))
}

// A point locked onto a segment slides along that segment: to the place on it nearest (x, y) (canvas space).
export function slideOnEdge(c: ModelContent, solved: Solved, shapeId: string, i: number, x: number, y: number): ModelShape | null {
  const s = shapeById(c, shapeId), b = s?.pts[i]?.bind
  if (!s || !b || b.kind !== 'edge') return null
  const a = drawnOf(c, solved, b.s), n = a.length
  if (n < 3) return null
  // a slider (shape types T5) goes anywhere between its stops, from one segment to the next
  if (b.slide) {
    const u = nearestPlace(a, b.slide.lo, b.slide.hi, x, y), [se, st] = edgeOf(u, n), q = bezierAt(a, se, st), [sx, sy] = into(solved, shapeId, q.x, q.y)
    return { ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, x: sx, y: sy, bind: { ...b, e: se, t: r2(st) } } : p)) }
  }
  const e = b.e % n
  let best = b.t, bd = Infinity
  const look = (t: number) => { const q = bezierAt(a, e, t), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = t } }
  for (let k = 0; k <= 40; k++) look(k / 40)
  const centre = best
  for (let k = -10; k <= 10; k++) look(Math.min(1, Math.max(0, centre + k / 400)))
  const q = bezierAt(a, e, best), [lx, ly] = into(solved, shapeId, q.x, q.y)
  return { ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, x: lx, y: ly, bind: { ...b, t: r2(best) } } : p)) }
}

// Every shape connected to a shape, through any number of shapes, with links either way (joints J1: a drag in a shape's fill takes them all along). The shape is in it.
export function connectedSet(c: ModelContent, shapeId: string): Set<string> {
  const near = new Map<string, Set<string>>()
  const join = (a: string, b: string) => { if (a === b) return; (near.get(a) ?? near.set(a, new Set()).get(a)!).add(b); (near.get(b) ?? near.set(b, new Set()).get(b)!).add(a) }
  for (const s of c.shapes) for (const p of s.pts) if (p.bind?.s) join(s.id, p.bind.s)
  const out = new Set([shapeId]), stack = [shapeId]
  while (stack.length) for (const n of near.get(stack.pop()!) ?? []) if (!out.has(n)) { out.add(n); stack.push(n) }
  return out
}

// Every point that moves with point i of a shape because it is welded to it, or to one of those (the points a drop must not land on).
export function weldTree(c: ModelContent, shapeId: string, i: number): Set<string> {
  const out = new Set<string>(), stack = [{ shapeId, i }]
  while (stack.length) {
    const at = stack.pop()!
    for (const f of weldedTo(c, at.shapeId, at.i)) {
      const key = `${f.shapeId}:${f.i}`
      if (!out.has(key)) { out.add(key); stack.push(f) }
    }
  }
  return out
}

// The points welded to point i of a shape (the points that follow it, with no offset).
export function weldedTo(c: ModelContent, shapeId: string, i: number): Array<{ shapeId: string; i: number }> {
  const out: Array<{ shapeId: string; i: number }> = []
  for (const s of c.shapes) s.pts.forEach((p, k) => { const b = p.bind; if (b && isWeld(b) && b.s === shapeId && b.i === i) out.push({ shapeId: s.id, i: k }) })
  return out
}

export const isConnected = (c: ModelContent, shapeId: string, i: number): boolean => !!shapeById(c, shapeId)?.pts[i]?.bind || weldedTo(c, shapeId, i).length > 0

// Pull point i of a shape free, every point staying where it is drawn now: its own link is cut, and the points welded to it are welded to the first of them instead (which is
// cut free itself), so they stay together.
export function loosen(c: ModelContent, solved: Solved, shapeId: string, i: number): ModelContent {
  const drawnAt = (sid: string, k: number): [number, number] | null => { const p = solved.shapes[sid]?.local[k]; return p ? [r2(p.x), r2(p.y)] : null }
  const free = (cc: ModelContent, sid: string, k: number): ModelContent => setPoint(cc, sid, k, p => { const at = drawnAt(sid, k); return { ...p, ...(at ? { x: at[0], y: at[1] } : {}), bind: null } })
  let next = shapeById(c, shapeId)?.pts[i]?.bind ? free(c, shapeId, i) : c
  const followers = weldedTo(next, shapeId, i)
  if (!followers.length) return next
  const [first, ...rest] = followers
  next = free(next, first.shapeId, first.i)
  for (const f of rest) {
    next = followRefusal(next, f.shapeId, f.i, first.shapeId) === null
      ? setPoint(next, f.shapeId, f.i, p => ({ ...p, bind: { ...p.bind!, s: first.shapeId, i: first.i } }))
      : free(next, f.shapeId, f.i)
  }
  return next
}

// Cut one connection: the follower stays where it is drawn now.
export function disconnect(c: ModelContent, solved: Solved, shapeId: string, i: number): ModelContent {
  const p = solved.shapes[shapeId]?.local[i]
  return setPoint(c, shapeId, i, q => (q.bind ? { ...q, ...(p ? { x: r2(p.x), y: r2(p.y) } : {}), bind: null } : q))
}

// Name a connection (kept on the point that follows) or the shared segment that starts at that point. A name is at most 40 characters; an empty one is none.
export function nameConnection(c: ModelContent, shapeId: string, i: number, field: 'name' | 'segName', value: string): ModelContent {
  const v = value.slice(0, NAME_LIMIT)
  return setPoint(c, shapeId, i, p => {
    if (!p.bind) return p
    const { [field]: _old, ...rest } = p.bind
    return { ...p, bind: v.trim() ? { ...rest, [field]: v } : rest }
  })
}
export const NAME_LIMIT = 40

// The points of a shape drawn as linked (joints J1): those that follow a shape, those other shapes' points are joined to, and on a symmetric shape every copy of such a
// point (the copies follow by symmetry, so they are linked too).
export function linkShown(c: ModelContent, shapeId: string): number[] {
  const s = shapeById(c, shapeId)
  if (!s || !s.pts.length) return []
  const on = new Set<number>()
  s.pts.forEach((p, i) => { if (p.bind) on.add(i) })
  for (const o of c.shapes) for (const p of o.pts) { const b = p.bind; if (b && b.kind === 'point' && b.s === shapeId && o.id !== shapeId) on.add(b.i % s.pts.length) }
  if (s.sym) for (const i of [...on]) for (const j of orbitOf(s, i)) on.add(j)
  return [...on].sort((a, b) => a - b)
}

// The copy of point i of a symmetric shape that holds the link the copies share (i itself when it is linked; null when no copy is).
export function linkHolder(s: ModelShape, i: number): number | null {
  if (s.pts[i]?.bind) return i
  if (!s.sym) return null
  return orbitOf(s, i).find(j => !!s.pts[j]?.bind) ?? null
}

// Where on another shape's outline a point lies when it is joined there with no offset: a weld at that shape's point i (the start of its segment i), or a lock on one of its
// segments (not a bridge end). Null for anything else.
export function curvePlace(b: ModelBind | null | undefined): { s: string; e: number; t: number } | null {
  if (!b) return null
  if (b.kind === 'point') return Math.abs(b.d[0]) < 1e-6 && Math.abs(b.d[1]) < 1e-6 ? { s: b.s, e: b.i, t: 0 } : null
  return Math.abs(b.o) < 1e-6 && !b.tan ? { s: b.s, e: b.e, t: b.t } : null
}
// Two places on one outline of m points on the same segment, as that segment and the two places along it (a weld at the segment's far end is read as its end), or null.
export function sameSegment(a: { e: number; t: number }, b: { e: number; t: number }, m: number, closed: boolean): { e: number; ta: number; tb: number } | null {
  if (m < 2) return null
  const ends = (p: { e: number; t: number }) => {
    const e = ((p.e % m) + m) % m, out = [{ e, t: p.t }]
    if (p.t <= 1e-9) { const prev = e - 1 >= 0 ? e - 1 : closed ? m - 1 : -1; if (prev >= 0) out.push({ e: prev, t: 1 }) }
    return out.filter(q => closed || q.e < m - 1)
  }
  for (const x of ends(a)) for (const y of ends(b)) if (x.e === y.e && Math.abs(x.t - y.t) > 1e-6) return { e: x.e, ta: x.t, tb: y.t }
  return null
}
// Whether segment e of a shape runs along another shape's outline (joints J1): both its ends joined, with no offset, on one segment of the same shape. It is drawn with that
// segment's curve, and marked in the alert colour.
export function sharesCurve(c: ModelContent, shapeId: string, e: number): boolean {
  const s = shapeById(c, shapeId)
  if (!s || s.pts.length < 2 || (!s.closed && e >= s.pts.length - 1)) return false
  const a = curvePlace(s.pts[e]?.bind), b = curvePlace(s.pts[(e + 1) % s.pts.length]?.bind)
  if (!a || !b || a.s !== b.s || a.s === shapeId) return false
  const t = shapeById(c, a.s)
  return !!t && sameSegment(a, b, t.pts.length, t.closed) !== null
}

// ---- shared segments ----

export interface Shared { shapeId: string; e: number; forward: boolean }

// The segment from point e of a shape to the next, when it is shared: both ends welded to neighbouring points of one other shape. Gives that shape, its segment, and
// whether it runs the same way.
export function sharedSegment(c: ModelContent, shapeId: string, e: number): Shared | null {
  const s = shapeById(c, shapeId)
  if (!s || s.pts.length < 2 || (!s.closed && e >= s.pts.length - 1)) return null
  const a = s.pts[e]?.bind, b = s.pts[(e + 1) % s.pts.length]?.bind
  if (!a || !b || !isWeld(a) || !isWeld(b) || a.s !== b.s) return null
  const t = shapeById(c, a.s), m = t ? t.pts.length : 0
  if (m < 3) return null
  if ((a.i + 1) % m === b.i) return { shapeId: a.s, e: a.i, forward: true }
  if ((b.i + 1) % m === a.i) return { shapeId: a.s, e: b.i, forward: false }
  return null
}

// The segments that share segment e of a shape (the followers', the other way round).
export function sharersOf(c: ModelContent, shapeId: string, e: number): Array<{ shapeId: string; e: number; forward: boolean }> {
  const out: Array<{ shapeId: string; e: number; forward: boolean }> = []
  for (const s of c.shapes) {
    if (s.id === shapeId) continue
    for (let k = 0; k < s.pts.length; k++) {
      const sh = sharedSegment(c, s.id, k)
      if (sh && sh.shapeId === shapeId && sh.e === e) out.push({ shapeId: s.id, e: k, forward: sh.forward })
    }
  }
  return out
}

// ---- shared segments copied by symmetry ----

// The other copies of segment e of a symmetric shape (its images across the axes), each with whether it runs the other way round. None for a shape that is not symmetric.
export function segmentCopies(s: ModelShape, e: number): Array<{ e: number; reversed: boolean }> {
  const n = s.pts.length
  if (!s.sym || !s.closed || n < 3) return []
  const oa = new Set(orbitOf(s, e)), ob = new Set(orbitOf(s, (e + 1) % n)), out: Array<{ e: number; reversed: boolean }> = []
  for (let q = 0; q < n; q++) {
    if (q === e) continue
    const a = q, b = (q + 1) % n
    if (oa.has(a) && ob.has(b)) out.push({ e: q, reversed: false })
    else if (oa.has(b) && ob.has(a)) out.push({ e: q, reversed: true })
  }
  return out
}

const ON_LINE = 0.5
// The segment of an outline (`ta`, canvas space) that segment q of another drawn outline lies along: its two ends and its middle within half a unit of it, the ends on one
// segment; with whether it runs the same way. Null when it does not.
function liesAlong(a: BuiltPoint[], q: number, ta: BuiltPoint[], closed: boolean): { te: number; forward: boolean } | null {
  const n = a.length, m = ta.length
  if (n < 2 || m < 2) return null
  const placeOf = (x: number, y: number): { e: number; t: number } | null => {
    const u = nearestPlace(ta, 0, closed ? m : m - 1, x, y), [px, py] = placeAt(ta, u)
    if (Math.hypot(px - x, py - y) > ON_LINE) return null
    let [e, t] = edgeOf(u, m)
    if (t > 1 - 1e-3) { e = (e + 1) % m; t = 0 }
    return { e, t: t < 1e-3 ? 0 : t }
  }
  const mid = bezierAt(a, q, 0.5), s0 = placeOf(a[q].x, a[q].y), s1 = placeOf(a[(q + 1) % n].x, a[(q + 1) % n].y), sm = placeOf(mid.x, mid.y)
  if (!s0 || !s1 || !sm) return null
  const seg = sameSegment(s0, s1, m, closed)
  return seg && sm.e === seg.e ? { te: seg.e, forward: seg.ta < seg.tb } : null
}

// A segment of a symmetric shape that is a copy of a shared segment (the user, 2026-11-15: "shared segments on symmetric shapes are shared on both segments"). Only one copy
// of each point may follow a shape, so a copy's ends follow nothing; yet when the shape it is shared with is symmetric the same way, the copy lies along that shape's outline
// too, and so it is drawn and treated as shared, as the copies of a linked point are drawn as linked:
// - `follower`: segment e of the symmetric shape that follows, a copy of its shared segment `source`, lying along segment `te` of `target` (`forward`: the same way round);
// - `target`: segment e of the symmetric shape followed, with no sharer of its own, along which a follower's copy lies; `source` is its copy that the follower really shares.
// `reversed`: the segment runs the other way round from its source. `weld`: the source is welded at both ends (what a drag or a double-click acts on, as for any shared
// segment); a copy of a segment locked on is only drawn.
export interface CopyShare { side: 'follower' | 'target'; shapeId: string; e: number; source: number; reversed: boolean; target: string; te: number; forward: boolean; weld: boolean }

const copyCache = new WeakMap<Solved, CopyShare[]>()
// Every such copy in a model as solved (worked out once per solve).
export function copySharesOf(c: ModelContent, solved: Solved): CopyShare[] {
  const hit = copyCache.get(solved)
  if (hit) return hit
  const out: CopyShare[] = [], drawn = new Map<string, BuiltPoint[]>()
  const drawnAt = (id: string): BuiltPoint[] => { let d = drawn.get(id); if (!d) { d = drawnOf(c, solved, id); drawn.set(id, d) } return d }
  for (const s of c.shapes) {
    const n = s.pts.length
    if (!s.sym || n < 3 || !s.pts.some(p => p.bind)) continue
    const real = new Set<number>()
    for (let k = 0; k < n; k++) if (sharesCurve(c, s.id, k)) real.add(k)
    for (const k of real) {
      const target = curvePlace(s.pts[k].bind)!.s, t = shapeById(c, target)
      if (!t) continue
      for (const cp of segmentCopies(s, k)) {
        if (real.has(cp.e) || out.some(o => o.shapeId === s.id && o.e === cp.e)) continue
        const on = liesAlong(drawnAt(s.id), cp.e, drawnAt(target), t.closed)
        if (on) out.push({ side: 'follower', shapeId: s.id, e: cp.e, source: k, reversed: cp.reversed, target, te: on.te, forward: on.forward, weld: !!sharedSegment(c, s.id, k) })
      }
    }
  }
  // the followed shape's side: a segment the copy lies along that nothing else shares acts as its own copy that is shared
  for (const o of [...out]) {
    const t = shapeById(c, o.target)
    if (!t?.sym || sharersOf(c, t.id, o.te).length || out.some(x => x.shapeId === t.id && x.e === o.te)) continue
    const src = segmentCopies(t, o.te).find(cp => sharersOf(c, t.id, cp.e).length > 0)
    if (src) out.push({ side: 'target', shapeId: t.id, e: o.te, source: src.e, reversed: src.reversed, target: t.id, te: o.te, forward: true, weld: o.weld })
  }
  copyCache.set(solved, out)
  return out
}
export const copyShareAt = (c: ModelContent, solved: Solved, shapeId: string, e: number): CopyShare | null =>
  copySharesOf(c, solved).find(o => o.shapeId === shapeId && o.e === e) ?? null

// A spot on a copy segment (x, y, canvas space) as the same spot on its source: how far along the copy it lies, along the source the same way round (or from the other end).
export function toSourceSpot(a: BuiltPoint[], e: number, source: number, reversed: boolean, x: number, y: number): [number, number] {
  if (a.length < 2) return [x, y]
  let best = 0, bd = Infinity
  for (let k = 0; k <= 64; k++) { const q = bezierAt(a, e, k / 64), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = k / 64 } }
  for (const step of [1 / 512, 1 / 8192]) {
    const from = best
    for (let k = -16; k <= 16; k++) { const t = Math.min(1, Math.max(0, from + k * step)), q = bezierAt(a, e, t), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = t } }
  }
  const q = bezierAt(a, source, reversed ? 1 - best : best)
  return [q.x, q.y]
}

// Where an edit of segment e of a shape belongs: the segment it shares (the one that is drawn), else its own.
export function segmentHome(c: ModelContent, shapeId: string, e: number): { shapeId: string; e: number } {
  const sh = sharedSegment(c, shapeId, e)
  return sh ? { shapeId: sh.shapeId, e: sh.e } : { shapeId, e }
}

// A curve handle of a shared segment, as the segment that is drawn has it: the follower's start point's outgoing handle is the drawn segment's start (forward) or end
// (the other way), and so on.
export function handleHome(c: ModelContent, shapeId: string, e: number, which: 'start' | 'end'): { shapeId: string; index: number; which: 'hi' | 'ho' } | null {
  const sh = sharedSegment(c, shapeId, e)
  if (!sh) return null
  const m = shapeById(c, sh.shapeId)!.pts.length
  const startIsFirst = sh.forward === (which === 'start')
  return startIsFirst ? { shapeId: sh.shapeId, index: sh.e, which: 'ho' } : { shapeId: sh.shapeId, index: (sh.e + 1) % m, which: 'hi' }
}

// ---- keeping connections when a shape's points change ----

// After the points of a shape changed in number (one added or deleted), the links to it keep to the same places: a weld to a point that is still there follows it to its new
// number, and one whose point went is cut (the follower stays where it was drawn); a lock onto a segment is put on the segment nearest where its point was. `before` is the
// content (and `solved` it solved) before the change, `after` the content with the shape's new points.
export function rebindByPlace(before: ModelContent, solved: Solved, after: ModelContent, shapeId: string): { content: ModelContent; cut: string[] } {
  const old = shapeById(before, shapeId), now = shapeById(after, shapeId)
  if (!old || !now) return { content: after, cut: [] }
  const same = (p: ModelPoint, q: ModelPoint) => Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3
  const r = solved.shapes[shapeId], m: Mat = r?.matrix ?? [1, 0, 0, 1, 0, 0]
  const nowDrawn = transformList(now.pts, m)
  const cut: string[] = []
  const shapes = after.shapes.map(s => {
    if (s.id === shapeId || !s.pts.some(p => p.bind?.s === shapeId)) return s
    let changed = false
    const pts = s.pts.map((p, k) => {
      const b = p.bind
      if (!b || b.s !== shapeId) return p
      changed = true
      if (b.kind === 'point') {
        const from = old.pts[b.i], to = from ? now.pts.findIndex(q => same(q, from)) : -1
        if (to >= 0) return { ...p, bind: { ...b, i: to } }
        cut.push(s.name || s.id)
        const at = solved.shapes[s.id]?.local[k]
        return { ...p, ...(at ? { x: r2(at.x), y: r2(at.y) } : {}), bind: null }
      }
      const fr = solved.shapes[s.id], here = fr?.local[k]
      if (!fr || !here) return p
      const [cx, cy] = apply(fr.matrix, here.x, here.y), hit = nearestEdge(nowDrawn, cx, cy)
      return hit ? { ...p, bind: { ...b, e: hit.e, t: r2(hit.t) } } : p
    })
    return changed ? { ...s, pts } : s
  })
  return { content: { ...after, shapes }, cut }
}

// Add a point to a shared segment where it was double-clicked (x, y, canvas space): to the segment that is drawn and to every segment that shares it, each new point welded
// to the drawn segment's new one, so the segment is still shared, in two parts. Null when there is no room (the most points a shape may have).
export function addPointShared(c: ModelContent, solved: Solved, shapeId: string, e: number, x: number, y: number, max: number = LIMITS.pointsMax): ModelContent | null {
  const home = segmentHome(c, shapeId, e), t = shapeById(c, home.shapeId)
  if (!t) return null
  const sharers = sharersOf(c, home.shapeId, home.e)
  const [lx, ly] = into(solved, home.shapeId, x, y)
  const added = addOn(t, home.e, lx, ly, max)
  if (!added) return null
  let next = rebindByPlace(c, solved, { ...c, shapes: c.shapes.map(s => (s.id === t.id ? added.shape : s)) }, t.id).content
  for (const sh of sharers) {
    const f = shapeById(next, sh.shapeId)
    if (!f) continue
    const [fx, fy] = into(solved, f.id, x, y)
    const fAdded = addOn(f, sh.e, fx, fy, max)
    if (!fAdded) continue
    const bind: ModelBind = { kind: 'point', s: t.id, i: added.index, d: [0, 0], e: 0, t: 0, o: 0 }
    const fShape = { ...fAdded.shape, pts: fAdded.shape.pts.map((p, k) => (k === fAdded.index ? { ...p, bind } : p)) }
    next = rebindByPlace(next, solved, { ...next, shapes: next.shapes.map(s => (s.id === f.id ? fShape : s)) }, f.id).content
  }
  return next
}
// A point added to segment e of a shape at (lx, ly) in its own space: on a symmetric shape it is added to every copy (shape editor S6), and the new point on the side that was
// clicked is found again by its place. Null when there is no room.
function addOn(s: ModelShape, e: number, lx: number, ly: number, max: number): { shape: ModelShape; index: number } | null {
  if (s.pts.length >= max) return null
  const added = addPoint(s, e, { max })
  if (added.index < 0) return null
  const placed = movePoint(added.shape, added.index, lx, ly)
  if (!s.sym) return { shape: placed, index: added.index }
  const f = followSymmetry(s, placed)
  if (f.refused || f.shape.pts.length > max) return null
  let index = -1, bd = Infinity
  f.shape.pts.forEach((p, k) => { const d = Math.hypot(p.x - lx, p.y - ly); if (d < bd) { bd = d; index = k } })
  return index >= 0 && bd < 0.05 ? { shape: f.shape, index } : null
}
