import { describe, expect, it } from 'vitest'
import type { ModelContent } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, publishFaults, removeGroup, removeObject, repairStates, starterContent } from '../modelContent'
import { newShape } from './edit'
import { limitNotes, LIMITS } from './limits'
import { makeTwin } from './pairEdit'
import { applyPreset, awayCount, restState, type TestState } from './presets'
import { previewSpecs } from './previews'
import { addRange, newRange, removeRange, type Edit } from './rigEdit'
import { solve } from './rig'
import { addOption, addState, applyOption, chosenOption, optionIsOn, removeOption, removeState, renameOption, renameState, stateFootprint, statesOf, updateOption } from './states'

// Group states (phase D3b): a switch on a group whose options each set slider values, switch objects and groups off and choose forms.
const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`

// A Hand group (a palm, and a finger with an axis of two forms), a slider that curls it (listed under the group), another that spreads it, and a Head group beside it.
function handed(): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gHand', 'Hand')); c = addGroup(c, newGroup('gHead', 'Head'))
  c = addObject(c, 'gHand', { id: 'oPalm', name: 'Palm', layer: 'body', shapes: [] })
  c = addShape(c, 'oPalm', newShape('palm', 'Palm', 'rounded', box(60, 100, 20, 20)))
  c = addObject(c, 'gHand', {
    id: 'oFinger', name: 'Finger', layer: 'body', shapes: [],
    axes: [{ id: 'aBend', name: 'Bend', initial: 'straight', options: [{ id: 'straight', name: 'Straight', ovr: [] }, { id: 'bent', name: 'Bent', ovr: [] }] }],
  })
  c = addShape(c, 'oFinger', newShape('finger', 'Finger', 'oval', box(62, 80, 4, 20)))
  c = addObject(c, 'gHead', { id: 'oSkull', name: 'Skull', layer: 'body', shapes: [] })
  c = addShape(c, 'oSkull', newShape('skull', 'Skull', 'oval', box(76, 20, 48, 56)))
  c = must(addRange(c, { ...newRange('rCurl', 'Curl', 'points', 'gHand'), min: 0, rest: 0, max: 100 }))
  c = must(addRange(c, { ...newRange('rSpread', 'Spread', 'points', 'gHand'), min: 0, rest: 0, max: 100 }))
  c = must(addRange(c, { ...newRange('rNod', 'Nod', 'turn', 'gHead') }))
  return c
}
const look = (c: ModelContent, over: Partial<TestState>): TestState => ({ ...restState(c), ...over })
const closed = (c: ModelContent): TestState => look(c, { values: { ...restState(c).values, rCurl: 80 }, hidden: ['oPalm'], forms: { 'oFinger.aBend': 'bent' } })

// a state Grip of the Hand: Open (as drawn), Closed (curled, the palm off, the finger bent)
function gripped(): { c: ModelContent; stateId: string; open: string; closedId: string } {
  const c0 = handed()
  const added = addState(c0, restState(c0), 'gHand', make)
  if (!added.ok) throw new Error(added.reason)
  const c1 = renameOption(renameState(added.content, 'gHand', added.stateId!, 'Grip'), 'gHand', added.stateId!, added.optionId!, 'Open')
  const second = addOption(c1, closed(c1), 'gHand', added.stateId!, make)
  if (!second.ok) throw new Error(second.reason)
  return { c: renameOption(second.content, 'gHand', added.stateId!, second.optionId!, 'Closed'), stateId: added.stateId!, open: added.optionId!, closedId: second.optionId! }
}

describe('a state keeps what a group looks like as an option', () => {
  it('starts with one option that keeps the look now, named State 1 and Option 1', () => {
    const c0 = handed()
    const e = addState(c0, closed(c0), 'gHand', make)
    const g = must(e).groups.find(x => x.id === 'gHand')!
    expect(statesOf(g)).toHaveLength(1)
    expect(statesOf(g)[0].name).toBe('State 1')
    expect(statesOf(g)[0].options[0]).toMatchObject({ name: 'Option 1', values: { rCurl: 80 }, hidden: ['oPalm'], forms: { 'oFinger.aBend': 'bent' } })
  })
  it('keeps only what the group holds: its sliders, the things inside it and the forms of its objects, not the group itself or what lies beside it', () => {
    const c0 = handed()
    const s = look(c0, { values: { ...restState(c0).values, rCurl: 50, rNod: 20 }, hidden: ['oPalm', 'oSkull', 'gHand', 'gHead'], forms: { 'oFinger.aBend': 'bent' } })
    const option = statesOf(must(addState(c0, s, 'gHand', make)).groups.find(g => g.id === 'gHand')!)[0].options[0]
    expect(option.values).toEqual({ rCurl: 50 })
    expect(option.hidden).toEqual(['oPalm'])
    expect(option.forms).toEqual({ 'oFinger.aBend': 'bent' })
  })
  it('adds options from the look now, updates one, renames, and refuses to delete the last', () => {
    const { c, stateId, open, closedId } = gripped()
    const g = () => statesOf(c.groups.find(x => x.id === 'gHand')!)[0]
    expect(g().options.map(o => o.name)).toEqual(['Open', 'Closed'])
    const updated = updateOption(c, look(c, { values: { ...restState(c).values, rCurl: 30 } }), 'gHand', stateId, closedId)
    expect(statesOf(updated.groups.find(x => x.id === 'gHand')!)[0].options[1]).toMatchObject({ values: { rCurl: 30 }, hidden: [], forms: {} })
    const left = must(removeOption(c, 'gHand', stateId, closedId))
    expect(statesOf(left.groups.find(x => x.id === 'gHand')!)[0].options.map(o => o.id)).toEqual([open])
    expect(refused(removeOption(left, 'gHand', stateId, open))).toMatch(/needs an option/)
    expect(refused(removeOption(c, 'gHand', stateId, 'nope'))).toMatch(/no such option/)
    expect(statesOf(removeState(c, 'gHand', stateId).groups.find(x => x.id === 'gHand')!)).toEqual([])
  })
  it('is refused on a twin group, a missing group and past the limits', () => {
    const c = must(makeTwin(handed(), 'group', 'gHand', make))
    const twin = c.groups.find(g => g.mirrorOf === 'gHand')!
    expect(refused(addState(c, restState(c), twin.id, make))).toMatch(/twin/)
    expect(refused(addState(c, restState(c), 'gNone', make))).toMatch(/no such group/)
    let d = handed()
    for (let i = 0; i < LIMITS.statesMax; i++) d = must(addState(d, restState(d), 'gHand', make))
    expect(refused(addState(d, restState(d), 'gHand', make))).toMatch(/at most 8 states/)
    let e = gripped()
    for (let i = 2; i < LIMITS.stateOptionsMax; i++) e = { ...e, c: must(addOption(e.c, restState(e.c), 'gHand', e.stateId, make)) }
    expect(refused(addOption(e.c, restState(e.c), 'gHand', e.stateId, make))).toMatch(/at most 24 options/)
  })
})

describe('choosing an option', () => {
  const { c, stateId, open, closedId } = gripped()
  it('sets its sliders, switches its things off and chooses its forms', () => {
    const s = applyOption(c, restState(c), 'gHand', stateId, closedId)
    expect(s.values.rCurl).toBe(80); expect(s.hidden).toEqual(['oPalm']); expect(s.forms['oFinger.aBend']).toBe('bent')
  })
  it('puts back what any option of the state controls, then sets its own, and leaves the rest alone', () => {
    const start = look(c, { values: { ...restState(c).values, rCurl: 80, rSpread: 40, rNod: 12 }, hidden: ['oPalm', 'oSkull'], forms: { 'oFinger.aBend': 'bent' } })
    const s = applyOption(c, start, 'gHand', stateId, open)
    expect(s.values.rCurl).toBe(0)                           // Closed controls it, Open sets nothing
    expect(s.values.rSpread).toBe(40)                        // no option controls the spread
    expect(s.values.rNod).toBe(12)
    expect(s.hidden).toEqual(['oSkull'])                     // the skull was hidden by the user, not by the state
    expect(s.forms['oFinger.aBend']).toBeUndefined()         // back to the default form
  })
  it('is on exactly when choosing it would change nothing, and one of the options is on', () => {
    const rest = restState(c)
    expect(optionIsOn(c, rest, 'gHand', stateId, open)).toBe(true)
    expect(optionIsOn(c, rest, 'gHand', stateId, closedId)).toBe(false)
    const shut = applyOption(c, rest, 'gHand', stateId, closedId)
    expect(optionIsOn(c, shut, 'gHand', stateId, closedId)).toBe(true)
    expect(optionIsOn(c, shut, 'gHand', stateId, open)).toBe(false)
    expect(chosenOption(c, shut, 'gHand', statesOf(c.groups.find(g => g.id === 'gHand')!)[0])?.name).toBe('Closed')
    const moved = { ...shut, values: { ...shut.values, rCurl: 50 } }
    expect(chosenOption(c, moved, 'gHand', statesOf(c.groups.find(g => g.id === 'gHand')!)[0])).toBeUndefined()          // moved away from every option
  })
  it('counts in what is away from rest, as its sliders, things and forms do', () => {
    expect(awayCount(c, applyOption(c, restState(c), 'gHand', stateId, closedId))).toBe(3)
  })
  it('draws the group as the option says', () => {
    const shut = applyOption(c, restState(c), 'gHand', stateId, closedId)
    const solved = solve(c, shut.values, 'front', { forms: shut.forms, hidden: shut.hidden })
    expect(solved.shapes.palm.visible).toBe(false); expect(solved.shapes.finger.visible).toBe(true)
  })
  it('does nothing for a state or an option that is not there', () => {
    const rest = restState(c)
    expect(applyOption(c, rest, 'gHand', 'nope', closedId)).toBe(rest)
    expect(applyOption(c, rest, 'gHand', stateId, 'nope')).toBe(rest)
    expect(applyOption(c, rest, 'gNone', stateId, closedId)).toBe(rest)
    expect(optionIsOn(c, rest, 'gHand', 'nope', open)).toBe(false)
  })
  it('lists what a state controls as the union of its options', () => {
    const [st] = statesOf(c.groups.find(g => g.id === 'gHand')!)
    expect(stateFootprint(st)).toEqual({ values: new Set(['rCurl']), hidden: new Set(['oPalm']), forms: new Set(['oFinger.aBend']) })
  })
  it('combines with a second state of the group and with presets', () => {
    const two = must(addState(c, look(c, { values: { ...restState(c).values, rSpread: 60 } }), 'gHand', make))
    const spread = statesOf(two.groups.find(g => g.id === 'gHand')!)[1]
    const s0 = applyOption(two, restState(two), 'gHand', stateId, closedId)
    const s1 = applyOption(two, s0, 'gHand', spread.id, spread.options[0].id)
    expect(s1.values.rCurl).toBe(80); expect(s1.values.rSpread).toBe(60)
    const preset = { id: 'p', name: 'P', kind: 'Pose', values: { rNod: 9 }, hidden: [] }
    expect(applyPreset(two, s1, preset).values.rCurl).toBe(80)                // a preset of another slot leaves the state alone
  })
})

describe('what is left when things are deleted', () => {
  it('drops a deleted slider, object or group from the options, and a deleted group takes its states', () => {
    const { c, stateId } = gripped()
    const noCurl = must(removeRange(c, 'rCurl'))
    expect(statesOf(noCurl.groups.find(g => g.id === 'gHand')!)[0].options[1].values).toEqual({})
    const noPalm = removeObject(c, 'oPalm')
    expect(statesOf(noPalm.groups.find(g => g.id === 'gHand')!)[0].options[1].hidden).toEqual([])
    const noFinger = removeObject(c, 'oFinger')
    expect(statesOf(noFinger.groups.find(g => g.id === 'gHand')!)[0].options[1].forms).toEqual({})
    expect(removeGroup(c, 'gHand').groups.some(g => statesOf(g).some(st => st.id === stateId))).toBe(false)
  })
})

describe('what a save and a publish say about them', () => {
  const { c, stateId, closedId } = gripped()
  const withOption = (change: (o: Record<string, unknown>) => void): ModelContent => ({
    ...c, groups: c.groups.map(g => (g.id !== 'gHand' ? g : { ...g, states: statesOf(g).map(st => ({ ...st, options: st.options.map(o => { if (o.id !== closedId) return o; const copy = { ...o, values: { ...o.values }, hidden: [...o.hidden], forms: { ...o.forms } }; change(copy); return copy }) })) })),
  })
  it('has no fault for a whole model, no warning for a few states, and normalising adds nothing', () => {
    expect(publishFaults(c)).toEqual([])
    expect(limitNotes(c)).toEqual([])
    expect(normalizeContent(c).groups.find(g => g.id === 'gHand')!.states).toEqual(statesOf(c.groups.find(g => g.id === 'gHand')!))
    expect(normalizeContent(handed()).groups.map(g => g.states)).toEqual([[], []])
  })
  it('says the server\'s words for each fault', () => {
    expect(publishFaults(withOption(o => { (o.values as Record<string, number>).rGone = 4 }))).toContain('Option Closed of state Grip sets a slider that does not exist.')
    expect(publishFaults(withOption(o => { (o.hidden as string[]).push('oGone') }))).toContain('Option Closed of state Grip switches off something that does not exist.')
    expect(publishFaults(withOption(o => { (o.forms as Record<string, string>)['oFinger.aBend'] = 'gone' }))).toContain('Option Closed of state Grip chooses a form that does not exist.')
    const twinned = { ...c, groups: [...c.groups, { ...newGroup('gTwin', 'Hand twin'), mirrorOf: 'gHand', states: [{ id: 'x', name: 'X', options: [{ id: 'y', name: 'Y', values: {}, hidden: [], forms: {} }] }] }] }
    expect(publishFaults(twinned)).toContain('Group Hand twin is a twin and has states of its own; give them to the original.')
  })
  it('repairs states the way the server does', () => {
    const fixed = repairStates([
      { id: 'a', name: `  ${'x'.repeat(60)}`, options: [{ id: 'o', name: 'O', values: { rCurl: 5000, bad: Number.NaN }, hidden: ['p', 'p'], forms: {} }, { id: 'o', name: 'Again', values: {}, hidden: [], forms: {} }] },
      { id: 'a', name: 'Repeated', options: [{ id: 'z', name: 'Z', values: {}, hidden: [], forms: {} }] },
      { id: 'empty', name: 'Empty', options: [] },
    ])
    expect(fixed).toHaveLength(1)
    expect(fixed[0].name).toBe('x'.repeat(40))
    expect(fixed[0].options).toEqual([{ id: 'o', name: 'O', values: { rCurl: 1000 }, hidden: ['p'], forms: {} }])
  })
  it('warns above four states in a group and eight options in a state', () => {
    let d = handed()
    for (let i = 0; i < LIMITS.statesWarn + 1; i++) d = must(addState(d, restState(d), 'gHand', make))
    expect(limitNotes(d).some(note => /5 states/.test(note.text))).toBe(true)
    let e = gripped()
    for (let i = 2; i < LIMITS.stateOptionsWarn + 1; i++) e = { ...e, c: must(addOption(e.c, restState(e.c), 'gHand', e.stateId, make)) }
    expect(limitNotes(e.c).some(note => /9 options/.test(note.text))).toBe(true)
    expect(stateId).toBeTruthy()
  })
})

describe('previews', () => {
  it('draw a random option of each state now and then, and nothing new for a model without states', () => {
    const { c } = gripped()
    let curled = 0
    for (let seed = 1; seed <= 15; seed++) for (const spec of previewSpecs(seed, 'rand', 6, c.ranges, c)) { if (spec.hidden.includes('oPalm')) curled++; expect(Number.isFinite(spec.values.rCurl)).toBe(true) }
    expect(curled).toBeGreaterThan(0)
    const plain = handed()
    expect(previewSpecs(7, 'rand', 6, plain.ranges, plain)).toEqual(previewSpecs(7, 'rand', 6, plain.ranges, { ...plain, groups: plain.groups.map(g => ({ ...g, states: [] })) }))
  })
})
