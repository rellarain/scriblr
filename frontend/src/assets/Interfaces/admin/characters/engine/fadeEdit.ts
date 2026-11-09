import type { ModelContent, ModelShape } from '../../../../../api/types'
import { shapeById } from '../modelContent'
import { clamp, r2 } from './geometry'
import { done, fail, stepOf, type Edit } from './rigEdit'

// Creases (phase 5b): a shape that shows with a slider. It is fully hidden at one value of the slider and fully drawn at another, in proportion between (the
// two ends may be either way round, for a shape that fades out). Any shape can fade: a crease at an elbow, a blush that comes with an expression. A twin and a
// shape that follows a pattern fade as the shape they copy does, unless they fade on their own.

const mapShape = (c: ModelContent, id: string, change: (s: ModelShape) => ModelShape): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === id ? change(s) : s)) })

// Fade a shape with a slider (null: stop). The places start where the slider is at rest (hidden) and at its largest value (shown).
export function setFade(c: ModelContent, shapeId: string, sliderId: string | null): Edit {
  const s = shapeById(c, shapeId)
  if (!s) return fail('There is no such shape.')
  if (s.mirrorOf) return fail('A twin follows its original: fade the original, or break the pair.')
  if (sliderId === null) return done(mapShape(c, shapeId, x => ({ ...x, opBy: null })))
  const r = c.ranges.find(x => x.id === sliderId)
  if (!r) return fail('There is no such slider.')
  if (s.opBy?.slider === sliderId) return done(c)
  const shown = r.max > r.rest ? r.max : r.min
  return done(mapShape(c, shapeId, x => ({ ...x, opBy: { slider: sliderId, hidden: r.rest, shown } })))
}

// Move the value at which the shape is hidden or shown one step (a degree or a percent; five with `big`), inside the slider's own span.
export function stepFade(c: ModelContent, shapeId: string, end: 'hidden' | 'shown', dir: -1 | 1, big = false): ModelContent {
  const s = shapeById(c, shapeId), f = s?.opBy, r = f && c.ranges.find(x => x.id === f.slider)
  if (!s || !f || !r) return c
  const next = clamp(r2(f[end] + dir * stepOf(r, big)), r.min, r.max)
  return mapShape(c, shapeId, x => ({ ...x, opBy: { ...f, [end]: next } }))
}

// The shapes that show with a slider (for the slider's own list).
export const fadedBy = (c: ModelContent, sliderId: string): ModelShape[] => c.shapes.filter(s => s.opBy?.slider === sliderId)
