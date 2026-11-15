import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup, removeShape } from '../modelContent'
import { followRefusal } from './connect'
import { addCircle, addPivot, circlesOf, movePivotBy, poseOf, radiusOf, setPivotSetting, setRadius } from './pivots'
import { apply } from './geometry'
import { solve, type Solved } from './rig'

// Pivots (shape types T3): circles of different sizes on one pivot point; a shape hung on a circle turns with it round the pivot point, with what hangs on it further out; the
// root's side holds still; a shadow or a light linked to a circle stays where the circle is held.

const box = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })), ...extra,
})
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0 })
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
function bind(s: ModelShape, i: number, b: ModelBind): ModelShape { return { ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) } }

// a body (60..100 across, 40..100 down) with a pivot at (80, 100): circle c1 (radius 12) and c2 (radius 18); an arm below it from 74..86 across, 100..160 down
function figure(): ModelContent {
  let c = addGroup(blank('Pivots'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('body', 60, 40, 40, 60))
  c = addPivot(c, 'o', 80, 100, { pivot: 'p1', circles: ['c1', 'c2'] })
  return addShape(c, 'o', box('arm', 74, 100, 12, 60))
}
// the body hangs on the inner circle and the arm on the outer one (each by a point locked onto the circle)
function hung(): ModelContent {
  const c = figure()
  return { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? bind(s, 3, lock('c1', 0, 0.5)) : s.id === 'arm' ? bind(s, 0, lock('c2', 1, 0.5)) : s)) }
}
const turned = (c: ModelContent, id: string, deg: number) => setPivotSetting(c, id, 'turn', deg)
const near = (a: { x: number; y: number }, x: number, y: number) => { expect(a.x).toBeCloseTo(x, 1); expect(a.y).toBeCloseTo(y, 1) }
// where a shape's points are drawn (its outline through its matrix, which carries the turn)
const drawn = (s: Solved, id: string) => s.shapes[id].local.map(p => { const [x, y] = apply(s.shapes[id].matrix, p.x, p.y); return { x, y } })

describe('a pivot', () => {
  it('is a point with circles of growing sizes round it', () => {
    const c = figure()
    expect(c.pivots).toEqual([{ id: 'p1', name: 'Pivot 1', x: 80, y: 100 }])
    const circles = circlesOf(c, 'p1')
    expect(circles.map(s => s.id)).toEqual(['c1', 'c2'])
    expect(circles.map(s => Math.round(radiusOf(c, s)))).toEqual([12, 18])
    expect(circles[0]).toMatchObject({ kind: 'pivot', pivot: { at: 'p1', turn: 0, lo: -180, hi: 180 } })
  })

  it('takes one more circle, a little bigger, and a circle can be made another size', () => {
    let c = addCircle(figure(), 'p1', 'o', 'c3')!
    expect(Math.round(radiusOf(c, c.shapes.find(s => s.id === 'c3')!))).toBe(24)
    c = setRadius(c, 'c1', 9)
    expect(Math.round(radiusOf(c, c.shapes.find(s => s.id === 'c1')!))).toBe(9)
  })

  it('moves with all its circles', () => {
    const c = movePivotBy(figure(), 'p1', 10, -5)
    expect(c.pivots![0]).toMatchObject({ x: 90, y: 95 })
    for (const s of circlesOf(c, 'p1')) expect(Math.round(radiusOf(c, s))).toBeGreaterThan(0)
    const c1 = c.shapes.find(s => s.id === 'c1')!
    expect(Math.min(...c1.pts.map(p => p.y))).toBeCloseTo(95 - 12, 1)
  })

  it('keeps its turn inside its limits, and the limits keep the rest inside them', () => {
    let c = setPivotSetting(figure(), 'c2', 'hi', 45)
    c = turned(c, 'c2', 90)
    expect(c.shapes.find(s => s.id === 'c2')!.pivot).toMatchObject({ turn: 45, hi: 45 })
    c = setPivotSetting(c, 'c2', 'lo', 20)
    expect(c.shapes.find(s => s.id === 'c2')!.pivot!.lo).toBe(0)
  })

  it('goes when its last circle goes', () => {
    let c = removeShape(figure(), 'c1')
    expect(c.pivots).toHaveLength(1)
    c = removeShape(c, 'c2')
    expect(c.pivots).toEqual([])
  })

  it('follows nothing itself', () => {
    expect(followRefusal(figure(), 'c1', 0, 'body')).toMatch(/pivot circle/)
  })
})

describe('turning a circle', () => {
  it('swings the shape hung on it round the pivot point, and the root side holds still', () => {
    const c = turned(hung(), 'c2', 90)
    const s = solve(c)
    // the arm's far end (80, 160) turns a quarter round (80, 100)
    const arm = drawn(s, 'arm'), body = drawn(s, 'body')
    const far = { x: (arm[2].x + arm[3].x) / 2, y: (arm[2].y + arm[3].y) / 2 }
    near(far, 20, 100)
    near(body[0], 60, 40)
    expect(poseOf(c).points.get('p1')).toEqual([80, 100])
  })

  it('carries what is connected to the turned shape, keeping its angle to it', () => {
    let c = hung()
    c = addShape(c, 'o', bind(box('hand', 74, 160, 12, 12), 0, weld('arm', 3)))
    c = turned(c, 'c2', 90)
    const hand = drawn(solve(c), 'hand')
    // the hand went round with the arm: its top left corner (74, 160) is now at (20, 94)
    near(hand[1], 20, 106)
  })

  it('turns the side away from the root only by how far apart the two circles are', () => {
    const c = turned(turned(hung(), 'c2', 30), 'c1', 30)
    const arm = drawn(solve(c), 'arm')
    near(arm[3], 74, 160)
  })

  it('leaves a shadow linked to the turned circle where the circle is held', () => {
    let c = hung()
    c = addShape(c, 'o', bind(box('shade', 70, 100, 20, 10, { kind: 'shadow', op: 0.3 }), 0, lock('c2', 2, 0.5)))
    const before = drawn(solve(c), 'shade')[0]
    const moved = drawn(solve(turned(c, 'c2', 90)), 'shade')[0]
    // the arm did swing
    expect(drawn(solve(turned(c, 'c2', 90)), 'arm')[3].x).not.toBeCloseTo(74, 0)
    const after = moved
    near(after, before.x, before.y)
  })

  it('does not swing a pivot whose two sides meet again', () => {
    let c = hung()
    // the arm is also connected straight to the body: the two sides of the pivot are one
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'arm' ? bind(s, 1, weld('body', 2)) : s)) }
    c = turned(c, 'c2', 90)
    expect(poseOf(c).blocked.size + (poseOf(c).bodyOf.get('arm') === poseOf(c).bodyOf.get('body') ? 1 : 0)).toBeGreaterThan(0)
    const arm = drawn(solve(c), 'arm')
    near(arm[3], 74, 160)
  })
})
