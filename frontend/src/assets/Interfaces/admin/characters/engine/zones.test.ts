import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, blankContent, newGroup, normalizeContent, removeGroup } from '../modelContent'
import { drawOrder } from './order'
import {
  STARTER_ZONES, addZone, ensureZones, moveGroupTo, moveObjectTo, moveShapeTo, moveZone, needsZones, newGroupIn, placeForNew, removeZone, renameZone, starterZones, topZone, zoneOfGroup,
} from './zones'

// Zones (Z2): blocks of the tree above the groups. A model without them gets the starter zones with its groups in Torso, put in the order they were drawn in; a model with
// zones is drawn in the order of its tree alone; cards move across parents; new things go into the selection's object, group or zone, else the top zone.

let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const box = (id: string, z = 40, kind?: ModelShape['kind']): ModelShape => ({
  id, name: id, closed: true, z, op: 1, view: 'both', half: 0, template: null, ...(kind ? { kind } : {}),
  pts: [[0, 0], [10, 0], [10, 10], [0, 10]].map(([x, y]) => ({ x, y, m: 's' as const })),
})
// groups g1 (object o1: a, b) and g2 (object o2: c)
function model(shapes: { a?: number; b?: number; c?: number } = {}): ModelContent {
  let c = addGroup(addGroup(blankContent('Z'), newGroup('g1', 'Arm')), newGroup('g2', 'Leg'))
  c = addObject(c, 'g1', { id: 'o1', name: 'Hand', layer: 'body', shapes: [] })
  c = addObject(c, 'g2', { id: 'o2', name: 'Foot', layer: 'body', shapes: [] })
  c = addShape(addShape(c, 'o1', box('a', shapes.a)), 'o1', box('b', shapes.b))
  return addShape(c, 'o2', box('c', shapes.c))
}
const order = (c: ModelContent) => drawOrder(c).map(s => s.id)
const zoneNames = (c: ModelContent) => (c.zones ?? []).map(z => z.name)
const ok = (e: { ok: boolean; content?: ModelContent; reason?: string }): ModelContent => { if (!e.ok || !e.content) throw new Error(e.reason); return e.content }

describe('starter zones', () => {
  it('are Head, Hair, Torso, Arms and Legs from the top, stored back to front', () => {
    expect(starterZones(make).map(z => z.name)).toEqual([...STARTER_ZONES].reverse())
    expect(new Set(starterZones(make).map(z => z.id)).size).toBe(5)
  })

  it('are given to a model without zones, with every group in Torso, the drawing kept', () => {
    const c = model({ a: 40, b: 10 })
    expect(order(c)).toEqual(['b', 'a', 'c'])
    expect(needsZones(c)).toBe(true)
    const z = ensureZones(c, make)
    expect(zoneNames(z)).toEqual(['Legs', 'Arms', 'Torso', 'Hair', 'Head'])
    expect(z.zones!.find(x => x.name === 'Torso')!.groups).toEqual(['g1', 'g2'])
    // the tree is the order now: b was behind a by its z, so it is put before a in its object
    expect(z.objects.find(o => o.id === 'o1')!.shapes).toEqual(['b', 'a'])
    expect(order(z)).toEqual(['b', 'a', 'c'])
    expect(needsZones(z)).toBe(false)
    expect(ensureZones(z, make)).toBe(z)
  })

  it('put groups in the order their shapes were drawn, leaving shadows and lights out of it', () => {
    // c drawn behind a and b by its z: Leg goes behind Arm
    const z = ensureZones(model({ c: 0 }), make)
    expect(z.zones!.find(x => x.name === 'Torso')!.groups).toEqual(['g2', 'g1'])
    expect(order(z)).toEqual(['c', 'a', 'b'])
    // a light in Arm is drawn last whatever its group, so it does not pull Arm to the front
    let lit = addShape(model({ c: 50 }), 'o1', box('glow', 40, 'light'))
    lit = ensureZones(lit, make)
    expect(lit.zones!.find(x => x.name === 'Torso')!.groups).toEqual(['g1', 'g2'])
    expect(order(lit)).toEqual(['a', 'b', 'c', 'glow'])
  })

  it('take in a group that is in no zone, at the top', () => {
    const z = ensureZones(model(), make)
    const more = addGroup(z, newGroup('g3', 'Tail'))
    expect(needsZones(more)).toBe(true)
    const fixed = ensureZones(more, make)
    expect(topZone(fixed)!.name).toBe('Head')
    expect(zoneOfGroup(fixed, 'g3')!.name).toBe('Head')
  })
})

