import type { ModelContent, ModelFallSide, ModelObject, ModelPreset } from '../../../../../api/types'
import { KIND_MAX, NAME_MAX, randomId, type MakeId } from '../modelContent'
import { freshFormId } from './formEdit'
import { axesFor, chosenForm, choiceOf, classKey, classesOf, formKey, formsAway, membersOf, presetsOf, shownMember, templateOfMember, type Choices } from './forms'
import { LIMITS } from './limits'
import { done, fail, type Edit } from './rigEdit'
import { defaultValues, descendantsOf, valueOf, type Values } from './rig'

// Presets: a named set of slider values and of objects and groups switched off (a pose, an expression, an age, a build, an outfit). The admin's test state
// is `TestState` and is never saved; saving a preset copies what is away from rest into the model. A preset's kind is its slot: applying one puts back
// whatever any preset of the same kind controls, then sets its own, so a pose replaces the last pose and an expression leaves the arms alone.
//
// A style is a preset with a scope, an object or a group: it also keeps the forms chosen for what the scope holds (and which member of a family is shown), and
// only controls what the scope holds. Its slot is its kind within its scope, so a style of the head does not undo a style of the hands.

// `fall` is the side hanging things fall to (down when absent); `grip` is the grip point a hand pose holds with now (none when absent), marked on the canvas.
export interface TestState { values: Values; forms: Choices; hidden: string[]; fall?: ModelFallSide; grip?: string | null }

export const restState = (c: ModelContent): TestState => ({ values: defaultValues(c), forms: {}, hidden: [], fall: 'down' })
const sideOf = (s: Pick<TestState, 'fall'>): ModelFallSide => s.fall ?? 'down'

const SAME = 0.01
const clean = (s: string, max: number) => s.trim().slice(0, max)
const kindKey = (k: string) => k.trim().toLowerCase()
const things = (c: ModelContent): Set<string> => new Set([...c.objects.map(o => o.id), ...c.groups.map(g => g.id)])
const sameScope = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null)

// What is away from rest in the test state, for the toolbar's count: sliders off their rest value, forms that are not the default, things switched off.
export function awayCount(c: ModelContent, s: TestState): number {
  const known = things(c)
  return c.ranges.filter(r => valueOf(r, s.values) !== r.rest).length + formsAway(c, s.forms) + new Set(s.hidden.filter(h => known.has(h))).size + (sideOf(s) !== 'down' ? 1 : 0)
}

// The kinds in use, in the order they first appear (one spelling each).
export function kindsOf(c: ModelContent): string[] {
  const seen = new Map<string, string>()
  for (const p of presetsOf(c)) if (!seen.has(kindKey(p.kind))) seen.set(kindKey(p.kind), p.kind)
  return [...seen.values()]
}

// What a scope holds: its objects and groups (the object itself, or the group with the groups under it and their objects), and every id in it that a slider
// can be listed under (those and the shapes).
export interface Scope { things: Set<string>; objects: ModelObject[]; listed: Set<string> }
export function scopeOf(c: ModelContent, scopeId: string): Scope | null {
  const group = c.groups.find(g => g.id === scopeId), object = c.objects.find(o => o.id === scopeId)
  if (!group && !object) return null
  const groups = group ? new Set([group.id, ...descendantsOf(c, group.id)]) : new Set<string>()
  const objects = group ? c.objects.filter(o => c.groups.some(g => groups.has(g.id) && g.objects.includes(o.id))) : object ? [object] : []
  const things = new Set<string>([...groups, ...objects.map(o => o.id)])
  const listed = new Set<string>([...things, ...objects.flatMap(o => o.shapes)])
  return { things, objects, listed }
}

// Everything the presets of a kind (and scope) control: slider ids, thing ids and form-choice keys.
export function footprint(c: ModelContent, kind: string, scope: string | null = null): { values: Set<string>; hidden: Set<string>; forms: Set<string>; fall: boolean; grip: boolean } {
  const out = { values: new Set<string>(), hidden: new Set<string>(), forms: new Set<string>(), fall: false, grip: false }
  for (const p of presetsOf(c)) {
    if (kindKey(p.kind) !== kindKey(kind) || !sameScope(p.scope, scope)) continue
    for (const k of Object.keys(p.values)) out.values.add(k)
    for (const h of p.hidden) out.hidden.add(h)
    for (const k of Object.keys(p.forms ?? {})) out.forms.add(k)
    if (p.fall) out.fall = true
    if (p.grip) out.grip = true
  }
  return out
}

