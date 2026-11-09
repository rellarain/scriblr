import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, publishFaults } from '../modelContent'
import { LIMITS } from './limits'
import {
  HAND_KIND, HAND_KIND_OTHER, HAND_ROLES, addFinger, addGrip, addHand, addHandPoses, addThumb, apartHand, gripAt, gripGrab, handSliders, mirrorGrip, moveGrip, removeGrip, renameGrip,
  setPresetGrip, slidersByRole, stepGripAngle, thumbSideAt,
} from './hands'
import { makeTwin } from './pairEdit'
import { previewSpecs } from './previews'
import { solve, type Values } from './rig'
import { applyPreset, isOn, restState, savePreset } from './presets'
import { addRange, addTurn, attachGroup, newRange, reparent, type Edit } from './rigEdit'
import { twinGroupOf } from './sidesEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })

const CHEST: Array<[number, number]> = [[70, 86], [130, 86], [130, 160], [70, 160]]
const ARM: Array<[number, number]> = [[124, 90], [138, 90], [138, 140], [124, 140]]
const FORE: Array<[number, number]> = [[125, 140], [137, 140], [137, 186], [125, 186]]

// A torso with an arm and a forearm (the arm group's twin too, when asked), and a slider that raises the arm.
function arm(twin = false): ModelContent {
  let c: ModelContent = {
    ...blankContent('Body'),
    shapes: [sharp('chest', CHEST), sharp('arm', ARM), sharp('fore', FORE)],
    objects: [
      { id: 'oChest', name: 'Chest', layer: 'body', shapes: ['chest'] },
      { id: 'oArm', name: 'Arm', layer: 'body', shapes: ['arm'] },
      { id: 'oFore', name: 'Forearm', layer: 'body', shapes: ['fore'] },
    ],
    groups: [newGroup('torso', 'Torso', null, ['oChest']), newGroup('gArm', 'Arm', 'torso', ['oArm']), newGroup('gFore', 'Forearm', 'gArm', ['oFore'])],
  }
  c = must(reparent(c, 'gFore', 'gArm'))
  c = must(attachGroup(c, 'gArm', { shape: 'chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 }))
  c = must(attachGroup(c, 'gFore', { shape: 'arm', kind: 'inside', i: 0, t: 0, slider: null, rx: 0.5, ry: 1 }))
  c = must(addRange(c, { ...newRange('raise', 'Arm raise', 'turn', 'gArm'), min: 0, max: 90, rest: 0 }))
  c = must(addTurn(c, 'raise', 'gArm'))
  c = { ...c, ranges: c.ranges.map(r => (r.id === 'raise' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 0, atMax: -80 })) } : r)) }
  if (twin) { let n = 0; c = must(makeTwin(c, 'group', 'gArm', p => `${p}_w${++n}`)) }
  return c
}

let counter = 0
const make = (p: string) => `${p}_${++counter}`
const centre = (c: ModelContent, shapeId: string, values: Values = {}): [number, number] => {
  const s = solve(c, values).shapes[shapeId].pre
  return [s.reduce((a, p) => a + p.x, 0) / s.length, s.reduce((a, p) => a + p.y, 0) / s.length]
}
const byName = (c: ModelContent, name: string) => c.groups.find(g => g.name === name)!
const shapeOfGroup = (c: ModelContent, groupId: string) => c.objects.find(o => o.id === c.groups.find(g => g.id === groupId)!.objects[0])!.shapes[0]
const range = (c: ModelContent, role: string) => c.ranges.find(r => r.role === role)!

