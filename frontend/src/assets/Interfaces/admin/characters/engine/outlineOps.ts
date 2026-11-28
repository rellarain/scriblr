import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addShape, objectOfShape, removeShape, shapeById, updateShape, type MakeId } from '../modelContent'
import { edgeLined } from './edges'
import { resetHandles, setMode, type EditOptions } from './edit'
import { fitCurve, type V } from './fitCurve'
import { IDENTITY, apply, build, hasIn, hasOut, inverse, mul, type Mat } from './geometry'
import { LIMITS } from './limits'
import type { Solved } from './rig'
import { done, fail, type Edit } from './rigEdit'

// Drawing (slice 9b): smoother outlines (smooth a point, smooth them all, simplify an outline to fewer points), and combining shapes (merge two into one, cut one out of
// another, split one along a drawn line). An outline is sampled densely, combined as polygons (polygon-clipping) where it is combined, and fitted back to curve points
// (Schneider's fit, engine/fitCurve.ts) with its corners kept as corners. Each edge of the result keeps the outline of the edge of the source it lies along (an edge along a
// cut is outlined). All pure: they return the new shape or content.

const r2 = (v: number) => Math.round(v * 100) / 100
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const len = (a: V) => Math.hypot(a[0], a[1])
const norm = (a: V): V => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0] }
const cubicAt = (p0: V, c1: V, c2: V, p3: V, t: number): V => {
  const u = 1 - t
  return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]
}

// ---- smoothing ----

// Point i made a smooth curve point with automatic handles (and its mirror twin while mirroring).
export function smoothPoint(shape: ModelShape, i: number, o: EditOptions = {}): ModelShape {
  return resetHandles(setMode(shape, i, 'c', o), i, o)
}
// Every point a smooth curve point with automatic handles.
export const smoothAll = (shape: ModelShape): ModelShape => ({ ...shape, pts: shape.pts.map(p => ({ ...p, m: 'c' as const, hi: null, ho: null })) })
// Whether every point is already a smooth curve point with automatic handles.
export const allSmooth = (shape: ModelShape): boolean => shape.pts.every(p => p.m === 'c' && !p.hi && !p.ho)

// ---- dense outlines ----

// An outline sampled densely: the samples, which are points of the outline that must stay (a corner, or a point linked to another shape), which of those are corners,
// and which edge of the outline each sample lies on.
interface Dense { pts: V[]; keep: boolean[]; corner: boolean[]; edge: number[]; from: number[] }
const STEPS = 16

function isCorner(b: ReturnType<typeof build>, i: number, closed: boolean): boolean {
  const n = b.length, p = b[i]
  if (!closed && (i === 0 || i === n - 1)) return true
  if (p.m !== 'c') return true
  const din = norm([p.x - p.hix, p.y - p.hiy]), dout = norm([p.hox - p.x, p.hoy - p.y])
  if (len(din) === 0 || len(dout) === 0) return false
  return din[0] * dout[0] + din[1] * dout[1] < Math.cos((15 * Math.PI) / 180)
}

