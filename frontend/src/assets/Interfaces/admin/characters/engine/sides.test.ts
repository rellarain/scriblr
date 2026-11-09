import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, publishFaults } from '../modelContent'
import { rotate, apply } from './geometry'
import { LIMITS } from './limits'
import { makeTwin } from './pairEdit'
import { beginScale, beginTurn, grabPoint, moveScale, moveTurn, poseTarget, reach, reachJoints, type Point } from './pose'
import { solve, type Values } from './rig'
import { addRange, addScale, addTurn, attachGroup, newRange, reparent, type Edit } from './rigEdit'
import { apartSlider, isApart, joinSides, originalSideOf, otherSideOf, twinGroupOf, whyNotApart } from './sidesEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })

const CHEST: Array<[number, number]> = [[70, 86], [130, 86], [130, 160], [70, 160]]
const ARM: Array<[number, number]> = [[124, 90], [138, 90], [138, 140], [124, 140]]
const FORE: Array<[number, number]> = [[125, 140], [137, 140], [137, 186], [125, 186]]

// A torso with an arm and a forearm, twinned (the arm group and the forearm under it get twins); sliders raise the arm, bend the elbow and grow the arm.
function pair(): ModelContent {
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
    c = { ...c, ranges: c.ranges.map(r => (r.id === id ? { ...r, drives: r.drives.map(d => ({ ...d, atMin, atMax })) } : r)) }
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
    expect(isApart(original)).toBe(true)
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

  it('finds the slider of the twin group itself to drag, and stops at a twin that follows its original', () => {
    const c = must(apartSlider(pair(), 'raise', p => `${p}_x`))
    const t = poseTarget(c, twinArmGroup(c))
    expect(t.ok && t.range.id).toBe('r_x')
    expect(t.ok && t.group.id).toBe(twinArmGroup(c))
    const f = poseTarget(c, twinGroupOf(c, 'gFore'))
    expect(f).toMatchObject({ ok: false, reason: expect.stringMatching(/other side apart/) })
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
  it('does not reach with a twin none of whose joints is free', () => {
    const c = pair()
    expect(reachJoints(c, twinGroupOf(c, 'gFore')!)).toEqual([])
    const solved = solve(c, {})
    expect(reach(c, {}, 'front', grabPoint(solved, twinGroupOf(c, 'gFore')!, [60, 180]), [80, 100]).values).toEqual({})
  })
})
