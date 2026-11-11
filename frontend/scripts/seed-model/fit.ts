// Fits cubic Beziers to a dense polyline (Philip J. Schneider, "An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems, 1990). The old portrait engine drew its
// faces as curves sampled at many points; the seed model keeps those outlines with a fifth of the points, within a tolerance of a fraction of a unit.

export type V = [number, number]
export interface Bez { p0: V; c1: V; c2: V; p3: V }

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s]
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1]
const len = (a: V): number => Math.hypot(a[0], a[1])
export const norm = (a: V): V => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0] }

export function bezierAt(b: Bez, t: number): V {
  const u = 1 - t
  return [
    u * u * u * b.p0[0] + 3 * u * u * t * b.c1[0] + 3 * u * t * t * b.c2[0] + t * t * t * b.p3[0],
    u * u * u * b.p0[1] + 3 * u * u * t * b.c1[1] + 3 * u * t * t * b.c2[1] + t * t * t * b.p3[1],
  ]
}
const d1 = (b: Bez, t: number): V => {
  const u = 1 - t
  return [
    3 * u * u * (b.c1[0] - b.p0[0]) + 6 * u * t * (b.c2[0] - b.c1[0]) + 3 * t * t * (b.p3[0] - b.c2[0]),
    3 * u * u * (b.c1[1] - b.p0[1]) + 6 * u * t * (b.c2[1] - b.c1[1]) + 3 * t * t * (b.p3[1] - b.c2[1]),
  ]
}
const d2 = (b: Bez, t: number): V => {
  const u = 1 - t
  return [
    6 * u * (b.c2[0] - 2 * b.c1[0] + b.p0[0]) + 6 * t * (b.p3[0] - 2 * b.c2[0] + b.c1[0]),
    6 * u * (b.c2[1] - 2 * b.c1[1] + b.p0[1]) + 6 * t * (b.p3[1] - 2 * b.c2[1] + b.c1[1]),
  ]
}

function chordParams(d: V[], first: number, last: number): number[] {
  const u: number[] = [0]
  for (let i = first + 1; i <= last; i++) u.push(u[i - first - 1] + len(sub(d[i], d[i - 1])))
  const total = u[last - first] || 1
  return u.map(x => x / total)
}

function generate(d: V[], first: number, last: number, u: number[], t1: V, t2: V): Bez {
  const n = last - first + 1, p0 = d[first], p3 = d[last]
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
  for (let i = 0; i < n; i++) {
    const t = u[i], s = 1 - t
    const b0 = s * s * s, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b3 = t * t * t
    const a1 = mul(t1, b1), a2 = mul(t2, b2)
    c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2)
    const tmp = sub(d[first + i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)))
    x0 += dot(a1, tmp); x1 += dot(a2, tmp)
  }
  const det = c00 * c11 - c01 * c01
  const alpha1 = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0
  const alpha2 = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0
  const seg = len(sub(p3, p0)), eps = 1e-6 * seg
  if (alpha1 < eps || alpha2 < eps) return { p0, c1: add(p0, mul(t1, seg / 3)), c2: add(p3, mul(t2, seg / 3)), p3 }
  return { p0, c1: add(p0, mul(t1, alpha1)), c2: add(p3, mul(t2, alpha2)), p3 }
}

function reparam(d: V[], first: number, last: number, u: number[], b: Bez): number[] {
  return u.map((t, i) => {
    const q = bezierAt(b, t), q1 = d1(b, t), q2 = d2(b, t), diff = sub(q, d[first + i])
    const num = dot(diff, q1), den = dot(q1, q1) + dot(diff, q2)
    return Math.abs(den) < 1e-12 ? t : Math.min(1, Math.max(0, t - num / den))
  })
}

function maxError(d: V[], first: number, last: number, b: Bez, u: number[]): { err: number; at: number } {
  let err = 0, at = Math.floor((last - first + 1) / 2)
  for (let i = first + 1; i < last; i++) {
    const e = len(sub(bezierAt(b, u[i - first]), d[i]))
    if (e >= err) { err = e; at = i }
  }
  return { err, at }
}

function fit(d: V[], first: number, last: number, t1: V, t2: V, tol: number, out: Bez[]) {
  if (last - first === 1) {
    const dist = len(sub(d[last], d[first])) / 3
    out.push({ p0: d[first], c1: add(d[first], mul(t1, dist)), c2: add(d[last], mul(t2, dist)), p3: d[last] })
    return
  }
  let u = chordParams(d, first, last)
  let b = generate(d, first, last, u, t1, t2)
  let m = maxError(d, first, last, b, u)
  if (m.err < tol) { out.push(b); return }
  if (m.err < tol * 16) {
    for (let k = 0; k < 24; k++) {
      u = reparam(d, first, last, u, b)
      b = generate(d, first, last, u, t1, t2)
      m = maxError(d, first, last, b, u)
      if (m.err < tol) { out.push(b); return }
    }
  }
  const at = Math.min(last - 1, Math.max(first + 1, m.at))
  const centre = norm(sub(d[at - 1], d[at + 1]))
  fit(d, first, at, t1, centre, tol, out)
  fit(d, at, last, mul(centre, -1), t2, tol, out)
}

// The Beziers through `d` (at least two points), starting along `t1` and arriving along `t2` (both unit vectors pointing into the curve, the way Schneider has them: t2 points back
// from the end). Either may be omitted and is then estimated from the points.
export function fitCurve(d: V[], tol: number, t1?: V, t2?: V): Bez[] {
  if (d.length < 2) return []
  const last = d.length - 1
  const a = t1 && len(t1) > 0.5 ? norm(t1) : norm(sub(d[Math.min(2, last)], d[0]))
  const b = t2 && len(t2) > 0.5 ? norm(t2) : norm(sub(d[Math.max(last - 2, 0)], d[last]))
  const out: Bez[] = []
  fit(d, 0, last, a, b, tol, out)
  return out
}

// How far a polyline strays from a set of Beziers (both ways), for the tests of the fit.
export function deviation(d: V[], beziers: Bez[], steps = 24): number {
  const samples: V[] = []
  for (const b of beziers) for (let s = 0; s <= steps; s++) samples.push(bezierAt(b, s / steps))
  const near = (p: V, q: V[]) => q.reduce((m, r) => Math.min(m, len(sub(p, r))), 1e9)
  // the distance to a sampled curve is read against the curve's own polyline segments, not only its sample points
  const segDist = (p: V, a: V, b: V): number => {
    const ab = sub(b, a), l2 = dot(ab, ab)
    const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0
    return len(sub(p, add(a, mul(ab, t))))
  }
  let worst = 0
  for (const p of d) { let m = 1e9; for (let i = 1; i < samples.length; i++) m = Math.min(m, segDist(p, samples[i - 1], samples[i])); worst = Math.max(worst, m) }
  for (const p of samples) { let m = 1e9; for (let i = 1; i < d.length; i++) m = Math.min(m, segDist(p, d[i - 1], d[i])); worst = Math.max(worst, Math.min(m, near(p, d))) }
  return worst
}