// `even`: straight edges are sampled as finely as curved ones (to measure against, or to read an edge's outline from); otherwise a straight edge is its two ends.
function denseOf(list: ModelPoint[], closed: boolean, mat: Mat = IDENTITY, even = false): Dense {
  const b = build(list, closed, mat), n = b.length, last = closed ? n : n - 1
  const d: Dense = { pts: [], keep: [], corner: [], edge: [], from: [] }
  for (let e = 0; e < last; e++) {
    const p = b[e], q = b[(e + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
    const c1: V = o ? [p.hox, p.hoy] : [p.x, p.y], c2: V = ii ? [q.hix, q.hiy] : [q.x, q.y]
    const k = !o && !ii && !even ? 1 : STEPS
    const straight = !o && !ii
    for (let s = 0; s < k; s++) {
      d.pts.push(straight ? [p.x + ((q.x - p.x) * s) / k, p.y + ((q.y - p.y) * s) / k] : cubicAt([p.x, p.y], c1, c2, [q.x, q.y], s / k))
      const corner = s === 0 && isCorner(b, e, closed)
      d.corner.push(corner); d.keep.push(s === 0 && (corner || !!list[e].bind)); d.edge.push(e); d.from.push(s === 0 ? e : -1)
    }
  }
  if (!closed && n) { d.pts.push([b[n - 1].x, b[n - 1].y]); d.corner.push(true); d.keep.push(true); d.edge.push(n - 2); d.from.push(n - 1) }
  return d
}

// A ring of a combined polygon as a dense outline: its corners are where it turns sharply (the joins of two outlines, the ends of a cut).
function denseOfRing(ring: Ring): Dense {
  const pts: V[] = []
  for (const [x, y] of ring) { const q = pts[pts.length - 1]; if (!q || Math.hypot(x - q[0], y - q[1]) > 0.005) pts.push([x, y]) }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 0.005) pts.pop()
  const n = pts.length
  const corner = pts.map((p, i) => {
    const a = norm(sub(p, pts[(i + n - 1) % n])), b = norm(sub(pts[(i + 1) % n], p))
    return a[0] * b[0] + a[1] * b[1] < Math.cos((35 * Math.PI) / 180)
  })
  return { pts, keep: corner.slice(), corner, edge: pts.map(() => -1), from: pts.map(() => -1) }
}

// ---- fitting ----

interface Node { x: number; y: number; hin: V | null; hout: V | null; from: number }

// The curve points through a dense outline, within `tol` of it: the samples that must stay are points of the result (a corner keeps its corner; another keeps a smooth
// tangent through it), and the stretches between them are fitted with as few curves as the tolerance allows (a straight stretch is a straight edge).
function fitDense(d: Dense, closed: boolean, tol: number): Node[] {
  const n = d.pts.length
  if (n < 2) return []
  const at = (k: number): V => d.pts[closed ? ((k % n) + n) % n : Math.max(0, Math.min(n - 1, k))]
  let anchors = d.pts.map((_, i) => i).filter(i => d.keep[i])
  const smoothStart = new Set<number>()
  if (!closed) { if (anchors[0] !== 0) anchors.unshift(0); if (anchors[anchors.length - 1] !== n - 1) anchors.push(n - 1) }
  if (closed && anchors.length === 0) {
    let far = 0, best = -1
    for (let i = 1; i < n; i++) { const dd = len(sub(d.pts[i], d.pts[0])); if (dd > best) { best = dd; far = i } }
    anchors = [0, far]; smoothStart.add(0); smoothStart.add(far)
  } else if (closed && anchors.length === 1) {
    const other = (anchors[0] + Math.floor(n / 2)) % n
    anchors = [anchors[0], other].sort((a, b) => a - b); smoothStart.add(other)
  }
  const corner = (k: number) => d.corner[((k % n) + n) % n] && !smoothStart.has(((k % n) + n) % n)
  const tanOut = (k: number): V => (corner(k) ? norm(sub(at(k + 2), at(k))) : norm(sub(at(k + 1), at(k - 1))))
  const tanIn = (k: number): V => (corner(k) ? norm(sub(at(k - 2), at(k))) : norm(sub(at(k - 1), at(k + 1))))
  const nodes: Node[] = [{ x: d.pts[anchors[0]][0], y: d.pts[anchors[0]][1], hin: null, hout: null, from: d.from[anchors[0]] }]
  const runs = closed ? anchors.length : anchors.length - 1
  for (let r = 0; r < runs; r++) {
    const a = anchors[r], b = closed ? anchors[(r + 1) % anchors.length] : anchors[r + 1]
    const span = closed ? ((b - a + n) % n) || n : b - a
    const run: V[] = Array.from({ length: span + 1 }, (_, k) => at(a + k))
    const start = nodes[nodes.length - 1]
    const endNode = (): Node => (closed && r === runs - 1 ? nodes[0] : { x: at(b)[0], y: at(b)[1], hin: null, hout: null, from: d.from[((b % n) + n) % n] })
    // a straight stretch: no handles
    const chord = sub(run[run.length - 1], run[0]), cl = len(chord)
    const off = cl > 1e-9 ? Math.max(...run.map(p => Math.abs((p[0] - run[0][0]) * chord[1] - (p[1] - run[0][1]) * chord[0]) / cl)) : 0
    if (run.length <= 2 || off < 0.02) {
      const e = endNode()
      if (!(closed && r === runs - 1)) nodes.push(e)
      continue
    }
    const beziers = fitCurve(run, tol, tanOut(a), tanIn(b))
    beziers.forEach((z, i) => {
      if (i === 0) start.hout = z.c1
      else { const prev = nodes[nodes.length - 1]; prev.hout = z.c1 }
      const last = i === beziers.length - 1
      const node: Node = last ? endNode() : { x: z.p3[0], y: z.p3[1], hin: null, hout: null, from: -1 }
      node.hin = z.c2
      if (!(last && closed && r === runs - 1)) nodes.push(node)
    })
  }
  return nodes
}

function pointsOfNodes(nodes: Node[], source?: ModelPoint[]): ModelPoint[] {
  return nodes.map(nd => {
    const hi: [number, number] | null = nd.hin && Math.hypot(nd.hin[0] - nd.x, nd.hin[1] - nd.y) > 0.004 ? [r2(nd.hin[0] - nd.x), r2(nd.hin[1] - nd.y)] : null
    const ho: [number, number] | null = nd.hout && Math.hypot(nd.hout[0] - nd.x, nd.hout[1] - nd.y) > 0.004 ? [r2(nd.hout[0] - nd.x), r2(nd.hout[1] - nd.y)] : null
    const p: ModelPoint = { x: r2(nd.x), y: r2(nd.y), m: hi && ho ? 'c' : hi ? 'cs' : ho ? 'sc' : 's', hi, ho }
    // a point the outline kept carries what it had: its weight and its link to another shape
    const was = source && nd.from >= 0 ? source[nd.from] : undefined
    if (was?.w != null) p.w = was.w
    if (was?.bind) p.bind = was.bind
    return p
  })
}

// ---- how far apart two outlines are, and which edges keep the outline ----

function segDist(p: V, a: V, b: V): number {
  const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1]
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))
}
function oneWay(a: V[], b: V[], closed: boolean): number {
  let worst = 0
  const m = closed ? b.length : b.length - 1
  for (const p of a) { let best = Infinity; for (let i = 0; i < m; i++) best = Math.min(best, segDist(p, b[i], b[(i + 1) % b.length])); worst = Math.max(worst, best) }
  return worst
}
// The farthest either outline strays from the other.
export const outlineGap = (a: ModelPoint[], b: ModelPoint[], closed: boolean): number => {
  const da = denseOf(a, closed, IDENTITY, true).pts, db = denseOf(b, closed, IDENTITY, true).pts
  return Math.max(oneWay(da, db, closed), oneWay(db, da, closed))
}

