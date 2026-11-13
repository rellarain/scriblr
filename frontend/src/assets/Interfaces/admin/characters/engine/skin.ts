import type { ModelContent, ModelPoint, ModelShape, ModelSkin } from '../../../../../api/types'
import { apply, clamp, inverse, mul, twinIndex, type Mat } from './geometry'
import { LIMITS } from './limits'

// Skin weights (phase O1): a point of a shape may also follow groups besides its own, part each, so an outline bends like skin at a joint instead of breaking where two
// parts meet. The weights are kept on the shape (`ModelShape.skin`: one list of weights per group, a weight per point), the solver (rig.ts) moves the points after their links
// and sliders and before they hang, and the Designer's Skin tool paints them. Pure, so it is tested in node.

// One group a point follows and how much (0..1).
export type Influence = [group: string, weight: number]
// What one point follows: the group its place is read in (its shape's own group, or for a point linked to a skinned shape that shape's group) and the other groups, each with
// its weight; what the weights leave is the base group's.
export interface PointSkin { base: string | null; inf: Influence[] }

// What the solver knows about the groups: each one's matrix (its rest space to the model's space), its whole turn in degrees (not wrapped, so a turn of 200 degrees is not read as
// one of -160), and where two groups meet at rest when one hangs from the other (the pivot of the lower one; null when they are not on one chain).
export interface SkinRig {
  mat: (group: string | null) => Mat
  turn: (group: string | null) => number
  joint: (a: string | null, b: string) => [number, number] | null
}

export const roundWeight = (w: number): number => Math.round(clamp(Number.isFinite(w) ? w : 0, 0, 1) * 100) / 100
const NEAR = 1e-9
const isIdentity = (m: Mat): boolean => Math.abs(m[0] - 1) < NEAR && Math.abs(m[1]) < NEAR && Math.abs(m[2]) < NEAR && Math.abs(m[3] - 1) < NEAR && Math.abs(m[4]) < NEAR && Math.abs(m[5]) < NEAR
const finite = (m: Mat): boolean => m.every(Number.isFinite)

// Whether a shape has any weight at all.
export const isSkinned = (s: Pick<ModelShape, 'skin'>): boolean => (s.skin ?? []).some(k => k.w.some(w => w > 0))

// The point of `own` nearest to (x, y).
function nearestIndex(own: ModelPoint[], x: number, y: number): number {
  let best = 0, bd = Infinity
  for (let i = 0; i < own.length; i++) { const d = (own[i].x - x) ** 2 + (own[i].y - y) ** 2; if (d < bd) { bd = d; best = i } }
  return best
}

// The groups each point of a list follows: by number when the list has as many points as the shape's own outline, else those of the outline's point nearest to it (a form or
// a back outline with a number of points of its own).
export function influencesFor(skin: ModelSkin[] | undefined, own: ModelPoint[], list: ModelPoint[]): Influence[][] {
  if (!skin || skin.length === 0 || own.length === 0) return list.map(() => [])
  const at = list.length === own.length ? list.map((_, i) => i) : list.map(p => nearestIndex(own, p.x, p.y))
  return at.map(i => skin.flatMap((k): Influence[] => { const w = k.w[i] ?? 0; return w > 0 ? [[k.g, w]] : [] }))
}

// A 2 by 2 matrix [a, b, c, d] (x' = a x + c y, y' = b x + d y).
type Lin = [number, number, number, number]
const I2: Lin = [1, 0, 0, 1]

