import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { LIMITS } from './engine/limits'
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
  c = addGroup(c, { id: 'g1', name: 'Head', parent: null, objects: [], pivot: null, attach: null })
  c = addGroup(c, { id: 'g2', name: 'Torso', parent: null, objects: [], pivot: null, attach: null })
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
    c = addGroup(c, { id: 'g3', name: 'Sub', parent: 'g2', objects: [], pivot: null, attach: null })
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

describe('what publishing checks about the rig (the server says the same words)', () => {
  const g = (id: string, parent: string | null, objects: string[], over: Partial<ModelContent['groups'][number]> = {}) => ({ id, name: id, parent, objects, pivot: null, attach: null, ...over })
  const drive = (over: Partial<ModelContent['ranges'][number]['drives'][number]>) => ({ kind: 'turn' as const, group: null, target: null, id: null, axis: 'xy' as const, shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...over })
  const range = (drives: ModelContent['ranges'][number]['drives']) => ({ id: 'r1', name: 'Tilt', scope: null, min: -20, rest: 0, max: 20, unit: '°' as const, show: true, rand: null, drives })
  // shapes s1 (head, in group g1) and s2 (chest, in group g2): g1 hangs from g2
  const rigged = (over: Partial<ModelContent> = {}): ModelContent => ({ ...sample(), groups: [g('g1', 'g2', ['o1']), g('g2', null, ['o2', 'o3'])], ...over })

  it('passes a rigged model', () => {
    const c = rigged({ ranges: [range([drive({ kind: 'turn', group: 'g1', atMin: -10, atMax: 10 })])] })
    c.groups[0] = g('g1', 'g2', ['o1'], { pivot: [100, 40], attach: { shape: 's2', kind: 'point', i: 0, t: 0, slider: null, rx: 0.5, ry: 0.5 } })
    expect(publishFaults(c)).toEqual([])
  })
  it('refuses a pivot chain deeper than the limit and allows one as deep as it', () => {
    const chain = (n: number): ModelContent => ({ ...sample(), groups: Array.from({ length: n }, (_, i) => g(`c${i}`, i ? `c${i - 1}` : null, i ? [] : ['o1', 'o2', 'o3'])) })
    expect(publishFaults(chain(LIMITS.chainMax))).toEqual([])
    expect(publishFaults(chain(LIMITS.chainMax + 1)).join(' ')).toMatch(new RegExp(`${LIMITS.chainMax + 1} levels deep; a pivot chain may have at most ${LIMITS.chainMax}`))
  })
  it('says what is wrong with an anchor', () => {
    const attach = (a: Partial<NonNullable<ModelContent['groups'][number]['attach']>>, parent: string | null = 'g2'): ModelContent => {
      const c = rigged()
      c.groups[0] = g('g1', parent, ['o1'], { attach: { shape: 's2', kind: 'point', i: 0, t: 0, slider: null, rx: 0.5, ry: 0.5, ...a } })
      return c
    }
    const said = (c: ModelContent) => publishFaults(c).join(' ')
    expect(said(attach({ shape: 'gone' }))).toMatch(/attached to a shape that does not exist/)
    expect(said(attach({ shape: 's1' }))).toMatch(/not in its parent group or one above it/)
    expect(said(attach({}, null))).toMatch(/has no parent group/)
    expect(said(attach({ i: 30 }))).toMatch(/attached to a point that does not exist/)
    expect(said(attach({ kind: 'edge', i: 30 }))).toMatch(/attached to an edge that does not exist/)
    expect(said(attach({ kind: 'range', slider: 'nope' }))).toMatch(/attached along a slider that does not exist/)
    expect(said(attach({ kind: 'range', i: 1, slider: 'r1' }))).toMatch(/slider that does not exist/)   // r1 is not in this content
  })
  it('says what is wrong with a slider', () => {
    const said = (d: ModelContent['ranges'][number]['drives'][number]) => publishFaults(rigged({ ranges: [range([d])] })).join(' ')
    expect(said(drive({ kind: 'turn', group: 'gone' }))).toMatch(/Tilt turns a group that does not exist/)
    expect(said(drive({ kind: 'scale', target: 'shape', id: 'gone', atMin: 100, atMax: 120 }))).toMatch(/scales something that does not exist/)
    expect(said(drive({ kind: 'scale', target: 'group', id: 's1', atMin: 100, atMax: 120 }))).toMatch(/scales something that does not exist/)
    expect(said(drive({ kind: 'bend', shape: 'gone' }))).toMatch(/moves a shape that does not exist/)
    expect(said(drive({ kind: 'points', shape: 's1', moves: [{ i: 9, dx: 1, dy: 0, dxMin: 0, dyMin: 0 }] }))).toMatch(/moves a point of Skull that is no longer there/)
    expect(said(drive({ kind: 'scale', target: 'model', atMin: 100, atMax: 110 }))).toBe('')
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
