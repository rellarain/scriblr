import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping'
import type { MapShape, MapShapePoint } from '../../../../api/types'
import { allRings, ringsOf, type XY } from './mapOutline'
import { MAX_POINTS, isClosed } from './mapShapes'

// Combining shapes: merge two into one, cut one out of another (which leaves a hole, or bites into its edge), or split one along a line. The outlines as
// drawn (their rough edge too) are combined as polygons (polygon-clipping), then simplified back to points: smooth points when the shapes were curved,
// corners when they were not. The result keeps the chosen shape's id and what it is drawn with; its rough edge is now part of its outline.

export type CombineAction = 'merge' | 'cut' | 'split'
export const COMBINE_ACTIONS: Array<{ id: CombineAction; name: string; title: string }> = [
  { id: 'merge', name: 'Merge with…', title: 'Pick another shape of the same kind on the map: the two become one' },
  { id: 'cut', name: 'Cut out…', title: 'Pick a shape on the map: where it lies over this one is cut out of it (a hole, or a bite out of its edge)' },
  { id: 'split', name: 'Split along…', title: 'Pick a line on the map that crosses this shape: it is cut in pieces along the line' },
]

// The smallest area (in cells) a piece keeps; smaller bits are dropped.
const MIN_AREA = 0.02

const toRing = (ring: XY[]): Ring => {
  const r: Ring = ring.map(p => [p.x, p.y])
  if (r.length > 0) r.push([r[0][0], r[0][1]])
  return r
}

// A shape as a geometry: its rings by the even-odd rule (a ring inside is a hole, a ring apart another piece).
function geometryOf(shape: MapShape): MultiPolygon {
  const rings = allRings(shape).filter(r => r.length >= 3).map(toRing)
  if (rings.length === 0) return []
  if (rings.length === 1) return [[rings[0]]]
  return polygonClipping.xor([rings[0]], ...rings.slice(1).map((r): Polygon => [r]))
}

function area(ring: Ring): number {
  let a = 0
  for (let i = 0; i + 1 < ring.length; i += 1) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return Math.abs(a) / 2
}

// Douglas-Peucker on a closed ring (without its repeated last point).
function simplify(points: XY[], tolerance: number): XY[] {
  if (points.length <= 4) return points
  const keep = new Uint8Array(points.length)
  // Split the ring at its two points farthest apart, so both halves are open runs.
  let far = 0, best = -1
  for (let i = 1; i < points.length; i += 1) { const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y); if (d > best) { best = d; far = i } }
  keep[0] = 1; keep[far] = 1
  const run = (from: number, to: number) => {
    const stack: Array<[number, number]> = [[from, to]]
    while (stack.length > 0) {
      const [a, b] = stack.pop()!
      const pa = points[a % points.length], pb = points[b % points.length]
      let idx = -1, dmax = 0
      for (let i = a + 1; i < b; i += 1) {
        const p = points[i % points.length]
        const dx = pb.x - pa.x, dy = pb.y - pa.y
        const len = Math.hypot(dx, dy)
        const d = len === 0 ? Math.hypot(p.x - pa.x, p.y - pa.y) : Math.abs(dy * p.x - dx * p.y + pb.x * pa.y - pb.y * pa.x) / len
        if (d > dmax) { dmax = d; idx = i }
      }
      if (idx >= 0 && dmax > tolerance) { keep[idx % points.length] = 1; stack.push([a, idx], [idx, b]) }
    }
  }
  run(0, far)
  run(far, points.length)
  return points.filter((_, i) => keep[i])
}

// A ring of the result as points of a shape: simplified (more, until it has at most MAX_POINTS), smooth or corners.
function pointsOf(ring: Ring, smooth: boolean): MapShapePoint[] {
  const open: XY[] = ring.slice(0, -1).map(([x, y]) => ({ x, y }))
  let tol = smooth ? 0.08 : 0.01
  let pts = simplify(open, tol)
  while (pts.length > MAX_POINTS) { tol *= 1.6; pts = simplify(open, tol) }
  return pts.map(p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, smooth, hx: null, hy: null }))
}

// Whether the shapes were mostly drawn with curves.
const curved = (...shapes: MapShape[]) => {
  const all = shapes.flatMap(s => [s.points, ...(s.holes ?? [])]).flat()
  return all.filter(p => p.smooth).length * 2 > all.length
}

// The pieces of a geometry big enough to keep, largest first.
const pieces = (geom: MultiPolygon): Polygon[] =>
  geom.map(poly => poly.filter((ring, k) => k > 0 || area(ring) >= MIN_AREA)).filter(poly => poly.length > 0 && area(poly[0]) >= MIN_AREA).sort((a, b) => area(b[0]) - area(a[0]))

