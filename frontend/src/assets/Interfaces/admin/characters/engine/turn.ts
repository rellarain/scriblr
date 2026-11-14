import type { ModelAngleOutline, ModelContent, ModelLayer, ModelPoint, ModelTurn } from '../../../../../api/types'
import { apply, bezierAt, build, inverse, windSign, type Box, type BuiltPoint, type Mat } from './geometry'

// Turning a figure (phase A1). The model is solved as it always was, in the front view; then every outline is turned about the model's axis (the up and down line through its
// middle) by the angle it is seen from. A point that stands `d` toward the viewer comes out at
//     x' = C + (x - C) cos a + d sin a        (C: the axis; y does not change)
// so at 180 every point is mirrored about the axis, exactly the back view as it was drawn before angles. How far toward the viewer each point stands (its depth) comes from its
// group's pivot, the shape's own depth, its points' own depths, or the rounded surface of a shape it lies on (an eye on the skull). An outline with no depth of its own turns as
// a rounded cut-out: it slides with its middle and narrows to how deep it is (its roundness) at the side. Pure, so it is tested in node.

// How deep a shape is for its width when it has no roundness of its own: a body part a little flatter than round, a garment over it a little fuller, hair fuller still.
export const LAYER_THICK: Record<ModelLayer, number> = { body: 0.8, clothing: 0.85, hair: 0.9 }

// The turn an outline is seen through: the cosine and sine of the angle and the axis it turns about.
export interface Turning { cos: number; sin: number; axis: number }
export function turningOf(angle: number, axis: number): Turning {
  const a = (angle * Math.PI) / 180
  // the exact values at the quarter turns, so 90 and 180 come out clean
  const r = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v)
  return { cos: r(Math.cos(a)), sin: r(Math.sin(a)), axis }
}

// Where a point `d` toward the viewer is drawn across, and how far toward the viewer it is once turned.
export const turnedX = (t: Turning, x: number, d: number): number => t.axis + (x - t.axis) * t.cos + d * t.sin
export const turnedDepth = (t: Turning, x: number, d: number): number => -(x - t.axis) * t.sin + d * t.cos

// How wide a rounded outline of roundness `thick` is drawn for its width at this turn: 1 at the front, `thick` at the side, -1 at the back (a negative width is the mirror
// image). The side the sign flips at is the profile, where the outline is as wide as it is deep.
export function squash(t: Turning, thick: number): number {
  const w = Math.sqrt(t.cos * t.cos + thick * thick * t.sin * t.sin)
  return t.cos < -1e-12 ? -w : w
}

// A rounded outline turned: its middle (cx, at depth dc) moves as a point does, and the outline is drawn about it at the width `squash` gives. The matrix that does it.
export function silhouetteMatrix(t: Turning, cx: number, dc: number, thick: number): Mat {
  const k = squash(t, thick), x = turnedX(t, cx, dc)
  return [k, 0, 0, 1, x - k * cx, 0]
}
export function applySilhouette(a: BuiltPoint[], m: Mat): BuiltPoint[] {
  const k = m[0], e = m[4]
  return a.map(p => ({ ...p, x: k * p.x + e, hix: k * p.hix + e, hox: k * p.hox + e }))
}

// The depths of an outline: one per point, and one for each handle (the handle of a curve lies a third of the way along it, so its depth is a third of the way from the
// point's depth to its neighbour's, unless the outline has a surface to read them off).
export interface Depths { pt: number[]; hi: number[]; ho: number[] }
export function handleDepths(pt: number[], closed: boolean): Depths {
  const n = pt.length
  const at = (i: number) => pt[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]
  return { pt, hi: pt.map((d, i) => d + (at(i - 1) - d) / 3), ho: pt.map((d, i) => d + (at(i + 1) - d) / 3) }
}
// An outline turned point by point: each point and each handle where its own depth puts it. Turning and then looking straight on is a linear map, so the curves come out
// exactly as the turned curve would.
export function projectSurface(a: BuiltPoint[], depth: Depths, t: Turning): BuiltPoint[] {
  return a.map((p, i) => ({ ...p, x: turnedX(t, p.x, depth.pt[i] ?? 0), hix: turnedX(t, p.hix, depth.hi[i] ?? 0), hox: turnedX(t, p.hox, depth.ho[i] ?? 0) }))
}

