import type { ModelContent, ModelPattern, ModelShape } from '../../../../../api/types'
import { RANGE_NAME_MAX, randomId, shapeById, withoutHidden, type MakeId } from '../modelContent'
import { freshFormId } from './formEdit'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'

// Patterns (phase D4). A pattern is built from shapes: the marks (stripes, dots, scales, drawn by hand as ordinary shapes) are applied to a base shape, and from then on they are
// kept inside it (nothing of a mark shows outside the base, the way a shape clipped to another does) and switched on and off together. Hiding a pattern is hiding its id, as for an
// object, so a preset, a group state or the eye can do it. A twin follows the mark it mirrors, and a pattern is made on the originals. Every function is pure: it returns new content
// (or why it cannot) and leaves the content it was given alone.

const label = (name: string, id: string) => name.trim() || id
const clean = (name: string, max: number) => name.trim().slice(0, max)

export const patternsOf = (c: ModelContent): ModelPattern[] => c.patterns ?? []
export const patternById = (c: ModelContent, id: string): ModelPattern | undefined => patternsOf(c).find(p => p.id === id)
// The patterns made on a shape (it is their base).
export const patternsOn = (c: ModelContent, baseId: string): ModelPattern[] => patternsOf(c).filter(p => p.base === baseId)
// The pattern a shape is a mark of.
export const patternOfMark = (c: ModelContent, shapeId: string): ModelPattern | undefined => patternsOf(c).find(p => p.marks.includes(shapeId))

const markProblem = (c: ModelContent, base: ModelShape, markId: string, besides?: string): string | null => {
  const m = shapeById(c, markId)
  if (!m) return 'There is no such shape.'
  if (m.id === base.id) return `${label(base.name, base.id)} is the base: it cannot be one of its own marks.`
  if (m.mirrorOf) return `${label(m.name, m.id)} is a twin: make the pattern with the original, and the twin follows.`
  if (m.helper) return `${label(m.name, m.id)} is a helper shape: it is never drawn, so it cannot be a mark.`
  const other = patternOfMark(c, markId)
  if (other && other.id !== besides) return `${label(m.name, m.id)} is already a mark of ${label(other.name, other.id)}.`
  // a shape is a base or a mark, not both: marks kept inside marks would clip to each other in a circle
  if (patternsOn(c, markId).length > 0) return `${label(m.name, m.id)} is the base of a fill pattern: it cannot also be a mark.`
  return null
}

// The marks that share the base's object are moved to just after it, in the order they had, and lifted to its depth, so they are drawn over it.
function layerOver(c: ModelContent, base: ModelShape, marks: string[]): ModelContent {
  const home = c.objects.find(o => o.shapes.includes(base.id))
  const same = marks.filter(m => home?.shapes.includes(m))
  const lifted = new Set(marks)
  return {
    ...c,
    shapes: c.shapes.map(s => (lifted.has(s.id) && s.z < base.z ? { ...s, z: base.z } : s)),
    objects: c.objects.map(o => {
      if (o.id !== home?.id || same.length === 0) return o
      const rest = o.shapes.filter(id => !same.includes(id)), at = rest.indexOf(base.id)
      const ordered = o.shapes.filter(id => same.includes(id))
      return { ...o, shapes: [...rest.slice(0, at + 1), ...ordered, ...rest.slice(at + 1)] }
    }),
  }
}

// Apply a pattern: the shapes `marks` are kept inside `baseId`. Refused for a twin base or mark (the twin follows), a shape that is already a mark of another pattern, and no marks.
export function addPattern(c: ModelContent, baseId: string, marks: string[], name = '', make: MakeId = randomId): Edit & { patternId?: string } {
  const base = shapeById(c, baseId)
  if (!base) return fail('There is no such shape.')
  if (base.mirrorOf) return fail(`${label(base.name, base.id)} is a twin: make the pattern on the original, and the twin follows.`)
  const asMark = patternOfMark(c, baseId)
  if (asMark) return fail(`${label(base.name, base.id)} is a mark of ${label(asMark.name, asMark.id)}: a mark cannot be the base of a pattern.`)
  const picked = [...new Set(marks)].filter(m => m !== baseId)
  if (picked.length === 0) return fail('Choose at least one shape to be a mark of the pattern.')
  for (const m of picked) { const why = markProblem(c, base, m); if (why) return fail(why) }
  if (picked.length > LIMITS.patternMarksMax) return fail(`A pattern may have at most ${LIMITS.patternMarksMax} marks.`)
  if (patternsOf(c).length >= LIMITS.patternsMax) return fail(`A model may have at most ${LIMITS.patternsMax} patterns.`)
  const id = freshFormId(patternsOf(c).map(p => p.id), 'pt', make)
  const pattern: ModelPattern = { id, name: clean(name, RANGE_NAME_MAX) || `Pattern ${patternsOf(c).length + 1}`, base: baseId, marks: picked }
  return { ...done(layerOver({ ...c, patterns: [...patternsOf(c), pattern] }, base, picked)), patternId: id }
}

const mapPattern = (c: ModelContent, id: string, change: (p: ModelPattern) => ModelPattern): ModelContent => ({ ...c, patterns: patternsOf(c).map(p => (p.id === id ? change(p) : p)) })

export const renamePattern = (c: ModelContent, id: string, name: string): ModelContent => mapPattern(c, id, p => ({ ...p, name }))

// A mark joins the pattern or leaves it. A pattern keeps at least one mark (delete the pattern to take them all out).
export function toggleMark(c: ModelContent, patternId: string, shapeId: string): Edit {
  const p = patternById(c, patternId), base = p && shapeById(c, p.base)
  if (!p || !base) return fail('There is no such pattern.')
  if (p.marks.includes(shapeId)) {
    if (p.marks.length === 1) return fail('A pattern needs a mark: delete the pattern instead.')
    return done(mapPattern(c, patternId, x => ({ ...x, marks: x.marks.filter(m => m !== shapeId) })))
  }
  const why = markProblem(c, base, shapeId, patternId)
  if (why) return fail(why)
  if (p.marks.length >= LIMITS.patternMarksMax) return fail(`A pattern may have at most ${LIMITS.patternMarksMax} marks.`)
  return done(layerOver(mapPattern(c, patternId, x => ({ ...x, marks: [...x.marks, shapeId] })), base, [shapeId]))
}

// The pattern goes (its marks are ordinary shapes again) and nothing switches it off any more.
export function removePattern(c: ModelContent, id: string): ModelContent {
  if (!patternById(c, id)) return c
  return withoutHidden({ ...c, patterns: patternsOf(c).filter(p => p.id !== id) }, new Set([id]))
}
