import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, publishFaults } from '../modelContent'
import { rotate, apply } from './geometry'
import { LIMITS } from './limits'
import { makeTwin } from './pairEdit'
import { beginScale, beginTurn, canScale, canTurn, grabPoint, moveScale, moveTurn, poseTarget, reach, reachJoints, scaleDriver, type Point } from './pose'
import { solve, type Values } from './rig'
import { addLength, addRange, addScale, addTurn, attachGroup, newRange, reparent, type Edit } from './rigEdit'
import { apartSlider, isApart, joinSides, movesBothSides, movesOneSide, oneSideEach, oneSided, originalSideOf, otherSideOf, poseSides, sideSliderFor, turnsTogether, twinGroupOf, whyNotApart } from './sidesEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })

const CHEST: Array<[number, number]> = [[70, 86], [130, 86], [130, 160], [70, 160]]
const ARM: Array<[number, number]> = [[124, 90], [138, 90], [138, 140], [124, 140]]
const FORE: Array<[number, number]> = [[125, 140], [137, 140], [137, 186], [125, 186]]

// A torso with an arm and a forearm, twinned (the arm group and the forearm under it get twins); sliders raise the arm and bend the elbow. By default the Turn
// drives move both sides (`together`), the way models were made before a pose belonged to one side; `pair(false)` has the drives a new Turn slider gets.
function pair(together = true): ModelContent {
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
  for (const [id, group, lo, hi, atMin, atMax] of [['raise', 'gArm', 0, 90, 0, -80], ['elbow', 'gFore', 0, 130, 0, -100]] as const) {
    c = must(addRange(c, { ...newRange(id, id === 'raise' ? 'Arm raise' : 'Elbow bend', 'turn', group), min: lo, max: hi, rest: 0, role: id === 'raise' ? 'raise' : null }))
    c = must(addTurn(c, id, group))
    c = { ...c, ranges: c.ranges.map(r => (r.id === id ? { ...r, drives: r.drives.map(d => ({ ...d, atMin, atMax, ...(together ? { mirror: true } : {}) })) } : r)) }
  }
  let n = 0
  return must(makeTwin(c, 'group', 'gArm', p => `${p}_t${++n}`))
}

const named = (c: ModelContent): ModelContent => ({ ...c, name: 'M' })
const corners = (c: ModelContent, id: string, values: Values = {}) => solve(c, values).shapes[id].pre.map((p): [number, number] => [p.x, p.y])
const sortPts = (a: Array<[number, number]>) => [...a].sort((p, q) => p[0] - q[0] || p[1] - q[1])
const mirror = (a: Array<[number, number]>, axis = 100): Array<[number, number]> => a.map(([x, y]) => [2 * axis - x, y])
function expectSame(a: Array<[number, number]>, b: Array<[number, number]>) {
  const [p, q] = [sortPts(a), sortPts(b)]
  expect(p.length).toBe(q.length)
  p.forEach((pt, i) => { expect(pt[0]).toBeCloseTo(q[i][0], 4); expect(pt[1]).toBeCloseTo(q[i][1], 4) })
}
function expectDifferent(a: Array<[number, number]>, b: Array<[number, number]>) {
  const [p, q] = [sortPts(a), sortPts(b)]
  expect(p.some((pt, i) => Math.abs(pt[0] - q[i][0]) > 0.5 || Math.abs(pt[1] - q[i][1]) > 0.5)).toBe(true)
}

const armTwin = (c: ModelContent) => c.shapes.find(s => s.mirrorOf === 'arm')!.id
const foreTwin = (c: ModelContent) => c.shapes.find(s => s.mirrorOf === 'fore')!.id