// What one group does to a point at weight w, as a move (dx, dy) and the linear part of the move (for the point's curve handles). On one chain with the base group the point turns
// about the joint by w of the turn between the two and its distance from the joint changes by w of the rest (a scale or a stretch), so a bent elbow keeps its thickness; with no
// joint (two groups on different chains) it is the plain blend, w of the way to where the group would put it.
function pull(x: number, y: number, R: Mat, w: number, joint: [number, number] | null, turn: number): { dx: number; dy: number; lin: Lin } {
  const det = R[0] * R[3] - R[1] * R[2]
  if (!joint || !(det > 1e-9)) {
    const [rx, ry] = apply(R, x, y)
    return { dx: (rx - x) * w, dy: (ry - y) * w, lin: [1 + (R[0] - 1) * w, R[1] * w, R[2] * w, 1 + (R[3] - 1) * w] }
  }
  const a = (turn * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a)
  // the linear part without its turn (what is left is a scale, a stretch or a shear), taken w of the way from nothing, then turned by w of the turn
  const S: Lin = [ca * R[0] + sa * R[1], -sa * R[0] + ca * R[1], ca * R[2] + sa * R[3], -sa * R[2] + ca * R[3]]
  const Sw: Lin = [1 + (S[0] - 1) * w, S[1] * w, S[2] * w, 1 + (S[3] - 1) * w]
  const b = a * w, cb = Math.cos(b), sb = Math.sin(b)
  const lin: Lin = [cb * Sw[0] - sb * Sw[1], sb * Sw[0] + cb * Sw[1], cb * Sw[2] - sb * Sw[3], sb * Sw[2] + cb * Sw[3]]
  // the joint moves w of the way to where the group carries it (it stays put when the two are joined there)
  const [cx, cy] = joint, [jx, jy] = apply(R, cx, cy)
  const ox = cx + (jx - cx) * w, oy = cy + (jy - cy) * w
  const vx = x - cx, vy = y - cy
  const nx = ox + lin[0] * vx + lin[2] * vy, ny = oy + lin[1] * vx + lin[3] * vy
  return { dx: nx - x, dy: ny - y, lin }
}

const turnHandle = (h: [number, number], l: Lin): [number, number] => [l[0] * h[0] + l[2] * h[1], l[1] * h[0] + l[3] * h[1]]

// Moves the points of a list (in place) as their skins say: a point is read in the space of its base group, pulled part of the way by each group it follows, and put into the
// space of `own` (the group the list is drawn in). A point with no skin (null) is left where it is. Weights that add up to more than 1 are shared out so they add up to 1.
// Curve handles a point has of its own turn with it; automatic ones are made again from the moved points when the outline is drawn.
export function skinPoints(list: ModelPoint[], skins: Array<PointSkin | null>, own: string | null, rig: SkinRig): void {
  const Mown = rig.mat(own)
  const out = new Map<string, Mat>()   // base group to own space
  const rel = new Map<string, Mat>()   // group relative to base
  for (let i = 0; i < list.length; i++) {
    const sk = skins[i]
    if (!sk) continue
    const p = list[i], key = sk.base ?? ''
    let toOwn = out.get(key)
    if (!toOwn) { toOwn = sk.base === own ? [1, 0, 0, 1, 0, 0] : mul(inverse(Mown), rig.mat(sk.base)); out.set(key, toOwn) }
    let x = p.x, y = p.y, lin: Lin = I2
    const total = sk.inf.reduce((n, [, w]) => n + Math.max(0, w), 0)
    const share = total > 1 ? 1 / total : 1
    let dx = 0, dy = 0, any = false
    for (const [g, w0] of sk.inf) {
      const w = Math.max(0, w0) * share
      if (w <= 0 || g === sk.base) continue
      const k = `${key}|${g}`
      let R = rel.get(k)
      if (!R) { R = mul(inverse(rig.mat(sk.base)), rig.mat(g)); rel.set(k, R) }
      if (!finite(R) || isIdentity(R)) continue
      const r = pull(x, y, R, w, rig.joint(sk.base, g), rig.turn(g) - rig.turn(sk.base))
      dx += r.dx; dy += r.dy
      lin = [lin[0] + r.lin[0] - 1, lin[1] + r.lin[1], lin[2] + r.lin[2], lin[3] + r.lin[3] - 1]
      any = true
    }
    if (any) { x += dx; y += dy }
    if (!any && isIdentity(toOwn)) continue
    const [fx, fy] = apply(toOwn, x, y)
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) continue
    p.x = fx; p.y = fy
    const full: Lin = [toOwn[0] * lin[0] + toOwn[2] * lin[1], toOwn[1] * lin[0] + toOwn[3] * lin[1], toOwn[0] * lin[2] + toOwn[2] * lin[3], toOwn[1] * lin[2] + toOwn[3] * lin[3]]
    if (p.hi) p.hi = turnHandle(p.hi, full)
    if (p.ho) p.ho = turnHandle(p.ho, full)
  }
}

// ---- editing the weights ----

export interface SkinEdit { ok: true; shape: ModelShape }

