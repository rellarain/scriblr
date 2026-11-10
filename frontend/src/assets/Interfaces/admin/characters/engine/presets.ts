import type { ModelContent, ModelFallSide, ModelObject, ModelPreset } from '../../../../../api/types'
import { KIND_MAX, NAME_MAX, randomId, type MakeId } from '../modelContent'
import { colourById, slotById, type SlotChoices } from './colour'
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
// only controls what the scope holds. Its slot is its kind within its scope, so a style of the head does not undo a style of the hands. A style of an object may
// also put the object's shapes in a drawing order of its own and hide some of them.
//
// A variant (a preset with no scope) is a bundle of choices over the same shapes: besides sliders and hidden things it keeps the form (expression) of each object axis,
// turns on a style of each object it lists and picks a default colour of each slot it lists. Applying one first puts back whatever any variant of its kind controls.

// `fall` is the side hanging things fall to (down when absent); `grip` is the grip point a hand pose holds with now (none when absent), marked on the canvas.
// `colours` are the colours chosen for the slots (a variant picks default colours); `order` the shapes of an object in the order a style draws them (back to front);
// `on` the styles that were applied and set nothing of the test state (one that only holds parts of a colour), which are on until another of their kind is applied.
export interface TestState { values: Values; forms: Choices; hidden: string[]; fall?: ModelFallSide; grip?: string | null; colours?: SlotChoices; order?: Record<string, string[]>; on?: string[] }

export const restState = (c: ModelContent): TestState => ({ values: defaultValues(c), forms: {}, hidden: [], fall: 'down' })
const sideOf = (s: Pick<TestState, 'fall'>): ModelFallSide => s.fall ?? 'down'

const SAME = 0.01
const clean = (s: string, max: number) => s.trim().slice(0, max)
const kindKey = (k: string) => k.trim().toLowerCase()
// What may be switched off: objects and groups, and (for a style of their object) shapes.
const things = (c: ModelContent): Set<string> => new Set([...c.objects.map(o => o.id), ...c.groups.map(g => g.id), ...c.shapes.map(x => x.id)])
const sameScope = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null)

// What is away from rest in the test state, for the toolbar's count: sliders off their rest value, forms that are not the default, things switched off.
export function awayCount(c: ModelContent, s: TestState): number {
  const known = things(c)
  const ordered = Object.entries(s.order ?? {}).filter(([o, ids]) => ids.length > 0 && c.objects.some(x => x.id === o)).length
  return c.ranges.filter(r => valueOf(r, s.values) !== r.rest).length + formsAway(c, s.forms) + new Set(s.hidden.filter(h => known.has(h))).size + (sideOf(s) !== 'down' ? 1 : 0) + ordered + (s.on ?? []).filter(id => presetsOf(c).some(p => p.id === id)).length
}

// The kinds in use, in the order they first appear (one spelling each).
export function kindsOf(c: ModelContent): string[] {
  const seen = new Map<string, string>()
  for (const p of presetsOf(c)) if (!seen.has(kindKey(p.kind))) seen.set(kindKey(p.kind), p.kind)
  return [...seen.values()]
}

// What a scope holds: its objects and groups (the object itself, or the group with the groups under it and their objects), and every id in it that a slider
// can be listed under (those and the shapes).
export interface Scope { things: Set<string>; objects: ModelObject[]; listed: Set<string>; object: ModelObject | null; shapes: Set<string> }
export function scopeOf(c: ModelContent, scopeId: string): Scope | null {
  const group = c.groups.find(g => g.id === scopeId), object = c.objects.find(o => o.id === scopeId)
  if (!group && !object) return null
  const groups = group ? new Set([group.id, ...descendantsOf(c, group.id)]) : new Set<string>()
  const objects = group ? c.objects.filter(o => c.groups.some(g => groups.has(g.id) && g.objects.includes(o.id))) : object ? [object] : []
  const things = new Set<string>([...groups, ...objects.map(o => o.id)])
  const listed = new Set<string>([...things, ...objects.flatMap(o => o.shapes)])
  return { things, objects, listed, object: object ?? null, shapes: new Set(object ? object.shapes : []) }
}

// Everything the presets of a kind (and scope) control: slider ids, thing ids and form-choice keys.
export interface Footprint { values: Set<string>; hidden: Set<string>; forms: Set<string>; fall: boolean; grip: boolean; picks: Set<string>; styles: Set<string>; order: boolean }
export function footprint(c: ModelContent, kind: string, scope: string | null = null): Footprint {
  const out: Footprint = { values: new Set<string>(), hidden: new Set<string>(), forms: new Set<string>(), fall: false, grip: false, picks: new Set<string>(), styles: new Set<string>(), order: false }
  for (const p of presetsOf(c)) {
    if (kindKey(p.kind) !== kindKey(kind) || !sameScope(p.scope, scope)) continue
    for (const k of Object.keys(p.values)) out.values.add(k)
    for (const h of p.hidden) out.hidden.add(h)
    for (const k of Object.keys(p.forms ?? {})) out.forms.add(k)
    if (p.fall) out.fall = true
    if (p.grip) out.grip = true
    for (const k of Object.keys(p.picks ?? {})) out.picks.add(k)
    for (const k of Object.keys(p.styles ?? {})) out.styles.add(k)
    if ((p.order ?? []).length > 0) out.order = true
  }
  return out
}

