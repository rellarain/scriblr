import type { ModelBlend, ModelContent, ModelGradDir, ModelShape, ModelTint, ModelTintKind } from '../../../../../api/types'
import { TONE_RANGE, shapeById, tintAmount, updateShape } from '../modelContent'
import { paintOrigin } from './colour'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'

// The pure operations behind the Paint section of the Colour tab (phase 4b): tones, a derived tone, a gradient, a blend mode, a clip, cut-outs and helper shapes of
// one shape, and the kind and amount of a shading shape. A shape that follows another for its paint (a twin, a shape that follows a class's template) has no paint
// fields of its own to change: it is refused, with the way out, until it is given a colour slot of its own. Each returns new content (or why it cannot).

const label = (s: ModelShape) => s.name || s.id

// Why a shape's paint cannot be changed (null when it can): it takes its paint from another shape.
export function paintLocked(c: ModelContent, s: ModelShape): string | null {
  const origin = paintOrigin(c, s).shape
  if (origin.id === s.id) return null
  const twin = !!s.mirrorOf
  return `${label(s)} is painted like ${label(origin)}: change that ${twin ? 'original' : 'template shape'} instead, or give ${label(s)} a colour slot of its own first.`
}

function change(c: ModelContent, id: string, patch: (s: ModelShape) => Partial<ModelShape> | string): Edit {
  const s = shapeById(c, id)
  if (!s) return fail('There is no such shape.')
  const locked = paintLocked(c, s)
  if (locked) return fail(locked)
  const made = patch(s)
  if (typeof made === 'string') return fail(made)
  return done(updateShape(c, id, x => ({ ...x, ...made })))
}

// A step lighter (+) or darker (-) than the colour: -2 to 2, none is the colour itself.
export const setTone = (c: ModelContent, id: string, tone: number): Edit =>
  change(c, id, () => ({ tone: Math.round(Math.min(TONE_RANGE.max, Math.max(TONE_RANGE.min, tone))) }))

export const DEFAULT_AMOUNT = { shadow: 0.12, mid: 0.12, highlight: 0.1 } as const
const tint = (kind: ModelTintKind, t?: number): ModelTint => ({ kind, t: tintAmount(t ?? DEFAULT_AMOUNT[kind]) })

// The shape is a tone of its own colour (a brow is a shadow of the hair): a kind, or null for the colour as it is.
export const setDerive = (c: ModelContent, id: string, kind: ModelTintKind | null): Edit =>
  change(c, id, s => ({ derive: kind === null ? null : tint(kind, s.derive?.t) }))

// A shading shape's kind (the amount it had stays).
export const setShadeKind = (c: ModelContent, id: string, kind: ModelTintKind): Edit => {
  const s = shapeById(c, id)
  if (!s?.shade) return fail('That is not a shading shape.')
  return change(c, id, x => ({ shade: tint(kind, x.shade?.t) }))
}

// The amount of a derived tone or of a shading shape, one step: a hundredth (a tenth with `big`), held to 0.02..0.8.
export function stepTint(c: ModelContent, id: string, field: 'derive' | 'shade', dir: -1 | 1, big = false): Edit {
  const s = shapeById(c, id)
  if (!s?.[field]) return fail(field === 'shade' ? 'That is not a shading shape.' : 'That shape has no derived tone.')
  return change(c, id, x => ({ [field]: { ...x[field]!, t: tintAmount(x[field]!.t + dir * (big ? 0.1 : 0.01)) } }))
}

// A gradient to another slot's colour, or to a darker tone of its own (`to` null), in a direction; or none.
export function setGradient(c: ModelContent, id: string, grad: { dir: ModelGradDir; to: string | null } | null): Edit {
  if (grad?.to && !(c.slots ?? []).some(sl => sl.id === grad.to)) return fail('There is no such colour slot.')
  return change(c, id, s => (s.shade && grad ? 'A shading shape is one tone: it takes no gradient.' : { grad: grad ? { dir: grad.dir, to: grad.to } : null }))
}

export const setBlend = (c: ModelContent, id: string, blend: ModelBlend | null): Edit => change(c, id, () => ({ blend }))

// Keep the shape inside another shape (or free it).
export function setClip(c: ModelContent, id: string, target: string | null): Edit {
  if (target !== null && !shapeById(c, target)) return fail('There is no such shape.')
  if (target === id) return fail('A shape cannot be clipped to itself.')
  return change(c, id, () => ({ clip: target }))
}

// Let a shape cut a hole in this one, or stop it: at most LIMITS.cutsMax cut-outs.
export function toggleCut(c: ModelContent, id: string, target: string): Edit {
  if (!shapeById(c, target)) return fail('There is no such shape.')
  if (target === id) return fail('A shape cannot cut a hole in itself.')
  return change(c, id, s => {
    const cuts = s.cut ?? []
    if (cuts.includes(target)) return { cut: cuts.filter(t => t !== target) }
    if (cuts.length >= LIMITS.cutsMax) return `A shape may have at most ${LIMITS.cutsMax} cut-outs.`
    return { cut: [...cuts, target] }
  })
}

// A helper is never drawn in the previews: it only serves to clip or cut other shapes.
export const setHelper = (c: ModelContent, id: string, helper: boolean): Edit => change(c, id, () => ({ helper }))

// Whether anything clips to or is cut by this shape (for the Check panel: a helper that nothing uses).
export function isUsed(c: ModelContent, id: string): boolean {
  return c.shapes.some(s => s.clip === id || (s.cut ?? []).includes(id))
}