// The weights of a shape for one group, one per point (0 where it has none).
// The inside of a sharp bend (phase O6): the joint blend turns a point near a joint about it, keeping its distance, which rounds the outside of an elbow or a knee as skin
// does; on the inside of the bend the same arc falls short of where the two sides meet, and the outline gets a small dent there (a notch of the background in the crease).
// A point the skin has moved that dents the outline inward more than it did at rest goes out to where the sides on either side of it meet (the edge before
// the point before it, and the edge after the point after it, carried on), or onto the line between its neighbours when they do not meet near it, and becomes a sharp
// point (a point drawn sharp, the cut end of a sleeve, is left alone): the clean corner the inside of a bend has. The number of points stays the same; an outline at rest, as it was drawn, is never touched. In place.
const DENT = 0.4
export function creaseCorners(list: ModelPoint[], closed: boolean, rest: ModelPoint[], moved: (i: number) => boolean): void {
  const n = list.length
  if (n < 5 || rest.length !== n) return
  // which way the outline winds (inward is to the same side all round)
  let area = 0
  for (let i = 0; i < n; i++) { const a = rest[i], b = rest[(i + 1) % n]; area += a.x * b.y - b.x * a.y }
  if (!Number.isFinite(area) || Math.abs(area) < 1e-9) return
  const inward = area > 0 ? 1 : -1
  // how far a point dents inward from the line between its neighbours (negative: it stands out)
  const dent = (a: ModelPoint, p: ModelPoint, b: ModelPoint): number => {
    const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey)
    if (!(len > 1e-9)) return 0
    return (inward * (ex * (p.y - a.y) - ey * (p.x - a.x))) / len
  }
  const from = closed ? 0 : 2, to = closed ? n : n - 2
  for (let i = from; i < to; i++) {
    // (a sharp point is a corner drawn on purpose, the cut end of a sleeve: it is left alone)
    if (!moved(i) || rest[i].m === 's') continue
    const at = (k: number) => list[(i + k + n) % n], was = (k: number) => rest[(i + k + n) % n]
    // only a dent the bend made (or made deeper): a hollow drawn in the outline at rest stays as it is drawn
    const d = dent(at(-1), at(0), at(1))
    if (!(d - Math.max(0, dent(was(-1), was(0), was(1))) > DENT)) continue
    const a2 = at(-2), a1 = at(-1), b1 = at(1), b2 = at(2), p = at(0)
    // the edge into the point before, carried on past it, and the edge out of the point after, carried back past it
    const ux = a1.x - a2.x, uy = a1.y - a2.y, vx = b1.x - b2.x, vy = b1.y - b2.y, den = ux * vy - uy * vx
    // (failing a corner near it, onto the line between its neighbours, straight out)
    const ex = b1.x - a1.x, ey = b1.y - a1.y, el = Math.hypot(ex, ey) || 1
    let x = p.x - inward * (-ey / el) * d, y = p.y - inward * (ex / el) * d
    if (Math.abs(den) > 1e-9) {
      const s = ((b1.x - a1.x) * vy - (b1.y - a1.y) * vx) / den, u = ((b1.x - a1.x) * uy - (b1.y - a1.y) * ux) / den
      const cx = a1.x + ux * s, cy = a1.y + uy * s
      const span = Math.hypot(b1.x - a1.x, b1.y - a1.y)
      if (s >= 0 && u >= 0 && Number.isFinite(cx) && Number.isFinite(cy) && Math.hypot(cx - p.x, cy - p.y) <= Math.min(span, d * 2.5)) { x = cx; y = cy }
    }
    p.x = x; p.y = y; p.m = 's'; p.hi = null; p.ho = null
  }
}

export function weightsOf(s: Pick<ModelShape, 'skin' | 'pts'>, group: string): number[] {
  const k = (s.skin ?? []).find(x => x.g === group)
  return s.pts.map((_, i) => k?.w[i] ?? 0)
}

// The shape with these weights for a group: an entry is added when there is room (at most LIMITS.skinMax groups), and an entry left with no weight goes.
export function setWeights(s: ModelShape, group: string, w: number[]): ModelShape | null {
  const skin = s.skin ?? []
  const list = s.pts.map((_, i) => roundWeight(w[i] ?? 0))
  const has = skin.some(k => k.g === group)
  if (!has && list.every(v => v === 0)) return s
  if (!has && skin.length >= LIMITS.skinMax) return null
  const next = has ? skin.map(k => (k.g === group ? { g: group, w: list } : k)) : [...skin, { g: group, w: list }]
  return { ...s, skin: next.filter(k => k.w.some(v => v > 0)) }
}