// A rounded surface in a box (an ellipsoid as deep as `thick` times its half width, its middle at depth dc): how far toward the viewer it stands at a place, and which way
// it faces there (the across and toward-the-viewer parts of its normal, unit length). Outside the box it stands at its middle's depth, facing sideways.
export interface Surface { box: Box; dc: number; thick: number }
export function surfaceAt(s: Surface, x: number, y: number): { d: number; nx: number; nz: number } {
  const a = Math.max(1e-6, s.box.w / 2), b = Math.max(1e-6, s.box.h / 2), c = Math.max(1e-6, a * s.thick)
  const u = (x - (s.box.x + a)) / a, v = (y - (s.box.y + b)) / b
  const q = Math.max(0, 1 - u * u - v * v), w = Math.sqrt(q)
  // the normal of an ellipsoid at a point is (u/a, v/b, w/c): only its across and depth parts matter for a turn about the up and down line
  const nx = u / a, nz = w / c, len = Math.hypot(nx, nz) || 1
  return { d: s.dc + c * w, nx: nx / len, nz: nz / len }
}

// How much a surface facing (nx, nz) faces the viewer once turned: 1 straight at the viewer, 0 sideways, -1 away.
export const facing = (t: Turning, nx: number, nz: number): number => -nx * t.sin + nz * t.cos
// How much of a shape drawn only from the front (or only from the back) shows: all of it while it faces the viewer, fading out as it turns away past the side.
export function facingFade(f: number): number {
  const k = Math.max(0, Math.min(1, (f + 0.05) / 0.17))
  return k * k * (3 - 2 * k)
}
// Whether an angle is inside a shape's own range of angles it is seen at ([from, to], round the circle from `from`).
export function inSeen(seen: [number, number], angle: number): boolean {
  const [a, b] = seen
  const span = ((b - a) % 360 + 360) % 360, off = ((angle - a) % 360 + 360) % 360
  return off <= span + 1e-9
}

// Where an object goes in the drawing order at a turn: its front depth, blended toward its back depth as the figure turns round, and moved toward the front by how far
// its middle has come toward the viewer across the figure (in profile the near arm in front of the body and the far arm behind it). Exactly z at the front and zBack at
// the back.
export const DEPTH_ORDER = 0.6
export const DEPTH_ORDER_MAX = 25
export function viewZ(t: Turning, z: number, zBack: number, xc: number): number {
  const across = -(xc - t.axis) * t.sin * DEPTH_ORDER
  return z + (zBack - z) * (1 - t.cos) / 2 + Math.max(-DEPTH_ORDER_MAX, Math.min(DEPTH_ORDER_MAX, across))
}

// ---- groups turned in depth (phase A2) ----

// A group turned in depth: about its pivot (x, y, and its depth), first nodded (pitch: up for a positive amount, about the line across the group) and then turned (yaw:
// about the group's own up line, the same way round as the figure turns). `ux, uy` is the group's up line in the picture (y down), so a head tilted sideways turns about its
// own tilted up line.
export interface Spin { px: number; py: number; pd: number; ux: number; uy: number; yaw: number; pitch: number }