describe('posing the other side apart: the edit', () => {
  it('makes a slider for the twin groups right after the original, and the original stops being followed', () => {
    const c = pair()
    const e = apartSlider(c, 'raise', p => `${p}_x`)
    const out = must(e)
    expect(out.ranges.map(r => r.id)).toEqual(['raise', 'r_x', 'elbow'])
    const original = out.ranges[0], other = out.ranges[1]
    expect(original.drives.every(d => d.mirror === false)).toBe(true)
    expect(other).toMatchObject({ name: 'Arm raise (other side)', min: 0, rest: 0, max: 90, unit: '°', role: 'raise~', show: true })
    expect(other.drives).toHaveLength(1)
    expect(other.drives[0]).toMatchObject({ kind: 'turn', group: twinGroupOf(c, 'gArm'), atMin: 0, atMax: -80, mirror: true })
    expect(isApart(out, original)).toBe(true)
    expect(isApart(out, other)).toBe(true)
    expect(isApart(c, c.ranges[0])).toBe(false)
    expect(otherSideOf(out, original)?.id).toBe('r_x')
    expect(originalSideOf(out, other)?.id).toBe('raise')
  })
  it('puts a scope on the twin group when the slider is listed under a group', () => {
    const c = pair()
    const out = must(apartSlider(c, 'raise'))
    expect(out.ranges[1].scope).toBe(twinGroupOf(c, 'gArm'))
  })
  it('does not leave a role behind when the slider had none', () => {
    const out = must(apartSlider(pair(), 'elbow'))
    expect(out.ranges.find(r => r.name === 'Elbow bend (other side)')!.role ?? null).toBeNull()
  })
  it('is refused for a slider with nothing to pose apart, or one already apart, or a missing one', () => {
    let c = pair()
    c = must(addRange(c, { ...newRange('plain', 'Plain', 'scale'), drives: [] }))
    expect(whyNotApart(c, c.ranges.find(r => r.id === 'plain')!)).toMatch(/None of its drives/)
    expect(refused(apartSlider(c, 'plain'))).toMatch(/None of its drives/)
    expect(refused(apartSlider(c, 'nope'))).toMatch(/no such slider/)
    const apart = must(apartSlider(c, 'raise'))
    expect(refused(apartSlider(apart, 'raise'))).toMatch(/already posed apart/)
    expect(whyNotApart(pair(), pair().ranges[0])).toBeNull()
  })
  it('is refused past the number of sliders a model may hold', () => {
    const c = pair()
    const filler = Array.from({ length: LIMITS.rangesMax - c.ranges.length }, (_, i) => ({ ...newRange(`f${i}`, `F${i}`, 'turn'), drives: [] }))
    expect(refused(apartSlider({ ...c, ranges: [...c.ranges, ...filler] }, 'raise'))).toMatch(new RegExp(`at most ${LIMITS.rangesMax} sliders`))
  })
  it('says when a slider also moves something that still follows the original side', () => {
    let c = pair()
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'raise' ? { ...r, drives: [...r.drives, { ...r.drives[0], kind: 'points' as const, group: null, shape: 'arm', moves: [{ i: 1, dx: 4, dy: 0, dxMin: 0, dyMin: 0 }] }] } : r)) }
    const e = apartSlider(c, 'raise')
    expect(e.ok && e.note).toMatch(/still follows the original side/)
    expect(must(e).ranges[0].drives[1].mirror).toBe(c.ranges.find(r => r.id === 'raise')!.drives[1].mirror)
  })
  it('publishes (no fault comes of posing apart)', () => {
    const out = must(apartSlider(must(apartSlider(pair(), 'raise')), 'elbow'))
    expect(publishFaults(named(out))).toEqual([])
  })
})

