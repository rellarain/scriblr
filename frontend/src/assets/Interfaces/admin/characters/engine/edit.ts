import type { ModelPoint, ModelPointMode, ModelShape } from '../../../../../api/types'
import { LIMITS } from './limits'
import { SWAP, autoHandles, bezierAt, build, hasIn, hasOut, r2, transformList, translate, twinIndex } from './geometry'
import { templatePoints } from './templates'
import type { Box } from './geometry'

// Editing a shape's points. Every function is pure: it returns a new shape and leaves the one it was given alone, so undo is a stack of shapes.
// With `mirror` on, a point and the point that mirrors it about the axis (x = 100 unless `axis` says otherwise) move together, so a symmetric
// outline stays symmetric.

export interface EditOptions {
  mirror?: boolean
  snap?: boolean
  axis?: number
  // The most points a shape may have (adding stops there) and the fewest (deleting stops there).
  max?: number
  min?: number
}

const axisOf = (o: EditOptions): number => o.axis ?? 100

const copyPoint = (p: ModelPoint): ModelPoint => ({ ...p, hi: p.hi ? [p.hi[0], p.hi[1]] : p.hi, ho: p.ho ? [p.ho[0], p.ho[1]] : p.ho })
const copyShape = (s: ModelShape): ModelShape => ({ ...s, pts: s.pts.map(copyPoint) })

const twinOf = (s: ModelShape, i: number, o: EditOptions): number => (o.mirror ? twinIndex(s.pts, i, axisOf(o)) : i)

// Move point i to (x, y). A point on the axis stays on it while mirroring; snapping rounds to half a unit and pulls to the axis.
export function movePoint(shape: ModelShape, i: number, x: number, y: number, o: EditOptions = {}): ModelShape {
  const s = copyShape(shape), p = s.pts[i]
  if (!p) return s
  const ax = axisOf(o), j = twinOf(s, i, o)
  if (o.mirror && Math.abs(p.x - ax) < 0.01) x = ax
  if (o.snap) {
    x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2
    if (Math.abs(x - ax) < 1.2) x = ax
  }
  p.x = r2(x); p.y = r2(y)
  if (j !== i) { s.pts[j].x = r2(2 * ax - p.x); s.pts[j].y = p.y }
  return s
}

// Move a point by an offset (keyboard nudging); Shift's bigger step is the caller's.
export function nudgePoint(shape: ModelShape, i: number, dx: number, dy: number, o: EditOptions = {}): ModelShape {
  const p = shape.pts[i]
  return p ? movePoint(shape, i, p.x + dx, p.y + dy, { ...o, snap: false }) : copyShape(shape)
}

// Drag a handle ('hi' = the one before the point, 'ho' = the one after) to (x, y). A curve point keeps its two handles in line; a snap turns the
// handle in steps of 15 degrees; a point on the axis keeps its handles horizontal/vertical while mirroring.
export function moveHandle(shape: ModelShape, i: number, which: 'hi' | 'ho', x: number, y: number, o: EditOptions = {}): ModelShape {
  const s = copyShape(shape), p = s.pts[i]
  if (!p) return s
  const ax = axisOf(o), h = autoHandles(s.pts, true)[i]
  let d: [number, number] = [r2(x - p.x), r2(y - p.y)]
  if (o.snap) {
    const a = Math.atan2(d[1], d[0]), step = Math.PI / 12, na = Math.round(a / step) * step, l = Math.hypot(d[0], d[1])
    d = [r2(Math.cos(na) * l), r2(Math.sin(na) * l)]
  }
  if (o.mirror && Math.abs(p.x - ax) < 0.01) d = [which === 'ho' ? Math.abs(d[0]) * (p.ho && p.ho[0] < 0 ? -1 : 1) : d[0], 0]
  p[which] = d
  const other: 'hi' | 'ho' = which === 'ho' ? 'hi' : 'ho'
  if (p.m === 'c') {
    const l2 = Math.hypot(h[other][0], h[other][1]), l1 = Math.hypot(d[0], d[1]) || 1
    p[other] = [r2((-d[0] / l1) * l2), r2((-d[1] / l1) * l2)]
  }
  const j = twinOf(s, i, o)
  if (j !== i) {
    const q = s.pts[j], dw = p[which] as [number, number]
    q[which === 'ho' ? 'hi' : 'ho'] = [-dw[0], dw[1]]
    const od = p[other]
    if (od) q[other === 'ho' ? 'hi' : 'ho'] = [-od[0], od[1]]
  }
  return s
}

