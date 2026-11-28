import type { ModelPoint, ModelShape } from '../../../../../api/types'
import { hasIn, hasOut, r2, type BuiltPoint } from './geometry'

// Per-edge outlines (slice 9a): a shape's outline can leave some of its edges out. Edge e runs from point e to the next; `line: false` on point e leaves it out. Only a shape's
// own points carry the flags: what is drawn from them (a twin, a clone, a class member, a form or a key with as many points) reads the flags of the shape it is drawn from.

// Whether edge e has an outline.
export const edgeLined = (pts: readonly ModelPoint[], e: number): boolean => pts[e]?.line !== false

// Which edges of an outline drawn from these points have an outline, in the order the drawn outline runs (`reversed`: a mirror image, which runs the other way round), or
// null when every edge has one (the common case: the whole outline is drawn as one path).
export function edgeFlags(pts: readonly ModelPoint[], reversed = false): boolean[] | null {
  if (!pts.some(p => p.line === false)) return null
  const on = pts.map(p => p.line !== false)
  return reversed ? reverseFlags(on) : on
}
// The flags of a mirror image: its point j is the original's point n-1-j, so its edge j (j to j+1) is the original's edge n-2-j.
export function reverseFlags(on: readonly boolean[] | null): boolean[] | null {
  if (!on) return null
  const n = on.length
  return on.map((_, j) => on[(((n - 2 - j) % n) + n) % n])
}

// The points with the flags written on, for a list drawn from another (each point's own flag replaced).
export const tagEdges = (list: readonly ModelPoint[], flags: readonly boolean[]): ModelPoint[] =>
  list.map((p, i) => {
    if (flags[i] === false) return p.line === false ? p : { ...p, line: false }
    if (p.line !== false) return p
    const { line: _line, ...rest } = p
    return rest
  })

// The path text of the edges that have an outline: one subpath per run of outlined edges (a closed outline's run may wrap round past its first point). '' when no edge has one.
export function linePathText(a: readonly BuiltPoint[], closed: boolean, on: readonly boolean[]): string {
  const n = a.length, edges = closed ? n : n - 1
  if (n < 2 || edges < 1) return ''
  const lit = (e: number) => on[e] !== false
  const all = Array.from({ length: edges }, (_, e) => e).every(lit)
  // start just after an edge with no outline, so a run is never cut in two at the first point
  let start = 0
  if (closed && !all) { const off = Array.from({ length: edges }, (_, e) => e).find(e => !lit(e))!; start = (off + 1) % n }
  const seg = (i: number) => {
    const p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m)
    return !o && !ii ? `L${r2(q.x)} ${r2(q.y)}` : `C${r2(o ? p.hox : p.x)} ${r2(o ? p.hoy : p.y)} ${r2(ii ? q.hix : q.x)} ${r2(ii ? q.hiy : q.y)} ${r2(q.x)} ${r2(q.y)}`
  }
  let s = '', open = false
  for (let k = 0; k < edges; k++) {
    const e = (start + k) % n
    if (!lit(e)) { open = false; continue }
    if (!open) { s += `M${r2(a[e].x)} ${r2(a[e].y)}`; open = true }
    s += seg(e)
  }
  return closed && all ? s + 'Z' : s
}

// ---- editing ----

// Edge e with its outline on or off.
export function setEdgeLine(pts: readonly ModelPoint[], e: number, on: boolean): ModelPoint[] {
  return pts.map((p, i) => {
    if (i !== e) return p
    if (!on) return { ...p, line: false }
    const { line: _line, ...rest } = p
    return rest
  })
}

// Every edge with its outline on (or off).
export const setAllEdgeLines = (pts: readonly ModelPoint[], on: boolean): ModelPoint[] => pts.map((p, i) => (edgeLined(pts, i) === on ? p : setEdgeLine([p], 0, on)[0]))

// How many of the shape's edges have an outline, out of how many it has.
export function edgeCount(pts: readonly ModelPoint[], closed: boolean): { lined: number; edges: number } {
  const edges = closed ? pts.length : Math.max(0, pts.length - 1)
  let lined = 0
  for (let e = 0; e < edges; e++) if (edgeLined(pts, e)) lined++
  return { lined, edges }
}

// ---- the editor: which stored points a shape's edges are kept on ----

// A twin's edges are kept on its original (the other way round), a clone's are its original's (not edited on the clone), and from the back a shape with an outline of its
// own for the back keeps them on that outline.
export interface EdgeHome { shapeId: string; key: 'pts' | 'back'; reversed: boolean; list: ModelPoint[]; closed: boolean }
export function edgeHome(shapes: readonly ModelShape[], shape: ModelShape, back: boolean): EdgeHome | null {
  if (shape.cloneOf) return null
  const original = shape.mirrorOf && shape.mirrorOf !== shape.id ? shapes.find(s => s.id === shape.mirrorOf) : undefined
  const home = original && !original.mirrorOf ? original : shape
  const key = back && (home.back?.length ?? 0) >= 3 ? 'back' : 'pts'
  const list = key === 'back' ? home.back! : home.pts
  return { shapeId: home.id, key, reversed: home !== shape, list, closed: home.closed }
}
// Edge e of the drawn outline is edge `stored(e)` of the stored points.
const storedEdge = (n: number, e: number, reversed: boolean): number => (reversed ? (((n - 2 - e) % n) + n) % n : e)
// Whether edge e of the shape as drawn has an outline.
export const homeEdgeLined = (h: EdgeHome, e: number): boolean => edgeLined(h.list, storedEdge(h.list.length, e, h.reversed))
// The stored points with edge e of the shape as drawn (null: every edge) set on or off.
export const setHomeEdge = (h: EdgeHome, e: number | null, on: boolean): ModelPoint[] =>
  e === null ? setAllEdgeLines(h.list, on) : setEdgeLine(h.list, storedEdge(h.list.length, e, h.reversed), on)
