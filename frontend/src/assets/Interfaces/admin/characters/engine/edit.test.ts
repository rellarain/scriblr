import { describe, expect, it } from 'vitest'
import type { ModelShape } from '../../../../../api/types'
import { addPoint, applyTemplate, deletePoint, isSymmetric, moveHandle, movePoint, moveShape, newShape, nudgePoint, resetHandles, setMode } from './edit'
import { LIMITS } from './limits'

const BOX = { x: 80, y: 40, w: 40, h: 40 }
const shape = (template = 'circle'): ModelShape => newShape('s1', 'Shape', template, BOX)
const sym = (): ModelShape => ({ ...shape('hexagon'), id: 'sym' })   // hexagon is symmetric about x = 100

describe('new shapes and templates', () => {
  it('a template fills its box and is a closed, finite shape', () => {
    const s = shape('circle')
    expect(s.closed).toBe(true)
    expect(s.template).toBe('circle')
    expect(s.pts).toHaveLength(4)
    for (const p of s.pts) { expect(Number.isFinite(p.x)).toBe(true); expect(p.x).toBeGreaterThanOrEqual(80); expect(p.x).toBeLessThanOrEqual(120) }
  })
  it('applying another template keeps the shape\'s id and name', () => {
    const t = applyTemplate(shape('circle'), 'star', BOX)
    expect(t).toMatchObject({ id: 's1', name: 'Shape', template: 'star' })
    expect(t.pts).toHaveLength(10)
  })
  it('an unknown template changes nothing', () => {
    const s = shape('circle')
    expect(applyTemplate(s, 'nope', BOX).pts).toEqual(s.pts)
  })
})

describe('moving points', () => {
  it('moves one point and leaves the original alone (pure)', () => {
    const s = shape('square')
    const t = movePoint(s, 0, 70, 30)
    expect(t.pts[0]).toMatchObject({ x: 70, y: 30 })
    expect(s.pts[0].x).toBe(80)
  })
  it('snaps to half a unit and pulls to the axis', () => {
    const t = movePoint(shape('square'), 0, 100.7, 30.3, { snap: true })
    expect(t.pts[0]).toMatchObject({ x: 100, y: 30.5 })
  })
  it('a symmetric outline stays symmetric while mirroring', () => {
    const s = sym()
    expect(isSymmetric(s)).toBe(true)
    const t = movePoint(s, 1, 125, 52, { mirror: true })
    expect(isSymmetric(t)).toBe(true)
    const twin = t.pts.findIndex((p, i) => i !== 1 && Math.abs(p.x - 75) < 0.01)
    expect(twin).toBeGreaterThan(-1)
    expect(t.pts[twin].y).toBeCloseTo(52)
    expect(isSymmetric(movePoint(s, 1, 125, 52))).toBe(false)   // without mirroring it is not
  })
  it('a point on the axis stays on it while mirroring', () => {
    const s = sym()
    const top = s.pts.findIndex(p => Math.abs(p.x - 100) < 0.01)
    const t = movePoint(s, top, 107, 35, { mirror: true })
    expect(t.pts[top].x).toBe(100)
  })
  it('nudges by an offset', () => {
    const t = nudgePoint(shape('square'), 2, 0.5, -1)
    expect(t.pts[2].x).toBeCloseTo(120.5); expect(t.pts[2].y).toBeCloseTo(79)
  })
  it('moves the whole shape', () => {
    const s = shape('square'), t = moveShape(s, 5, -5)
    expect(t.pts.map(p => [p.x, p.y])).toEqual(s.pts.map(p => [p.x + 5, p.y - 5]))
  })
})

describe('handles and modes', () => {
  it('dragging a curve point\'s handle keeps its two handles in line', () => {
    const t = moveHandle(shape('circle'), 1, 'ho', 130, 70)
    const p = t.pts[1]
    expect(p.ho).toEqual([10, 10])   // the point is at (120, 60)
    expect(p.hi![0] * p.ho![1] - p.hi![1] * p.ho![0]).toBeCloseTo(0, 1)   // parallel
    expect(p.hi![0] * p.ho![0] + p.hi![1] * p.ho![1]).toBeLessThan(0)      // pointing away from each other
  })
  it('a sharp point\'s handles are independent', () => {
    const s = setMode(shape('circle'), 1, 'cs')
    const before = s.pts[1].hi
    const t = moveHandle(s, 1, 'ho', 130, 70)
    expect(t.pts[1].ho).toEqual([10, 10])
    expect(t.pts[1].hi).toEqual(before)
  })
  it('setting a mode on a mirrored point sets the twin\'s mirrored mode', () => {
    const t = setMode(sym(), 1, 'cs', { mirror: true })
    expect(t.pts.filter(p => p.m === 'cs')).toHaveLength(1)
    expect(t.pts.filter(p => p.m === 'sc')).toHaveLength(1)
  })
  it('resetting handles puts back the automatic ones', () => {
    const t = resetHandles(moveHandle(shape('circle'), 1, 'ho', 130, 70), 1)
    expect(t.pts[1].hi).toBeNull(); expect(t.pts[1].ho).toBeNull()
  })
})

describe('adding and deleting points', () => {
  it('adds a point in the middle of an edge', () => {
    const { shape: t, index } = addPoint(shape('square'), 0)
    expect(index).toBe(1)
    expect(t.pts).toHaveLength(5)
    expect(t.pts[1]).toMatchObject({ x: 100, y: 40 })
  })
  it('adds a pair while mirroring', () => {
    const s = sym()
    const { shape: t } = addPoint(s, 1, { mirror: true })   // the edge between the two right-hand points; its twin edge is on the left
    expect(t.pts.length).toBe(s.pts.length + 2)
    expect(isSymmetric(t)).toBe(true)
  })
  it('stops at the point limit', () => {
    let s = shape('circle')
    for (let k = 0; k < LIMITS.pointsMax + 5; k++) s = addPoint(s, 0).shape
    expect(s.pts).toHaveLength(LIMITS.pointsMax)
    expect(addPoint(s, 0).index).toBe(-1)
  })
  it('deletes a point, and its twin while mirroring, but never below three points', () => {
    const s = sym()
    expect(deletePoint(s, 1)!.pts).toHaveLength(s.pts.length - 1)
    const both = deletePoint(s, 1, { mirror: true })!
    expect(both.pts).toHaveLength(s.pts.length - 2)
    expect(deletePoint(shape('triangle'), 0)).toBeNull()
  })
})
