import type { ModelAxis, ModelContent, ModelForm, ModelLook, ModelObject, ModelPoint } from '../../../../../api/types'
import { NAME_MAX, TONE_RANGE, objectById, randomId, shapeById, type MakeId } from '../modelContent'
import { axesOf } from './forms'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'

// The pure operations the Forms tab makes: axes and forms of an object, and the outline a form gives a shape. Each returns new content (or why it cannot) and
// leaves the content it was given alone.

const copyPts = (list: ModelPoint[]): ModelPoint[] => list.map(p => ({ ...p, hi: p.hi ? [p.hi[0], p.hi[1]] : p.hi, ho: p.ho ? [p.ho[0], p.ho[1]] : p.ho }))
const clean = (name: string) => name.trim().slice(0, NAME_MAX)

const mapObject = (c: ModelContent, objectId: string, change: (o: ModelObject) => ModelObject): ModelContent => ({ ...c, objects: c.objects.map(o => (o.id === objectId ? change(o) : o)) })
const mapAxis = (c: ModelContent, objectId: string, axisId: string, change: (a: ModelAxis) => ModelAxis): ModelContent =>
  mapObject(c, objectId, o => ({ ...o, axes: axesOf(o).map(a => (a.id === axisId ? change(a) : a)) }))
const mapForm = (c: ModelContent, objectId: string, axisId: string, formId: string, change: (f: ModelForm) => ModelForm): ModelContent =>
  mapAxis(c, objectId, axisId, a => ({ ...a, options: a.options.map(f => (f.id === formId ? change(f) : f)) }))

// A fresh id for an axis or a form: unique among the object's axes (or the axis's forms), so a "objectId.axisId" key and a form id never clash.
export function freshFormId(taken: string[], prefix: string, make: MakeId = randomId): string {
  for (let i = 0; i < 20; i++) { const id = make(prefix); if (!taken.includes(id)) return id }
  return `${prefix}_${taken.length}_${Date.now().toString(36)}`
}

// ---- axes ----

// A new axis with one form, the base outline ("Standard"), which it shows by default.
export function addAxis(c: ModelContent, objectId: string, name = 'Axis', make: MakeId = randomId): Edit & { axisId?: string; formId?: string } {
  const o = objectById(c, objectId)
  if (!o) return fail('There is no such object.')
  if (axesOf(o).length >= LIMITS.axesMax) return fail(`An object may have at most ${LIMITS.axesMax} axes of forms.`)
  const axisId = freshFormId(axesOf(o).map(a => a.id), 'a', make), formId = freshFormId([], 'f', make)
  const axis: ModelAxis = { id: axisId, name: clean(name) || 'Axis', initial: formId, roll: 100, options: [{ id: formId, name: 'Standard', ovr: [] }] }
  return { ...done(mapObject(c, objectId, x => ({ ...x, axes: [...axesOf(x), axis] }))), axisId, formId }
}

export function removeAxis(c: ModelContent, objectId: string, axisId: string): ModelContent {
  return mapObject(c, objectId, o => ({ ...o, axes: axesOf(o).filter(a => a.id !== axisId) }))
}

// How often Randomise changes the axis, in percent (0 never, 100 every time).
export const setAxisRoll = (c: ModelContent, objectId: string, axisId: string, roll: number): ModelContent => mapAxis(c, objectId, axisId, a => ({ ...a, roll: Math.max(0, Math.min(100, Math.round(roll))) }))
// Rolls the axis in a genre or stops rolling it there (no genre ticked: every genre).
export const toggleAxisGenre = (c: ModelContent, objectId: string, axisId: string, genreId: string): ModelContent =>
  mapAxis(c, objectId, axisId, a => ({ ...a, genres: (a.genres ?? []).includes(genreId) ? (a.genres ?? []).filter(g => g !== genreId) : [...(a.genres ?? []), genreId] }))
export const renameAxis = (c: ModelContent, objectId: string, axisId: string, name: string): ModelContent => mapAxis(c, objectId, axisId, a => ({ ...a, name }))

