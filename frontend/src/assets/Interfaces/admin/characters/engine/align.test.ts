import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, shapeById, starterContent } from '../modelContent'
import { alignConnected, alignSet } from './align'
import { solveAtRest } from './rig'

// Align with everything connected (engine/align.ts): the box around the shapes and every shape connected to them is centred, keeping their arrangement.

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const weldTo = (s: string, i: number) => ({ kind: 'point' as const, s, i, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 })
const withBind = (s: ModelShape, i: number, bind: ModelPoint['bind']): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind } : p)) })
function model(...shapes: ModelShape[]): ModelContent {
  let c = addGroup(starterContent('Demo'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}
const xs = (c: ModelContent, id: string) => shapeById(c, id)!.pts.map(p => p.x)
const ys = (c: ModelContent, id: string) => shapeById(c, id)!.pts.map(p => p.y)

// A is 10..30 across, B (welded to A's right side) 30..60; C stands apart.
const a = sharp('a', [[10, 0], [30, 0], [30, 20], [10, 20]])
const b = withBind(sharp('b', [[30, 0], [60, 0], [60, 20], [30, 20]]), 0, weldTo('a', 1))
const lone = sharp('c', [[150, 300], [170, 300], [170, 320]])

describe('alignConnected', () => {
  it('centres the box of a shape and every shape connected to it, keeping their arrangement', () => {
    const c = model(a, b, lone)
    expect(alignSet(c, ['a']).sort()).toEqual(['a', 'b'])
    const r = alignConnected(c, solveAtRest(c), ['a'], 'x', 100)
    if (!r.ok) throw new Error(r.reason)
    // the box was 10..60 (middle 35): both move 65 across, nothing down
    expect(xs(r.content, 'a')).toEqual([75, 95, 95, 75])
    expect(xs(r.content, 'b')).toEqual([95, 125, 125, 95])
    expect(ys(r.content, 'b')).toEqual([0, 0, 20, 20])
    expect(shapeById(r.content, 'c')).toEqual(shapeById(c, 'c'))
  })

  it('aligns down the same way, and a lone shape by its own box', () => {
    const c = model(a, b, lone)
    const r = alignConnected(c, solveAtRest(c), ['c'], 'y', 200)
    if (!r.ok) throw new Error(r.reason)
    expect(ys(r.content, 'c')).toEqual([190, 190, 210])
    expect(xs(r.content, 'a')).toEqual(xs(c, 'a'))
  })

  it('refuses when a shape in the set is anchored', () => {
    const pinned = { ...b, marks: [{ id: 'm1', kind: 'anchor' as const, x: 60, y: 20, i: 2, name: '' }] }
    const c = model(a, pinned)
    const r = alignConnected(c, solveAtRest(c), ['a'], 'x', 100)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/anchored/)
  })

  it('leaves mirrors and clones to follow their originals', () => {
    const twin: ModelShape = { ...sharp('t', []), mirrorOf: 'a' }
    const copy: ModelShape = { ...sharp('k', []), cloneOf: 'a', cloneAt: { x: 50, y: 50, turn: 0, flip: false } }
    const c = model(a, twin, copy)
    expect(alignSet(c, ['a', 't', 'k'])).toEqual(['a'])
  })
})
