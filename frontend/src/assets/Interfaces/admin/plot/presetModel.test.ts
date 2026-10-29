import { describe, expect, it } from 'vitest'
import type { PresetContent, PresetEntry } from '../../../../api/types'
import {
  FIELDS_MAX, ROOT, addCluster, addFieldName, addFieldNameToSet, addFieldset, addKeyword, addSubcategory, blankContent, copyName, countOf, describeChanges,
  findCard, isBlankCard, isEmptyChange, moveBefore, moveCard, moveFieldTo, moveFieldsetTo, moveSetFieldTo, nameTaken, normalizeContent, nudge, publishFaults,
  removeCard, removeFieldAt, removeFieldsetAt, removeKeyword, removeSetFieldAt, renameFieldsetAt, sameContent, siblingIds, statusOf, updateCard, withNewIds,
} from './presetModel'

const content = (over: Partial<PresetContent> = {}): PresetContent => ({
  name: 'Characters', description: 'The cast', keywords: ['cast'], fields: ['Name', 'Role'],
  subcategories: [
    { id: 's1', name: 'Heroes', description: '', keywords: [], fields: ['Want'], clusters: [{ id: 'c1', name: 'Core', description: '', keywords: [], fields: ['Dynamic'] }] },
    { id: 's2', name: 'Villains', description: '', keywords: [], fields: [], clusters: [] },
  ],
  ...over,
})
const entry = (id: string, draft: PresetContent, over: Partial<PresetEntry> = {}): PresetEntry => ({ id, draft, published: null, history: [], nextVersion: 1, ...over })
const published = (c: PresetContent, version = 1) => ({ version, publishedAt: '2026-10-01T00:00:00Z', content: c })

describe('finding cards', () => {
  it('addresses the preset by ROOT and everything else by its id', () => {
    const c = content()
    expect(findCard(c, ROOT)?.kind).toBe('category')
    expect(findCard(c, 's2')).toMatchObject({ kind: 'subcategory', parentId: ROOT })
    expect(findCard(c, 'c1')).toMatchObject({ kind: 'cluster', parentId: 's1' })
    expect(findCard(c, 'nope')).toBeNull()
  })

  it('lists the siblings of a card, and none for the preset itself', () => {
    const c = content()
    expect(siblingIds(c, 's1')).toEqual(['s1', 's2'])
    expect(siblingIds(c, 'c1')).toEqual(['c1'])
    expect(siblingIds(c, ROOT)).toEqual([])
  })

  it('counts subcategories, clusters and fields across the tree', () => {
    expect(countOf(content())).toEqual({ subcategories: 2, clusters: 1, fields: 4, fieldsets: 0 })
    expect(countOf(blankContent())).toEqual({ subcategories: 0, clusters: 0, fields: 0, fieldsets: 0 })
  })

  it('knows a card with nothing in it, nested cards included', () => {
    expect(isBlankCard(blankContent())).toBe(true)
    expect(isBlankCard({ ...blankContent(), name: ' ' })).toBe(true)
    expect(isBlankCard({ ...blankContent(), fields: ['Name'] })).toBe(false)
    expect(isBlankCard(content().subcategories[0])).toBe(false)
    expect(isBlankCard({ ...blankContent(), subcategories: [{ id: 'x', name: '', description: '', keywords: [], fields: [], clusters: [] }] })).toBe(false)
  })
})

describe('normalizeContent', () => {
  it('trims, cuts to the limits, drops blank fields and keywords and merges repeated keywords', () => {
    const out = normalizeContent(content({
      name: `  ${'N'.repeat(60)}  `, description: ` ${'D'.repeat(300)}`, keywords: [' a ', '', 'a', 'b'], fields: [' Name ', '  ', 'F'.repeat(40), 'Name'],
    }))
    expect(out.name).toHaveLength(50)
    expect(out.description).toHaveLength(255)
    expect(out.keywords).toEqual(['a', 'b'])
    expect(out.fields).toEqual(['Name', 'F'.repeat(30), 'Name']) // a field may repeat
  })

  it('keeps a card that has no name yet', () => {
    const out = normalizeContent(content({ subcategories: [{ id: 's', name: ' ', description: '', keywords: [], fields: [], clusters: [] }] }))
    expect(out.subcategories).toHaveLength(1)
    expect(out.subcategories[0].name).toBe('')
  })

  it('compares drafts without regard to stray spaces', () => {
    expect(sameContent(content(), content({ name: ' Characters ', fields: ['Name', ' Role', ''] }))).toBe(true)
    expect(sameContent(content(), content({ description: 'other' }))).toBe(false)
  })
})