export function moveAxis(c: ModelContent, objectId: string, axisId: string, dir: -1 | 1): ModelContent {
  return mapObject(c, objectId, o => {
    const list = [...axesOf(o)], at = list.findIndex(a => a.id === axisId), to = at + dir
    if (at < 0 || to < 0 || to >= list.length) return o
    ;[list[at], list[to]] = [list[to], list[at]]
    return { ...o, axes: list }
  })
}

// ---- forms ----

// A new form of an axis. `outlines` are the outlines the object's shapes are drawn with now (a map from shape id): the new form starts as a copy of them, so
// "Add a form from the current one" begins with what is on the canvas. Only shapes of the object that have an outline of their own (not twins) are copied.
export function addForm(c: ModelContent, objectId: string, axisId: string, outlines: Record<string, ModelPoint[]>, name = 'Form', make: MakeId = randomId): Edit & { formId?: string } {
  const o = objectById(c, objectId), axis = o && axesOf(o).find(a => a.id === axisId)
  if (!o || !axis) return fail('There is no such axis.')
  if (axis.options.length >= LIMITS.formsMax) return fail(`An axis may have at most ${LIMITS.formsMax} forms.`)
  const ovr = o.shapes.flatMap(id => {
    const s = shapeById(c, id), pts = outlines[id]
    return s && !s.mirrorOf && pts && pts.length >= 3 ? [{ shape: id, pts: copyPts(pts) }] : []
  })
  const formId = freshFormId(axis.options.map(f => f.id), 'f', make)
  return { ...done(mapAxis(c, objectId, axisId, a => ({ ...a, options: [...a.options, { id: formId, name: clean(name) || 'Form', ovr }] }))), formId }
}

// Delete a form. An axis keeps at least one; deleting the form it shows by default makes the first of the rest the default.
export function removeForm(c: ModelContent, objectId: string, axisId: string, formId: string): Edit {
  const o = objectById(c, objectId), axis = o && axesOf(o).find(a => a.id === axisId)
  if (!axis) return fail('There is no such axis.')
  if (axis.options.length <= 1) return fail('An axis needs at least one form. Delete the axis instead.')
  return done(mapAxis(c, objectId, axisId, a => {
    const options = a.options.filter(f => f.id !== formId)
    return { ...a, options, initial: options.some(f => f.id === a.initial) ? a.initial : options[0].id }
  }))
}

export const renameForm = (c: ModelContent, objectId: string, axisId: string, formId: string, name: string): ModelContent => mapForm(c, objectId, axisId, formId, f => ({ ...f, name }))

export function setInitialForm(c: ModelContent, objectId: string, axisId: string, formId: string): ModelContent {
  return mapAxis(c, objectId, axisId, a => (a.options.some(f => f.id === formId) ? { ...a, initial: formId } : a))
}

export function moveForm(c: ModelContent, objectId: string, axisId: string, formId: string, dir: -1 | 1): ModelContent {
  return mapAxis(c, objectId, axisId, a => {
    const list = [...a.options], at = list.findIndex(f => f.id === formId), to = at + dir
    if (at < 0 || to < 0 || to >= list.length) return a
    ;[list[at], list[to]] = [list[to], list[at]]
    return { ...a, options: list }
  })
}

// ---- the outline a form gives a shape ----

