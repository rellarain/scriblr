import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, shapeById, starterContent } from '../modelContent'
import {
  addPointShared, connect, disconnect, dropTargetAt, handleHome, isConnected, loosen, nameConnection, rebindByPlace, rootOf, segmentHome, sharedSegment, sharersOf, slideOnEdge,
  weldTree, weldedTo, type DropTarget,
} from './connect'
import { addPoint, deletePoint } from './edit'
import { build } from './geometry'
import { solveAtRest } from './rig'
import type { Edit } from './rigEdit'

// Connections in the shape editor (S5): what a dragged point is over, welding and locking it there, dragging what is connected, pulling it free, shared segments drawn as
// one curve, and keeping connections when the points of a shape change.

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// A is 60..100 across and 100..140 down; B is 100..140 across and 100..140 down (they touch along x = 100); C is far away.
function three(): ModelContent {
  let c = addGroup(starterContent('Demo'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
  c = addShape(c, 'o', sharp('b', [[100, 100], [140, 100], [140, 140], [100, 140]]))
  return addShape(c, 'o', sharp('c', [[0, 0], [10, 0], [10, 10], [0, 10]]))
}
const pt = (c: ModelContent, s: string, i: number): ModelPoint => shapeById(c, s)!.pts[i]
const drawn = (c: ModelContent, s: string) => solveAtRest(c).shapes[s].local
const weld = (c: ModelContent, s: string, i: number, t: string, j: number): ModelContent => {
  const solved = solveAtRest(c), at = build(solved.shapes[t].local, true, solved.shapes[t].matrix)[j]
  return must(connect(c, solved, s, i, { kind: 'point', shapeId: t, i: j, x: at.x, y: at.y }))
}

describe('what a dragged point is over', () => {
  it('is a point of another shape within reach, before a segment, and never the dragged shape', () => {
    const c = three(), solved = solveAtRest(c)
    expect(dropTargetAt(c, solved, 'a', 141, 101, 3)).toMatchObject({ kind: 'point', shapeId: 'b', i: 1 })
    expect(dropTargetAt(c, solved, 'a', 120, 101, 3)).toMatchObject({ kind: 'edge', shapeId: 'b', e: 0 })
    // the middle of B is its centre (C1), offered as well; elsewhere inside it there is nothing
    expect(dropTargetAt(c, solved, 'a', 120, 120, 3)).toMatchObject({ kind: 'center', shapeId: 'b' })
    expect(dropTargetAt(c, solved, 'a', 130, 130, 3)).toBeNull()
    // A's own point at (60, 100) is not offered while A is dragged
    expect(dropTargetAt(c, solved, 'a', 60, 100, 3)).toBeNull()
  })

  it('leaves out the points that move with the dragged one, and the segments of their shapes', () => {
    const c = weld(three(), 'a', 1, 'b', 0), solved = solveAtRest(c)
    const moving = weldTree(c, 'b', 0)
    expect([...moving]).toEqual(['a:1'])
    expect(dropTargetAt(c, solved, 'b', 100, 100, 3, moving)).toBeNull()
  })
})

describe('connecting a dropped point', () => {
  it('welds it to a point of another shape: it sits on it and follows it', () => {
    const c = weld(three(), 'a', 1, 'b', 1)
    expect(pt(c, 'a', 1).bind).toMatchObject({ kind: 'point', s: 'b', i: 1, d: [0, 0] })
    expect(drawn(c, 'a')[1]).toMatchObject({ x: 140, y: 100 })
    const moved = { ...c, shapes: c.shapes.map(s => (s.id === 'b' ? { ...s, pts: s.pts.map((p, k) => (k === 1 ? { ...p, x: 150, y: 90 } : p)) } : s)) }
    expect(drawn(moved, 'a')[1]).toMatchObject({ x: 150, y: 90 })
    expect(isConnected(c, 'a', 1) && isConnected(c, 'b', 1)).toBe(true)
    expect(weldedTo(c, 'b', 1)).toEqual([{ shapeId: 'a', i: 1 }])
  })

  it('welds to the root of a point that is itself welded, so every point of a weld follows one', () => {
    let c = weld(three(), 'a', 1, 'b', 0)
    c = weld(c, 'c', 2, 'a', 1)
    expect(pt(c, 'c', 2).bind).toMatchObject({ s: 'b', i: 0 })
    expect(rootOf(c, 'c', 2)).toEqual({ shapeId: 'b', i: 0 })
  })

  it('welds the other way round when this way would go round in a circle', () => {
    let c = weld(three(), 'a', 1, 'b', 0)
    // B's point 3 dropped on A's point 2: B cannot follow A (A follows B), so A's point follows B's
    c = weld(c, 'b', 3, 'a', 2)
    expect(pt(c, 'b', 3).bind).toBeFalsy()
    expect(pt(c, 'a', 2).bind).toMatchObject({ s: 'b', i: 3 })
  })

  it('refuses a point of its own shape', () => {
    const c = three(), solved = solveAtRest(c)
    const r = connect(c, solved, 'a', 0, { kind: 'point', shapeId: 'a', i: 1, x: 100, y: 100 })
    expect(r.ok).toBe(false)
  })

  it('locks it onto a segment where it was dropped, and it slides along that segment only', () => {
    const c0 = three(), solved0 = solveAtRest(c0)
    const target: DropTarget = { kind: 'edge', shapeId: 'b', e: 0, t: 0.25, x: 110, y: 100 }
    const c = must(connect(c0, solved0, 'a', 0, target))
    expect(pt(c, 'a', 0).bind).toMatchObject({ kind: 'edge', s: 'b', e: 0, t: 0.25, o: 0 })
    expect(drawn(c, 'a')[0]).toMatchObject({ x: 110, y: 100 })
    const slid = slideOnEdge(c, solveAtRest(c), 'a', 0, 131, 95)!
    expect(slid.pts[0].bind).toMatchObject({ e: 0 })
    expect(slid.pts[0].bind!.t).toBeCloseTo(0.775, 1)
    expect(slid.pts[0]).toMatchObject({ x: 131, y: 100 })
    // past the end of the segment it stops at the end
    expect(slideOnEdge(c, solveAtRest(c), 'a', 0, 170, 120)!.pts[0].bind!.t).toBe(1)
  })
})

describe('pulling a point free', () => {
  it('cuts its own connection and leaves it where it is', () => {
    const c = loosen(weld(three(), 'a', 0, 'b', 0), solveAtRest(weld(three(), 'a', 0, 'b', 0)), 'a', 0)
    expect(pt(c, 'a', 0).bind).toBeNull()
    expect(pt(c, 'a', 0)).toMatchObject({ x: 100, y: 100 })
  })

  it('frees the point the others are welded to, and they stay welded to each other', () => {
    let c = weld(three(), 'a', 1, 'b', 0)
    c = weld(c, 'c', 0, 'b', 0)
    const freed = loosen(c, solveAtRest(c), 'b', 0)
    expect(pt(freed, 'a', 1).bind).toBeNull()
    expect(pt(freed, 'c', 0).bind).toMatchObject({ s: 'a', i: 1 })
    expect(drawn(freed, 'c')[0]).toMatchObject({ x: 100, y: 100 })
  })

  it('names a connection and cuts one by hand', () => {
    let c = weld(three(), 'a', 1, 'b', 0)
    c = nameConnection(c, 'a', 1, 'name', 'Shoulder')
    expect(pt(c, 'a', 1).bind!.name).toBe('Shoulder')
    expect(nameConnection(c, 'a', 1, 'name', '').shapes.find(s => s.id === 'a')!.pts[1].bind!.name).toBeUndefined()
    expect(pt(nameConnection(c, 'a', 1, 'segName', 'x'.repeat(60)), 'a', 1).bind!.segName).toHaveLength(40)
    // a weld that is connected again keeps its name
    expect(pt(weld(c, 'a', 1, 'b', 3), 'a', 1).bind!.name).toBe('Shoulder')
    const cut = disconnect(c, solveAtRest(c), 'a', 1)
    expect(pt(cut, 'a', 1).bind).toBeNull()
  })
})

describe('a shared segment', () => {
  // A's right side (points 1 and 2) welded to B's left side (points 0 and 3): A's segment 1 runs down, B's segment 3 runs up
  const shared = () => weld(weld(three(), 'a', 1, 'b', 0), 'a', 2, 'b', 3)

  it('is found from either shape, with which way it runs', () => {
    const c = shared()
    expect(sharedSegment(c, 'a', 1)).toEqual({ shapeId: 'b', e: 3, forward: false })
    expect(sharedSegment(c, 'a', 0)).toBeNull()
    expect(sharersOf(c, 'b', 3)).toEqual([{ shapeId: 'a', e: 1, forward: false }])
    expect(segmentHome(c, 'a', 1)).toEqual({ shapeId: 'b', e: 3 })
    expect(segmentHome(c, 'a', 0)).toEqual({ shapeId: 'a', e: 0 })
    // the handle at the start of A's segment is the handle at the end of B's (the other way round)
    expect(handleHome(c, 'a', 1, 'start')).toEqual({ shapeId: 'b', index: 0, which: 'hi' })
    expect(handleHome(c, 'a', 1, 'end')).toEqual({ shapeId: 'b', index: 3, which: 'ho' })
  })

  it('is drawn as the other shape draws it: straight while it is straight, curved as it is curved', () => {
    const c = shared()
    expect(drawn(c, 'a')[1].ho ?? null).toBeNull()
    // B's left side made curved: its point 3 gets an outgoing handle and point 0 an incoming one
    const curved = { ...c, shapes: c.shapes.map(s => (s.id === 'b' ? { ...s, pts: s.pts.map((p, k): ModelPoint => (k === 3 ? { ...p, m: 'sc', ho: [-8, -10] } : k === 0 ? { ...p, m: 'cs', hi: [-8, 10] } : p)) } : s)) }
    const a = drawn(curved, 'a')
    // A runs the other way, so its start (welded to B's 0) takes B's incoming handle and its end (B's 3) B's outgoing one
    expect(a[1].ho).toEqual([-8, 10])
    expect(a[2].hi).toEqual([-8, -10])
    expect(a[1].m).toBe('sc')
    expect(a[2].m).toBe('cs')
  })

  it('runs the same way when the welds do', () => {
    let c = weld(weld(three(), 'c', 0, 'b', 0), 'c', 1, 'b', 1)
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'b' ? { ...s, pts: s.pts.map((p, k): ModelPoint => (k === 0 ? { ...p, m: 'sc', ho: [10, -6] } : k === 1 ? { ...p, m: 'cs', hi: [-10, -6] } : p)) } : s)) }
    expect(sharedSegment(c, 'c', 0)).toEqual({ shapeId: 'b', e: 0, forward: true })
    const cc = drawn(c, 'c')
    expect(cc[0].ho).toEqual([10, -6])
    expect(cc[1].hi).toEqual([-10, -6])
  })

  it('gets a point on both shapes when a point is added to it, and stays shared, in two parts', () => {
    const c = shared()
    const next = addPointShared(c, solveAtRest(c), 'a', 1, 100, 120)!
    expect(shapeById(next, 'b')!.pts).toHaveLength(5)
    expect(shapeById(next, 'a')!.pts).toHaveLength(5)
    expect(pt(next, 'a', 2).bind).toMatchObject({ s: 'b', i: 4 })
    expect(sharedSegment(next, 'a', 1)).toEqual({ shapeId: 'b', e: 4, forward: false })
    expect(sharedSegment(next, 'a', 2)).toEqual({ shapeId: 'b', e: 3, forward: false })
    expect(drawn(next, 'a')[2]).toMatchObject({ x: 100, y: 120 })
  })
})

