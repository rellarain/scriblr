import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { build, flatten, inPolygon } from './geometry'
import { allSmooth, cutOutShape, fewestPoints, mergeShapes, outlineGap, reshapeBlock, simplifyTo, smoothAll, smoothPoint, splitShape } from './outlineOps'
import { solve } from './rig'

// Drawing (slice 9b): smoothing a point or the whole outline, simplifying an outline to fewer points within a distance of it, and merging, cutting out and splitting shapes,
// each edge of a result keeping the outline of the edge it lies along.

const sharp = (list: Array<[number, number]>, off: number[] = []): ModelPoint[] => list.map(([x, y], i) => ({ x, y, m: 's' as const, ...(off.includes(i) ? { line: false as const } : {}) }))
const shape = (id: string, pts: ModelPoint[], extra: Partial<ModelShape> = {}): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, outline: 1, pts, ...extra })
const square = (id: string, x: number, y: number, w: number, off: number[] = []) => shape(id, sharp([[x, y], [x + w, y], [x + w, y + w], [x, y + w]], off))
// a circle drawn as 24 sharp points
const polyCircle = (id: string, cx: number, cy: number, r: number) => shape(id, sharp(Array.from({ length: 24 }, (_, k): [number, number] => [cx + r * Math.cos((k * Math.PI) / 12), cy + r * Math.sin((k * Math.PI) / 12)])).map(p => ({ ...p, m: 'c' as const })))
function model(...shapes: ModelShape[]): ModelContent {
  let c = addGroup(blank('Draw'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}
let n = 0
const make = (prefix: string) => `${prefix}_n${++n}`
const polyOf = (s: ModelShape) => flatten(build(s.pts, s.closed), s.closed)
const inside = (s: ModelShape, x: number, y: number) => inPolygon(polyOf(s), x, y)

describe('smoothing', () => {
  it('makes a point, or every point, a smooth curve point with automatic handles', () => {
    const sq = square('a', 60, 100, 40)
    const one = smoothPoint(sq, 1)
    expect(one.pts[1]).toMatchObject({ m: 'c', hi: null, ho: null })
    expect(one.pts[0].m).toBe('s')
    expect(allSmooth(sq)).toBe(false)
    expect(allSmooth(smoothAll(sq))).toBe(true)
  })
})

describe('simplifying', () => {
  it('fits a circle of 24 points with a handful, within a fraction of a unit', () => {
    const c = polyCircle('c', 100, 100, 30)
    expect(fewestPoints(c)).toBeLessThanOrEqual(4)
    const s = simplifyTo(c, 6)
    expect(s.pts.length).toBeLessThanOrEqual(6)
    expect(s.gap).toBeLessThan(1)
    expect(s.gap).toBe(Math.round(outlineGap(c.pts, s.pts, true) * 100) / 100)
  })
  it('keeps the corners of a shape: a square cannot lose one', () => {
    const sq = square('a', 60, 100, 40)
    expect(fewestPoints(sq)).toBe(4)
    const s = simplifyTo(sq, 3)
    expect(s.pts).toHaveLength(4)
    expect(s.gap).toBe(0)
  })
  it('keeps the edges that had no outline without it', () => {
    const sq = { ...polyCircle('c', 100, 100, 30) }
    sq.pts = sq.pts.map((p, i) => (i >= 6 && i < 12 ? { ...p, line: false as const } : p))
    const s = simplifyTo(sq, 8)
    expect(s.pts.some(p => p.line === false)).toBe(true)
    expect(s.pts.some(p => p.line !== false)).toBe(true)
  })
})

describe('what stops reshaping', () => {
  it('a twin, a symmetric shape, skin weights, forms, and shapes connected to it', () => {
    const c = model(square('a', 60, 100, 40), square('b', 120, 100, 40))
    expect(reshapeBlock(c, c.shapes[0])).toBeNull()
    expect(reshapeBlock(c, { ...c.shapes[0], mirrorOf: 'b' })).toMatch(/twin/)
    expect(reshapeBlock(c, { ...c.shapes[0], sym: { a: 90, n: 1, side: 0, cx: 80, cy: 120, m: 2 } })).toMatch(/symmetric/)
    expect(reshapeBlock(c, { ...c.shapes[0], skin: [{ g: 'g', w: [1, 1, 1, 1] }] })).toMatch(/skin/)
    const linked = { ...c, shapes: [c.shapes[0], { ...c.shapes[1], pts: c.shapes[1].pts.map((p, i) => (i === 0 ? { ...p, bind: { kind: 'point' as const, s: 'a', i: 1, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } } : p)) }] }
    expect(reshapeBlock(linked, linked.shapes[0])).toMatch(/connected/)
    expect(reshapeBlock(c, { ...c.shapes[0], closed: false }, true)).toMatch(/open line/)
  })
})

describe('combining', () => {
  it('merges two overlapping squares into one outline and deletes the other', () => {
    const c = model(square('a', 60, 100, 40), square('b', 80, 120, 40))
    const e = mergeShapes(c, solve(c, {}, 'front', {}), 'a', 'b')
    if (!e.ok) throw new Error(e.reason)
    expect(e.content.shapes.map(s => s.id)).toEqual(['a'])
    const a = e.content.shapes[0]
    expect(a.pts.length).toBe(8)
    expect(inside(a, 70, 110)).toBe(true)
    expect(inside(a, 110, 150)).toBe(true)
    expect(inside(a, 110, 105)).toBe(false)
  })
  it('refuses to merge shapes that do not touch', () => {
    const c = model(square('a', 60, 100, 20), square('b', 120, 100, 20))
    const e = mergeShapes(c, solve(c, {}, 'front', {}), 'a', 'b')
    expect(e.ok).toBe(false)
  })
  it('keeps each edge’s outline: an edge without one stays without one', () => {
    const c = model(square('a', 60, 100, 40, [3]), square('b', 80, 120, 40))
    const e = mergeShapes(c, solve(c, {}, 'front', {}), 'a', 'b')
    if (!e.ok) throw new Error(e.reason)
    // the left edge of a, from (60, 140) up to (60, 100), had no outline
    const a = e.content.shapes[0], b = build(a.pts, true)
    const left = a.pts.findIndex((p, i) => p.x === 60 && b[(i + 1) % b.length].x === 60)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(a.pts[left].line).toBe(false)
    expect(a.pts.filter(p => p.line === false)).toHaveLength(1)
  })
  it('cuts a bite out of a shape; the cutter stays', () => {
    const c = model(square('a', 60, 100, 40), square('k', 90, 90, 20))
    const r = cutOutShape(c, solve(c, {}, 'front', {}), 'a', 'k', make)
    if (!r.edit.ok) throw new Error(r.edit.reason)
    const a = r.edit.content.shapes.find(s => s.id === 'a')!
    expect(inside(a, 95, 105)).toBe(false)
    expect(inside(a, 70, 130)).toBe(true)
    expect(r.edit.content.shapes.some(s => s.id === 'k')).toBe(true)
  })
  it('cuts a hole through the paint when the cutter lies wholly inside, and makes the cutter a helper', () => {
    const c = model(square('a', 60, 100, 40), square('k', 75, 115, 10))
    const r = cutOutShape(c, solve(c, {}, 'front', {}), 'a', 'k', make)
    if (!r.edit.ok) throw new Error(r.edit.reason)
    expect(r.edit.content.shapes.find(s => s.id === 'a')!.cut).toEqual(['k'])
    expect(r.edit.content.shapes.find(s => s.id === 'k')!.helper).toBe(true)
  })
  it('cuts a shape in pieces when the cutter runs right across it', () => {
    const c = model(square('a', 60, 100, 40), shape('k', sharp([[50, 115], [110, 115], [110, 125], [50, 125]])))
    const r = cutOutShape(c, solve(c, {}, 'front', {}), 'a', 'k', make)
    if (!r.edit.ok) throw new Error(r.edit.reason)
    expect(r.pieces).toHaveLength(1)
    expect(r.edit.content.shapes.find(s => s.id === r.pieces[0])!.name).toBe('a shape (piece 2)')
  })
  it('splits a shape along a line into two, the edges along the line outlined', () => {
    const c = model(square('a', 60, 100, 40, [0, 1, 2, 3]))
    const r = splitShape(c, solve(c, {}, 'front', {}), 'a', [[50, 120], [110, 120]], make)
    if (!r.edit.ok) throw new Error(r.edit.reason)
    expect(r.pieces).toHaveLength(1)
    const top = r.edit.content.shapes.find(s => s.id === 'a')!, bottom = r.edit.content.shapes.find(s => s.id === r.pieces[0])!
    for (const piece of [top, bottom]) {
      // the square's own edges had no outline; only the cut along y = 120 has one
      const b = build(piece.pts, true)
      const cutEdges = piece.pts.filter((p, i) => Math.abs(p.y - 120) < 0.1 && Math.abs(b[(i + 1) % b.length].y - 120) < 0.1)
      expect(cutEdges).toHaveLength(1)
      expect(cutEdges[0].line).toBeUndefined()
      expect(piece.pts.filter(p => p.line === false).length).toBe(piece.pts.length - 1)
    }
  })
  it('refuses a split along a line that does not cross the shape', () => {
    const c = model(square('a', 60, 100, 40))
    expect(splitShape(c, solve(c, {}, 'front', {}), 'a', [[50, 90], [110, 90]], make).edit.ok).toBe(false)
  })
})