describe('the two sides posed apart', () => {
  const apart = () => must(apartSlider(pair(), 'raise', p => `${p}_x`))

  it('moves both arms together before it is done (the pair follows)', () => {
    const c = pair()
    expectSame(corners(c, armTwin(c), { raise: 60 }), mirror(corners(c, 'arm', { raise: 60 })))
    expectDifferent(corners(c, armTwin(c), { raise: 60 }), corners(c, armTwin(c), {}))
  })
  it('raises only the original arm with the original slider, the twin stays where it is at rest', () => {
    const c = apart()
    expectDifferent(corners(c, 'arm', { raise: 60 }), corners(c, 'arm', {}))
    expectSame(corners(c, armTwin(c), { raise: 60 }), corners(c, armTwin(c), {}))
    expectSame(corners(c, armTwin(c), { raise: 60 }), mirror(corners(c, 'arm', {})))
  })
  it('raises only the twin arm with the other side\'s slider, as the mirror image of the original raise', () => {
    const c = apart()
    for (const v of [0, 30, 60, 90]) {
      expectSame(corners(c, armTwin(c), { r_x: v }), mirror(corners(c, 'arm', { raise: v })))
      expectSame(corners(c, 'arm', { r_x: v }), corners(c, 'arm', {}))
    }
  })
  it('lets the two arms be raised by different amounts at once', () => {
    const c = apart()
    expectSame(corners(c, 'arm', { raise: 20, r_x: 80 }), corners(c, 'arm', { raise: 20 }))
    expectSame(corners(c, armTwin(c), { raise: 20, r_x: 80 }), mirror(corners(c, 'arm', { raise: 80 })))
  })
  it('carries the twin forearm with the twin arm, and the original forearm with the original arm', () => {
    const c = apart()
    expectSame(corners(c, foreTwin(c), { r_x: 60 }), mirror(corners(c, 'fore', { raise: 60 })))
    expectSame(corners(c, foreTwin(c), { raise: 60 }), corners(c, foreTwin(c), {}))
    expectSame(corners(c, 'fore', { r_x: 60 }), corners(c, 'fore', {}))
  })
  it('keeps the elbow mirrored while the raise is apart: the bend is the forearm\'s own, relative to its arm', () => {
    const c = apart()
    // the original side raised 50 with the elbow at 90, the twin side not raised with the same elbow: the twin forearm bends just as the original does about its arm
    const twinBent = corners(c, foreTwin(c), { elbow: 90 })
    expectSame(twinBent, mirror(corners(c, 'fore', { elbow: 90 })))
    const both = corners(c, foreTwin(c), { raise: 50, r_x: 50, elbow: 90 })
    expectSame(both, mirror(corners(c, 'fore', { raise: 50, elbow: 90 })))
  })
  it('poses the elbow apart too, in its own slider', () => {
    let c = apart()
    c = must(apartSlider(c, 'elbow', p => `${p}_e`))
    const other = c.ranges.find(r => r.name === 'Elbow bend (other side)')!.id
    expectSame(corners(c, foreTwin(c), { [other]: 100 }), mirror(corners(c, 'fore', { elbow: 100 })))
    expectSame(corners(c, foreTwin(c), { elbow: 100 }), corners(c, foreTwin(c), {}))
    expectSame(corners(c, 'fore', { [other]: 100 }), corners(c, 'fore', {}))
  })
  it('scales one side alone', () => {
    let c = pair()
    c = must(addRange(c, { ...newRange('grow', 'Arm size', 'scale', 'gArm'), min: 50, rest: 100, max: 150 }))
    c = must(addScale(c, 'grow', 'group', 'gArm'))
    const together = corners(c, armTwin(c), { grow: 150 })
    expectSame(together, mirror(corners(c, 'arm', { grow: 150 })))
    c = must(apartSlider(c, 'grow', p => `${p}_g`))
    const other = c.ranges.find(r => r.name === 'Arm size (other side)')!
    expect(other.scope).toBe(twinGroupOf(c, 'gArm'))
    expectSame(corners(c, armTwin(c), { grow: 150 }), corners(c, armTwin(c), {}))
    expectSame(corners(c, armTwin(c), { [other.id]: 150 }), together)
    expectSame(corners(c, 'arm', { [other.id]: 150 }), corners(c, 'arm', {}))
  })
  it('stays finite for any values of either slider', () => {
    const c = must(apartSlider(must(apartSlider(pair(), 'raise', p => `${p}_x`)), 'elbow', p => `${p}_e`))
    const ids = c.ranges.map(r => r.id)
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let k = 0; k < 40; k++) {
      const values: Values = {}
      for (const id of ids) values[id] = (rnd() * 4 - 1) * 60
      const solved = solve(c, values)
      for (const s of c.shapes) for (const p of solved.shapes[s.id].pre) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
      for (const m of Object.values(solved.mats)) expect(m.every(Number.isFinite)).toBe(true)
    }
  })
})

describe('a shape that shows with the slider', () => {
  const creased = () => {
    let c = pair()
    // a crease on the forearm that shows as the elbow bends, and its twin on the other arm
    c = { ...c, shapes: c.shapes.map(x => (x.id === 'fore' ? { ...x, opBy: { slider: 'elbow', hidden: 0, shown: 100 } } : x)) }
    return c
  }
  it('shows on the twin with the slider of the other side once the slider is posed apart', () => {
    const c = must(apartSlider(creased(), 'elbow', p => `${p}_e`))
    const twin = c.shapes.find(s => s.mirrorOf === 'fore')!
    expect(twin.opBy).toMatchObject({ slider: 'r_e', hidden: 0, shown: 100 })
    expect(solve(c, { elbow: 100 }).shapes.fore.fade).toBe(1)
    expect(solve(c, { elbow: 100 }).shapes[twin.id].fade).toBe(0)
    expect(solve(c, { r_e: 100 }).shapes[twin.id].fade).toBe(1)
    expect(solve(c, { r_e: 100 }).shapes.fore.fade).toBe(0)
  })
  it('goes back to following its original when the sides are posed together again', () => {
    const joined = must(joinSides(must(apartSlider(creased(), 'elbow', p => `${p}_e`)), 'elbow'))
    const twin = joined.shapes.find(s => s.mirrorOf === 'fore')!
    expect(twin.opBy ?? null).toBeNull()
    expect(solve(joined, { elbow: 100 }).shapes[twin.id].fade).toBe(1)
  })
})