describe('a finger', () => {
  it('hangs from the bottom of the forearm as a chain of joints with a Curl slider', () => {
    const e = addFinger(arm(), 'gFore', { name: 'Index', joints: 3, role: 'curl-index' }, make)
    const c = must(e)
    const joints = e.ok ? e.finger!.joints : []
    expect(joints).toHaveLength(3)
    expect(c.groups.find(g => g.id === joints[0])!.parent).toBe('gFore')
    expect(c.groups.find(g => g.id === joints[1])!.parent).toBe(joints[0])
    expect(c.groups.find(g => g.id === joints[2])!.parent).toBe(joints[1])
    expect(c.groups.find(g => g.id === joints[0])!.attach).toMatchObject({ shape: 'fore', kind: 'inside', ry: 1 })
    const r = c.ranges.find(x => x.role === 'curl-index')!
    expect(r).toMatchObject({ name: 'Index curl', min: 0, rest: 0, max: 100, unit: '%', scope: joints[0] })
    expect(r.drives.map(d => d.group)).toEqual(joints)
    expect(r.drives.every(d => d.kind === 'turn' && d.atMin === 0 && d.atMax > 0)).toBe(true)
  })
  it('hangs straight down from the forearm, the joints one under the other', () => {
    const e = addFinger(arm(), 'gFore', { joints: 3 }, make)
    const c = must(e), [a, b, d] = e.ok ? e.finger!.joints.map(g => shapeOfGroup(c, g)) : []
    const ya = centre(c, a)[1], yb = centre(c, b)[1], yd = centre(c, d)[1]
    expect(ya).toBeLessThan(yb); expect(yb).toBeLessThan(yd)
    expect(ya).toBeGreaterThan(186)
    expect(centre(c, a)[0]).toBeCloseTo(131, 3)
  })
  it('curls toward the side it was told, the tip moving up and across', () => {
    const e = addFinger(arm(), 'gFore', { joints: 3, role: 'curl-index', curlSign: 1 }, make)
    const c = must(e), tip = shapeOfGroup(c, e.ok ? e.finger!.joints[2] : ''), id = e.ok ? e.finger!.rangeId : ''
    const open = centre(c, tip), closed = centre(c, tip, { [id]: 100 })
    expect(closed[0]).toBeLessThan(open[0] - 3)
    expect(closed[1]).toBeLessThan(open[1] - 3)
    const e2 = addFinger(arm(), 'gFore', { joints: 3, curlSign: -1 }, make)
    const c2 = must(e2), tip2 = shapeOfGroup(c2, e2.ok ? e2.finger!.joints[2] : '')
    expect(centre(c2, tip2, { [e2.ok ? e2.finger!.rangeId : '']: 100 })[0]).toBeGreaterThan(centre(c2, tip2)[0] + 3)
  })
  it('takes two joints as well', () => {
    const e = addFinger(arm(), 'gFore', { joints: 2 }, make)
    expect(e.ok && e.finger!.joints).toHaveLength(2)
    const c = must(e)
    expect(c.ranges.find(r => r.id === (e.ok ? e.finger!.rangeId : ''))!.drives).toHaveLength(2)
  })
  it('keeps no role unless it is given one', () => {
    const c = must(addFinger(arm(), 'gFore', {}, make))
    expect(c.ranges.find(r => r.name === 'Finger curl')!.role ?? null).toBeNull()
  })
  it('is refused for a missing group, a twin, a group with nothing drawn, or a chain too long', () => {
    expect(refused(addFinger(arm(), 'nope', {}, make))).toMatch(/no such group/)
    const twinned = arm(true), tg = twinGroupOf(twinned, 'gArm')!
    expect(refused(addFinger(twinned, tg, {}, make))).toMatch(/original/)
    const empty = { ...arm(), groups: [...arm().groups, newGroup('empty', 'Empty', 'gFore')] }
    expect(refused(addFinger(empty, 'empty', {}, make))).toMatch(/Draw an outline/)
    // a forearm already deep in the chain
    let deep = arm()
    let parent = 'gFore'
    for (let i = 0; i < LIMITS.chainMax - 3; i++) deep = { ...deep, groups: [...deep.groups, newGroup(`x${i}`, `x${i}`, parent)] }, parent = `x${i}`
    expect(refused(addFinger(deep, parent, { joints: 3 }, make))).toMatch(/pivot chain/)
  })
  it('is refused past the number of sliders a model may hold', () => {
    const c = arm()
    const filler = Array.from({ length: LIMITS.rangesMax - c.ranges.length }, (_, i) => ({ ...newRange(`f${i}`, `F${i}`, 'turn'), drives: [] }))
    expect(refused(addFinger({ ...c, ranges: [...c.ranges, ...filler] }, 'gFore', {}, make))).toMatch(/at most/)
  })
})