// One point's weight stepped by a tenth up or down.
export const stepSkin = (w: number, dir: -1 | 1): number => roundWeight(Math.round((w + dir * 0.1) * 10) / 10)

// The weights set to `value` at the given points (painting).
export function paintWeights(w: number[], points: number[], value: number): number[] {
  const out = [...w]
  for (const i of points) if (i >= 0 && i < out.length) out[i] = roundWeight(value)
  return out
}

// Each weight eased toward the mean of it and its two neighbours (one pass; an open outline keeps its two ends' neighbours to one side).
export function smoothWeights(w: number[], closed: boolean): number[] {
  const n = w.length
  if (n < 3) return [...w]
  return w.map((v, i) => {
    const a = i > 0 ? w[i - 1] : closed ? w[n - 1] : v, b = i < n - 1 ? w[i + 1] : closed ? w[0] : v
    return roundWeight((a + 2 * v + b) / 4)
  })
}

// Weights made from the rest outline: points near the joint share it, rising from 0 to 1 over `reach` units along the bone from the own side to the other (a smooth step), so
// the far side of the joint follows the other group and the near side its own. `toward` is the direction of the bone into the other group's part (the other group's middle
// from the joint), at rest.
export function autoWeights(pts: ModelPoint[], joint: [number, number], toward: [number, number], reach: number): number[] {
  const len = Math.hypot(toward[0], toward[1])
  if (!(len > 1e-9)) return pts.map(() => 0)
  const ux = toward[0] / len, uy = toward[1] / len, half = Math.max(0.5, reach)
  return pts.map(p => {
    const along = (p.x - joint[0]) * ux + (p.y - joint[1]) * uy
    const t = clamp((along + half) / (2 * half), 0, 1)
    return roundWeight(t * t * (3 - 2 * t))
  })
}

// The weights of the other side made from this side's: for each point on the side of `side` (-1: left of the axis, 1: right, in the model's space) the point that mirrors it gets its
// weight, for `toGroup` (the twin of the group, or the group itself when it has no twin). Points on the mirror line keep theirs.
export function mirrorWeights(pts: ModelPoint[], from: number[], into: number[], side: -1 | 1, axis: number): number[] {
  const out = [...into]
  for (let i = 0; i < pts.length; i++) {
    if (Math.sign(pts[i].x - axis) !== side) continue
    const j = twinIndex(pts, i, axis, 6)
    if (j !== i) out[j] = from[i] ?? 0
  }
  return out
}

// The groups a shape follows, as each point of another shape would have them: for every point the nearest point of `from` (both at rest) gives its weights, and the group of
// `from` itself counts as one more group with what its weights leave (so a sleeve copied from an arm follows the arm's group too). The shape's own group drops out (what is
// left is its own anyway); at most LIMITS.skinMax groups are kept, those with the most weight.
export function copiedSkin(to: ModelShape, toGroup: string | null, from: ModelShape, fromGroup: string | null): ModelSkin[] {
  const sums = new Map<string, number[]>()
  const add = (g: string, i: number, w: number) => { if (g === toGroup || w <= 0) return; const l = sums.get(g) ?? to.pts.map(() => 0); l[i] += w; sums.set(g, l) }
  to.pts.forEach((p, i) => {
    const j = nearestIndex(from.pts, p.x, p.y)
    let left = 1
    for (const k of from.skin ?? []) { const w = k.w[j] ?? 0; left -= w; add(k.g, i, w) }
    if (fromGroup) add(fromGroup, i, Math.max(0, left))
  })
  return [...sums.entries()]
    .map(([g, w]) => ({ g, w: w.map(roundWeight), total: w.reduce((a, b) => a + b, 0) }))
    .filter(k => k.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, LIMITS.skinMax)
    .map(({ g, w }) => ({ g, w }))
}

