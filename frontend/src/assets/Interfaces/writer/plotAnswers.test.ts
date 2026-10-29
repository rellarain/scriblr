import { describe, expect, it } from 'vitest'
import type { OutlineNode, PlotCustomFieldDef, PlotNode } from '../../../api/types'
import {
  addOption, answersOf, chooseOption, fieldHasValues, moveOption, optionUse, removeAnswer, removeOption, renameOption, setFieldKind, setTextAnswer,
  toggleOption,
} from './plotAnswers'
import { addValue, canMoveValue, deleteField, migratePlot, syncReferences, valuesIn } from './plotFields'
import { MAX_OPTIONS, OPTION_LABEL_MAX, hasOptions, isChoice, kindOf, repairChoices } from './plotKinds'
import { placeValue } from './plotPlacement'

let counter = 0
const makeId = (prefix: string) => `${prefix}${(counter += 1)}`

const base = { body: '', sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, fieldId: null, refId: null, placements: [] }
const node = (id: string, kind: PlotNode['kind'], parentId: string | null, over: Partial<PlotNode> = {}): PlotNode =>
  ({ ...base, id, kind, parentId, order: 0, title: id, ...over } as PlotNode)
const out = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)
const outline = [out('book', 'book', null), out('ch1', 'chapter', 'book'), out('ch2', 'chapter', 'book', { order: 1 })]
const outlineById = new Map(outline.map(n => [n.id, n]))
const find = (nodes: PlotNode[], id: string) => nodes.find(n => n.id === id)!
const titles = (nodes: PlotNode[]) => nodes.map(n => n.title)

const GENRE: PlotCustomFieldDef = { id: 'fGenre', name: 'Genre', kind: 'multi', options: [{ id: 'o1', label: 'Fantasy' }, { id: 'o2', label: 'Romance' }, { id: 'o3', label: 'Crime' }] }
const TONE: PlotCustomFieldDef = { id: 'fTone', name: 'Tone', kind: 'dropdown', options: [{ id: 't1', label: 'Dark' }, { id: 't2', label: 'Light' }] }
const MOTTO: PlotCustomFieldDef = { id: 'fMotto', name: 'Motto', kind: 'text' }

// A category with a multi-select, a dropdown, a short text and a plain field, and two plotlines under it.
function world(): PlotNode[] {
  return [
    node('cat', 'category', null, { customFieldDefs: [GENRE, TONE, MOTTO, { id: 'fPlain', name: 'Beats' }] }),
    node('lineA', 'plotline', 'cat'),
    node('lineB', 'plotline', 'cat', { order: 1 }),
  ]
}

describe('reading a field\'s kind', () => {
  it('reads no kind, and one it does not know, as the usual field', () => {
    expect(kindOf({})).toBe('points')
    expect(kindOf({ kind: null })).toBe('points')
    expect(kindOf({ kind: 'radio' as never })).toBe('points')
    expect([kindOf(GENRE), kindOf(TONE), kindOf(MOTTO)]).toEqual(['multi', 'dropdown', 'text'])
  })

  it('knows which fields hold answers and which have options', () => {
    expect([isChoice({}), isChoice(GENRE), isChoice(MOTTO)]).toEqual([false, true, true])
    expect([hasOptions({}), hasOptions(GENRE), hasOptions(TONE), hasOptions(MOTTO)]).toEqual([false, true, true, false])
  })
})