// A source of edges for a result: an outline as samples (closed: the last runs back to the first), and whether the outline is drawn along the edge each sample starts.
interface EdgeSource { pts: V[]; lined: boolean[]; closed?: boolean }
const sourceOf = (list: ModelPoint[], closed: boolean, mat: Mat = IDENTITY): EdgeSource => {
  const d = denseOf(list, closed, mat, true)
  return { pts: d.pts, lined: d.edge.map(e => edgeLined(list, e)), closed }
}
// Each edge of the result takes the outline of the source edge it lies along (the nearest stretch of a source within `reach` of its middle); an edge along nothing (a cut)
// is outlined.
function withEdges(pts: ModelPoint[], closed: boolean, sources: EdgeSource[], reach = 0.6): ModelPoint[] {
  const b = build(pts, closed), n = b.length
  return pts.map((p, e) => {
    if (!closed && e === n - 1) return p
    const q = b[(e + 1) % n], a = b[e], o = hasOut(a.m), ii = hasIn(q.m)
    const mid = cubicAt([a.x, a.y], o ? [a.hox, a.hoy] : [a.x, a.y], ii ? [q.hix, q.hiy] : [q.x, q.y], [q.x, q.y], 0.5)
    let best = reach, lined = true
    for (const s of sources) {
      const m = s.closed === false ? s.pts.length - 1 : s.pts.length
      for (let k = 0; k < m; k++) { const dd = segDist(mid, s.pts[k], s.pts[(k + 1) % s.pts.length]); if (dd < best) { best = dd; lined = s.lined[k] } }
    }
    if (lined) { if (p.line !== false) return p; const { line: _l, ...rest } = p; return rest }
    return { ...p, line: false as const }
  })
}

