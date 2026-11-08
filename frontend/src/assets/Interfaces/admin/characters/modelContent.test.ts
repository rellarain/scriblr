import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import {
  addGroup, addObject, addShape, blankContent, copyName, duplicateShape, freshId, moveBefore, moveShapeWithin, normalizeContent, objectOfShape, publishFaults, publishState,
  removeGroup, removeObject, removeShape, renameGroup, renameObject, renameShape, treeOf, updateShape,
} from './modelContent'

const shape = (id: string, name = id) => newShape(id, name, 'square', templateBox('square', 100, 100, 20))

// a model with two groups: Head (head object, body layer) and Torso (chest object, body layer; shirt object, clothing layer)
function sample(): ModelContent {
  let c = blankContent('Adult')
  c = addGroup(c, { id: 'g1', name: 'Head', parent: null, objects: [] })
  c = addGroup(c, { id: 'g2', name: 'Torso', parent: null, objects: [] })
  c = addObject(c, 'g1', { id: 'o1', name: 'Head', layer: 'body', shapes: [] })
  c = addObject(c, 'g2', { id: 'o2', name: 'Chest', layer: 'body', shapes: [] })
  c = addObject(c, 'g2', { id: 'o3', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'o1', shape('s1', 'Skull'))
  c = addShape(c, 'o2', shape('s2', 'Chest'))
  c = addShape(c, 'o3', shape('s3', 'Shirt'))
  return c
}

describe('names and ids', () => {
  it('trims and cuts names when a save is prepared', () => {
    const c = normalizeContent({ ...blankContent('  Adult  '), description: ` ${'x'.repeat(500)} `, shapes: [shape('s', '  Head  ')] })
    expect(c.name).toBe('Adult')
    expect(c.description).toHaveLength(400)
    expect(c.shapes[0].name).toBe('Head')
  })
  it('names a copy after the original, and a second copy after that', () => {
    const entries = [{ draft: { name: 'Adult' } }]
    expect(copyName('Child', entries)).toBe('Child')
    expect(copyName('adult', entries)).toBe('adult (copy)')
    expect(copyName('Adult', [...entries, { draft: { name: 'Adult (copy)' } }])).toBe('Adult (copy 2)')
  })
  it('moves an item before another, or to the end', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveBefore(list, 'c', 'a').map(x => x.id)).toEqual(['c', 'a', 'b'])
    expect(moveBefore(list, 'a', null).map(x => x.id)).toEqual(['b', 'c', 'a'])
    expect(moveBefore(list, 'a', 'a')).toBe(list)
    expect(moveBefore(list, 'a', 'zzz')).toBe(list)
  })
  it('makes ids that are not taken', () => {
    const c = sample()
    let n = 0
    const id = freshId(c, 's', () => (n++ < 2 ? 's1' : 's_new'))
    expect(id).toBe('s_new')
  })
})

describe('the tree', () => {
  it('shows the three layers with their groups, objects and shapes', () => {
    const tree = treeOf(sample())
    expect(tree.map(l => l.id)).toEqual(['body', 'clothing', 'hair'])
    const body = tree[0]
    expect(body.groups.map(g => g.group.name)).toEqual(['Head', 'Torso'])
    expect(body.groups[1].objects.map(o => o.object.name)).toEqual(['Chest'])      // the shirt is on the clothing layer
    expect(tree[1].groups[0].objects[0].shapes.map(s => s.name)).toEqual(['Shirt'])
    expect(tree[2].groups).toEqual([])
  })
  it('lists an object that is in no group as loose', () => {
    const c: ModelContent = { ...blankContent('X'), objects: [{ id: 'o', name: 'Lost', layer: 'hair', shapes: [] }] }
    expect(treeOf(c)[2].loose.map(o => o.object.id)).toEqual(['o'])
  })
  it('adds a shape after another in the same object', () => {
    let c = sample()
    c = addShape(c, 'o1', shape('s9'), 's1')
    c = addShape(c, 'o1', shape('s8'), 's1')
    expect(c.objects[0].shapes).toEqual(['s1', 's8', 's9'])
  })
  it('removes a shape from its object, an object with its shapes, a group with everything under it', () => {
    let c = removeShape(sample(), 's2')
    expect(c.shapes.map(s => s.id)).toEqual(['s1', 's3']); expect(c.objects[1].shapes).toEqual([])
    c = removeObject(sample(), 'o2')
    expect(c.shapes.map(s => s.id)).toEqual(['s1', 's3']); expect(c.groups[1].objects).toEqual(['o3'])
    c = removeGroup(sample(), 'g2')
    expect(c.shapes.map(s => s.id)).toEqual(['s1']); expect(c.objects.map(o => o.id)).toEqual(['o1']); expect(c.groups.map(g => g.id)).toEqual(['g1'])
  })
  it('a group under a removed group moves up to its parent', () => {
    let c = sample()
    c = addGroup(c, { id: 'g3', name: 'Sub', parent: 'g2', objects: [] })
    c = removeGroup(c, 'g2')
    expect(c.groups.find(g => g.id === 'g3')?.parent).toBeNull()
  })
  it('renames, updates, duplicates and reorders without touching the original', () => {
    const c = sample()
    expect(renameShape(c, 's1', 'Head').shapes[0].name).toBe('Head')
    expect(renameObject(c, 'o1', 'Face').objects[0].name).toBe('Face')
    expect(renameGroup(c, 'g1', 'Top').groups[0].name).toBe('Top')
    expect(updateShape(c, 's1', s => ({ ...s, op: 0.5 })).shapes[0].op).toBe(0.5)
    expect(c.shapes[0].op).toBe(1)
    const d = duplicateShape(c, 's1', 's1b')
    expect(d.shapes.map(s => s.id)).toEqual(['s1', 's2', 's3', 's1b'])
    expect(objectOfShape(d, 's1b')?.id).toBe('o1')
    expect(d.shapes.find(s => s.id === 's1b')?.name).toBe('Skull (copy)')
    expect(d.shapes.find(s => s.id === 's1b')?.pts).not.toBe(d.shapes[0].pts)
    const e = moveShapeWithin(d, 'o1', 's1b', 's1')
    expect(e.objects[0].shapes).toEqual(['s1b', 's1'])
  })
})

