import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelGroup, ModelRange, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup } from '../modelContent'
import { limitNotes, LIMITS } from './limits'
import { solve } from './rig'
import {
  attachFromClick, addBend, addRange, addScale, addTurn, attachGroup, clearPointMoves, detachGroup, ensurePivot, newRange, recordPoints, removeDrive, removeRange, reparent, setAxis, setPivot,
  stepBendEdge, stepBound, stepDrive, stepOf,
} from './rigEdit'

const poly = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const g = (id: string, parent: string | null, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ ...newGroup(id, id, parent, objects), ...over })

function figure(): ModelContent {
  return {
    ...blankContent('Fig'),
    shapes: [poly('neck', [[90, 60], [110, 60], [110, 90], [90, 90]]), poly('head', [[80, 20], [120, 20], [120, 60], [80, 60]])],
    objects: [{ id: 'oNeck', name: 'Neck', layer: 'body', shapes: ['neck'] }, { id: 'oHead', name: 'Head', layer: 'body', shapes: ['head'] }],
    groups: [g('torso', null, ['oNeck']), g('headG', null, ['oHead'])],
  }
}
const ok = (e: ReturnType<typeof reparent>): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const withRange = (c: ModelContent, r: ModelRange = newRange('r1', 'Tilt', 'turn')): ModelContent => ok(addRange(c, r))
const group = (c: ModelContent, id: string) => c.groups.find(x => x.id === id)!
const range = (c: ModelContent, id = 'r1') => c.ranges.find(x => x.id === id)!

describe('pivots', () => {
  it('sets a pivot held to the model\'s space', () => {
    expect(group(setPivot(figure(), 'headG', 100.123, 999), 'headG').pivot).toEqual([100.12, 450])
  })
  it('gives a group with no pivot the middle of its shapes, and leaves one that has a pivot', () => {
    const c = ensurePivot(figure(), 'headG')
    expect(group(c, 'headG').pivot).toEqual([100, 40])
    expect(ensurePivot(setPivot(c, 'headG', 1, 2), 'headG')).toEqual(setPivot(c, 'headG', 1, 2))
  })
})

describe('hanging groups from each other', () => {
  it('hangs a group from another, and takes it off again', () => {
    const c = ok(reparent(figure(), 'headG', 'torso'))
    expect(group(c, 'headG').parent).toBe('torso')
    expect(group(ok(reparent(c, 'headG', null)), 'headG').parent).toBeNull()
  })
  it('refuses a circle: itself, or one of its own children', () => {
    const c = ok(reparent(figure(), 'headG', 'torso'))
    expect(reparent(c, 'torso', 'torso')).toEqual({ ok: false, reason: 'A group cannot hang from itself.' })
    expect(reparent(c, 'torso', 'headG')).toEqual({ ok: false, reason: 'A group cannot hang from one of its own children.' })
    expect(reparent(c, 'headG', 'ghost').ok).toBe(false)
    expect(reparent(c, 'ghost', 'torso').ok).toBe(false)
  })
  it('allows a chain of six and refuses a seventh level', () => {
    let c: ModelContent = { ...figure(), groups: Array.from({ length: 7 }, (_, i) => g(`g${i}`, null, [])) }
    for (let i = 1; i < 6; i++) c = ok(reparent(c, `g${i}`, `g${i - 1}`))
    const refused = reparent(c, 'g6', 'g5')
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.reason).toBe(`That would make a pivot chain 7 groups long; the most is ${LIMITS.chainMax}.`)
  })
  it('counts what hangs below the group it moves', () => {
    let c: ModelContent = { ...figure(), groups: Array.from({ length: 8 }, (_, i) => g(`g${i}`, null, [])) }
    for (let i = 1; i < 4; i++) c = ok(reparent(c, `g${i}`, `g${i - 1}`))   // g0 > g1 > g2 > g3
    for (let i = 5; i < 8; i++) c = ok(reparent(c, `g${i}`, `g${i - 1}`))   // g4 > g5 > g6 > g7
    expect(reparent(c, 'g4', 'g3').ok).toBe(false)                          // 4 + 4 = 8
    c = ok(reparent(c, 'g7', null))                                         // g4 > g5 > g6
    expect(reparent(c, 'g4', 'g3').ok).toBe(false)                          // 4 + 3 = 7
    c = ok(reparent(c, 'g6', null))                                         // g4 > g5
    expect(reparent(c, 'g4', 'g3').ok).toBe(true)                           // 4 + 2 = 6
  })
  it('drops the anchor when its shape is no longer in the parent or above, and says so', () => {
    let c = ok(reparent(figure(), 'headG', 'torso'))
    c = ok(attachGroup(c, 'headG', { shape: 'neck', kind: 'point', i: 0, t: 0, slider: null, rx: 0.5, ry: 0.5 }))
    const e = reparent(c, 'headG', null)
    expect(e.ok && group(e.content, 'headG').attach).toBeNull()
    expect(e.ok && e.note).toMatch(/anchor was removed/)
  })
})