describe('posing both sides together again', () => {
  it('takes the other side\'s slider away and the original follows its twin once more', () => {
    const start = pair()
    const apart = must(apartSlider(start, 'raise', p => `${p}_x`))
    const joined = must(joinSides(apart, 'raise'))
    expect(joined.ranges.map(r => r.id)).toEqual(['raise', 'elbow'])
    expect(joined.ranges[0].drives.every(d => d.mirror === true)).toBe(true)
    expect(joined).toEqual(start)
    expectSame(corners(joined, armTwin(joined), { raise: 60 }), mirror(corners(joined, 'arm', { raise: 60 })))
  })
  it('works from the other side\'s slider as well', () => {
    const apart = must(apartSlider(pair(), 'raise', p => `${p}_x`))
    const joined = must(joinSides(apart, 'r_x'))
    expect(joined.ranges.map(r => r.id)).toEqual(['raise', 'elbow'])
  })
  it('lets go of what used the other side\'s slider', () => {
    let c = must(apartSlider(pair(), 'raise', p => `${p}_x`))
    c = { ...c, presets: [{ id: 'p', name: 'Wave', kind: 'Pose', values: { raise: 60, r_x: 30 }, hidden: [], scope: null, forms: {}, fall: null, grip: null }] }
    const out = must(joinSides(c, 'raise'))
    expect(out.presets![0].values).toEqual({ raise: 60 })
  })
  it('is refused for a slider that is not posed apart', () => {
    expect(refused(joinSides(pair(), 'raise'))).toMatch(/not posed apart/)
    expect(refused(joinSides(pair(), 'nope'))).toMatch(/no such slider/)
  })
})