// A point (x, y, depth) carried through a list of spins, the innermost group first.
export function spinPoint(spins: readonly Spin[], x: number, y: number, d: number): [number, number, number] {
  for (const s of spins) {
    const ax = -s.uy, ay = s.ux, rx = x - s.px, ry = y - s.py
    let across = rx * ax + ry * ay, up = rx * s.ux + ry * s.uy, depth = d - s.pd
    if (s.pitch) {
      const a = (s.pitch * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a)
      const u2 = up * c + depth * n
      depth = -up * n + depth * c; up = u2
    }
    if (s.yaw) {
      const a = (s.yaw * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a)
      const a2 = across * c + depth * n
      depth = -across * n + depth * c; across = a2
    }
    x = s.px + across * ax + up * s.ux; y = s.py + across * ay + up * s.uy; d = s.pd + depth
  }
  return [x, y, d]
}
// A direction (across, up and down, toward the viewer) carried through the spins: a normal turns with the group, it does not move.
export function spinVector(spins: readonly Spin[], x: number, y: number, d: number): [number, number, number] {
  let p = spinPoint(spins.map(s => ({ ...s, px: 0, py: 0, pd: 0 })), x, y, d)
  const len = Math.hypot(p[0], p[1], p[2]) || 1
  p = [p[0] / len, p[1] / len, p[2] / len]
  return p
}
// The whole turn and nod of a list of spins (what a rounded outline narrows to; near enough when the up lines lean).
export const spinTotal = (spins: readonly Spin[]): { yaw: number; pitch: number } => spins.reduce((t, s) => ({ yaw: t.yaw + s.yaw, pitch: t.pitch + s.pitch }), { yaw: 0, pitch: 0 })

// A whole outline built in the front, its depths given, carried through the spins and then the view: every point and handle where it comes to.
export function spinOutline(a: BuiltPoint[], depth: Depths, spins: readonly Spin[], t: Turning): BuiltPoint[] {
  return a.map((p, i) => {
    const [x, y, d] = spinPoint(spins, p.x, p.y, depth.pt[i] ?? 0)
    const [hix, hiy, hid] = spinPoint(spins, p.hix, p.hiy, depth.hi[i] ?? 0)
    const [hox, hoy, hod] = spinPoint(spins, p.hox, p.hoy, depth.ho[i] ?? 0)
    return { ...p, x: turnedX(t, x, d), y, hix: turnedX(t, hix, hid), hiy, hox: turnedX(t, hox, hod), hoy }
  })
}
// A rounded outline carried through spins and the view: its middle goes where the spins and the view put it, and the outline is drawn about it as wide as the whole turn
// leaves it and as tall as the whole nod does.
export function spinSilhouette(a: BuiltPoint[], cx: number, cy: number, dc: number, thick: number, spins: readonly Spin[], t: Turning): { pts: BuiltPoint[]; m: Mat; depth: number } {
  const [x, y, d] = spinPoint(spins, cx, cy, dc), tot = spinTotal(spins)
  const kx = squash(turningOf(angleOfTurning(t) + tot.yaw, t.axis), thick), ky = Math.abs(squash(turningOf(tot.pitch, t.axis), thick))
  const X = turnedX(t, x, d)
  const m: Mat = [kx, 0, 0, ky, X - kx * cx, y - ky * cy]
  const pts = a.map(p => ({ ...p, x: kx * p.x + m[4], y: ky * p.y + m[5], hix: kx * p.hix + m[4], hiy: ky * p.hiy + m[5], hox: kx * p.hox + m[4], hoy: ky * p.hoy + m[5] }))
  return { pts, m, depth: turnedDepth(t, x, d) }
}
// The angle a turning stands for, in degrees.
export const angleOfTurning = (t: Turning): number => (Math.atan2(t.sin, t.cos) * 180) / Math.PI

// ---- outlines drawn at key angles (phase A3) ----

// A shape's outline drawn at a key angle: the angle the figure (or its group) is turned to, the nod of a pitch key, and the outline in the group's own space, drawn about
// the shape's place at the front.
export interface Key { at: number; tilt: number; pts: ModelPoint[] }

// The gap between two angles going round from a to b (0..360).
const ahead = (a: number, b: number): number => (((b - a) % 360) + 360) % 360
const ease = (w: number): number => { const k = Math.max(0, Math.min(1, w)); return k * k * (3 - 2 * k) }

