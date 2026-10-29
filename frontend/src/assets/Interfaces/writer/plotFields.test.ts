import { describe, expect, it } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../api/types'
import {
  BODY_MAX, DEFAULT_FIELD_NAME, FIELDSET_NAME_MAX, MAX_FIELDSETS, SCRAP_FIELD_NAME, TITLE_MAX, addField, addFieldset, addValue, assignPoint,
  canMoveValue, deleteField, deleteFieldset, deleteValue, fieldGroups, fieldLayout, fieldsInOrder, migratePlot, moveField, moveFieldset, moveValue,
  orderValues, renameField, renameFieldset, scopeLayouts, scrapFieldId, setFieldSet, syncReferences, textOf, updateValue, valuesIn,
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

describe('a cluster\'s fields', () => {
  // A subcategory holding a cluster with a "Motive" field (one value); a plotline inside it, and one beside it.
  function clustered(): PlotNode[] {
    return syncReferences([
      node('cat', 'category', null),
      node('sub', 'subcategory', 'cat'),
      node('clu', 'cluster', 'sub', { customFieldDefs: [{ id: 'fMotive', name: 'Motive' }] }),
      node('mv', 'plotpoint', 'clu', { title: 'Greed', fieldId: 'fMotive' }),
      node('inside', 'plotline', 'clu'),
      node('beside', 'plotline', 'sub', { order: 1 }),
    ], outlineById, makeId)
  }

  it('shows a cluster\'s values only on the plotlines under it, in a group of their own', () => {
    const nodes = clustered()
    expect(valuesIn(nodes, 'inside', 'fMotive')).toHaveLength(1)
    expect(valuesIn(nodes, 'beside', 'fMotive')).toHaveLength(0)
    const groups = fieldGroups(find(nodes, 'inside'), new Map(nodes.map(n => [n.id, n])))
    expect(groups.cluster.map(g => g.def.name)).toEqual(['Motive'])
    expect(groups.cluster[0].scope).toBe('cluster')
  })

  it('keeps the assigned references when the cluster\'s field is deleted, and drops the rest', () => {
    let nodes = clustered()
    const ref = valuesIn(nodes, 'inside', 'fMotive')[0]
    nodes = nodes.map(n => (n.id === ref.id ? { ...n, assignedMomentId: 'ch1' } : n))
    nodes = deleteField(nodes, 'clu', 'fMotive', outlineById, makeId)
    expect(find(nodes, 'clu').customFieldDefs).toEqual([])
    expect(nodes.some(n => n.id === 'mv')).toBe(false)
    const kept = nodes.filter(n => n.kind === 'plotpoint' && n.parentId === 'inside')
    expect(kept).toHaveLength(1)
    expect(kept[0].title).toBe('Greed')
    expect(kept[0].refId).toBeNull()
  })
})

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


describe('fieldsets', () => {
  const names = (defs: Array<{ name: string }>) => defs.map(d => d.name)
  // A category with the fields Hair, Eyes, Motto and Home, and the sets Looks and Past (empty at first).
  function cast(): PlotNode[] {
    return [node('cat', 'category', null, {
      customFieldDefs: [{ id: 'hair', name: 'Hair' }, { id: 'eyes', name: 'Eyes' }, { id: 'motto', name: 'Motto' }, { id: 'home', name: 'Home' }],
      customFieldSets: [{ id: 'looks', name: 'Looks' }, { id: 'past', name: 'Past' }],
    })]
  }
  const layout = (nodes: PlotNode[]) => fieldLayout(find(nodes, 'cat'))

  it("makes a set after another, cuts its name to the limit, and refuses more than the most", () => {
    let nodes = [node('cat', 'category', null)]
    const first = addFieldset(nodes, 'cat', 'X'.repeat(FIELDSET_NAME_MAX + 9), makeId)
    expect(find(first.nodes, 'cat').customFieldSets![0].name).toHaveLength(FIELDSET_NAME_MAX)
    nodes = first.nodes
    nodes = addFieldset(nodes, 'cat', 'Last', makeId).nodes
    const between = addFieldset(nodes, 'cat', 'Between', makeId, first.id!)
    expect(names(find(between.nodes, 'cat').customFieldSets!).slice(1)).toEqual(['Between', 'Last'])
    let full = [node('cat', 'category', null)]
    for (let i = 0; i < MAX_FIELDSETS; i += 1) full = addFieldset(full, 'cat', `Set ${i}`, makeId).nodes
    expect(addFieldset(full, 'cat', 'One too many', makeId)).toEqual({ nodes: full, id: null })
    expect(addFieldset([node('pp', 'plotpoint', null)], 'pp', 'No', makeId).id).toBeNull()
  })

  it("lists a node's loose fields first, then each set with its fields, then Scrap; a field in a set that is gone is loose", () => {
    let nodes = cast()
    nodes = setFieldSet(nodes, 'cat', 'eyes', 'looks')
    nodes = setFieldSet(nodes, 'cat', 'hair', 'looks')
    nodes = setFieldSet(nodes, 'cat', 'home', 'past')
    const l = layout(nodes)
    expect(names(l.loose)).toEqual(['Motto'])
    expect(l.sets.map(s => [s.set.name, names(s.fields)])).toEqual([['Looks', ['Eyes', 'Hair']], ['Past', ['Home']]]) // in the order they were put in
    expect(names(fieldsInOrder(find(nodes, 'cat')))).toEqual(['Motto', 'Eyes', 'Hair', 'Home'])
    // A set that is not the node's own: the field is loose.
    const stray = [node('cat', 'category', null, { customFieldDefs: [{ id: 'a', name: 'A', setId: 'nope' }] })]
    expect(names(layout(stray).loose)).toEqual(['A'])
    // Scrap stays last, outside the sets.
    const line = node('line', 'plotline', null, { customFieldDefs: [{ id: scrapFieldId('line'), name: SCRAP_FIELD_NAME }, { id: 'own', name: 'Own' }] })
    expect(fieldLayout(line).scrap?.name).toBe(SCRAP_FIELD_NAME)
    expect(names(fieldsInOrder(line))).toEqual(['Own', SCRAP_FIELD_NAME])
  })

  it("puts a field into a set, out of it, and between sets: it is in one set at most", () => {
    let nodes = cast()
    nodes = setFieldSet(nodes, 'cat', 'hair', 'looks')
    expect(find(nodes, 'cat').customFieldDefs.find(d => d.id === 'hair')!.setId).toBe('looks')
    nodes = setFieldSet(nodes, 'cat', 'hair', 'past')
    expect(names(layout(nodes).sets[0].fields)).toEqual([])
    expect(names(layout(nodes).sets[1].fields)).toEqual(['Hair'])
    nodes = setFieldSet(nodes, 'cat', 'hair', null)
    expect(names(layout(nodes).loose)).toContain('Hair')
    // A loose field is a plain { id, name }: no setId key is left behind.
    expect(find(nodes, 'cat').customFieldDefs.find(d => d.id === 'hair')).toEqual({ id: 'hair', name: 'Hair' })
  })

  it("puts a field at the end of a set, or before a field in it, and leaves one dropped on its own set where it is", () => {
    let nodes = cast()
    nodes = setFieldSet(nodes, 'cat', 'hair', 'looks')
    nodes = setFieldSet(nodes, 'cat', 'eyes', 'looks')
    nodes = setFieldSet(nodes, 'cat', 'motto', 'looks', 'hair') // before Hair
    expect(names(layout(nodes).sets[0].fields)).toEqual(['Motto', 'Hair', 'Eyes'])
    const same = setFieldSet(nodes, 'cat', 'hair', 'looks')
    expect(find(same, 'cat')).toBe(find(nodes, 'cat')) // already in it: not moved to the end
  })

  it("refuses a set the node does not have, a field it does not have, and Scrap", () => {
    const nodes = cast()
    expect(setFieldSet(nodes, 'cat', 'hair', 'unknown')).toEqual(nodes)
    expect(setFieldSet(nodes, 'cat', 'unknown', 'looks')).toEqual(nodes)
    const line = [node('line', 'plotline', null, { customFieldDefs: [{ id: scrapFieldId('line'), name: SCRAP_FIELD_NAME }], customFieldSets: [{ id: 's', name: 'S' }] })]
    expect(setFieldSet(line, 'line', scrapFieldId('line'), 's')).toEqual(line)
  })

  it("moves a field before another and takes that field's set; moved last it keeps its own", () => {
    let nodes = cast()
    nodes = setFieldSet(nodes, 'cat', 'eyes', 'looks')
    nodes = moveField(nodes, 'cat', 'motto', 'eyes')
    expect(find(nodes, 'cat').customFieldDefs.find(d => d.id === 'motto')!.setId).toBe('looks')
    nodes = moveField(nodes, 'cat', 'motto', 'home') // before a loose field: loose
    expect(find(nodes, 'cat').customFieldDefs.find(d => d.id === 'motto')!.setId).toBeUndefined()
    nodes = setFieldSet(nodes, 'cat', 'hair', 'past')
    nodes = moveField(nodes, 'cat', 'hair', null) // last, still in Past
    expect(find(nodes, 'cat').customFieldDefs.at(-1)).toMatchObject({ id: 'hair', setId: 'past' })
  })

  it("makes a new field in a set: at its end, or next to a field in it", () => {
    let nodes = cast()
    nodes = setFieldSet(nodes, 'cat', 'hair', 'looks')
    nodes = setFieldSet(nodes, 'cat', 'eyes', 'looks')
    const atEnd = addField(nodes, 'cat', 'Skin', makeId, undefined, 'looks')
    expect(names(layout(atEnd.nodes).sets[0].fields)).toEqual(['Hair', 'Eyes', 'Skin'])
    const next = addField(nodes, 'cat', 'Scar', makeId, 'hair') // Enter on a field name: the next one joins its set
    expect(names(layout(next.nodes).sets[0].fields)).toEqual(['Hair', 'Scar', 'Eyes'])
    const loose = addField(nodes, 'cat', 'Plain', makeId, 'hair', null)
    expect(names(layout(loose.nodes).loose)).toContain('Plain')
    const unknown = addField(nodes, 'cat', 'Odd', makeId, undefined, 'unknown')
    expect(names(layout(unknown.nodes).loose)).toContain('Odd')
  })

  it("deletes a set and keeps its fields, loose, in the order they had; renames and reorders sets", () => {
    let nodes = cast()
    nodes = setFieldSet(nodes, 'cat', 'hair', 'looks')
    nodes = setFieldSet(nodes, 'cat', 'eyes', 'looks')
    nodes = deleteFieldset(nodes, 'cat', 'looks')
    expect(find(nodes, 'cat').customFieldSets!.map(s => s.id)).toEqual(['past'])
    expect(names(layout(nodes).loose)).toEqual(['Hair', 'Eyes', 'Motto', 'Home'])
    expect(deleteFieldset(nodes, 'cat', 'looks')).toEqual(nodes)

    nodes = renameFieldset(nodes, 'cat', 'past', 'P'.repeat(FIELDSET_NAME_MAX + 5))
    expect(find(nodes, 'cat').customFieldSets![0].name).toHaveLength(FIELDSET_NAME_MAX)
    nodes = addFieldset(nodes, 'cat', 'Later', makeId).nodes
    const later = find(nodes, 'cat').customFieldSets![1].id
    nodes = moveFieldset(nodes, 'cat', later, 'past')
    expect(find(nodes, 'cat').customFieldSets!.map(s => s.id)).toEqual([later, 'past'])
    nodes = moveFieldset(nodes, 'cat', later, null)
    expect(find(nodes, 'cat').customFieldSets!.map(s => s.id)).toEqual(['past', later])
  })

  it("keeps a set when its last field is deleted", () => {
    let nodes = cast()
    nodes = setFieldSet(nodes, 'cat', 'hair', 'looks')
    nodes = deleteField(nodes, 'cat', 'hair', outlineById, makeId)
    expect(find(nodes, 'cat').customFieldSets!.map(s => s.id)).toEqual(['looks', 'past'])
  })

  it("shows a plotline the sets of the nodes above it, with where they come from, and its own sets", () => {
    let nodes = [
      node('cat', 'category', null, { customFieldDefs: [{ id: 'hair', name: 'Hair', setId: 'looks' }, { id: 'motto', name: 'Motto' }], customFieldSets: [{ id: 'looks', name: 'Looks' }] }),
      node('sub', 'subcategory', 'cat', { customFieldDefs: [{ id: 'goal', name: 'Goal', setId: 'aims' }], customFieldSets: [{ id: 'aims', name: 'Aims' }] }),
      node('line', 'plotline', 'sub', { customFieldDefs: [{ id: 'own', name: 'Own', setId: 'mine' }, { id: 'free', name: 'Free' }], customFieldSets: [{ id: 'mine', name: 'Mine' }] }),
    ]
    nodes = syncReferences(nodes, outlineById, makeId)
    const index = new Map(nodes.map(n => [n.id, n]))
    const groups = scopeLayouts(find(nodes, 'line'), index)
    expect(groups.category.sets.map(s => [s.set.name, s.owner.id, names(s.fields.map(f => f.def))])).toEqual([['Looks', 'cat', ['Hair']]])
    expect(names(groups.category.loose.map(f => f.def))).toEqual(['Motto'])
    expect(groups.subcategory.sets.map(s => s.set.name)).toEqual(['Aims'])
    expect(groups.plotline.sets.map(s => [s.set.name, names(s.fields.map(f => f.def))])).toEqual([['Mine', ['Own']]])
    expect(names(groups.plotline.loose.map(f => f.def))).toEqual(['Free'])
    expect(groups.category.owners.map(o => o.id)).toEqual(['cat'])
    expect(groups.cluster.owners).toEqual([])
    // A set with no fields in it still belongs to its owner.
    const emptySet = [node('cat', 'category', null, { customFieldSets: [{ id: 's', name: 'Empty' }] }), node('l', 'plotline', 'cat')]
    expect(scopeLayouts(find(emptySet, 'l'), new Map(emptySet.map(n => [n.id, n]))).category.owners.map(o => o.id)).toEqual(['cat'])
  })

  it("makes the references of a field in a set as it does for any field", () => {
    const nodes = syncReferences([
      node('cat', 'category', null, { customFieldDefs: [{ id: 'hair', name: 'Hair', setId: 'looks' }], customFieldSets: [{ id: 'looks', name: 'Looks' }] }),
      node('val', 'plotpoint', 'cat', { title: 'Red', fieldId: 'hair' }),
      node('line', 'plotline', 'cat'),
    ], outlineById, makeId)
    expect(valuesIn(nodes, 'line', 'hair').map(v => v.refId)).toEqual(['val'])
  })

  it("migrates a field that names a set its node does not have to a loose field, and is idempotent", () => {
    const given = [
      node('cat', 'category', null, { customFieldDefs: [{ id: 'a', name: 'A', setId: 'gone' }, { id: 'b', name: 'B', setId: 'kept' }], customFieldSets: [{ id: 'kept', name: 'Kept' }] }),
      node('plain', 'category', null, { order: 1, customFieldDefs: [{ id: 'c', name: 'C' }] }),
    ]
    const once = migratePlot(given, outline, makeId)
    expect(find(once, 'cat').customFieldDefs).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', setId: 'kept' }])
    // A node with no sets stays as it was (no customFieldSets key is made up).
    expect(find(once, 'plain').customFieldSets).toBeUndefined()
    expect(migratePlot(once, outline, makeId)).toEqual(once)
  })
})