export function setMode(shape: ModelShape, i: number, mode: ModelPointMode, o: EditOptions = {}): ModelShape {
  const s = copyShape(shape)
  if (!s.pts[i]) return s
  s.pts[i].m = mode
  const j = twinOf(s, i, o)
  if (j !== i) s.pts[j].m = SWAP[mode]
  return s
}

// A click on a point steps its handles through: none (sharp), both (curve), the incoming one only (curve, then sharp: the left handle) and the outgoing one only
// (sharp, then curve: the right handle), and round to none again.
export const NEXT_MODE: Record<ModelPointMode, ModelPointMode> = { s: 'c', c: 'cs', cs: 'sc', sc: 's' }
export function cycleMode(shape: ModelShape, i: number, o: EditOptions = {}): ModelShape {
  const p = shape.pts[i]
  return p ? setMode(shape, i, NEXT_MODE[p.m] ?? 's', o) : copyShape(shape)
}

// ---- segments (the shape editor): segment e is the side from point e to the next point ----
// A point's mode with its incoming (or outgoing) curve handle on or off, the other side as it was.
export const withIn = (m: ModelPointMode, on: boolean): ModelPointMode => (on ? (hasOut(m) ? 'c' : 'cs') : hasOut(m) ? 'sc' : 's')
export const withOut = (m: ModelPointMode, on: boolean): ModelPointMode => (on ? (hasIn(m) ? 'c' : 'sc') : hasIn(m) ? 'cs' : 's')
// Whether segment e is curved: straight only when neither end has a curve handle on its side.
export function segmentCurved(shape: ModelShape, e: number): boolean {
  const n = shape.pts.length, a = shape.pts[e], b = shape.pts[(e + 1) % n]
  return !!a && !!b && (hasOut(a.m) || hasIn(b.m))
}
// Segment e made straight (its ends lose their handles on its side) or curved (they get automatic ones). The last point of an open shape has no segment after it.
export function toggleSegment(shape: ModelShape, e: number): ModelShape {
  const s = copyShape(shape), n = s.pts.length
  if (!s.pts[e] || n < 2 || (!shape.closed && e >= n - 1)) return s
  const curved = segmentCurved(shape, e), a = s.pts[e], b = s.pts[(e + 1) % n]
  a.m = withOut(a.m, !curved); b.m = withIn(b.m, !curved)
  if (!curved) { a.ho = null; b.hi = null }
  return s
}

// Back to the automatic handles.
export function resetHandles(shape: ModelShape, i: number, o: EditOptions = {}): ModelShape {
  const s = copyShape(shape)
  if (!s.pts[i]) return s
  s.pts[i].hi = null; s.pts[i].ho = null
  const j = twinOf(s, i, o)
  if (j !== i) { s.pts[j].hi = null; s.pts[j].ho = null }
  return s
}

// The middle of the edge after point i.
function edgeMiddle(list: ModelPoint[], i: number): [number, number] {
  const a = build(list, true), n = a.length, p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
  if (!o && !ii) return [(p.x + q.x) / 2, (p.y + q.y) / 2]
  const c1: [number, number] = o ? [p.hox, p.hoy] : [p.x, p.y], c2: [number, number] = ii ? [q.hix, q.hiy] : [q.x, q.y]
  return [0.125 * p.x + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * q.x, 0.125 * p.y + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * q.y]
}

// Add a point in the middle of the edge after point i (and, while mirroring, in the middle of the mirrored edge). Returns the new shape and the
// index of the new point, or -1 (and the shape unchanged) when the point limit stops it.
export function addPoint(shape: ModelShape, i: number, o: EditOptions = {}): { shape: ModelShape; index: number } {
  const s = copyShape(shape), max = o.max ?? LIMITS.pointsMax, n = s.pts.length, ax = axisOf(o)
  if (n >= max || !s.pts[i]) return { shape: s, index: -1 }
  // the new point's edge is the second half of the edge it splits, so it keeps that edge's outline (per-edge outlines)
  const unlined = (k: number) => (s.pts[k]?.line === false ? { line: false as const } : {})
  const mid = edgeMiddle(s.pts, i), np: ModelPoint = { x: r2(mid[0]), y: r2(mid[1]), m: 'c', hi: null, ho: null, ...unlined(i) }
  const ti = o.mirror ? twinIndex(s.pts, i, ax) : i, tj = o.mirror ? twinIndex(s.pts, (i + 1) % n, ax) : (i + 1) % n
  if (o.mirror && ti !== i && tj !== (i + 1) % n && ti !== tj && n + 2 <= max) {
    const after = Math.min(ti, tj) === 0 && Math.max(ti, tj) === n - 1 ? n - 1 : Math.min(ti, tj)
    const tw: ModelPoint = { x: r2(2 * ax - np.x), y: np.y, m: 'c', hi: null, ho: null, ...unlined(after) }
    if (after > i) { s.pts.splice(after + 1, 0, tw); s.pts.splice(i + 1, 0, np); return { shape: s, index: i + 1 } }
    s.pts.splice(i + 1, 0, np); s.pts.splice(after + 1, 0, tw)
    return { shape: s, index: i + 1 }
  }
  s.pts.splice(i + 1, 0, np)
  return { shape: s, index: i + 1 }
}

