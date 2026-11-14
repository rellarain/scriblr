import type { ModelPoint, ModelPointMode, ModelShape, ModelSymmetry } from '../../../../../api/types'
import { SWAP, apply, build, hasIn, hasOut, inverse, mul, r2, type Mat } from './geometry'
import { frameOf, rotOf } from './transform'

// Symmetry in the shape editor (S6). A symmetric shape has `n` axes (1 to 6) through its middle, evenly spaced, the first at `a` degrees in the shape's own frame; they
// split it into 2n wedges. One wedge's part of the outline is the source (the first m + 2 points: a point on an axis, m points inside the wedge, a point on the next axis),
// and the rest of the outline is made from it by reflecting it across one axis after the next. The whole outline is kept in the points (2n(m + 1) of them), so drawing it
// needs nothing new; an edit of any copy is taken back to the source and the copies are made again. Turning symmetry off keeps every point where it is.

export const SYM_AXES_MAX = 6
// How near (model units) a point of the outline has to be to an axis to count as on it.
const ON_AXIS = 0.3

type V = [number, number]
type Cubic = [V, V, V, V]

const deg = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

// The angles (degrees) of the 2n rays from the middle, the first along the first axis.
export function rayAngles(rot: number, a: number, n: number): number[] {
  return Array.from({ length: 2 * n }, (_, j) => rot + a + (j * 180) / n)
}

// The wedge (0 .. 2n - 1) a place is in: between ray j and ray j + 1.
export function wedgeAt(cx: number, cy: number, rot: number, a: number, n: number, x: number, y: number): number {
  const span = 180 / n, t = (((deg(Math.atan2(y - cy, x - cx)) - rot - a) % 360) + 360) % 360
  return Math.min(2 * n - 1, Math.floor(t / span))
}

// A reflection across the line through (cx, cy) at `angle` degrees.
export function reflectAbout(cx: number, cy: number, angle: number): Mat {
  const t = rad(2 * angle), c = Math.cos(t), s = Math.sin(t)
  return [c, s, s, -c, cx - c * cx - s * cy, cy - s * cx + c * cy]
}

const linear = (m: Mat, v: [number, number] | null | undefined): [number, number] | null => (v ? [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]] : null)

// A point moved by a matrix (its handles turned with it); a mirror image keeps which handle comes in and which goes out.
function movePt(p: ModelPoint, m: Mat): ModelPoint {
  const [x, y] = apply(m, p.x, p.y)
  return { ...p, x, y, hi: linear(m, p.hi), ho: linear(m, p.ho) }
}

// A run of points the other way round: each point's handles and its curve modes swap ends.
const reversed = (run: ModelPoint[]): ModelPoint[] => [...run].reverse().map(p => ({ ...p, m: SWAP[p.m], hi: p.ho ?? null, ho: p.hi ?? null }))

const roundPt = (p: ModelPoint): ModelPoint => ({
  ...p, x: r2(p.x), y: r2(p.y), hi: p.hi ? [r2(p.hi[0]), r2(p.hi[1])] : null, ho: p.ho ? [r2(p.ho[0]), r2(p.ho[1])] : null,
})

// The axis line (degrees, mod 180) nearest the direction of a place from the middle.
function nearestLine(cx: number, cy: number, rot: number, a: number, n: number, x: number, y: number): number {
  const span = 180 / n, t = deg(Math.atan2(y - cy, x - cx)) - rot - a
  return rot + a + Math.round(t / span) * span
}

// The copies of the source, one per wedge going round from it: each is the one before reflected across the axis at its end (and turned the other way round). `maps[k]`
// takes the source to copy k; `flipped[k]` says copy k runs the other way.
function unfold(sym: ModelSymmetry, rot: number, run: ModelPoint[]): { runs: ModelPoint[][]; maps: Mat[]; flipped: boolean[] } {
  const runs: ModelPoint[][] = [run], maps: Mat[] = [[1, 0, 0, 1, 0, 0]], flipped = [false]
  let cur = run
  for (let k = 1; k < 2 * sym.n; k++) {
    const end = cur[cur.length - 1], line = nearestLine(sym.cx, sym.cy, rot, sym.a, sym.n, end.x, end.y), refl = reflectAbout(sym.cx, sym.cy, line)
    cur = reversed(cur.map(p => movePt(p, refl)))
    runs.push(cur); maps.push(mul(refl, maps[k - 1])); flipped.push(!flipped[k - 1])
  }
  return { runs, maps, flipped }
}

