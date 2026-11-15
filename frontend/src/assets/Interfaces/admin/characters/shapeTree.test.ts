import { describe, expect, it } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { addGroup, addObject, addShape, blankContent, newGroup } from './modelContent'
import { dropRule, isExpanded, pathTo, storedSpot, zoneSearchHits } from './treeNav'

// The shape editor's tree (Z2), its pure side: which cards a selection opens, what is expanded by default, where a dropped card lands in the stored order, and search with zones.

function model(): ModelContent {
  let c = addGroup(blankContent('T'), newGroup('g1', 'Arm'))
  c = addObject(c, 'g1', { id: 'o1', name: 'Hand', layer: 'body', shapes: [] })
  c = addShape(c, 'o1', { id: 's1', name: 'Palm', closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: [] })
  return { ...c, zones: [{ id: 'zl', name: 'Legs', groups: [] }, { id: 'za', name: 'Arms', groups: ['g1'] }] }
}

describe('the way down to a selection', () => {
  it('is the zone, group and object a shape is in, and the shape for a point', () => {
    const c = model()
    expect(pathTo(c, { kind: 'shape', id: 's1' })).toEqual(['za', 'g1', 'o1'])
    expect(pathTo(c, { kind: 'shape', id: 's1' }, true)).toEqual(['za', 'g1', 'o1', 's1'])
    expect(pathTo(c, { kind: 'object', id: 'o1' })).toEqual(['za', 'g1'])
    expect(pathTo(c, { kind: 'group', id: 'g1' })).toEqual(['za'])
    expect(pathTo(c, { kind: 'zone', id: 'za' })).toEqual([])
    expect(pathTo(c, { kind: 'none', id: '' })).toEqual([])
  })
})

describe('expanded cards', () => {
  it('are the model and the zones unless closed, the rest when opened', () => {
    expect(isExpanded('zone', 'za', {})).toBe(true)
    expect(isExpanded('model', 'm', {})).toBe(true)
    expect(isExpanded('group', 'g1', {})).toBe(false)
    expect(isExpanded('zone', 'za', { za: false })).toBe(false)
    expect(isExpanded('shape', 's1', { s1: true })).toBe(true)
  })
})

describe('a dragged card', () => {
  it('lands beside one of its kind and into one of the level above', () => {
    expect(dropRule('shape', 'shape')).toBe('beside')
    expect(dropRule('shape', 'object')).toBe('into')
    expect(dropRule('object', 'group')).toBe('into')
    expect(dropRule('group', 'zone')).toBe('into')
    expect(dropRule('zone', 'zone')).toBe('beside')
    expect(dropRule('shape', 'group')).toBeNull()
    expect(dropRule('group', 'shape')).toBeNull()
  })

  it('goes where it is shown in the stored order (back to front, shown reversed)', () => {
    // stored [a, b, c] is shown c, b, a
    const stored = ['a', 'b', 'c']
    // shown after b (between b and a): stored before b
    expect(storedSpot(stored, 'c', 'b', 'after')).toBe('b')
    // shown before b (between c and b): stored after b, before c
    expect(storedSpot(stored, 'a', 'b', 'before')).toBe('c')
    // shown before the topmost: last in the stored order
    expect(storedSpot(stored, 'a', 'c', 'before')).toBeNull()
    // into a parent: on top of its children
    expect(storedSpot(stored, 'x', null, 'into')).toBeNull()
    // the moving one is left out of the count
    expect(storedSpot(stored, 'b', 'a', 'before')).toBe('c')
  })
})

describe('search', () => {
  it('finds zones and lists what lies in them', () => {
    const c = model()
    expect(zoneSearchHits(c, 'arm').map(h => [h.kind, h.name, h.crumbs])).toEqual([['zone', 'Arms', ''], ['group', 'Arm', 'Arms']])
    expect(zoneSearchHits(c, 'palm')[0]).toEqual({ kind: 'shape', id: 's1', name: 'Palm', crumbs: 'Arms › Arm › Hand' })
  })
})