export const applyPreset = (c: ModelContent, start: TestState, p: ModelPreset): TestState => applyWith(c, start, p, true)

// `mark` says whether a style that sets nothing is marked on (applying one is; turning one off is not).
function applyWith(c: ModelContent, start: TestState, p: ModelPreset, mark: boolean): TestState {
  const free = footprint(c, p.kind, p.scope)
  // the styles a variant turns on: for each object variants of this kind list, every style of the object goes off first (so what the variant sets itself is not undone)
  let s = start
  if (!p.scope) for (const objectId of free.styles) for (const st of stylesOf(c, objectId)) s = clearedBy(c, s, st)
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
  // the default colours variants of this kind pick: put back to no colour (gray), then the preset's own; one already chosen keeps its brightness and opacity
  const colours: SlotChoices = { ...(s.colours ?? {}) }
  for (const slotId of free.picks) delete colours[slotId]
  for (const [slotId, colourId] of Object.entries(p.picks ?? {})) {
    const slot = slotById(c, slotId)
    if (!slot || !colourById(slot, colourId)) continue
    const had = s.colours?.[slotId]
    colours[slotId] = had && had.src === 'colour' && had.id === colourId ? had : { src: 'colour', id: colourId }
  }
  // the drawing order of the shapes of an object that styles of this kind (in this scope) set: back to the tree's, then the preset's own
  const order: Record<string, string[]> = { ...(s.order ?? {}) }
  const object = p.scope ? c.objects.find(o => o.id === p.scope) : undefined
  if (object && free.order) delete order[object.id]
  if (object && (p.order ?? []).length > 0) order[object.id] = p.order!.filter(id => object.shapes.includes(id))
  // the styles marked on: those of this kind in this scope are off now, and this one is on if it sets nothing itself
  const slot = new Set(sameSlot(c, p).map(x => x.id))
  const on = (s.on ?? []).filter(id => !slot.has(id))
  if (mark && markable(p)) on.push(p.id)
  let next: TestState = { values, forms, hidden: [...hidden], fall, ...(grip ? { grip } : {}), ...(Object.keys(colours).length > 0 ? { colours } : {}), ...(Object.keys(order).length > 0 ? { order } : {}), ...(on.length > 0 ? { on } : {}) }
  // then the style chosen for each object goes on, over what the variant set (a style bundles no styles)
  if (!p.scope) {
    for (const [objectId, styleId] of Object.entries(p.styles ?? {})) {
      const st = presetsOf(c).find(x => x.id === styleId)
      if (st && st.scope === objectId) next = applyWith(c, next, st, true)
    }
  }
  return next
}

// Whether applying the preset would change nothing: it is on.
export function isOn(c: ModelContent, s: TestState, p: ModelPreset): boolean {
  // a style that sets nothing of the look but holds parts of a colour is on when it was applied (and nothing of its kind since); another of its kind that was applied puts
  // every other off
  if (markable(p)) return (s.on ?? []).includes(p.id)
  if (p.scope && sameSlot(c, p).some(x => x.id !== p.id && (s.on ?? []).includes(x.id))) return false
  const next = applyPreset(c, s, p)
  if (c.ranges.some(r => Math.abs(valueOf(r, next.values) - valueOf(r, s.values)) > SAME)) return false
  const keys = new Set([...Object.keys(p.forms ?? {}), ...footprint(c, p.kind, p.scope).forms])
  if ([...keys].some(k => choiceOf(c, k, next.forms) !== choiceOf(c, k, s.forms))) return false
  if (sideOf(next) !== sideOf(s)) return false
  if ((next.grip ?? null) !== (s.grip ?? null)) return false
  const slotIds = new Set([...Object.keys(next.colours ?? {}), ...Object.keys(s.colours ?? {})])
  if ([...slotIds].some(k => next.colours?.[k]?.src !== s.colours?.[k]?.src || next.colours?.[k]?.id !== s.colours?.[k]?.id)) return false
  // a style a variant turns on that was only marked on when applied is on too; a state that keeps no marks (a writer's figure) cannot tell, and leaves it out
  if (s.on !== undefined) {
    for (const [objectId, styleId] of Object.entries(p.styles ?? {})) {
      const st = presetsOf(c).find(x => x.id === styleId)
      if (st && st.scope === objectId && markable(st) && !s.on.includes(st.id)) return false
    }
  }
  const objectIds = new Set([...Object.keys(next.order ?? {}), ...Object.keys(s.order ?? {})])
  if ([...objectIds].some(k => (next.order?.[k] ?? []).join(',') !== (s.order?.[k] ?? []).join(','))) return false
  const a = new Set(s.hidden), b = new Set(next.hidden)
  return a.size === b.size && [...a].every(h => b.has(h))
}