describe('what publishing checks', () => {
  it('passes a complete model', () => {
    expect(publishFaults(sample())).toEqual([])
  })
  it('names what to fix', () => {
    const base = sample()
    expect(publishFaults({ ...base, name: ' ' })[0]).toMatch(/needs a name/)
    expect(publishFaults({ ...base, shapes: [{ ...base.shapes[0], pts: base.shapes[0].pts.slice(0, 2) }, ...base.shapes.slice(1)] }).join()).toMatch(/at least 3 points/)
    expect(publishFaults({ ...base, objects: [{ ...base.objects[0], shapes: ['gone'] }, ...base.objects.slice(1)] }).join()).toMatch(/does not exist/)
    expect(publishFaults({ ...base, objects: [{ ...base.objects[0], shapes: ['s1', 's2'] }, ...base.objects.slice(1)] }).join()).toMatch(/more than one object/)
    expect(publishFaults({ ...base, groups: [{ ...base.groups[0], objects: ['gone'] }, base.groups[1]] }).join()).toMatch(/object that does not exist/)
    expect(publishFaults({ ...base, groups: [{ ...base.groups[0], objects: ['o1', 'o2'] }, base.groups[1]] }).join()).toMatch(/more than one group/)
    expect(publishFaults({ ...base, groups: [{ ...base.groups[0], parent: 'nope' }, base.groups[1]] }).join()).toMatch(/parent that does not exist/)
    expect(publishFaults({ ...base, groups: [{ ...base.groups[0], parent: 'g2' }, { ...base.groups[1], parent: 'g1' }] }).join()).toMatch(/circle/)
  })
  it('refuses a copy over the size limit', () => {
    const big = { ...blankContent('Big'), shapes: Array.from({ length: 120 }, (_, i) => ({ ...shape(`s${i}`, 'x'.repeat(60)), pts: Array.from({ length: 60 }, (_, j) => ({ x: j + 0.123456, y: (j % 9) + 0.654321, m: 'c' as const, hi: [1.123456, 2.123456] as [number, number], ho: [3.123456, 4.123456] as [number, number] })) })) }
    expect(publishFaults(big).join()).toMatch(/KB/)
  })
})

describe('where a model stands', () => {
  const entry = (over: Partial<ModelEntry>): ModelEntry => ({ id: 'm', draft: sample(), published: null, history: [], nextVersion: 1, ...over })
  it('is a draft, published, changed, or unpublished', () => {
    const c = sample()
    expect(publishState(entry({}))).toBe('draft')
    expect(publishState(entry({ published: { version: 1, publishedAt: '', content: c } }))).toBe('published')
    expect(publishState(entry({ published: { version: 1, publishedAt: '', content: { ...c, description: 'older' } } }))).toBe('changed')
    expect(publishState(entry({ history: [{ version: 1, publishedAt: '', content: c }] }))).toBe('unpublished')
  })
})