describe('editing the card tree', () => {
  it('updates the preset, a subcategory and a cluster in place, without touching the others', () => {
    const c = content()
    expect(updateCard(c, ROOT, { name: 'People' }).name).toBe('People')
    expect(updateCard(c, 's2', { description: 'Bad' }).subcategories[1].description).toBe('Bad')
    const out = updateCard(c, 'c1', { name: 'Inner circle' })
    expect(out.subcategories[0].clusters[0].name).toBe('Inner circle')
    expect(out.subcategories[1]).toBe(c.subcategories[1])
  })

  it('adds a subcategory after a sibling, or last, and a cluster in its subcategory', () => {
    const c = content()
    expect(addSubcategory(c, 'n', 's1').subcategories.map(s => s.id)).toEqual(['s1', 'n', 's2'])
    expect(addSubcategory(c, 'n').subcategories.map(s => s.id)).toEqual(['s1', 's2', 'n'])
    expect(addCluster(c, 's2', 'k').subcategories[1].clusters.map(x => x.id)).toEqual(['k'])
    expect(addCluster(c, 's1', 'k', 'c1').subcategories[0].clusters.map(x => x.id)).toEqual(['c1', 'k'])
    expect(addSubcategory(c, 'n').subcategories[2]).toMatchObject({ name: '', fields: [], clusters: [] })
  })

  it('removes a subcategory with its clusters, or one cluster', () => {
    const c = content()
    expect(removeCard(c, 's1').subcategories.map(s => s.id)).toEqual(['s2'])
    const out = removeCard(c, 'c1')
    expect(out.subcategories[0].clusters).toEqual([])
    expect(out.subcategories).toHaveLength(2)
  })

  it('moves a card before another of its parent, or last, and ignores a move that goes nowhere', () => {
    const c = addCluster(content(), 's1', 'c2')
    expect(moveCard(c, 's2', 's1').subcategories.map(s => s.id)).toEqual(['s2', 's1'])
    expect(moveCard(c, 's1', null).subcategories.map(s => s.id)).toEqual(['s2', 's1'])
    expect(moveCard(c, 'c2', 'c1').subcategories[0].clusters.map(x => x.id)).toEqual(['c2', 'c1'])
    expect(moveCard(c, 's1', 's1')).toBe(c)
    expect(moveCard(c, ROOT, 's1')).toBe(c)
    expect(moveCard(c, 'nope', 's1')).toBe(c)
  })

  it('moves one place at a time for the keyboard', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(nudge(list, 'b', -1).map(x => x.id)).toEqual(['b', 'a', 'c'])
    expect(nudge(list, 'b', 1).map(x => x.id)).toEqual(['a', 'c', 'b'])
    expect(nudge(list, 'a', -1)).toBe(list)
    expect(nudge(list, 'c', 1)).toBe(list)
    expect(moveBefore(list, 'c', 'a').map(x => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('adds and removes keywords, ignoring blanks and repeats', () => {
    const c = content()
    expect(addKeyword(c, ROOT, ' hero ').keywords).toEqual(['cast', 'hero'])
    expect(addKeyword(c, ROOT, 'cast')).toBe(c)
    expect(addKeyword(c, ROOT, '  ')).toBe(c)
    expect(addKeyword(c, 's1', 'lead').subcategories[0].keywords).toEqual(['lead'])
    expect(removeKeyword(c, ROOT, 'cast').keywords).toEqual([])
  })

  it('adds a field name last, removes one by its place and moves one before another', () => {
    const c = content({ fields: ['A', 'B', 'C', 'D'] })
    expect(addFieldName(c, ROOT, ' E ').fields).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(addFieldName(c, ROOT, '')).toBe(c)
    expect(addFieldName(c, 'c1', 'New').subcategories[0].clusters[0].fields).toEqual(['Dynamic', 'New'])
    expect(removeFieldAt(c, ROOT, 1).fields).toEqual(['A', 'C', 'D'])
    expect(moveFieldTo(c, ROOT, 3, 1).fields).toEqual(['A', 'D', 'B', 'C'])
    expect(moveFieldTo(c, ROOT, 0, 3).fields).toEqual(['B', 'C', 'A', 'D'])
    expect(moveFieldTo(c, ROOT, 0, null).fields).toEqual(['B', 'C', 'D', 'A'])
    expect(moveFieldTo(c, ROOT, 2, 2)).toBe(c)
    expect(moveFieldTo(c, ROOT, 9, 0)).toBe(c)
  })
})

describe('the list of presets', () => {
  const entries = [entry('a', content({ name: 'Characters' })), entry('b', content({ name: 'Characters (copy)' })), entry('c', content({ name: '' }))]

  it('finds a name another preset has, without regard to case', () => {
    expect(nameTaken(entries, 'characters')).toBe(true)
    expect(nameTaken(entries, ' CHARACTERS ', 'b')).toBe(true)
    expect(nameTaken(entries, 'Characters', 'a')).toBe(false)
    expect(nameTaken(entries, 'Settings')).toBe(false)
    expect(nameTaken(entries, '')).toBe(false)
  })

  it('makes a copy name that is free and fits the limit', () => {
    expect(copyName('Settings', entries)).toBe('Settings')
    expect(copyName('Characters', entries)).toBe('Characters (copy 2)')
    const long = 'L'.repeat(50)
    const taken = [entry('x', content({ name: long }))]
    const out = copyName(long, taken)
    expect(out).toHaveLength(50)
    expect(out.endsWith(' (copy)')).toBe(true)
    expect(copyName('   ', [])).toBe('Preset')
  })

  it('gives a duplicate new ids on every subcategory and cluster, and keeps the rest', () => {
    let n = 0
    const out = withNewIds(content(), prefix => `${prefix}-${(n += 1)}`)
    expect(out.subcategories.map(s => s.id)).toEqual(['sub-1', 'sub-3'])
    expect(out.subcategories[0].clusters[0].id).toBe('cluster-2')
    expect(out.subcategories[0].name).toBe('Heroes')
  })
})

describe('where a preset stands', () => {
  it('is never published, live, pending changes, or unpublished', () => {
    expect(statusOf(entry('a', content()))).toBe('never')
    expect(statusOf(entry('a', content(), { published: published(content()) }))).toBe('live')
    expect(statusOf(entry('a', content({ description: 'edited' }), { published: published(content()) }))).toBe('pending')
    expect(statusOf(entry('a', content(), { history: [published(content())] }))).toBe('off')
  })

  it('does not count a stray space as a change', () => {
    expect(statusOf(entry('a', content({ name: 'Characters ' }), { published: published(content()) }))).toBe('live')
  })
})

describe('publishFaults', () => {
  it('asks for a name on the preset, every subcategory and every cluster', () => {
    expect(publishFaults(content())).toEqual([])
    const c = content({ name: ' ', subcategories: [
      { id: 's1', name: '', description: '', keywords: [], fields: [], clusters: [{ id: 'k1', name: '', description: '', keywords: [], fields: [] }] },
      { id: 's2', name: 'Allies', description: '', keywords: [], fields: [], clusters: [{ id: 'k2', name: '', description: '', keywords: [], fields: [] }] },
    ] })
    expect(publishFaults(c)).toEqual([
      { id: ROOT, message: 'The preset needs a name.' },
      { id: 's1', message: 'Subcategory 1 needs a name.' },
      { id: 'k1', message: 'Cluster 1 in subcategory 1 needs a name.' },
      { id: 'k2', message: 'Cluster 1 in subcategory Allies needs a name.' },
    ])
  })
})

describe('describeChanges', () => {
  it('describes a first publish by what it holds', () => {
    expect(describeChanges(null, content())).toEqual({ added: ['the preset, with 2 subcategories, 1 cluster, 4 fields'], changed: [], removed: [] })
    expect(describeChanges(null, blankContent()).added).toEqual(['the preset'])
    expect(describeChanges(null, content({ subcategories: [], fields: ['Name'] })).added).toEqual(['the preset, with 1 field'])
  })

  it('finds nothing when nothing changed', () => {
    expect(isEmptyChange(describeChanges(content(), content({ name: ' Characters ' })))).toBe(true)
  })

  it('names what changed on the preset itself', () => {
    const out = describeChanges(content(), content({ name: 'People', description: 'x', keywords: ['cast', 'hero'], fields: ['Name', 'Age'] }))
    expect(out.changed).toEqual(['name (Characters to People), description, keywords, fields (1 added, 1 removed)'])
  })

  it('notices a field order change', () => {
    expect(describeChanges(content(), content({ fields: ['Role', 'Name'] })).changed).toEqual(['field order'])
  })

  it('names added, removed and changed subcategories and clusters', () => {
    const before = content()
    const after = content({
      subcategories: [
        { id: 's1', name: 'Heroes', description: 'Those we follow', keywords: [], fields: ['Want'], clusters: [
          { id: 'c1', name: 'Inner circle', description: '', keywords: [], fields: ['Dynamic'] },
          { id: 'c2', name: 'Rivals', description: '', keywords: [], fields: ['Why', 'How'] },
        ] },
        { id: 's3', name: 'Mentors', description: '', keywords: [], fields: ['Lesson', 'Cost', 'Fate'], clusters: [] },
      ],
    })
    expect(describeChanges(before, after)).toEqual({
      added: ['cluster Rivals, 2 fields on it', 'subcategory Mentors, 3 fields on it'],
      changed: ['subcategory Heroes: description', 'cluster Inner circle: name (Core to Inner circle)'],
      removed: ['subcategory Villains'],
    })
  })

  it('notices cards that were only reordered', () => {
    const after = content()
    after.subcategories = [after.subcategories[1], after.subcategories[0]]
    expect(describeChanges(content(), after).changed).toEqual(['subcategory order'])
  })
})

describe('fieldsets', () => {
  const withSets = () => content({ fieldsets: [{ name: 'Look', fields: ['Hair', 'Eyes'] }, { name: 'Mind', fields: ['Fear'] }] })

  it('counts a set\'s fields with the card\'s, and the sets, across the tree', () => {
    const c = withSets()
    c.subcategories[0].clusters[0].fieldsets = [{ name: 'Bond', fields: ['Trust', 'Debt'] }]
    expect(countOf(c)).toEqual({ subcategories: 2, clusters: 1, fields: 9, fieldsets: 3 })
  })

  it('is not blank with a fieldset in it', () => {
    expect(isBlankCard({ ...blankContent(), fieldsets: [{ name: '', fields: [] }] })).toBe(false)
  })

  it('adds an unnamed set last, up to 20, and renames, moves and removes a set by its place', () => {
    let c = addFieldset(content(), ROOT)
    expect(c.fieldsets).toEqual([{ name: '', fields: [] }])
    for (let i = 0; i < 25; i += 1) c = addFieldset(c, ROOT)
    expect(c.fieldsets).toHaveLength(20)

    const d = withSets()
    expect(renameFieldsetAt(d, ROOT, 1, 'Heart').fieldsets?.map(s => s.name)).toEqual(['Look', 'Heart'])
    expect(renameFieldsetAt(d, ROOT, 0, 'L'.repeat(40)).fieldsets?.[0].name).toHaveLength(30)
    expect(moveFieldsetTo(d, ROOT, 1, 0).fieldsets?.map(s => s.name)).toEqual(['Mind', 'Look'])
    expect(moveFieldsetTo(d, ROOT, 0, null).fieldsets?.map(s => s.name)).toEqual(['Mind', 'Look'])
    expect(moveFieldsetTo(d, ROOT, 0, 0)).toBe(d)
    expect(addFieldset(d, 'c1').subcategories[0].clusters[0].fieldsets).toEqual([{ name: '', fields: [] }])
  })

  it('deleting a set keeps its fields, added to the card\'s loose fields', () => {
    const out = removeFieldsetAt(withSets(), ROOT, 0)
    expect(out.fieldsets).toEqual([{ name: 'Mind', fields: ['Fear'] }])
    expect(out.fields).toEqual(['Name', 'Role', 'Hair', 'Eyes'])
    expect(removeFieldsetAt(withSets(), ROOT, 5).fieldsets).toHaveLength(2)
  })

  it('adds, removes and moves the fields of a set, and counts them against the 100 of the card', () => {
    const c = withSets()
    expect(addFieldNameToSet(c, ROOT, 1, ' Hope ').fieldsets?.[1].fields).toEqual(['Fear', 'Hope'])
    expect(addFieldNameToSet(c, ROOT, 9, 'x')).toBe(c)
    expect(addFieldNameToSet(c, ROOT, 0, '  ')).toBe(c)
    expect(removeSetFieldAt(c, ROOT, 0, 0).fieldsets?.[0].fields).toEqual(['Eyes'])
    expect(moveSetFieldTo(c, ROOT, 0, 0, null).fieldsets?.[0].fields).toEqual(['Eyes', 'Hair'])
    expect(moveSetFieldTo(c, ROOT, 0, 1, 0).fieldsets?.[0].fields).toEqual(['Eyes', 'Hair'])
    expect(moveSetFieldTo(c, ROOT, 0, 0, 0)).toBe(c)

    const full = content({ fields: Array.from({ length: FIELDS_MAX - 1 }, (_, i) => `f${i}`), fieldsets: [{ name: 'S', fields: ['one'] }] })
    expect(addFieldName(full, ROOT, 'more')).toBe(full)
    expect(addFieldNameToSet(full, ROOT, 0, 'more')).toBe(full)
  })

  it('cleans sets: names and fields trimmed and cut, a set with neither dropped, one with only fields kept', () => {
    const out = normalizeContent(content({
      fieldsets: [{ name: ` ${'S'.repeat(40)} `, fields: [' a ', '', 'F'.repeat(40)] }, { name: '  ', fields: [] }, { name: '', fields: ['kept'] }],
    }))
    expect(out.fieldsets).toEqual([{ name: 'S'.repeat(30), fields: ['a', 'F'.repeat(30)] }, { name: '', fields: ['kept'] }])
    expect(normalizeContent(content()).fieldsets).toEqual([])
    expect(sameContent(content(), content({ fieldsets: [{ name: ' ', fields: [] }] }))).toBe(true)
  })

  it('refuses to publish an unnamed set that holds fields, on any card', () => {
    const c = content({ fieldsets: [{ name: '', fields: ['a'] }, { name: '', fields: [] }] })
    c.subcategories[0].fieldsets = [{ name: 'Fine', fields: ['x'] }]
    c.subcategories[0].clusters[0].fieldsets = [{ name: ' ', fields: ['y'] }]
    expect(publishFaults(c)).toEqual([
      { id: ROOT, message: 'Fieldset 1 on the preset needs a name.' },
      { id: 'c1', message: 'Fieldset 1 on cluster Core in subcategory Heroes needs a name.' },
    ])
  })

  it('describes a first publish and a change by its fieldsets', () => {
    const c = withSets()
    expect(describeChanges(null, c).added).toEqual(['the preset, with 2 subcategories, 1 cluster, 7 fields, 2 fieldsets'])

    const after = withSets()
    after.fieldsets = [{ name: 'Mind', fields: ['Fear', 'Hope'] }, { name: 'Look', fields: ['Hair', 'Eyes'] }, { name: 'Voice', fields: [] }]
    expect(describeChanges(c, after).changed).toEqual(['fieldsets (1 added), fieldset Mind: fields (1 added), fieldset order'])
    after.fieldsets = [{ name: 'Look', fields: ['Hair'] }]
    expect(describeChanges(c, after).changed).toEqual(['fieldsets (1 removed), fieldset Look: fields (1 removed)'])

    const sub = content()
    sub.subcategories[1].fieldsets = [{ name: 'Menace', fields: ['Plan', 'Weakness'] }]
    expect(describeChanges(content(), sub).changed).toEqual(['subcategory Villains: fieldsets (1 added)'])
    const added = content({ subcategories: [{ ...content().subcategories[0], id: 'new', fieldsets: [{ name: 'A', fields: ['a', 'b'] }] }] })
    expect(describeChanges(content(), added).added).toEqual(['subcategory Heroes, 3 fields and 1 fieldset on it', 'cluster Core, 1 field on it'])
  })
})