describe('a thumb', () => {
  it('hangs from the side edge of the palm, toward the middle of the figure for an arm on the picture\'s right', () => {
    expect(thumbSideAt(131, 100)).toBe('left')
    expect(thumbSideAt(60, 100)).toBe('right')
    const e = addThumb(arm(), 'gFore', {}, make)
    const c = must(e), joints = e.ok ? e.joints! : []
    const g = c.groups.find(x => x.id === joints[0])!
    expect(g.attach).toMatchObject({ kind: 'edge', shape: 'fore' })
    expect(joints).toHaveLength(2)
    // on the left side of the forearm (the side toward the axis)
    expect(centre(c, shapeOfGroup(c, joints[0]))[0]).toBeLessThan(131)
  })
  it('has Swing, Curl and Across sliders, each with its role', () => {
    const c = must(addThumb(arm(), 'gFore', {}, make))
    expect(c.ranges.filter(r => r.role).map(r => r.role).sort()).toEqual(['curl-thumb', 'oppose-thumb', 'swing-thumb'])
    expect(range(c, 'swing-thumb')).toMatchObject({ min: -20, max: 40, unit: '°' })
  })
  it('swings out with its Swing slider, away from the palm, and folds across with Across', () => {
    const e = addThumb(arm(), 'gFore', { side: 'left' }, make)
    const c = must(e), tip = shapeOfGroup(c, e.ok ? e.joints![1] : '')
    const at = centre(c, tip)
    expect(centre(c, tip, { [range(c, 'swing-thumb').id]: 40 })[0]).toBeLessThan(at[0] - 2)
    expect(centre(c, tip, { [range(c, 'oppose-thumb').id]: 100 })[0]).toBeGreaterThan(at[0] + 2)
  })
})

describe('a whole hand', () => {
  const built = () => { const e = addHand(arm(), 'gFore', {}, make); return { c: must(e), hand: e.ok ? e.hand! : null } }

  it('is a palm, four fingers of three joints and a thumb of two: fifteen groups, objects and shapes', () => {
    const base = arm(), { c, hand } = built()
    expect(c.groups.length - base.groups.length).toBe(15)
    expect(c.objects.length - base.objects.length).toBe(15)
    expect(c.shapes.length - base.shapes.length).toBe(15)
    expect(hand!.fingers).toHaveLength(4)
    expect(hand!.fingers.every(f => f.length === 3)).toBe(true)
    expect(hand!.thumb).toHaveLength(2)
    expect(c.groups.find(g => g.id === hand!.palm)).toMatchObject({ name: 'Hand', parent: 'gFore' })
  })
  it('has the eight sliders, each with its role', () => {
    const { c } = built()
    const roles = c.ranges.filter(r => r.role).map(r => r.role).sort()
    expect(roles).toEqual([...HAND_ROLES].sort())
    const { c: c2, hand } = built()
    expect(handSliders(c2, hand!.palm)).toHaveLength(8)
  })
  it('paints the parts of a hand as the forearm it hangs from', () => {
    const base = arm()
    const painted = { ...base, shapes: base.shapes.map(s => (s.id === 'fore' ? { ...s, slot: 'k_skin' } : s)) }
    const c = must(addHand(painted, 'gFore', {}, make))
    const hand = c.shapes.filter(s => !['chest', 'arm', 'fore'].includes(s.id))
    expect(hand).toHaveLength(15)
    expect(hand.every(s => s.slot === 'k_skin')).toBe(true)
    const gray = must(addFinger({ ...base, shapes: base.shapes.map(s => (s.id === 'fore' ? { ...s, gray: 60 } : s)) }, 'gFore', {}, make))
    expect(gray.shapes.filter(s => !['chest', 'arm', 'fore'].includes(s.id)).every(s => s.slot === null && s.gray === 60)).toBe(true)
  })
  it('puts the index finger beside the thumb and the little finger away from it', () => {
    const { c, hand } = built()
    const xs = hand!.fingers.map(f => centre(c, shapeOfGroup(c, f[0]))[0])
    // the order of FINGERS: index, middle, ring, little: left to right for a thumb on the left
    expect(xs[0]).toBeLessThan(xs[1]); expect(xs[1]).toBeLessThan(xs[2]); expect(xs[2]).toBeLessThan(xs[3])
    expect(centre(c, shapeOfGroup(c, hand!.thumb[0]))[0]).toBeLessThan(xs[0])
  })
  it('puts the thumb on the other side for an arm on the picture\'s left', () => {
    let c = arm()
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'fore' ? { ...s, pts: s.pts.map(p => ({ ...p, x: 200 - p.x })) } : s)) }
    const e = addHand(c, 'gFore', {}, make)
    const out = must(e), hand = e.ok ? e.hand! : null
    expect(centre(out, shapeOfGroup(out, hand!.thumb[0]))[0]).toBeGreaterThan(centre(out, shapeOfGroup(out, hand!.fingers[3][0]))[0])
  })
  it('curls a fist with the sliders at their ends: every finger tip closes in', () => {
    const { c, hand } = built()
    const open = hand!.fingers.map(f => centre(c, shapeOfGroup(c, f[2])))
    const values: Values = {}
    for (const role of ['curl-index', 'curl-middle', 'curl-ring', 'curl-little']) values[range(c, role).id] = 100
    const closed = hand!.fingers.map(f => centre(c, shapeOfGroup(c, f[2]), values))
    closed.forEach((p, i) => { expect(p[1]).toBeLessThan(open[i][1] - 3) })
  })
  it('spreads the fingers with the Spread slider: the index leans toward the thumb and the little finger away', () => {
    const { c, hand } = built()
    const tip = (i: number, v: Values = {}) => centre(c, shapeOfGroup(c, hand!.fingers[i][2]), v)
    const v = { [range(c, 'spread').id]: 100 }
    expect(tip(0, v)[0]).toBeLessThan(tip(0)[0] - 1)
    expect(tip(3, v)[0]).toBeGreaterThan(tip(3)[0] + 1)
  })
  it('publishes (nothing in it is a fault) and is only a warning deep in the chain', () => {
    const { c } = built()
    expect(publishFaults({ ...c, name: 'M' })).toEqual([])
  })
  it('is refused for a twin group, a group with nothing drawn, or when the model has no room', () => {
    const twinned = arm(true)
    expect(refused(addHand(twinned, twinGroupOf(twinned, 'gFore')!, {}, make))).toMatch(/original/)
    expect(refused(addHand(arm(), 'nope', {}, make))).toMatch(/no such group/)
    const empty = { ...arm(), groups: [...arm().groups, newGroup('empty', 'Empty', 'gFore')] }
    expect(refused(addHand(empty, 'empty', {}, make))).toMatch(/Draw an outline/)
    const c = arm()
    const crowd = Array.from({ length: LIMITS.groupsMax - c.groups.length - 5 }, (_, i) => newGroup(`z${i}`, `z${i}`))
    expect(refused(addHand({ ...c, groups: [...c.groups, ...crowd] }, 'gFore', {}, make))).toMatch(/at most/)
  })
  it('stays finite for any values of any slider', () => {
    const { c } = built()
    let seed = 11
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let k = 0; k < 30; k++) {
      const values: Values = {}
      for (const r of c.ranges) values[r.id] = r.min + (r.max - r.min) * (rnd() * 1.4 - 0.2)
      const solved = solve(c, values)
      for (const s of c.shapes) for (const p of solved.shapes[s.id].pre) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    }
  })
})

