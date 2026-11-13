// The texture of hair (phase O7): the edge of a shape drawn wavy, curly or coily, as the old portrait drew the edge of its hair (texPath in
// writer/characters/portrait/draw/hair.ts), from the amount of its Texture property: 0 is straight, and 11, 22, 33 ... 99 are the old portrait's textures 2A, 2B, 2C (wavy),
// 3A, 3B, 3C (curly) and 4A, 4B, 4C (coily; 4B a zigzag), with the waves growing and closing up smoothly between them.
// It is a matter of drawing only: the points of the shape stay where they are (editing, anchors, links, hit tests and boxes read the smooth outline), and the
// textured edge is the path that is painted.
//
// Only the edges that hang get it: the sides between points that carry a weight (the weights that make a lock fall and lengthen it), fading in from nothing at
// the points with no weight, so the roots of a lock of hair stay a smooth line where they meet the head. An outline with no weighted point at all is textured all
// the way round, unless another shape of its object hangs (the solver leaves the cap under a lock of hair smooth: its edges are roots). The curls are not all alike (the spaces between them, their height and their lean vary), but they are the same every time the shape is drawn:
// the variation is seeded by the shape's id.
import type { BuiltPoint } from './geometry'
import { hasIn, hasOut, pathText, r2, windSign } from './geometry'

// The old portrait's head is 92 units tall and the mannequin's 54: its waves and curls are drawn at that scale.
const SCALE = 54 / 92

export interface TextureSpec { kind: 'wavy' | 'curly' | 'zig'; amp: number; sp: number }

// The old portrait's textures at the amounts that stand for them: how far a wave or a curl stands out and how far apart they are (in the old portrait's units).
const ANCHORS: Array<{ at: number; kind: TextureSpec['kind']; amp: number; sp: number }> = [
  { at: 11, kind: 'wavy', amp: 1.8, sp: 20 }, { at: 22, kind: 'wavy', amp: 2.8, sp: 16 }, { at: 33, kind: 'wavy', amp: 3.8, sp: 13 },
  { at: 44, kind: 'curly', amp: 5, sp: 13 }, { at: 55, kind: 'curly', amp: 5.2, sp: 11 }, { at: 66, kind: 'curly', amp: 4.6, sp: 9 },
  { at: 77, kind: 'curly', amp: 3.2, sp: 7 }, { at: 88, kind: 'zig', amp: 2.8, sp: 6 }, { at: 99, kind: 'curly', amp: 2.4, sp: 5 },
]

// What an amount of texture draws (null for straight): the texture at the next of the old portrait's textures, grown smoothly from the one before when they are of a kind
// (below the first, a fraction of the gentlest wave).
export function textureSpec(amount: number): TextureSpec | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  const t = Math.min(99, amount)
  const i = ANCHORS.findIndex(a => t <= a.at), a = ANCHORS[i < 0 ? ANCHORS.length - 1 : i], prev = i > 0 ? ANCHORS[i - 1] : null
  let amp = a.amp, sp = a.sp
  if (!prev) amp *= t / a.at
  else if (prev.kind === a.kind) { const u = (t - prev.at) / (a.at - prev.at); amp = prev.amp + (a.amp - prev.amp) * u; sp = prev.sp + (a.sp - prev.sp) * u }
  return { kind: a.kind, amp: amp * SCALE, sp: sp * SCALE }
}

// A repeatable number from 0 to 1 for each whole number (the old portrait's `rnd`).
const rnd = (i: number): number => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x) }
const seedOf = (id: string): number => { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973; return h }
const smooth = (w: number): number => { const k = Math.max(0, Math.min(1, w * 1.6)); return k * k * (3 - 2 * k) }

interface Sample { x: number; y: number; s: number; f: number; tx: number; ty: number }

