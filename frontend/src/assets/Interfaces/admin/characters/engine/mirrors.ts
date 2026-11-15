import type { ModelContent, ModelMirrorLine, ModelPoint, ModelShape } from '../../../../../api/types'
import { r2 } from './geometry'
import { addShape, objectById, outlineSize, randomId, shapeById, twinsOf, freshId, type MakeId } from '../modelContent'
import { makeTwin, twinShape } from './pairEdit'
import { done, type Edit } from './rigEdit'
import { usesMirrorLine } from './mirrorLine'

// Mirrors (Z3), the edits: make a mirror of a shape or an object (a twin, reflected by default across the line of symmetry of a symmetric shape it is connected to, else
// the model's centre line), change the line, list the lines it may take, and keep a mirrored object's shapes in step with its original's. Pure.

const label = (name: string, fallback: string) => name.trim() || fallback

// The symmetric shapes a shape is connected to (a point of either links to the other), in the order of the model.
export function connectedSymmetric(c: ModelContent, shapeId: string): ModelShape[] {
  const s = shapeById(c, shapeId)
  if (!s) return []
  const mine = new Set(s.pts.flatMap(p => (p.bind ? [p.bind.s] : [])))
  return c.shapes.filter(x => x.id !== shapeId && !!x.sym && (mine.has(x.id) || x.pts.some(p => p.bind?.s === shapeId)))
}

// The axis of a symmetric shape nearest upright, as it is drawn in its own frame.
function uprightAxis(s: ModelShape): number {
  if (!s.sym) return 0
  let best = 0, bestLean = Infinity
  for (let k = 0; k < s.sym.n; k++) {
    const a = (((s.rot ?? 0) + s.sym.a + (k * 180) / s.sym.n) * Math.PI) / 180, lean = Math.abs(Math.cos(a))
    if (lean < bestLean - 1e-9) { best = k; bestLean = lean }
  }
  return best
}

// The line a new mirror of a shape takes: the upright axis of the first symmetric shape it is connected to (the breasts across the chest's line), else the model's centre line.
export function defaultMirrorLine(c: ModelContent, shapeId: string): ModelMirrorLine | null {
  const s = connectedSymmetric(c, shapeId)[0]
  return s ? { shape: s.id, k: uprightAxis(s) } : null
}

// The lines a mirror may take: the model's centre line, then each axis of every symmetric shape (those the original is connected to first).
export interface LineOption { line: ModelMirrorLine | null; name: string }
export function mirrorLineOptions(c: ModelContent, originalShapeIds: readonly string[]): LineOption[] {
  const near = new Set(originalShapeIds.flatMap(id => connectedSymmetric(c, id).map(s => s.id)))
  const skip = new Set(originalShapeIds)
  const shapes = c.shapes.filter(s => s.sym && !skip.has(s.id) && !s.mirrorOf)
  const ordered = [...shapes.filter(s => near.has(s.id)), ...shapes.filter(s => !near.has(s.id))]
  return [
    { line: null, name: "The model's centre line" },
    ...ordered.flatMap(s => Array.from({ length: s.sym!.n }, (_, k) => ({ line: { shape: s.id, k }, name: `${label(s.name, 'Untitled shape')}, axis ${k + 1}` }))),
  ]
}
export const sameLine = (a: ModelMirrorLine | null | undefined, b: ModelMirrorLine | null | undefined): boolean => (!a && !b) || (!!a && !!b && a.shape === b.shape && a.k === b.k)

// A mirror of a shape or an object: a twin with its line. The result names the new twin (a shape's, or the object's).
export function makeMirror(c: ModelContent, kind: 'shape' | 'object', id: string, make: MakeId = randomId): { edit: Edit; twinId?: string } {
  const e = makeTwin(c, kind, id, make)
  if (!e.ok) return { edit: e }
  let next = e.content
  if (kind === 'shape') {
    const twinId = twinsOf(next, 'shape', id)[0]
    const line = defaultMirrorLine(c, id)
    if (twinId && line) next = setMirrorLine(next, 'shape', twinId, line)
    return { edit: done(next), twinId }
  }
  const twinId = twinsOf(next, 'object', id)[0], o = objectById(c, id)
  const line = (o?.shapes ?? []).map(sid => defaultMirrorLine(c, sid)).find(l => !!l) ?? null
  if (twinId && line) next = setMirrorLine(next, 'object', twinId, line)
  return { edit: done(next), twinId }
}

// A twin's line; a twin object's line is its shapes' too.
export function setMirrorLine(c: ModelContent, kind: 'shape' | 'object', twinId: string, line: ModelMirrorLine | null): ModelContent {
  if (kind === 'shape') return { ...c, shapes: c.shapes.map(s => (s.id === twinId && s.mirrorOf ? { ...s, mirrorLine: line } : s)) }
  const o = objectById(c, twinId)
  if (!o?.mirrorOf) return c
  const mine = new Set(o.shapes)
  return {
    ...c,
    objects: c.objects.map(x => (x.id === twinId ? { ...x, mirrorLine: line } : x)),
    shapes: c.shapes.map(s => (mine.has(s.id) && s.mirrorOf ? { ...s, mirrorLine: line } : s)),
  }
}

// A mirrored object keeps a mirror of every shape of its original: a shape added to the original gets one in the mirror, with the mirror's line (models drawn across lines
// only; older twins are left as they were made).
export function reconcileMirrors(c: ModelContent, make: MakeId = randomId): ModelContent {
  let next = c
  for (const o of c.objects) {
    if (!o.mirrorOf || !usesMirrorLine(c, o)) continue
    const original = objectById(c, o.mirrorOf)
    if (!original || original.mirrorOf) continue
    for (const sid of original.shapes) {
      const s = shapeById(next, sid)
      if (!s || s.mirrorOf || s.copyOf || outlineSize(next, s) < 3 || twinsOf(next, 'shape', sid).length > 0) continue
      next = addShape(next, o.id, { ...twinShape(s, freshId(next, 's', make)), mirrorLine: o.mirrorLine ?? null })
    }
  }
  return next
}

// The points of an edit made on a mirror, given back to its original: `mapped` is the edited outline carried across the line into the original's own space; a point that
// is where one of the original's was keeps what that one carried (its link, its weight), all of them when the count is the same.
export function keepCarried(original: readonly ModelPoint[], mapped: readonly ModelPoint[]): ModelPoint[] {
  const tidy = (p: ModelPoint): Pick<ModelPoint, 'x' | 'y' | 'm' | 'hi' | 'ho'> => ({ x: r2(p.x), y: r2(p.y), m: p.m, hi: p.hi ? [r2(p.hi[0]), r2(p.hi[1])] : null, ho: p.ho ? [r2(p.ho[0]), r2(p.ho[1])] : null })
  if (original.length === mapped.length) return mapped.map((p, i) => ({ ...original[i], ...tidy(p) }))
  return mapped.map(p => {
    const was = original.find(q => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01)
    return was ? { ...was, ...tidy(p) } : { ...p, ...tidy(p) }
  })
}
// A point or segment of a mirror as the original numbers it (the mirror's outline runs the other way round).
export const originalPoint = (n: number, i: number): number => (n - 1 - i + n) % n
export const originalSegment = (n: number, e: number): number => (n - 2 - e + 2 * n) % n
