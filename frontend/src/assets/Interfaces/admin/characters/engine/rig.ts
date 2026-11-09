import type { ModelAttach, ModelContent, ModelDrive, ModelGroup, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { IDENTITY, apply, boxOf, build, clamp, flatten, mul, pathText, rotate, scale, translate, twinIndex, type Box, type BuiltPoint, type Mat } from './geometry'
import { drawOrder } from './order'

// The rig: groups hang from parent groups, are fixed to a shape of the parent by an anchor and turn about a pivot, and sliders (ranges) drive them.
// `solve` turns a model and the slider values into the place and outline of every shape. Ported from the mockup's `M.solve` (docs/mannequin-mockup/
// designer-engine.js) without colour and shading, which come in later phases. Pure and finite for any input, so it is tested in node.

export type Values = Record<string, number>
export type View = 'front' | 'back'

// ---- sliders ----

export const rangeById = (c: ModelContent, id: string): ModelRange | undefined => c.ranges.find(r => r.id === id)

// Every slider at rest: what the model is drawn as.
export function defaultValues(c: ModelContent): Values {
  const out: Values = {}
  for (const r of c.ranges) out[r.id] = r.rest
  return out
}

// A slider's value, held to its range (rest when it is missing or not a number).
export function valueOf(r: ModelRange, values: Values): number {
  const v = values[r.id]
  return clamp(Number.isFinite(v) ? v : r.rest, r.min, r.max)
}

// How far the value is from rest toward one end: 0 at rest, 1 at the end it is moving toward.
function pull(r: ModelRange, v: number): { t: number; up: boolean } {
  if (v >= r.rest) {
    const span = r.max - r.rest
    return { t: span > 0 ? (v - r.rest) / span : 0, up: true }
  }
  const span = r.rest - r.min
  return { t: span > 0 ? (r.rest - v) / span : 0, up: false }
}

// What a drive does at this value: `base` at rest, `atMax` at the maximum, `atMin` at the minimum, and in a straight line between (0 degrees at rest for a
// turn or a bend, 100 percent for a scale).
export function amount(r: ModelRange, d: ModelDrive, v: number, base = 0): number {
  const { t, up } = pull(r, v)
  return base + ((up ? d.atMax : d.atMin) - base) * t
}

// The sliders that change a shape's own points (a recorded move, a bend, a scale of the shape), as opposed to turning or scaling its group.
export const drivesShapePoints = (d: ModelDrive, shapeId: string): boolean =>
  (d.kind === 'points' && d.shape === shapeId) || (d.kind === 'bend' && d.shape === shapeId) || (d.kind === 'scale' && d.target === 'shape' && d.id === shapeId)

export function pointDrivers(c: ModelContent, shapeId: string): ModelRange[] {
  return c.ranges.filter(r => r.drives.some(d => drivesShapePoints(d, shapeId)))
}

// Whether a slider that changes this shape's points is away from rest, so the points on the canvas are not the ones that were drawn.
export function isPointDriven(c: ModelContent, values: Values, shapeId: string): boolean {
  return pointDrivers(c, shapeId).some(r => valueOf(r, values) !== r.rest)
}

// ---- groups ----

// Groups with the parents first (a cycle is cut where it closes, so every group comes out once).
export function groupOrder(c: ModelContent): ModelGroup[] {
  const byId = new Map(c.groups.map(g => [g.id, g]))
  const out: ModelGroup[] = [], done = new Set<string>()
  const visit = (g: ModelGroup, stack: Set<string>) => {
    if (done.has(g.id) || stack.has(g.id)) return
    stack.add(g.id)
    const parent = g.parent ? byId.get(g.parent) : undefined
    if (parent) visit(parent, stack)
    stack.delete(g.id)
    if (!done.has(g.id)) { done.add(g.id); out.push(g) }
  }
  for (const g of c.groups) visit(g, new Set())
  return out
}

// The groups from the root down to this one (empty for an unknown id; cycle-safe).
export function chainOf(c: ModelContent, groupId: string): string[] {
  const byId = new Map(c.groups.map(g => [g.id, g]))
  const chain: string[] = []
  let cur: ModelGroup | undefined = byId.get(groupId)
  while (cur && !chain.includes(cur.id)) {
    chain.unshift(cur.id)
    cur = cur.parent ? byId.get(cur.parent) : undefined
  }
  return chain
}
export const chainDepth = (c: ModelContent, groupId: string): number => chainOf(c, groupId).length

export function descendantsOf(c: ModelContent, groupId: string): Set<string> {
  const out = new Set<string>()
  const walk = (id: string) => { for (const g of c.groups) if (g.parent === id && !out.has(g.id) && g.id !== groupId) { out.add(g.id); walk(g.id) } }
  walk(groupId)
  return out
}

// How many levels this group and everything under it take (1 for a group with no child).
export function subtreeHeight(c: ModelContent, groupId: string): number {
  const walk = (id: string, seen: Set<string>): number => {
    let best = 0
    for (const g of c.groups) if (g.parent === id && !seen.has(g.id)) best = Math.max(best, walk(g.id, new Set([...seen, g.id])))
    return best + 1
  }
  return walk(groupId, new Set([groupId]))
}

// ---- the solver ----

export interface SolvedShape {
  id: string
  group: string | null
  // The points as drawn in the group's own space, after the sliders (what the canvas edits when no slider changes the points).
  local: ModelPoint[]
  // The curve points with the group's matrix only (an anchor reads these).
  pre: BuiltPoint[]
  // Local space to canvas space.
  matrix: Mat
  d: string
  poly: Array<[number, number]>
  box: Box
  visible: boolean
  z: number
}
export interface Solved {
  shapes: Record<string, SolvedShape>
  // The visible shapes, back to front.
  order: string[]
  // Each group's matrix (local space to the model's space, before the whole-model transform) and its pivot in that space.
  mats: Record<string, Mat>
  pivots: Record<string, [number, number]>
  // Where each attached group is fixed (null when its anchor cannot be found).
  anchors: Record<string, [number, number] | null>
  global: Mat
}

const finiteMat = (m: Mat): boolean => m.every(Number.isFinite)
const NO_BOX: Box = { x: 0, y: 0, w: 0, h: 0 }
const copyPoint = (p: ModelPoint): ModelPoint => ({ ...p, hi: p.hi ? [p.hi[0], p.hi[1]] : p.hi, ho: p.ho ? [p.ho[0], p.ho[1]] : p.ho })
const factorOf = (r: ModelRange, d: ModelDrive, v: number): number => Math.max(0.05, amount(r, d, v, 100) / 100)

function centreOfPoints(list: ModelPoint[], closed: boolean): [number, number] {
  if (list.length < 3) return [100, 200]
  const b = boxOf(flatten(build(list, closed), closed))
  return [b.x + b.w / 2, b.y + b.h / 2]
}

// Where a group turns when it has no pivot of its own: the middle of its shapes as drawn.
export function restPivot(c: ModelContent, g: ModelGroup): [number, number] {
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const objects = new Map(c.objects.map(o => [o.id, o]))
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false
  for (const oid of g.objects) {
    for (const sid of objects.get(oid)?.shapes ?? []) {
      const s = shapes.get(sid)
      if (!s || s.pts.length < 3) continue
      const b = boxOf(flatten(build(s.pts, s.closed), s.closed))
      any = true
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
  }
  return any ? [(x0 + x1) / 2, (y0 + y1) / 2] : [c.axis ?? 100, 200]
}

// Where an anchor is, from the solved points of the shape it is on: a point, a spot along an edge, anywhere along an edge that a slider moves, or a
// relative place inside the shape's box. `shapes` holds what is solved so far.
export function anchorFrom(c: ModelContent, shapes: Record<string, { pre: BuiltPoint[] }>, att: ModelAttach, values: Values): [number, number] | null {
  const a = shapes[att.shape]?.pre
  if (!a || a.length < 1) return null
  const n = a.length
  if (att.kind === 'point') { const q = a[att.i % n]; return q ? [q.x, q.y] : null }
  if (att.kind === 'edge' || att.kind === 'range') {
    let t = att.t
    if (att.kind === 'range') {
      const r = att.slider ? rangeById(c, att.slider) : undefined
      t = r && r.max > r.min ? clamp((valueOf(r, values) - r.min) / (r.max - r.min), 0, 1) : att.t
    }
    const p0 = a[att.i % n], p1 = a[(att.i + 1) % n]
    return [p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t]
  }
  const bb = boxOf(a.map((p): [number, number] => [p.x, p.y]))
  return [bb.x + bb.w * att.rx, bb.y + bb.h * att.ry]
}

export function solve(c: ModelContent, values: Values = {}, view: View = 'front'): Solved {
  const axis = c.axis ?? 100
  const ranges = c.ranges ?? []
  const val = (r: ModelRange) => valueOf(r, values)

  // the whole model: sliders that scale it (Height) about its feet, and the back view, which turns the figure round
  let gx = 1, gy = 1
  for (const r of ranges) for (const d of r.drives) {
    if (d.kind !== 'scale' || d.target !== 'model') continue
    const f = factorOf(r, d, val(r))
    if (d.axis !== 'y') gx *= f
    if (d.axis !== 'x') gy *= f
  }
  const flip: Mat = view === 'back' ? [-1, 0, 0, 1, 2 * axis, 0] : IDENTITY
  const G = mul(scale(gx, gy, axis, 392), flip)

  const shapeById = new Map(c.shapes.map(s => [s.id, s]))
  const groupOfShape = new Map<string, string>()
  const objectShapes = new Map(c.objects.map(o => [o.id, o.shapes]))
  for (const g of c.groups) for (const oid of g.objects) for (const sid of objectShapes.get(oid) ?? []) if (!groupOfShape.has(sid)) groupOfShape.set(sid, g.id)

  const out: Solved = { shapes: {}, order: [], mats: {}, pivots: {}, anchors: {}, global: G }

  // a shape's points in its group's space: as drawn, then what the sliders do to them
  function local(sh: ModelShape): ModelPoint[] {
    const list = sh.pts.map(copyPoint)
    if (list.length < 3) return list
    let rest: [number, number] | null = null
    for (const r of ranges) {
      const v = val(r), { t, up } = pull(r, v)
      if (t === 0) continue
      for (const d of r.drives) {
        if (d.kind === 'scale' && d.target === 'shape' && d.id === sh.id) {
          rest = rest ?? centreOfPoints(sh.pts, sh.closed)
          const f = factorOf(r, d, v), fx = d.axis === 'y' ? 1 : f, fy = d.axis === 'x' ? 1 : f
          for (const p of list) {
            p.x = rest[0] + (p.x - rest[0]) * fx; p.y = rest[1] + (p.y - rest[1]) * fy
            if (p.hi) p.hi = [p.hi[0] * fx, p.hi[1] * fy]
            if (p.ho) p.ho = [p.ho[0] * fx, p.ho[1] * fy]
          }
        } else if (d.kind === 'points' && d.shape === sh.id) {
          const moved = new Set(d.moves.map(m => m.i))
          for (const m of d.moves) {
            const p = list[m.i]
            if (!p) continue
            const dx = (up ? m.dx : m.dxMin) * t, dy = (up ? m.dy : m.dyMin) * t
            p.x += dx; p.y += dy
            if (d.sym) {
              const j = twinIndex(sh.pts, m.i, axis, 4)
              if (j !== m.i && !moved.has(j)) { list[j].x -= dx; list[j].y += dy }
            }
          }
        } else if (d.kind === 'bend' && d.shape === sh.id && d.pivot) {
          const angle = amount(r, d, v), [px, py] = d.pivot, span = d.y1 - d.y0 || 1
          for (const p of list) {
            let w = clamp((p.y - d.y0) / span, 0, 1)
            w = w * w * (3 - 2 * w)
            if (w <= 0) continue
            const m = rotate(angle * w, px, py), a = apply(m, p.x, p.y)
            p.x = a[0]; p.y = a[1]
            if (p.hi) p.hi = [m[0] * p.hi[0] + m[2] * p.hi[1], m[1] * p.hi[0] + m[3] * p.hi[1]]
            if (p.ho) p.ho = [m[0] * p.ho[0] + m[2] * p.ho[1], m[1] * p.ho[0] + m[3] * p.ho[1]]
          }
        }
      }
    }
    return list
  }

  function place(sh: ModelShape, groupId: string | null, Mg: Mat) {
    const list = local(sh)
    const ok = list.length >= 3
    const matrix = mul(G, Mg)
    const fin = ok ? build(list, sh.closed, matrix) : []
    const poly = ok ? flatten(fin, sh.closed) : []
    out.shapes[sh.id] = {
      id: sh.id, group: groupId, local: list, matrix,
      pre: ok ? build(list, sh.closed, Mg) : [],
      d: ok ? pathText(fin, sh.closed) : '', poly, box: poly.length ? boxOf(poly) : NO_BOX,
      visible: ok && (sh.view === 'both' || sh.view === view), z: sh.z,
    }
  }

  for (const g of groupOrder(c)) {
    const pm = (g.parent ? out.mats[g.parent] : undefined) ?? IDENTITY
    const pv = g.pivot ?? restPivot(c, g)
    let bm = pm
    let an: [number, number] | null = null
    if (g.attach) {
      an = anchorFrom(c, out.shapes, g.attach, values)
      if (an) { const pw = apply(pm, pv[0], pv[1]); bm = mul(translate(an[0] - pw[0], an[1] - pw[1]), pm) }
    }
    const pw2 = apply(bm, pv[0], pv[1])
    let angle = 0, sx = 1, sy = 1
    for (const r of ranges) for (const d of r.drives) {
      if (d.kind === 'turn' && d.group === g.id) angle += amount(r, d, val(r))
      else if (d.kind === 'scale' && d.target === 'group' && d.id === g.id) {
        const f = factorOf(r, d, val(r))
        if (d.axis !== 'y') sx *= f
        if (d.axis !== 'x') sy *= f
      }
    }
    let Mg = mul(rotate(angle, pw2[0], pw2[1]), mul(scale(sx, sy, pw2[0], pw2[1]), bm))
    if (!finiteMat(Mg)) Mg = IDENTITY
    out.mats[g.id] = Mg
    out.pivots[g.id] = [pw2[0], pw2[1]]
    out.anchors[g.id] = g.attach ? an : null
    for (const oid of g.objects) for (const sid of objectShapes.get(oid) ?? []) {
      const sh = shapeById.get(sid)
      if (sh && !out.shapes[sid] && groupOfShape.get(sid) === g.id) place(sh, g.id, Mg)
    }
  }
  // a shape in no group stands still
  for (const sh of c.shapes) if (!out.shapes[sh.id]) place(sh, null, IDENTITY)

  const visible = Object.values(out.shapes).filter(s => s.visible)
  out.order = drawOrder(c, visible.map(s => ({ id: s.id, z: s.z }))).map(s => s.id)
  return out
}

// The solved model with every slider at rest.
export const solveAtRest = (c: ModelContent, view: View = 'front'): Solved => solve(c, defaultValues(c), view)
