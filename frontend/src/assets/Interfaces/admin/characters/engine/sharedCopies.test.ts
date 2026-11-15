import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, starterContent } from '../modelContent'
import { addPointShared, copySharesOf, drawnOf, segmentCopies, sharedSegment, toSourceSpot } from './connect'
import { solveAtRest } from './rig'
import { enableSymmetry } from './symmetry'

// Shared segments on symmetric shapes (the user, 2026-11-15: "shared segments on symmetric shapes are shared on both segments"): only one copy of each point may follow a
// shape, so a shared segment's copy across the axis follows nothing; when the shape it is shared with is symmetric the same way, the copy lies along it too and counts as
// shared, on both shapes.

type P = [number, number]
const sharp = (id: string, pts: P[]): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const symmetric = (s: ModelShape): ModelShape => {
  const r = enableSymmetry(s, { a: 90, n: 1 }, 0, 60)
  if (!r.ok) throw new Error(r.reason)
  return r.shape
}
const weldTo = (s: string, i: number): ModelPoint['bind'] => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
const at = (s: ModelShape, x: number, y: number) => s.pts.findIndex(p => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6)
// the segment between two places of a shape (either way round)
const segOf = (s: ModelShape, a: P, b: P) => {
  const i = at(s, ...a), j = at(s, ...b), n = s.pts.length
  return (i + 1) % n === j ? i : (j + 1) % n === i ? j : -1
}
function model(...shapes: ModelShape[]): ModelContent {
  let c = addGroup(starterContent('Demo'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}
const chestShape = () => symmetric(sharp('chest', [[60, 40], [140, 40], [140, 100], [60, 100]]))
// a belly under the chest, as wide: its top left corner welded to the chest's bottom left corner and its top middle to the chest's bottom middle, so the left half of its top
// is shared with the left half of the chest's bottom
function torso(chest = chestShape()): ModelContent {
  const b = symmetric(sharp('belly', [[60, 100], [140, 100], [140, 160], [60, 160]]))
  const belly = { ...b, pts: b.pts.map((p, k) => (k === at(b, 60, 100) ? { ...p, bind: weldTo('chest', at(chest, 60, 100)) } : k === at(b, 100, 100) ? { ...p, bind: weldTo('chest', at(chest, 100, 100)) } : p)) }
  return model(chest, belly)
}
const shapeOf = (c: ModelContent, id: string) => c.shapes.find(s => s.id === id)!

describe('the copies of a segment of a symmetric shape', () => {
  it('are its images across the axis, the other way round', () => {
    const s = chestShape()
    const left = segOf(s, [60, 100], [100, 100]), right = segOf(s, [100, 100], [140, 100])
    expect(segmentCopies(s, left)).toEqual([{ e: right, reversed: true }])
    expect(segmentCopies(sharp('plain', [[0, 0], [10, 0], [10, 10]]), 0)).toEqual([])
  })
})

describe('a shared segment on a symmetric shape', () => {
  it('is shared on both segments: the copy on the follower, and the segment it lies along on the shape followed', () => {
    const c = torso(), solved = solveAtRest(c), chest = shapeOf(c, 'chest'), belly = shapeOf(c, 'belly')
    const bLeft = segOf(belly, [60, 100], [100, 100]), bRight = segOf(belly, [100, 100], [140, 100])
    const cLeft = segOf(chest, [60, 100], [100, 100]), cRight = segOf(chest, [100, 100], [140, 100])
    expect(sharedSegment(c, 'belly', bLeft)).not.toBeNull()
    expect(sharedSegment(c, 'belly', bRight)).toBeNull()
    const copies = copySharesOf(c, solved)
    expect(copies).toContainEqual(expect.objectContaining({ side: 'follower', shapeId: 'belly', e: bRight, source: bLeft, target: 'chest', te: cRight, weld: true }))
    expect(copies).toContainEqual(expect.objectContaining({ side: 'target', shapeId: 'chest', e: cRight, source: cLeft, weld: true }))
    expect(copies).toHaveLength(2)
  })

  it('is not shared across the axis when the copy does not lie along the shape it is shared with', () => {
    // the chest is not symmetric and its bottom right corner is lower: the belly's copy runs off it
    const chest = sharp('chest', [[60, 40], [140, 40], [140, 110], [100, 100], [60, 100]])
    expect(copySharesOf(torso(chest), solveAtRest(torso(chest)))).toEqual([])
  })

  it('takes a point added on the copy through the copy that is shared, so both halves stay shared', () => {
    const c = torso(), solved = solveAtRest(c), belly = shapeOf(c, 'belly')
    const bLeft = segOf(belly, [60, 100], [100, 100]), bRight = segOf(belly, [100, 100], [140, 100])
    // a double-click at (120, 100) on the right half is the same spot along the left half: (80, 100)
    const [x, y] = toSourceSpot(drawnOf(c, solved, 'belly'), bRight, bLeft, true, 120, 100)
    expect(x).toBeCloseTo(80, 3)
    expect(y).toBeCloseTo(100, 3)
    const next = addPointShared(c, solved, 'belly', bLeft, x, y)!
    expect(shapeOf(next, 'chest').pts).toHaveLength(8)
    expect(shapeOf(next, 'belly').pts).toHaveLength(8)
    const after = solveAtRest(next), copies = copySharesOf(next, after)
    expect(copies.filter(o => o.side === 'follower' && o.shapeId === 'belly')).toHaveLength(2)
    const nb = shapeOf(next, 'belly')
    expect(sharedSegment(next, 'belly', segOf(nb, [60, 100], [80, 100]))).not.toBeNull()
    expect(sharedSegment(next, 'belly', segOf(nb, [80, 100], [100, 100]))).not.toBeNull()
  })
})
