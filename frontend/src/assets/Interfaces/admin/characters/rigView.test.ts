import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelRange } from '../../../../api/types'
import { blankContent, newGroup } from './modelContent'
import { driveText, groupOfSelection, offRest, rangesForSelection, rangesMovingGroup, scrubValue, valueText } from './rigView'

const drive = (over: Partial<ModelDrive>): ModelDrive => ({ kind: 'turn', group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...over })
const range = (id: string, drives: ModelDrive[], over: Partial<ModelRange> = {}): ModelRange => ({ id, name: id, scope: null, min: -20, rest: 0, max: 20, unit: '°', show: true, rand: null, drives, ...over })
const shape = (id: string, name = id) => ({ id, name, closed: true, z: 40, op: 1, view: 'both' as const, half: 0, template: null, pts: [] })

const model = (): ModelContent => ({
  ...blankContent('M'),
  shapes: [shape('sNeck', 'Neck'), shape('sHead', 'Skull')],
  objects: [{ id: 'oNeck', name: 'Neck', layer: 'body', shapes: ['sNeck'] }, { id: 'oHead', name: 'Head', layer: 'body', shapes: ['sHead'] }],
  groups: [newGroup('gTorso', 'Torso', null, ['oNeck']), newGroup('gHead', 'Head', 'gTorso', ['oHead'])],
  ranges: [
    range('tilt', [drive({ kind: 'turn', group: 'gHead', atMin: -12, atMax: 12 })]),
    range('wide', [drive({ kind: 'points', shape: 'sNeck', moves: [{ i: 1, dx: 1, dy: 0, dxMin: 0, dyMin: 0 }] })]),
    range('size', [drive({ kind: 'scale', target: 'model', atMin: 80, atMax: 120 })], { min: 50, rest: 100, max: 150, unit: '%' }),
    range('slide', [], { scope: 'oHead' }),
  ],
})

describe('the group of a selection', () => {
  it('is the group itself, the group of an object, or of a shape\'s object', () => {
    const c = model()
    expect(groupOfSelection(c, { kind: 'group', id: 'gHead' })?.id).toBe('gHead')
    expect(groupOfSelection(c, { kind: 'object', id: 'oNeck' })?.id).toBe('gTorso')
    expect(groupOfSelection(c, { kind: 'shape', id: 'sHead' })?.id).toBe('gHead')
    expect(groupOfSelection(c, { kind: 'none', id: '' })).toBeUndefined()
    expect(groupOfSelection(c, { kind: 'shape', id: 'ghost' })).toBeUndefined()
  })
})

describe('the sliders of a selection', () => {
  it('are the ones listed under it or driving it or something in it', () => {
    const c = model()
    expect(rangesForSelection(c, { kind: 'group', id: 'gHead' }).map(r => r.id)).toEqual(['tilt', 'slide'])
    expect(rangesForSelection(c, { kind: 'shape', id: 'sNeck' }).map(r => r.id)).toEqual(['wide'])
    expect(rangesForSelection(c, { kind: 'object', id: 'oHead' }).map(r => r.id)).toEqual(['tilt', 'slide'])
    expect(rangesForSelection(c, { kind: 'none', id: '' })).toEqual([])
  })
  it('names the sliders that move a group', () => {
    const c = model()
    expect(rangesMovingGroup(c, 'gHead').map(r => r.id)).toEqual(['tilt'])
    expect(rangesMovingGroup(c, 'gTorso')).toEqual([])
    const anchored = { ...c, groups: c.groups.map(g => (g.id === 'gTorso' ? { ...g, attach: { shape: 'sNeck', kind: 'range' as const, i: 0, t: 0, slider: 'slide', rx: 0.5, ry: 0.5 } } : g)) }
    expect(rangesMovingGroup(anchored, 'gTorso').map(r => r.id)).toEqual(['slide'])
  })
})

describe('what a drive says', () => {
  const c = model()
  it('says what it turns, scales, moves and bends', () => {
    expect(driveText(c, c.ranges[0].drives[0])).toBe('Turns Head by -12° at the minimum and +12° at the maximum')
    expect(driveText(c, c.ranges[2].drives[0])).toBe('Scales the whole model to 80% at the minimum and 120% at the maximum')
    expect(driveText(c, drive({ kind: 'scale', target: 'shape', id: 'sHead', axis: 'x', atMin: 90, atMax: 110 }))).toBe('Scales Skull across to 90% at the minimum and 110% at the maximum')
    expect(driveText(c, drive({ kind: 'scale', target: 'group', id: 'gHead', axis: 'y', atMin: 90, atMax: 110 }))).toBe('Scales Head up and down to 90% at the minimum and 110% at the maximum')
    expect(driveText(c, c.ranges[1].drives[0])).toBe('Moves 1 point of Neck')
    expect(driveText(c, drive({ kind: 'points', shape: 'sNeck', moves: [] }))).toBe('Moves 0 points of Neck')
    expect(driveText(c, drive({ kind: 'bend', shape: 'sHead', atMin: -5, atMax: 30 }))).toBe('Bends Skull by -5° at the minimum and +30° at the maximum')
  })
  it('does not break on a missing target', () => {
    expect(driveText(c, drive({ kind: 'turn', group: 'ghost' }))).toBe('Turns ghost by 0° at the minimum and 0° at the maximum')
  })
})

describe('test values', () => {
  it('counts the sliders away from rest', () => {
    const c = model()
    expect(offRest(c, {})).toBe(0)
    expect(offRest(c, { tilt: 5, size: 100, wide: 0 })).toBe(1)
    expect(offRest(c, { tilt: 5, size: 120, wide: NaN })).toBe(2)
  })
  it('writes a value with its unit', () => {
    expect(valueText(range('a', [], { unit: '°' }), 12.3456)).toBe('12.35°')
    expect(valueText(range('a', [], { unit: '' }), 3)).toBe('3')
  })
  it('sweeps from the minimum to the maximum and back as t goes round once', () => {
    const r = range('a', [], { min: -20, max: 20 })
    expect([0, 0.25, 0.5, 0.75, 1].map(t => scrubValue(r, t))).toEqual([-20, 0, 20, 0, -20])
  })
})
