import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelRange, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup } from '../modelContent'
import { apply, rotate } from './geometry'
import { makeTwin } from './pairEdit'
import { beginScale, beginTurn, grabPoint, moveScale, moveTurn, poseTarget, reach, reachJoints, slideValue, toModel, turnDrivers, turnNow, valueForAmount, type Point } from './pose'
import { amount, solve, valueOf, type Values } from './rig'
import { addRange, addScale, addTurn, attachGroup, newRange, reparent, type Edit } from './rigEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const sharp = (id: string, pts: Array<[number, number]>, over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...over })

const CHEST: Array<[number, number]> = [[70, 86], [130, 86], [130, 160], [70, 160]]
const ARM: Array<[number, number]> = [[124, 90], [138, 90], [138, 140], [124, 140]]
const FORE: Array<[number, number]> = [[125, 140], [137, 140], [137, 186], [125, 186]]
const HAND: Array<[number, number]> = [[126, 186], [136, 186], [136, 200], [126, 200]]

// A torso (chest) with an arm anchored inside its right shoulder, a forearm hanging from the arm and a hand (no slider of its own) from the forearm. Sliders
// lean the torso (both ways), raise the arm (one way: 0 to -80 degrees) and bend the elbow (one way).
function body(): ModelContent {
  let c: ModelContent = {
    ...blankContent('Body'),
    shapes: [sharp('chest', CHEST), sharp('arm', ARM), sharp('fore', FORE), sharp('hand', HAND)],
    objects: [
      { id: 'oChest', name: 'Chest', layer: 'body', shapes: ['chest'] }, { id: 'oArm', name: 'Arm', layer: 'body', shapes: ['arm'] },
      { id: 'oFore', name: 'Forearm', layer: 'body', shapes: ['fore'] }, { id: 'oHand', name: 'Hand', layer: 'body', shapes: ['hand'] },
    ],
    groups: [newGroup('torso', 'Torso', null, ['oChest']), newGroup('gArm', 'Arm', 'torso', ['oArm']), newGroup('gFore', 'Forearm', 'gArm', ['oFore']), newGroup('gHand', 'Hand', 'gFore', ['oHand'])],
  }
  c = must(reparent(c, 'gFore', 'gArm'))
  c = must(attachGroup(c, 'gArm', { shape: 'chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 }))
  c = must(attachGroup(c, 'gFore', { shape: 'arm', kind: 'inside', i: 0, t: 0, slider: null, rx: 0.5, ry: 1 }))
  c = must(attachGroup(c, 'gHand', { shape: 'fore', kind: 'inside', i: 0, t: 0, slider: null, rx: 0.5, ry: 1 }))
  for (const [id, group, lo, hi, atMin, atMax] of [['lean', 'torso', -10, 10, -8, 8], ['raise', 'gArm', 0, 90, 0, -80], ['elbow', 'gFore', 0, 130, 0, -100]] as const) {
    c = must(addRange(c, { ...newRange(id, id, 'turn', group), min: lo, max: hi, rest: 0 }))
    c = must(addTurn(c, id, group))
    c = { ...c, ranges: c.ranges.map(r => (r.id === id ? { ...r, drives: r.drives.map(d => ({ ...d, atMin, atMax })) } : r)) }
  }
  return c
}
const range = (c: ModelContent, id: string): ModelRange => c.ranges.find(r => r.id === id)!
const near = (a: Point, b: Point, tol = 1e-6) => { expect(a[0]).toBeCloseTo(b[0], -Math.log10(tol)); expect(a[1]).toBeCloseTo(b[1], -Math.log10(tol)) }
const endOf = (c: ModelContent, values: Values, groupId: string, local: Point, view: 'front' | 'back' = 'front'): Point => apply(solve(c, values, view).mats[groupId], local[0], local[1])

// ---------------------------------------------------------------------------------------------------- amounts back to values

describe('valueForAmount', () => {
  it('inverts the amount of a drive that moves both ways', () => {
    const c = body(), r = range(c, 'lean'), d = r.drives[0]
    expect(valueForAmount(r, d, 4)).toBe(5)
    expect(valueForAmount(r, d, -4)).toBe(-5)
    expect(valueForAmount(r, d, 0)).toBe(0)
    expect(valueForAmount(r, d, 100)).toBe(10)
    expect(valueForAmount(r, d, -100)).toBe(-10)
    for (let v = r.min; v <= r.max; v += 0.5) expect(valueForAmount(r, d, amount(r, d, v), 0, v)).toBeCloseTo(v, 1)
  })

  it('inverts a drive that moves one way, and keeps the wrong way at rest', () => {
    const c = body(), r = range(c, 'raise'), d = r.drives[0]
    expect(valueForAmount(r, d, -40)).toBe(45)
    expect(valueForAmount(r, d, -80)).toBe(90)
    expect(valueForAmount(r, d, -500)).toBe(90)
    expect(valueForAmount(r, d, 10)).toBe(0)
    for (let v = 0; v <= 90; v += 5) expect(valueForAmount(r, d, amount(r, d, v), 0, v)).toBeCloseTo(v, 1)
  })

  it('works when the rest value is not at the middle or the base is not zero', () => {
    const r: ModelRange = { ...newRange('s', 's', 'scale'), min: 20, rest: 80, max: 140 }
    const d = { ...range(must(addScale(must(addRange(body(), r)), 's', 'model', null)), 's').drives[0], atMin: 50, atMax: 200 }
    for (let v = 20; v <= 140; v += 10) expect(valueForAmount(r, d, amount(r, d, v, 100), 100, v)).toBeCloseTo(v, 1)
    expect(valueForAmount(r, d, 100, 100)).toBe(80)
  })

  it('takes the half nearer to where the slider is when both can give the amount', () => {
    const r: ModelRange = { ...newRange('w', 'w', 'turn'), min: -10, rest: 0, max: 10 }
    const d = { ...range(must(addTurn(must(addRange(body(), r)), 'w', 'torso')), 'w').drives[0], atMin: 20, atMax: 40 }
    expect(valueForAmount(r, d, 20, 0, 6)).toBe(5)
    expect(valueForAmount(r, d, 20, 0, -6)).toBe(-10)
    expect(valueForAmount(r, d, 15, 0, -6)).toBe(-7.5)
    expect(valueForAmount(r, d, 30, 0, -6)).toBe(7.5)           // only the upper half reaches 30: the lower half would stop short at 20
  })

  it('gives rest for a drive that does nothing or an amount that is not a number', () => {
    const r: ModelRange = { ...newRange('f', 'f', 'turn'), min: -10, rest: 0, max: 10 }
    const flat = { ...must(addTurn(must(addRange(body(), r)), 'f', 'torso')).ranges.find(x => x.id === 'f')!.drives[0], atMin: 0, atMax: 0 }
    expect(valueForAmount(r, flat, 12)).toBe(0)
    expect(valueForAmount(range(body(), 'lean'), range(body(), 'lean').drives[0], Number.NaN)).toBe(0)
    expect(valueForAmount(range(body(), 'lean'), range(body(), 'lean').drives[0], Infinity)).toBe(0)
  })
})

describe('which group a drag turns', () => {
  it('turns the group, or the nearest group above it that has a Turn slider', () => {
    const c = body()
    expect(poseTarget(c, 'gArm')).toMatchObject({ ok: true, group: { id: 'gArm' }, range: { id: 'raise' } })
    expect(poseTarget(c, 'gHand')).toMatchObject({ ok: true, group: { id: 'gFore' }, range: { id: 'elbow' } })
    expect(turnDrivers(c, 'torso').map(d => d.range.id)).toEqual(['lean'])
    expect(turnDrivers(c, 'gHand')).toEqual([])
  })

  it('says why nothing turns', () => {
    const none = { ...body(), ranges: [] }
    expect(poseTarget(none, 'gArm')).toMatchObject({ ok: false, reason: expect.stringMatching(/Turn slider/) })
    expect(poseTarget(body(), null)).toMatchObject({ ok: false, reason: expect.stringMatching(/no group/) })
    expect(poseTarget(body(), 'gone')).toMatchObject({ ok: false })
  })

  it('does not pose a twin, or anything under one', () => {
    const c = must(makeTwin(body(), 'group', 'gArm', n => `${n}_tw`))
    const twin = c.groups.find(g => g.mirrorOf === 'gArm')!
    expect(poseTarget(c, twin.id)).toMatchObject({ ok: false, reason: expect.stringMatching(/twin/) })
    expect(reachJoints(c, twin.id)).toEqual([])
  })

  it('adds up several sliders that turn one group', () => {
    let c = body()
    c = must(addRange(c, { ...newRange('extra', 'extra', 'turn', 'gArm'), min: 0, rest: 0, max: 10 }))
    c = must(addTurn(c, 'extra', 'gArm'))
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'extra' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 0, atMax: 20 })) } : r)) }
    expect(turnNow(c, 'gArm', { raise: 45, extra: 5 })).toBeCloseTo(-40 + 10, 6)
  })
})