describe('setting a field\'s kind', () => {
  it('changes the kind while the field has no values, and not afterwards', () => {
    let nodes = world()
    nodes = setFieldKind(nodes, 'cat', 'fPlain', 'multi')
    expect(find(nodes, 'cat').customFieldDefs.find(d => d.id === 'fPlain')).toMatchObject({ kind: 'multi' })
    const withValue = [...nodes, node('v', 'plotpoint', 'cat', { fieldId: 'fPlain', title: 'x' })]
    expect(fieldHasValues(withValue, 'fPlain')).toBe(true)
    expect(setFieldKind(withValue, 'cat', 'fPlain', 'text')).toBe(withValue)
  })

  it('keeps the options between a multi-select and a dropdown, and drops them otherwise', () => {
    let nodes = setFieldKind(world(), 'cat', 'fGenre', 'dropdown')
    expect(find(nodes, 'cat').customFieldDefs[0]).toMatchObject({ kind: 'dropdown', options: GENRE.options })
    nodes = setFieldKind(nodes, 'cat', 'fGenre', 'text')
    expect(find(nodes, 'cat').customFieldDefs[0]).toEqual({ id: 'fGenre', name: 'Genre', kind: 'text' })
    nodes = setFieldKind(nodes, 'cat', 'fGenre', 'points')
    expect(find(nodes, 'cat').customFieldDefs[0]).toEqual({ id: 'fGenre', name: 'Genre' })
  })

  it('leaves a plotline\'s Scrap field and a missing field alone', () => {
    const nodes = [...world(), node('lineC', 'plotline', 'cat', { customFieldDefs: [{ id: 'scrap-lineC', name: 'Scrap' }] })]
    expect(setFieldKind(nodes, 'lineC', 'scrap-lineC', 'text')).toBe(nodes)
    expect(setFieldKind(nodes, 'cat', 'nope', 'text')).toBe(nodes)
  })
})

describe('options', () => {
  it('adds an option last, cut to the limit, and refuses a blank, a taken one (without case) and a surplus', () => {
    let nodes = world()
    const added = addOption(nodes, 'cat', 'fGenre', `  ${'x'.repeat(40)} `, makeId)
    expect(added.id).not.toBeNull()
    const options = find(added.nodes, 'cat').customFieldDefs[0].options!
    expect(options.at(-1)).toEqual({ id: added.id, label: 'x'.repeat(OPTION_LABEL_MAX) })
    nodes = added.nodes
    expect(addOption(nodes, 'cat', 'fGenre', '   ').id).toBeNull()
    expect(addOption(nodes, 'cat', 'fGenre', 'fantasy').id).toBeNull()
    expect(addOption(nodes, 'cat', 'fMotto', 'Anything').id).toBeNull()
    expect(addOption(nodes, 'cat', 'fPlain', 'Anything').id).toBeNull()
    for (let i = 0; nodes.length > 0 && i < MAX_OPTIONS; i += 1) nodes = addOption(nodes, 'cat', 'fTone', `More ${i}`, makeId).nodes
    expect(find(nodes, 'cat').customFieldDefs[1].options).toHaveLength(MAX_OPTIONS)
    expect(addOption(nodes, 'cat', 'fTone', 'One too many').id).toBeNull()
  })

  it('renames an option, and retitles every answer that uses it', () => {
    let nodes = toggleOption(world(), 'lineA', 'fGenre', 'o1', true, makeId)
    nodes = toggleOption(nodes, 'cat', 'fGenre', 'o1', true, makeId)
    nodes = renameOption(nodes, 'cat', 'fGenre', 'o1', 'High fantasy')
    expect(find(nodes, 'cat').customFieldDefs[0].options![0]).toEqual({ id: 'o1', label: 'High fantasy' })
    expect(titles(nodes.filter(n => n.optionId === 'o1'))).toEqual(['High fantasy', 'High fantasy'])
    // the label is kept as typed, up to the limit
    nodes = renameOption(nodes, 'cat', 'fGenre', 'o1', `${'y'.repeat(50)}`)
    expect(find(nodes, 'cat').customFieldDefs[0].options![0].label).toHaveLength(OPTION_LABEL_MAX)
  })

  it('moves an option before another, and last', () => {
    let nodes = moveOption(world(), 'cat', 'fGenre', 'o3', 'o1')
    expect(find(nodes, 'cat').customFieldDefs[0].options!.map(o => o.id)).toEqual(['o3', 'o1', 'o2'])
    nodes = moveOption(nodes, 'cat', 'fGenre', 'o3', null)
    expect(find(nodes, 'cat').customFieldDefs[0].options!.map(o => o.id)).toEqual(['o1', 'o2', 'o3'])
    expect(moveOption(nodes, 'cat', 'fGenre', 'o1', 'o1')).toBe(nodes)
  })

  it('removes an option with every answer that uses it, and counts them first', () => {
    let nodes = toggleOption(world(), 'lineA', 'fGenre', 'o1', true, makeId)
    nodes = toggleOption(nodes, 'lineB', 'fGenre', 'o1', true, makeId)
    nodes = toggleOption(nodes, 'lineB', 'fGenre', 'o2', true, makeId)
    const placed = find(nodes, answersOf(nodes, 'lineA', 'fGenre')[0].id)
    nodes = placeValue(nodes, placed.id, 'ch1', outlineById)
    nodes = placeValue(nodes, placed.id, 'ch2', outlineById)
    expect(optionUse(nodes, 'fGenre', 'o1', outlineById)).toEqual({ answers: 2, placements: 2 })
    expect(optionUse(nodes, 'fGenre', 'o3', outlineById)).toEqual({ answers: 0, placements: 0 })
    const after = removeOption(nodes, 'cat', 'fGenre', 'o1')
    expect(find(after, 'cat').customFieldDefs[0].options!.map(o => o.id)).toEqual(['o2', 'o3'])
    expect(after.filter(n => n.kind === 'plotpoint').map(n => n.optionId)).toEqual(['o2'])
  })
})

