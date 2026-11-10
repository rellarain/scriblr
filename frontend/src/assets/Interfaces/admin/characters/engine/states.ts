import type { ModelContent, ModelGroup, ModelState, ModelStateOption } from '../../../../../api/types'
import { randomId, type MakeId } from '../modelContent'
import { freshFormId } from './formEdit'
import { choiceOf } from './forms'
import { LIMITS } from './limits'
import { capturedStyle, scopeOf, type TestState } from './presets'
import { done, fail, type Edit } from './rigEdit'
import { valueOf } from './rig'

// Group states (phase D3b). A group has named switches, Front or Back, Open or Closed: each option of a switch sets several things of the group at once, namely slider values,
// objects and groups switched off, and the form chosen on axes of its objects. Like a preset, choosing an option first puts back whatever ANY option of the same state controls
// (the sliders to rest, the things shown, the forms to their default), then sets its own, so the options of one state replace each other and the rest of the figure is left as it
// is. Several states of one group combine, and an option is "on" when choosing it would change nothing. The choice is made on the group's card and is test state, never saved; a
// pose or a variant keeps what the sliders, things and forms come to. Everything here is pure.

const SAME = 0.01

export const statesOf = (g: ModelGroup): ModelState[] => g.states ?? []
const groupOf = (c: ModelContent, id: string): ModelGroup | undefined => c.groups.find(g => g.id === id)

// Everything the options of a state control: the sliders, the things (objects and groups) and the form choices.
export function stateFootprint(st: ModelState): { values: Set<string>; hidden: Set<string>; forms: Set<string> } {
  const out = { values: new Set<string>(), hidden: new Set<string>(), forms: new Set<string>() }
  for (const o of st.options) {
    for (const k of Object.keys(o.values)) out.values.add(k)
    for (const h of o.hidden) out.hidden.add(h)
    for (const k of Object.keys(o.forms)) out.forms.add(k)
  }
  return out
}

const things = (c: ModelContent): Set<string> => new Set([...c.objects.map(o => o.id), ...c.groups.map(g => g.id)])

// The look with one option of a state chosen.
export function applyOption(c: ModelContent, s: TestState, groupId: string, stateId: string, optionId: string): TestState {
  const g = groupOf(c, groupId), st = g ? statesOf(g).find(x => x.id === stateId) : undefined, option = st?.options.find(o => o.id === optionId)
  if (!st || !option) return s
  const free = stateFootprint(st), known = things(c)
  const values = { ...s.values }
  for (const r of c.ranges) {
    if (free.values.has(r.id)) values[r.id] = r.rest
    if (option.values[r.id] !== undefined) values[r.id] = valueOf(r, { [r.id]: option.values[r.id] })
  }
  const hidden = new Set(s.hidden.filter(h => !free.hidden.has(h)))
  for (const h of option.hidden) if (known.has(h)) hidden.add(h)
  const forms = { ...s.forms }
  for (const k of free.forms) delete forms[k]
  for (const [k, v] of Object.entries(option.forms)) forms[k] = v
  return { ...s, values, forms, hidden: [...hidden] }
}

// Whether choosing the option would change nothing.
export function optionIsOn(c: ModelContent, s: TestState, groupId: string, stateId: string, optionId: string): boolean {
  const g = groupOf(c, groupId), st = g ? statesOf(g).find(x => x.id === stateId) : undefined
  if (!st || !st.options.some(o => o.id === optionId)) return false
  const next = applyOption(c, s, groupId, stateId, optionId), free = stateFootprint(st)
  if (c.ranges.some(r => free.values.has(r.id) && Math.abs(valueOf(r, next.values) - valueOf(r, s.values)) > SAME)) return false
  if ([...free.forms].some(k => choiceOf(c, k, next.forms) !== choiceOf(c, k, s.forms))) return false
  return [...free.hidden].every(h => next.hidden.includes(h) === s.hidden.includes(h))
}

// The option a state is at now: the first that is on (none when the look has been moved away from every option).
export const chosenOption = (c: ModelContent, s: TestState, groupId: string, st: ModelState): ModelStateOption | undefined => st.options.find(o => optionIsOn(c, s, groupId, st.id, o.id))

// ---- editing: what a group's card does ----