// ---------------------------------------------------------------------------------------------------- turning

describe('turning a group by dragging', () => {
  const grab: Point = [131, 130]            // a point on the arm

  function drag(c: ModelContent, values: Values, view: 'front' | 'back', sweep: number) {
    const solved = solve(c, values, view)
    const t = poseTarget(c, 'gArm') as Extract<ReturnType<typeof poseTarget>, { ok: true }>
    const p0 = toModel(solved, ...apply(solved.global, ...grab))
    const d0 = beginTurn(c, solved, values, t, p0)!
    const pivot = solved.pivots.gArm
    const p1 = apply(rotate(sweep, pivot[0], pivot[1]), p0[0], p0[1])
    return { solved, d0, p0, p1, moved: moveTurn(c, d0, p1) }
  }

  it('sets the slider so that the part follows the pointer', () => {
    const c = body()
    for (const view of ['front', 'back'] as const) {
      const { solved, p0, p1, moved } = drag(c, {}, view, -20)
      expect(moved.values.raise).toBeCloseTo(22.5, 2)                           // -20 degrees of -80 at the maximum of 90
      const g = grabPoint(solved, 'gArm', p0)
      near(endOf(c, moved.values, 'gArm', g.local, view), p1, 1e-4)             // the grabbed point is under the pointer
    }
  })

  it('starts from where the slider is now, not from rest', () => {
    const c = body()
    const { moved } = drag(c, { raise: 45 }, 'front', -20)
    expect(moved.values.raise).toBeCloseTo(45 + 22.5, 1)
  })

  it('holds the slider to its range and gives the wrong way no turn', () => {
    const c = body()
    expect(drag(c, {}, 'front', -150).moved.values.raise).toBe(90)
    expect(drag(c, {}, 'front', 40).moved.values.raise).toBe(0)
    expect(drag(c, {}, 'front', 0).moved.values.raise).toBe(0)
  })

  it('does not start from another slider\'s values being lost', () => {
    const c = body()
    const { moved } = drag(c, { lean: 6, elbow: 30 }, 'front', -20)
    expect(moved.values).toMatchObject({ lean: 6, elbow: 30 })
  })

  it('carries a sweep past half a turn on, and does nothing with the pointer on the pivot', () => {
    let c = body()
    c = must(addRange(c, { ...newRange('spin', 'spin', 'turn', 'torso'), min: -360, rest: 0, max: 360 }))
    c = must(addTurn(c, 'spin', 'torso'))
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'spin' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: -360, atMax: 360 })) } : r)) }
    const solved = solve(c, {})
    const t = { ...(poseTarget(c, 'torso') as Extract<ReturnType<typeof poseTarget>, { ok: true }>), range: range(c, 'spin'), drive: range(c, 'spin').drives[0] }
    const pivot = solved.pivots.torso
    let d = beginTurn(c, solved, {}, t, [pivot[0] + 30, pivot[1]])!
    let out = { drag: d, values: {} as Values }
    for (let deg = 20; deg <= 200; deg += 20) {
      const p = apply(rotate(deg, pivot[0], pivot[1]), pivot[0] + 30, pivot[1])
      out = moveTurn(c, d, p); d = out.drag
    }
    expect(out.drag.swept).toBeCloseTo(200, 6)
    expect(out.values.spin).toBeCloseTo(200, 1)
    expect(moveTurn(c, d, pivot).values).toEqual(d.start)
  })

  it('gives the same slider whichever way the figure faces', () => {
    const c = body()
    expect(drag(c, {}, 'back', -20).moved.values.raise).toBeCloseTo(drag(c, {}, 'front', -20).moved.values.raise, 6)
  })
})