describe('answering', () => {
  it('ticks and unticks an option of a multi-select for a plotline and for the node that defines the field', () => {
    let nodes = toggleOption(world(), 'lineA', 'fGenre', 'o1', true, makeId)
    nodes = toggleOption(nodes, 'lineA', 'fGenre', 'o2', true, makeId)
    nodes = toggleOption(nodes, 'cat', 'fGenre', 'o3', true, makeId)
    expect(answersOf(nodes, 'lineA', 'fGenre').map(a => [a.title, a.optionId, a.parentId])).toEqual([['Fantasy', 'o1', 'lineA'], ['Romance', 'o2', 'lineA']])
    expect(answersOf(nodes, 'cat', 'fGenre').map(a => a.title)).toEqual(['Crime'])
    expect(answersOf(nodes, 'lineB', 'fGenre')).toEqual([])
    // ticking twice makes one; unticking takes it away with its places
    expect(toggleOption(nodes, 'lineA', 'fGenre', 'o1', true, makeId)).toBe(nodes)
    const first = answersOf(nodes, 'lineA', 'fGenre')[0]
    nodes = placeValue(nodes, first.id, 'ch1', outlineById)
    nodes = toggleOption(nodes, 'lineA', 'fGenre', 'o1', false)
    expect(answersOf(nodes, 'lineA', 'fGenre').map(a => a.title)).toEqual(['Romance'])
    expect(nodes.some(n => n.id === first.id)).toBe(false)
  })

  it('refuses an option the field does not have, a field of another kind, and a node the field does not reach', () => {
    const nodes = world()
    expect(toggleOption(nodes, 'lineA', 'fGenre', 'nope', true, makeId)).toBe(nodes)
    expect(toggleOption(nodes, 'lineA', 'fTone', 't1', true, makeId)).toBe(nodes)
    const elsewhere = [...nodes, node('other', 'category', null), node('otherLine', 'plotline', 'other')]
    expect(toggleOption(elsewhere, 'otherLine', 'fGenre', 'o1', true, makeId)).toBe(elsewhere)
  })

  it('picks the option of a dropdown, replaces it when another is picked and clears it with none', () => {
    let nodes = chooseOption(world(), 'lineA', 'fTone', 't1', makeId)
    expect(answersOf(nodes, 'lineA', 'fTone').map(a => [a.title, a.optionId])).toEqual([['Dark', 't1']])
    expect(chooseOption(nodes, 'lineA', 'fTone', 't1', makeId)).toBe(nodes)
    const first = answersOf(nodes, 'lineA', 'fTone')[0]
    nodes = placeValue(nodes, first.id, 'ch1', outlineById)
    nodes = chooseOption(nodes, 'lineA', 'fTone', 't2', makeId)
    expect(answersOf(nodes, 'lineA', 'fTone').map(a => a.title)).toEqual(['Light'])
    expect(nodes.some(n => n.id === first.id)).toBe(false)
    nodes = chooseOption(nodes, 'lineA', 'fTone', null)
    expect(answersOf(nodes, 'lineA', 'fTone')).toEqual([])
    expect(chooseOption(nodes, 'lineA', 'fTone', null)).toBe(nodes)
    expect(chooseOption(nodes, 'lineA', 'fTone', 'nope')).toBe(nodes)
  })

  it('writes the text of a short-text field: one answer, kept as typed, cut to the title limit', () => {
    let nodes = setTextAnswer(world(), 'lineA', 'fMotto', 'Never ', makeId)
    expect(answersOf(nodes, 'lineA', 'fMotto').map(a => a.title)).toEqual(['Never '])
    nodes = setTextAnswer(nodes, 'lineA', 'fMotto', 'Never again', makeId)
    expect(answersOf(nodes, 'lineA', 'fMotto')).toHaveLength(1)
    expect(answersOf(nodes, 'lineA', 'fMotto')[0].title).toBe('Never again')
    nodes = setTextAnswer(nodes, 'lineA', 'fMotto', 'x'.repeat(80), makeId)
    expect(answersOf(nodes, 'lineA', 'fMotto')[0].title).toHaveLength(50)
    expect(setTextAnswer(world(), 'lineA', 'fMotto', '   ', makeId)).toEqual(world())
    expect(setTextAnswer(world(), 'lineA', 'fTone', 'text', makeId)).toEqual(world())
  })

  it('takes an answer away with its places, and only an answer', () => {
    let nodes = setTextAnswer(world(), 'lineA', 'fMotto', 'Never again', makeId)
    const answer = answersOf(nodes, 'lineA', 'fMotto')[0]
    nodes = placeValue(nodes, answer.id, 'ch1', outlineById)
    expect(removeAnswer(nodes, answer.id).some(n => n.id === answer.id)).toBe(false)
    const plain = [...nodes, node('v', 'plotpoint', 'lineA', { fieldId: 'fPlain', title: 'A beat' })]
    expect(removeAnswer(plain, 'v')).toBe(plain)
  })

  it('places an answer like any plotpoint: more than once, and it stays', () => {
    let nodes = toggleOption(world(), 'lineA', 'fGenre', 'o1', true, makeId)
    const answer = answersOf(nodes, 'lineA', 'fGenre')[0]
    nodes = placeValue(nodes, answer.id, 'ch1', outlineById)
    nodes = placeValue(nodes, answer.id, 'ch2', outlineById)
    expect(find(nodes, answer.id).placements!.map(p => p.targetId)).toEqual(['ch1', 'ch2'])
  })
})