describe('anchoring a group', () => {
  const hung = () => ok(reparent(figure(), 'headG', 'torso'))
  const at = (over: Record<string, unknown>) => ({ shape: 'neck', kind: 'point' as const, i: 0, t: 0, slider: null, rx: 0.5, ry: 0.5, ...over })
  it('moves the pivot onto the anchor, so the group does not jump', () => {
    const c = ok(attachGroup(setPivot(hung(), 'headG', 100, 60), 'headG', at({ kind: 'point', i: 0 })))
    expect(group(c, 'headG').pivot).toEqual([90, 60])
    solve(c, {}).mats.headG.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 1, 0, 0][i], 6))
  })
  it('reads the other kinds of anchor', () => {
    expect(group(ok(attachGroup(hung(), 'headG', at({ kind: 'edge', i: 0, t: 0.5 }))), 'headG').pivot).toEqual([100, 60])
    expect(group(ok(attachGroup(hung(), 'headG', at({ kind: 'inside', rx: 1, ry: 1 }))), 'headG').pivot).toEqual([110, 90])
  })
  it('lets an anchor slide with a slider, once the slider exists', () => {
    expect(attachGroup(hung(), 'headG', at({ kind: 'range', slider: 'r1' })).ok).toBe(false)
    const c = withRange(hung(), { ...newRange('r1', 'Slide', 'scale'), min: 0, rest: 50, max: 100 })
    expect(attachGroup(c, 'headG', at({ kind: 'range', i: 0, slider: 'r1' })).ok).toBe(true)
  })
  it('refuses what cannot be anchored to', () => {
    expect(attachGroup(figure(), 'headG', at({})).ok).toBe(false)               // no parent yet
    expect(attachGroup(hung(), 'headG', at({ shape: 'ghost' })).ok).toBe(false)
    expect(attachGroup(hung(), 'headG', at({ shape: 'head' })).ok).toBe(false)  // its own shape is not in an ancestor
    expect(attachGroup(hung(), 'ghost', at({})).ok).toBe(false)
  })
  it('detaches', () => {
    const c = ok(attachGroup(hung(), 'headG', at({})))
    expect(group(detachGroup(c, 'headG'), 'headG').attach).toBeNull()
  })
})

describe('an anchor from a click', () => {
  const solved = () => solve(figure(), {})
  it('reads the nearest point, the spot along the nearest edge, or the place inside', () => {
    const s = solved()
    expect(attachFromClick(s, 'point', 'neck', 91, 61)).toMatchObject({ kind: 'point', i: 0, shape: 'neck' })
    expect(attachFromClick(s, 'point', 'neck', 109, 89)).toMatchObject({ i: 2 })
    expect(attachFromClick(s, 'edge', 'neck', 95, 58)).toMatchObject({ kind: 'edge', i: 0, t: 0.25 })
    expect(attachFromClick(s, 'range', 'neck', 110, 80, 'r1')).toMatchObject({ kind: 'range', i: 1, t: 0.67, slider: 'r1' })
    expect(attachFromClick(s, 'inside', 'neck', 100, 75)).toMatchObject({ kind: 'inside', rx: 0.5, ry: 0.5 })
    expect(attachFromClick(s, 'inside', 'neck', 500, -500)).toMatchObject({ rx: 1, ry: 0 })
  })
  it('undoes the whole-model transform first', () => {
    const c = { ...figure(), ranges: [{ ...newRange('h', 'Height', 'scale'), min: 50, rest: 100, max: 100, drives: [{ kind: 'scale' as const, group: null, target: 'model' as const, id: null, axis: 'xy' as const, shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 50, atMax: 100, mirror: true }] }] }
    const small = solve(c, { h: 50 })
    const at = small.shapes.neck.box
    expect(attachFromClick(small, 'point', 'neck', at.x, at.y)).toMatchObject({ i: 0 })
  })
  it('gives nothing for a shape that is not there', () => { expect(attachFromClick(solved(), 'point', 'ghost', 1, 1)).toBeNull() })
})