describe('scaling a group by dragging', () => {
  function sized(axis: 'xy' | 'x' | 'y' = 'xy') {
    let c = body()
    c = must(addRange(c, { ...newRange('size', 'size', 'scale', 'gFore'), min: 50, rest: 100, max: 150 }))
    c = must(addScale(c, 'size', 'group', 'gFore'))
    return { ...c, ranges: c.ranges.map(r => (r.id === 'size' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 50, atMax: 150, axis })) } : r)) }
  }
  const at = (c: ModelContent, values: Values, d: number): { solved: ReturnType<typeof solve>; p: Point } => {
    const solved = solve(c, values), pv = solved.pivots.gFore
    return { solved, p: [pv[0] + d, pv[1]] }
  }

  it('sets the slider by how far the pointer is from the pivot against where it started', () => {
    const c = sized()
    const { solved, p } = at(c, {}, 20)
    const drag = beginScale(c, solved, {}, 'gFore', p)!
    const to = (r: number): Point => [solved.pivots.gFore[0] + 20 * r, solved.pivots.gFore[1]]
    expect(moveScale(c, drag, to(1.25)).size).toBeCloseTo(125, 1)
    expect(moveScale(c, drag, to(0.5)).size).toBeCloseTo(50, 1)
    expect(moveScale(c, drag, to(3)).size).toBe(150)
    expect(moveScale(c, drag, to(0)).size).toBe(50)
  })

  it('starts from the size it has now', () => {
    const c = sized()
    const { solved, p } = at(c, { size: 120 }, 20)
    const drag = beginScale(c, solved, { size: 120 }, 'gFore', p)!
    expect(moveScale(c, drag, [p[0] + 20 * 0.25, p[1]]).size).toBeCloseTo(150, 0)       // 120 percent times 1.25
  })

  it('counts only the way the slider scales', () => {
    const c = sized('x')
    const { solved, p } = at(c, {}, 20)
    const drag = beginScale(c, solved, {}, 'gFore', p)!
    expect(moveScale(c, drag, [p[0] + 10, p[1] + 200]).size).toBeCloseTo(150, 1)       // across 20 -> 30; the vertical move is ignored
    expect(moveScale(c, drag, [p[0], p[1] + 200]).size).toBeCloseTo(100, 1)
  })

  it('has nothing to scale without a Scale slider, or for a twin', () => {
    const c = body()
    expect(beginScale(c, solve(c, {}), {}, 'gFore', [100, 100])).toBeNull()
    expect(beginScale(c, solve(c, {}), {}, 'nothing', [100, 100])).toBeNull()
  })
})