// What a variant may keep besides sliders and hidden things: the form of each object axis (expressions), the style on for each object and the default colour of each slot.
export interface PresetKeep { forms?: boolean; styles?: boolean; colours?: boolean }

// The forms (away from their default) chosen for the objects given, and the member of each family that has one of them in it.
function capturedForms(c: ModelContent, s: TestState, objects: ModelObject[], inside: (id: string) => boolean): Record<string, string> {
  const forms: Record<string, string> = {}
  for (const o of objects) {
    const owner = templateOfMember(c, o) ?? o
    for (const axis of axesFor(c, o)) {
      const form = chosenForm(owner, axis, s.forms, o.id)
      if (form && form.id !== axis.initial) forms[formKey(o.id, axis.id)] = form.id
    }
  }
  for (const k of classesOf(c)) {
    const members = membersOf(c, k.id), first = members[0]
    const shown = shownMember(c, k, s.forms)
    if (k.exclusive && (inside(k.template) || members.some(m => inside(m.id))) && first && shown && shown.id !== first.id) forms[classKey(k.id)] = shown.id
  }
  return forms
}

// Whether a preset sets anything of the test state.
const setsSomething = (p: ModelPreset): boolean => Object.keys(p.values).length > 0 || p.hidden.length > 0 || Object.keys(p.forms ?? {}).length > 0 || (p.order ?? []).length > 0 || !!p.fall
// A style that sets nothing of the look but holds parts of a colour has nothing else to be recognised by, so it is marked on when it is applied (see TestState.on). One that
// holds nothing either is on whenever the rest of its kind is off, as it always was.
const markable = (p: ModelPreset): boolean => !!p.scope && !setsSomething(p) && Object.values(p.hsl ?? {}).some(l => l.h !== null || l.s !== null || l.l !== null)
const sameSlot = (c: ModelContent, p: ModelPreset): ModelPreset[] => presetsOf(c).filter(x => x.scope && x.scope === p.scope && kindKey(x.kind) === kindKey(p.kind))

// The style that is on for each object (the first of its styles that is on), and the default colour chosen for each slot.
function capturedStyles(c: ModelContent, s: TestState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const o of c.objects) {
    if (o.mirrorOf) continue
    const on = stylesOf(c, o.id).find(st => (setsSomething(st) || markable(st)) && isOn(c, s, st))
    if (on) out[o.id] = on.id
  }
  return out
}
function capturedPicks(c: ModelContent, s: TestState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [slotId, choice] of Object.entries(s.colours ?? {})) {
    const slot = slotById(c, slotId)
    if (slot && choice.src === 'colour' && colourById(slot, choice.id)) out[slotId] = choice.id
  }
  return out
}

// The sliders away from rest and the things switched off, as an unscoped preset holds them, and (when asked) the other parts of a variant.
function captured(c: ModelContent, s: TestState, keep: PresetKeep = {}): Pick<ModelPreset, 'values' | 'hidden' | 'fall' | 'grip'> & Partial<Pick<ModelPreset, 'forms' | 'styles' | 'picks'>> {
  const values: Record<string, number> = {}
  for (const r of c.ranges) {
    const v = valueOf(r, s.values)
    if (Math.abs(v - r.rest) > SAME) values[r.id] = Math.round(v * 100) / 100
  }
  const known = things(c)
  const grip = s.grip && (c.grips ?? []).some(g => g.id === s.grip) ? s.grip : null
  return {
    values, hidden: [...new Set(s.hidden.filter(h => known.has(h) && !c.shapes.some(x => x.id === h)))], ...(sideOf(s) === 'down' ? {} : { fall: sideOf(s) }), ...(grip ? { grip } : {}),
    ...(keep.forms ? { forms: capturedForms(c, s, c.objects, () => true) } : {}), ...(keep.styles ? { styles: capturedStyles(c, s) } : {}), ...(keep.colours ? { picks: capturedPicks(c, s) } : {}),
  }
}

