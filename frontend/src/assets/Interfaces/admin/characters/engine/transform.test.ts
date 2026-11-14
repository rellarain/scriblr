import { describe, expect, it } from 'vitest'
import type { ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, starterContent, stepShape } from '../modelContent'
import { applyTemplate, newShape } from './edit'
import { solveAtRest } from './rig'
import {
  MIN_SIDE, alignShape, flipShape, frameCorners, frameOf, handleAt, normTurn, resizeFrom, setPlace, setSize, setTurn, transformShape, turnFrom, turnHandleAt,
} from './transform'
import { rotate } from './geometry'

// Transforming a whole shape (shape editor S4): the frame round it turns with it, a resize keeps the opposite side where it was, a turn goes about the middle, the steppers set
// the place, size and angle exactly, and a flip keeps the order of the points.

const rect = (x: number, y: number, w: number, h: number): ModelShape => newShape('r', 'Box', 'rectangle', { x, y, w, h })
const near = (a: number, b: number, d = 2) => expect(a).toBeCloseTo(b, d)
const xs = (s: ModelShape) => s.pts.map(p => p.x)
const ys = (s: ModelShape) => s.pts.map(p => p.y)

describe('the frame of a shape', () => {
  it('is the box round its outline, along its own axes', () => {
    const f = frameOf(rect(10, 20, 40, 30))!
    expect(f).toEqual({ cx: 30, cy: 35, w: 40, h: 30, rot: 0 })
    expect(frameCorners(f)).toEqual([[10, 20], [50, 20], [50, 50], [10, 50]])
  })

  it('turns with the shape, so a turned rectangle keeps its own width and height', () => {
    const turned = turnFrom(rect(10, 20, 40, 30), frameOf(rect(10, 20, 40, 30))!, [70, 35], 30, -5)
    const f = frameOf(turned)!
    near(f.rot, -90)
    near(f.w, 40); near(f.h, 30); near(f.cx, 30); near(f.cy, 35)
  })

  it('places the handles on its sides and corners, a little outside it, and the turn handle above its top', () => {
    const f = frameOf(rect(10, 20, 40, 30))!
    expect(handleAt(f, 'se')).toEqual([50, 50])
    expect(handleAt(f, 'w', 2)).toEqual([8, 35])
    expect(turnHandleAt(f, 5)).toEqual([30, 15])
  })
})

describe('a resize from a handle', () => {
  const s0 = rect(10, 20, 40, 30), f0 = frameOf(s0)!

  it('moves the dragged side and keeps the opposite one where it is', () => {
    const s = resizeFrom(s0, f0, 'e', 70, 999)
    expect(Math.min(...xs(s))).toBe(10)
    expect(Math.max(...xs(s))).toBe(70)
    expect(ys(s)).toEqual(ys(s0))
  })

  it('moves a corner both ways, the opposite corner still', () => {
    const s = resizeFrom(s0, f0, 'nw', 0, 0)
    expect(frameOf(s)).toMatchObject({ w: 50, h: 50 })
    expect(Math.max(...xs(s))).toBe(50)
    expect(Math.max(...ys(s))).toBe(50)
  })

  it('keeps the proportions when asked, from a corner and from a side', () => {
    const corner = frameOf(resizeFrom(s0, f0, 'se', 90, 60, { keep: true }))!
    near(corner.w / corner.h, 40 / 30, 6)
    near(corner.w, 80)
    const side = frameOf(resizeFrom(s0, f0, 'e', 90, 35, { keep: true }))!
    near(side.w, 80); near(side.h, 60)
    // a side keeps the middle of the opposite side where it is
    near(side.cy, 35)
  })

  it('never makes a side smaller than the least, so the shape does not turn inside out', () => {
    const f = frameOf(resizeFrom(s0, f0, 'e', -100, 35))!
    near(f.w, MIN_SIDE)
    expect(Math.min(...xs(resizeFrom(s0, f0, 'e', -100, 35)))).toBe(10)
  })

  it('puts the dragged side on the grid when asked', () => {
    const s = resizeFrom(s0, f0, 'e', 63.4, 35, { grid: 5 })
    expect(Math.max(...xs(s))).toBe(65)
  })

  it('works along the frame of a turned shape', () => {
    const turned = setTurn(s0, 30), f = frameOf(turned)!
    // the right side's handle, dragged 10 further along the frame's own x axis
    const [hx, hy] = handleAt(f, 'e'), a = (30 * Math.PI) / 180
    const after = frameOf(resizeFrom(turned, f, 'e', hx + 10 * Math.cos(a), hy + 10 * Math.sin(a)))!
    near(after.rot, 30); near(after.w, 50); near(after.h, 30)
  })
})