describe('two hands, posed apart', () => {
  const built = () => { const e = addHand(arm(true), 'gFore', {}, make); return { c: must(e), hand: e.ok ? e.hand! : null } }

  it('copies the hand to the twin arm and gives each hand slider a side of its own', () => {
    const { c, hand } = built()
    expect(hand!.twin).toBeTruthy()
    expect(c.groups.find(g => g.id === hand!.twin)).toMatchObject({ mirrorOf: hand!.palm, parent: twinGroupOf(c, 'gFore') })
    expect(c.groups.length).toBe(arm(true).groups.length + 30)
    const roles = c.ranges.filter(r => r.role).map(r => r.role!)
    expect(roles.filter(r => !r.endsWith('~'))).toHaveLength(8)
    expect(roles.filter(r => r.endsWith('~'))).toHaveLength(8)
    expect(c.ranges.filter(r => r.name.endsWith('(other side)')).length).toBe(8)
    expect(publishFaults({ ...c, name: 'M' })).toEqual([])
  })
  it('curls one hand and leaves the other open', () => {
    const { c, hand } = built()
    const mine = slidersByRole(c, false, hand!.palm), theirs = slidersByRole(c, true, hand!.palm)
    expect(Object.keys(mine)).toHaveLength(8)
    expect(Object.keys(theirs)).toHaveLength(8)
    const tipOf = (palm: string, finger: number) => {
      const g = c.groups.filter(x => x.parent === palm && /finger/.test(x.name))[finger]
      let cur = g
      while (true) { const next = c.groups.find(x => x.parent === cur.id); if (!next) break; cur = next }
      return shapeOfGroup(c, cur.id)
    }
    const a = tipOf(hand!.palm, 1), b = tipOf(hand!.twin!, 1)
    const rest = { a: centre(c, a), b: centre(c, b) }
    const left = centre(c, a, { [mine['curl-middle']!]: 100 }), right = centre(c, b, { [mine['curl-middle']!]: 100 })
    expect(left[1]).toBeLessThan(rest.a[1] - 3)
    expect(right[1]).toBeCloseTo(rest.b[1], 3)
    const mirrored = centre(c, b, { [theirs['curl-middle']!]: 100 })
    expect(mirrored[1]).toBeCloseTo(left[1], 3)
    expect(mirrored[0]).toBeCloseTo(200 - left[0], 3)
  })
  it('poses the other hand apart on request, when the arm is twinned later', () => {
    const e = addHand(arm(), 'gFore', {}, make)
    const one = must(e), palm = e.ok ? e.hand!.palm : ''
    expect(refused(apartHand(one, palm, make))).toMatch(/no twin/)
    const twinned = must(makeTwin(one, 'group', 'gArm', make))
    const fixed = must(apartHand(twinned, palm, make))
    expect(fixed.ranges.filter(r => r.role?.endsWith('~'))).toHaveLength(8)
    expect(refused(apartHand(fixed, palm, make))).toMatch(/already/)
  })
})

