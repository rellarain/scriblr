import type { ModelContent, ModelShape } from '../../../../../api/types'
import { updateShape } from '../modelContent'
import { guardAnchors } from './anchors'
import { apply, inverse, mul, scaleAlong, type Mat } from './geometry'
import type { Solved } from './rig'
import { transformShape } from './transform'

// Lines of symmetry as handles (Z5, the user: "lengthen/shrink the torso length along the spine/line of symmetry"). A symmetric shape with one axis has a line of symmetry
// running between the two points of its outline that lie on the axis. Dragging an end of the line lengthens or shortens the shape along it, the other end staying put;
// symmetric shapes connected to each other whose lines lie on one line (the chest, the abdomen and the pelvis on the spine) share their ends, and stretch together about the far
// end, each keeping its share. A width handle on the outline widens or narrows the shape evenly on both sides of its line. Everything here is in canvas space. Pure.

type P = [number, number]
const ANGLE_TOL = Math.sin((1 * Math.PI) / 180)
const PLACE_TOL = 0.5
// the shortest a line may be stretched to, and how thin a shape may be made
export const LINE_MIN = 2
const WIDTH_MIN = 0.05

// A symmetric shape's line of symmetry where it is drawn: from the first point on its axis to the other (the outline's points 0 and m + 1). Null for a shape with no
// symmetry or more than one axis.
export function lineOf(s: ModelShape | undefined, solved: Solved): { a: P; b: P } | null {
  const sym = s?.sym, r = s ? solved.shapes[s.id] : undefined
  if (!s || !sym || sym.n !== 1 || !r || s.pts.length !== 2 * (sym.m + 1) || r.local.length !== s.pts.length) return null
  const p = r.local[0], q = r.local[sym.m + 1], a = apply(r.matrix, p.x, p.y), b = apply(r.matrix, q.x, q.y)
  return Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6 ? null : { a, b }
}

// The shapes a shape is connected to directly (links either way).
function neighbours(c: ModelContent): Map<string, Set<string>> {
  const near = new Map<string, Set<string>>()
  const join = (a: string, b: string) => { if (a === b) return; (near.get(a) ?? near.set(a, new Set()).get(a)!).add(b); (near.get(b) ?? near.set(b, new Set()).get(b)!).add(a) }
  for (const s of c.shapes) for (const p of s.pts) if (p.bind?.s) join(s.id, p.bind.s)
  return near
}

// The line a symmetric shape is on: its own, carried on through the symmetric shapes connected to it (through any number of them) whose lines lie on the same line (within
// 1 degree and half a unit). Its two ends are the furthest ends of them all, `a` on the side of the shape's own first end.
export function sharedLine(c: ModelContent, solved: Solved, id: string): { ids: string[]; a: P; b: P } | null {
  const byId = new Map(c.shapes.map(s => [s.id, s]))
  const own = lineOf(byId.get(id), solved)
  if (!own) return null
  const L = Math.hypot(own.b[0] - own.a[0], own.b[1] - own.a[1]), ux = (own.b[0] - own.a[0]) / L, uy = (own.b[1] - own.a[1]) / L
  const off = (p: P) => Math.abs((p[0] - own.a[0]) * uy - (p[1] - own.a[1]) * ux)
  const onLine = (l: { a: P; b: P }) => {
    const m = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1])
    return Math.abs(((l.b[0] - l.a[0]) * uy - (l.b[1] - l.a[1]) * ux) / m) <= ANGLE_TOL && off(l.a) <= PLACE_TOL && off(l.b) <= PLACE_TOL
  }
  const near = neighbours(c), ids = [id], lines = new Map([[id, own]])
  for (let k = 0; k < ids.length; k++) {
    for (const n of near.get(ids[k]) ?? []) {
      if (lines.has(n)) continue
      const l = lineOf(byId.get(n), solved)
      if (l && onLine(l)) { lines.set(n, l); ids.push(n) }
    }
  }
  const along = (p: P) => (p[0] - own.a[0]) * ux + (p[1] - own.a[1]) * uy
  const ts = [...lines.values()].flatMap(l => [along(l.a), along(l.b)])
  const lo = Math.min(...ts), hi = Math.max(...ts)
  return { ids, a: [own.a[0] + ux * lo, own.a[1] + uy * lo], b: [own.a[0] + ux * hi, own.a[1] + uy * hi] }
}

// The stretch along a line that takes its end `end` to the pointer's place along it (`to`), the far end staying put: a scale along the line about the far end. Every shape
// on the line taken through it keeps its share. Null for a line with no length.
export function stretchMat(far: P, end: P, to: P): Mat | null {
  const dx = end[0] - far[0], dy = end[1] - far[1], L = Math.hypot(dx, dy)
  if (L < 1e-6) return null
  const ux = dx / L, uy = dy / L, t = (to[0] - far[0]) * ux + (to[1] - far[1]) * uy
  return scaleAlong(Math.max(LINE_MIN, t) / L, ux, uy, far[0], far[1])
}

// Where a shape's width handle sits: where its drawn outline crosses the line square to its line of symmetry through the middle of it (the crossing furthest out), so
// it keeps clear of the corners and their points.
export function widthHandle(s: ModelShape | undefined, solved: Solved): P | null {
  const line = lineOf(s, solved), poly = s ? solved.shapes[s.id]?.poly : undefined
  if (!line || !poly || poly.length < 3) return null
  const L = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]), ux = (line.b[0] - line.a[0]) / L, uy = (line.b[1] - line.a[1]) / L
  const mx = (line.a[0] + line.b[0]) / 2, my = (line.a[1] + line.b[1]) / 2
  const along = (p: P) => (p[0] - mx) * ux + (p[1] - my) * uy
  let best: P | null = null, bd = 1e-6
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length], sp = along(p), sq = along(q)
    if (sp === sq || (sp > 0 && sq > 0) || (sp < 0 && sq < 0)) continue
    const t = sp / (sp - sq), x: P = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], d = Math.abs((x[0] - mx) * uy - (x[1] - my) * ux)
    if (d > bd) { bd = d; best = x }
  }
  return best
}

// The widening across a line that takes the width handle at `from` to the pointer's distance from the line (`to`): a scale across the line about it, so both sides move
// alike. Null when the handle lies on the line.
export function widenMat(line: { a: P; b: P }, from: P, to: P): Mat | null {
  const L = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1])
  if (L < 1e-6) return null
  const nx = -(line.b[1] - line.a[1]) / L, ny = (line.b[0] - line.a[0]) / L
  const d0 = (from[0] - line.a[0]) * nx + (from[1] - line.a[1]) * ny, d1 = (to[0] - line.a[0]) * nx + (to[1] - line.a[1]) * ny
  if (Math.abs(d0) < 1e-6) return null
  return scaleAlong(Math.max(WIDTH_MIN, d1 / d0), nx, ny, line.a[0], line.a[1])
}

// Every shape named taken through a matrix in canvas space (each in its own space: the stretch as it is drawn, so its line stays its line); refused, with the reason,
// when it would move an anchor.
export function applyOnCanvas(c: ModelContent, solved: Solved, ids: string[], m: Mat): { ok: true; content: ModelContent } | { ok: false; reason: string } {
  let next = c
  for (const id of ids) {
    const s = c.shapes.find(x => x.id === id), r = solved.shapes[id]
    if (!s || !r) continue
    const g = guardAnchors(s, transformShape(s, mul(inverse(r.matrix), mul(m, r.matrix))))
    if (!g.ok) return { ok: false, reason: g.reason }
    const shape = g.shape
    next = updateShape(next, id, () => shape)
  }
  return { ok: true, content: next }
}