// One side of the outline, from point i to the next, as samples about a unit apart with the fade of the texture along it.
function sampleSide(a: BuiltPoint[], i: number, f0: number, f1: number, out: Sample[], first: boolean) {
  const n = a.length, p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
  const c1x = o ? p.hox : p.x, c1y = o ? p.hoy : p.y, c2x = ii ? q.hix : q.x, c2y = ii ? q.hiy : q.y
  const rough = Math.hypot(c1x - p.x, c1y - p.y) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(q.x - c2x, q.y - c2y)
  const steps = Math.max(4, Math.min(80, Math.ceil(rough)))
  for (let k = first ? 0 : 1; k <= steps; k++) {
    const t = k / steps, u = 1 - t
    const x = u * u * u * p.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * q.x
    const y = u * u * u * p.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * q.y
    let tx = 3 * u * u * (c1x - p.x) + 6 * u * t * (c2x - c1x) + 3 * t * t * (q.x - c2x)
    let ty = 3 * u * u * (c1y - p.y) + 6 * u * t * (c2y - c1y) + 3 * t * t * (q.y - c2y)
    if (!tx && !ty) { tx = q.x - p.x; ty = q.y - p.y }
    const tl = Math.hypot(tx, ty) || 1
    const last = out[out.length - 1]
    const s = last ? last.s + Math.hypot(x - last.x, y - last.y) : 0
    out.push({ x, y, s, f: f0 + (f1 - f0) * t, tx: tx / tl, ty: ty / tl })
  }
}

// The place `s` along the samples (linear between them).
function at(d: Sample[], s: number, from: { k: number }): Sample {
  while (from.k < d.length - 2 && d[from.k + 1].s < s) from.k++
  const a = d[from.k], b = d[Math.min(d.length - 1, from.k + 1)], span = b.s - a.s
  const t = span > 1e-9 ? Math.max(0, Math.min(1, (s - a.s) / span)) : 0
  const tx = a.tx + (b.tx - a.tx) * t, ty = a.ty + (b.ty - a.ty) * t, tl = Math.hypot(tx, ty) || 1
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s, f: a.f + (b.f - a.f) * t, tx: tx / tl, ty: ty / tl }
}

// Places along the samples every `step` (even) or at steps that vary by up to 42 percent either way (curls and coils are not all one size), always ending on the
// last sample; `loop` leaves the last off (it is the first again).
function spaced(d: Sample[], step: number, vary: boolean, seed: number, loop: boolean): Sample[] {
  const total = d[d.length - 1].s
  if (total < 1e-6) return [d[0]]
  const steps: number[] = []
  if (vary) { for (let k = 0, sum = 0; sum < total && k < 4000; k++) { const st = step * (1 + 0.42 * (2 * rnd(seed + k) - 1)); steps.push(st); sum += st } }
  else { const m = Math.max(1, Math.round(total / step)); for (let k = 0; k < m; k++) steps.push(total / m) }
  // the steps are scaled so that they end exactly at the end
  const sum = steps.reduce((x, y) => x + y, 0), k = total / sum
  const out: Sample[] = [], from = { k: 0 }
  let s = 0
  out.push(d[0])
  for (let i = 0; i < steps.length; i++) { s += steps[i] * k; out.push(i === steps.length - 1 ? d[d.length - 1] : at(d, s, from)) }
  if (loop && out.length > 3) out.pop()
  return out
}

// A smooth path through points (Catmull-Rom), continuing a path that is already at the first point (open) or closing on itself (loop).
function spline(pts: Array<[number, number]>, loop: boolean): string {
  const n = pts.length
  let s = ''
  const last = loop ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = pts[loop ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[loop ? (i + 2) % n : Math.min(n - 1, i + 2)]
    s += `C${r2(p1[0] + (p2[0] - p0[0]) / 6)} ${r2(p1[1] + (p2[1] - p0[1]) / 6)} ${r2(p2[0] - (p3[0] - p1[0]) / 6)} ${r2(p2[1] - (p3[1] - p1[1]) / 6)} ${r2(p2[0])} ${r2(p2[1])}`
  }
  return s
}

