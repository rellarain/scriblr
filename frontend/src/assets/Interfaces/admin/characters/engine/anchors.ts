import type { ModelMark, ModelPlace, ModelPoint, ModelShape } from '../../../../../api/types'
import { IDENTITY, apply, mul, rotate, translate, type Mat } from './geometry'
import { transformShape } from './transform'
import { centreOf } from './centre'

// Marks and anchors (shape types T4). A mark lies in a shape's own drawing space, on one of its points (`i`) or inside it (`i` null). An anchor pins the shape where it is on
// the grid: an anchored point cannot be dragged or removed, a shape with one anchor turns, flips and resizes about it (it cannot be moved), and a shape with two or more is
// held still. A figure's first shape may also have been posed (`place`: a turn about the origin, then a move); the figure hangs from it.

export const MARKS_MAX = 8
const NEAR = 0.05
const r2 = (v: number): number => Math.round(v * 100) / 100
const fin = (v: unknown, fallback: number, lim = 1e5): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(lim, Math.max(-lim, v)) : fallback)

export const marksOf = (s: Pick<ModelShape, 'marks'> | undefined | null): ModelMark[] => s?.marks ?? []
export const anchorsOf = (s: Pick<ModelShape, 'marks'> | undefined | null): ModelMark[] => marksOf(s).filter(m => m.kind === 'anchor')
const near = (p: { x: number; y: number }, x: number, y: number): boolean => Math.abs(p.x - x) < NEAR && Math.abs(p.y - y) < NEAR

// The point a mark lies on: its own number while that point is still where the mark is, else the point that is there now (points were added or taken away), else none.
export function markPoint(s: Pick<ModelShape, 'pts'>, m: ModelMark): number | null {
  if (m.i === null) return null
  const p = s.pts[m.i]
  if (p && near(p, m.x, m.y)) return m.i
  const k = s.pts.findIndex(q => near(q, m.x, m.y))
  return k >= 0 ? k : null
}
export const isAnchored = (s: ModelShape, i: number): boolean => anchorsOf(s).some(m => markPoint(s, m) === i)
export const anchorOn = (s: ModelShape, i: number): ModelMark | undefined => anchorsOf(s).find(m => markPoint(s, m) === i)

// Marks as the server keeps them: known kinds, finite places, a point number only while there is such a point, one mark per id, at most MARKS_MAX.
export function repairMarks(v: unknown, n: number): ModelMark[] {
  if (!Array.isArray(v)) return []
  const out: ModelMark[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    if (typeof m.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(m.id) || out.some(x => x.id === m.id)) continue
    const c = m.c === true
    const i = !c && typeof m.i === 'number' && Number.isInteger(m.i) && m.i >= 0 && m.i < n ? m.i : null
    out.push({ id: m.id, kind: m.kind === 'pose' ? 'pose' : 'anchor', x: r2(fin(m.x, 0)), y: r2(fin(m.y, 0)), i, name: typeof m.name === 'string' ? m.name.trim().slice(0, 40) : '', ...(c ? { c: true } : {}) })
    if (out.length >= MARKS_MAX) break
  }
  return out
}
const wrap = (a: number): number => { const t = ((a % 360) + 360) % 360; return r2(t > 180 ? t - 360 : t) }
export function repairPlace(v: unknown): ModelPlace | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  return { dx: r2(fin(p.dx, 0)), dy: r2(fin(p.dy, 0)), turn: wrap(fin(p.turn, 0, 1e6)) }
}

// A place as a matrix (turned about the origin, then moved), and a rigid matrix as a place.
export const placeMat = (p: ModelPlace | null | undefined): Mat => (p ? mul(translate(p.dx, p.dy), rotate(p.turn, 0, 0)) : IDENTITY)
export function placeOf(m: Mat): ModelPlace | null {
  const turn = wrap((Math.atan2(m[1], m[0]) * 180) / Math.PI), dx = r2(m[4]), dy = r2(m[5])
  return turn === 0 && dx === 0 && dy === 0 ? null : { dx, dy, turn }
}

// ---- marks ----

export const freshMarkId = (s: ModelShape): string => { const taken = new Set(marksOf(s).map(m => m.id)); let n = 1; while (taken.has(`k${n}`)) n++; return `k${n}` }
type Made = { ok: true; shape: ModelShape } | { ok: false; reason: string }

