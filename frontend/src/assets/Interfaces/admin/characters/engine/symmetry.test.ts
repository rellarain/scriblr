import { describe, expect, it } from 'vitest'
import type { ModelPoint, ModelShape } from '../../../../../api/types'
import { addPoint, deletePoint, moveHandle, movePoint, moveShape, newShape } from './edit'
import { apply, build, flatten } from './geometry'
import { disableSymmetry, enableSymmetry, followSymmetry, orbitOf, reflectAbout, symmetryOf, wedgeAt } from './symmetry'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { connect, followRefusal } from './connect'
import { solve } from './rig'
import { flipShape, frameOf, setTurn } from './transform'

// Symmetry in the shape editor (S6): the outline made from one wedge's part of it, about one to six axes; edits of any copy going back to the source; turning it off
// keeping the points.

const ok = (r: ReturnType<typeof enableSymmetry>): ModelShape => { if (!r.ok) throw new Error(r.reason); return r.shape }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
// the drawn outline (a dense polyline) is the same after reflecting it across each axis
function symmetricAbout(s: ModelShape, tol = 0.15): boolean {
  const sym = s.sym!, poly = flatten(build(s.pts, true), true)
  for (let k = 0; k < sym.n; k++) {
    const m = reflectAbout(sym.cx, sym.cy, (s.rot ?? 0) + sym.a + (k * 180) / sym.n)
    for (const [x, y] of poly) {
      const [rx, ry] = apply(m, x, y)
      if (!poly.some(([px, py]) => Math.hypot(px - rx, py - ry) < tol + 0.6)) return false
    }
  }
  return true
}
const square = () => newShape('sq', 'Square', 'square', box(60, 100, 40, 40))
const circle = () => newShape('c', 'Circle', 'circle', box(80, 80, 40, 40))

describe('making a shape symmetric', () => {
  it('copies one half of a circle across a vertical axis', () => {
    const s = ok(enableSymmetry(circle(), { a: 90, n: 1 }, 0, 60))
    expect(s.sym).toMatchObject({ a: 90, n: 1, cx: 100, cy: 100 })
    expect(s.pts).toHaveLength(2 * (s.sym!.m + 1))
    expect(symmetricAbout(s)).toBe(true)
  })

  it('copies a quarter of a square four ways about two axes', () => {
    const s = ok(enableSymmetry(square(), { a: 0, n: 2 }, 1, 60))
    // each quarter: a point on each axis (the middles of two sides) and the corner between
    expect(s.sym!.m).toBe(1)
    expect(s.pts).toHaveLength(8)
    expect(symmetricAbout(s)).toBe(true)
    const pts = s.pts.map(p => [p.x, p.y])
    expect(pts).toContainEqual([100, 140])
    expect(pts).toContainEqual([80, 100])
  })

  it('copies a sixth of a hexagon about three axes', () => {
    const s = ok(enableSymmetry(newShape('h', 'Hex', 'hexagon', box(80, 80, 40, 40)), { a: 90, n: 3 }, 0, 60))
    expect(s.pts.length).toBe(6 * (s.sym!.m + 1))
    expect(symmetricAbout(s)).toBe(true)
  })

  it('keeps the side it was asked to keep, and makes the rest from it', () => {
    // a lopsided shape: its right side bulges further than its left
    const lop: ModelShape = { ...square(), pts: [[60, 100], [100, 100], [116, 120], [100, 140], [60, 140]].map(([x, y]): ModelPoint => ({ x, y, m: 's', hi: null, ho: null })) }
    const f = frameOf(lop)!
    const right = ok(enableSymmetry(lop, { a: 90, n: 1 }, wedgeAt(f.cx, f.cy, 0, 90, 1, 115, 120), 60))
    const xs = right.pts.map(p => p.x)
    expect(Math.max(...xs) - f.cx).toBeCloseTo(f.cx - Math.min(...xs), 1)
    expect(Math.max(...xs)).toBeCloseTo(116, 1)
  })

  it('is refused when an axis crosses the outline more than once on a side, or there would be too many points', () => {
    // a U: a level axis through its middle crosses each leg twice, an upright one crosses below the middle twice and not at all above it
    const u: ModelShape = { ...square(), pts: [[60, 60], [80, 60], [80, 120], [120, 120], [120, 60], [140, 60], [140, 140], [60, 140]].map(([x, y]): ModelPoint => ({ x, y, m: 's', hi: null, ho: null })) }
    const r = enableSymmetry(u, { a: 0, n: 1 }, 0, 60)
    expect(r.ok).toBe(false)
    expect(enableSymmetry(u, { a: 90, n: 1 }, 0, 60).ok).toBe(false)
    expect(enableSymmetry(circle(), { a: 0, n: 6 }, 0, 11).ok).toBe(false)
    expect(enableSymmetry(circle(), { a: 0, n: 7 }, 0, 60).ok).toBe(false)
  })
})