// The textured edge along samples that start at the current point of the path: the commands that follow it, ending at the last sample (open) or back at the
// first (loop).
function textured(d: Sample[], spec: TextureSpec, sign: 1 | -1, seed: number, loop: boolean): string {
  const out = (q: Sample, k: number): [number, number] => [q.x + q.ty * sign * k, q.y - q.tx * sign * k]
  if (spec.kind === 'wavy') {
    const pts = spaced(d, spec.sp / 4, false, seed, loop)
    const phase = (seed % 100) / 50
    const waved = pts.map(q => out(q, (0.5 + 0.5 * Math.sin((q.s / spec.sp + phase) * Math.PI)) * spec.amp * q.f))
    return spline(waved, loop)
  }
  const pts = spaced(d, spec.sp, true, seed, loop)
  const n = pts.length, last = loop ? n : n - 1
  let s = ''
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % n], seg = Math.hypot(b.x - a.x, b.y - a.y) || 1, tx = (b.x - a.x) / seg, ty = (b.y - a.y) / seg
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = ty * sign, ny = -tx * sign, f = (a.f + b.f) / 2
    if (spec.kind === 'zig') {
      const h = spec.amp * 1.5 * (0.5 + 0.95 * rnd(seed + i + 3)) * f, slide = (rnd(seed + i + 19) - 0.5) * seg * 0.7 * f
      s += `L${r2(mx + nx * h + tx * slide)} ${r2(my + ny * h + ty * slide)}L${r2(b.x)} ${r2(b.y)}`
    } else {
      const k = Math.min(spec.amp * (0.5 + 0.95 * rnd(seed + i + 11)) * (0.9 + 0.2 * Math.sin(i * 0.41)), seg * 0.7) * f
      const slide = (rnd(seed + i + 31) - 0.5) * 2 * seg * 0.45 * f
      s += `Q${r2(mx + nx * k * 1.6 + tx * slide)} ${r2(my + ny * k * 1.6 + ty * slide)} ${r2(b.x)} ${r2(b.y)}`
    }
  }
  return s
}

// One side as plain path text (a line, or a cubic where either end has a curve), continuing from point i.
function sideText(a: BuiltPoint[], i: number): string {
  const n = a.length, p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
  if (!o && !ii) return `L${r2(q.x)} ${r2(q.y)}`
  return `C${r2(o ? p.hox : p.x)} ${r2(o ? p.hoy : p.y)} ${r2(ii ? q.hix : q.x)} ${r2(ii ? q.hiy : q.y)} ${r2(q.x)} ${r2(q.y)}`
}

// The path that is painted for an outline (built curves in the canvas's space) with `amount` of texture: the plain path when there is none. `weights` are the weights
// of its points (missing ones count as none); `id` seeds the variation of the curls.
export function texturedPath(a: BuiltPoint[], closed: boolean, weights: ReadonlyArray<number | null | undefined>, amount: number, id: string): string {
  const spec = textureSpec(amount)
  const n = a.length
  if (!spec || n < 3 || spec.amp < 0.05) return pathText(a, closed)
  const anyWeight = weights.some(w => (w ?? 0) > 0)
  const fade = a.map((_, i) => (anyWeight ? smooth(weights[i] ?? 0) : 1))
  const sides = closed ? n : n - 1
  const rough = (i: number) => fade[i] > 0 || fade[(i + 1) % n] > 0
  const sign = windSign(a), seed = seedOf(id)
  // the whole outline hangs: one textured loop
  if (closed && Array.from({ length: sides }, (_, i) => i).every(rough)) {
    const d: Sample[] = []
    for (let i = 0; i < n; i++) sampleSide(a, i, fade[i], fade[(i + 1) % n], d, i === 0)
    const body = textured(d, spec, sign, seed, true)
    return `M${r2(a[0].x)} ${r2(a[0].y)}${body}Z`
  }
  // start where a smooth side begins after a textured one (or at the first point of an open outline), so each run of textured sides is drawn in one piece
  let start = 0
  if (closed) for (let i = 0; i < n; i++) if (!rough(i) && rough((i - 1 + n) % n)) { start = i; break }
  let s = `M${r2(a[start].x)} ${r2(a[start].y)}`, run = 0
  for (let k = 0; k < sides;) {
    const i = (start + k) % n
    if (!rough(i)) { s += sideText(a, i); k++; continue }
    const d: Sample[] = []
    let first = true
    while (k < sides && rough((start + k) % n)) {
      const j = (start + k) % n
      sampleSide(a, j, fade[j], fade[(j + 1) % n], d, first)
      first = false; k++
    }
    s += textured(d, spec, sign, seed + run * 97, false)
    run++
  }
  return s + (closed ? 'Z' : '')
}