// Give a shape of the object an outline in a form (at least three points), hide it in the form (an empty list), or let it keep the base outline (null).
export function setOverride(c: ModelContent, objectId: string, axisId: string, formId: string, shapeId: string, pts: ModelPoint[] | null): Edit {
  const o = objectById(c, objectId), axis = o && axesOf(o).find(a => a.id === axisId)
  if (!o || !axis || !axis.options.some(f => f.id === formId)) return fail('There is no such form.')
  const shape = shapeById(c, shapeId)
  if (!shape || !o.shapes.includes(shapeId)) return fail('That shape is not in the object.')
  if (shape.mirrorOf) return fail('A twin follows its original: change the original, or break the pair.')
  if (pts !== null && pts.length > 0 && pts.length < 3) return fail('An outline needs at least 3 points.')
  if (pts !== null && pts.length > LIMITS.pointsMax) return fail(`A shape may have at most ${LIMITS.pointsMax} points.`)
  return done(mapForm(c, objectId, axisId, formId, f => ({
    ...f,
    ovr: pts === null ? f.ovr.filter(v => v.shape !== shapeId) : f.ovr.some(v => v.shape === shapeId) ? f.ovr.map(v => (v.shape === shapeId ? { ...v, pts: copyPts(pts) } : v)) : [...f.ovr, { shape: shapeId, pts: copyPts(pts) }],
  })))
}

export const hideInForm = (c: ModelContent, objectId: string, axisId: string, formId: string, shapeId: string): Edit => setOverride(c, objectId, axisId, formId, shapeId, [])
export const useBaseOutline = (c: ModelContent, objectId: string, axisId: string, formId: string, shapeId: string): Edit => setOverride(c, objectId, axisId, formId, shapeId, null)

// ---- the paint a form gives a shape ----

// What a form does to the paint of a shape of the object: the colour slot it is painted from, or a fixed gray (no slot), a tone, and the radius its sharp corners are rounded to
// (phase D4). A null leaves the shape's own value; all of them null takes the look away. A change that does not say `round` keeps the radius the look had.
export type LookChange = Pick<ModelLook, 'slot' | 'gray' | 'tone'> & { round?: number | null }
export function setLook(c: ModelContent, objectId: string, axisId: string, formId: string, shapeId: string, look: LookChange | null): Edit {
  const o = objectById(c, objectId), axis = o && axesOf(o).find(a => a.id === axisId), form = axis?.options.find(f => f.id === formId)
  if (!o || !axis || !form) return fail('There is no such form.')
  const shape = shapeById(c, shapeId)
  if (!shape || !o.shapes.includes(shapeId)) return fail('That shape is not in the object.')
  if (shape.mirrorOf) return fail('A twin is painted like its original: change the original.')
  if (look?.slot && !(c.slots ?? []).some(sl => sl.id === look.slot)) return fail('There is no such colour slot.')
  const slot = look?.slot ?? null
  const gray = slot === null && look?.gray != null ? Math.round(Math.min(100, Math.max(0, look.gray))) : null
  const tone = look?.tone == null ? null : Math.round(Math.min(TONE_RANGE.max, Math.max(TONE_RANGE.min, look.tone)))
  const others = (form.looks ?? []).filter(l => l.shape !== shapeId)
  const prior = (form.looks ?? []).find(l => l.shape === shapeId)
  const round = look === null ? null : look.round === undefined ? prior?.round ?? null : look.round === null ? null : Math.round(Math.min(LIMITS.roundMax, Math.max(0, look.round)))
  const empty = slot === null && gray === null && tone === null && round === null
  if (!empty && !(form.looks ?? []).some(l => l.shape === shapeId) && others.length >= LIMITS.looksMax) return fail(`A form may change the paint of at most ${LIMITS.looksMax} shapes.`)
  return done(mapForm(c, objectId, axisId, formId, f => ({ ...f, looks: empty ? others : [...(f.looks ?? []).filter(l => l.shape !== shapeId), { shape: shapeId, slot, gray, tone, round }] })))
}

// The look a form gives a shape, or undefined.
export const lookState = (f: ModelForm, shapeId: string): ModelLook | undefined => (f.looks ?? []).find(l => l.shape === shapeId)

// What a form does to one shape, for the Forms tab's list of shapes.
export function overrideState(f: ModelForm, shapeId: string): 'base' | 'own' | 'hidden' {
  const ov = f.ovr.find(v => v.shape === shapeId)
  return !ov ? 'base' : ov.pts.length === 0 ? 'hidden' : 'own'
}
