import type { MapLineStyle, MapPattern, MapShape, MapShapePoint, MapShapeType } from '../../../../api/types'

// Lines and regions on a map, as geometry: pure functions on a shape. A shape is a list of points in cells; a line is open and a region is closed (its last
// point joins its first). A point is a corner, or smooth: the curve passes through it with a handle, a cubic Bezier between each pair of points whose
// control points are the handles (the curve leaves a point along its handle and arrives at the next along the other side of that point's handle).
// A smooth point with no handle of its own gets the one the points either side of it make (Catmull-Rom), so a smooth line is a good curve with no
// editing at all, and a dragged handle is for the places where it is not.

type V = [number, number]
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const MIN_POINTS: Record<MapShapeType, number> = { line: 2, region: 3, biome: 3 }
export const MAX_POINTS = 500
export const SHAPE_WIDTH_RANGE = { min: 0.05, max: 4 } as const
export const LINE_STYLES: Array<{ id: MapLineStyle; name: string }> = [
  { id: 'solid', name: 'Solid' }, { id: 'dashed', name: 'Dashed' }, { id: 'dotted', name: 'Dotted' }, { id: 'road', name: 'Double road' }, { id: 'wall', name: 'Wall' }, { id: 'fence', name: 'Fence' },
]
export const PATTERNS: Array<{ id: MapPattern; name: string }> = [
  { id: 'solid', name: 'Solid' }, { id: 'hatch', name: 'Hatched' }, { id: 'cross', name: 'Cross-hatched' }, { id: 'dots', name: 'Dotted' },
]

// A region and a biome shape are closed (the last point joins the first); a line is open.
export const isClosed = (shape: Pick<MapShape, 'type'>) => shape.type !== 'line'

// ---- the curve ----

type PointLike = Pick<MapShapePoint, 'x' | 'y' | 'smooth' | 'hx' | 'hy'>

// Where the curve leaves point `i`, relative to it (zero for a corner).
export function outVector(points: PointLike[], i: number, closed: boolean): V {
  const p = points[i]
  if (!p || !p.smooth) return [0, 0]
  if (p.hx !== null && p.hy !== null) return [p.hx, p.hy]
  const n = points.length
  const prev = i > 0 ? points[i - 1] : closed && n > 2 ? points[n - 1] : null
  const next = i < n - 1 ? points[i + 1] : closed && n > 2 ? points[0] : null
  if (prev && next) return [(next.x - prev.x) / 6, (next.y - prev.y) / 6]
  if (next) return [(next.x - p.x) / 3, (next.y - p.y) / 3]
  if (prev) return [(p.x - prev.x) / 3, (p.y - prev.y) / 3]
  return [0, 0]
}

export interface Segment {
  from: number
  to: number
  a: V
  c1: V
  c2: V
  b: V
  // Both ends are corners: a straight line.
  straight: boolean
}

// The curve between each pair of points (a region also has the one from its last point back to its first).
export function segmentsOf(shape: Pick<MapShape, 'type' | 'points'>): Segment[] {
  const pts = shape.points
  const closed = isClosed(shape)
  const n = pts.length
  const out: Segment[] = []
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % n
    const oa = outVector(pts, i, closed), ob = outVector(pts, j, closed)
    const a: V = [pts[i].x, pts[i].y], b: V = [pts[j].x, pts[j].y]
    out.push({
      from: i, to: j, a, b, c1: [a[0] + oa[0], a[1] + oa[1]], c2: [b[0] - ob[0], b[1] - ob[1]],
      straight: oa[0] === 0 && oa[1] === 0 && ob[0] === 0 && ob[1] === 0,
    })
  }
  return out
}

export function bezierAt(s: Segment, t: number): V {
  if (s.straight) return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]
  const u = 1 - t
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
  return [w0 * s.a[0] + w1 * s.c1[0] + w2 * s.c2[0] + w3 * s.b[0], w0 * s.a[1] + w1 * s.c1[1] + w2 * s.c2[1] + w3 * s.b[1]]
}

export interface Sample { x: number; y: number; seg: number; t: number }
const STEPS = 14