describe('posing the other side by dragging', () => {
  const apartBoth = () => must(apartSlider(must(apartSlider(pair(), 'raise', p => `${p}_x`)), 'elbow', p => `${p}_e`))
  const otherId = (c: ModelContent, name: string) => c.ranges.find(r => r.name === name)!.id
  const twinArmGroup = (c: ModelContent) => twinGroupOf(c, 'gArm')!

  it('finds the slider of the twin group itself to drag, and the original\'s slider for a twin that follows its original', () => {
    const c = must(apartSlider(pair(), 'raise', p => `${p}_x`))
    const t = poseTarget(c, twinArmGroup(c))
    expect(t.ok && t.range.id).toBe('r_x')
    expect(t.ok && t.group.id).toBe(twinArmGroup(c))
    // the elbow is still posed together: the twin forearm is turned by the original's elbow slider, as a mirror image
    const f = poseTarget(c, twinGroupOf(c, 'gFore'))
    expect(f.ok && f.range.id).toBe('elbow')
    expect(f.ok && f.group.id).toBe(twinGroupOf(c, 'gFore'))
  })
  it('turns a twin arm the way the pointer sweeps (the slider counts the other way round)', () => {
    const c = must(apartSlider(pair(), 'raise', p => `${p}_x`))
    const solved = solve(c, {}), id = twinArmGroup(c)
    const pv = solved.pivots[id], target = poseTarget(c, id)
    if (!target.ok) throw new Error(target.reason)
    const at = (deg: number): Point => [pv[0] + 30 * Math.cos((deg * Math.PI) / 180), pv[1] + 30 * Math.sin((deg * Math.PI) / 180)]
    const drag = beginTurn(c, solved, {}, target, at(10))!
    expect(drag.sign).toBe(-1)
    const { values } = moveTurn(c, drag, at(50))
    expect(values.raise ?? 0).toBe(0)
    expect(values.r_x).toBeCloseTo(40 * 90 / 80, 1)          // 40 degrees swept = an amount of 40 on a slider that gives 80 at 90
    const m = rotate(40, pv[0], pv[1])
    const rest = corners(c, armTwin(c), {})
    expectSame(corners(c, armTwin(c), values), rest.map(([x, y]): [number, number] => apply(m, x, y)))
  })
  it('turns an original arm as before, and leaves the twin where it is', () => {
    const c = must(apartSlider(pair(), 'raise', p => `${p}_x`))
    const solved = solve(c, {}), target = poseTarget(c, 'gArm')
    if (!target.ok) throw new Error(target.reason)
    const pv = solved.pivots.gArm
    const drag = beginTurn(c, solved, {}, target, [pv[0] + 30, pv[1]])!
    expect(drag.sign).toBe(1)
    const { values } = moveTurn(c, drag, [pv[0], pv[1] - 30])      // swept -90: the arm raises, which the slider gives for -80 at 90
    expect(values.raise).toBeGreaterThan(0)
    expect(values.r_x ?? 0).toBe(0)
  })
  it('scales a twin group that has a Scale slider of its own, and nothing else', () => {
    let c = pair()
    c = must(addRange(c, { ...newRange('grow', 'Arm size', 'scale', 'gArm'), min: 50, rest: 100, max: 150 }))
    c = must(addScale(c, 'grow', 'group', 'gArm'))
    c = must(apartSlider(c, 'grow', p => `${p}_g`))
    const id = twinArmGroup(c), solved = solve(c, {}), pv = solved.pivots[id]
    expect(beginScale(c, solved, {}, id, [pv[0] + 20, pv[1] + 20])).not.toBeNull()
    const drag = beginScale(c, solved, {}, id, [pv[0] + 20, pv[1] + 20])!
    const values = moveScale(c, drag, [pv[0] + 40, pv[1] + 40])
    expect(values.r_g).toBeGreaterThan(100)
    expect(values.grow ?? 100).toBe(100)
    expect(beginScale(pair(), solve(pair(), {}), {}, twinGroupOf(pair(), 'gArm')!, [100, 100])).toBeNull()
  })
  it('reaches with a twin hand through the twin joints, as the original does through its own', () => {
    const c = apartBoth()
    const e = otherId(c, 'Elbow bend (other side)')
    const joints = reachJoints(c, twinGroupOf(c, 'gFore')!)
    expect(joints.map(j => j.range.id)).toEqual([e, 'r_x'])
    expect(reachJoints(c, 'gFore').map(j => j.range.id)).toEqual(['elbow', 'raise'])
    const solved = solve(c, {})
    const tip: Point = [131, 180]
    const posed = apply(solve(c, { raise: 40, elbow: 50 }).mats.gFore, ...grabPoint(solved, 'gFore', tip).local)       // somewhere both joints can get to
    const target: Point = [posed[0], posed[1]]
    const got = reach(c, {}, 'front', grabPoint(solved, 'gFore', tip), target)
    const mirrored = reach(c, {}, 'front', grabPoint(solved, twinGroupOf(c, 'gFore')!, [200 - tip[0], tip[1]]), [200 - target[0], target[1]])
    expect(got.values.raise).toBeGreaterThan(0)
    expect(mirrored.values.r_x).toBeCloseTo(got.values.raise!, 1)
    expect(mirrored.values[e]).toBeCloseTo(got.values.elbow!, 1)
    expect(mirrored.error).toBeCloseTo(got.error, 1)
    expect(got.error).toBeLessThan(1)
  })
  it('reaches with a twin hand of a pair posed together through the original\'s sliders, which bend both arms', () => {
    const c = pair()
    expect(reachJoints(c, twinGroupOf(c, 'gFore')!).map(j => j.range.id)).toEqual(['elbow', 'raise'])
    const solved = solve(c, {}), tip: Point = [200 - 131, 180]
    const posed = apply(solve(c, { raise: 40, elbow: 50 }).mats[twinGroupOf(c, 'gFore')!], ...grabPoint(solved, twinGroupOf(c, 'gFore')!, tip).local)       // somewhere both joints can get to
    const got = reach(c, {}, 'front', grabPoint(solved, twinGroupOf(c, 'gFore')!, tip), [posed[0], posed[1]])
    expect(got.values.raise).toBeGreaterThan(0)
    expect(got.error).toBeLessThan(1)
  })
  it('does not reach with a twin none of whose joints is free: the original moves only its own side and the twin has no slider yet', () => {
    const c = pair(false)
    expect(reachJoints(c, twinGroupOf(c, 'gFore')!)).toEqual([])
    const solved = solve(c, {})
    expect(reach(c, {}, 'front', grabPoint(solved, twinGroupOf(c, 'gFore')!, [60, 180]), [80, 100]).values).toEqual({})
  })
})

