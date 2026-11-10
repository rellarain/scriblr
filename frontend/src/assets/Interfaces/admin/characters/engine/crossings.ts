import type { ModelContent } from '../../../../../api/types'
import { shapeById, updateShape } from '../modelContent'
import { addPoint, movePoint, setMode } from './edit'
import { apply, hasIn, hasOut, inverse, nearestEdge } from './geometry'
import { LIMITS } from './limits'
import { clearLinksTo, linkToEdge, linkToPoint, unlinkPoint } from './pairEdit'
import type { Solved } from './rig'
import { clearPointMoves, done, fail, type Edit } from './rigEdit'

// Where two outlines cross, and the lock the designer makes there. A crossing is found in the canvas's space (what is drawn); the lock is made in the model's space (what is
// stored), so the page hands a crossing to `advanceLock` with the solved figure it was found in. A click steps a crossing through three stages: free, then the selected shape's
// point locked onto the other shape's edge (the lock clothes use), then both shapes welded at that spot, then free again (the points stay where they are).

export interface Crossing { x: number; y: number; other: string }
// How close, in the model's units, a point has to be to the crossing to be the point that holds the lock.
export const NEAR = 0.8

type Seg = [[number, number], [number, number]]

// Where two segments cross (null when they miss, or run side by side).
export function segmentCrossing(a: Seg, b: Seg): [number, number] | null {
  const [[x1, y1], [x2, y2]] = a, [[x3, y3], [x4, y4]] = b
  const den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
  if (Math.abs(den) < 1e-12) return null
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

const segmentsOf = (poly: Array<[number, number]>, closed: boolean): Seg[] => {
  const out: Seg[] = []
  for (let i = 0; i + 1 < poly.length; i++) out.push([poly[i], poly[i + 1]])
  if (closed && poly.length > 2) out.push([poly[poly.length - 1], poly[0]])
  return out
}

// Every place the outline of a shape crosses the outline of another drawn shape (the shape itself is left out), in the canvas's space.
export function crossingsOf(c: ModelContent, solved: Solved, shapeId: string, most = 80): Crossing[] {
  const mine = solved.shapes[shapeId], self = shapeById(c, shapeId)
  if (!mine || !self || !mine.visible || mine.off || mine.poly.length < 2) return []
  const out: Crossing[] = []
  const mineSegs = segmentsOf(mine.poly, self.closed)
  for (const id of solved.order) {
    if (id === shapeId) continue
    const r = solved.shapes[id], sh = shapeById(c, id)
    if (!r || !sh || !r.visible || r.off || r.poly.length < 2) continue
    if (r.box.x > mine.box.x + mine.box.w || r.box.x + r.box.w < mine.box.x || r.box.y > mine.box.y + mine.box.h || r.box.y + r.box.h < mine.box.y) continue
    for (const a of mineSegs) {
      for (const b of segmentsOf(r.poly, sh.closed)) {
        const hit = segmentCrossing(a, b)
        if (!hit) continue
        if (out.some(o => o.other === id && Math.hypot(o.x - hit[0], o.y - hit[1]) < 0.3)) continue
        out.push({ x: hit[0], y: hit[1], other: id })
        if (out.length >= most) return out
      }
    }
  }
  return out
}

// The crossing nearest a place in the canvas's space, within `reach` units (null: none).
export function crossingNear(list: Crossing[], x: number, y: number, reach: number): Crossing | null {
  let best: Crossing | null = null, bd = reach
  for (const c of list) { const d = Math.hypot(c.x - x, c.y - y); if (d <= bd) { bd = d; best = c } }
  return best
}

export type LockStage = 0 | 1 | 2
// How far the lock at a crossing has got, and the point of the selected shape that holds it (null when it has none that is free to take it).
export function lockStage(c: ModelContent, solved: Solved, shapeId: string, cr: Crossing): { stage: LockStage; index: number | null } {
  const r = solved.shapes[shapeId], sh = shapeById(c, shapeId)
  if (!r || !sh) return { stage: 0, index: null }
  const [mx, my] = apply(inverse(solved.global), cr.x, cr.y)
  const at = r.pre.findIndex(p => Math.hypot(p.x - mx, p.y - my) < NEAR)
  if (at < 0 || !sh.pts[at]) return { stage: 0, index: null }
  const bind = sh.pts[at].bind
  if (!bind) return { stage: 0, index: at }
  if (bind.s === cr.other) return { stage: bind.kind === 'edge' ? 1 : 2, index: at }
  return { stage: 0, index: null }
}

const name = (c: ModelContent, id: string) => shapeById(c, id)?.name.trim() || 'the shape'

// A point of a shape at a place in the model's space: one it has there already, or a new one on the outline (which renumbers the points, so what refers to them by
// number is cleared first: the recorded moves of sliders, and the links to this shape).
function pointAt(c: ModelContent, solved: Solved, id: string, mx: number, my: number): { content: ModelContent; index: number; notes: string[] } | string {
  const sh = shapeById(c, id), r = solved.shapes[id]
  if (!sh || !r) return 'That shape cannot be found.'
  const [lx, ly] = apply(inverse(r.frame), mx, my)
  const near = r.rig.findIndex((p, i) => Math.hypot(p.x - lx, p.y - ly) < NEAR && !sh.pts[i]?.bind)
  if (near >= 0) return { content: c, index: near, notes: [] }
  if (sh.mirrorOf) return `${name(c, id)} is a twin: lock the original, or break the pair.`
  if (sh.pts.length >= LIMITS.pointsMax) return `${name(c, id)} has the most points a shape may have (${LIMITS.pointsMax}).`
  const hit = nearestEdge(r.rig, lx, ly)
  if (!hit || hit.dist > 4) return 'That place is not on the outline.'
  const added = addPoint(sh, hit.e, {})
  if (added.index < 0) return `${name(c, id)} has the most points a shape may have (${LIMITS.pointsMax}).`
  // an edge with no curve stays a straight line through the new point
  const straight = !hasOut(sh.pts[hit.e].m) && !hasIn(sh.pts[(hit.e + 1) % sh.pts.length].m)
  const moved = movePoint(added.shape, added.index, hit.x, hit.y)
  const placed = straight ? setMode(moved, added.index, 's') : moved
  const moves = clearPointMoves(c, id), links = clearLinksTo(moves.content, id)
  const notes: string[] = []
  if (moves.cleared.length) notes.push(`The recorded point moves of ${moves.cleared.join(', ')} were cleared because ${name(c, id)} has a new point.`)
  if (links.cut.length) notes.push(`The links of ${links.cut.join(', ')} to ${name(c, id)} were cut because it has a new point.`)
  return { content: updateShape(links.content, id, () => placed), index: added.index, notes }
}

// One click on a crossing: lock the selected shape onto the other, then weld the two, then let go. The solved figure is the one the crossing was found in (the sliders at
// rest: a lock is made in the model's own space).
export function advanceLock(c: ModelContent, solved: Solved, shapeId: string, cr: Crossing): Edit {
  const s = shapeById(c, shapeId), t = shapeById(c, cr.other)
  if (!s || !t) return fail('That shape cannot be found.')
  if (s.mirrorOf) return fail(`${name(c, shapeId)} is a twin: lock the original, or break the pair.`)
  const [mx, my] = apply(inverse(solved.global), cr.x, cr.y)
  const { stage, index } = lockStage(c, solved, shapeId, cr)
  if (stage === 2 && index !== null) return done(unlinkPoint(c, shapeId, index), 'Unlocked: the point stays where it is.')
  const mine = index !== null ? { content: c, index, notes: [] as string[] } : pointAt(c, solved, shapeId, mx, my)
  if (typeof mine === 'string') return fail(mine)
  if (stage === 0) {
    const e = linkToEdge(mine.content, shapeId, mine.index, cr.other, mx, my)
    return e.ok ? done(e.content, [...mine.notes, `Locked onto the edge of ${name(c, cr.other)}. Click again to weld them, once more to unlock.`].join(' ')) : e
  }
  // the weld: the other shape gets a point at the crossing too, and the two points are one
  const theirs = pointAt(mine.content, solved, cr.other, mx, my)
  if (typeof theirs === 'string') return fail(theirs)
  const e = linkToPoint(theirs.content, shapeId, mine.index, cr.other, mx, my, 'weld')
  return e.ok ? done(e.content, [...theirs.notes, `Welded to ${name(c, cr.other)}. Click again to unlock.`].join(' ')) : e
}