describe('the starter hand poses', () => {
  const twoHands = () => { const e = addHand(arm(true), 'gFore', {}, make); return { c: must(e), palm: e.ok ? e.hand!.palm : '' } }

  it('adds Open, Fist, Point, Pinch and Grip for each hand, as presets of kind Hand and Hand (other side)', () => {
    const { c, palm } = twoHands()
    const out = must(addHandPoses(c, palm, make))
    const poses = out.presets ?? []
    expect(poses.filter(p => p.kind === HAND_KIND).map(p => p.name)).toEqual(['Open', 'Fist', 'Point', 'Pinch', 'Grip'])
    expect(poses.filter(p => p.kind === HAND_KIND_OTHER).map(p => p.name)).toEqual(['Open', 'Fist', 'Point', 'Pinch', 'Grip'])
    const fist = poses.find(p => p.kind === HAND_KIND && p.name === 'Fist')!, mine = slidersByRole(out, false, palm), theirs = slidersByRole(out, true, palm)
    expect(fist.values[mine['curl-index']!]).toBe(100)
    expect(Object.keys(fist.values).every(k => Object.values(mine).includes(k))).toBe(true)
    const other = poses.find(p => p.kind === HAND_KIND_OTHER && p.name === 'Fist')!
    expect(Object.keys(other.values).every(k => Object.values(theirs).includes(k))).toBe(true)
    expect(publishFaults({ ...out, name: 'M' })).toEqual([])
  })
  it('closes one hand and not the other when a pose of each kind is applied', () => {
    const { c, palm } = twoHands()
    const out = must(addHandPoses(c, palm, make))
    const fist = out.presets!.find(p => p.kind === HAND_KIND && p.name === 'Fist')!
    const open = out.presets!.find(p => p.kind === HAND_KIND_OTHER && p.name === 'Open')!
    let s = applyPreset(out, restState(out), fist)
    s = applyPreset(out, s, open)
    const mine = slidersByRole(out, false, palm), theirs = slidersByRole(out, true, palm)
    expect(s.values[mine['curl-index']!]).toBe(100)
    expect(s.values[theirs['curl-index']!] ?? 0).toBe(0)
    // a new pose of the same kind lets go of the last one
    const point = out.presets!.find(p => p.kind === HAND_KIND && p.name === 'Point')!
    const next = applyPreset(out, s, point)
    expect(next.values[mine['curl-index']!] ?? 0).toBe(0)
    expect(next.values[mine['curl-middle']!]).toBe(100)
  })
  it('adds only one side for a model with one hand, and leaves poses that are there alone', () => {
    const e = addHand(arm(), 'gFore', {}, make)
    const c = must(e), palm = e.ok ? e.hand!.palm : ''
    const out = must(addHandPoses(c, palm, make))
    expect((out.presets ?? []).map(p => p.kind)).toEqual(Array(5).fill(HAND_KIND))
    expect(refused(addHandPoses(out, palm, make))).toMatch(/there already/)
    expect(refused(addHandPoses(arm(), undefined, make))).toMatch(/hand or fingers/)
  })
})