describe('a Turn slider moves only its own side', () => {
  it('is what a new Turn drive does, while a scale or a length stays with both sides', () => {
    const c = pair(false)
    expect(c.ranges.every(r => r.drives.every(d => d.mirror === false))).toBe(true)
    let s = must(addRange(c, { ...newRange('grow', 'Arm size', 'scale', 'gArm'), min: 50, rest: 100, max: 150 }))
    s = must(addScale(s, 'grow', 'group', 'gArm'))
    expect(s.ranges.find(r => r.id === 'grow')!.drives[0].mirror).toBe(true)
    const bones = { ...s, bones: [{ id: 'b', name: 'Arm', start: 'gArm', end: { kind: 'group' as const, id: 'gFore', i: 0 } }] }
    const withBone = must(addRange(bones, { ...newRange('len', 'Arm length', 'length'), min: 50, rest: 100, max: 150 }))
    expect(must(addLength(withBone, 'len', 'b')).ranges.find(r => r.id === 'len')!.drives[0].mirror).toBe(true)
  })
  it('turns the original and leaves the twin where it is', () => {
    const c = pair(false)
    expectDifferent(corners(c, 'arm', { raise: 60 }), corners(c, 'arm', {}))
    expectSame(corners(c, armTwin(c), { raise: 60 }), corners(c, armTwin(c), {}))
    expectSame(corners(c, foreTwin(c), { raise: 60, elbow: 70 }), corners(c, foreTwin(c), {}))
  })
  it('still draws the twin as the mirror image of its original at rest, and follows what is not a pose', () => {
    const c = pair(false)
    expectSame(corners(c, armTwin(c), {}), mirror(corners(c, 'arm', {})))
    expectSame(corners(c, foreTwin(c), {}), mirror(corners(c, 'fore', {})))
  })
  it('is told apart from a slider that moves both sides, and from a pair posed apart', () => {
    const one = pair(false), both = pair()
    expect(movesOneSide(one, one.ranges[0])).toBe(true)
    expect(movesBothSides(one, one.ranges[0])).toBe(false)
    expect(oneSided(one, one.ranges[0])).toBe(true)
    expect(movesOneSide(both, both.ranges[0])).toBe(false)
    expect(movesBothSides(both, both.ranges[0])).toBe(true)
    expect(oneSided(both, both.ranges[0])).toBe(false)
    const apart = must(apartSlider(one, 'raise', p => `${p}_x`))
    expect(oneSided(apart, apart.ranges[0])).toBe(false)
    expect(isApart(apart, apart.ranges[0])).toBe(true)
    expect(isApart(apart, apart.ranges[1])).toBe(true)
  })
  it('gets the other side\'s slider from "pose the other side apart" without changing what it already does', () => {
    const one = pair(false)
    expect(whyNotApart(one, one.ranges[0])).toBeNull()
    const out = must(apartSlider(one, 'raise', p => `${p}_x`))
    expect(out.ranges.map(r => r.id)).toEqual(['raise', 'r_x', 'elbow'])
    expect(out.ranges[0].drives[0].mirror).toBe(false)
    expect(out.ranges[1].drives[0]).toMatchObject({ kind: 'turn', group: twinGroupOf(one, 'gArm') })
    expectSame(corners(out, armTwin(out), { r_x: 60 }), mirror(corners(out, 'arm', { raise: 60 })))
    expectSame(corners(out, armTwin(out), { raise: 60 }), corners(out, armTwin(out), {}))
    expect(refused(apartSlider(out, 'raise'))).toMatch(/already posed apart/)
  })
  it('splits only the drives that keep to their side when a slider has both kinds', () => {
    let c = pair(false)
    c = must(addScale(c, 'raise', 'group', 'gFore'))
    expect(c.ranges[0].drives.map(d => d.mirror)).toEqual([false, true])
    const out = must(apartSlider(c, 'raise', p => `${p}_x`))
    expect(out.ranges[1].drives.map(d => d.kind)).toEqual(['turn'])
    expect(out.ranges[0].drives.map(d => d.mirror)).toEqual([false, true])
  })
  it('can be made to move both sides again', () => {
    const one = pair(false)
    const out = must(joinSides(one, 'raise'))
    expect(out.ranges[0].drives.every(d => d.mirror === true)).toBe(true)
    expect(out.ranges).toHaveLength(one.ranges.length)
    expectSame(corners(out, armTwin(out), { raise: 60 }), mirror(corners(out, 'arm', { raise: 60 })))
    expect(refused(joinSides(pair(), 'raise'))).toMatch(/not posed apart/)
  })
  it('publishes', () => {
    expect(publishFaults(named(pair(false)))).toEqual([])
  })
})

