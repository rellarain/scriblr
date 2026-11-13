// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelGroup, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, publishFaults, removeObject } from '../modelContent'
import { NO_COLOURING } from './colour'
import { apply } from './geometry'
import { paintShapes } from './paint'
import { toggleOver } from './paintEdit'
import { DEPTH_MAX, solve, type Values } from './rig'
import { addDepth, stepDrive } from './rigEdit'
import { apartSlider } from './sidesEdit'

const pt = (x: number, y: number): ModelPoint => ({ x, y, m: 's' })
const rect = (id: string, x0: number, y0: number, x1: number, y1: number, over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], ...over })
const drive = (over: Partial<ModelDrive>): ModelDrive => ({
  kind: 'turn', group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 0, atMax: 0, mirror: true, ...over,
})
const range = (id: string, drives: ModelDrive[], over: Partial<ModelRange> = {}): ModelRange => ({ id, name: id, scope: null, min: -60, rest: 0, max: 60, unit: '°', show: true, rand: null, drives, ...over })
const group = (id: string, parent: string | null, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ ...newGroup(id, id, parent, objects), ...over })

// An upper arm (shoulder at y 20, elbow at y 100, 20 wide) and a forearm hung from its end (elbow to wrist at y 180); a bone along the upper arm and a Depth slider for it.
// The left arm is on the left of the mirror line (100), its twin on the right.
function arm(extra: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Arm'),
    axis: 140,
    shapes: [rect('up', 90, 20, 110, 100), rect('fore', 92, 100, 108, 180)],
    objects: [{ id: 'oUp', name: 'Upper arm', layer: 'body', shapes: ['up'] }, { id: 'oFore', name: 'Forearm', layer: 'body', shapes: ['fore'] }],
    groups: [group('gUp', null, ['oUp'], { pivot: [100, 20] }), group('gFore', 'gUp', ['oFore'], { pivot: [100, 100] })],
    bones: [{ id: 'bUp', name: 'Upper arm', start: 'gUp', end: { kind: 'group', id: 'gFore', i: 0 } }],
    ranges: [range('depth', [drive({ kind: 'depth', id: 'bUp', atMin: -60, atMax: 60 })])],
    ...extra,
  }
}
const at = (c: ModelContent, values: Values, sid: string, i: number): [number, number] => {
  const s = solve(c, values).shapes[sid]
  return apply(s.matrix, s.local[i].x, s.local[i].y)
}
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('a bone turned toward the viewer (a Depth drive)', () => {
  it('draws its group shorter along the bone by the cosine of the angle, and wider toward the viewer', () => {
    const c = arm()
    // the upper arm's top left corner is on the shoulder line; its bottom corners move up toward the shoulder
    for (const [v, k] of [[60, 0.5], [-60, 0.5], [30, Math.cos(Math.PI / 6)]] as const) {
      const bottom = at(c, { depth: v }, 'up', 3), top = at(c, { depth: v }, 'up', 0)
      expect(bottom[1] - top[1], `at ${v}`).toBeCloseTo(80 * k, 6)
    }
    const width = (v: number) => dist(at(arm(), { depth: v }, 'up', 2), at(arm(), { depth: v }, 'up', 3))
    expect(width(60)).toBeCloseTo(20 * (1 + 0.12 * Math.sin(Math.PI / 3)), 6)
    expect(width(-60)).toBeCloseTo(20 * (1 - 0.12 * Math.sin(Math.PI / 3)), 6)
  })

  it('carries what hangs from it to the shortened end, keeping its length', () => {
    const c = arm()
    const s = solve(c, { depth: 60 })
    expect(s.pivots.gFore[0]).toBeCloseTo(100, 6); expect(s.pivots.gFore[1]).toBeCloseTo(60, 6)
    const top = at(c, { depth: 60 }, 'fore', 0), bottom = at(c, { depth: 60 }, 'fore', 3)
    expect(bottom[1] - top[1]).toBeCloseTo(80, 6)
    expect(dist(at(c, { depth: 60 }, 'fore', 0), at(c, { depth: 60 }, 'fore', 1))).toBeCloseTo(16, 6)
  })

  it('holds at most 89 degrees, so the limb never vanishes', () => {
    const c = arm({ ranges: [range('depth', [drive({ kind: 'depth', id: 'bUp', atMin: -120, atMax: 120 })])] })
    const len = (v: number) => at(c, { depth: v }, 'up', 3)[1] - at(c, { depth: v }, 'up', 0)[1]
    expect(len(60)).toBeCloseTo(80 * Math.cos((DEPTH_MAX * Math.PI) / 180), 6)
    expect(len(60)).toBeGreaterThan(0)
  })

  it('is followed by a twin, mirrored, until the two sides are posed apart; then each side has its own slider', () => {
    let c = arm()
    c = {
      ...c,
      shapes: [...c.shapes, { ...rect('up2', 0, 0, 0, 0), pts: [], mirrorOf: 'up' }, { ...rect('fore2', 0, 0, 0, 0), pts: [], mirrorOf: 'fore' }],
      objects: [...c.objects, { id: 'oUp2', name: 'Upper arm (twin)', layer: 'body', shapes: ['up2'], mirrorOf: 'oUp' }, { id: 'oFore2', name: 'Forearm (twin)', layer: 'body', shapes: ['fore2'], mirrorOf: 'oFore' }],
      groups: [...c.groups, group('gUp2', null, ['oUp2'], { mirrorOf: 'gUp' }), group('gFore2', 'gUp2', ['oFore2'], { mirrorOf: 'gFore' })],
    }
    const lenOf = (cc: ModelContent, v: Values, sid: string) => { const a = at(cc, v, sid, 0), b = at(cc, v, sid, 3); return Math.abs(b[1] - a[1]) }
    expect(lenOf(c, { depth: 60 }, 'up2')).toBeCloseTo(40, 6)
    const e = apartSlider(c, 'depth', p => `${p}_x`)
    expect(e.ok).toBe(true)
    if (!e.ok || !e.rangeId) return
    const other = e.content.ranges.find(r => r.id === e.rangeId)!
    expect(other.drives).toEqual([expect.objectContaining({ kind: 'depth', id: 'bUp', group: 'gUp2' })])
    expect(lenOf(e.content, { depth: 60 }, 'up')).toBeCloseTo(40, 6)
    expect(lenOf(e.content, { depth: 60 }, 'up2')).toBeCloseTo(80, 6)
    expect(lenOf(e.content, { [e.rangeId]: 60 }, 'up2')).toBeCloseTo(40, 6)
    expect(lenOf(e.content, { [e.rangeId]: 60 }, 'up')).toBeCloseTo(80, 6)
    // the right forearm hangs from the right arm's shortened end, at its full length
    expect(lenOf(e.content, { [e.rangeId]: 60 }, 'fore2')).toBeCloseTo(80, 6)
    expect(publishFaults(e.content).filter(f => f.includes('viewer'))).toEqual([])
  })

  it('is made by addDepth and stepped within 89 degrees either way', () => {
    const c = arm({ ranges: [range('r', [])] })
    const e = addDepth(c, 'r', 'bUp')
    expect(e.ok && e.content.ranges[0].drives[0]).toMatchObject({ kind: 'depth', id: 'bUp', atMin: -60, atMax: 60 })
    if (!e.ok) return
    let next = e.content
    for (let k = 0; k < 10; k++) next = stepDrive(next, 'r', 0, 'atMax', 1, true)
    expect(next.ranges[0].drives[0].atMax).toBe(DEPTH_MAX)
  })

  it('is refused for a bone that is not there, or a twin that is not the bone group\'s', () => {
    expect(publishFaults(arm({ ranges: [range('d', [drive({ kind: 'depth', id: 'gone' })])] }))).toContain('Slider d turns a bone toward the viewer that does not exist.')
    expect(publishFaults(arm({ ranges: [range('d', [drive({ kind: 'depth', id: 'bUp', group: 'gFore' })])] }))).toContain('Slider d turns the twin of a bone toward the viewer, but gFore is not the twin of the group the bone starts at.')
  })
})