// The point without what it follows (a copy made by reflection must not follow what its source follows).
const unbound = (p: ModelPoint): ModelPoint => { const { bind: _bind, ...rest } = p; return rest }

// The whole outline made from its source (the first m + 2 points). The copies are geometry only: what a point follows is put back by the caller (see `withBinds`).
export function regenerate(shape: ModelShape): ModelShape {
  const sym = shape.sym
  if (!sym) return shape
  const run = shape.pts.slice(0, sym.m + 2)
  if (run.length < 2) return shape
  const { runs } = unfold(sym, rotOf(shape), run)
  return { ...shape, pts: runs.flatMap(r => r.slice(0, -1)).map(roundPt).map(unbound) }
}

// What the points of `from` follow, put back on the made outline: by number when the count is the same, else on the point at the same place (shape types T1: a symmetric shape's
// points may follow other shapes).
function withBinds(made: ModelShape, from: ModelPoint[]): ModelShape {
  if (!from.some(p => p.bind)) return made
  if (made.pts.length === from.length) return { ...made, pts: made.pts.map((p, i) => (from[i].bind ? { ...p, bind: from[i].bind } : p)) }
  const pts = made.pts.map(p => ({ ...p }))
  for (const q of from) {
    if (!q.bind) continue
    const at = pts.findIndex(p => !p.bind && Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01)
    if (at >= 0) pts[at] = { ...pts[at], bind: q.bind }
  }
  return { ...made, pts }
}

// The points of the outline that are copies of the same point of the source (that point's orbit), point i among them.
export function orbitOf(shape: Pick<ModelShape, 'sym' | 'pts'>, i: number): number[] {
  const sym = shape.sym
  if (!sym || shape.pts.length !== 2 * sym.n * (sym.m + 1)) return [i]
  const per = sym.m + 1, src = (j: number) => { const k = Math.floor(j / per), o = j % per; return k % 2 === 1 ? per - o : o }
  const mine = src(i)
  return shape.pts.flatMap((_, j) => (src(j) === mine ? [j] : []))
}

// The outline of a symmetric shape after its points that follow other shapes were moved there (`list`, in the solver): each moved point goes back to the source and the copies
// follow it, so the shape stays symmetric. A shape that is not symmetric, or whose count differs, is left as it is.
export function followBound(shape: ModelShape, list: ModelPoint[]): ModelPoint[] {
  const sym = shape.sym
  if (!sym || list.length !== shape.pts.length || list.length !== 2 * sym.n * (sym.m + 1)) return list
  const rot = rotOf(shape), runLen = sym.m + 2, per = sym.m + 1
  const source = shape.pts.slice(0, runLen)
  const { maps, flipped } = unfold(sym, rot, source)
  const src = source.map(p => ({ ...p }))
  let any = false
  // every point that follows, where the link put it (whether or not that is where it is kept), goes back to the source
  shape.pts.forEach((p, i) => {
    if (!p.bind) return
    const k = Math.floor(i / per), o = i % per, at = flipped[k] ? per - o : o
    src[at] = pinToAxis(sym, rot, source, backToSource(list[i], maps[k], flipped[k]), at)
    any = true
  })
  return any ? regenerate({ ...shape, pts: src }).pts : list
}

// ---- turning it on ----

// The outline as cubic pieces (every handle written out), one per side.
function cubicsOf(pts: ModelPoint[], closed: boolean): Cubic[] {
  const b = build(pts, closed), n = b.length, out: Cubic[] = []
  for (let e = 0; e < (closed ? n : n - 1); e++) {
    const p = b[e], q = b[(e + 1) % n]
    out.push([[p.x, p.y], hasOut(p.m) ? [p.hox, p.hoy] : [p.x, p.y], hasIn(q.m) ? [q.hix, q.hiy] : [q.x, q.y], [q.x, q.y]])
  }
  return out
}
const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
// De Casteljau: a cubic split at t into the part before and the part after.
function split(c: Cubic, t: number): [Cubic, Cubic] {
  const [p0, p1, p2, p3] = c, a = lerp(p0, p1, t), b = lerp(p1, p2, t), d = lerp(p2, p3, t), e = lerp(a, b, t), f = lerp(b, d, t), g = lerp(e, f, t)
  return [[p0, a, e, g], [g, f, d, p3]]
}
const at = (c: Cubic, t: number): V => { const u = 1 - t; return [u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0], u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1]] }