// What a shape seen at a yaw and a nod is drawn from: the turned outline (`null`), a key outline, or two of them blended (a key outline with the turned outline near it, or
// two keys of one row of nods). Keys of a row blend with each other when they are at most 90 degrees apart; a key reaches 45 degrees round into the turned outline;
// the rows of nods blend the same way with the level row. The weight `w` is how far toward `b`.
export type KeyPick = { a: Key | null; b: Key | null; w: number }
const ROW_GAP = 90, REACH = 45
function rowPick(row: Key[], yaw: number): KeyPick {
  if (row.length === 0) return { a: null, b: null, w: 0 }
  const exact = row.find(k => ahead(k.at, yaw) < 1e-6 || ahead(yaw, k.at) < 1e-6)
  if (exact) return { a: exact, b: null, w: 0 }
  // the nearest key going back round and the nearest going on
  let back: Key | null = null, on: Key | null = null, gb = 999, go = 999
  for (const k of row) { const b = ahead(k.at, yaw), o = ahead(yaw, k.at); if (b < gb) { gb = b; back = k } if (o < go) { go = o; on = k } }
  if (back && on && back !== on && gb + go <= ROW_GAP) return { a: back, b: on, w: ease(gb / (gb + go)) }
  // one key near: from the turned outline at REACH away to the key itself
  const near = gb <= go ? back : on, gap = Math.min(gb, go)
  return gap < REACH ? { a: null, b: near, w: ease(1 - gap / REACH) } : { a: null, b: null, w: 0 }
}
export interface KeyBlend { level: KeyPick; tilted: { pick: KeyPick; w: number } | null }
// The keys a shape is drawn from at a yaw and a nod: the level row, and (when the shape has keys nodded the way it is nodded) the row nearest the nod, blended in by how far
// the nod has gone toward it.
export function pickKeys(keys: readonly Key[], yaw: number, pitch: number): KeyBlend {
  const level = rowPick(keys.filter(k => k.tilt === 0), yaw)
  if (Math.abs(pitch) < 1e-6) return { level, tilted: null }
  const tilts = [...new Set(keys.filter(k => k.tilt !== 0 && Math.sign(k.tilt) === Math.sign(pitch)).map(k => k.tilt))].sort((a, b) => Math.abs(a) - Math.abs(b))
  if (tilts.length === 0) return { level, tilted: null }
  // the row at or past the nod, else the furthest; the lower row is the level one or the one before
  const upper = tilts.find(t => Math.abs(t) >= Math.abs(pitch) - 1e-6) ?? tilts[tilts.length - 1]
  const i = tilts.indexOf(upper), lowerTilt = i > 0 ? tilts[i - 1] : 0
  const span = Math.abs(upper) - Math.abs(lowerTilt), w = span > 0 ? Math.min(1, (Math.abs(pitch) - Math.abs(lowerTilt)) / span) : 1
  const lowerPick = lowerTilt === 0 ? level : rowPick(keys.filter(k => k.tilt === lowerTilt), yaw)
  const upperPick = rowPick(keys.filter(k => k.tilt === upper), yaw)
  if (upperPick.a === null && upperPick.b === null) return { level, tilted: null }
  return { level: lowerPick, tilted: { pick: upperPick, w: ease(w) } }
}
// Whether a blend reads any key at all.
export const usesKeys = (b: KeyBlend): boolean => !!(b.level.a || b.level.b || (b.tilted && (b.tilted.pick.a || b.tilted.pick.b)))
// The key drawn exactly at a yaw and nod, if there is one.
export const keyAt = (keys: readonly Key[], at: number, tilt: number): Key | undefined => keys.find(k => k.tilt === tilt && (ahead(k.at, at) < 1e-6 || ahead(at, k.at) < 1e-6))
// Whether a yaw and a nod are a place a key may be drawn at: multiples of 15, and not the front or the back seen level (those are the outline and the back outline).
export function isKeySpot(at: number, tilt: number): boolean {
  const a = ((Math.round(at) % 360) + 360) % 360
  return Math.abs(at - Math.round(at)) < 1e-6 && Math.abs(tilt - Math.round(tilt)) < 1e-6 && a % 15 === 0 && Math.round(tilt) % 15 === 0 && Math.abs(tilt) <= 60 && !(Math.round(tilt) === 0 && (a === 0 || a === 180))
}
// Two built outlines of the same number of points mixed, `w` of the way to the second.
export function mixBuilt(a: BuiltPoint[], b: BuiltPoint[], w: number): BuiltPoint[] {
  if (a.length !== b.length) return w < 0.5 ? a : b
  const m = (x: number, y: number) => x + (y - x) * w
  return a.map((p, i) => { const q = b[i]; return { ...(w < 0.5 ? p : q), x: m(p.x, q.x), y: m(p.y, q.y), hix: m(p.hix, q.hix), hiy: m(p.hiy, q.hiy), hox: m(p.hox, q.hox), hoy: m(p.hoy, q.hoy) } })
}
// The keys of a twin: its original's, each seen from the other side (the angle the other way round) and mirrored about the axis.
export function twinKeys(keys: readonly Key[], axis: number, reflect: (pts: ModelPoint[], axis: number) => ModelPoint[]): Key[] {
  return keys.map(k => ({ at: (360 - k.at) % 360, tilt: k.tilt, pts: reflect(k.pts, axis) }))
}

