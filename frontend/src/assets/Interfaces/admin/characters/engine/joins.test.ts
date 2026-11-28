import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { NO_COLOURING } from './colour'
import { capOf, halfWidthAt, joinOf, joinSets } from './joins'
import { paintShapes } from './paint'
import { makeTwin } from './pairEdit'
import { solve } from './rig'

// Joins (slice 9c): the shapes of a join set are drawn as one outline (a halo under the lowest member, the members' own outlines left out), from behind by the back's
// sets; a joint cap is a circle at a group's pivot as wide as the limb there, in the set of the group's shapes.

const sq = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, outline: 1,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })), ...extra,
})
// a torso, an upper arm hanging from it and a forearm hanging from the arm at the elbow (120, 160)
function model(joins = true, extra: Partial<ModelContent> = {}): ModelContent {
  let c = addGroup({ ...blank('Joined'), joins, ...extra }, newGroup('torso', 'Torso'))
  c = addObject(c, 'torso', { id: 'o_torso', name: 'Torso', layer: 'body', shapes: [] })
  c = addShape(c, 'o_torso', sq('chest', 80, 100, 40, 80, { z: 10, join: 'Body' }))
  c = addGroup(c, { ...newGroup('arm', 'Arm'), parent: 'torso', pivot: [120, 110] })
  c = addObject(c, 'arm', { id: 'o_arm', name: 'Arm', layer: 'body', shapes: [] })
  c = addShape(c, 'o_arm', sq('upper', 112, 104, 16, 60, { z: 20, join: 'Body', joinBack: 'Arms' }))
  c = addGroup(c, { ...newGroup('fore', 'Forearm'), parent: 'arm', pivot: [120, 160], cap: 1 })
  c = addObject(c, 'fore', { id: 'o_fore', name: 'Forearm', layer: 'body', shapes: [] })
  c = addShape(c, 'o_fore', sq('lower', 113, 156, 14, 50, { z: 30, join: 'Body', joinBack: 'Arms' }))
  c = addObject(c, 'torso', { id: 'o_face', name: 'Mark', layer: 'body', shapes: [] })
  return addShape(c, 'o_face', sq('mark', 90, 110, 6, 6, { z: 50 }))
}
const paint = (c: ModelContent, view: 'front' | 'back' = 'front') => paintShapes(c, solve(c, {}, view, {}), NO_COLOURING)

describe('the join sets', () => {
  it('are read from a shape, a twin taking its original’s, and from behind the back’s', () => {
    const c = model()
    expect(joinOf(c, c.shapes.find(s => s.id === 'upper')!)).toBe('Body')
    expect(joinOf(c, c.shapes.find(s => s.id === 'upper')!, true)).toBe('Arms')
    expect(joinOf(c, c.shapes.find(s => s.id === 'chest')!, true)).toBe('Body')
    expect(joinOf(c, c.shapes.find(s => s.id === 'mark')!)).toBeNull()
    expect(joinSets(c)).toEqual([{ name: 'Body', count: 3 }])
    const twinned = makeTwin(c, 'shape', 'upper', () => 'upperR')
    if (!twinned.ok) throw new Error(twinned.reason)
    expect(joinOf(twinned.content, twinned.content.shapes.find(s => s.mirrorOf === 'upper')!)).toBe('Body')
    expect(capOf(c, c.groups.find(g => g.id === 'fore')!)).toBe(1)
  })
})

describe('painting with joins', () => {
  it('draws one outline under the lowest member and leaves the members’ own outlines out', () => {
    const items = paint(model())
    const ids = items.map(i => i.id)
    expect(ids[0]).toBe('join-Body')
    const halo = items[0]
    expect(halo.role).toBe('halo')
    expect(halo.opacity).toBe(0)
    expect(halo.line!.w).toBe(2)
    for (const id of ['chest', 'upper', 'lower']) expect(items.find(i => i.id === id)!.line).toBeNull()
    // a shape in no set keeps its own outline
    expect(items.find(i => i.id === 'mark')!.line).not.toBeNull()
  })
  it('puts a joint cap at the elbow, as wide as the forearm there, before the forearm and in its outline', () => {
    const items = paint(model())
    const capAt = items.findIndex(i => i.id === 'cap-fore'), lowerAt = items.findIndex(i => i.id === 'lower')
    expect(capAt).toBeGreaterThan(0)
    expect(capAt).toBe(lowerAt - 1)
    const cap = items[capAt]
    expect(cap.role).toBe('cap')
    // the forearm is 14 wide about x = 120: half its width, not the 4 to its top end at 156
    expect(cap.d).toMatch(/^M113 160A7 7 /)
    expect(items[0].d).toContain(cap.d)
  })
  it('uses the back’s sets from behind: the arms an outline of their own', () => {
    const ids = paint(model(), 'back').filter(i => i.role === 'halo').map(i => i.id)
    expect(ids.sort()).toEqual(['join-Arms', 'join-Body'])
  })
  it('draws nothing new while the model’s joins are off', () => {
    const items = paint(model(false))
    expect(items.some(i => i.role)).toBe(false)
    expect(items.find(i => i.id === 'chest')!.line).not.toBeNull()
  })
})

describe('the width of a limb at a joint', () => {
  it('is its shortest chord through the pivot, not the distance to its end', () => {
    const tube: Array<[number, number]> = [[113, 156], [127, 156], [127, 206], [113, 206]]
    expect(halfWidthAt(120, 160, [tube])).toBeCloseTo(7)
    // outside the outline: the nearest edge
    expect(halfWidthAt(120, 150, [tube])).toBeCloseTo(6)
  })
})