export function applyPreset(c: ModelContent, s: TestState, p: ModelPreset): TestState {
  const free = footprint(c, p.kind, p.scope)
  const values: Values = { ...s.values }
  for (const r of c.ranges) {
    if (free.values.has(r.id)) values[r.id] = r.rest
    if (p.values[r.id] !== undefined) values[r.id] = valueOf(r, { [r.id]: p.values[r.id] })
  }
  const known = things(c)
  const hidden = new Set(s.hidden.filter(h => !free.hidden.has(h)))
  for (const h of p.hidden) if (known.has(h)) hidden.add(h)
  const forms: Choices = { ...s.forms }
  for (const key of free.forms) delete forms[key]
  for (const [key, option] of Object.entries(p.forms ?? {})) forms[key] = option
  // the side things fall to: a preset that keeps one puts it back to down first, as it does the sliders it controls
  let fall = sideOf(s)
  if (free.fall) fall = 'down'
  if (p.fall) fall = p.fall
  // the grip a hand pose holds with: a pose of a kind that names grips lets go of the last one, then takes its own
  let grip = s.grip ?? null
  if (free.grip) grip = null
  if (p.grip) grip = p.grip
  return { values, forms, hidden: [...hidden], fall, ...(grip ? { grip } : {}) }
}

// Whether applying the preset would change nothing: it is on.
export function isOn(c: ModelContent, s: TestState, p: ModelPreset): boolean {
  const next = applyPreset(c, s, p)
  if (c.ranges.some(r => Math.abs(valueOf(r, next.values) - valueOf(r, s.values)) > SAME)) return false
  const keys = new Set([...Object.keys(p.forms ?? {}), ...footprint(c, p.kind, p.scope).forms])
  if ([...keys].some(k => choiceOf(c, k, next.forms) !== choiceOf(c, k, s.forms))) return false
  if (sideOf(next) !== sideOf(s)) return false
  if ((next.grip ?? null) !== (s.grip ?? null)) return false
  const a = new Set(s.hidden), b = new Set(next.hidden)
  return a.size === b.size && [...a].every(h => b.has(h))
}

// The sliders away from rest and the things switched off, as an unscoped preset holds them.
function captured(c: ModelContent, s: TestState): Pick<ModelPreset, 'values' | 'hidden' | 'fall' | 'grip'> {
  const values: Record<string, number> = {}
  for (const r of c.ranges) {
    const v = valueOf(r, s.values)
    if (Math.abs(v - r.rest) > SAME) values[r.id] = Math.round(v * 100) / 100
  }
  const known = things(c)
  const grip = s.grip && (c.grips ?? []).some(g => g.id === s.grip) ? s.grip : null
  return { values, hidden: [...new Set(s.hidden.filter(h => known.has(h)))], ...(sideOf(s) === 'down' ? {} : { fall: sideOf(s) }), ...(grip ? { grip } : {}) }
}

// The same for a style: only the sliders listed under the scope, the things inside it that are switched off, the forms (away from their default) of the objects
// in it, and the member of each family that has the scope's objects (template or members) in it.
function capturedStyle(c: ModelContent, s: TestState, scope: Scope): Pick<ModelPreset, 'values' | 'hidden' | 'forms' | 'fall'> {
  const values: Record<string, number> = {}
  for (const r of c.ranges) {
    const v = valueOf(r, s.values)
    if (r.scope && scope.listed.has(r.scope) && Math.abs(v - r.rest) > SAME) values[r.id] = Math.round(v * 100) / 100
  }
  const forms: Record<string, string> = {}
  for (const o of scope.objects) {
    const owner = templateOfMember(c, o) ?? o
    for (const axis of axesFor(c, o)) {
      const form = chosenForm(owner, axis, s.forms, o.id)
      if (form && form.id !== axis.initial) forms[formKey(o.id, axis.id)] = form.id
    }
  }
  for (const k of classesOf(c)) {
    const members = membersOf(c, k.id), first = members[0]
    const inside = scope.things.has(k.template) || members.some(m => scope.things.has(m.id))
    const shown = shownMember(c, k, s.forms)
    if (k.exclusive && inside && first && shown && shown.id !== first.id) forms[classKey(k.id)] = shown.id
  }
  // a style keeps the side when something in its scope hangs
  const hangs = scope.objects.some(o => o.shapes.some(sid => c.ranges.some(r => r.drives.some(d => d.kind === 'fall' && d.shape === sid))))
  return { values, hidden: [...new Set(s.hidden.filter(h => scope.things.has(h)))], forms, ...(hangs && sideOf(s) !== 'down' ? { fall: sideOf(s) } : {}) }
}

