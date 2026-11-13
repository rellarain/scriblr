import type { MapEllipse, MapShape, MapShapePoint } from '../../../../api/types'
import { flatten, isClosed } from './mapShapes'

// The outline of a shape as it is drawn: its rings (the outline and its holes, each a polyline in cells) with the rough edge applied. One function, so the
// fill, the heights and picking always agree. A shape's `holes` are more rings filled with the outline by the even-odd rule: a ring inside the outline is a
// hole, a ring apart from it is another piece. A rough edge is a seeded wobble of every ring (a few octaves of smooth noise along it, pushed out or in
// along the edge), so the same shape is always the same; the points of the shape stay where they are, so it is edited as before.

export interface XY { x: number; y: number }
export interface Rings { outer: XY[]; holes: XY[][] }

export const ROUGH_MAX = 100
// The longest a ring gets when it is made rough (pieces about this long, at most this many).
const ROUGH_STEP = 0.2
const ROUGH_POINTS = 2400

// A ring of points as a polyline (a closed ring does not repeat its first point at the end).
const ringOf = (points: MapShapePoint[], closed: boolean): XY[] => {
  const f = flatten({ type: closed ? 'region' : 'line', points }).map(p => ({ x: p.x, y: p.y }))
  if (closed && f.length > 1 && Math.hypot(f[0].x - f[f.length - 1].x, f[0].y - f[f.length - 1].y) < 1e-9) f.pop()
  return f
}

// A hash of an integer and a seed to 0..1.
function hash(i: number, seed: number): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Smooth noise along a ring of length 1 that wraps (`cells` lattice points round it), -1 to 1.
function wrapNoise(t: number, cells: number, seed: number): number {
  const u = t * cells
  const i = Math.floor(u), f = u - i
  const a = hash(((i % cells) + cells) % cells, seed), b = hash((((i + 1) % cells) + cells) % cells, seed)
  const s = f * f * (3 - 2 * f)
  return (a + (b - a) * s) * 2 - 1
}

// The ring (or line) cut into even pieces about `step` long, keeping its corners, and its length.
function resample(ring: XY[], closed: boolean): { pts: XY[]; length: number } {
  const path = closed && ring.length > 0 ? [...ring, ring[0]] : ring
  let length = 0
  for (let i = 0; i + 1 < path.length; i += 1) length += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y)
  if (length === 0) return { pts: ring.slice(), length }
  const step = Math.max(ROUGH_STEP, length / ROUGH_POINTS)
  const out: XY[] = []
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i], b = path[i + 1]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (d < 1e-9) continue
    out.push(a)
    const k = Math.ceil(d / step)
    for (let j = 1; j < k; j += 1) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k })
  }
  if (!closed && path.length > 0) out.push(path[path.length - 1])
  return { pts: out, length }
}

// A ring made rough: each point pushed along the edge's normal by a few octaves of noise, as much as `rough` (0-100) of a quarter of the longest wave,
// the waves sized to the shape (`size`, its diagonal). A line keeps its ends where they are.
export function roughen(ring: XY[], closed: boolean, rough: number, seed: number, size: number): XY[] {
  if (!(rough > 0) || ring.length < 2) return ring
  const { pts, length } = resample(ring, closed)
  if (pts.length < 3 || length === 0) return ring
  const wave = Math.max(0.5, Math.min(8, size * 0.12))
  const amp = (Math.min(rough, ROUGH_MAX) / 100) * wave * 0.32
  // Distances along the ring.
  const along: number[] = [0]
  for (let i = 1; i < pts.length; i += 1) along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const total = closed ? length : along[along.length - 1] || 1
  const n = pts.length
  return pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
    let tx = next.x - prev.x, ty = next.y - prev.y
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl; ty /= tl
    let d = 0, weight = 1, sum = 0
    for (let o = 0; o < 4; o += 1) {
      const cells = Math.max(1, Math.round(total / (wave / 2 ** o)))
      d += wrapNoise(along[i] / total, cells, seed + o * 7919) * weight
      sum += weight
      weight *= 0.5
    }
    let k = amp * (d / sum)
    // A line keeps its ends: the wobble fades in over the first and last wave.
    if (!closed) k *= Math.min(1, along[i] / wave, (total - along[i]) / wave)
    return { x: p.x - ty * k, y: p.y + tx * k }
  })
}