// ---- what stops a shape being reshaped as a whole ----

// Why the outline of a shape cannot be replaced (simplified, merged, cut or split), or null: its points are referred to by number elsewhere, or it follows another shape.
export function reshapeBlock(c: ModelContent, shape: ModelShape, combining = false): string | null {
  const name = shape.name.trim() || 'This shape'
  if (shape.mirrorOf) return `${name} is a twin: reshape its original.`
  if (shape.cloneOf) return `${name} is a clone: reshape its original.`
  if (shape.sym) return `${name} is symmetric: its copies are made from its points. Turn symmetry off first.`
  if ((shape.turn?.angles ?? []).length > 0) return `${name} has outlines drawn at key angles.`
  if ((shape.skin ?? []).length > 0) return `${name} has skin weights on its points.`
  if ((shape.marks ?? []).some(m => m.i !== null)) return `${name} has marks on its points.`
  if (c.objects.some(o => (o.axes ?? []).some(a => a.options.some(f => f.ovr.some(v => v.shape === shape.id))))) return `${name} has outlines of its own in forms.`
  if (c.shapes.some(s => s.id !== shape.id && s.pts.some(p => p.bind?.s === shape.id))) return `Other shapes are connected to ${name}: disconnect them first.`
  if (combining && shape.pts.some(p => p.bind)) return `${name} has points connected to other shapes: disconnect them first.`
  if (combining && (shape.back ?? []).length > 0) return `${name} has an outline of its own for the back.`
  if (combining && !shape.closed) return `${name} is an open line: only closed shapes are combined.`
  return null
}

// ---- simplifying ----

export interface Simplified { pts: ModelPoint[]; gap: number }
// The fewest points the outline can be simplified to (its corners and connected points stay).
export function fewestPoints(shape: ModelShape): number {
  return Math.min(shape.pts.length, fitDense(denseOf(shape.pts, shape.closed), shape.closed, 1e6).length)
}
// The outline with at most `count` points, as close to it as that allows, and how far it strays from it.
export function simplifyTo(shape: ModelShape, count: number): Simplified {
  const d = denseOf(shape.pts, shape.closed)
  const at = (tol: number) => fitDense(d, shape.closed, tol)
  let lo = Math.log(0.002), hi = Math.log(1e6), best = at(1e6)
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2, nodes = at(Math.exp(mid))
    if (nodes.length <= count) { best = nodes; hi = mid } else lo = mid
  }
  const pts = withEdges(pointsOfNodes(best, shape.pts), shape.closed, [sourceOf(shape.pts, shape.closed)])
  return { pts, gap: r2(outlineGap(shape.pts, pts, shape.closed)) }
}

// ---- combining ----