// The weights of a twin once its pair is broken: the original's, with each group swapped for its twin (a group with none stays) and the weights in the order of the reflected
// outline (a reflection runs the other way round). A group that comes out as the twin's own is left out.
export function mirroredSkin(c: ModelContent, skin: ModelSkin[] | undefined, ownGroup: string | null): ModelSkin[] {
  const twin = new Map<string, string>()
  for (const g of c.groups) if (g.mirrorOf && g.mirrorOf !== g.id) { twin.set(g.mirrorOf, g.id); twin.set(g.id, g.mirrorOf) }
  return (skin ?? []).map(k => ({ g: twin.get(k.g) ?? k.g, w: [...k.w].reverse() })).filter(k => k.g !== ownGroup)
}

// ---- keeping the weights with their points ----

// The shape with new points and its weights carried over: kept by number when there are as many points as before, else each new point takes the weights of the old point nearest
// to it (a point added on an edge takes the nearer end's; a point taken away takes its weights with it).
export function withPoints(s: ModelShape, pts: ModelPoint[]): ModelShape {
  const skin = s.skin ?? []
  if (skin.length === 0 || pts.length === s.pts.length) return { ...s, pts }
  const at = pts.map(p => nearestIndex(s.pts, p.x, p.y))
  return { ...s, pts, skin: skin.map(k => ({ g: k.g, w: at.map(i => k.w[i] ?? 0) })) }
}

// After an edit: the shapes whose number of points changed get their weights carried over from what they were (see withPoints); a group that is gone takes its weights with
// it, and a weight list is fitted to the points it belongs to.
export function alignSkins(before: ModelContent, after: ModelContent): ModelContent {
  if (!after.shapes.some(s => (s.skin ?? []).length > 0)) return after
  const old = new Map(before.shapes.map(s => [s.id, s]))
  const groups = new Set(after.groups.map(g => g.id))
  let changed = false
  const shapes = after.shapes.map(s => {
    const skin = s.skin ?? []
    if (skin.length === 0) return s
    let out = s
    const prev = old.get(s.id)
    if (prev && prev.pts.length !== s.pts.length && prev.skin === s.skin) out = withPoints({ ...prev, skin }, s.pts)
    const kept = (out.skin ?? []).filter(k => groups.has(k.g)).map(k => (k.w.length === out.pts.length ? k : { g: k.g, w: out.pts.map((_, i) => k.w[i] ?? 0) }))
    if (kept.length !== (out.skin ?? []).length || kept.some((k, i) => k !== out.skin![i])) out = { ...out, skin: kept }
    if (out !== s) changed = true
    return out === s ? s : { ...s, pts: out.pts, skin: out.skin }
  })
  return changed ? { ...after, shapes } : after
}

// ---- checks ----

// What stops a model with skin weights from being published (the server says the same in the same words): a group that is not there or is the shape's own, a twin with weights
// of its own (it is skinned as its original is), a group that hangs from the shape.
export function skinFaults(c: ModelContent): string[] {
  const faults: string[] = []
  const groups = new Map(c.groups.map(g => [g.id, g]))
  const objectOf = new Map<string, string>(), groupOf = new Map<string, string>()
  for (const o of c.objects) for (const sid of o.shapes) if (!objectOf.has(sid)) objectOf.set(sid, o.id)
  for (const g of c.groups) for (const oid of g.objects) if (!groupOf.has(oid)) groupOf.set(oid, g.id)
  const above = (id: string): string[] => {
    const out: string[] = []
    let cur = groups.get(id)?.parent ?? null
    while (cur !== null && groups.has(cur) && !out.includes(cur) && cur !== id) { out.push(cur); cur = groups.get(cur)?.parent ?? null }
    return out
  }
  for (const s of c.shapes) {
    const skin = s.skin ?? []
    if (skin.length === 0) continue
    const name = s.name || s.id
    if (s.mirrorOf) { faults.push(`Shape ${name} is a twin and has skin weights of its own: skin the original instead.`); continue }
    const home = groupOf.get(objectOf.get(s.id) ?? '') ?? ''
    for (const k of skin) {
      if (!groups.has(k.g)) faults.push(`Shape ${name} is skinned to a group that does not exist.`)
      else if (k.g === home) faults.push(`Shape ${name} is skinned to its own group.`)
      else if ([k.g, ...above(k.g)].some(g => groups.get(g)?.attach?.shape === s.id)) faults.push(`Shape ${name} is skinned to a group that hangs from it.`)
    }
  }
  return faults
}
