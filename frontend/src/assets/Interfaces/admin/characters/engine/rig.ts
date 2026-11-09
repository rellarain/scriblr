import type { ModelAttach, ModelBone, ModelBoneEnd, ModelContent, ModelDrive, ModelFallSide, ModelGroup, ModelObject, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { IDENTITY, apply, bezierAt, boxOf, build, clamp, edgeAt, flatten, inverse, mul, pathText, reflectList, rotate, scale, scaleAlong, translate, turnOf, twinIndex, windSign, type Box, type BuiltPoint, type Mat } from './geometry'
import { classKey, classesOf, membersOf, overrideFor, type Choices } from './forms'
import { applyFall, hangDirection, squeezeOf } from './fall'
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
  (d.kind === 'points' && d.shape === shapeId) || (d.kind === 'bend' && d.shape === shapeId) || (d.kind === 'fall' && d.shape === shapeId) || (d.kind === 'scale' && d.target === 'shape' && d.id === shapeId)

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
  // Switched off with the eye (its object, its group or a group above it), or by its class (a pattern that has members, a member of a family that is not the
  // one shown): it is solved all the same, but not drawn.
  off: boolean
  // How much of the shape shows, 0..1: a shape that fades in with a slider (a crease) is 0 until the slider reaches it. 1 for every other shape.
  fade: number
  // For a shape of a class member that has an outline of its own: the outline it would have following the template, drawn the same way ('' otherwise).
  ghost: string
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
// How far along its edge the outline of a bridge keeps going before it turns toward the other part, as a share of the gap.
const BRIDGE_REACH = 0.42

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

// Where a group turns with every slider at rest, in the model's own space: its pivot, or for a twin the reflection of its original's.
export function pivotAtRest(c: ModelContent, g: ModelGroup): [number, number] {
  const original = g.mirrorOf && g.mirrorOf !== g.id ? c.groups.find(x => x.id === g.mirrorOf) : undefined
  if (original && !original.mirrorOf) { const p = pivotAtRest(c, original); return [2 * (c.axis ?? 100) - p[0], p[1]] }
  return g.pivot ?? restPivot(c, g)
}

// Where a bone's end is with every slider at rest (null when the group, shape or point it names is not there).
export function boneEndAtRest(c: ModelContent, e: ModelBoneEnd): [number, number] | null {
  if (e.kind === 'group') { const g = c.groups.find(x => x.id === e.id); return g ? pivotAtRest(c, g) : null }
  const p = c.shapes.find(x => x.id === e.id)?.pts[e.i]
  return p ? [p.x, p.y] : null
}

// A bone at rest: from the pivot of its group to its end, in the model's own space (null when either cannot be found).
export function boneAtRest(c: ModelContent, b: ModelBone): { a: [number, number]; b: [number, number] } | null {
  const g = c.groups.find(x => x.id === b.start), end = boneEndAtRest(c, b.end)
  return g && end ? { a: pivotAtRest(c, g), b: end } : null
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

// What the admin has set besides the sliders (test state, never saved): the form each axis shows and the member each family shows (see forms.ts), the objects
// and groups switched off, and the objects to show whatever their class says (the pattern or the member being edited: a family then shows only those).
// `plain` draws every object scaled with its group, whatever its fit mode says (what fit modes are measured against).
// `fall` is the side things fall to (default: down).
export interface SolveOptions { forms?: Choices; hidden?: Iterable<string>; show?: Iterable<string>; plain?: boolean; fall?: ModelFallSide }

// The model with every slider at rest and every object scaled with its group, kept for the content it was solved from (a stretching object reads its target's
// box from it).
const plainRests = new WeakMap<ModelContent, Solved>()
function plainRest(c: ModelContent): Solved {
  let s = plainRests.get(c)
  if (!s) { s = solve(c, defaultValues(c), 'front', { plain: true }); plainRests.set(c, s) }
  return s
}

export function solve(c: ModelContent, values: Values = {}, view: View = 'front', opts: SolveOptions = {}): Solved {
  const axis = c.axis ?? 100
  const ranges = c.ranges ?? []
  const val = (r: ModelRange) => valueOf(r, values)
  const choices: Choices = opts.forms ?? {}
  const hidden = new Set(opts.hidden ?? [])
  const show = new Set(opts.show ?? [])
  const fallSide: ModelFallSide = opts.fall ?? 'down'

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
  const boneMap = new Map((c.bones ?? []).map(b => [b.id, b]))
  const groupOfShape = new Map<string, string>()
  const objectShapes = new Map(c.objects.map(o => [o.id, o.shapes]))
  for (const g of c.groups) for (const oid of g.objects) for (const sid of objectShapes.get(oid) ?? []) if (!groupOfShape.has(sid)) groupOfShape.set(sid, g.id)
  const objectMap = new Map(c.objects.map(o => [o.id, o]))
  const objectOfShape = new Map<string, string>()
  for (const o of c.objects) for (const sid of o.shapes) if (!objectOfShape.has(sid)) objectOfShape.set(sid, o.id)

  // The outline the chosen forms give a shape (undefined: it keeps its base outline; an empty list: the form hides it).
  const formOutline = (sid: string): ModelPoint[] | undefined => {
    const oid = objectOfShape.get(sid), o = oid ? objectMap.get(oid) : undefined
    return o ? overrideFor(o, sid, choices) : undefined
  }
  // The same for a shape of a class member that follows `tid`, a shape of the template: the template's forms, with the member's own choice on each axis.
  const memberForm = (tid: string, memberId: string | undefined): ModelPoint[] | undefined => {
    const oid = objectOfShape.get(tid), t = oid ? objectMap.get(oid) : undefined
    return t && memberId ? overrideFor(t, tid, choices, memberId) : undefined
  }
  // What a class switches off: the template once it has members (it is a pattern; unless it is the thing being shown), and in a family every member but the one
  // shown. A twin goes with the object it mirrors.
  const classOff = new Set<string>()
  for (const k of classesOf(c)) {
    const tpl = objectMap.get(k.template), members = membersOf(c, k.id)
    if (!tpl || members.length === 0) continue
    if (!show.has(tpl.id)) classOff.add(tpl.id)
    if (!k.exclusive) continue
    const shown = members.filter(m => show.has(m.id))
    const pick = new Set(shown.length ? shown.map(m => m.id) : show.has(tpl.id) ? [] : [(members.find(m => m.id === choices[classKey(k.id)]) ?? members[0]).id])
    for (const m of members) if (!pick.has(m.id)) classOff.add(m.id)
  }
  for (const o of c.objects) if (o.mirrorOf && classOff.has(o.mirrorOf)) classOff.add(o.id)
  // Whether the shape's object, its group or a group above it is switched off (it is still solved: anchors and links read it).
  const switchedOff = (sid: string): boolean => {
    if (hidden.size === 0 && classOff.size === 0) return false
    const oid = objectOfShape.get(sid)
    if (oid && (hidden.has(oid) || classOff.has(oid))) return true
    const seen = new Set<string>()
    for (let gid = groupOfShape.get(sid); gid && !seen.has(gid); gid = groupMap.get(gid)?.parent ?? undefined) {
      if (hidden.has(gid)) return true
      seen.add(gid)
    }
    return false
  }

  const out: Solved = { shapes: {}, order: [], mats: {}, pivots: {}, anchors: {}, global: G }
  // Groups and shapes are solved when something asks for them (an anchor asks for a shape, a shape for its group, a link for another shape); a thing that
  // is being solved is not asked for again, so a circle of anchors or links cannot loop: it is cut where it closes.
  const busyGroups = new Set<string>(), busyShapes = new Set<string>()

  // what the sliders do to a list of points (a recorded move, a bend, a scale of the shape); `own` is the shape's own outline, which the moves were recorded on
  function drive(sh: ModelShape, list: ModelPoint[], own: ModelPoint[], Mg: Mat) {
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
    // the runs of weighted points hang, from where the other sliders have left them: toward the way things fall, which is a direction in the picture, so it is
    // read back into this shape's own space (a tilted head still lets its hair hang straight down)
    let falling = 0
    for (const r of ranges) for (const d of r.drives) if (d.kind === 'fall' && d.shape === sh.id) falling += amount(r, d, val(r)) / 100
    if (falling > 0 && list.some(p => (p.w ?? 0) > 0)) {
      const inv = inverse(Mg), w = hangDirection(fallSide, view === 'back')
      const dx = inv[0] * w[0] + inv[2] * w[1], dy = inv[1] * w[0] + inv[3] * w[1]
      applyFall(list, sh.closed, Math.min(1, falling), [dx, dy], squeezeOf(fallSide))
    }
  }

  // Points linked to another shape take its place: on one of its points (plus an offset), or at a spot along one of its edges, some way outward. The
  // target is read where the rig has put it (the model's space) and brought into this shape's group space. Looseness stretches the offsets.
  function link(sh: ModelShape, list: ModelPoint[], Mg: Mat) {
    if (!list.some(p => p.bind)) return
    const f = looseFactor(c, sh, values)
    let inv: Mat | null = null
    const leaves = new Map<number, [number, number]>()   // the points that leave along their edge, with the direction of that edge in this shape's space
    for (let k = 0; k < list.length; k++) {
      const p = list[k], b = p.bind
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
      if (Number.isFinite(x) && Number.isFinite(y)) {
        p.x = x; p.y = y
        if (b.kind === 'edge' && b.tan) {
          const e = bezierAt(a, b.e % n, b.t), tx = inv[0] * e.tx + inv[2] * e.ty, ty = inv[1] * e.tx + inv[3] * e.ty, tl = Math.hypot(tx, ty)
          if (tl > 1e-9) leaves.set(k, [tx / tl, ty / tl])
        }
      }
    }
    if (leaves.size < 2) return
    // A side between two such points locked to different shapes (the two ends of a bridge) leaves one part along the direction of its edge and arrives at the
    // other along the direction of its edge, so the outline runs on smoothly through a bend however far the parts have turned.
    const n = list.length
    for (let i = 0; i < (sh.closed ? n : n - 1); i++) {
      const j = (i + 1) % n, ta = leaves.get(i), tb = leaves.get(j)
      if (!ta || !tb || list[i].bind?.s === list[j].bind?.s) continue
      const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, reach = Math.max(0.5, Math.hypot(dx, dy) * BRIDGE_REACH)
      const sa = ta[0] * dx + ta[1] * dy >= 0 ? 1 : -1, sb = tb[0] * -dx + tb[1] * -dy >= 0 ? 1 : -1
      a.ho = [ta[0] * sa * reach, ta[1] * sa * reach]
      b.hi = [tb[0] * sb * reach, tb[1] * sb * reach]
    }
  }

  // The outline of a shape that has points of its own: the base outline linked and driven (what the rig reads), and what is drawn: a chosen form's outline in its
  // place, or in the back view the outline of its own for the back. An empty form outline hides the shape in every view.
  function plainOutline(sh: ModelShape, Mg: Mat, form: ModelPoint[] | undefined): { rig: ModelPoint[]; drawn: ModelPoint[] } {
    const rig = sh.pts.map(copyPoint)
    link(sh, rig, Mg)
    drive(sh, rig, sh.pts, Mg)
    let drawn = rig
    if (form) {
      drawn = form.map(copyPoint)
      link(sh, drawn, Mg)
      drive(sh, drawn, sh.pts, Mg)
    }
    if (view === 'back' && sh.back && sh.back.length >= 3 && !(form && form.length === 0)) {
      drawn = sh.back.map(copyPoint)
      link(sh, drawn, Mg)
      drive(sh, drawn, sh.back, Mg)
    }
    return { rig, drawn }
  }
  const groupMatOf = (shapeId: string): Mat => { const gid = groupOfShape.get(shapeId); return gid ? groupMat(gid) : IDENTITY }

  // The box (in the model's space, before the whole-model transform) a shape is drawn in; its object's fit mode is not counted.
  const boxIn = (s: SolvedShape | undefined): Box | null => {
    if (!s || s.local.length < 3) return null
    const closed = shapeMap.get(s.id)?.closed ?? true
    const poly = flatten(build(s.local, closed, s.frame), closed)
    return poly.length ? boxOf(poly) : null
  }

  // The middle of an object at rest, in its group's space (null when none of its shapes has an outline to take it from).
  function objectCentre(o: ModelObject): [number, number] | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const sid of o.shapes) {
      let s = shapeMap.get(sid)
      if (s && s.pts.length < 3 && s.copyOf) s = shapeMap.get(s.copyOf)   // a shape that follows its pattern lies where the pattern's shape does
      if (!s || s.pts.length < 3) continue
      const b = boxOf(flatten(build(s.pts, s.closed), s.closed))
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    return x1 >= x0 ? [(x0 + x1) / 2, (y0 + y1) / 2] : null
  }

  // How an object that does not scale with its group is drawn (phase 5a): the matrix that stands in for its group's, or null for an object that does. 'keep'
  // is carried by its group (the middle of the object goes where the group puts it, and it turns as the group does) but is drawn at its own size: the scale and
  // the shear of the group and of the groups above it are taken out. 'stretch' follows the box of another shape: the object is scaled and moved as that box
  // has grown and moved since rest (no turn). Only the drawing changes: anchors and links read the outline as the group holds it. A twin is the mirror image
  // of its original's.
  function fitMatrix(sh: ModelShape): Mat | null {
    if (opts.plain) return null
    const original = sh.mirrorOf && sh.mirrorOf !== sh.id ? shapeMap.get(sh.mirrorOf) : undefined
    if (original && !original.mirrorOf) { const m = fitMatrix(original); return m ? mul(RF, mul(m, RF)) : null }
    const oid = objectOfShape.get(sh.id), o = oid ? objectMap.get(oid) : undefined
    const gid = groupOfShape.get(sh.id)
    if (!o || !gid || !o.fit || o.fit === 'scale') return null
    let m: Mat | null = null
    if (o.fit === 'keep') {
      const Mg = groupMat(gid), pw = out.pivots[gid]
      // the middle of the object (else the pivot of the group) goes where the group's matrix puts it, and only the turn is kept
      const [cx, cy] = objectCentre(o) ?? (pw ? apply(inverse(Mg), pw[0], pw[1]) : [0, 0])
      const [wx, wy] = apply(Mg, cx, cy), th = (turnOf(Mg) * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th)
      m = [cs, sn, -sn, cs, wx - (cs * cx - sn * cy), wy - (sn * cx + cs * cy)]
    } else {
      const target = o.fitTo ? shapeMap.get(o.fitTo) : undefined
      if (!target || objectOfShape.get(target.id) === o.id) return null
      const now = boxIn(shapeOut(target.id)), then = boxIn(plainRest(c).shapes[target.id])
      if (!now || !then) return null
      const kx = then.w > 1e-6 ? clamp(now.w / then.w, 0.05, 20) : 1, ky = then.h > 1e-6 ? clamp(now.h / then.h, 0.05, 20) : 1
      m = [kx, 0, 0, ky, now.x - kx * then.x, now.y - ky * then.y]
    }
    return finiteMat(m) ? m : null
  }

  // How much of a shape shows (a crease fades in with a slider): its own fade, else that of the shape it mirrors or follows; 1 for a shape that does not fade.
  function fadeOf(sh: ModelShape): number {
    const mirrored = sh.mirrorOf && sh.mirrorOf !== sh.id ? shapeMap.get(sh.mirrorOf) : undefined
    const followed = sh.copyOf ? shapeMap.get(sh.copyOf) : undefined
    const f = sh.opBy ?? mirrored?.opBy ?? followed?.opBy
    const r = f ? ranges.find(x => x.id === f.slider) : undefined
    if (!f || !r) return 1
    const span = f.shown - f.hidden
    return Math.abs(span) < 1e-9 ? (val(r) >= f.shown ? 1 : 0) : clamp((val(r) - f.hidden) / span, 0, 1)
  }

  function place(sh: ModelShape, groupId: string | null, Mg: Mat) {
    const original = sh.mirrorOf && sh.mirrorOf !== sh.id ? shapeMap.get(sh.mirrorOf) : undefined
    const twin = original && !original.mirrorOf ? original : undefined
    let rig: ModelPoint[], drawn: ModelPoint[], closed = sh.closed, ghost = ''
    // a shape of a class member follows a shape of the template; with no points of its own it is drawn as the template's shape is, in the member's own group,
    // under the member's own choice of form
    const followed = !twin && sh.copyOf ? shapeMap.get(sh.copyOf) : undefined
    const tpl = followed && !followed.mirrorOf && !followed.copyOf ? followed : undefined
    const memberObject = tpl ? objectMap.get(objectOfShape.get(sh.id) ?? '') : undefined
    const memberId = memberObject?.classOf ? memberObject.id : undefined
    if (twin) {
      // a twin is the mirror image of its original as the original is drawn: its points are the reflection of the original's (in the group's own space,
      // so a group turned with the original is turned the other way round on the twin's side)
      const o = shapeOut(twin.id)
      rig = o ? reflectList(o.rig, axis) : []
      drawn = o ? reflectList(o.local, axis) : []
      closed = twin.closed
    } else if (tpl && sh.pts.length < 3) {
      const o = plainOutline(tpl, groupMatOf(tpl.id), memberForm(tpl.id, memberId))
      rig = o.rig; drawn = o.drawn; closed = tpl.closed
    } else {
      // The rig always reads the base outline. A form gives only the drawn outline (it still gets the shape's links and, when it has as many points as the
      // base, its recorded moves); an empty one hides the shape in every view.
      const o = plainOutline(sh, Mg, tpl ? memberForm(tpl.id, memberId) : formOutline(sh.id))
      rig = o.rig; drawn = o.drawn
      if (tpl) {
        const g = plainOutline(tpl, groupMatOf(tpl.id), memberForm(tpl.id, memberId)).drawn
        ghost = g.length >= 3 ? pathText(build(g, tpl.closed, mul(G, Mg)), tpl.closed) : ''
      }
    }
    const ok = rig.length >= 3 && drawn.length >= 3
    const matrix = mul(G, (ok ? fitMatrix(sh) : null) ?? Mg)
    const off = switchedOff(sh.id)
    const fin = ok ? build(drawn, closed, matrix) : []
    const poly = ok ? flatten(fin, closed) : []
    out.shapes[sh.id] = {
      id: sh.id, group: groupId, local: drawn, rig, matrix, frame: Mg, ghost,
      pre: rig.length >= 3 ? build(rig, closed, Mg) : [],   // from the base outline even where a form hides the shape: anchors and links still read it
      d: ok ? pathText(fin, closed) : '', poly, box: poly.length ? boxOf(poly) : NO_BOX,
      visible: ok && (sh.view === 'both' || sh.view === view) && !off && !sh.hide, off, fade: fadeOf(sh), z: view === 'back' && sh.zBack != null ? sh.zBack : sh.z,
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

  // What a group does on top of where its parent and its anchor put it: its matrix and its pivot (in the parent's frame, before the group's own movement), with
  // `forTwin` leaving out the drives that a twin does not follow (a drive with `mirror: false`: the two sides are posed apart).
  function movement(g: ModelGroup, forTwin: boolean): { Mg: Mat; pw2: [number, number]; an: [number, number] | null } {
    const id = g.id
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
    // a bone starting at this group is stretched along its own rest direction (as the parent holds it now), about the pivot; all the groups that hang from
    // this one follow, since they stand in this group's matrix
    let lengthen = bm
    for (const r of ranges) for (const d of r.drives) {
      if (forTwin && d.mirror === false) continue
      if (d.kind === 'turn' && d.group === id) angle += amount(r, d, val(r))
      else if (d.kind === 'scale' && d.target === 'group' && d.id === id) {
        const f = factorOf(r, d, val(r))
        if (d.axis !== 'y') sx *= f
        if (d.axis !== 'x') sy *= f
      } else if (d.kind === 'length' && d.id) {
        const bone = boneMap.get(d.id)
        const rest = bone && bone.start === id ? boneAtRest(c, bone) : null
        if (!rest) continue
        const vx = rest.b[0] - rest.a[0], vy = rest.b[1] - rest.a[1]
        const ux = bm[0] * vx + bm[2] * vy, uy = bm[1] * vx + bm[3] * vy, len = Math.hypot(ux, uy)
        if (len > 1e-6) lengthen = mul(scaleAlong(factorOf(r, d, val(r)), ux / len, uy / len, pw2[0], pw2[1]), lengthen)
      }
    }
    return { Mg: mul(rotate(angle, pw2[0], pw2[1]), mul(scale(sx, sy, pw2[0], pw2[1]), lengthen)), pw2, an }
  }
  // Whether a group has drives that its twin does not follow.
  const apartFrom = (id: string): boolean => ranges.some(r => r.drives.some(d => d.mirror === false && ((d.kind === 'turn' && d.group === id) || (d.kind === 'scale' && d.target === 'group' && d.id === id) || d.kind === 'length')))

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
      // the torso carries both arms alike; with twin parents (left arm and forearm) it is the plain reflection of the original. The drives of the original that
      // do not mirror are left out, and the twin may have drives of its own (phase 5c): what the same slider would do to the original, as a mirror image
      // (a turn the other way round about the twin's own pivot), so the two sides are posed apart while the drawing stays mirrored.
      const Mpo = original.parent ? groupMat(original.parent) : IDENTITY
      const Mpt = g.parent ? groupMat(g.parent) : IDENTITY
      const Mo = apartFrom(original.id) ? movement(original, true).Mg : groupMat(original.id)
      Mg = mul(Mpt, mul(RF, mul(inverse(Mpo), mul(Mo, RF))))
      const po = out.pivots[original.id]
      const pw = po ? apply(Mpt, ...apply(RF, ...apply(inverse(Mpo), po[0], po[1]))) : [axis, 200]
      out.pivots[id] = [pw[0], pw[1]]
      out.anchors[id] = null
      let angle = 0, sx = 1, sy = 1
      for (const r of ranges) for (const d of r.drives) {
        if (d.kind === 'turn' && d.group === id) angle += amount(r, d, val(r))
        else if (d.kind === 'scale' && d.target === 'group' && d.id === id) {
          const f = factorOf(r, d, val(r))
          if (d.axis !== 'y') sx *= f
          if (d.axis !== 'x') sy *= f
        }
      }
      if (angle !== 0 || sx !== 1 || sy !== 1) Mg = mul(rotate(-angle, pw[0], pw[1]), mul(scale(sx, sy, pw[0], pw[1]), Mg))
    } else {
      const m = movement(g, false)
      Mg = m.Mg
      out.pivots[id] = [m.pw2[0], m.pw2[1]]
      out.anchors[id] = g.attach ? m.an : null
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