describe('one side each', () => {
  it('counts the turns that move both sides, and turns them to one side', () => {
    const c = pair()
    expect(turnsTogether(c)).toBe(2)
    const e = oneSideEach(c)
    const out = must(e)
    expect(e.ok && e.note).toMatch(/2 sliders now move only their own side/)
    expect(turnsTogether(out)).toBe(0)
    expect(out.ranges.every(r => r.drives.every(d => d.mirror === false))).toBe(true)
    expectSame(corners(out, armTwin(out), { raise: 60 }), corners(out, armTwin(out), {}))
  })
  it('leaves a pair posed apart, a scale, and a slider with no twin alone', () => {
    let c = must(apartSlider(pair(), 'raise', p => `${p}_x`))
    c = must(addRange(c, { ...newRange('grow', 'Arm size', 'scale', 'gArm'), min: 50, rest: 100, max: 150 }))
    c = must(addScale(c, 'grow', 'group', 'gArm'))
    c = must(addRange(c, { ...newRange('tilt', 'Tilt', 'turn', 'torso'), min: -20, rest: 0, max: 20 }))
    c = must(addTurn(c, 'tilt', 'torso'))
    const out = must(oneSideEach(c))
    expect(out.ranges.find(r => r.id === 'grow')!.drives[0].mirror).toBe(true)
    expect(out.ranges.find(r => r.id === 'tilt')!.drives[0].mirror).toBe(false)         // a new turn is one-sided anyway
    expect(out.ranges.find(r => r.id === 'elbow')!.drives[0].mirror).toBe(false)
    expect(out.ranges.find(r => r.id === 'r_x')!.drives[0].mirror).toBe(true)
  })
  it('is refused when every slider already does', () => {
    expect(refused(oneSideEach(pair(false)))).toMatch(/already moves only its own side/)
    expect(refused(oneSideEach(blankContent('Empty')))).toMatch(/already moves only its own side/)
  })
})