describe('grip points', () => {
  const handed = () => { const e = addHand(arm(true), 'gFore', {}, make); return { c: must(e), palm: e.ok ? e.hand!.palm : '', twin: e.ok ? e.hand!.twin! : '' } }

  it('puts a grip in the middle of the hand, pointing down, named for the model', () => {
    const { c, palm } = handed()
    const e = addGrip(c, palm, make)
    const out = must(e)
    const g = out.grips!.find(x => x.id === (e.ok ? e.gripId : ''))!
    expect(g).toMatchObject({ name: 'Grip', group: palm, angle: 0 })
    const box = solve(out, {}).shapes[shapeOfGroup(out, palm)].box
    expect(g.x).toBeCloseTo(box.x + box.w / 2, 1)
    expect(g.y).toBeGreaterThan(box.y); expect(g.y).toBeLessThan(box.y + box.h)
    expect(must(addGrip(out, palm, make)).grips!.map(x => x.name)).toEqual(['Grip', 'Grip 2'])
  })
  it('is refused for a missing group or one with nothing drawn, and past the limit', () => {
    const { c, palm } = handed()
    expect(refused(addGrip(c, 'nope', make))).toMatch(/no such group/)
    expect(refused(addGrip({ ...c, groups: [...c.groups, newGroup('bare', 'Bare')] }, 'bare', make))).toMatch(/Draw an outline/)
    let full = c
    for (let i = 0; i < LIMITS.gripsMax; i++) full = must(addGrip(full, palm, make))
    expect(refused(addGrip(full, palm, make))).toMatch(new RegExp(`at most ${LIMITS.gripsMax}`))
  })
  it('moves, turns by steps, is renamed and removed (and the poses that held with it let go)', () => {
    const { c, palm } = handed()
    const e = addGrip(c, palm, make), id = e.ok ? e.gripId! : ''
    let out = must(e)
    out = moveGrip(out, id, 123.456, 170)
    expect(out.grips![0]).toMatchObject({ x: 123.46, y: 170 })
    expect(moveGrip(out, id, Number.NaN, 5000).grips![0]).toMatchObject({ x: 123.46, y: 450 })
    out = stepGripAngle(out, id, 1)
    expect(out.grips![0].angle).toBe(5)
    out = stepGripAngle(out, id, -1, true)
    expect(out.grips![0].angle).toBe(-10)
    expect(stepGripAngle({ ...out, grips: [{ ...out.grips![0], angle: 178 }] }, id, 1).grips![0].angle).toBe(180)
    out = renameGrip(out, id, '  Staff  ')
    expect(out.grips![0].name).toBe('Staff')
    out = must(addHandPoses(out, palm, make))
    const grip = out.presets!.find(p => p.name === 'Grip' && p.kind === HAND_KIND)!
    out = must(setPresetGrip(out, grip.id, id))
    expect(out.presets!.find(p => p.id === grip.id)!.grip).toBe(id)
    expect(refused(setPresetGrip(out, grip.id, 'gone'))).toMatch(/no such grip/)
    expect(refused(setPresetGrip(out, 'gone', id))).toMatch(/no such preset/)
    const removed = removeGrip(out, id)
    expect(removed.grips).toEqual([])
    expect(removed.presets!.find(p => p.id === grip.id)!.grip).toBeNull()
    expect(publishFaults({ ...out, name: 'M' })).toEqual([])
  })
  it('makes the same grip on the other hand, mirrored and pointing the other way', () => {
    const { c, palm, twin } = handed()
    const e = addGrip(c, palm, make)
    let out = moveGrip(must(e), e.ok ? e.gripId! : '', 128, 190)
    out = stepGripAngle(out, e.ok ? e.gripId! : '', 1, true)
    const m = mirrorGrip(out, e.ok ? e.gripId! : '', make)
    const both = must(m).grips!
    expect(both).toHaveLength(2)
    expect(both[1]).toMatchObject({ group: twin, x: 72, y: 190, angle: -15 })
    expect(both[1].name).toMatch(/other side/)
    expect(refused(mirrorGrip(must(m), e.ok ? e.gripId! : '', make))).toMatch(/already/)
    expect(refused(mirrorGrip(arm(), 'x', make))).toMatch(/no such grip/)
    const single = must(addHand(arm(), 'gFore', {}, make))
    const palm1 = single.groups.find(g => g.name === 'Hand')!.id
    const g1 = must(addGrip(single, palm1, make))
    expect(refused(mirrorGrip(g1, g1.grips![0].id, make))).toMatch(/no twin/)
  })
  it('is carried by its hand: it moves with the arm, and the way it points turns with it', () => {
    const { c, palm } = handed()
    const e = addGrip(c, palm, make)
    const out = must(e), grip = out.grips![0]
    const rest = gripAt(solve(out, {}), grip), raised = gripAt(solve(out, { raise: 60 }), grip)
    expect(rest).toMatchObject({ x: grip.x, y: grip.y, angle: 0 })
    expect(Math.hypot(raised.x - rest.x, raised.y - rest.y)).toBeGreaterThan(10)
    expect(raised.angle).not.toBe(0)
    expect(Math.abs(raised.angle)).toBeCloseTo(Math.abs(60 * 80 / 90), 0)
    expect(gripGrab(grip)).toEqual({ groupId: palm, local: [grip.x, grip.y] })
    expect(gripGrab({ ...grip, group: null })).toBeNull()
  })
})