describe('answers among the other rules of a plot', () => {
  it('makes no references for a choice field, though the node that defines it has an answer', () => {
    let nodes = toggleOption(world(), 'cat', 'fGenre', 'o1', true, makeId)
    nodes = [...nodes, node('beat', 'plotpoint', 'cat', { fieldId: 'fPlain', title: 'A beat' })]
    const synced = syncReferences(nodes, outlineById, makeId)
    expect(valuesIn(synced, 'lineA', 'fGenre')).toEqual([])
    expect(valuesIn(synced, 'lineA', 'fPlain')).toHaveLength(1)
  })

  it('writes no free value into a choice field', () => {
    const nodes = world()
    expect(addValue(nodes, 'cat', 'fGenre', makeId).id).toBeNull()
    expect(addValue(nodes, 'lineA', 'fGenre', makeId).id).toBeNull()
    expect(addValue(nodes, 'lineA', 'fPlain', makeId).id).not.toBeNull()
  })

  it('moves neither an answer, nor a value into a choice field', () => {
    let nodes = [...world(), node('own', 'plotpoint', 'lineA', { fieldId: 'fPlain', title: 'A beat' })]
    nodes = [...nodes.slice(0, 3), node('lineAField', 'plotline', 'cat', { order: 2, customFieldDefs: [{ id: 'fOwn', name: 'Own' }, { id: 'fOwnMotto', name: 'Own motto', kind: 'text' }] }), ...nodes.slice(3)]
    nodes = [...nodes, node('mine', 'plotpoint', 'lineAField', { fieldId: 'fOwn', title: 'Mine' })]
    const index = new Map(nodes.map(n => [n.id, n]))
    expect(canMoveValue(find(nodes, 'mine'), 'fOwnMotto', index, outlineById)).toBe(false)
    nodes = setTextAnswer(nodes, 'lineAField', 'fOwnMotto', 'Text', makeId)
    const answer = answersOf(nodes, 'lineAField', 'fOwnMotto')[0]
    const index2 = new Map(nodes.map(n => [n.id, n]))
    expect(canMoveValue(answer, 'fOwn', index2, outlineById)).toBe(false)
    nodes = toggleOption(nodes, 'lineA', 'fGenre', 'o1', true, makeId)
    const tick = answersOf(nodes, 'lineA', 'fGenre')[0]
    expect(canMoveValue(tick, 'fOwn', new Map(nodes.map(n => [n.id, n])), outlineById)).toBe(false)
  })

  it('keeps a placed answer as a plain value when its field goes, without the option; the unplaced ones go', () => {
    let nodes = toggleOption(world(), 'lineA', 'fGenre', 'o1', true, makeId)
    nodes = toggleOption(nodes, 'lineA', 'fGenre', 'o2', true, makeId)
    nodes = toggleOption(nodes, 'cat', 'fGenre', 'o3', true, makeId)
    const placed = answersOf(nodes, 'lineA', 'fGenre')[0]
    nodes = placeValue(nodes, placed.id, 'ch1', outlineById)
    nodes = deleteField(nodes, 'cat', 'fGenre', outlineById, makeId)
    const kept = find(nodes, placed.id)
    expect(kept).toMatchObject({ title: 'Fantasy', optionId: null })
    expect(kept.placements).toHaveLength(1)
    const field = find(nodes, 'lineA').customFieldDefs.find(d => d.id === kept.fieldId)!
    expect(field).toMatchObject({ name: 'Genre' })
    expect(isChoice(field)).toBe(false)
    expect(nodes.filter(n => n.kind === 'plotpoint' && n.parentId === 'lineA')).toHaveLength(1)
    expect(nodes.filter(n => n.optionId).length).toBe(0)
  })

  it('does not put a kept value into a choice field of the same name', () => {
    let nodes = world()
    nodes = [...nodes.slice(0, 2), node('lineC', 'plotline', 'cat', { order: 3, customFieldDefs: [{ id: 'fSame', name: 'Genre', kind: 'text' }] }), ...nodes.slice(2)]
    nodes = toggleOption(nodes, 'lineC', 'fGenre', 'o1', true, makeId)
    const placed = answersOf(nodes, 'lineC', 'fGenre')[0]
    nodes = placeValue(nodes, placed.id, 'ch1', outlineById)
    nodes = deleteField(nodes, 'cat', 'fGenre', outlineById, makeId)
    const kept = find(nodes, placed.id)
    expect(kept.fieldId).not.toBe('fSame')
    expect(isChoice(find(nodes, 'lineC').customFieldDefs.find(d => d.id === kept.fieldId)!)).toBe(false)
  })
})