interface Crossing { ray: number; e: number; t: number }

// Where the outline crosses each ray: a place on the ray (beyond the middle), as a side and a spot along it. A point within ON_AXIS of a ray counts as on it.
function crossings(cubics: Cubic[], cx: number, cy: number, angles: number[]): Crossing[] {
  const out: Crossing[] = []
  angles.forEach((ang, ray) => {
    const u: V = [Math.cos(rad(ang)), Math.sin(rad(ang))]
    const along = (p: V) => (p[0] - cx) * u[0] + (p[1] - cy) * u[1], across = (p: V) => -(p[0] - cx) * u[1] + (p[1] - cy) * u[0]
    cubics.forEach((c, e) => {
      // a corner on the ray: counted once, at the start of the side that leaves it
      if (Math.abs(across(c[0])) <= ON_AXIS && along(c[0]) > ON_AXIS) { out.push({ ray, e, t: 0 }); return }
      const steps = 48
      let t0 = 0, y0 = across(at(c, 0))
      for (let k = 1; k <= steps; k++) {
        const t1 = k / steps, y1 = across(at(c, t1))
        // a crossing that ends on the next corner belongs to the next side
        if (k === steps && Math.abs(y1) <= ON_AXIS) break
        // a sign change (a zero counts as above, so a crossing that falls on a sample is counted once)
        if ((y0 >= 0) !== (y1 >= 0)) {
          let lo = t0, hi = t1, ylo = y0
          for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2, ym = across(at(c, mid)); if ((ym >= 0) === (ylo >= 0)) { lo = mid; ylo = ym } else hi = mid }
          const t = (lo + hi) / 2
          if (along(at(c, t)) > 0) out.push({ ray, e, t })
        }
        t0 = t1; y0 = y1
      }
    })
  })
  return out
}

export type SymmetryResult = { ok: true; shape: ModelShape } | { ok: false; reason: string }

