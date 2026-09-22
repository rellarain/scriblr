import { describe, expect, it } from 'vitest'
import {
  MINI_H, MIN_LEAF_H, MIN_LEAF_W, buildTree, computeGeometry, fixup, flattenOneColumn, isLeaf, leafIds,
  minSize, reconcile, resizeBranch, setFixed, swapLeaves,
} from './splitTree'
import type { SplitNode } from './splitTree'

const P = (id: string, shape: 'mini' | 'mid') => ({ id, shape })

describe('buildTree', () => {
  it('stacks mini tiles above a split tree of the rest', () => {
    const tree = buildTree([P('a', 'mini'), P('b', 'mid'), P('c', 'mid')])!
    expect(leafIds(tree)).toEqual(['a', 'b', 'c'])
    // The outermost branch must be the col holding the fixed mini leaf.
    expect(isLeaf(tree)).toBe(false)
    const branch = tree as Exclude<SplitNode, { id: string }>
    expect(branch.dir).toBe('col')
    expect(isLeaf(branch.a) && branch.a.fixed).toBe(true)
  })

  it('keeps every tile short when the whole grid is mini, none stretching to fill leftover space', () => {
    const tree = buildTree([P('a', 'mini'), P('b', 'mini')])!
    const geo = computeGeometry(tree, { x: 0, y: 0, w: 300, h: 300 })
    for (const t of geo.tiles) {
      expect(t.fixed).toBe(true)
      expect(t.rect.h).toBe(MINI_H)
    }
    expect(minSize(tree)).toEqual({ w: MIN_LEAF_W, h: MINI_H * 2 + 8 })
  })

  it('returns null for an empty grid and a bare leaf for one tile', () => {
    expect(buildTree([])).toBeNull()
    expect(buildTree([P('a', 'mid')])).toEqual({ id: 'a' })
  })
})

describe('computeGeometry', () => {
  const tree = buildTree([P('a', 'mid'), P('b', 'mid'), P('c', 'mid')])!

  it('fills the given rect exactly, tile edges and gaps included', () => {
    const rect = { x: 0, y: 0, w: 640, h: 400 }
    const geo = computeGeometry(tree, rect)
    expect(geo.tiles).toHaveLength(3)
    // Bounding box of every tile matches the rect exactly (no gaps, no overhang).
    const minX = Math.min(...geo.tiles.map(t => t.rect.x))
    const minY = Math.min(...geo.tiles.map(t => t.rect.y))
    const maxX = Math.max(...geo.tiles.map(t => t.rect.x + t.rect.w))
    const maxY = Math.max(...geo.tiles.map(t => t.rect.y + t.rect.h))
    expect([minX, minY, maxX, maxY]).toEqual([rect.x, rect.y, rect.x + rect.w, rect.y + rect.h])
  })

  it('never lets a leaf shrink below its minimum while space allows it', () => {
    const rect = { x: 0, y: 0, w: 1200, h: 800 }
    const geo = computeGeometry(tree, rect)
    for (const t of geo.tiles) {
      expect(t.rect.w).toBeGreaterThanOrEqual(MIN_LEAF_W - 1)
      expect(t.rect.h).toBeGreaterThanOrEqual((t.fixed ? MINI_H : MIN_LEAF_H) - 1)
    }
  })

  it('gives a fixed (mini) leaf exactly its fixed height and its sibling the rest', () => {
    const mixed = buildTree([P('mini1', 'mini'), P('rest', 'mid')])!
    const geo = computeGeometry(mixed, { x: 0, y: 0, w: 400, h: 300 })
    const mini = geo.tiles.find(t => t.id === 'mini1')!
    const rest = geo.tiles.find(t => t.id === 'rest')!
    expect(mini.rect.h).toBe(MINI_H)
    expect(rest.rect.h).toBe(300 - MINI_H - 8)
    expect(rest.rect.w).toBe(400)
  })

  it('lists one divider per branch, positioned between its two sides', () => {
    const geo = computeGeometry(tree, { x: 0, y: 0, w: 640, h: 400 })
    expect(geo.dividers.length).toBe(2)
    for (const d of geo.dividers) {
      expect(d.rect.w).toBeGreaterThan(0)
      expect(d.rect.h).toBeGreaterThan(0)
    }
  })
})

