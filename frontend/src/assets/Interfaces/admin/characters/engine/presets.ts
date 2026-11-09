import type { ModelContent, ModelPreset } from '../../../../../api/types'
import { KIND_MAX, NAME_MAX, randomId, type MakeId } from '../modelContent'
import { freshFormId } from './formEdit'
import { chosenForm, formsAway, presetsOf, type Choices } from './forms'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'
import { defaultValues, valueOf, type Values } from './rig'

// Presets: a named set of slider values and of objects and groups switched off (a pose, an expression, an age, a build, an outfit). The admin's test state
// is `TestState` and is never saved; saving a preset copies what is away from rest into the model. A preset's kind is its slot: applying one puts back
// whatever any preset of the same kind controls, then sets its own, so a pose replaces the last pose and an expression leaves the arms alone.

export interface TestState { values: Values; forms: Choices; hidden: string[] }

export const restState = (c: ModelContent): TestState => ({ values: defaultValues(c), forms: {}, hidden: [] })

const SAME = 0.01
const clean = (s: string, max: number) => s.trim().slice(0, max)
const kindKey = (k: string) => k.trim().toLowerCase()
const things = (c: ModelContent): Set<string> => new Set([...c.objects.map(o => o.id), ...c.groups.map(g => g.id)])

// What is away from rest in the test state, for the toolbar's count: sliders off their rest value, forms that are not the default, things switched off.
export function awayCount(c: ModelContent, s: TestState): number {
  const known = things(c)
  return c.ranges.filter(r => valueOf(r, s.values) !== r.rest).length + formsAway(c, s.forms) + new Set(s.hidden.filter(h => known.has(h))).size
}

// The kinds in use, in the order they first appear (one spelling each).
export function kindsOf(c: ModelContent): string[] {
  const seen = new Map<string, string>()
  for (const p of presetsOf(c)) if (!seen.has(kindKey(p.kind))) seen.set(kindKey(p.kind), p.kind)
  return [...seen.values()]
}

// Everything the presets of a kind control: slider ids and thing ids.
export function footprint(c: ModelContent, kind: string): { values: Set<string>; hidden: Set<string> } {
  const out = { values: new Set<string>(), hidden: new Set<string>() }
  for (const p of presetsOf(c)) {
    if (kindKey(p.kind) !== kindKey(kind)) continue
    for (const k of Object.keys(p.values)) out.values.add(k)
    for (const h of p.hidden) out.hidden.add(h)
  }
  return out
}

export function applyPreset(c: ModelContent, s: TestState, p: ModelPreset): TestState {
  const free = footprint(c, p.kind)
  const values: Values = { ...s.values }
  for (const r of c.ranges) {
    if (free.values.has(r.id)) values[r.id] = r.rest
    if (p.values[r.id] !== undefined) values[r.id] = valueOf(r, { [r.id]: p.values[r.id] })
  }
  const known = things(c)
  const hidden = new Set(s.hidden.filter(h => !free.hidden.has(h)))
  for (const h of p.hidden) if (known.has(h)) hidden.add(h)
  return { values, forms: s.forms, hidden: [...hidden] }
}

// Whether applying the preset would change nothing: it is on.
export function isOn(c: ModelContent, s: TestState, p: ModelPreset): boolean {
  const next = applyPreset(c, s, p)
  if (c.ranges.some(r => Math.abs(valueOf(r, next.values) - valueOf(r, s.values)) > SAME)) return false
  const a = new Set(s.hidden), b = new Set(next.hidden)
  return a.size === b.size && [...a].every(h => b.has(h))
}

// The sliders away from rest and the things switched off, as a preset holds them.
function captured(c: ModelContent, s: TestState): Pick<ModelPreset, 'values' | 'hidden'> {
  const values: Record<string, number> = {}
  for (const r of c.ranges) {
    const v = valueOf(r, s.values)
    if (Math.abs(v - r.rest) > SAME) values[r.id] = Math.round(v * 100) / 100
  }
  const known = things(c)
  return { values, hidden: [...new Set(s.hidden.filter(h => known.has(h)))] }
}

export function savePreset(c: ModelContent, s: TestState, name: string, kind: string, make: MakeId = randomId): Edit & { presetId?: string } {
  if (presetsOf(c).length >= LIMITS.presetsMax) return fail(`A model may have at most ${LIMITS.presetsMax} presets.`)
  const id = freshFormId(presetsOf(c).map(p => p.id), 'p', make)
  const preset: ModelPreset = { id, name: clean(name, NAME_MAX) || 'Preset', kind: clean(kind, KIND_MAX) || 'Pose', ...captured(c, s) }
  return { ...done({ ...c, presets: [...presetsOf(c), preset] }), presetId: id }
}

const mapPreset = (c: ModelContent, id: string, change: (p: ModelPreset) => ModelPreset): ModelContent => ({ ...c, presets: presetsOf(c).map(p => (p.id === id ? change(p) : p)) })

// Replace a preset's values and hidden things with what the test state shows now (its name and kind stay).
export const updatePreset = (c: ModelContent, id: string, s: TestState): ModelContent => mapPreset(c, id, p => ({ ...p, ...captured(c, s) }))
export const renamePreset = (c: ModelContent, id: string, name: string): ModelContent => mapPreset(c, id, p => ({ ...p, name }))
export const setPresetKind = (c: ModelContent, id: string, kind: string): ModelContent => mapPreset(c, id, p => ({ ...p, kind: clean(kind, KIND_MAX) || p.kind }))
export const deletePreset = (c: ModelContent, id: string): ModelContent => ({ ...c, presets: presetsOf(c).filter(p => p.id !== id) })

// A test state with the forms of the first axis of an object chosen, used by the Forms tab's thumbnails.
export const withForm = (s: TestState, objectId: string, axisId: string, formId: string): TestState => ({ ...s, forms: { ...s.forms, [`${objectId}.${axisId}`]: formId } })

// Whether a form is the one chosen (for aria-pressed on a form card).
export function formIsChosen(c: ModelContent, s: TestState, objectId: string, axisId: string, formId: string): boolean {
  const o = c.objects.find(x => x.id === objectId), a = o?.axes?.find(x => x.id === axisId)
  return !!o && !!a && chosenForm(o, a, s.forms)?.id === formId
}