describe('editing a symmetric shape', () => {
  const quartered = () => ok(enableSymmetry(square(), { a: 0, n: 2 }, 1, 60))

  it('takes a dragged point of any copy back to the source, and every copy follows', () => {
    const s = quartered()
    // drag the top right corner (a copy, not the source) outward
    const corner = s.pts.findIndex(p => p.x === 100 && p.y === 100)
    expect(corner).toBeGreaterThan(1)
    const moved = followSymmetry(s, movePoint(s, corner, 106, 94)).shape
    expect(symmetricAbout(moved)).toBe(true)
    const pts = moved.pts.map(p => [p.x, p.y])
    for (const c of [[54, 146], [106, 146], [106, 94], [54, 94]]) expect(pts).toContainEqual(c)
  })

  it('keeps a point on an axis on that axis', () => {
    const s = quartered()
    // the point on the right side's middle (on the horizontal axis) dragged up and out: it stays on the axis
    const onAxis = s.pts.findIndex(p => p.x === 100 && p.y === 120)
    const moved = followSymmetry(s, movePoint(s, onAxis, 112, 111)).shape
    expect(moved.pts[onAxis]).toMatchObject({ x: 112, y: 120 })
    expect(symmetricAbout(moved)).toBe(true)
  })

  it('mirrors a curve handle dragged on any copy', () => {
    const s = quartered()
    const corner = 1
    const curved = followSymmetry(s, moveHandle({ ...s, pts: s.pts.map((p, i) => (i === corner ? { ...p, m: 'c' as const } : p)) }, corner, 'ho', s.pts[corner].x + 4, s.pts[corner].y + 6)).shape
    expect(symmetricAbout(curved)).toBe(true)
  })

  it('adds a point to every copy, and deletes one from every copy, but not one on an axis', () => {
    const s = quartered()
    const added = followSymmetry(s, addPoint(s, 5).shape).shape
    expect(added.pts).toHaveLength(12)
    expect(added.sym!.m).toBe(2)
    expect(symmetricAbout(added)).toBe(true)
    const corner = s.pts.findIndex((p, i) => i > 0 && p.x === 60 && p.y === 140)
    const fewer = followSymmetry(s, deletePoint(s, corner)!)
    expect(fewer.refused).toBeUndefined()
    expect(fewer.shape.pts).toHaveLength(4)
    const axisPoint = s.pts.findIndex(p => p.x === 80 && p.y === 140)
    const refused = followSymmetry(s, deletePoint(s, axisPoint)!)
    expect(refused.refused).toMatch(/axis/)
    expect(refused.shape).toBe(s)
  })

  it('keeps every point where it is when symmetry is turned off', () => {
    const s = quartered()
    const off = disableSymmetry(s)
    expect(off.sym).toBeNull()
    expect(off.pts).toEqual(s.pts)
  })

  it('stays symmetric through a move, a turn and a flip, and an edit after them still follows', () => {
    const s = ok(enableSymmetry(circle(), { a: 30, n: 1 }, 0, 60))
    const moved = moveShape(s, 10, -5)
    expect(moved.sym).toMatchObject({ cx: 110, cy: 95 })
    const turned = setTurn(moved, 40)
    expect(turned.rot).toBe(40)
    expect(symmetricAbout(turned)).toBe(true)
    const flipped = flipShape(turned, 'across')
    expect(flipped.sym!.a).toBe(150)
    expect(symmetricAbout(flipped)).toBe(true)
    const edited = followSymmetry(flipped, movePoint(flipped, 2, flipped.pts[2].x + 3, flipped.pts[2].y - 2)).shape
    expect(symmetricAbout(edited)).toBe(true)
  })

  it('is let go when the spec does not fit the points', () => {
    expect(symmetryOf({ a: 0, n: 2, side: 0, cx: 0, cy: 0, m: 1 }, 8)).toMatchObject({ n: 2, m: 1 })
    expect(symmetryOf({ a: 0, n: 2, side: 0, cx: 0, cy: 0, m: 1 }, 7)).toBeNull()
    expect(symmetryOf({ a: 'x', n: 2, m: 1 }, 8)).toBeNull()
    expect(symmetryOf(null, 8)).toBeNull()
  })
})

