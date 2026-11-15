import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, starterContent } from '../modelContent'
import { rotate } from './geometry'
import { LINE_MIN, applyOnCanvas, lineOf, sharedLine, stretchMat, widenMat, widthHandle } from './lines'
import { solveAtRest } from './rig'
import { enableSymmetry } from './symmetry'
import { transformShape } from './transform'

// Lines of symmetry as handles (Z5): a symmetric shape's line runs between the two points of its outline on its axis; dragging an end lengthens or shortens the shape along
// it (the far end stays put), symmetric shapes linked to it on the same line stretch with it and keep their shares, and the width handle widens it evenly about its line.

type P = [number, number]
const sharp = (id: string, pts: P[]): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const symmetric = (s: ModelShape, a = 90): ModelShape => {
  const r = enableSymmetry(s, { a, n: 1 }, 0, 60)
  if (!r.ok) throw new Error(r.reason)
  return r.shape
}
const weldTo = (s: string, i: number): ModelPoint['bind'] => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
const withBind = (s: ModelShape, i: number, bind: ModelPoint['bind']): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind } : p)) })
function model(...shapes: ModelShape[]): ModelContent {
  let c = addGroup(starterContent('Demo'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}
const shapeOf = (c: ModelContent, id: string) => c.shapes.find(s => s.id === id)!
// the ends of a line, top first
const ends = (l: { a: P; b: P } | null): [P, P] => {
  if (!l) throw new Error('no line')
  return l.a[1] <= l.b[1] ? [l.a, l.b] : [l.b, l.a]
}
// the point of a shape at a place (its index)
const at = (s: ModelShape, x: number, y: number) => s.pts.findIndex(p => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6)
const xsOf = (c: ModelContent, id: string) => solveAtRest(c).shapes[id].local.map(q => q.x)
const near = (a: P, b: P) => { expect(a[0]).toBeCloseTo(b[0], 5); expect(a[1]).toBeCloseTo(b[1], 5) }
function applied(c: ModelContent, ids: string[], m: ReturnType<typeof stretchMat>): ModelContent {
  if (!m) throw new Error('no stretch')
  const r = applyOnCanvas(c, solveAtRest(c), ids, m)
  if (!r.ok) throw new Error(r.reason)
  return r.content
}

const chest = () => symmetric(sharp('chest', [[40, 20], [60, 20], [60, 40], [40, 40]]))
const belly = () => symmetric(sharp('belly', [[42, 40], [58, 40], [58, 60], [42, 60]]))
// the belly hung on the chest: its top end welded to the chest's bottom end, so the two lie on one line
function torso(): ModelContent {
  const ch = chest(), b = belly()
  return model(ch, withBind(b, at(b, 50, 40), weldTo('chest', at(ch, 50, 40))))
}

describe('a line of symmetry', () => {
  it('runs between the two points of the outline on the axis', () => {
    const c = model(chest())
    const [top, bottom] = ends(lineOf(shapeOf(c, 'chest'), solveAtRest(c)))
    near(top, [50, 20])
    near(bottom, [50, 40])
  })

  it('is not there on a shape with no symmetry, or with more than one axis', () => {
    const plain = sharp('plain', [[0, 0], [10, 0], [10, 10], [0, 10]])
    const r = enableSymmetry(sharp('two', [[20, 0], [40, 0], [40, 20], [20, 20]]), { a: 0, n: 2 }, 1, 60)
    if (!r.ok) throw new Error(r.reason)
    const c = model(plain, r.shape)
    expect(lineOf(shapeOf(c, 'plain'), solveAtRest(c))).toBeNull()
    expect(lineOf(shapeOf(c, 'two'), solveAtRest(c))).toBeNull()
  })
})

describe('dragging an end of the line', () => {
  it('lengthens the shape along it, the other end staying put and the width the same', () => {
    const c = model(chest())
    const [top, bottom] = ends(lineOf(shapeOf(c, 'chest'), solveAtRest(c)))
    // a pointer beside the line: only how far along it counts
    const next = applied(c, ['chest'], stretchMat(top, bottom, [56, 50]))
    const [t2, b2] = ends(lineOf(shapeOf(next, 'chest'), solveAtRest(next)))
    near(t2, [50, 20])
    near(b2, [50, 50])
    expect(Math.min(...xsOf(next, 'chest'))).toBeCloseTo(40, 5)
    expect(Math.max(...xsOf(next, 'chest'))).toBeCloseTo(60, 5)
    expect(shapeOf(next, 'chest').sym).toEqual(expect.objectContaining({ n: 1 }))
  })

  it('shortens it, but never past the far end', () => {
    const c = model(chest())
    const [top, bottom] = ends(lineOf(shapeOf(c, 'chest'), solveAtRest(c)))
    const shorter = applied(c, ['chest'], stretchMat(top, bottom, [50, 30]))
    near(ends(lineOf(shapeOf(shorter, 'chest'), solveAtRest(shorter)))[1], [50, 30])
    const past = applied(c, ['chest'], stretchMat(top, bottom, [50, 0]))
    near(ends(lineOf(shapeOf(past, 'chest'), solveAtRest(past)))[1], [50, 20 + LINE_MIN])
  })

  it('carries the shapes linked to it on the same line, each keeping its share', () => {
    const c = torso(), solved = solveAtRest(c)
    const line = sharedLine(c, solved, 'chest')!
    expect([...line.ids].sort()).toEqual(['belly', 'chest'])
    expect([...sharedLine(c, solved, 'belly')!.ids].sort()).toEqual(['belly', 'chest'])
    const [top, bottom] = ends(line)
    near(top, [50, 20])
    near(bottom, [50, 60])
    // the bottom end from 60 to 80: the line half as long again, about its top
    const next = applied(c, line.ids, stretchMat(top, bottom, [50, 80]))
    const after = solveAtRest(next)
    const [ct, cb] = ends(lineOf(shapeOf(next, 'chest'), after)), [bt, bb] = ends(lineOf(shapeOf(next, 'belly'), after))
    near(ct, [50, 20])
    near(cb, [50, 50])
    near(bt, [50, 50])
    near(bb, [50, 80])
  })

  it('does not carry a shape whose line is turned away from it', () => {
    const ch = chest(), b = belly()
    const leaning = transformShape(b, rotate(10, 50, 40), 10)
    const c = model(ch, withBind(leaning, at(b, 50, 40), weldTo('chest', at(ch, 50, 40))))
    expect(sharedLine(c, solveAtRest(c), 'chest')!.ids).toEqual(['chest'])
  })

  it('takes along the shapes that follow it', () => {
    const ch = chest()
    const arm = withBind(sharp('arm', [[60, 40], [70, 40], [70, 60], [60, 60]]), 0, weldTo('chest', at(ch, 60, 40)))
    const c = model(ch, arm)
    const [top, bottom] = ends(lineOf(shapeOf(c, 'chest'), solveAtRest(c)))
    const next = applied(c, ['chest'], stretchMat(top, bottom, [50, 50]))
    const q = solveAtRest(next).shapes.arm.local[0]
    near([q.x, q.y], [60, 50])
  })
})

describe('the width handle', () => {
  it('sits on the outline across from the middle of the line, clear of the corners', () => {
    const c = model(chest())
    const side = widthHandle(shapeOf(c, 'chest'), solveAtRest(c))!
    expect(Math.abs(side[0] - 50)).toBeCloseTo(10, 5)
    expect(side[1]).toBeCloseTo(30, 5)
  })

  it('widens the shape evenly on both sides of its line', () => {
    const c = model(chest()), solved = solveAtRest(c)
    const line = lineOf(shapeOf(c, 'chest'), solved)!, side = widthHandle(shapeOf(c, 'chest'), solved)!
    const out = Math.sign(side[0] - 50)
    const next = applied(c, ['chest'], widenMat(line, side, [side[0] + out * 5, side[1] + 7]))
    expect(Math.min(...xsOf(next, 'chest'))).toBeCloseTo(35, 5)
    expect(Math.max(...xsOf(next, 'chest'))).toBeCloseTo(65, 5)
    const [top, bottom] = ends(lineOf(shapeOf(next, 'chest'), solveAtRest(next)))
    near(top, [50, 20])
    near(bottom, [50, 40])
  })
})