describe('repairing a stored plot', () => {
  const chosen = (over: Partial<PlotNode>) => node('a', 'plotpoint', 'lineA', { fieldId: 'fGenre', optionId: 'o1', title: 'Fantasy', ...over })

  it('leaves a sound plot as it is (the same array)', () => {
    const nodes = [...world(), chosen({}), node('b', 'plotpoint', 'lineA', { fieldId: 'fTone', optionId: 't1', title: 'Dark' })]
    expect(repairChoices(nodes)).toBe(nodes)
    // the server writes the usual field with no kind and an empty list of options
    const usual = [node('c', 'category', null, { customFieldDefs: [{ id: 'f', name: 'F', kind: null, options: [] }] })]
    expect(repairChoices(usual)).toBe(usual)
  })

  it('drops an answer that names an option its field does not have, and a repeat of one', () => {
    const nodes = [...world(), chosen({}), chosen({ id: 'again' }), chosen({ id: 'lost', optionId: 'gone' }), chosen({ id: 'second-tone', fieldId: 'fTone', optionId: 't1' }), chosen({ id: 'third-tone', fieldId: 'fTone', optionId: 't2' })]
    const repaired = repairChoices(nodes)
    expect(repaired.filter(n => n.kind === 'plotpoint').map(n => n.id)).toEqual(['a', 'second-tone'])
  })

  it('titles an answer with its option\'s label, and a text answer has no option', () => {
    const nodes = [
      ...world(), chosen({ title: 'old label' }),
      node('t', 'plotpoint', 'lineA', { fieldId: 'fMotto', title: 'Never', optionId: 'o1' }),
      node('t2', 'plotpoint', 'lineA', { fieldId: 'fMotto', title: 'Twice' }),
    ]
    const repaired = repairChoices(nodes)
    expect(find(repaired, 'a').title).toBe('Fantasy')
    expect(find(repaired, 't').optionId).toBeNull()
    expect(repaired.some(n => n.id === 't2')).toBe(false)
  })

  it('takes a stray option off a plotpoint in a plain field', () => {
    const nodes = [...world(), node('p', 'plotpoint', 'lineA', { fieldId: 'fPlain', title: 'Beat', optionId: 'o1' })]
    expect(find(repairChoices(nodes), 'p').optionId).toBeNull()
  })

  it('cleans a field\'s options: a blank label, a repeated id and the surplus go, a long label is cut, and a kind it does not know is dropped', () => {
    const options = [
      { id: 'o1', label: '  Fantasy ' }, { id: 'o1', label: 'again' }, { id: 'o2', label: '   ' }, { id: '', label: 'No id' },
      ...Array.from({ length: MAX_OPTIONS + 3 }, (_, i) => ({ id: `x${i}`, label: `Option ${i}` })),
    ]
    const nodes = [
      node('cat', 'category', null, { customFieldDefs: [
        { id: 'f1', name: 'Genre', kind: 'multi', options }, { id: 'f2', name: 'Odd', kind: 'radio' as never, options: [{ id: 'z', label: 'z' }] },
        { id: 'f3', name: 'Text', kind: 'text', options: [{ id: 'z', label: 'z' }] },
      ] }),
    ]
    const defs = repairChoices(nodes)[0].customFieldDefs
    expect(defs[0].options).toHaveLength(MAX_OPTIONS)
    expect(defs[0].options![0]).toEqual({ id: 'o1', label: 'Fantasy' })
    expect(defs[1].kind).toBeUndefined()
    expect(defs[1].options).toEqual([])
    expect(defs[2].options).toEqual([])
  })

  it('is part of migrating a plot: it is idempotent, and a second pass changes nothing', () => {
    const nodes = [...world(), chosen({}), chosen({ id: 'lost', optionId: 'gone' }), chosen({ id: 'ref', fieldId: 'fPlain', optionId: null, title: 'Beat' })]
    const once = migratePlot(nodes, outline, makeId)
    expect(once.some(n => n.id === 'lost')).toBe(false)
    expect(find(once, 'a').optionId).toBe('o1')
    expect(JSON.stringify(migratePlot(once, outline, makeId))).toBe(JSON.stringify(once))
  })
})