describe('sliders', () => {
  it('starts a slider with a span that suits what it will drive', () => {
    expect(newRange('a', 'A', 'turn')).toMatchObject({ min: -30, rest: 0, max: 30, unit: '°' })
    expect(newRange('a', 'A', 'scale')).toMatchObject({ min: 50, rest: 100, max: 150, unit: '%' })
    expect(newRange('a', 'A', 'points')).toMatchObject({ min: 0, rest: 0, max: 100, unit: '' })
  })
  it('refuses a duplicate and more than the limit', () => {
    const c = withRange(figure())
    expect(addRange(c, newRange('r1', 'Again', 'turn')).ok).toBe(false)
    let many = figure()
    for (let i = 0; i < LIMITS.rangesMax; i++) many = ok(addRange(many, newRange(`s${i}`, `S${i}`, 'turn')))
    expect(addRange(many, newRange('over', 'Over', 'turn'))).toEqual({ ok: false, reason: `A model may have at most ${LIMITS.rangesMax} sliders.` })
  })
  it('will not remove a slider an anchor slides with', () => {
    let c = withRange(ok(reparent(figure(), 'headG', 'torso')), { ...newRange('r1', 'Slide', 'scale'), min: 0, rest: 50, max: 100 })
    c = ok(attachGroup(c, 'headG', { shape: 'neck', kind: 'range', i: 0, t: 0, slider: 'r1', rx: 0.5, ry: 0.5 }))
    expect(removeRange(c, 'r1').ok).toBe(false)
    expect(removeRange(detachGroup(c, 'headG'), 'r1').ok).toBe(true)
  })
  it('steps the minimum, rest and maximum, keeping them in order', () => {
    let c = withRange(figure())   // -30 / 0 / 30 degrees
    expect(range(stepBound(c, 'r1', 'max', 1), 'r1').max).toBe(31)
    expect(range(stepBound(c, 'r1', 'max', 1, true), 'r1').max).toBe(35)
    expect(range(stepBound(c, 'r1', 'min', -1), 'r1').min).toBe(-31)
    c = stepBound(stepBound(c, 'r1', 'min', 1, true), 'r1', 'min', 1, true)   // -30 + 5 + 5 = -20
    expect(range(c).min).toBe(-20)
    for (let i = 0; i < 30; i++) c = stepBound(c, 'r1', 'min', 1, true)
    expect(range(c).min).toBe(0)                                               // stops at rest
    for (let i = 0; i < 60; i++) c = stepBound(c, 'r1', 'max', -1, true)
    expect(range(c).max).toBe(1)                                               // stops one step above the minimum
    c = stepBound(c, 'r1', 'rest', 1)
    expect(range(c).rest).toBe(1)
  })
  it('steps finer for a slider with no unit', () => {
    expect(stepOf({ ...newRange('a', 'A', 'points'), max: 10 })).toBe(0.5)
    expect(stepOf(newRange('a', 'A', 'points'))).toBe(1)
    expect(stepOf(newRange('a', 'A', 'turn'), true)).toBe(5)
  })
})

