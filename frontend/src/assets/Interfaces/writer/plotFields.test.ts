import { describe, expect, it } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../api/types'
import {
  BODY_MAX, DEFAULT_FIELD_NAME, SCRAP_FIELD_NAME, TITLE_MAX, addField, addValue, assignPoint, canMoveValue, deleteField, deleteValue,
  fieldGroups, migratePlot, moveField, moveValue, orderValues, renameField, scrapFieldId, syncReferences, textOf, updateValue, valuesIn,
} from './plotFields'

let counter = 0
const makeId = (prefix: string) => `${prefix}${(counter += 1)}`

const base = { body: '', assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, fieldId: null, refId: null, awareness: null }
const node = (id: string, kind: PlotNode['kind'], parentId: string | null, over: Partial<PlotNode> = {}): PlotNode =>
  ({ ...base, id, kind, parentId, order: 0, title: id, ...over } as PlotNode)
const out = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)

const outline = [
  out('book', 'book', null), out('ch1', 'chapter', 'book'), out('ch2', 'chapter', 'book', { order: 1 }),
  out('act', 'act', 'ch1'), out('scene', 'scene', 'act'), out('m1', 'moment', 'scene'),
]
const outlineById = new Map(outline.map(n => [n.id, n]))
const ids = (nodes: PlotNode[]) => nodes.map(n => n.id)
const find = (nodes: PlotNode[], id: string) => nodes.find(n => n.id === id)!

// A category with a "Theme" field holding one value, a subcategory, two plotlines.
function world(): PlotNode[] {
  return syncReferences([
    node('cat', 'category', null, { customFieldDefs: [{ id: 'fTheme', name: 'Theme' }] }),
    node('val', 'plotpoint', 'cat', { title: 'Trust', fieldId: 'fTheme' }),
    node('sub', 'subcategory', 'cat'),
    node('lineA', 'plotline', 'sub', { customFieldDefs: [{ id: 'fOwn', name: 'Setback' }] }),
    node('lineB', 'plotline', 'sub', { order: 1 }),
  ], outlineById, makeId)
}

describe('references', () => {
  it('gives every plotline one reference per value defined above it, and the text is the original\'s', () => {
    const nodes = world()
    for (const line of ['lineA', 'lineB']) {
      const refs = valuesIn(nodes, line, 'fTheme')
      expect(refs).toHaveLength(1)
      expect(refs[0].refId).toBe('val')
      expect(textOf(refs[0], new Map(nodes.map(n => [n.id, n])))).toEqual({ title: 'Trust', body: '' })
    }
  })

  it('is idempotent and returns the same array when nothing changes', () => {
    const nodes = world()
    expect(syncReferences(nodes, outlineById, makeId)).toBe(nodes)
  })

  it('gives a plotline made later every reference, and a value added later to every plotline', () => {
    let nodes = [...world(), node('lineC', 'plotline', 'cat', { order: 2 })]
    nodes = syncReferences(nodes, outlineById, makeId)
    expect(valuesIn(nodes, 'lineC', 'fTheme')).toHaveLength(1)
    const added = addValue(nodes, 'cat', 'fTheme', makeId)
    nodes = syncReferences(updateValue(added.nodes, added.id!, { title: 'Loyalty' }), outlineById, makeId)
    for (const line of ['lineA', 'lineB', 'lineC']) expect(valuesIn(nodes, line, 'fTheme')).toHaveLength(2)
  })

  it('is read-only on the plotline: text edits are ignored, and it cannot be deleted there', () => {
    const nodes = world()
    const ref = valuesIn(nodes, 'lineA', 'fTheme')[0]
    expect(updateValue(nodes, ref.id, { title: 'Changed' })).toEqual(nodes)
    expect(deleteValue(nodes, ref.id, outlineById, makeId)).toBe(nodes)
  })

  it('lets a plotline add its own value to an inherited field, next to the reference', () => {
    let nodes = world()
    const added = addValue(nodes, 'lineA', 'fTheme', makeId)
    nodes = updateValue(added.nodes, added.id!, { title: 'Mine' })
    expect(valuesIn(nodes, 'lineA', 'fTheme').map(v => v.refId)).toEqual(['val', null])
    expect(valuesIn(nodes, 'lineB', 'fTheme')).toHaveLength(1)
  })
})