// The chosen shape remade from a geometry: the largest piece its outline, the rest (holes, other pieces) its other rings.
function remade(shape: MapShape, geom: MultiPolygon, smooth: boolean): MapShape | null {
  const polys = pieces(geom)
  if (polys.length === 0) return null
  const [first, ...rest] = polys
  const holes = [...first.slice(1), ...rest.flat()].map(r => pointsOf(r, smooth)).filter(r => r.length >= 3)
  const points = pointsOf(first[0], smooth)
  if (points.length < 3) return null
  const next: MapShape = { ...shape, points, rough: 0, kind: null }
  delete next.seed
  if (holes.length > 0) next.holes = holes
  else delete next.holes
  return next
}

export type CombineResult = { shapes: MapShape[]; removed: string[] } | { refused: string }

// Merge `other` into `shape` (both closed and of the same kind: two biome areas, or two regions). The other one goes.
export function mergeShapes(shape: MapShape, other: MapShape): CombineResult {
  if (shape.id === other.id) return { refused: 'Pick another shape to merge with.' }
  if (!isClosed(shape) || !isClosed(other) || (shape.type === 'biome') !== (other.type === 'biome')) return { refused: 'Only two biome areas, or two regions, can be merged.' }
  const geom = polygonClipping.union(geometryOf(shape), geometryOf(other))
  const next = remade(shape, geom, curved(shape, other))
  return next ? { shapes: [next], removed: [other.id] } : { refused: 'Nothing is left of the two shapes.' }
}

// Cut `cutter` (any closed shape) out of `shape`. The cutter stays where it is.
export function cutShape(shape: MapShape, cutter: MapShape): CombineResult {
  if (shape.id === cutter.id) return { refused: 'Pick another shape to cut out.' }
  if (!isClosed(shape) || !isClosed(cutter)) return { refused: 'Only a closed shape can be cut out of a closed shape.' }
  const geom = polygonClipping.difference(geometryOf(shape), geometryOf(cutter))
  if (geom.length === 0) return { refused: 'That would cut the whole shape away: delete it instead.' }
  const next = remade(shape, geom, curved(shape))
  if (!next) return { refused: 'That would cut the whole shape away: delete it instead.' }
  if (sameOutline(shape, next)) return { refused: 'The two shapes do not overlap.' }
  return { shapes: [next], removed: [] }
}

const sameOutline = (a: MapShape, b: MapShape) => (a.holes?.length ?? 0) === (b.holes?.length ?? 0) && Math.abs(area(toRing(ringsOf(a).outer)) - area(toRing(ringsOf(b).outer))) < 1e-6

// Split `shape` along a line into pieces: each piece is a shape of its own (the first keeps the id; the others get ids from `makeId`). The line stays.
export function splitShape(shape: MapShape, line: MapShape, makeId: () => string): CombineResult {
  if (!isClosed(shape)) return { refused: 'Only a closed shape can be split.' }
  if (line.type !== 'line') return { refused: 'Pick a line to split along.' }
  const path = ringsOf(line).outer
  if (path.length < 2) return { refused: 'Pick a line to split along.' }
  // The line as a thin band (a quad for each piece of it), cut out of the shape.
  const e = 0.01
  const quads: Polygon[] = []
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i], b = path[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-9) continue
    const nx = (-(b.y - a.y) / len) * e, ny = ((b.x - a.x) / len) * e
    const ux = ((b.x - a.x) / len) * e, uy = ((b.y - a.y) / len) * e
    quads.push([[[a.x - ux + nx, a.y - uy + ny], [b.x + ux + nx, b.y + uy + ny], [b.x + ux - nx, b.y + uy - ny], [a.x - ux - nx, a.y - uy - ny], [a.x - ux + nx, a.y - uy + ny]]])
  }
  if (quads.length === 0) return { refused: 'Pick a line to split along.' }
  const band = polygonClipping.union(quads[0], ...quads.slice(1))
  const polys = pieces(polygonClipping.difference(geometryOf(shape), band))
  if (polys.length < 2) return { refused: 'The line does not cut the shape in two: draw it right across.' }
  const smooth = curved(shape)
  const out: MapShape[] = []
  polys.forEach((poly, k) => {
    const piece = remade(k === 0 ? shape : { ...shape, id: makeId(), name: '', mapIds: [] }, [poly], smooth)
    if (piece) out.push(piece)
  })
  return out.length >= 2 ? { shapes: out, removed: [] } : { refused: 'The line does not cut the shape in two: draw it right across.' }
}