describe('what a slider drives', () => {
  it('turns a group, and makes sure the group has a pivot to turn about', () => {
    const c = ok(addTurn(withRange(figure()), 'r1', 'headG'))
    expect(range(c).drives[0]).toMatchObject({ kind: 'turn', group: 'headG', atMin: -20, atMax: 20 })
    expect(group(c, 'headG').pivot).toEqual([100, 40])
    expect(addTurn(withRange(figure()), 'r1', 'ghost').ok).toBe(false)
    expect(addTurn(figure(), 'nope', 'headG').ok).toBe(false)
  })
  it('scales a group, a shape or the model', () => {
    const c = withRange(figure(), newRange('r1', 'Size', 'scale'))
    expect(ok(addScale(c, 'r1', 'model')).ranges[0].drives[0]).toMatchObject({ kind: 'scale', target: 'model', id: null, atMin: 80, atMax: 120 })
    expect(ok(addScale(c, 'r1', 'shape', 'head')).ranges[0].drives[0]).toMatchObject({ target: 'shape', id: 'head' })
    expect(ok(addScale(c, 'r1', 'group', 'headG')).ranges[0].drives[0]).toMatchObject({ target: 'group', id: 'headG' })
    expect(addScale(c, 'r1', 'shape', 'ghost').ok).toBe(false)
    expect(addScale(c, 'r1', 'group', 'ghost').ok).toBe(false)
  })
  it('bends a shape along a length inside its box', () => {
    const c = ok(addBend(withRange(figure()), 'r1', 'neck'))
    const d = range(c).drives[0]
    expect(d).toMatchObject({ kind: 'bend', shape: 'neck', pivot: [100, 75], atMin: -30, atMax: 30 })
    expect(d.y0).toBeGreaterThanOrEqual(60); expect(d.y1).toBeLessThanOrEqual(90); expect(d.y0).toBeLessThan(d.y1)
    expect(addBend(withRange(figure()), 'r1', 'ghost').ok).toBe(false)
  })
  it('stops at the most a slider may drive', () => {
    let c = withRange(figure())
    for (let i = 0; i < LIMITS.drivesMax; i++) c = ok(addTurn(c, 'r1', 'headG'))
    expect(addTurn(c, 'r1', 'headG')).toEqual({ ok: false, reason: `A slider may drive at most ${LIMITS.drivesMax} things.` })
  })
  it('removes a drive and steps what it does, within sensible bounds', () => {
    let c = ok(addTurn(withRange(figure()), 'r1', 'headG'))
    c = stepDrive(c, 'r1', 0, 'atMax', 1, true)
    expect(range(c).drives[0].atMax).toBe(25)
    for (let i = 0; i < 100; i++) c = stepDrive(c, 'r1', 0, 'atMax', 1, true)
    expect(range(c).drives[0].atMax).toBe(360)
    let s = ok(addScale(withRange(figure(), newRange('r1', 'S', 'scale')), 'r1', 'model'))
    for (let i = 0; i < 100; i++) s = stepDrive(s, 'r1', 0, 'atMin', -1, true)
    expect(range(s).drives[0].atMin).toBe(5)
    expect(range(removeDrive(c, 'r1', 0)).drives).toEqual([])
  })
  it('moves the start and end of a bend without crossing them', () => {
    let c = ok(addBend(withRange(figure()), 'r1', 'neck'))
    const { y0, y1 } = range(c).drives[0]
    for (let i = 0; i < 100; i++) c = stepBendEdge(c, 'r1', 0, 'y0', 1, true)
    expect(range(c).drives[0].y0).toBe(y1)
    for (let i = 0; i < 100; i++) c = stepBendEdge(c, 'r1', 0, 'y1', -1, true)
    expect(range(c).drives[0].y1).toBe(y1)
    expect(y0).toBeLessThan(y1)
  })
})