// The shape as a polyline: each curve sampled, each straight piece its two ends (a region ends where it began).
export function flatten(shape: Pick<MapShape, 'type' | 'points'>, steps = STEPS): Sample[] {
  const out: Sample[] = []
  segmentsOf(shape).forEach((s, seg) => {
    const n = s.straight ? 1 : steps
    for (let k = 0; k < n; k += 1) { const [x, y] = bezierAt(s, k / n); out.push({ x, y, seg, t: k / n }) }
  })
  const segs = segmentsOf(shape)
  const last = segs[segs.length - 1]
  if (last) out.push({ x: last.b[0], y: last.b[1], seg: segs.length - 1, t: 1 })
  return out
}

// ---- where things are ----

export function pointInPolygon(poly: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i], b = poly[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export interface Nearest { dist: number; seg: number; t: number; x: number; y: number }

// The point of the shape's curve closest to (x, y): how far, which curve between points, and where along it (0-1).
export function nearestOnShape(shape: Pick<MapShape, 'type' | 'points'>, x: number, y: number): Nearest | null {
  const s = flatten(shape)
  let best: Nearest | null = null
  for (let i = 0; i + 1 < s.length; i += 1) {
    const a = s[i], b = s[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
    const px = a.x + dx * u, py = a.y + dy * u
    const dist = Math.hypot(x - px, y - py)
    if (!best || dist < best.dist) {
      // The sample after the last one of a curve belongs to the next curve; its t is 0 there, so take the end of this one.
      const bt = b.seg === a.seg ? b.t : 1
      best = { dist, seg: a.seg, t: a.t + (bt - a.t) * u, x: px, y: py }
    }
  }
  return best
}

export function shapeBounds(shape: Pick<MapShape, 'type' | 'points' | 'width'>): Rect {
  const s = flatten(shape)
  const half = shape.width / 2
  const xs = s.map(p => p.x), ys = s.map(p => p.y)
  return { x0: Math.min(...xs) - half, y0: Math.min(...ys) - half, x1: Math.max(...xs) + half, y1: Math.max(...ys) + half }
}

// Whether a point is on a shape: near its line (within half its width and `slack`), or, for a region, inside it.
export function hitShape(shape: MapShape, x: number, y: number, slack = 0.3): boolean {
  if (shape.points.length < MIN_POINTS[shape.type]) return false
  if (isClosed(shape) && pointInPolygon(flatten(shape), x, y)) return true
  const near = nearestOnShape(shape, x, y)
  return near !== null && near.dist <= shape.width / 2 + slack
}

// The nearest corner or cell centre of the grid to a point (the snap for the points of a shape).
export function snapVertex(x: number, y: number): [number, number] {
  const corner: V = [Math.round(x), Math.round(y)]
  const centre: V = [Math.floor(x) + 0.5, Math.floor(y) + 0.5]
  return Math.hypot(x - corner[0], y - corner[1]) <= Math.hypot(x - centre[0], y - centre[1]) ? corner : centre
}

// ---- changing a shape (each returns a new shape; null when it cannot be done) ----

const withPoints = (shape: MapShape, points: MapShapePoint[]): MapShape => ({ ...shape, points })
const mapPoint = (shape: MapShape, i: number, fn: (p: MapShapePoint) => MapShapePoint): MapShape => withPoints(shape, shape.points.map((p, n) => (n === i ? fn(p) : p)))

export function movePoint(shape: MapShape, i: number, x: number, y: number): MapShape {
  return mapPoint(shape, i, p => ({ ...p, x, y }))
}

// Drag the handle of a point to (x, y) (a position on the map): the point becomes smooth and keeps that handle.
export function setHandle(shape: MapShape, i: number, x: number, y: number): MapShape {
  return mapPoint(shape, i, p => ({ ...p, smooth: true, hx: x - p.x, hy: y - p.y }))
}

// A corner becomes smooth (with the handle its neighbours make), a smooth point a corner.
export function toggleSmooth(shape: MapShape, i: number): MapShape {
  return mapPoint(shape, i, p => ({ ...p, smooth: !p.smooth, hx: null, hy: null }))
}

export function setAllSmooth(shape: MapShape, on: boolean): MapShape {
  return withPoints(shape, shape.points.map(p => ({ ...p, smooth: on, hx: null, hy: null })))
}

// A new point on the curve `seg` at `t` (so the curve keeps its shape as far as it can); smooth when either end of that curve is.
export function insertPoint(shape: MapShape, seg: number, t: number): MapShape | null {
  const s = segmentsOf(shape)[seg]
  if (!s || shape.points.length >= MAX_POINTS) return null
  const [x, y] = bezierAt(s, t)
  const smooth = shape.points[s.from].smooth || shape.points[s.to].smooth
  const points = [...shape.points]
  points.splice(seg + 1, 0, { x, y, smooth, hx: null, hy: null })
  return withPoints(shape, points)
}

// Take a point away; none when the shape would have too few left.
export function removePoint(shape: MapShape, i: number): MapShape | null {
  if (!shape.points[i] || shape.points.length <= MIN_POINTS[shape.type]) return null
  return withPoints(shape, shape.points.filter((_, n) => n !== i))
}

export function translateShape(shape: MapShape, dx: number, dy: number, width: number, height: number): MapShape {
  // Held as a whole: it stops at the edge of the map instead of squashing against it.
  const b = shapeBounds({ ...shape, width: 0 })
  const mx = Math.min(width - b.x1, Math.max(-b.x0, dx)), my = Math.min(height - b.y1, Math.max(-b.y0, dy))
  return withPoints(shape, shape.points.map(p => ({ ...p, x: p.x + mx, y: p.y + my })))
}

// ---- what a new shape is drawn with ----

export interface Pen {
  style: MapLineStyle
  color: string | null
  width: number
  // New points are smooth (a curve) or corners (straight pieces).
  smooth: boolean
  fill: string | null
  opacity: number
  pattern: MapPattern
}

const linePen = (style: MapLineStyle, color: string | null, width: number, smooth: boolean): Pen => ({ style, color, width, smooth, fill: null, opacity: 0.35, pattern: 'solid' })
const regionPen = (fill: string, opacity: number, pattern: MapPattern, color: string | null, style: MapLineStyle = 'solid', width = 0.15): Pen => ({ style, color, width, smooth: false, fill, opacity, pattern })

export const LINE_PRESETS: Array<{ id: string; name: string; pen: Pen }> = [
  { id: 'river', name: 'River', pen: linePen('solid', '#3b6ea5', 0.35, true) },
  { id: 'road', name: 'Road', pen: linePen('road', '#6b4a2b', 0.3, true) },
  { id: 'trail', name: 'Trail', pen: linePen('dotted', '#6b4a2b', 0.18, true) },
  { id: 'border', name: 'Border', pen: linePen('dashed', null, 0.16, false) },
  { id: 'wall', name: 'Wall', pen: linePen('wall', null, 0.22, false) },
  { id: 'fence', name: 'Fence', pen: linePen('fence', '#6b4a2b', 0.14, false) },
]
export const REGION_PRESETS: Array<{ id: string; name: string; pen: Pen }> = [
  { id: 'territory', name: 'Territory', pen: regionPen('#c06c84', 0.3, 'hatch', '#8a3a55', 'dashed') },
  { id: 'water', name: 'Water', pen: regionPen('#4a86b8', 0.45, 'solid', '#2f6593') },
  { id: 'forest', name: 'Forest', pen: regionPen('#4f8a4a', 0.4, 'dots', '#2f5f2c') },
  { id: 'danger', name: 'Danger', pen: regionPen('#b5342a', 0.28, 'cross', '#7e211a', 'dashed') },
]
export const DEFAULT_LINE_PEN: Pen = LINE_PRESETS[0].pen
export const DEFAULT_REGION_PEN: Pen = REGION_PRESETS[0].pen

// A new shape from the points that were clicked and the pen.
export function makeShape(id: string, layerId: string, type: MapShapeType, points: Array<[number, number]>, pen: Pen): MapShape {
  return {
    id, layerId, type, style: pen.style, color: pen.color, width: pen.width, fill: type === 'region' ? pen.fill : null, opacity: pen.opacity, pattern: type === 'region' ? pen.pattern : 'solid',
    points: points.map(([x, y]) => ({ x, y, smooth: pen.smooth, hx: null, hy: null })),
  }
}

// A new biome shape (an area of the land in a biome) from the points that were clicked.
export function makeBiomeShape(id: string, layerId: string, points: Array<[number, number]>, biome: string | null, smooth: boolean): MapShape {
  return {
    id, layerId, type: 'biome', style: 'solid', color: null, width: 0.25, fill: null, opacity: 1, pattern: 'solid', biome, heightMode: 'none', height: 0, name: '', mapIds: [],
    points: points.map(([x, y]) => ({ x, y, smooth, hx: null, hy: null })),
  }
}