describe('Pose mode grabs either side', () => {
  const twinArm = (c: ModelContent) => twinGroupOf(c, 'gArm')!
  const twinFore = (c: ModelContent) => twinGroupOf(c, 'gFore')!

  it('finds that a twin of a one-sided slider wants a slider of its own, and that a twin whose original has none does not', () => {
    const c = pair(false)
    const t = poseTarget(c, twinArm(c))
    expect(t).toMatchObject({ ok: false, side: twinArm(c) })
    expect(sideSliderFor(c, twinArm(c), 'turn')?.id).toBe('raise')
    expect(sideSliderFor(c, 'gArm', 'turn')).toBeNull()                      // an original has no other side to make
    expect(sideSliderFor(pair(), twinArm(pair()), 'turn')).toBeNull()        // a twin that follows needs none
  })
  it('makes the slider for the grabbed side, once, and then the twin is turned by it', () => {
    const c = pair(false)
    let n = 0
    const made = poseSides(c, [twinArm(c)], 'turn', p => `${p}_${++n}`)
    expect(made.made).toHaveLength(1)
    expect(made.content.ranges).toHaveLength(c.ranges.length + 1)
    const t = poseTarget(made.content, twinArm(c))
    expect(t.ok && t.range.id).toBe(made.made[0])
    // asking again changes nothing
    const again = poseSides(made.content, [twinArm(c)], 'turn', p => `${p}_${++n}`)
    expect(again.made).toEqual([])
    expect(again.content).toBe(made.content)
    expectSame(corners(made.content, armTwin(c), { [made.made[0]]: 60 }), mirror(corners(made.content, 'arm', { raise: 60 })))
  })
  it('makes the sliders of every joint of a limb for a reach', () => {
    const c = pair(false)
    const out = poseSides(c, [twinFore(c), twinArm(c)], 'turn')
    expect(out.made).toHaveLength(2)
    expect(reachJoints(out.content, twinFore(c)).map(j => j.group.id)).toEqual([twinFore(c), twinArm(c)])
    const solved = solve(out.content, {})
    const tip: Point = [200 - 131, 180]
    const posed = apply(solve(out.content, { [out.made[0]]: 40, [out.made[1]]: 50 }).mats[twinFore(c)], ...grabPoint(solved, twinFore(c), tip).local)       // somewhere both joints can get to
    const got = reach(out.content, {}, 'front', grabPoint(solved, twinFore(c), tip), [posed[0], posed[1]])
    expect(got.error).toBeLessThan(1)
    expect(Object.keys(got.values).every(k => out.made.includes(k))).toBe(true)
  })
  it('makes nothing when the model has no room for another slider', () => {
    const c = pair(false)
    const filler = Array.from({ length: LIMITS.rangesMax - c.ranges.length }, (_, i) => ({ ...newRange(`f${i}`, `F${i}`, 'turn'), drives: [] }))
    const full = { ...c, ranges: [...c.ranges, ...filler] }
    const out = poseSides(full, [twinArm(c)], 'turn')
    expect(out.made).toEqual([])
    expect(poseTarget(out.content, twinArm(c))).toMatchObject({ ok: false })
  })
  it('turns a twin that follows its original as the mirror image: the pointer sweeps against the slider', () => {
    const c = pair()
    const solved = solve(c, {}), id = twinArm(c), pv = solved.pivots[id], target = poseTarget(c, id)
    if (!target.ok) throw new Error(target.reason)
    expect(target.range.id).toBe('raise')
    const at = (deg: number): Point => [pv[0] + 30 * Math.cos((deg * Math.PI) / 180), pv[1] + 30 * Math.sin((deg * Math.PI) / 180)]
    const drag = beginTurn(c, solved, {}, target, at(10))!
    expect(drag.sign).toBe(-1)
    const { values } = moveTurn(c, drag, at(50))
    expect(values.raise).toBeCloseTo(40 * 90 / 80, 1)
    // both arms follow the one slider, mirrored
    expectSame(corners(c, armTwin(c), values), mirror(corners(c, 'arm', values)))
  })
  it('walks past a twin whose original has no Turn slider, up to the group above', () => {
    const c = pair(false)
    // the twin hand-like group below the forearm: it has an original with no slider, so the search goes on to the forearm twin, which wants its own slider
    const t = poseTarget(c, twinFore(c))
    expect(t).toMatchObject({ ok: false, side: twinFore(c) })
  })
  it('shows a ring on a twin group that can be turned and a square on one that can be scaled', () => {
    const c = pair(false)
    expect(canTurn(c, c.groups.find(g => g.id === twinArm(c))!)).toBe(true)
    expect(canTurn(c, c.groups.find(g => g.id === 'torso')!)).toBe(false)
    let s = must(addRange(c, { ...newRange('grow', 'Arm size', 'scale', 'gArm'), min: 50, rest: 100, max: 150 }))
    s = must(addScale(s, 'grow', 'group', 'gArm'))
    expect(canScale(s, s.groups.find(g => g.id === twinArm(c))!)).toBe(true)
    expect(canScale(s, s.groups.find(g => g.id === 'gFore')!)).toBe(false)
  })
  it('scales a twin that follows its original with the original\'s slider, by the same amount', () => {
    let c = pair()
    c = must(addRange(c, { ...newRange('grow', 'Arm size', 'scale', 'gArm'), min: 50, rest: 100, max: 150 }))
    c = must(addScale(c, 'grow', 'group', 'gArm'))
    const id = twinArm(c), solved = solve(c, {}), pv = solved.pivots[id]
    expect(scaleDriver(c, id)?.range.id).toBe('grow')
    const drag = beginScale(c, solved, {}, id, [pv[0] + 20, pv[1] + 20])!
    const values = moveScale(c, drag, [pv[0] + 40, pv[1] + 40])
    expect(values.grow).toBeGreaterThan(100)
  })
  it('makes the slider for a scale only after the scale is posed apart', () => {
    let c = pair()
    c = must(addRange(c, { ...newRange('grow', 'Arm size', 'scale', 'gArm'), min: 50, rest: 100, max: 150 }))
    c = must(addScale(c, 'grow', 'group', 'gArm'))
    expect(poseSides(c, [twinArm(c)], 'scale').made).toEqual([])
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'grow' ? { ...r, drives: r.drives.map(d => ({ ...d, mirror: false })) } : r)) }
    expect(scaleDriver(c, twinArm(c))).toBeNull()
    const out = poseSides(c, [twinArm(c)], 'scale')
    expect(out.made).toHaveLength(1)
    expect(scaleDriver(out.content, twinArm(c))?.range.id).toBe(out.made[0])
  })
})