// An outline in two states, by point: where links, sliders and the skin have put each point (`drawn`) and where it was drawn (`rest`). A key is kept as drawn at rest and
// moved by the same amounts, point by point, so a shape drawn at an angle still follows what it is linked to and its sliders.
export interface Moved { drawn: ModelPoint[]; rest: ModelPoint[] }
// What each point of an outline of `n` points is moved by: from the first state with as many points (null when none has).
export function shiftOf(states: readonly Moved[], n: number): Array<[number, number]> | null {
  const s = states.find(m => m.rest.length === n && m.drawn.length === n)
  return s ? s.rest.map((p, i): [number, number] => [s.drawn[i].x - p.x, s.drawn[i].y - p.y]) : null
}
// An outline moved by a shift (unchanged when the counts differ), or moved back by it (`back`: what is kept, from what is shown).
export function shifted(pts: ModelPoint[], shift: Array<[number, number]> | null, back = false): ModelPoint[] {
  if (!shift || shift.length !== pts.length) return pts
  const k = back ? -1 : 1
  return pts.map((p, i) => (shift[i][0] || shift[i][1] ? { ...p, x: p.x + k * shift[i][0], y: p.y + k * shift[i][1] } : p))
}
// A key of the base outline carried to another outline of the shape (a form: round eyes where the key was drawn for almond ones). With as many points, each point moves
// by what the form moves it by; with another number, each point of the form keeps its place along the nearest edge of the base (and its distance off it), placed on the key.
export function carryKey(key: ModelPoint[], base: ModelPoint[], other: ModelPoint[], closed: boolean): ModelPoint[] {
  if (other === base) return key
  if (other.length === base.length && key.length === base.length) return key.map((p, i) => ({ ...p, x: p.x + other[i].x - base[i].x, y: p.y + other[i].y - base[i].y }))
  if (key.length !== base.length || base.length < 3 || other.length < 3) return key
  const a = build(base, closed), b = build(key, closed), sa = windSign(a), sb = windSign(b), n = a.length, last = closed ? n : n - 1
  return other.map(p => {
    let best = { e: 0, t: 0, d: Infinity, o: 0 }
    for (let e = 0; e < last; e++) {
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, q = bezierAt(a, e, t), d = Math.hypot(q.x - p.x, q.y - p.y)
        if (d < best.d) best = { e, t, d, o: (p.x - q.x) * q.ty * sa + (p.y - q.y) * -q.tx * sa }
      }
    }
    const q = bezierAt(b, best.e, best.t)
    return { ...p, x: q.x + q.ty * sb * best.o, y: q.y - q.tx * sb * best.o, bind: null }
  })
}
// A built outline drawn through `m`, back in the space `m` draws from, as points: where a point of `like` (the outline it was built from) had its handle worked out, it is
// worked out again; a handle of its own is kept as it is drawn. Links are not kept (a key moves with its points' links by the shift).
export function unbuild(a: BuiltPoint[], m: Mat, like: readonly ModelPoint[]): ModelPoint[] {
  const inv = inverse(m), r = (v: number) => Math.round(v * 100) / 100
  return a.map((p, i) => {
    const [x, y] = apply(inv, p.x, p.y), [ix, iy] = apply(inv, p.hix, p.hiy), [ox, oy] = apply(inv, p.hox, p.hoy)
    const ref = like.length === a.length ? like[i] : undefined
    return {
      x: r(x), y: r(y), m: p.m,
      hi: ref && ref.hi == null ? null : [r(ix - x), r(iy - y)],
      ho: ref && ref.ho == null ? null : [r(ox - x), r(oy - y)],
      ...(ref?.w != null ? { w: ref.w } : {}),
    }
  })
}

