import { describe, expect, it } from 'vitest'
import { applyDrop, planAt, planOnTile, samePlan, zoneAt, type DropContext } from './tileDrop'
import { computeGeometry, insertAtGridEdge, leafIds, touchesStageEdge, type SplitNode } from './splitTree'

// Left column a over b, right column c: a 1000 x 600 grid.
const tree: SplitNode = {
  dir: 'row', ratio: 0.5,
  a: { dir: 'col', ratio: 0.5, a: { id: 'a' }, b: { id: 'b' } },
  b: { id: 'c' },
}
const stage = { x: 0, y: 0, w: 1000, h: 600 }
const geometry = computeGeometry(tree, stage)
const rect = (id: string) => geometry.tiles.find(t => t.id === id)!.rect
const ctx = (draggedId: string, extra: Partial<DropContext> = {}): DropContext => ({ tree, stage, draggedId, oneColumn: false, ...extra })
const at = (id: string, fx: number, fy: number, dragged: string, extra: Partial<DropContext> = {}) => {
  const r = rect(id)
  return planOnTile(geometry.tiles.find(t => t.id === id)!, r.x + r.w * fx, r.y + r.h * fy, ctx(dragged, extra))
}

describe('zoneAt', () => {
  it('cuts a box into a 3x3 grid', () => {
    const box = { x: 100, y: 100, w: 300, h: 300 }
    expect(zoneAt(box, 110, 110)).toBe('tl')
    expect(zoneAt(box, 250, 110)).toBe('t')
    expect(zoneAt(box, 390, 110)).toBe('tr')
    expect(zoneAt(box, 110, 250)).toBe('l')
    expect(zoneAt(box, 250, 250)).toBe('c')
    expect(zoneAt(box, 390, 250)).toBe('r')
    expect(zoneAt(box, 110, 390)).toBe('bl')
    expect(zoneAt(box, 250, 390)).toBe('b')
    expect(zoneAt(box, 390, 390)).toBe('br')
  })
})

describe('planOnTile', () => {
  it('swaps in the middle and inserts at the four edge cells', () => {
    expect(at('c', 0.5, 0.5, 'a')).toEqual({ kind: 'swap', target: 'c' })
    expect(at('c', 0.5, 0.1, 'a')).toEqual({ kind: 'below', target: 'c', side: 'top' })
    expect(at('c', 0.5, 0.9, 'a')).toEqual({ kind: 'below', target: 'c', side: 'bottom' })
    expect(at('c', 0.1, 0.5, 'a')).toEqual({ kind: 'beside', target: 'c', side: 'left' })
    expect(at('c', 0.9, 0.5, 'a')).toEqual({ kind: 'beside', target: 'c', side: 'right' })
  })

  it('does nothing over the dragged tile itself', () => {
    expect(at('a', 0.5, 0.5, 'a')).toBeNull()
  })

  it('makes a corner a row or column across the whole grid when the tile touches that outer edge, the nearer edge winning', () => {
    // c touches the top, bottom and right of the grid.
    expect(at('c', 0.95, 0.05, 'a')).toEqual({ kind: 'edge', side: 'right' }) // nearer the right edge (0.05 of the tile's width ... in thirds)
    expect(at('c', 0.8, 0.02, 'a')).toEqual({ kind: 'edge', side: 'top' })
    expect(at('c', 0.8, 0.98, 'a')).toEqual({ kind: 'edge', side: 'bottom' })
  })

  it('falls back to the edge cell beside the tile when the tile does not touch that outer edge', () => {
    // c does not touch the left of the grid: its top-left corner is the cell above or to the left of it.
    expect(at('c', 0.02, 0.2, 'a')).toEqual({ kind: 'beside', target: 'c', side: 'left' })
    expect(at('c', 0.2, 0.02, 'a')).toEqual({ kind: 'edge', side: 'top' }) // the top edge is touched
    // b touches the left and bottom but not the top, nor the right.
    expect(at('b', 0.05, 0.02, 'c')).toEqual({ kind: 'below', target: 'b', side: 'top' })
    expect(at('b', 0.02, 0.2, 'c')).toEqual({ kind: 'edge', side: 'left' })
    expect(at('b', 0.95, 0.9, 'c')).toEqual({ kind: 'beside', target: 'b', side: 'right' })
  })

  it('never offers a new column in one column mode, and falls back to the row', () => {
    expect(at('c', 0.5, 0.1, 'a', { oneColumn: true })).toEqual({ kind: 'below', target: 'c', side: 'top' })
    expect(at('c', 0.1, 0.5, 'a', { oneColumn: true })).toBeNull()
    expect(at('c', 0.98, 0.3, 'a', { oneColumn: true })).toEqual({ kind: 'edge', side: 'top' })
  })

  it('offers nothing where there is no room', () => {
    const small = { x: 0, y: 0, w: 280, h: 600 }
    const narrow: SplitNode = { dir: 'col', ratio: 0.5, a: { id: 'a' }, b: { id: 'b' } }
    const geo = computeGeometry(narrow, small)
    const target = geo.tiles.find(t => t.id === 'b')!
    const c: DropContext = { tree: narrow, stage: small, draggedId: 'a', oneColumn: false }
    expect(planOnTile(target, target.rect.x + 5, target.rect.y + target.rect.h / 2, c)).toBeNull()
  })
})

