import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { castOverlaps, outlinesOverlap } from './castOverlap'
import { NO_COLOURING } from './colour'
import { actsAs, kindOf, unlinkedCount } from './kinds'
import { drawOrder } from './order'
import { paintShapes } from './paint'
import { solve } from './rig'

// Shape types (T1): what a shape acts as, shadows and lights painted black and white above the rest and kept inside it, and the test that a light and a shadow overlap.

const square = (id: string, x: number, y: number, w: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + w], [x, y + w]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })), ...extra,
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })

function model(shapes: ModelShape[]): ModelContent {
  let c = addGroup(blank('Types'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}

describe('the type a shape acts as', () => {
  it('reads anything unknown as a base shape', () => {
    expect(kindOf('light')).toBe('light')
    expect(kindOf('lamp')).toBe('base')
    expect(kindOf(undefined)).toBe('base')
  })

  it('is a stretch shape once every point follows another shape, whatever it was made as', () => {
    const free = square('b', 0, 0, 10)
    expect(actsAs(free)).toBe('base')
    const linked = { ...free, pts: free.pts.map((p, i) => ({ ...p, bind: weld('a', i) })) }
    expect(actsAs(linked)).toBe('stretch')
    const half = { ...free, kind: 'stretch' as const, pts: free.pts.map((p, i) => (i < 2 ? { ...p, bind: weld('a', i) } : p)) }
    expect(actsAs(half)).toBe('base')
    expect(unlinkedCount(half)).toBe(2)
    // a shadow stays a shadow however its points are linked
    expect(actsAs({ ...linked, kind: 'shadow' })).toBe('shadow')
  })
})

describe('shadows and lights', () => {
  const c = model([square('shadow', 60, 60, 20, { kind: 'shadow', op: 0.3 }), square('body', 50, 50, 60), square('light', 90, 90, 10, { kind: 'light', op: 0.25, outline: 2 })])

  it('are drawn above every other shape, in their own order', () => {
    expect(drawOrder(c).map(s => s.id)).toEqual(['body', 'shadow', 'light'])
    expect(solve(c).order).toEqual(['body', 'shadow', 'light'])
  })

  it('are black and white at their own opacity, with no outline, kept inside the shapes below', () => {
    const items = paintShapes(c, solve(c), NO_COLOURING)
    const shadow = items.find(i => i.id === 'shadow')!, light = items.find(i => i.id === 'light')!, body = items.find(i => i.id === 'body')!
    expect(shadow).toMatchObject({ fill: '#000000', opacity: 0.3, line: null, cast: 'shadow', blank: false })
    expect(light).toMatchObject({ fill: '#ffffff', opacity: 0.25, line: null, cast: 'light' })
    expect(shadow.compDs).toEqual([body.d])
    expect(light.compDs).toEqual([body.d])
    expect(body.cast).toBeNull()
  })

  it('draw nothing with nothing below them', () => {
    const alone = model([square('shadow', 60, 60, 20, { kind: 'shadow', op: 0.3 })])
    expect(paintShapes(alone, solve(alone), NO_COLOURING)[0].blank).toBe(true)
  })
})

describe('a light and a shadow overlapping', () => {
  const box = (x: number, y: number, w: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]]

  it('is found where the outlines cross or one lies inside the other, not where they only touch', () => {
    expect(outlinesOverlap(box(0, 0, 10), box(5, 5, 10))).toBe(true)
    expect(outlinesOverlap(box(0, 0, 10), box(2, 2, 3))).toBe(true)
    expect(outlinesOverlap(box(2, 2, 3), box(0, 0, 10))).toBe(true)
    expect(outlinesOverlap(box(0, 0, 10), box(10, 0, 10))).toBe(false)
    expect(outlinesOverlap(box(0, 0, 10), box(10, 10, 5))).toBe(false)
    expect(outlinesOverlap(box(0, 0, 10), box(20, 0, 10))).toBe(false)
  })

  it('names each pair that overlaps as the model is drawn', () => {
    const c = model([square('body', 0, 0, 100), square('s', 10, 10, 20, { kind: 'shadow' }), square('l', 25, 25, 20, { kind: 'light' }), square('far', 70, 70, 10, { kind: 'light' })])
    expect(castOverlaps(c, solve(c))).toEqual([['l', 's']])
  })
})