// ---- the data, held to what the server keeps ----

export const DEPTH_RANGE = { min: -200, max: 200 } as const
export const THICK_RANGE = { min: 0, max: 2 } as const
export const ANGLE_OUTLINES_MAX = 16
export const TILT_RANGE = { min: -60, max: 60 } as const
const r2 = (v: number) => Math.round(v * 100) / 100
const within = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// A key angle as the server keeps it: a multiple of 15 (null for any other), and seen level not the front or the back (phase A3: a nodded key may be drawn there); its nod
// a multiple of 15 within the range.
export function keyAngle(v: unknown, tilt = 0): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const a = ((Math.round(v) % 360) + 360) % 360
  return a % 15 !== 0 || (tilt === 0 && (a === 0 || a === 180)) ? null : a
}
export const keyTilt = (v: unknown): number => Math.round(within(v, TILT_RANGE.min, TILT_RANGE.max, 0) / 15) * 15
// Outlines at key angles: bad entries dropped, a second one for the same angle and nod too, and one with fewer than three points.
export function repairAngles(v: unknown, point: (p: unknown) => ModelPoint): ModelAngleOutline[] {
  const out: ModelAngleOutline[] = []
  if (!Array.isArray(v)) return out
  for (const raw of v) {
    if (!isRecord(raw)) continue
    const tilt = keyTilt(raw.tilt), at = keyAngle(raw.at, tilt)
    if (at === null) continue
    const pts = (Array.isArray(raw.pts) ? raw.pts : []).slice(0, 60).map(point)
    if (pts.length >= 3 && !out.some(x => x.at === at && x.tilt === tilt)) out.push({ at, tilt, pts })
  }
  return out.slice(0, ANGLE_OUTLINES_MAX)
}
// How a shape turns, as the server keeps it (null when there is nothing): depth and per-point depth held to the range in hundredths, one per point when there are any.
export function repairTurn(v: unknown, points: number, point: (p: unknown) => ModelPoint): ModelTurn | null {
  if (!isRecord(v)) return null
  const dz = Array.isArray(v.dz) && v.dz.length > 0 ? Array.from({ length: points }, (_, i) => r2(within((v.dz as unknown[])[i], DEPTH_RANGE.min, DEPTH_RANGE.max, 0))) : []
  const seen = Array.isArray(v.seen) && v.seen.length === 2 && v.seen.every(x => typeof x === 'number' && Number.isFinite(x))
    ? [Math.round((((v.seen[0] as number) % 360) + 360) % 360 * 10) / 10, Math.round((((v.seen[1] as number) % 360) + 360) % 360 * 10) / 10] as [number, number] : null
  return {
    depth: r2(within(v.depth, DEPTH_RANGE.min, DEPTH_RANGE.max, 0)),
    thick: typeof v.thick === 'number' && Number.isFinite(v.thick) ? r2(within(v.thick, THICK_RANGE.min, THICK_RANGE.max, 1)) : null,
    dz, angles: repairAngles(v.angles, point), seen,
  }
}
// What stops a model from being published (the server says the same in the same words): an object lies on a shape that is not there, or on one of its own.
export function turnFaults(c: ModelContent): string[] {
  const faults: string[] = [], shapes = new Set(c.shapes.map(s => s.id))
  for (const o of c.objects) {
    if (!o.wrap) continue
    const name = o.name || o.id
    if (!shapes.has(o.wrap)) faults.push(`Object ${name} lies on a shape that does not exist.`)
    else if (o.shapes.includes(o.wrap)) faults.push(`Object ${name} lies on one of its own shapes.`)
  }
  return faults
}
// A group's depth as the server keeps it.
export const repairDepth = (v: unknown): number => r2(within(v, DEPTH_RANGE.min, DEPTH_RANGE.max, 0))