// Make a shape symmetric about `n` axes (the first at `a` degrees in its frame) through its middle, keeping the part of its outline in wedge `side` and making the rest from
// it. Refused when the outline does not cross each ray from the middle exactly once (it must go round its middle), or when it would have more than `max` points.
export function enableSymmetry(shape: ModelShape, axes: { a: number; n: number }, side: number, max: number): SymmetryResult {
  const n = Math.round(axes.n)
  if (!(n >= 1 && n <= SYM_AXES_MAX)) return { ok: false, reason: `A shape may have 1 to ${SYM_AXES_MAX} axes.` }
  if (!shape.closed || shape.pts.length < 3) return { ok: false, reason: 'Only a closed shape can be made symmetric.' }
  const f = frameOf(shape)
  if (!f) return { ok: false, reason: 'The shape has no outline.' }
  const rot = rotOf(shape), a = ((axes.a % 180) + 180) % 180, angles = rayAngles(rot, a, n), wedge = ((side % (2 * n)) + 2 * n) % (2 * n)
  const cubics = cubicsOf(shape.pts, true), found = crossings(cubics, f.cx, f.cy, angles)
  for (let j = 0; j < 2 * n; j++) {
    const k = found.filter(c => c.ray === j).length
    if (k !== 1) return { ok: false, reason: n === 1 ? 'The axis must cross the outline once on each side of the middle.' : 'Each axis must cross the outline once on each side of the middle: the outline has to go round its middle.' }
  }
  // the crossings in the order the outline meets them must go round the rays in turn, one way or the other
  const order = [...found].sort((p, q) => p.e - q.e || p.t - q.t).map(c => c.ray)
  const steps = order.map((r, i) => (order[(i + 1) % order.length] - r + 2 * n) % (2 * n))
  if (!steps.every(s => s === 1) && !steps.every(s => s === 2 * n - 1)) return { ok: false, reason: 'The outline must go round its middle, crossing the axes in turn.' }
  // the source: the outline from the crossing on one ray of the wedge to the crossing on the other, the way the outline runs
  const ca = found.find(c => c.ray === wedge)!, cb = found.find(c => c.ray === (wedge + 1) % (2 * n))!
  const forward = steps[0] === 1
  const [first, last] = forward ? [ca, cb] : [cb, ca]
  const pieces: Cubic[] = []
  const m = cubics.length
  if (first.e === last.e && last.t > first.t) pieces.push(split(split(cubics[first.e], first.t)[1], (last.t - first.t) / (1 - first.t))[0])
  else {
    pieces.push(split(cubics[first.e], first.t)[1])
    for (let e = (first.e + 1) % m; e !== last.e; e = (e + 1) % m) pieces.push(cubics[e])
    if (last.t > 1e-9) pieces.push(split(cubics[last.e], last.t)[0])
  }
  // points: the start, every corner between, and the end, with the handles of the pieces either side
  const curved = (from: V, to: V) => Math.hypot(to[0] - from[0], to[1] - from[1]) > 1e-6
  const run: ModelPoint[] = []
  for (let i = 0; i <= pieces.length; i++) {
    const before = i > 0 ? pieces[i - 1] : null, after = i < pieces.length ? pieces[i] : null
    const p = after ? after[0] : before![3]
    const hasI = !!before && curved(before[3], before[2]), hasO = !!after && curved(after[0], after[1])
    const mode: ModelPointMode = hasI && hasO ? 'c' : hasI ? 'cs' : hasO ? 'sc' : 's'
    run.push({ x: p[0], y: p[1], m: mode, hi: hasI ? [before![2][0] - p[0], before![2][1] - p[1]] : null, ho: hasO ? [after![1][0] - p[0], after![1][1] - p[1]] : null })
  }
  // the two ends lie on their axes, and the outline crosses each smoothly: the handle on the far side is the mirror image of the near one
  const fix = (p: ModelPoint, keep: 'hi' | 'ho'): ModelPoint => {
    const line = nearestLine(f.cx, f.cy, rot, a, n, p.x, p.y), u: V = [Math.cos(rad(line)), Math.sin(rad(line))]
    const d = (p.x - f.cx) * u[0] + (p.y - f.cy) * u[1], refl = reflectAbout(f.cx, f.cy, line)
    const h = p[keep], other = linear(refl, h)
    return { ...p, x: f.cx + u[0] * d, y: f.cy + u[1] * d, m: h ? 'c' : 's', hi: keep === 'hi' ? h ?? null : other, ho: keep === 'ho' ? h ?? null : other }
  }
  run[0] = fix(run[0], 'ho')
  run[run.length - 1] = fix(run[run.length - 1], 'hi')
  const inner = run.length - 2, total = 2 * n * (inner + 1)
  if (total > max) return { ok: false, reason: `Symmetric, the shape would have ${total} points; a shape may have at most ${max}.` }
  const sym: ModelSymmetry = { a, n, side: wedge, cx: r2(f.cx), cy: r2(f.cy), m: inner }
  return { ok: true, shape: regenerate({ ...shape, pts: run, sym, half: 0 }) }
}

// Turn symmetry off: every point stays where it is.
export const disableSymmetry = (shape: ModelShape): ModelShape => ({ ...shape, sym: null })

// ---- edits of a copy go to the source ----

const samePt = (p: ModelPoint, q: ModelPoint): boolean =>
  Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && p.m === q.m && JSON.stringify(p.hi ?? null) === JSON.stringify(q.hi ?? null) && JSON.stringify(p.ho ?? null) === JSON.stringify(q.ho ?? null)

// A point of copy k (as edited) brought back to the source: its place and handles through the inverse of the copy's map, the other way round for a copy that runs so.
function backToSource(p: ModelPoint, map: Mat, flipped: boolean): ModelPoint {
  const back = movePt(p, inverse(map))
  return flipped ? { ...back, m: SWAP[back.m], hi: back.ho ?? null, ho: back.hi ?? null } : back
}

export type SymmetryEdit = { shape: ModelShape; refused?: string }

// A point of the source that lies on an axis (its first or its last) kept on that axis line: the handle that was changed is kept and mirrored to the other side.
function pinToAxis(sym: ModelSymmetry, rot: number, source: ModelPoint[], p: ModelPoint, src: number): ModelPoint {
  if (src !== 0 && src !== source.length - 1) return p
  const ref = source[src], line = nearestLine(sym.cx, sym.cy, rot, sym.a, sym.n, ref.x, ref.y), u: V = [Math.cos(rad(line)), Math.sin(rad(line))]
  const d = (p.x - sym.cx) * u[0] + (p.y - sym.cy) * u[1], refl = reflectAbout(sym.cx, sym.cy, line)
  const keep: 'hi' | 'ho' = JSON.stringify(p.ho ?? null) !== JSON.stringify(ref.ho ?? null) ? 'ho' : 'hi'
  const h = p[keep]
  return { ...p, x: sym.cx + u[0] * d, y: sym.cy + u[1] * d, m: h ? 'c' : p.m === 's' ? 's' : p.m, hi: keep === 'hi' ? h ?? null : linear(refl, h), ho: keep === 'ho' ? h ?? null : linear(refl, h) }
}

