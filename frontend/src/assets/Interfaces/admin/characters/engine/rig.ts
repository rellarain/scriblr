import type { ModelAttach, ModelContent, ModelDrive, ModelGroup, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { IDENTITY, apply, boxOf, build, clamp, edgeAt, flatten, inverse, mul, pathText, reflectList, rotate, scale, translate, twinIndex, windSign, type Box, type BuiltPoint, type Mat } from './geometry'
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
  // The points as drawn in the group's own space, after links and sliders (what the canvas edits when no slider changes the points). In the back view a
  // shape with an outline of its own for the back shows that one.
  local: ModelPoint[]
  // The same for the rig: always the front outline, which anchors, links and recorded moves refer to by number, so both views move together.
  rig: ModelPoint[]
  // The curve points of the rig outline with the group's matrix only (an anchor or a link reads these).
  pre: BuiltPoint[]
  // Local space to canvas space.
  matrix: Mat
  // The group's matrix alone: local space to the model's space, before the whole-model transform.
  frame: Mat
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
export function anchorFrom(c: ModelContent, shapes: Record<string, { pre: BuiltPoint[]; rig?: ModelPoint[]; frame?: Mat }>, att: ModelAttach, values: Values): [number, number] | null {
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
  // a relative place inside the shape's box in the shape's own space, carried to the model's space by its group (so a turning shape takes the place with it)
  const own = shapes[att.shape]
  if (own.rig && own.frame && own.rig.length >= 3) {
    const lb = boxOf(own.rig.map((p): [number, number] => [p.x, p.y]))
    return apply(own.frame, lb.x + lb.w * att.rx, lb.y + lb.h * att.ry)
  }
  const bb = boxOf(a.map((p): [number, number] => [p.x, p.y]))
  return [bb.x + bb.w * att.rx, bb.y + bb.h * att.ry]
}

// How loose a shape is: the value of its looseness slider over the slider's rest (1 at rest, or with no slider). Links keep their distance times this.
export function looseFactor(c: ModelContent, shape: Pick<ModelShape, 'loose'>, values: Values): number {
  const r = shape.loose ? rangeById(c, shape.loose) : undefined
  return r && r.rest > 0 ? clamp(valueOf(r, values) / r.rest, 0, 4) : 1
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
  const RF: Mat = [-1, 0, 0, 1, 2 * axis, 0]   // the reflection about the model's axis
  const flip: Mat = view === 'back' ? RF : IDENTITY
  const G = mul(scale(gx, gy, axis, 392), flip)

  const shapeMap = new Map(c.shapes.map(s => [s.id, s]))
  const groupMap = new Map(c.groups.map(g => [g.id, g]))
  const groupOfShape = new Map<string, string>()
  const objectShapes = new Map(c.objects.map(o => [o.id, o.shapes]))
  for (const g of c.groups) for (const oid of g.objects) for (const sid of objectShapes.get(oid) ?? []) if (!groupOfShape.has(sid)) groupOfShape.set(sid, g.id)

  const out: Solved = { shapes: {}, order: [], mats: {}, pivots: {}, anchors: {}, global: G }
  // Groups and shapes are solved when something asks for them (an anchor asks for a shape, a shape for its group, a link for another shape); a thing that
  // is being solved is not asked for again, so a circle of anchors or links cannot loop: it is cut where it closes.
  const busyGroups = new Set<string>(), busyShapes = new Set<string>()

  // what the sliders do to a list of points (a recorded move, a bend, a scale of the shape); `own` is the shape's own outline, which the moves were recorded on
  function drive(sh: ModelShape, list: ModelPoint[], own: ModelPoint[]) {
    if (list.length < 3) return
    let rest: [number, number] | null = null
    for (const r of ranges) {
      const v = val(r), { t, up } = pull(r, v)
      if (t === 0) continue
      for (const d of r.drives) {
        if (d.kind === 'scale' && d.target === 'shape' && d.id === sh.id) {
          rest = rest ?? centreOfPoints(own, sh.closed)
          const f = factorOf(r, d, v), fx = d.axis === 'y' ? 1 : f, fy = d.axis === 'x' ? 1 : f
          for (const p of list) {
            p.x = rest[0] + (p.x - rest[0]) * fx; p.y = rest[1] + (p.y - rest[1]) * fy
            if (p.hi) p.hi = [p.hi[0] * fx, p.hi[1] * fy]
            if (p.ho) p.ho = [p.ho[0] * fx, p.ho[1] * fy]
          }
        } else if (d.kind === 'points' && d.shape === sh.id && list.length === own.length) {
          const moved = new Set(d.moves.map(m => m.i))
          for (const m of d.moves) {
            const p = list[m.i]
            if (!p) continue
            const dx = (up ? m.dx : m.dxMin) * t, dy = (up ? m.dy : m.dyMin) * t
            p.x += dx; p.y += dy
            if (d.sym) {
              const j = twinIndex(own, m.i, axis, 4)
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
  }

  // Points linked to another shape take its place: on one of its points (plus an offset), or at a spot along one of its edges, some way outward. The
  // target is read where the rig has put it (the model's space) and brought into this shape's group space. Looseness stretches the offsets.
  function link(sh: ModelShape, list: ModelPoint[], Mg: Mat) {
    if (!list.some(p => p.bind)) return
    const f = looseFactor(c, sh, values)
    let inv: Mat | null = null
    for (const p of list) {
      const b = p.bind
      if (!b || b.s === sh.id) continue
      const a = shapeOut(b.s)?.pre
      if (!a || a.length < 1) continue
      const n = a.length
      let wx: number, wy: number
      if (b.kind === 'point') { const q = a[b.i % n]; wx = q.x; wy = q.y }
      else [wx, wy] = edgeAt(a, windSign(a), b.e % n, b.t, b.o * f)
      inv = inv ?? inverse(Mg)
      const [lx, ly] = apply(inv, wx, wy)
      const x = lx + (b.kind === 'point' ? b.d[0] * f : 0), y = ly + (b.kind === 'point' ? b.d[1] * f : 0)
      if (Number.isFinite(x) && Number.isFinite(y)) { p.x = x; p.y = y }
    }
  }

  function place(sh: ModelShape, groupId: string | null, Mg: Mat) {
    const original = sh.mirrorOf && sh.mirrorOf !== sh.id ? shapeMap.get(sh.mirrorOf) : undefined
    const twin = original && !original.mirrorOf ? original : undefined
    let rig: ModelPoint[], drawn: ModelPoint[], closed = sh.closed
    if (twin) {
      // a twin is the mirror image of its original as the original is drawn: its points are the reflection of the original's (in the group's own space,
      // so a group turned with the original is turned the other way round on the twin's side)
      const o = shapeOut(twin.id)
      rig = o ? reflectList(o.rig, axis) : []
      drawn = o ? reflectList(o.local, axis) : []
      closed = twin.closed
    } else {
      rig = sh.pts.map(copyPoint)
      link(sh, rig, Mg)
      drive(sh, rig, sh.pts)
      drawn = rig
      if (view === 'back' && sh.back && sh.back.length >= 3) {
        drawn = sh.back.map(copyPoint)
        link(sh, drawn, Mg)
        drive(sh, drawn, sh.back)
      }
    }
    const ok = rig.length >= 3 && drawn.length >= 3
    const matrix = mul(G, Mg)
    const fin = ok ? build(drawn, closed, matrix) : []
    const poly = ok ? flatten(fin, closed) : []
    out.shapes[sh.id] = {
      id: sh.id, group: groupId, local: drawn, rig, matrix, frame: Mg,
      pre: ok ? build(rig, closed, Mg) : [],
      d: ok ? pathText(fin, closed) : '', poly, box: poly.length ? boxOf(poly) : NO_BOX,
      visible: ok && (sh.view === 'both' || sh.view === view), z: view === 'back' && sh.zBack != null ? sh.zBack : sh.z,
    }
  }

  function shapeOut(id: string): SolvedShape | undefined {
    const done = out.shapes[id]
    if (done) return done
    const sh = shapeMap.get(id)
    if (!sh || busyShapes.has(id)) return undefined
    busyShapes.add(id)
    const gid = groupOfShape.get(id) ?? null
    place(sh, gid, gid ? groupMat(gid) : IDENTITY)
    busyShapes.delete(id)
    return out.shapes[id]
  }

  function groupMat(id: string): Mat {
    const done = out.mats[id]
    if (done) return done
    const g = groupMap.get(id)
    if (!g || busyGroups.has(id)) return IDENTITY
    busyGroups.add(id)
    const original = g.mirrorOf && g.mirrorOf !== id ? groupMap.get(g.mirrorOf) : undefined
    let Mg: Mat
    if (original && !original.mirrorOf) {
      // A twin group does what its original does, mirrored, from where its own parent stands: the original's movement relative to its parent (turned,
      // scaled, moved by its anchor), reflected about the axis, applied in the twin's parent's frame. With the same parent for both (the torso), a lean of
      // the torso carries both arms alike; with twin parents (left arm and forearm) it is the plain reflection of the original.
      const Mpo = original.parent ? groupMat(original.parent) : IDENTITY
      const Mpt = g.parent ? groupMat(g.parent) : IDENTITY
      Mg = mul(Mpt, mul(RF, mul(inverse(Mpo), mul(groupMat(original.id), RF))))
      const po = out.pivots[original.id]
      const pw = po ? apply(Mpt, ...apply(RF, ...apply(inverse(Mpo), po[0], po[1]))) : [axis, 200]
      out.pivots[id] = [pw[0], pw[1]]
      out.anchors[id] = null
    } else {
      const pm = (g.parent ? groupMat(g.parent) : undefined) ?? IDENTITY
      const pv = g.pivot ?? restPivot(c, g)
      let bm = pm
      let an: [number, number] | null = null
      if (g.attach) {
        const target = shapeOut(g.attach.shape)
        an = anchorFrom(c, target ? { [g.attach.shape]: target } : {}, g.attach, values)
        if (an) { const pw = apply(pm, pv[0], pv[1]); bm = mul(translate(an[0] - pw[0], an[1] - pw[1]), pm) }
      }
      const pw2 = apply(bm, pv[0], pv[1])
      let angle = 0, sx = 1, sy = 1
      for (const r of ranges) for (const d of r.drives) {
        if (d.kind === 'turn' && d.group === id) angle += amount(r, d, val(r))
        else if (d.kind === 'scale' && d.target === 'group' && d.id === id) {
          const f = factorOf(r, d, val(r))
          if (d.axis !== 'y') sx *= f
          if (d.axis !== 'x') sy *= f
        }
      }
      Mg = mul(rotate(angle, pw2[0], pw2[1]), mul(scale(sx, sy, pw2[0], pw2[1]), bm))
      out.pivots[id] = [pw2[0], pw2[1]]
      out.anchors[id] = g.attach ? an : null
    }
    if (!finiteMat(Mg)) Mg = IDENTITY
    out.mats[id] = Mg
    busyGroups.delete(id)
    return Mg
  }

  for (const g of groupOrder(c)) groupMat(g.id)
  for (const sh of c.shapes) shapeOut(sh.id)   // a shape in no group stands still

  const visible = Object.values(out.shapes).filter(s => s.visible)
  out.order = drawOrder(c, visible.map(s => ({ id: s.id, z: s.z }))).map(s => s.id)
  return out
}

// The solved model with every slider at rest.
export const solveAtRest = (c: ModelContent, view: View = 'front'): Solved => solve(c, defaultValues(c), view)