describe('field groups', () => {
  it('lists plotline fields first (Scrap last), then the subcategory\'s, then the category\'s', () => {
    let nodes = world()
    nodes = addField(nodes, 'sub', 'Turning point', makeId).nodes
    nodes = deleteField(addField(nodes, 'lineA', 'Gone', makeId).nodes, 'lineA', 'field' + (counter), outlineById, makeId)
    const index = new Map(nodes.map(n => [n.id, n]))
    const groups = fieldGroups(find(nodes, 'lineA'), index)
    expect(groups.plotline.map(f => f.def.name)).toEqual(['Setback'])
    expect(groups.subcategory.map(f => f.def.name)).toEqual(['Turning point'])
    expect(groups.category.map(f => f.def.name)).toEqual(['Theme'])
  })

  it('renames and reorders fields, keeping Scrap last', () => {
    let nodes = world()
    nodes = addField(nodes, 'lineA', 'Second', makeId).nodes
    const [first, second] = find(nodes, 'lineA').customFieldDefs
    nodes = moveField(nodes, 'lineA', second.id, first.id)
    expect(find(nodes, 'lineA').customFieldDefs.map(d => d.name)).toEqual(['Second', 'Setback'])
    nodes = renameField(nodes, 'lineA', first.id, 'A very long field name that goes past the limit of thirty')
    expect(find(nodes, 'lineA').customFieldDefs.find(d => d.id === first.id)!.name).toHaveLength(30)
  })
})

describe('limits and moving', () => {
  it('keeps a title to 50 characters and a description to 255', () => {
    let nodes = world()
    const added = addValue(nodes, 'lineA', 'fOwn', makeId)
    nodes = updateValue(added.nodes, added.id!, { title: 'x'.repeat(80), body: 'y'.repeat(400) })
    expect(find(nodes, added.id!).title).toHaveLength(TITLE_MAX)
    expect(find(nodes, added.id!).body).toHaveLength(BODY_MAX)
  })

  it('moves an unassigned own value between the plotline\'s own fields only', () => {
    let nodes = addField(world(), 'lineA', 'Other', makeId).nodes
    const other = find(nodes, 'lineA').customFieldDefs[1].id
    const added = addValue(nodes, 'lineA', 'fOwn', makeId)
    nodes = updateValue(added.nodes, added.id!, { title: 'Move me' })
    const index = new Map(nodes.map(n => [n.id, n]))
    expect(canMoveValue(find(nodes, added.id!), other, index, outlineById)).toBe(true)
    expect(moveValue(nodes, added.id!, other, outlineById).find(n => n.id === added.id)!.fieldId).toBe(other)
    // not into an inherited field, not a reference, not once assigned
    expect(canMoveValue(find(nodes, added.id!), 'fTheme', index, outlineById)).toBe(false)
    const ref = valuesIn(nodes, 'lineA', 'fTheme')[0]
    expect(canMoveValue(ref, other, index, outlineById)).toBe(false)
    const placed = assignPoint(nodes, added.id!, 'ch1', outlineById)
    expect(canMoveValue(find(placed, added.id!), other, new Map(placed.map(n => [n.id, n])), outlineById)).toBe(false)
  })
})

describe('ordering', () => {
  it('lists unassigned values first, then the assigned ones by book and chapter', () => {
    let nodes = world()
    const values = ['a', 'b', 'c'].map(t => { const r = addValue(nodes, 'lineA', 'fOwn', makeId); nodes = updateValue(r.nodes, r.id!, { title: t }); return r.id! })
    nodes = assignPoint(assignPoint(nodes, values[0], 'ch2', outlineById), values[2], 'ch1', outlineById)
    const ordered = orderValues(valuesIn(nodes, 'lineA', 'fOwn'), outline, [])
    expect(ordered.map(v => v.title)).toEqual(['b', 'c', 'a'])
  })
})

describe('assignment and awareness', () => {
  const start = () => {
    const r = addValue(world(), 'lineA', 'fOwn', makeId)
    return { nodes: updateValue(r.nodes, r.id!, { title: 'P' }), id: r.id! }
  }

  it('takes a chapter, an act, a scene or a moment, and refuses a book or an unknown target', () => {
    const { nodes, id } = start()
    expect(find(assignPoint(nodes, id, 'ch1', outlineById), id).assignedMomentId).toBe('ch1')
    expect(find(assignPoint(nodes, id, 'act', outlineById), id).assignedMomentId).toBe('act')
    expect(assignPoint(nodes, id, 'book', outlineById)).toBe(nodes)
    expect(assignPoint(nodes, id, 'nope', outlineById)).toBe(nodes)
  })

  it('starts front-stage on a moment, keeps the state between moments, and clears it anywhere else', () => {
    const { nodes, id } = start()
    let next = assignPoint(nodes, id, 'm1', outlineById)
    expect(find(next, id).awareness).toBe('front')
    next = next.map(n => (n.id === id ? { ...n, awareness: 'mid' as const } : n))
    expect(find(assignPoint(next, id, 'm1', outlineById), id).awareness).toBe('mid')
    expect(find(assignPoint(next, id, 'scene', outlineById), id).awareness).toBeNull()
    expect(find(assignPoint(next, id, 'ch1', outlineById), id).awareness).toBeNull()
    expect(find(assignPoint(next, id, null, outlineById), id).awareness).toBeNull()
  })
})

