import { describe, expect, it } from 'vitest'
import type { ModelPoint } from '../../../../../api/types'
import {
  IDENTITY, K, apply, autoHandles, bezierAt, boxOf, build, flatten, inPolygon, makePoint, mul, nearestEdge, pathText, reflectList, reflectPoint, rotate, scale,
  symmetric, transformList, translate, twinIndex, windSign,
} from './geometry'

const circle = (): ModelPoint[] => [makePoint(0, -10), makePoint(10, 0), makePoint(0, 10), makePoint(-10, 0)]
const square = (): ModelPoint[] => [makePoint(0, 0, 's'), makePoint(10, 0, 's'), makePoint(10, 10, 's'), makePoint(0, 10, 's')]

describe('matrices', () => {
  it('compose and apply', () => {
    expect(apply(IDENTITY, 3, 4)).toEqual([3, 4])
    expect(apply(translate(5, -2), 1, 1)).toEqual([6, -1])
    const m = mul(translate(10, 0), scale(2, 2, 0, 0))   // scale first, then move
    expect(apply(m, 3, 4)).toEqual([16, 8])
    const r = apply(rotate(90, 0, 0), 1, 0)
    expect(r[0]).toBeCloseTo(0); expect(r[1]).toBeCloseTo(1)
  })
})

describe('the four modes', () => {
  it('four curve points make a circle within a small tolerance', () => {
    const a = build(circle(), true)
    const poly = flatten(a, true)
    for (const [x, y] of poly) expect(Math.abs(Math.hypot(x, y) - 10)).toBeLessThan(0.15)
    expect(K).toBeCloseTo(0.3905)
  })

  it('a sharp square has straight sides and no curves in its path text', () => {
    const d = pathText(build(square(), true), true)
    expect(d).toBe('M0 0L10 0L10 10L0 10L0 0Z')
  })

  it('curve-then-sharp and sharp-then-curve curve one side of the point only', () => {
    const list = [makePoint(0, 0, 's'), makePoint(10, 0, 'cs'), makePoint(10, 10, 's'), makePoint(0, 10, 's')]
    const d = pathText(build(list, true), true)
    // the edge into the second point curves (it has an incoming curve), the edge out of it is a straight line
    expect(d.split('C').length - 1).toBe(1)
    expect(d).toContain('L10 10')
    const list2 = [makePoint(0, 0, 's'), makePoint(10, 0, 'sc'), makePoint(10, 10, 's'), makePoint(0, 10, 's')]
    const d2 = pathText(build(list2, true), true)
    expect(d2.split('C').length - 1).toBe(1)
    expect(d2.startsWith('M0 0L10 0C')).toBe(true)
  })

  it('an explicit handle replaces the automatic one', () => {
    const list = circle()
    list[1] = { ...list[1], ho: [0, 3] }
    expect(autoHandles(list, true)[1].ho).toEqual([0, 3])
    expect(autoHandles(circle(), true)[1].ho[1]).not.toBe(3)
  })
})

describe('hit tests and boxes', () => {
  it('flatten, inPolygon and boxOf agree on a square', () => {
    const poly = flatten(build(square(), true), true)
    expect(inPolygon(poly, 5, 5)).toBe(true)
    expect(inPolygon(poly, 15, 5)).toBe(false)
    expect(boxOf(poly)).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })
  it('an empty polygon has an empty box', () => {
    expect(boxOf([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})

describe('mirroring', () => {
  it('reflecting a point swaps its half-curve modes and handles', () => {
    const p: ModelPoint = { x: 90, y: 10, m: 'cs', hi: [-2, 1], ho: [3, 4] }
    const q = reflectPoint(p, 100)
    expect(q).toMatchObject({ x: 110, y: 10, m: 'sc', hi: [-3, 4], ho: [2, 1] })
  })
  it('a reflected list runs the same way round', () => {
    const list = [makePoint(80, 0, 's'), makePoint(90, 10, 's'), makePoint(85, 20, 's')]
    const r = reflectList(list, 100)
    expect(r.map(p => p.x)).toEqual([115, 110, 120])
    expect(windSign(build(r, true))).toBe(windSign(build(list, true)))
  })
  it('symmetric builds a closed outline from its half', () => {
    const half = [makePoint(100, 0), makePoint(110, 10), makePoint(108, 30), makePoint(100, 40)]
    const full = symmetric(half)
    expect(full).toHaveLength(6)
    const box = boxOf(flatten(build(full, true), true))
    expect(box.x + box.w / 2).toBeCloseTo(100, 0)
  })
  it('twinIndex finds the mirror point, or the point itself', () => {
    const list = [makePoint(90, 5), makePoint(110, 5), makePoint(100, 20)]
    expect(twinIndex(list, 0, 100)).toBe(1)
    expect(twinIndex(list, 1, 100)).toBe(0)
    expect(twinIndex(list, 2, 100)).toBe(2)
    expect(twinIndex([makePoint(90, 5), makePoint(140, 40)], 0, 100)).toBe(0)
  })
})

describe('transforms and edges', () => {
  it('transformList turns handles with the points', () => {
    const list = [{ x: 1, y: 0, m: 'c' as const, hi: [1, 0] as [number, number], ho: [0, 1] as [number, number] }]
    const out = transformList(list, rotate(90, 0, 0))
    expect(out[0].x).toBeCloseTo(0); expect(out[0].y).toBeCloseTo(1)
    expect(out[0].hi?.[0]).toBeCloseTo(0); expect(out[0].hi?.[1]).toBeCloseTo(1)
    expect(list[0].x).toBe(1)   // pure
  })
  it('bezierAt gives the point and the direction of an edge', () => {
    const a = build(square(), true)
    const mid = bezierAt(a, 0, 0.5)
    expect(mid.x).toBeCloseTo(5); expect(mid.y).toBeCloseTo(0)
    expect(mid.tx).toBeCloseTo(1); expect(mid.ty).toBeCloseTo(0)
  })
  it('nearestEdge finds the edge, the place along it and the outward side', () => {
    const hit = nearestEdge(square(), 5, -3)!
    expect(hit.e).toBe(0)
    expect(hit.t).toBeCloseTo(0.5, 1)
    expect(hit.dist).toBeCloseTo(3, 1)
    expect(hit.o).toBeGreaterThan(0)            // outside the square: positive
    expect(nearestEdge(square(), 5, 2)!.o).toBeLessThan(0)   // inside: negative
    expect(nearestEdge([], 0, 0)).toBeNull()
  })
})