describe('a turn', () => {
  const s0 = rect(10, 20, 40, 30), f0 = frameOf(s0)!

  it('goes about the middle by the angle the pointer sweeps, and turns the frame as much', () => {
    // from the right of the middle to below it: a quarter turn clockwise on screen
    const s = turnFrom(s0, f0, [60, 35], 30, 80)
    near(frameOf(s)!.rot, 90)
    near(frameOf(s)!.cx, 30); near(frameOf(s)!.cy, 35)
    expect(Math.max(...xs(s)) - Math.min(...xs(s))).toBeCloseTo(30, 1)
  })

  it('snaps the angle to steps of 15 degrees when asked', () => {
    const pointer = (deg: number): [number, number] => [30 + 50 * Math.cos((deg * Math.PI) / 180), 35 + 50 * Math.sin((deg * Math.PI) / 180)]
    expect(frameOf(turnFrom(s0, f0, pointer(0), ...pointer(37), true))!.rot).toBe(30)
    expect(frameOf(turnFrom(s0, f0, pointer(0), ...pointer(38), true))!.rot).toBe(45)
  })

  it('turns explicit curve handles with the points', () => {
    const curved: ModelShape = { ...s0, pts: s0.pts.map((p, i): ModelPoint => (i === 0 ? { ...p, m: 'c', hi: [-4, 0], ho: [4, 0] } : p)) }
    const s = transformShape(curved, rotate(90, 0, 0), 90)
    expect(s.pts[0].ho).toEqual([0, 4])
    expect(s.rot).toBe(90)
  })
})

describe('the steppers, flip and align', () => {
  const s0 = rect(10, 20, 40, 30)

  it('set the middle across and down, the width and height about the middle, and the angle', () => {
    expect(frameOf(setPlace(s0, 'x', 100))).toMatchObject({ cx: 100, cy: 35 })
    expect(frameOf(setPlace(s0, 'y', 0))).toMatchObject({ cx: 30, cy: 0 })
    expect(frameOf(setSize(s0, 'w', 60))).toMatchObject({ cx: 30, w: 60, h: 30 })
    expect(frameOf(setSize(s0, 'h', 60, true))).toMatchObject({ w: 80, h: 60 })
    const t = frameOf(setTurn(s0, 45))!
    // the points are kept to two decimals, so a turned box measures within a hundredth or so
    near(t.rot, 45); near(t.w, 40, 1); near(t.h, 30, 1)
    expect(setTurn(s0, 0)).toBe(s0)
  })

  it('flip across or down about the middle, keep the points in their order and the frame at its angle', () => {
    const tri = newShape('t', 'Right', 'triangle-right', { x: 0, y: 0, w: 20, h: 20 })
    const across = flipShape(tri, 'across')
    expect(across.pts.map(p => [p.x, p.y])).toEqual([[20, 0], [0, 20], [20, 20]])
    const down = flipShape(tri, 'down')
    expect(down.pts.map(p => [p.x, p.y])).toEqual([[0, 20], [20, 0], [0, 0]])
    expect(flipShape(flipShape(tri, 'across'), 'across').pts).toEqual(tri.pts)
    const turned = setTurn(tri, 30)
    near(frameOf(flipShape(turned, 'across'))!.rot, 30)
  })

  it('align the middle with the middle of the model', () => {
    expect(frameOf(alignShape(s0, 'x', [100, 200]))).toMatchObject({ cx: 100, cy: 35 })
    expect(frameOf(alignShape(s0, 'y', [100, 200]))).toMatchObject({ cx: 30, cy: 200 })
  })

  it('keep an angle within a turn, and a template starts square to the page', () => {
    expect(normTurn(190)).toBe(-170)
    expect(normTurn(-180)).toBe(-180)
    expect(normTurn(180)).toBe(-180)
    const turned = setTurn(s0, 20)
    expect(applyTemplate(turned, 'square', { x: 0, y: 0, w: 10, h: 10 }).rot).toBe(0)
    expect(normalizeContent({ ...starterContent('A'), shapes: [{ ...s0, rot: 400 }] }).shapes[0].rot).toBe(40)
  })
})

describe('Forward and Back', () => {
  it('move a shape one place within its object, which is the order it is drawn in', () => {
    let c = addGroup(starterContent('Demo'), newGroup('g', 'Group'))
    c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
    for (const id of ['a', 'b', 'c']) c = addShape(c, 'o', newShape(id, id, 'square', { x: 0, y: 0, w: 10, h: 10 }))
    const order = (x: typeof c) => solveAtRest(x).order.filter(id => ['a', 'b', 'c'].includes(id))
    expect(order(c)).toEqual(['a', 'b', 'c'])
    const forward = stepShape(c, 'a', 1)
    expect(forward.objects[0].shapes).toEqual(['b', 'a', 'c'])
    expect(order(forward)).toEqual(['b', 'a', 'c'])
    expect(stepShape(c, 'c', 1)).toBe(c)
    expect(stepShape(c, 'a', -1)).toBe(c)
    expect(stepShape(c, 'c', -1).objects[0].shapes).toEqual(['a', 'c', 'b'])
  })
})