describe('the depth order of a shape or an object (the z property)', () => {
  // two overlapping shapes: the back one is drawn first at rest; the slider brings it forward
  function pair(over: Partial<ModelDrive> = {}): ModelContent {
    return {
      ...blankContent('Order'),
      shapes: [rect('back', 0, 0, 20, 20, { z: 30 }), rect('front', 10, 10, 30, 30, { z: 40 })],
      objects: [{ id: 'oBack', name: 'Back', layer: 'body', shapes: ['back'] }, { id: 'oFront', name: 'Front', layer: 'body', shapes: ['front'] }],
      groups: [group('g', null, ['oBack', 'oFront'])],
      ranges: [range('order', [drive({ kind: 'prop', feature: 'object', prop: 'z', id: 'oBack', atMin: -20, atMax: 20, ...over })], { min: -1, rest: 0, max: 1, unit: '' })],
    }
  }
  it('moves it in front of the shapes around it, or behind them', () => {
    expect(solve(pair(), { order: 0 }).order).toEqual(['back', 'front'])
    expect(solve(pair(), { order: 1 }).order).toEqual(['front', 'back'])
    expect(solve(pair(), { order: 1 }).shapes.back.z).toBe(50)
    expect(solve(pair({ feature: 'shape', shape: 'back', id: null }), { order: 1 }).order).toEqual(['front', 'back'])
  })
  it('does not stop the shape being edited (its points stay where they were drawn)', async () => {
    const { isPointDriven } = await import('./rig')
    expect(isPointDriven(pair(), { order: 1 }, 'back')).toBe(false)
  })
  it('may be set on a twin, so the two sides can be posed apart', () => {
    const c = pair()
    const twin: ModelContent = {
      ...c,
      shapes: [...c.shapes, { ...rect('back2', 0, 0, 0, 0, { z: 30 }), pts: [], mirrorOf: 'back' }],
      objects: [...c.objects, { id: 'oBack2', name: 'Back (twin)', layer: 'body', shapes: ['back2'], mirrorOf: 'oBack' }],
      groups: [group('g', null, ['oBack', 'oFront', 'oBack2'])],
    }
    // the twin follows its original's depth order...
    expect(solve(twin, { order: 1 }).shapes.back2.z).toBe(50)
    // ...unless that keeps to its own side; then a field of its own moves it
    const apart: ModelContent = { ...twin, ranges: [range('order', [drive({ kind: 'prop', feature: 'object', prop: 'z', id: 'oBack', atMin: -20, atMax: 20, mirror: false })], { min: -1, rest: 0, max: 1, unit: '' }), range('order2', [drive({ kind: 'prop', feature: 'object', prop: 'z', id: 'oBack2', atMin: -20, atMax: 20 })], { min: -1, rest: 0, max: 1, unit: '' })] }
    expect(solve(apart, { order: 1 }).shapes.back2.z).toBe(30)
    expect(solve(apart, { order2: 1 }).shapes.back2.z).toBe(50)
    expect(publishFaults(apart).filter(f => f.includes('twin'))).toEqual([])
  })
})