describe('recording points', () => {
  const dragged = (c: ModelContent, shapeId: string, moves: Record<number, [number, number]>): ModelShape => {
    const s = c.shapes.find(x => x.id === shapeId)!
    return { ...s, pts: s.pts.map((p, i) => (moves[i] ? { ...p, x: p.x + moves[i][0], y: p.y + moves[i][1] } : p)) }
  }
  const base = () => withRange(figure(), newRange('r1', 'Shoulders', 'points'))
  it('writes the moves at the maximum, and the solver then moves those points', () => {
    const c0 = base()
    const c = ok(recordPoints(c0, 'r1', 'neck', 'max', dragged(c0, 'neck', { 1: [6, -2], 2: [6, 0] })))
    expect(range(c).drives[0]).toMatchObject({ kind: 'points', shape: 'neck' })
    expect(range(c).drives[0].moves).toEqual([{ i: 1, dx: 6, dy: -2, dxMin: 0, dyMin: 0 }, { i: 2, dx: 6, dy: 0, dxMin: 0, dyMin: 0 }])
    const s = solve(c, { r1: 100 }).shapes.neck
    expect(s.local[1].x).toBeCloseTo(116); expect(s.local[1].y).toBeCloseTo(58)
    expect(solve(c, { r1: 50 }).shapes.neck.local[1].x).toBeCloseTo(113)
    expect(solve(c, { r1: 0 }).shapes.neck.local[1].x).toBeCloseTo(110)
  })
  it('keeps the other end of a point already recorded, and a re-record replaces its end', () => {
    const c0 = base()
    let c = ok(recordPoints(c0, 'r1', 'neck', 'max', dragged(c0, 'neck', { 1: [6, 0] })))
    c = ok(recordPoints(c, 'r1', 'neck', 'min', dragged(c, 'neck', { 1: [-4, 1] })))
    expect(range(c).drives).toHaveLength(1)
    expect(range(c).drives[0].moves).toEqual([{ i: 1, dx: 6, dy: 0, dxMin: -4, dyMin: 1 }])
    c = ok(recordPoints(c, 'r1', 'neck', 'max', dragged(c, 'neck', { 2: [3, 0] })))   // the maximum is now just point 2
    expect(range(c).drives[0].moves).toEqual([{ i: 1, dx: 0, dy: 0, dxMin: -4, dyMin: 1 }, { i: 2, dx: 3, dy: 0, dxMin: 0, dyMin: 0 }])
  })
  it('refuses when nothing moved or the points changed in number', () => {
    const c = base()
    expect(recordPoints(c, 'r1', 'neck', 'max', c.shapes[0])).toEqual({ ok: false, reason: 'No point was moved.' })
    const more = { ...c.shapes[0], pts: [...c.shapes[0].pts, { x: 1, y: 1, m: 's' as const }] }
    expect(recordPoints(c, 'r1', 'neck', 'max', more).ok).toBe(false)
    expect(recordPoints(c, 'ghost', 'neck', 'max', c.shapes[0]).ok).toBe(false)
  })
  it('drops the recorded moves of a shape whose points changed, naming their sliders', () => {
    const c0 = base()
    const c = ok(recordPoints(c0, 'r1', 'neck', 'max', dragged(c0, 'neck', { 1: [6, 0] })))
    const r = clearPointMoves(c, 'neck')
    expect(r.cleared).toEqual(['Shoulders'])
    expect(range(r.content).drives).toEqual([])
    expect(clearPointMoves(c, 'head').content).toBe(c)
  })
})

describe('the mirror line and the limit notes', () => {
  it('holds the mirror line between 40 and 160', () => {
    expect(setAxis(figure(), 12).axis).toBe(40); expect(setAxis(figure(), 400).axis).toBe(160); expect(setAxis(figure(), 97.456).axis).toBe(97.46); expect(setAxis(figure(), NaN).axis).toBe(100)
  })
  it('warn above 40 sliders and stop at 80, 12 and 24 drives, and say when a chain is as long as it may be', () => {
    let c = figure()
    for (let i = 0; i < 41; i++) c = ok(addRange(c, newRange(`s${i}`, `S${i}`, 'turn')))
    expect(limitNotes(c).some(n => n.level === 'warn' && /41 sliders/.test(n.text))).toBe(true)
    let d = withRange(figure())
    for (let i = 0; i < 13; i++) d = ok(addTurn(d, 'r1', 'headG'))
    expect(limitNotes(d).some(n => n.level === 'warn' && /13 things/.test(n.text))).toBe(true)
    let chain: ModelContent = { ...figure(), groups: Array.from({ length: 6 }, (_, i) => g(`g${i}`, i ? `g${i - 1}` : null, [])) }
    expect(limitNotes(chain).some(n => n.level === 'warn' && /6 levels deep/.test(n.text))).toBe(true)
    chain = { ...chain, groups: [...chain.groups, g('g6', 'g5', [])] }
    expect(limitNotes(chain).some(n => n.level === 'stop' && /7 levels deep/.test(n.text))).toBe(true)
  })
})
