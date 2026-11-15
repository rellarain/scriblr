import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, starterContent } from '../modelContent'
import { connectedSet, curvePlace, linkHolder, linkShown, sameSegment, sharesCurve } from './connect'
import { frameOf, resizeFrom } from './transform'
import { solveAtRest } from './rig'
import { enableSymmetry } from './symmetry'

// Joints J1: what a fill drag takes along (every connected shape), the points drawn as linked (targets and a symmetric shape's copies too), a side joined along another
// shape's segment drawn with that segment's curve (welded or locked on it), and Ctrl's resize about the middle.

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const weldTo = (s: string, i: number) => ({ kind: 'point' as const, s, i, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 })
const lockOn = (s: string, e: number, t: number) => ({ kind: 'edge' as const, s, i: 0, d: [0, 0] as [number, number], e, t, o: 0 })
function model(...shapes: ModelShape[]): ModelContent {
  let c = addGroup(starterContent('Demo'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}
const withBind = (s: ModelShape, i: number, bind: ModelPoint['bind']): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind } : p)) })

describe('a fill drag', () => {
  it('takes along every shape connected to the shape, either way, through others', () => {
    const a = sharp('a', [[0, 0], [10, 0], [10, 10], [0, 10]])
    const b = withBind(sharp('b', [[10, 0], [20, 0], [20, 10], [10, 10]]), 0, weldTo('a', 1))
    const d = withBind(sharp('d', [[20, 0], [30, 0], [30, 10], [20, 10]]), 0, weldTo('b', 1))
    const e = sharp('e', [[50, 50], [60, 50], [60, 60]])
    const c = model(a, b, d, e)
    expect([...connectedSet(c, 'd')].sort()).toEqual(['a', 'b', 'd'])
    expect([...connectedSet(c, 'a')].sort()).toEqual(['a', 'b', 'd'])
    expect([...connectedSet(c, 'e')]).toEqual(['e'])
  })
})

describe('the points drawn as linked', () => {
  it('are the points that follow, and the points others are welded to', () => {
    const a = sharp('a', [[0, 0], [10, 0], [10, 10], [0, 10]])
    const b = withBind(sharp('b', [[10, 0], [20, 0], [20, 10], [10, 10]]), 3, weldTo('a', 2))
    const c = model(a, b)
    expect(linkShown(c, 'a')).toEqual([2])
    expect(linkShown(c, 'b')).toEqual([3])
  })

  it('are every copy of a symmetric shape\'s linked point, and a copy shows the link of the one that holds it', () => {
    const made = enableSymmetry(sharp('chest', [[60, 40], [140, 40], [140, 120], [60, 120]]), { a: 90, n: 1 }, 0, 60)
    if (!made.ok) throw new Error(made.reason)
    const chest = made.shape, at = chest.pts.findIndex(p => p.x === 60 && p.y === 40)
    const arm = sharp('arm', [[40, 40], [60, 40], [60, 80], [40, 80]])
    const c = model(arm, withBind(chest, at, weldTo('arm', 1)))
    const shown = linkShown(c, 'chest'), twin = chest.pts.findIndex(p => p.x === 140 && p.y === 40)
    expect(shown).toContain(at)
    expect(shown).toContain(twin)
    expect(linkHolder(c.shapes.find(s => s.id === 'chest')!, twin)).toBe(at)
  })
})

describe('a side joined along another shape\'s segment', () => {
  it('reads where on the outline its ends lie, and whether they lie on one segment', () => {
    expect(curvePlace(weldTo('b', 2))).toEqual({ s: 'b', e: 2, t: 0 })
    expect(curvePlace(lockOn('b', 1, 0.25))).toEqual({ s: 'b', e: 1, t: 0.25 })
    expect(curvePlace({ ...weldTo('b', 2), d: [3, 0] })).toBeNull()
    // a weld at point 2 is also the end of segment 1
    expect(sameSegment({ e: 1, t: 0.25 }, { e: 2, t: 0 }, 4, true)).toEqual({ e: 1, ta: 0.25, tb: 1 })
    expect(sameSegment({ e: 0, t: 0 }, { e: 2, t: 0 }, 4, true)).toBeNull()
  })

  it('is drawn with the part of that segment\'s curve between its ends, and marked as shared', () => {
    // B's left side (from (100, 140) up to (100, 100)) bows out to the left: a curve from point 3 to point 0
    const b0 = sharp('b', [[100, 100], [140, 100], [140, 140], [100, 140]])
    const b: ModelShape = { ...b0, pts: b0.pts.map((p, k): ModelPoint => (k === 3 ? { ...p, m: 'sc', ho: [-30, 0] } : k === 0 ? { ...p, m: 'cs', hi: [-30, 0] } : p)) }
    // A's right side, points 1 and 2, locked onto B's segment 3 at a quarter and three quarters of the way
    let a = sharp('a', [[60, 100], [90, 110], [90, 130], [60, 140]])
    a = withBind(withBind(a, 1, lockOn('b', 3, 0.75)), 2, lockOn('b', 3, 0.25))
    const c = model(b, a)
    expect(sharesCurve(c, 'a', 1)).toBe(true)
    expect(sharesCurve(c, 'a', 0)).toBe(false)
    const drawn = solveAtRest(c).shapes.a.local
    // on B's curve, at three quarters: x = 100 - 3·0.75·0.25·30 = 77.5 (the middle of a symmetric bow), and the side bows the same way
    expect(drawn[1].x).toBeCloseTo(100 - 3 * 0.75 * 0.25 * 30, 4)
    expect(drawn[1].ho).not.toBeNull()
    expect(drawn[1].m === 'sc' || drawn[1].m === 'c').toBe(true)
    // A's side runs down, the other way round along B's segment: its handles point along it (the first down, toward the second; the second back up)
    expect(drawn[1].ho![1]).toBeGreaterThan(0)
    expect(drawn[2].hi![1]).toBeLessThan(0)
  })

  it('is straight along a straight segment', () => {
    const b = sharp('b', [[100, 100], [140, 100], [140, 140], [100, 140]])
    let a = sharp('a', [[60, 100], [100, 110], [100, 130], [60, 140]])
    a = withBind(withBind(a, 1, lockOn('b', 3, 0.75)), 2, lockOn('b', 3, 0.25))
    const drawn = solveAtRest(model(b, a)).shapes.a.local
    expect(drawn[1].ho ?? null).toBeNull()
    expect(drawn[2].hi ?? null).toBeNull()
  })
})

describe('a resize with Ctrl', () => {
  it('moves both sides about the middle', () => {
    const s0 = sharp('r', [[10, 20], [50, 20], [50, 50], [10, 50]]), f0 = frameOf(s0)!
    // the right side dragged 10 out: the left side goes 10 out too
    const s = resizeFrom(s0, f0, 'e', 60, 999, { fromMiddle: true })
    const xs = s.pts.map(p => p.x)
    expect(Math.min(...xs)).toBeCloseTo(0, 6)
    expect(Math.max(...xs)).toBeCloseTo(60, 6)
    expect(frameOf(s)!.cx).toBeCloseTo(30, 6)
  })
})