// Delete point i (and its mirror twin while mirroring). Returns null when the shape would drop below the fewest points (three).
export function deletePoint(shape: ModelShape, i: number, o: EditOptions = {}): ModelShape | null {
  const s = copyShape(shape), min = o.min ?? 3, ti = twinOf(s, i, o)
  if (!s.pts[i] || s.pts.length <= min) return null
  if (ti !== i && s.pts.length - 2 >= min) { s.pts.splice(Math.max(i, ti), 1); s.pts.splice(Math.min(i, ti), 1) }
  else s.pts.splice(i, 1)
  return s
}

// The two points of segment e (from point e to the next) joined into one, at the middle of the segment (shape types T2: Ctrl + click on a segment). The joined point comes in
// as point e came in and goes out as the next point went out. Null when the shape would be left with too few points.
export function joinSegment(shape: ModelShape, e: number, min = 3): ModelShape | null {
  const n = shape.pts.length
  if (n <= min || !shape.pts[e] || (!shape.closed && e >= n - 1)) return null
  const j = (e + 1) % n, a = shape.pts[e], b = shape.pts[j]
  const mid = bezierAt(build(shape.pts, shape.closed), e, 0.5)
  const inHas = hasIn(a.m), outHas = hasOut(b.m)
  const m: ModelPointMode = inHas && outHas ? 'c' : inHas ? 'cs' : outHas ? 'sc' : 's'
  // it goes out along the next point's edge, with that edge's outline
  const { line: _line, ...rest } = a
  const joined: ModelPoint = { ...rest, x: r2(mid.x), y: r2(mid.y), m, hi: a.hi ?? null, ho: b.ho ?? null, ...(b.line === false ? { line: false as const } : {}) }
  return { ...shape, pts: shape.pts.map((p, k) => (k === e ? joined : p)).filter((_, k) => k !== j) }
}

// The whole shape moves.
export function moveShape(shape: ModelShape, dx: number, dy: number): ModelShape {
  const moved: ModelShape = { ...shape, pts: transformList(shape.pts, translate(dx, dy)).map(p => ({ ...p, x: r2(p.x), y: r2(p.y) })) }
  // a symmetric shape's middle goes with it (shape editor S6)
  if (shape.sym) moved.sym = { ...shape.sym, cx: r2(shape.sym.cx + dx), cy: r2(shape.sym.cy + dy) }
  return moved
}

// The shape takes a template's points in a box; its name, id, order and the rest stay.
export function applyTemplate(shape: ModelShape, templateId: string, box: Box): ModelShape {
  const pts = templatePoints(templateId, box)
  if (!pts.length) return copyShape(shape)
  const next: ModelShape = { ...shape, pts, template: templateId, half: 0 }
  // a template starts with its frame square to the page (shape editor S4), and not symmetric (S6)
  if (next.rot) next.rot = 0
  if (next.sym) next.sym = null
  return next
}

// A new shape from a template.
export function newShape(id: string, name: string, templateId: string, box: Box): ModelShape {
  return applyTemplate({ id, name, closed: true, z: 40, op: 1, view: 'both', pts: [], half: 0, template: null }, templateId, box)
}

// A shape whose outline is mirror-symmetric about the axis (within half a unit), so mirror editing makes sense for it.
export function isSymmetric(shape: ModelShape, axis = 100): boolean {
  return shape.pts.length > 0 && shape.pts.every((p, i) => { const t = twinIndex(shape.pts, i, axis, 0.5); return t !== i || Math.abs(p.x - axis) < 0.5 })
}