describe('keeping connections when a shape\'s points change', () => {
  it('follows a welded point to its new number, and cuts one whose point was deleted', () => {
    const c = weld(weld(three(), 'a', 1, 'b', 2), 'c', 0, 'b', 1)
    const solved = solveAtRest(c), b = shapeById(c, 'b')!
    const added = addPoint(b, 0).shape
    const after = rebindByPlace(c, solved, { ...c, shapes: c.shapes.map(s => (s.id === 'b' ? added : s)) }, 'b')
    expect(pt(after.content, 'a', 1).bind).toMatchObject({ i: 3 })
    expect(pt(after.content, 'c', 0).bind).toMatchObject({ i: 2 })
    expect(after.cut).toEqual([])
    const fewer = deletePoint(b, 2)!
    const cut = rebindByPlace(c, solved, { ...c, shapes: c.shapes.map(s => (s.id === 'b' ? fewer : s)) }, 'b')
    expect(pt(cut.content, 'a', 1).bind).toBeNull()
    expect(pt(cut.content, 'a', 1)).toMatchObject({ x: 140, y: 140 })
    expect(cut.cut).toEqual(['a shape'])
  })

  it('puts a lock on the segment nearest where its point was', () => {
    const c0 = three()
    const c = must(connect(c0, solveAtRest(c0), 'a', 0, { kind: 'edge', shapeId: 'b', e: 1, t: 0.5, x: 140, y: 120 }))
    const b = shapeById(c, 'b')!, more = addPoint(b, 0).shape
    const after = rebindByPlace(c, solveAtRest(c), { ...c, shapes: c.shapes.map(s => (s.id === 'b' ? more : s)) }, 'b')
    expect(pt(after.content, 'a', 0).bind).toMatchObject({ kind: 'edge', e: 2, t: 0.5 })
  })
})