const ringOf = (pts: V[]): Ring => (pts.length ? [...pts.map(p => [p[0], p[1]] as [number, number]), [pts[0][0], pts[0][1]]] : [])
const areaOf = (ring: Ring): number => { let a = 0; for (let i = 0; i + 1 < ring.length; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return Math.abs(a) / 2 }
const MIN_AREA = 0.5

// A ring as the points of a shape, within a tolerance that leaves it no more points than a shape may have.
function fitRing(ring: Ring, sources: EdgeSource[]): ModelPoint[] {
  const d = denseOfRing(ring)
  let tol = 0.05, nodes = fitDense(d, true, tol)
  while (nodes.length > LIMITS.pointsWarn && tol < 8) { tol *= 1.6; nodes = fitDense(d, true, tol) }
  return withEdges(pointsOfNodes(nodes), true, sources)
}

// The matrix from one shape's own space to another's, through the canvas.
function between(solved: Solved, fromId: string, toId: string): Mat | null {
  const a = solved.shapes[fromId]?.matrix, b = solved.shapes[toId]?.matrix
  return a && b ? mul(inverse(b), a) : null
}

// The pieces of a result, the largest first, each its outer ring (a piece with a hole keeps the hole only as a note).
function piecesOf(m: MultiPolygon): Ring[] {
  return m.map(poly => poly[0]).filter(r => areaOf(r) >= MIN_AREA).sort((a, b) => areaOf(b) - areaOf(a))
}

// The pieces after the first as shapes of their own beside the shape (its look, new ids, numbered names).
function addPieces(c: ModelContent, shape: ModelShape, rings: Ring[], sources: EdgeSource[], makeId: MakeId): { content: ModelContent; ids: string[] } {
  const home = objectOfShape(c, shape.id)
  let next = c, after = shape.id
  const ids: string[] = []
  rings.forEach((ring, k) => {
    if (!home) return
    const id = makeId('s')
    const piece: ModelShape = { ...shape, id, name: `${shape.name.trim() || 'Shape'} (piece ${k + 2})`, pts: fitRing(ring, sources), mirrorOf: null, cloneOf: null }
    next = addShape(next, home.id, piece, after)
    after = id
    ids.push(id)
  })
  return { content: next, ids }
}

// `otherId` merged into `keepId`: one outline round both (the kept shape keeps its look, its twin follows; the other is deleted). Refused when they do not touch.
export function mergeShapes(c: ModelContent, solved: Solved, keepId: string, otherId: string): Edit {
  const keep = shapeById(c, keepId), other = shapeById(c, otherId)
  if (!keep || !other || keepId === otherId) return fail('Pick another shape to merge with.')
  const why = reshapeBlock(c, keep, true) ?? reshapeBlock(c, other, true)
  if (why) return fail(why)
  const T = between(solved, otherId, keepId)
  if (!T) return fail('That shape is not drawn now.')
  const a = sourceOf(keep.pts, true), b = sourceOf(other.pts, true, T)
  const result = polygonClipping.union([ringOf(a.pts)], [ringOf(b.pts)])
  const pieces = piecesOf(result)
  if (pieces.length !== 1) return fail(`${keep.name.trim() || 'The shape'} and ${other.name.trim() || 'that shape'} do not touch: move one onto the other first.`)
  const holes = result[0].length > 1
  const merged = updateShape(c, keepId, s => ({ ...s, pts: fitRing(pieces[0], [a, b]) }))
  return done(removeShape(merged, otherId), holes ? 'The space the two shapes closed round is filled: a shape has one outline.' : undefined)
}

export interface CombineEdit { edit: Edit; pieces: string[] }

// `cutterId` cut out of `shapeId`: where it lies over the shape is taken away (a bite out of its edge, or the shape in pieces when it cuts right across; the pieces after the
// largest become shapes of their own). The cutter stays. Lying wholly inside the shape, it cuts a hole through the paint instead (the shape's Cut), and becomes a helper.
export function cutOutShape(c: ModelContent, solved: Solved, shapeId: string, cutterId: string, makeId: MakeId): CombineEdit {
  const shape = shapeById(c, shapeId), cutter = shapeById(c, cutterId)
  if (!shape || !cutter || shapeId === cutterId) return { edit: fail('Pick another shape to cut out.'), pieces: [] }
  const why = reshapeBlock(c, shape, true) ?? (cutter.closed ? null : `${cutter.name.trim() || 'That shape'} is an open line: only a closed shape cuts.`)
  if (why) return { edit: fail(why), pieces: [] }
  const T = between(solved, cutterId, shapeId)
  if (!T) return { edit: fail('That shape is not drawn now.'), pieces: [] }
  const a = sourceOf(shape.pts, true), cut = sourceOf(cutter.pts, true, T)
  const before = areaOf(ringOf(a.pts))
  const result = polygonClipping.difference([ringOf(a.pts)], [ringOf(cut.pts)])
  const pieces = piecesOf(result)
  if (pieces.length === 0) return { edit: fail(`${cutter.name.trim() || 'That shape'} covers the whole of ${shape.name.trim() || 'the shape'}.`), pieces: [] }
  const left = pieces.reduce((s, r) => s + areaOf(r), 0)
  if (Math.abs(before - left) < MIN_AREA && !result.some(p => p.length > 1)) return { edit: fail(`${cutter.name.trim() || 'That shape'} does not lie over ${shape.name.trim() || 'the shape'}.`), pieces: [] }
  if (result.some(p => p.length > 1) && pieces.length === 1) {
    // wholly inside: a hole, through the paint
    const holed = updateShape(c, shapeId, s => ({ ...s, cut: [...new Set([...(s.cut ?? []), cutterId])] }))
    return { edit: done(updateShape(holed, cutterId, s => ({ ...s, helper: true })), `${cutter.name.trim() || 'The cutter'} lies inside, so it cuts a hole through ${shape.name.trim() || 'the shape'} and is kept as a helper (not drawn) that can still be moved.`), pieces: [] }
  }
  const sources = [a, { pts: cut.pts, lined: cut.pts.map(() => true) }]
  let next = updateShape(c, shapeId, s => ({ ...s, pts: fitRing(pieces[0], sources) }))
  const added = addPieces(next, shape, pieces.slice(1), sources, makeId)
  next = added.content
  return { edit: done(next, added.ids.length ? `${shape.name.trim() || 'The shape'} is cut in ${added.ids.length + 1} pieces.` : undefined), pieces: added.ids }
}

// `shapeId` split along a line drawn on the canvas (in the canvas's space): each piece a shape (the largest keeps the shape; the others are new, beside it). The edges along
// the line are outlined.
export function splitShape(c: ModelContent, solved: Solved, shapeId: string, line: V[], makeId: MakeId): CombineEdit {
  const shape = shapeById(c, shapeId)
  if (!shape) return { edit: fail('There is no such shape.'), pieces: [] }
  const why = reshapeBlock(c, shape, true)
  if (why) return { edit: fail(why), pieces: [] }
  const M = solved.shapes[shapeId]?.matrix
  if (!M || line.length < 2) return { edit: fail('Draw a line right across the shape.'), pieces: [] }
  const back = inverse(M), path = line.map(([x, y]) => apply(back, x, y) as V)
  const e = 0.02, quads: Ring[][] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1], l = Math.hypot(bx - ax, by - ay)
    if (l < 1e-9) continue
    const nx = (-(by - ay) / l) * e, ny = ((bx - ax) / l) * e, ux = ((bx - ax) / l) * e, uy = ((by - ay) / l) * e
    quads.push([[[ax - ux + nx, ay - uy + ny], [bx + ux + nx, by + uy + ny], [bx + ux - nx, by + uy - ny], [ax - ux - nx, ay - uy - ny], [ax - ux + nx, ay - uy + ny]]])
  }
  if (quads.length === 0) return { edit: fail('Draw a line right across the shape.'), pieces: [] }
  const band = polygonClipping.union(quads[0], ...quads.slice(1))
  const a = sourceOf(shape.pts, true)
  const pieces = piecesOf(polygonClipping.difference([ringOf(a.pts)], band))
  if (pieces.length < 2) return { edit: fail('The line does not cut the shape in two: draw it right across.'), pieces: [] }
  const sources = [a]
  let next = updateShape(c, shapeId, s => ({ ...s, pts: fitRing(pieces[0], sources) }))
  const added = addPieces(next, shape, pieces.slice(1), sources, makeId)
  next = added.content
  return { edit: done(next, `${shape.name.trim() || 'The shape'} is split in ${pieces.length} pieces.`), pieces: added.ids }
}