// After an edit of a symmetric shape's points (`next`, from `old`): the edited points are taken back to the source and the copies are made again. A point added to any copy
// is added to the source (so to every copy); a point deleted from a copy is deleted from the source, but a point on an axis cannot be. An edit that moved the middle or the
// axes (a move or a turn of the whole shape) is kept as it is.
export function followSymmetry(old: ModelShape, next: ModelShape): SymmetryEdit {
  const sym = old.sym
  if (!sym || !next.sym) return { shape: next }
  const ns = next.sym
  if (ns.a !== sym.a || ns.n !== sym.n || ns.cx !== sym.cx || ns.cy !== sym.cy || ns.m !== sym.m || rotOf(next) !== rotOf(old)) return { shape: next }
  const rot = rotOf(old), runLen = sym.m + 2, per = sym.m + 1
  const source = old.pts.slice(0, runLen)
  const { maps, flipped } = unfold(sym, rot, source)
  const place = (index: number) => { const k = Math.floor(index / per), o = index % per; return { k, o, src: flipped[k] ? per - o : o } }
  const onAxis = (src: number) => src === 0 || src === runLen - 1
  const pin = (p: ModelPoint, src: number): ModelPoint => pinToAxis(sym, rot, source, p, src)
  if (next.pts.length === old.pts.length) {
    const src = source.map(p => ({ ...p }))
    let changed = false
    next.pts.forEach((p, i) => {
      if (samePt(p, old.pts[i])) return
      const { k, src: s } = place(i)
      src[s] = pin(backToSource(p, maps[k], flipped[k]), s)
      changed = true
    })
    if (!changed) return { shape: next }
    return { shape: withBinds(regenerate({ ...next, pts: src }), next.pts) }
  }
  if (next.pts.length === old.pts.length + 1) {
    // the new point and the side of the old outline it went into
    let at = 0
    while (at < old.pts.length && samePt(next.pts[at], old.pts[at])) at++
    const before = (at - 1 + old.pts.length) % old.pts.length
    const { k, o } = place(before)
    // the side from (k, o) to the next point of copy k is, in the source, the side after point o (or, the other way round, after point per - o - 1)
    const after = flipped[k] ? per - o - 1 : o
    const added = backToSource(next.pts[at], maps[k], flipped[k])
    const src = [...source.slice(0, after + 1), added, ...source.slice(after + 1)]
    return { shape: withBinds(regenerate({ ...next, pts: src, sym: { ...sym, m: sym.m + 1 } }), next.pts) }
  }
  if (next.pts.length === old.pts.length - 1) {
    let at = 0
    while (at < next.pts.length && samePt(next.pts[at], old.pts[at])) at++
    const { src: s } = place(at)
    if (onAxis(s)) return { shape: old, refused: 'A point on an axis of a symmetric shape cannot be deleted: turn symmetry off first.' }
    if (sym.m < 1) return { shape: old, refused: 'A symmetric shape needs its points.' }
    const src = source.filter((_, i) => i !== s)
    return { shape: withBinds(regenerate({ ...next, pts: src, sym: { ...sym, m: sym.m - 1 } }), next.pts) }
  }
  return { shape: old, refused: 'That edit cannot be made to a symmetric shape: turn symmetry off first.' }
}

// A symmetric shape's points are kept as written when they are, else symmetry is let go (a spec that does not fit its points is no symmetry).
export function symmetryOf(v: unknown, points: number): ModelSymmetry | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN)
  const n = Math.round(num(s.n)), m = Math.round(num(s.m)), a = num(s.a), cx = num(s.cx), cy = num(s.cy), side = Math.round(num(s.side))
  if (!(n >= 1 && n <= SYM_AXES_MAX) || !(m >= 0) || !Number.isFinite(a) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null
  if (points !== 2 * n * (m + 1)) return null
  return { a: r2(((a % 180) + 180) % 180), n, side: Number.isFinite(side) ? ((side % (2 * n)) + 2 * n) % (2 * n) : 0, cx: r2(cx), cy: r2(cy), m }
}