describe('a shading shape that lies on other parts', () => {
  // a chest and a pelvis, a shadow down the chest's right side that lies on the pelvis too; the chest's twin shadow on the other side (a twin of a shading shape)
  function torso(): ModelContent {
    return {
      ...blankContent('Torso'),
      shapes: [rect('chest', 60, 0, 140, 80), rect('shadow', 120, 0, 150, 160, { shade: { kind: 'shadow', t: 0.2 }, z: 41, over: ['oPelvis'] }), rect('pelvis', 70, 80, 130, 160)],
      objects: [{ id: 'oChest', name: 'Chest', layer: 'body', shapes: ['chest', 'shadow'] }, { id: 'oPelvis', name: 'Pelvis', layer: 'body', shapes: ['pelvis'] }],
      groups: [group('g', null, ['oChest', 'oPelvis'])],
    }
  }
  const comp = (c: ModelContent, id: string) => paintShapes(c, solve(c), NO_COLOURING).find(i => i.id === id)!.compDs
  it('is kept inside the base shapes of its own object and of the parts it lies on', () => {
    const c = torso(), s = solve(c)
    expect(comp(c, 'shadow')).toEqual([s.shapes.chest.d, s.shapes.pelvis.d])
    expect(comp({ ...c, shapes: c.shapes.map(x => (x.id === 'shadow' ? { ...x, over: [] } : x)) }, 'shadow')).toEqual([s.shapes.chest.d])
  })
  it('as a twin, lies on the twins of the parts its original lies on (a part with no twin is its own)', () => {
    const c = torso()
    const twin: ModelContent = {
      ...c,
      shapes: [...c.shapes, { ...rect('chest2', 0, 0, 0, 0), pts: [], mirrorOf: 'chest' }, { ...rect('shadow2', 0, 0, 0, 0, { z: 41 }), pts: [], mirrorOf: 'shadow' }, rect('belly', 70, 80, 130, 160)],
      objects: [...c.objects, { id: 'oChest2', name: 'Chest (twin)', layer: 'body', shapes: ['chest2', 'shadow2'], mirrorOf: 'oChest' }, { id: 'oBelly', name: 'Belly', layer: 'body', shapes: ['belly'], mirrorOf: 'oPelvis' }],
      groups: [group('g', null, ['oChest', 'oPelvis', 'oChest2', 'oBelly'])],
    }
    const s = solve(twin)
    expect(comp(twin, 'shadow2')).toEqual([s.shapes.chest2.d, s.shapes.belly.d])
  })
  it('is set and unset by toggleOver, never on its own object, a shape that is not shading or past the limit', () => {
    const c = torso()
    const off = toggleOver(c, 'shadow', 'oPelvis')
    expect(off.ok && off.content.shapes.find(s => s.id === 'shadow')!.over).toEqual([])
    expect(toggleOver(c, 'shadow', 'oChest')).toMatchObject({ ok: false })
    expect(toggleOver(c, 'chest', 'oPelvis')).toMatchObject({ ok: false })
  })
  it('forgets a part that is gone, and the checks say what is wrong', () => {
    expect(removeObject(torso(), 'oPelvis').shapes.find(s => s.id === 'shadow')!.over).toEqual([])
    const bad = torso()
    bad.shapes = bad.shapes.map(s => (s.id === 'chest' ? { ...s, over: ['oPelvis'] } : s.id === 'shadow' ? { ...s, over: ['gone'] } : s))
    expect(publishFaults(bad)).toEqual(expect.arrayContaining(['Shape chest lies on other parts but is not a shading shape.', 'Shape shadow lies on a part that does not exist.']))
  })
})