describe('deleting a value', () => {
  it('removes an unassigned own value, never an assigned one', () => {
    const { nodes, id } = (() => { const r = addValue(world(), 'lineA', 'fOwn', makeId); return { nodes: r.nodes, id: r.id! } })()
    expect(find(nodes, id)).toBeDefined()
    expect(deleteValue(nodes, id, outlineById, makeId).some(n => n.id === id)).toBe(false)
    const placed = assignPoint(nodes, id, 'ch1', outlineById)
    expect(deleteValue(placed, id, outlineById, makeId)).toBe(placed)
  })

  it('a category value: unassigned references vanish, assigned ones become the plotline\'s own values in a field of that name', () => {
    let nodes = world()
    const refA = valuesIn(nodes, 'lineA', 'fTheme')[0]
    nodes = assignPoint(nodes, refA.id, 'ch1', outlineById)
    nodes = deleteValue(nodes, 'val', outlineById, makeId)
    expect(nodes.some(n => n.id === 'val')).toBe(false)
    expect(valuesIn(nodes, 'lineB', 'fTheme')).toEqual([])
    const kept = find(nodes, refA.id)
    expect([kept.refId, kept.title, kept.assignedMomentId]).toEqual([null, 'Trust', 'ch1'])
    const field = find(nodes, 'lineA').customFieldDefs.find(d => d.id === kept.fieldId)!
    expect(field.name).toBe('Theme')
    expect(find(nodes, 'lineB').customFieldDefs).toEqual([])
  })
})

describe('deleting a field', () => {
  it('a category field converts every assigned reference and own value, and drops the unassigned ones', () => {
    let nodes = world()
    const refA = valuesIn(nodes, 'lineA', 'fTheme')[0]
    const own = addValue(nodes, 'lineB', 'fTheme', makeId)
    nodes = updateValue(own.nodes, own.id!, { title: 'B own' })
    nodes = assignPoint(assignPoint(nodes, refA.id, 'ch1', outlineById), own.id!, 'ch2', outlineById)
    nodes = deleteField(nodes, 'cat', 'fTheme', outlineById, makeId)
    expect(find(nodes, 'cat').customFieldDefs).toEqual([])
    expect(nodes.some(n => n.id === 'val')).toBe(false)
    const a = find(nodes, refA.id)
    expect([a.refId, a.title]).toEqual([null, 'Trust'])
    expect(find(nodes, 'lineA').customFieldDefs.some(d => d.id === a.fieldId && d.name === 'Theme')).toBe(true)
    const b = find(nodes, own.id!)
    expect(find(nodes, 'lineB').customFieldDefs.some(d => d.id === b.fieldId && d.name === 'Theme')).toBe(true)
    expect(nodes.filter(n => n.refId).length).toBe(0)
  })

  it('a plotline field sends assigned values to Scrap and drops the rest', () => {
    let nodes = world()
    const a = addValue(nodes, 'lineA', 'fOwn', makeId); nodes = updateValue(a.nodes, a.id!, { title: 'placed' })
    const b = addValue(nodes, 'lineA', 'fOwn', makeId); nodes = updateValue(b.nodes, b.id!, { title: 'open' })
    nodes = assignPoint(nodes, a.id!, 'ch1', outlineById)
    nodes = deleteField(nodes, 'lineA', 'fOwn', outlineById, makeId)
    const scrap = scrapFieldId('lineA')
    expect(find(nodes, 'lineA').customFieldDefs).toEqual([{ id: scrap, name: SCRAP_FIELD_NAME }])
    expect(find(nodes, a.id!).fieldId).toBe(scrap)
    expect(nodes.some(n => n.id === b.id)).toBe(false)
  })

  it('never deletes Scrap itself', () => {
    let nodes = world()
    const a = addValue(nodes, 'lineA', 'fOwn', makeId); nodes = assignPoint(a.nodes, a.id!, 'ch1', outlineById)
    nodes = deleteField(nodes, 'lineA', 'fOwn', outlineById, makeId)
    expect(deleteField(nodes, 'lineA', scrapFieldId('lineA'), outlineById, makeId)).toBe(nodes)
  })
})