// The same for a style: only the sliders listed under the scope, the things inside it that are switched off (and, for a style of an object, its shapes), the forms (away
// from their default) of the objects in it, the member of each family that has the scope's objects (template or members) in it, and the order an object's shapes are drawn in.
export function capturedStyle(c: ModelContent, s: TestState, scope: Scope): Pick<ModelPreset, 'values' | 'hidden' | 'forms' | 'fall' | 'order'> {
  const values: Record<string, number> = {}
  for (const r of c.ranges) {
    const v = valueOf(r, s.values)
    if (r.scope && scope.listed.has(r.scope) && Math.abs(v - r.rest) > SAME) values[r.id] = Math.round(v * 100) / 100
  }
  const forms = capturedForms(c, s, scope.objects, id => scope.things.has(id))
  // a style keeps the side when something in its scope hangs
  const hangs = scope.objects.some(o => o.shapes.some(sid => c.ranges.some(r => r.drives.some(d => d.kind === 'fall' && d.shape === sid))))
  const order = scope.object ? (s.order?.[scope.object.id] ?? []).filter(id => scope.shapes.has(id)) : []
  return {
    values, hidden: [...new Set(s.hidden.filter(h => scope.things.has(h) || scope.shapes.has(h)))], forms, ...(hangs && sideOf(s) !== 'down' ? { fall: sideOf(s) } : {}),
    ...(order.length > 0 ? { order } : {}),
  }
}

export function savePreset(c: ModelContent, s: TestState, name: string, kind: string, make: MakeId = randomId, keep: PresetKeep = {}): Edit & { presetId?: string } {
  if (presetsOf(c).length >= LIMITS.presetsMax) return fail(`A model may have at most ${LIMITS.presetsMax} presets.`)
  const id = freshFormId(presetsOf(c).map(p => p.id), 'p', make)
  const preset: ModelPreset = { id, name: clean(name, NAME_MAX) || 'Preset', kind: clean(kind, KIND_MAX) || 'Pose', ...captured(c, s, keep) }
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

// A preset turned off: everything the presets of its kind (and scope) control goes back to rest, shown and its default form, and nothing is set in its place.
export const clearedBy = (c: ModelContent, s: TestState, p: ModelPreset): TestState => applyWith(c, s, { ...p, values: {}, hidden: [], forms: {}, fall: null, grip: null, picks: {}, styles: {}, order: [] }, false)

// The same preset again, named like it with (copy), in the same kind and scope.
export function duplicatePreset(c: ModelContent, id: string, make: MakeId = randomId): Edit & { presetId?: string } {
  const p = presetsOf(c).find(x => x.id === id)
  if (!p) return fail('There is no such preset.')
  if (presetsOf(c).length >= LIMITS.presetsMax) return fail(`A model may have at most ${LIMITS.presetsMax} presets.`)
  const copyId = freshFormId(presetsOf(c).map(x => x.id), 'p', make)
  const at = presetsOf(c).findIndex(x => x.id === id)
  const copy: ModelPreset = { ...p, id: copyId, name: clean(`${p.name.trim() || 'Preset'} (copy)`, NAME_MAX), values: { ...p.values }, hidden: [...p.hidden], ...(p.forms ? { forms: { ...p.forms } } : {}), ...(p.styles ? { styles: { ...p.styles } } : {}), ...(p.picks ? { picks: { ...p.picks } } : {}), ...(p.hsl ? { hsl: { ...p.hsl } } : {}), ...(p.order ? { order: [...p.order] } : {}) }
  const presets = [...presetsOf(c)]
  presets.splice(at + 1, 0, copy)
  return { ...done({ ...c, presets }), presetId: copyId }
}

// The styles that belong to an object or a group.
export const stylesOf = (c: ModelContent, scopeId: string): ModelPreset[] => presetsOf(c).filter(p => p.scope === scopeId)

const mapPreset = (c: ModelContent, id: string, change: (p: ModelPreset) => ModelPreset): ModelContent => ({ ...c, presets: presetsOf(c).map(p => (p.id === id ? change(p) : p)) })

// Replace what a preset keeps with what the test state shows now (its name, kind and scope stay).
// A variant keeps the parts it already had (expressions, styles, colours), and any more that are asked for; a style keeps its colour locks.
export const updatePreset = (c: ModelContent, id: string, s: TestState, keep: PresetKeep = {}): ModelContent =>
  mapPreset(c, id, p => {
    const scope = p.scope ? scopeOf(c, p.scope) : null
    if (scope) { const { order: _order, ...rest } = p; return { ...rest, fall: null, ...capturedStyle(c, s, scope) } }
    const { forms: _forms, styles: _styles, picks: _picks, ...rest } = p
    const had = { forms: Object.keys(p.forms ?? {}).length > 0, styles: Object.keys(p.styles ?? {}).length > 0, colours: Object.keys(p.picks ?? {}).length > 0 }
    return { ...rest, fall: null, ...captured(c, s, { forms: keep.forms || had.forms, styles: keep.styles || had.styles, colours: keep.colours || had.colours }) }
  })
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