const cache = new WeakMap<MapShape, Rings>()

// The rings of a shape as drawn (cached per shape object: a changed shape is a new object).
export function ringsOf(shape: MapShape): Rings {
  const hit = cache.get(shape)
  if (hit) return hit
  // An orbit is its ellipse, as a closed path (the first point again at the end).
  if (shape.type === 'orbit') {
    const pts = shape.ellipse ? ellipseRing(shape.ellipse, 96) : []
    const rings = { outer: pts.length > 0 ? [...pts, pts[0]] : [], holes: [] }
    cache.set(shape, rings)
    return rings
  }
  const closed = isClosed(shape)
  const outer0 = ringOf(shape.points, closed)
  const holes0 = closed ? (shape.holes ?? []).filter(h => h.length >= 3).map(h => ringOf(h, true)) : []
  const rough = shape.rough ?? 0
  let rings: Rings = { outer: outer0, holes: holes0 }
  if (rough > 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of outer0) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    const size = Math.hypot(x1 - x0, y1 - y0) || 1
    const seed = shape.seed ?? 0
    rings = { outer: roughen(outer0, closed, rough, seed, size), holes: holes0.map((h, k) => roughen(h, true, rough, seed + 101 * (k + 1), size)) }
  }
  cache.set(shape, rings)
  return rings
}

// Every ring of a closed shape (the outline first).
export const allRings = (shape: MapShape): XY[][] => { const r = ringsOf(shape); return [r.outer, ...r.holes] }

// Whether a point is inside a closed shape: inside an odd number of its rings (so a hole is outside, another piece inside).
export function insideShape(shape: MapShape, x: number, y: number): boolean {
  if (!isClosed(shape)) return false
  let inside = false
  for (const ring of allRings(shape)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i], b = ring[j]
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
  }
  return inside
}

// How far a point is from the drawn edge of a shape (any of its rings), in cells.
export function distanceToEdge(shape: MapShape, x: number, y: number): number {
  const closed = isClosed(shape)
  let best = Infinity
  for (const ring of closed ? allRings(shape) : [ringsOf(shape).outer]) {
    const n = ring.length
    const count = closed ? n : n - 1
    for (let i = 0; i < count; i += 1) {
      const a = ring[i], b = ring[(i + 1) % n]
      const dx = b.x - a.x, dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
      best = Math.min(best, Math.hypot(x - (a.x + dx * u), y - (a.y + dy * u)))
    }
  }
  return best
}

// Whether a shape's drawn outline is not its points' own curve (rough, or with more rings): then it is drawn from its rings.
export const drawnFromRings = (shape: MapShape) => shape.type === 'orbit' || (shape.rough ?? 0) > 0 || (isClosed(shape) && (shape.holes?.length ?? 0) > 0)

// A point of an ellipse at an angle (degrees, 0 = its own right, clockwise on the map), turned by its turn.
export function ellipseAt(e: MapEllipse, angle: number): XY {
  const a = (angle * Math.PI) / 180, t = (e.turn * Math.PI) / 180
  const lx = e.rx * Math.cos(a), ly = e.ry * Math.sin(a)
  return { x: e.cx + lx * Math.cos(t) - ly * Math.sin(t), y: e.cy + lx * Math.sin(t) + ly * Math.cos(t) }
}

// An ellipse as `n` points round it.
export const ellipseRing = (e: MapEllipse, n: number): XY[] => Array.from({ length: n }, (_, k) => ellipseAt(e, (k / n) * 360))

// A seed for a new rough shape.
export const newSeed = () => Math.floor(Math.random() * 2 ** 31)