describe('migration from the old shape', () => {
  const old = () => [
    node('cat', 'category', null, { customFieldDefs: [{ id: 'fOld', name: 'Goal' }] }),
    node('line', 'plotline', 'cat', { customFieldValues: { fOld: 'Win the crown', fBlank: '  ' } }),
    node('free', 'plotpoint', 'line', { title: 'Free point', body: 'z'.repeat(300) }),
    node('mirror', 'plotpoint', 'line', { title: 'Win the crown', sourceFieldId: 'fOld' }),
    node('book1', 'plotpoint', 'line', { title: 'On a book', assignedMomentId: 'book' }),
    node('placed', 'plotpoint', 'line', { title: 'On a moment', assignedMomentId: 'm1' }),
    node('act1', 'plotpoint', 'line', { title: 'On an act', assignedMomentId: 'act' }),
    node('empty', 'plotpoint', 'line', { title: '', body: '' }),
    node('long', 'plotpoint', 'line', { title: 'L'.repeat(90) }),
  ]

  it('moves free plotpoints into a Default plotline field, and old field values into their field', () => {
    const nodes = migratePlot(old(), outline, makeId)
    const defaults = find(nodes, 'line').customFieldDefs.filter(d => d.name === DEFAULT_FIELD_NAME)
    expect(defaults).toHaveLength(1)
    expect(find(nodes, 'free').fieldId).toBe(defaults[0].id)
    // the mirror plotpoint of the old single value is now a value of that field (and no duplicate was made)
    expect(find(nodes, 'mirror').fieldId).toBe('fOld')
    expect(nodes.filter(n => n.title === 'Win the crown')).toHaveLength(1)
    expect(find(nodes, 'line').customFieldValues).toEqual({})
  })

  it('unassigns book-level plotpoints, keeps act and moment placements, and gives a moment its awareness', () => {
    const nodes = migratePlot(old(), outline, makeId)
    expect(find(nodes, 'book1').assignedMomentId).toBeNull()
    expect(find(nodes, 'act1').assignedMomentId).toBe('act')
    expect(find(nodes, 'act1').awareness).toBeNull()
    expect(find(nodes, 'placed').awareness).toBe('front')
  })

  it('keeps to the limits and drops a blank unassigned plotpoint', () => {
    const nodes = migratePlot(old(), outline, makeId)
    expect(find(nodes, 'free').body).toHaveLength(BODY_MAX)
    expect(find(nodes, 'long').title).toHaveLength(TITLE_MAX)
    expect(nodes.some(n => n.id === 'empty')).toBe(false)
  })

  it('turns an old single value that has no mirror into a value', () => {
    const nodes = migratePlot(old().filter(n => n.id !== 'mirror'), outline, makeId)
    const made = nodes.filter(n => n.title === 'Win the crown')
    expect(made).toHaveLength(1)
    expect(made[0].fieldId).toBe('fOld')
  })

  it('drops a field left with no name and no values', () => {
    const nodes = migratePlot([
      node('line', 'plotline', null, { customFieldDefs: [{ id: 'blank', name: '' }, { id: 'kept', name: 'Kept' }] }),
    ], outline, makeId)
    expect(find(nodes, 'line').customFieldDefs.map(d => d.id)).toEqual(['kept'])
  })

  it('is idempotent', () => {
    const once = migratePlot(old(), outline, makeId)
    expect(migratePlot(once, outline, makeId)).toEqual(once)
  })

  it('gives plotlines their references while migrating', () => {
    const nodes = migratePlot([
      node('cat', 'category', null, { customFieldDefs: [{ id: 'f', name: 'Theme' }] }),
      node('v', 'plotpoint', 'cat', { fieldId: 'f', title: 'Trust' }),
      node('line', 'plotline', 'cat'),
    ], outline, makeId)
    expect(valuesIn(nodes, 'line', 'f').map(n => n.refId)).toEqual(['v'])
  })
})

describe('addField and addValue', () => {
  it('adds a field after another, and a value after another in its field', () => {
    let nodes = world()
    nodes = addField(nodes, 'lineA', 'Second', makeId, 'fOwn').nodes
    expect(find(nodes, 'lineA').customFieldDefs.map(d => d.name)).toEqual(['Setback', 'Second'])
    const one = addValue(nodes, 'lineA', 'fOwn', makeId); nodes = updateValue(one.nodes, one.id!, { title: 'one' })
    const two = addValue(nodes, 'lineA', 'fOwn', makeId); nodes = updateValue(two.nodes, two.id!, { title: 'two' })
    const mid = addValue(nodes, 'lineA', 'fOwn', makeId, one.id!); nodes = updateValue(mid.nodes, mid.id!, { title: 'mid' })
    expect(valuesIn(nodes, 'lineA', 'fOwn').map(v => v.title)).toEqual(['one', 'mid', 'two'])
    expect(ids(valuesIn(nodes, 'lineA', 'fOwn'))).toHaveLength(3)
  })
})
