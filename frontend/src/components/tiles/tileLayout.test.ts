import { describe, expect, it } from 'vitest'
import { applyLayout, cycleShape, moveTile, shiftTile, type TileMeta } from './tileLayout'

const defs: TileMeta[] = [
  { id: 'plot', shapes: ['landscape', 'portrait', 'large'], defaultShape: 'large' },
  { id: 'outline', shapes: ['small', 'portrait'], defaultShape: 'portrait' },
  { id: 'editor', shapes: ['link'], defaultShape: 'link' },
]
const ids = (l: ReturnType<typeof applyLayout>) => l.map(t => t.def.id)

describe('applyLayout', () => {
  it('uses the defaults when nothing is saved', () => {
    const l = applyLayout(defs, undefined)
    expect(ids(l)).toEqual(['plot', 'outline', 'editor'])
    expect(l.map(t => t.shape)).toEqual(['large', 'portrait', 'link'])
  })

  it('follows the saved order and shapes', () => {
    const l = applyLayout(defs, { order: ['editor', 'plot', 'outline'], shapes: { plot: 'landscape', outline: 'small' } })
    expect(ids(l)).toEqual(['editor', 'plot', 'outline'])
    expect(l.find(t => t.def.id === 'plot')!.shape).toBe('landscape')
    expect(l.find(t => t.def.id === 'outline')!.shape).toBe('small')
  })

  it('drops tiles that no longer exist, ignores duplicates and appends new tiles', () => {
    const l = applyLayout(defs, { order: ['gone', 'outline', 'outline', 'plot'], shapes: {} })
    expect(ids(l)).toEqual(['outline', 'plot', 'editor'])
  })

  it('falls back to the default shape when the saved one is not allowed', () => {
    const l = applyLayout(defs, { order: [], shapes: { editor: 'large', plot: 'small' } })
    expect(l.find(t => t.def.id === 'editor')!.shape).toBe('link')
    expect(l.find(t => t.def.id === 'plot')!.shape).toBe('large')
  })
})

describe('cycleShape', () => {
  it('steps through the allowed shapes and wraps', () => {
    expect(cycleShape(defs[0], 'landscape')).toBe('portrait')
    expect(cycleShape(defs[0], 'large')).toBe('landscape')
  })

  it('keeps a single-shape tile as it is', () => {
    expect(cycleShape(defs[2], 'link')).toBe('link')
  })
})

describe('moveTile and shiftTile', () => {
  const order = ['a', 'b', 'c', 'd']
  it('moves a tile before another, or to the end', () => {
    expect(moveTile(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveTile(order, 'a', null)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveTile(order, 'b', 'b')).toBe(order)
    expect(moveTile(order, 'x', 'a')).toBe(order)
    expect(moveTile(order, 'a', 'x')).toBe(order)
  })

  it('shifts a tile by places and stops at the ends', () => {
    expect(shiftTile(order, 'b', 1)).toEqual(['a', 'c', 'b', 'd'])
    expect(shiftTile(order, 'c', -2)).toEqual(['c', 'a', 'b', 'd'])
    expect(shiftTile(order, 'a', -1)).toBe(order)
    expect(shiftTile(order, 'd', 5)).toBe(order)
  })
})