describe('planAt', () => {
  it('finds the tile under a point, and a divider in the gap between tiles', () => {
    const r = rect('c')
    expect(planAt(geometry, r.x + r.w / 2, r.y + r.h / 2, ctx('a'))).toEqual({ kind: 'swap', target: 'c' })
    const divider = geometry.dividers.find(d => d.dir === 'row')!
    expect(planAt(geometry, divider.rect.x + 4, 100, ctx('a'))).toEqual({ kind: 'divider', path: divider.path })
  })

  it('returns null outside every tile', () => {
    expect(planAt(geometry, -10, -10, ctx('a'))).toBeNull()
  })
})

describe('applyDrop', () => {
  it('lays a tile out beside, below, across the whole grid, or in the other tile\'s place', () => {
    expect(leafIds(applyDrop(tree, 'a', { kind: 'swap', target: 'c' }))).toEqual(['c', 'b', 'a'])
    const beside = applyDrop(tree, 'a', { kind: 'beside', target: 'c', side: 'left' })
    expect(leafIds(beside)).toEqual(['b', 'a', 'c'])
    const edge = applyDrop(tree, 'c', { kind: 'edge', side: 'top' })
    expect(leafIds(edge)).toEqual(['c', 'a', 'b'])
    expect(edge).toMatchObject({ dir: 'col', a: { id: 'c' } })
  })

  it('is pure: the tree it is given is unchanged', () => {
    const before = JSON.stringify(tree)
    applyDrop(tree, 'a', { kind: 'edge', side: 'left' })
    expect(JSON.stringify(tree)).toBe(before)
  })

  it('wraps the grid on the chosen side with the tile taking a share of it', () => {
    const left = computeGeometry(insertAtGridEdge(tree, 'c', 'left'), stage)
    const c = left.tiles.find(t => t.id === 'c')!.rect
    expect(c.x).toBe(0)
    expect(c.h).toBe(600)
    expect(touchesStageEdge(c, stage, 'left')).toBe(true)
  })
})

describe('samePlan', () => {
  it('compares plans by what they do', () => {
    expect(samePlan({ kind: 'swap', target: 'a' }, { kind: 'swap', target: 'a' })).toBe(true)
    expect(samePlan({ kind: 'swap', target: 'a' }, { kind: 'swap', target: 'b' })).toBe(false)
    expect(samePlan({ kind: 'divider', path: ['a'] }, { kind: 'divider', path: ['a'] })).toBe(true)
    expect(samePlan(null, null)).toBe(true)
    expect(samePlan(null, { kind: 'edge', side: 'top' })).toBe(false)
  })
})