describe('a symmetric shape whose points follow other shapes (shape types T1)', () => {
  const quartered = () => ok(enableSymmetry(square(), { a: 0, n: 2 }, 1, 60))
  const target: ModelShape = { ...newShape('t', 'Target', 'square', box(130, 60, 20, 20)) }
  function model(s: ModelShape) {
    let c = addGroup(blank('Sym'), newGroup('g', 'Group'))
    c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
    return addShape(addShape(c, 'o', s), 'o', target)
  }

  it('knows the copies of each point', () => {
    const s = quartered()
    expect(orbitOf(s, 1)).toEqual([1, 3, 5, 7])
    expect(orbitOf(s, 0)).toEqual([0, 4])
    expect(orbitOf(s, 2)).toEqual([2, 6])
  })

  it('stays symmetric when a point follows another shape, the copies moving with it', () => {
    const s = quartered()
    const corner = s.pts.findIndex(p => p.x === 100 && p.y === 100)
    const linked = connect(model(s), solve(model(s)), 'sq', corner, { kind: 'point', shapeId: 't', i: 0, x: 130, y: 60 })
    expect(linked.ok).toBe(true)
    if (!linked.ok) return
    const solved = solve(linked.content).shapes.sq
    // the corner is on the target's first point (130, 60), and the outline is still symmetric about the shape's axes
    const local = solved.local
    expect(local[corner].x).toBeCloseTo(130, 1)
    expect(local[corner].y).toBeCloseTo(60, 1)
    expect(symmetricAbout({ ...s, pts: local.map(p => ({ ...p, bind: null })) })).toBe(true)
  })

  it('lets only one copy of a point follow a shape', () => {
    const s = quartered()
    const corner = s.pts.findIndex(p => p.x === 100 && p.y === 100)
    const c = model(s), linked = connect(c, solve(c), 'sq', corner, { kind: 'point', shapeId: 't', i: 0, x: 130, y: 60 })
    if (!linked.ok) throw new Error(linked.reason)
    const other = orbitOf(s, corner).find(j => j !== corner)!
    expect(followRefusal(linked.content, 'sq', other, 't')).toMatch(/Another copy/)
    // a point of another orbit may still follow
    const side = orbitOf(s, 0)[0]
    expect(followRefusal(linked.content, 'sq', side, 't')).toBeNull()
  })

  it('keeps what its points follow when a copy is edited', () => {
    const s = quartered()
    const withBind = { ...s, pts: s.pts.map((p, i) => (i === 1 ? { ...p, bind: { kind: 'point' as const, s: 't', i: 0, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } } : p)) }
    const moved = followSymmetry(withBind, movePoint(withBind, 0, withBind.pts[0].x + 2, withBind.pts[0].y)).shape
    expect(moved.pts[1].bind).toMatchObject({ s: 't', i: 0 })
    expect(moved.pts.filter(p => p.bind)).toHaveLength(1)
  })
})