export function savePreset(c: ModelContent, s: TestState, name: string, kind: string, make: MakeId = randomId): Edit & { presetId?: string } {
  if (presetsOf(c).length >= LIMITS.presetsMax) return fail(`A model may have at most ${LIMITS.presetsMax} presets.`)
  const id = freshFormId(presetsOf(c).map(p => p.id), 'p', make)
  const preset: ModelPreset = { id, name: clean(name, NAME_MAX) || 'Preset', kind: clean(kind, KIND_MAX) || 'Pose', ...captured(c, s) }
  return { ...done({ ...c, presets: [...presetsOf(c), preset] }), presetId: id }
}

// Keep the current look of an object or a group as a style.
export function saveStyle(c: ModelContent, s: TestState, scopeId: string, name: string, kind = 'Style', make: MakeId = randomId): Edit & { presetId?: string } {
  const scope = scopeOf(c, scopeId)
  if (!scope) return fail('There is no such object or group.')
  if (presetsOf(c).length >= LIMITS.presetsMax) return fail(`A model may have at most ${LIMITS.presetsMax} presets.`)
  const id = freshFormId(presetsOf(c).map(p => p.id), 'p', make)
  const style: ModelPreset = { id, name: clean(name, NAME_MAX) || 'Style', kind: clean(kind, KIND_MAX) || 'Style', scope: scopeId, ...capturedStyle(c, s, scope) }
  return { ...done({ ...c, presets: [...presetsOf(c), style] }), presetId: id }
}

// The styles that belong to an object or a group.
export const stylesOf = (c: ModelContent, scopeId: string): ModelPreset[] => presetsOf(c).filter(p => p.scope === scopeId)

const mapPreset = (c: ModelContent, id: string, change: (p: ModelPreset) => ModelPreset): ModelContent => ({ ...c, presets: presetsOf(c).map(p => (p.id === id ? change(p) : p)) })

// Replace what a preset keeps with what the test state shows now (its name, kind and scope stay).
export const updatePreset = (c: ModelContent, id: string, s: TestState): ModelContent =>
  mapPreset(c, id, p => { const scope = p.scope ? scopeOf(c, p.scope) : null; return { ...p, fall: null, ...(scope ? capturedStyle(c, s, scope) : captured(c, s)) } })
export const renamePreset = (c: ModelContent, id: string, name: string): ModelContent => mapPreset(c, id, p => ({ ...p, name }))
export const setPresetKind = (c: ModelContent, id: string, kind: string): ModelContent => mapPreset(c, id, p => ({ ...p, kind: clean(kind, KIND_MAX) || p.kind }))
export const deletePreset = (c: ModelContent, id: string): ModelContent => ({ ...c, presets: presetsOf(c).filter(p => p.id !== id) })

// A test state with the forms of the first axis of an object chosen, used by the Forms tab's thumbnails.
export const withForm = (s: TestState, objectId: string, axisId: string, formId: string): TestState => ({ ...s, forms: { ...s.forms, [`${objectId}.${axisId}`]: formId } })

// Whether a form is the one chosen (for aria-pressed on a form card).
export function formIsChosen(c: ModelContent, s: TestState, objectId: string, axisId: string, formId: string): boolean {
  const o = c.objects.find(x => x.id === objectId), a = o ? axesFor(c, o).find(x => x.id === axisId) : undefined
  return !!o && !!a && chosenForm(templateOfMember(c, o) ?? o, a, s.forms, o.id)?.id === formId
}
