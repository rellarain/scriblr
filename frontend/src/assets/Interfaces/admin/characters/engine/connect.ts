import type { ModelBind, ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { outlineSize, shapeById } from '../modelContent'
import { addPoint, movePoint } from './edit'
import { apply, bezierAt, build, inverse, nearestEdge, r2, transformList, type BuiltPoint, type Mat } from './geometry'
import { LIMITS, linkCount } from './limits'
import { reaches } from './pairEdit'
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
const drawnOf = (c: ModelContent, solved: Solved, shapeId: string): BuiltPoint[] => {
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
    if (s.id === dragged || s.mirrorOf || s.helper || !r?.visible || r.off || r.local.length < 3) continue
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
  if (s.sym) return 'A point of a symmetric shape cannot follow another shape.'
  if (!s.pts[i]) return 'There is no such point.'
  if (target === shapeId) return 'A point cannot be connected to its own shape.'
  const t = shapeById(c, target)
  if (!t || outlineSize(c, t) < 3) return 'Pick a shape with an outline.'
  if (reaches(c, target, shapeId)) return 'That would make the connections go round in a circle.'
  if (!s.pts[i].bind && linkCount(c) >= LIMITS.linksMax) return `A model may have at most ${LIMITS.linksMax} connections.`
  return null
}

const setPoint = (c: ModelContent, shapeId: string, i: number, change: (p: ModelPoint) => ModelPoint): ModelContent =>
  ({ ...c, shapes: c.shapes.map(s => (s.id === shapeId ? { ...s, pts: s.pts.map((p, k) => (k === i ? change(p) : p)) } : s)) })

// A place in canvas space, in a shape's own space.
const into = (solved: Solved, shapeId: string, x: number, y: number): [number, number] => {
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
  const e = b.e % n
  let best = b.t, bd = Infinity
  const look = (t: number) => { const q = bezierAt(a, e, t), d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = t } }
  for (let k = 0; k <= 40; k++) look(k / 40)
  const centre = best
  for (let k = -10; k <= 10; k++) look(Math.min(1, Math.max(0, centre + k / 400)))
  const q = bezierAt(a, e, best), [lx, ly] = into(solved, shapeId, q.x, q.y)
  return { ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, x: lx, y: ly, bind: { ...b, t: r2(best) } } : p)) }
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
  const added = addPoint(t, home.e, { max })
  if (added.index < 0) return null
  const [lx, ly] = into(solved, home.shapeId, x, y)
  const placed = movePoint(added.shape, added.index, lx, ly)
  let next = rebindByPlace(c, solved, { ...c, shapes: c.shapes.map(s => (s.id === t.id ? placed : s)) }, t.id).content
  for (const sh of sharers) {
    const f = shapeById(next, sh.shapeId)
    if (!f || f.pts.length >= max) continue
    const fAdded = addPoint(f, sh.e, { max })
    if (fAdded.index < 0) continue
    const [fx, fy] = into(solved, f.id, x, y)
    const bind: ModelBind = { kind: 'point', s: t.id, i: added.index, d: [0, 0], e: 0, t: 0, o: 0 }
    const fShape = { ...fAdded.shape, pts: fAdded.shape.pts.map((p, k) => (k === fAdded.index ? { ...p, x: fx, y: fy, bind } : p)) }
    next = rebindByPlace(next, solved, { ...next, shapes: next.shapes.map(s => (s.id === f.id ? fShape : s)) }, f.id).content
  }
  return next
}