// An anchor on point i, or the anchor there taken away.
export function toggleAnchor(s: ModelShape, i: number, id = freshMarkId(s)): Made {
  const on = anchorOn(s, i), p = s.pts[i]
  if (on) return { ok: true, shape: { ...s, marks: marksOf(s).filter(m => m.id !== on.id) } }
  if (!p) return { ok: false, reason: 'There is no such point.' }
  if (p.bind) return { ok: false, reason: 'A point that follows a shape cannot be an anchor: disconnect it first.' }
  if (marksOf(s).some(m => m.kind === 'pose' && markPoint(s, m) === i)) return { ok: false, reason: 'A posable point cannot also be an anchor: take it off first.' }
  if (marksOf(s).length >= MARKS_MAX) return { ok: false, reason: `A shape may have at most ${MARKS_MAX} marks.` }
  return { ok: true, shape: { ...s, marks: [...marksOf(s), { id, kind: 'anchor', x: p.x, y: p.y, i, name: '' }] } }
}
// An anchor inside the shape (in its own drawing space).
export function addFreeAnchor(s: ModelShape, x: number, y: number, id = freshMarkId(s)): Made {
  if (marksOf(s).length >= MARKS_MAX) return { ok: false, reason: `A shape may have at most ${MARKS_MAX} marks.` }
  return { ok: true, shape: { ...s, marks: [...marksOf(s), { id, kind: 'anchor', x: r2(x), y: r2(y), i: null, name: '' }] } }
}
// A posable point on point i (shape types T5), or the one there taken away. A point has one mark at most.
export function togglePosable(s: ModelShape, i: number, id = freshMarkId(s)): Made {
  const on = marksOf(s).find(m => m.kind === 'pose' && markPoint(s, m) === i), p = s.pts[i]
  if (on) return { ok: true, shape: { ...s, marks: marksOf(s).filter(m => m.id !== on.id) } }
  if (!p) return { ok: false, reason: 'There is no such point.' }
  if (anchorOn(s, i)) return { ok: false, reason: 'An anchored point cannot also be posable: take its anchor off first.' }
  if (marksOf(s).length >= MARKS_MAX) return { ok: false, reason: `A shape may have at most ${MARKS_MAX} marks.` }
  return { ok: true, shape: { ...s, marks: [...marksOf(s), { id, kind: 'pose', x: p.x, y: p.y, i, name: '' }] } }
}
export const posableOn = (s: ModelShape, i: number): ModelMark | undefined => marksOf(s).find(m => m.kind === 'pose' && markPoint(s, m) === i)
// A posable point inside the shape (in its own drawing space).
export function addFreePosable(s: ModelShape, x: number, y: number, id = freshMarkId(s)): Made {
  if (marksOf(s).length >= MARKS_MAX) return { ok: false, reason: `A shape may have at most ${MARKS_MAX} marks.` }
  return { ok: true, shape: { ...s, marks: [...marksOf(s), { id, kind: 'pose', x: r2(x), y: r2(y), i: null, name: '' }] } }
}
export const removeMark = (s: ModelShape, id: string): ModelShape => ({ ...s, marks: marksOf(s).filter(m => m.id !== id) })

// Where a mark is in the shape's own space: a mark on the centre (C1) is wherever the centre is now, any other where it was put.
export const markXY = (s: Pick<ModelShape, 'pts' | 'closed' | 'rot' | 'sym'>, m: ModelMark): [number, number] => (m.c ? centreOf(s) ?? [m.x, m.y] : [m.x, m.y])
export const centreAnchorOf = (s: ModelShape): ModelMark | undefined => anchorsOf(s).find(m => m.c)
// An anchor on the shape's centre (C1), or off again: the shape is pinned there and turns about it.
export function toggleCentreAnchor(s: ModelShape): Made {
  const on = centreAnchorOf(s)
  if (on) return { ok: true, shape: removeMark(s, on.id) }
  const mid = centreOf(s)
  if (!mid) return { ok: false, reason: 'This shape has no points.' }
  if (marksOf(s).length >= MARKS_MAX) return { ok: false, reason: `A shape may have at most ${MARKS_MAX} marks.` }
  return { ok: true, shape: { ...s, marks: [...marksOf(s), { id: freshMarkId(s), kind: 'anchor', x: r2(mid[0]), y: r2(mid[1]), i: null, name: '', c: true }] } }
}
export const renameMark = (s: ModelShape, id: string, name: string): ModelShape => ({ ...s, marks: marksOf(s).map(m => (m.id === id ? { ...m, name: name.slice(0, 40) } : m)) })

// ---- what an edit does to the anchors ----

// The matrix that takes one outline to the other when the whole shape was moved, turned, flipped or resized (null when its points were changed one by one). A three-point
// shape counts only when all three moved, so a drag of one corner is not taken for a change of the whole.
export function affineOf(a: ModelPoint[], b: ModelPoint[]): Mat | null {
  if (a.length !== b.length || a.length < 3) return null
  if (a.length === 3 && a.some((p, i) => near(p, b[i].x, b[i].y))) return null
  const p0 = a[0]
  let k1 = 1, best = -1
  a.forEach((p, i) => { const d = Math.hypot(p.x - p0.x, p.y - p0.y); if (d > best) { best = d; k1 = i } })
  let k2 = -1, area = 0
  a.forEach((p, i) => { const s = Math.abs((a[k1].x - p0.x) * (p.y - p0.y) - (a[k1].y - p0.y) * (p.x - p0.x)); if (s > area) { area = s; k2 = i } })
  if (k2 < 0 || area < 1e-6) return null
  const ux = a[k1].x - p0.x, uy = a[k1].y - p0.y, vx = a[k2].x - p0.x, vy = a[k2].y - p0.y
  const det = ux * vy - vx * uy
  const qx = b[k1].x - b[0].x, qy = b[k1].y - b[0].y, wx = b[k2].x - b[0].x, wy = b[k2].y - b[0].y
  // L·[u v] = [q w]
  const l00 = (qx * vy - wx * uy) / det, l01 = (wx * ux - qx * vx) / det, l10 = (qy * vy - wy * uy) / det, l11 = (wy * ux - qy * vx) / det
  const m: Mat = [l00, l10, l01, l11, b[0].x - (l00 * p0.x + l01 * p0.y), b[0].y - (l10 * p0.x + l11 * p0.y)]
  return a.every((p, i) => { const [x, y] = apply(m, p.x, p.y); return Math.abs(x - b[i].x) < 0.03 && Math.abs(y - b[i].y) < 0.03 }) ? m : null
}
const isMove = (m: Mat): boolean => Math.abs(m[0] - 1) < 1e-4 && Math.abs(m[3] - 1) < 1e-4 && Math.abs(m[1]) < 1e-4 && Math.abs(m[2]) < 1e-4
const still = (m: Mat): boolean => isMove(m) && Math.abs(m[4]) < 0.02 && Math.abs(m[5]) < 0.02