describe('a pose names its grip', () => {
  const held = () => {
    const e = addHand(arm(), 'gFore', {}, make)
    const palm = e.ok ? e.hand!.palm : ''
    let c = must(addHandPoses(must(e), palm, make))
    const g = addGrip(c, palm, make)
    c = must(g)
    const gripId = g.ok ? g.gripId! : ''
    const grip = c.presets!.find(p => p.name === 'Grip')!, open = c.presets!.find(p => p.name === 'Open')!
    c = must(setPresetGrip(c, grip.id, gripId))
    return { c, gripId, grip: c.presets!.find(p => p.id === grip.id)!, open }
  }

  it('makes the grip the active one when the pose is applied, and lets go of it when a pose of the same kind is', () => {
    const { c, gripId, grip, open } = held()
    const gripped = applyPreset(c, restState(c), grip)
    expect(gripped.grip).toBe(gripId)
    const released = applyPreset(c, gripped, open)
    expect(released.grip ?? null).toBeNull()
  })
  it('is on only with its grip chosen', () => {
    const { c, grip, gripId } = held()
    const state = applyPreset(c, restState(c), grip)
    expect(isOn(c, state, grip)).toBe(true)
    expect(isOn(c, { ...state, grip: null }, grip)).toBe(false)
    expect(state.grip).toBe(gripId)
  })
  it('is kept by a pose saved from the test state, as long as the grip is still there', () => {
    const { c, gripId } = held()
    const saved = savePreset(c, { ...restState(c), grip: gripId }, 'Staff hold', 'Hand', make)
    expect(must(saved).presets!.find(p => p.name === 'Staff hold')!.grip).toBe(gripId)
    const gone = savePreset(c, { ...restState(c), grip: 'gone' }, 'Nothing', 'Hand', make)
    expect(must(gone).presets!.find(p => p.name === 'Nothing')!.grip ?? null).toBeNull()
  })
  it('leaves the state without a grip key when no pose names one, as before', () => {
    const c = arm()
    expect(applyPreset(c, restState(c), { id: 'p', name: 'x', kind: 'Pose', values: {}, hidden: [], scope: null, forms: {}, fall: null, grip: null })).toEqual({ values: { raise: 0 }, forms: {}, hidden: [], fall: 'down' })
  })
})

describe('hand poses in the previews', () => {
  it('shows the hands in the starter poses in some random previews, each hand on its own', () => {
    const e = addHand(arm(true), 'gFore', {}, make)
    const palm = e.ok ? e.hand!.palm : ''
    const c = must(addHandPoses(must(e), palm, make))
    const mine = slidersByRole(c, false, palm), theirs = slidersByRole(c, true, palm)
    const specs = Array.from({ length: 30 }, (_, i) => previewSpecs(i + 1, 'rand', 6, c.ranges, c)).flat()
    const fists = specs.filter(s => s.values[mine['curl-index']!] === 100 && s.values[mine['curl-little']!] === 100)
    const otherFists = specs.filter(s => s.values[theirs['curl-index']!] === 100 && s.values[theirs['curl-little']!] === 100)
    expect(fists.length).toBeGreaterThan(0)
    expect(otherFists.length).toBeGreaterThan(0)
    expect(specs.some(s => s.values[mine['curl-index']!] === 100 && s.values[theirs['curl-index']!] !== 100)).toBe(true)
  })
})