describe('minSize', () => {
  it('sums along the split axis and takes the max across it', () => {
    const tree: SplitNode = { dir: 'row', ratio: 0.5, a: { id: 'a' }, b: { id: 'b' } }
    const m = minSize(tree)
    expect(m.w).toBe(MIN_LEAF_W * 2 + 8)
    expect(m.h).toBe(MIN_LEAF_H)
  })

  it('uses the fixed height for a mini leaf', () => {
    const tree: SplitNode = { dir: 'col', ratio: 0.5, a: { id: 'a', fixed: true }, b: { id: 'b' } }
    expect(minSize(tree).h).toBe(MINI_H + MIN_LEAF_H + 8)
  })
})

describe('resizeBranch', () => {
  it('sets a branch ratio, clamped away from the extremes', () => {
    const tree: SplitNode = { dir: 'row', ratio: 0.5, a: { id: 'a' }, b: { id: 'b' } }
    expect((resizeBranch(tree, [], 0.7) as any).ratio).toBe(0.7)
    expect((resizeBranch(tree, [], 2) as any).ratio).toBe(0.92)
    expect((resizeBranch(tree, [], -1) as any).ratio).toBe(0.08)
  })
})

describe('swapLeaves', () => {
  it('exchanges two tiles, each area keeping its own fixed status', () => {
    const tree = buildTree([P('mini1', 'mini'), P('a', 'mid'), P('b', 'mid')])!
    const swapped = swapLeaves(tree, 'mini1', 'a')
    const geo = computeGeometry(swapped, { x: 0, y: 0, w: 400, h: 400 })
    const a = geo.tiles.find(t => t.id === 'a')!
    const mini1 = geo.tiles.find(t => t.id === 'mini1')!
    expect(a.fixed).toBe(true)
    expect(mini1.fixed).toBe(false)
  })

  it('does nothing for an unknown id or swapping a tile with itself', () => {
    const tree = buildTree([P('a', 'mid'), P('b', 'mid')])!
    expect(swapLeaves(tree, 'a', 'a')).toBe(tree)
    expect(swapLeaves(tree, 'a', 'ghost')).toBe(tree)
  })
})

describe('setFixed and fixup', () => {
  it('straightens a row branch to col when one side becomes fixed', () => {
    const tree: SplitNode = { dir: 'row', ratio: 0.5, a: { id: 'a' }, b: { id: 'b' } }
    const fixed = setFixed(tree, 'a', true)
    expect(isLeaf(fixed) ? undefined : fixed.dir).toBe('col')
  })

  it('fixup is a no-op on an already-straight tree', () => {
    const tree = buildTree([P('a', 'mini'), P('b', 'mid')])!
    expect(fixup(tree)).toEqual(tree)
  })
})

describe('flattenOneColumn', () => {
  it('turns every branch into a column stack without changing which tiles exist', () => {
    const tree = buildTree([P('a', 'mid'), P('b', 'mid'), P('c', 'mid')])!
    const flat = flattenOneColumn(tree)
    expect(leafIds(flat)).toEqual(leafIds(tree))
    function allCol(n: SplitNode): boolean { return isLeaf(n) || (n.dir === 'col' && allCol(n.a) && allCol(n.b)) }
    expect(allCol(flat)).toBe(true)
  })

  it('leaves the original tree (and its row splits) untouched', () => {
    const tree = buildTree([P('a', 'mid'), P('b', 'mid')])!
    flattenOneColumn(tree)
    expect(isLeaf(tree) ? undefined : tree.dir).toBe('row')
  })
})

describe('reconcile', () => {
  it('keeps a saved tree when nothing changed', () => {
    const tree = buildTree([P('a', 'mid'), P('b', 'mid')])!
    expect(reconcile(tree, [P('a', 'mid'), P('b', 'mid')])).toEqual(tree)
  })

  it('prunes a leaf whose tile no longer exists', () => {
    const tree = buildTree([P('a', 'mid'), P('b', 'mid')])!
    const pruned = reconcile(tree, [P('b', 'mid')])
    expect(leafIds(pruned)).toEqual(['b'])
  })

  it('grafts a new tile on, stacking a mini tile and siding a mid one', () => {
    const tree = buildTree([P('a', 'mid')])!
    const withMini = reconcile(tree, [P('a', 'mid'), P('new', 'mini')])
    expect(leafIds(withMini).sort()).toEqual(['a', 'new'])
    const geo = computeGeometry(withMini, { x: 0, y: 0, w: 400, h: 400 })
    expect(geo.tiles.find(t => t.id === 'new')!.fixed).toBe(true)
  })

  it('builds fresh from scratch when there is no saved tree', () => {
    const built = reconcile(null, [P('a', 'mid'), P('b', 'mid')])
    expect(leafIds(built).sort()).toEqual(['a', 'b'])
  })
})