export type Guard = { ok: true; shape: ModelShape } | { ok: false; reason: string }

// An edit of a shape (old to next) as its anchors allow it: refused when it would move an anchor (or take an anchored point away), turned about the anchor when the shape has
// one and the edit changed the whole shape, the marks carried along (an anchor stays put; another mark goes with its point, or with the shape when the whole was changed).
// The marks are next's (an edit may add, take away or name one); where they go is worked out from old's outline.
export function guardAnchors(old: ModelShape, next: ModelShape): Guard {
  const marks = marksOf(next)
  if (!marks.length) return { ok: true, shape: next }
  // a mark on the centre (C1) is read where the centre was
  const atCentre = (sh: ModelShape, m: ModelMark): ModelMark => { if (!m.c) return m; const [x, y] = markXY(sh, m); return { ...m, x, y, i: null } }
  const before = new Map(marksOf(old).map(m => [m.id, atCentre(old, m)]))
  const sameCount = old.pts.length === next.pts.length
  // a point that follows another shape stays with it whatever the shape does, so the free points tell whether the whole shape was changed
  const free = sameCount ? old.pts.flatMap((p, i) => (p.bind ? [] : [i])) : []
  const pick = (list: ModelPoint[]) => (free.length >= 3 && free.length < list.length ? free.map(i => list[i]) : list)
  let aff = sameCount ? affineOf(pick(old.pts), pick(next.pts)) : null
  if (aff && still(aff)) aff = null
  // where an edit puts a mark that old had: null when its point went
  const goes = (m: ModelMark, shape: ModelShape): [number, number] | null => {
    const k = markPoint(old, m)
    if (k !== null) {
      if (sameCount) { const p = shape.pts[k]; return [p.x, p.y] }
      const j = shape.pts.findIndex(q => near(q, m.x, m.y))
      return j >= 0 ? [m.x, m.y] : null
    }
    return aff ? apply(aff, m.x, m.y) : [m.x, m.y]
  }
  let out = next
  const anchors = marks.filter(m => m.kind === 'anchor' && before.has(m.id)).map(m => before.get(m.id)!)
  if (anchors.length) {
    const to = anchors.map(m => goes(m, next))
    if (to.some(t => t === null)) return { ok: false, reason: 'An anchored point cannot be taken away: take its anchor off first (right-click the point).' }
    const moved = anchors.some((m, k) => !near({ x: to[k]![0], y: to[k]![1] }, m.x, m.y))
    if (moved) {
      if (anchors.length > 1) return { ok: false, reason: 'Two anchors hold this shape where it is.' }
      if (!aff) return { ok: false, reason: 'An anchored point cannot be moved: take its anchor off first (right-click the point).' }
      if (isMove(aff)) return { ok: false, reason: 'An anchored shape cannot be moved: it turns about its anchor.' }
      const m = anchors[0], [tx, ty] = to[0]!, pin = translate(m.x - tx, m.y - ty)
      out = transformShape(next, pin)
      aff = mul(pin, aff)
    }
  }
  const kept = marks.map(m => {
    const was = before.get(m.id)
    if (!was) return m
    if (m.c) { const [x, y] = markXY(out, m); return { ...m, x: r2(x), y: r2(y), i: null } }
    if (m.kind === 'anchor') {
      const j = was.i === null ? -1 : out.pts.findIndex(q => near(q, was.x, was.y))
      return { ...m, x: was.x, y: was.y, i: j >= 0 ? j : null }
    }
    const k = markPoint(old, was)
    if (k !== null) {
      const j = sameCount ? k : out.pts.findIndex(q => near(q, was.x, was.y))
      const p = out.pts[j]
      return p ? { ...m, x: p.x, y: p.y, i: j } : { ...m, i: null }
    }
    if (aff) { const [x, y] = apply(aff, was.x, was.y); return { ...m, x: r2(x), y: r2(y) } }
    return m
  })
  return { ok: true, shape: { ...out, marks: kept } }
}
