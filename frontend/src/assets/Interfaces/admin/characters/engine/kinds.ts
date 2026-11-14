import type { ModelShape, ModelShapeKind } from '../../../../../api/types'

// The types a shape can have (shape types T1). A base shape is the plain drawing. A stretch shape is any base shape whose every point follows another shape (a shape made as a
// stretch shape records that only, so the editor can say which of its points still follow nothing). A pivot circle (T3) turns the shapes hung on it. A shadow and a light are
// black and white, see-through, drawn above every other shape and kept inside them; a light and a shadow may not overlap.

export const SHAPE_KINDS: ModelShapeKind[] = ['base', 'stretch', 'pivot', 'shadow', 'light']
export const KIND_NAMES: Record<ModelShapeKind, string> = { base: 'Base', stretch: 'Stretch', pivot: 'Pivot', shadow: 'Shadow', light: 'Light' }

// A kind as the server keeps it: a base shape unless it is one of the others.
export const kindOf = (v: unknown): ModelShapeKind => (SHAPE_KINDS.includes(v as ModelShapeKind) ? (v as ModelShapeKind) : 'base')

// A shadow or a light: drawn above the rest, inside it, in black or white.
export type CastKind = 'shadow' | 'light'
export const isCast = (s: Pick<ModelShape, 'kind'> | undefined | null): boolean => s?.kind === 'shadow' || s?.kind === 'light'
export const CAST_FILL: Record<CastKind, string> = { shadow: '#000000', light: '#ffffff' }
// the opacity a new one starts with
export const CAST_OPACITY: Record<CastKind, number> = { shadow: 0.3, light: 0.25 }

// Every point follows another shape (a shape needs at least three points to count).
export const allLinked = (s: Pick<ModelShape, 'pts'>): boolean => s.pts.length >= 3 && s.pts.every(p => !!p.bind)
// What the shape acts as now: a base shape (or one made as a stretch shape) whose every point follows another shape is a stretch shape; the other kinds are what they say.
export function actsAs(s: Pick<ModelShape, 'kind' | 'pts'>): ModelShapeKind {
  const k = kindOf(s.kind)
  if (k === 'base' || k === 'stretch') return allLinked(s) ? 'stretch' : 'base'
  return k
}
// How many points of a shape follow nothing (what a shape made as a stretch shape still lacks).
export const unlinkedCount = (s: Pick<ModelShape, 'pts'>): number => s.pts.filter(p => !p.bind).length