describe('a model with zones', () => {
  it('is drawn in the order of its tree, whatever the z', () => {
    const z = ensureZones(model(), make)
    const torso = z.zones!.find(x => x.name === 'Torso')!
    const lifted = { ...z, shapes: z.shapes.map(s => (s.id === 'a' ? { ...s, z: -50 } : s)) }
    expect(order(lifted)).toEqual(['a', 'b', 'c'])
    // Leg to the Head zone, which is on top: c drawn last
    expect(order(ok(moveGroupTo(lifted, 'g2', topZone(lifted)!.id, null)))).toEqual(['a', 'b', 'c'])
    // Arm to the Legs zone, at the back: a and b drawn behind c
    const legs = z.zones![0]
    expect(order(ok(moveGroupTo(z, 'g2', legs.id, null)))).toEqual(['c', 'a', 'b'])
    expect(torso.groups).toEqual(['g1', 'g2'])
  })

  it('keeps zones as the server does: no repeated group, no unknown one', () => {
    const z = ensureZones(model(), make)
    const bad = { ...z, zones: [{ id: 'x', name: '  Legs  ', groups: ['g1', 'gone', 'g1'] }, { id: 'y', name: 'Arms', groups: ['g1', 'g2'] }, { id: 'x', name: 'again', groups: [] }] }
    expect(normalizeContent(bad).zones).toEqual([{ id: 'x', name: 'Legs', groups: ['g1'] }, { id: 'y', name: 'Arms', groups: ['g2'] }])
  })

  it('drops a deleted group from its zone', () => {
    const z = ensureZones(model(), make)
    expect(zoneOfGroup(removeGroup(z, 'g1'), 'g1')).toBeUndefined()
    expect(removeGroup(z, 'g1').zones!.find(x => x.name === 'Torso')!.groups).toEqual(['g2'])
  })
})

describe('editing zones', () => {
  it('adds one at the top, renames it, moves it and deletes it with its groups', () => {
    const z = ensureZones(model(), make)
    const added = ok(addZone(z, { id: 'zx', name: 'Tail', groups: [] }))
    expect(topZone(added)!.id).toBe('zx')
    expect(renameZone(added, 'zx', 'Wings').zones!.find(x => x.id === 'zx')!.name).toBe('Wings')
    expect(moveZone(added, 'zx', added.zones![0].id).zones![0].id).toBe('zx')
    const torso = z.zones!.find(x => x.name === 'Torso')!
    const gone = removeZone(z, torso.id)
    expect(gone.zones!.map(x => x.name)).toEqual(['Legs', 'Arms', 'Hair', 'Head'])
    expect(gone.groups).toHaveLength(0)
    expect(gone.objects).toHaveLength(0)
    expect(gone.shapes).toHaveLength(0)
  })

  it('refuses a zone past the limit', () => {
    let c = ensureZones(model(), make)
    for (let i = 0; i < 19; i++) c = ok(addZone(c, { id: `zz${i}`, name: `Zone ${i}`, groups: [] }))
    expect(addZone(c, { id: 'one-more', name: 'More', groups: [] }).ok).toBe(false)
  })
})

describe('moving cards across parents', () => {
  it('puts a group in another zone before a given group', () => {
    const z = ensureZones(model(), make)
    const legs = z.zones![0]
    const moved = ok(moveGroupTo(ok(moveGroupTo(z, 'g1', legs.id, null)), 'g2', legs.id, 'g1'))
    expect(moved.zones![0].groups).toEqual(['g2', 'g1'])
    expect(moved.zones!.find(x => x.name === 'Torso')!.groups).toEqual([])
  })

  it('puts an object in another group, and a shape in another object', () => {
    const z = ensureZones(model(), make)
    const o = ok(moveObjectTo(z, 'o1', 'g2', 'o2'))
    expect(o.groups.find(g => g.id === 'g2')!.objects).toEqual(['o1', 'o2'])
    expect(o.groups.find(g => g.id === 'g1')!.objects).toEqual([])
    const s = ok(moveShapeTo(z, 'a', 'o2', null))
    expect(s.objects.find(x => x.id === 'o2')!.shapes).toEqual(['c', 'a'])
    expect(s.objects.find(x => x.id === 'o1')!.shapes).toEqual(['b'])
    expect(order(s)).toEqual(['b', 'c', 'a'])
    // within its own object a shape only changes place
    expect(ok(moveShapeTo(z, 'b', 'o1', 'a')).objects.find(x => x.id === 'o1')!.shapes).toEqual(['b', 'a'])
  })

  it('refuses what would pass a limit or has nowhere to go', () => {
    const z = ensureZones(model(), make)
    expect(moveObjectTo(z, 'o1', 'g2', null, 1).ok).toBe(false)
    expect(moveShapeTo(z, 'a', 'o2', null, 1).ok).toBe(false)
    expect(moveShapeTo(z, 'a', 'nowhere', null).ok).toBe(false)
    expect(moveGroupTo(z, 'g1', 'nowhere', null).ok).toBe(false)
  })
})

describe('where new things go', () => {
  it('into the selected shape\'s object, the selected object, group or zone, else the top zone', () => {
    const z = ensureZones(model(), make)
    const torso = z.zones!.find(x => x.name === 'Torso')!
    expect(placeForNew(z, { kind: 'shape', id: 'a' })).toEqual({ kind: 'object', id: 'o1' })
    expect(placeForNew(z, { kind: 'object', id: 'o2' })).toEqual({ kind: 'object', id: 'o2' })
    expect(placeForNew(z, { kind: 'group', id: 'g2' })).toEqual({ kind: 'group', id: 'g2' })
    expect(placeForNew(z, { kind: 'zone', id: torso.id })).toEqual({ kind: 'zone', id: torso.id })
    expect(placeForNew(z, { kind: 'none', id: '' })).toEqual({ kind: 'zone', id: topZone(z)!.id })
  })

  it('a new group at the top of its zone', () => {
    const z = ensureZones(model(), make)
    const torso = z.zones!.find(x => x.name === 'Torso')!
    const r = newGroupIn(z, torso.id, make)
    expect(r.content.zones!.find(x => x.id === torso.id)!.groups).toEqual(['g1', 'g2', r.groupId])
    expect(r.content.groups.find(g => g.id === r.groupId)!.name).toBe('Group 3')
  })
})