describe('sliding an anchor along its edge by dragging', () => {
  function slid(): ModelContent {
    let c = body()
    c = { ...c, groups: [...c.groups, newGroup('gPin', 'Pin', 'torso', [])] }
    c = must(addRange(c, { ...newRange('along', 'along', 'points', 'gPin'), min: 0, rest: 50, max: 100 }))
    return must(attachGroup(c, 'gPin', { shape: 'chest', kind: 'range', i: 0, t: 0.5, slider: 'along', rx: 0, ry: 0 }))
  }
  it('turns the pointer\'s place along the edge into the slider\'s value', () => {
    const c = slid(), solved = solve(c, {})
    expect(slideValue(c, solved, 'gPin', [100, 90])).toEqual({ rangeId: 'along', value: 50 })        // the top edge runs from x 70 to 130
    expect(slideValue(c, solved, 'gPin', [88, 200])).toEqual({ rangeId: 'along', value: 30 })
    expect(slideValue(c, solved, 'gPin', [0, 0])).toEqual({ rangeId: 'along', value: 0 })
    expect(slideValue(c, solved, 'gPin', [500, 0])).toEqual({ rangeId: 'along', value: 100 })
    const moved = solve(c, { along: 30 })
    expect(moved.anchors.gPin![0]).toBeCloseTo(88, 6)                                                // the value puts the anchor where the pointer was
  })
  it('does nothing for a group that is not slid by a slider', () => {
    expect(slideValue(body(), solve(body(), {}), 'gArm', [100, 100])).toBeNull()
    expect(slideValue(body(), solve(body(), {}), 'nothing', [100, 100])).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------- reaching

describe('reaching with a limb', () => {
  const HAND_GRAB: Point = [131, 198]

  function setup(c = body(), view: 'front' | 'back' = 'front', values: Values = {}) {
    const solved = solve(c, values, view)
    return { solved, grab: grabPoint(solved, 'gHand', apply(solved.mats.gHand, ...HAND_GRAB)) }
  }

  it('chains the joints from the grabbed part up, ignoring groups with no Turn slider', () => {
    const c = body()
    expect(reachJoints(c, 'gHand').map(j => j.group.id)).toEqual(['gFore', 'gArm', 'torso'])
    expect(reachJoints(c, 'gHand', 2).map(j => j.group.id)).toEqual(['gFore', 'gArm'])
    expect(reachJoints(c, 'gone')).toEqual([])
  })

  it('brings the grabbed point to a target the limb can reach', () => {
    const c = body()
    const want: Values = { raise: 50, elbow: 70, lean: 3 }
    const { grab } = setup()
    const target = endOf(c, want, 'gHand', grab.local)
    const got = reach(c, {}, 'front', grab, target)
    expect(got.error).toBeLessThan(0.5)
    const end = endOf(c, got.values, 'gHand', grab.local)
    expect(Math.hypot(end[0] - target[0], end[1] - target[1])).toBeLessThan(0.5)
    for (const r of c.ranges) expect(valueOf(r, got.values)).toBeGreaterThanOrEqual(r.min)
    for (const r of c.ranges) expect(valueOf(r, got.values)).toBeLessThanOrEqual(r.max)
  })

  it('works in the back view', () => {
    const c = body(), { grab } = setup(c, 'back')
    const target = endOf(c, { raise: 40, elbow: 40 }, 'gHand', grab.local, 'back')
    const got = reach(c, {}, 'back', grab, target)
    expect(got.error).toBeLessThan(0.5)
  })

  it('leaves the limb stretched toward a target it cannot reach, inside every range', () => {
    const c = body(), { solved, grab } = setup()
    const start = endOf(c, {}, 'gHand', grab.local)
    const far: Point = [start[0] - 400, start[1] - 300]
    const got = reach(c, {}, 'front', grab, far)
    const end = endOf(c, got.values, 'gHand', grab.local)
    expect(got.error).toBeGreaterThan(50)
    expect(Math.hypot(far[0] - end[0], far[1] - end[1])).toBeLessThan(Math.hypot(far[0] - start[0], far[1] - start[1]))
    for (const r of c.ranges) { const v = valueOf(r, got.values); expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(r.min); expect(v).toBeLessThanOrEqual(r.max) }
    void solved
  })

  it('does not bend a joint the way its slider does not go', () => {
    const c = body(), { grab } = setup()
    const start = endOf(c, {}, 'gHand', grab.local)
    const got = reach(c, {}, 'front', grab, [start[0] + 60, start[1] - 10])      // a target on the side the one-way raise and elbow sliders cannot turn toward
    expect(got.values.raise ?? 0).toBeGreaterThanOrEqual(0)
    expect(got.values.elbow ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('leaves the values alone when there is nothing to bend, the target is already reached, or it is not a number', () => {
    const c = body(), { grab } = setup()
    const here = endOf(c, {}, 'gHand', grab.local)
    expect(reach(c, { lean: 2 }, 'front', grab, endOf(c, { lean: 2 }, 'gHand', grab.local)).values).toEqual({ lean: 2 })
    expect(reach(c, {}, 'front', grab, [Number.NaN, 5]).values).toEqual({})
    expect(reach({ ...c, ranges: [] }, {}, 'front', grab, [here[0] - 50, here[1]]).values).toEqual({})
    const twin = must(makeTwin(c, 'group', 'gArm', n => `${n}_tw`)), tg = twin.groups.find(g => g.mirrorOf === 'gArm')!
    const sol = solve(twin, {})
    expect(reach(twin, {}, 'front', grabPoint(sol, tg.id, [0, 0]), [10, 10]).values).toEqual({})
  })

  it('uses at most four joints', () => {
    let c: ModelContent = { ...blankContent('Chain'), shapes: [], objects: [], groups: [] }
    const ids = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5']
    c = { ...c, shapes: ids.map((id, i) => sharp(`s${i}`, [[100 + i * 30, 50], [120 + i * 30, 50], [120 + i * 30, 60], [100 + i * 30, 60]])) }
    c = { ...c, objects: ids.map((id, i) => ({ id: `o${i}`, name: id, layer: 'body' as const, shapes: [`s${i}`] })) }
    c = { ...c, groups: ids.map((id, i) => newGroup(id, id, i ? ids[i - 1] : null, [`o${i}`])) }
    ids.forEach((id, i) => { if (i) c = must(attachGroup(c, id, { shape: `s${i - 1}`, kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.5 })) })
    for (const id of ids) {
      c = must(addRange(c, { ...newRange(`r_${id}`, id, 'turn', id), min: -90, rest: 0, max: 90 }))
      c = must(addTurn(c, `r_${id}`, id))
      c = { ...c, ranges: c.ranges.map(r => (r.id === `r_${id}` ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: -90, atMax: 90 })) } : r)) }
    }
    const sol = solve(c, {}), grab = grabPoint(sol, 'g5', [sol.shapes.s5.box.x + 10, 55])
    const got = reach(c, {}, 'front', grab, [100, 300])
    const changed = Object.entries(got.values).filter(([, v]) => v !== 0).map(([k]) => k).sort()
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.every(k => ['r_g5', 'r_g4', 'r_g3', 'r_g2'].includes(k))).toBe(true)
  })

  it('gives finite values for any target', () => {
    const c = body(), { grab } = setup()
    for (const t of [[0, 0], [1e6, -1e6], [131, 198], [-5e5, 5e5], [131.0001, 198.0001]] as Point[]) {
      const got = reach(c, {}, 'front', grab, t)
      expect(Number.isFinite(got.error)).toBe(true)
      for (const v of Object.values(got.values)) expect(Number.isFinite(v)).toBe(true)
    }
  })
})