// What an option keeps of the look now: the sliders listed under the group that are away from rest, the objects and groups inside it that are switched off (not the group itself),
// and the forms (away from their default) chosen for its objects.
function captured(c: ModelContent, s: TestState, groupId: string): Pick<ModelStateOption, 'values' | 'hidden' | 'forms'> | null {
  const scope = scopeOf(c, groupId)
  if (!scope) return null
  const { values, hidden, forms } = capturedStyle(c, s, scope)
  return { values, hidden: hidden.filter(h => h !== groupId), forms: forms ?? {} }
}

const mapState = (c: ModelContent, groupId: string, stateId: string, change: (st: ModelState) => ModelState): ModelContent => ({
  ...c, groups: c.groups.map(g => (g.id === groupId ? { ...g, states: statesOf(g).map(st => (st.id === stateId ? change(st) : st)) } : g)),
})
const mapOption = (c: ModelContent, groupId: string, stateId: string, optionId: string, change: (o: ModelStateOption) => ModelStateOption): ModelContent =>
  mapState(c, groupId, stateId, st => ({ ...st, options: st.options.map(o => (o.id === optionId ? change(o) : o)) }))

// A new state of a group with one option: the look now.
export function addState(c: ModelContent, s: TestState, groupId: string, make: MakeId = randomId): Edit & { stateId?: string; optionId?: string } {
  const g = groupOf(c, groupId)
  if (!g) return fail('There is no such group.')
  if (g.mirrorOf) return fail('A twin follows its original: give the states to the original.')
  if (statesOf(g).length >= LIMITS.statesMax) return fail(`A group may have at most ${LIMITS.statesMax} states.`)
  const look = captured(c, s, groupId)
  if (!look) return fail('There is no such group.')
  const stateId = freshFormId(c.groups.flatMap(x => statesOf(x).map(y => y.id)), 'st', make)
  const optionId = freshFormId([], 'op', make)
  const state: ModelState = { id: stateId, name: `State ${statesOf(g).length + 1}`, options: [{ id: optionId, name: 'Option 1', ...look }] }
  return { ...done({ ...c, groups: c.groups.map(x => (x.id === groupId ? { ...x, states: [...statesOf(x), state] } : x)) }), stateId, optionId }
}

export const renameState = (c: ModelContent, groupId: string, stateId: string, name: string): ModelContent => mapState(c, groupId, stateId, st => ({ ...st, name }))
export const removeState = (c: ModelContent, groupId: string, stateId: string): ModelContent => ({ ...c, groups: c.groups.map(g => (g.id === groupId ? { ...g, states: statesOf(g).filter(st => st.id !== stateId) } : g)) })

// A new option of a state: the look now.
export function addOption(c: ModelContent, s: TestState, groupId: string, stateId: string, make: MakeId = randomId): Edit & { optionId?: string } {
  const g = groupOf(c, groupId), st = g ? statesOf(g).find(x => x.id === stateId) : undefined
  if (!g || !st) return fail('There is no such state.')
  if (st.options.length >= LIMITS.stateOptionsMax) return fail(`A state may have at most ${LIMITS.stateOptionsMax} options.`)
  const look = captured(c, s, groupId)
  if (!look) return fail('There is no such group.')
  const optionId = freshFormId(st.options.map(o => o.id), 'op', make)
  return { ...done(mapState(c, groupId, stateId, x => ({ ...x, options: [...x.options, { id: optionId, name: `Option ${x.options.length + 1}`, ...look }] }))), optionId }
}

// An option takes the look now in place of what it kept.
export function updateOption(c: ModelContent, s: TestState, groupId: string, stateId: string, optionId: string): ModelContent {
  const look = captured(c, s, groupId)
  return look ? mapOption(c, groupId, stateId, optionId, o => ({ ...o, ...look })) : c
}
export const renameOption = (c: ModelContent, groupId: string, stateId: string, optionId: string, name: string): ModelContent => mapOption(c, groupId, stateId, optionId, o => ({ ...o, name }))

// A state needs an option, so the last one cannot go: delete the state instead.
export function removeOption(c: ModelContent, groupId: string, stateId: string, optionId: string): Edit {
  const g = groupOf(c, groupId), st = g ? statesOf(g).find(x => x.id === stateId) : undefined
  if (!st || !st.options.some(o => o.id === optionId)) return fail('There is no such option.')
  if (st.options.length <= 1) return fail('A state needs an option: delete the state instead.')
  return done(mapState(c, groupId, stateId, x => ({ ...x, options: x.options.filter(o => o.id !== optionId) })))
}
