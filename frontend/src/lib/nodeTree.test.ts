import { describe, expect, it } from 'vitest'
import {
  canReparent,
  depthFirstOrder,
  depthOf,
  getChildren,
  getRoots,
  insertSiblingAfter,
  nextKindInLevels,
  nextOrder,
  nextSibling,
  previousSibling,
  removeSubtree,
  reorderSiblings,
  reparentNode,
  type TreeNodeBase,
} from './nodeTree'

interface Node extends TreeNodeBase {
  kind: 'book' | 'chapter' | 'moment'
}

const KIND_ORDER: Node['kind'][] = ['book', 'chapter', 'moment']

function tree(): Node[] {
  return [
    { id: 'book1', parentId: null, order: 0, kind: 'book' },
    { id: 'ch1', parentId: 'book1', order: 0, kind: 'chapter' },
    { id: 'ch2', parentId: 'book1', order: 1, kind: 'chapter' },
    { id: 'mo1', parentId: 'ch1', order: 0, kind: 'moment' },
    { id: 'mo2', parentId: 'ch1', order: 1, kind: 'moment' },
  ]
}

describe('getChildren / getRoots', () => {
  it('returns children sorted by order', () => {
    const nodes = tree()
    expect(getChildren(nodes, 'book1').map((n) => n.id)).toEqual(['ch1', 'ch2'])
  })

  it('getRoots returns only parentId:null nodes', () => {
    expect(getRoots(tree()).map((n) => n.id)).toEqual(['book1'])
  })
})

describe('nextOrder', () => {
  it('returns 0 for an empty sibling group', () => {
    expect(nextOrder(tree(), 'ch2')).toBe(0)
  })

  it('returns max(order) + 1 for a populated sibling group', () => {
    expect(nextOrder(tree(), 'book1')).toBe(2)
  })
})

describe('reorderSiblings', () => {
  it('rewrites order to match the given id sequence, leaving other nodes untouched', () => {
    const nodes = tree()
    const result = reorderSiblings(nodes, ['ch2', 'ch1'])
    expect(result.find((n) => n.id === 'ch2')?.order).toBe(0)
    expect(result.find((n) => n.id === 'ch1')?.order).toBe(1)
    expect(result.find((n) => n.id === 'mo1')?.order).toBe(0)
  })
})

describe('removeSubtree', () => {
  it('removes a node and all descendants at any depth', () => {
    const result = removeSubtree(tree(), 'ch1')
    expect(result.map((n) => n.id).sort()).toEqual(['book1', 'ch2'])
  })

  it('removing a leaf only removes that node', () => {
    const result = removeSubtree(tree(), 'mo1')
    expect(result.map((n) => n.id).sort()).toEqual(['book1', 'ch1', 'ch2', 'mo2'])
  })
})

describe('depthOf', () => {
  it('computes depth from the root', () => {
    expect(depthOf(tree(), 'book1')).toBe(0)
    expect(depthOf(tree(), 'ch1')).toBe(1)
    expect(depthOf(tree(), 'mo1')).toBe(2)
  })
})

describe('depthFirstOrder', () => {
  it('visits nodes in depth-first, order-respecting sequence', () => {
    expect(depthFirstOrder(tree()).map((n) => n.id)).toEqual(['book1', 'ch1', 'mo1', 'mo2', 'ch2'])
  })

  it('can be scoped to a subtree via rootId', () => {
    expect(depthFirstOrder(tree(), 'ch1').map((n) => n.id)).toEqual(['mo1', 'mo2'])
  })
})

describe('insertSiblingAfter', () => {
  it('inserts the new node immediately after the given sibling and renumbers the group', () => {
    const nodes = tree()
    const newNode: Node = { id: 'ch3', parentId: 'book1', order: -1, kind: 'chapter' }
    const result = insertSiblingAfter(nodes, 'ch1', newNode)
    expect(getChildren(result, 'book1').map((n) => n.id)).toEqual(['ch1', 'ch3', 'ch2'])
  })
})

describe('nextSibling / previousSibling', () => {
  it('wraps around at the end/start of the sibling group', () => {
    const nodes = tree()
    expect(nextSibling(nodes, 'ch2')?.id).toBe('ch1')
    expect(previousSibling(nodes, 'ch1')?.id).toBe('ch2')
  })

  it('returns undefined for an unknown node', () => {
    expect(nextSibling(tree(), 'missing')).toBeUndefined()
  })
})

describe('nextKindInLevels', () => {
  it('returns the next kind within the configured levels', () => {
    expect(nextKindInLevels(['book', 'chapter', 'moment'], 'book', KIND_ORDER)).toBe('chapter')
  })

  it('returns undefined for the deepest configured level', () => {
    expect(nextKindInLevels(['book', 'chapter', 'moment'], 'moment', KIND_ORDER)).toBeUndefined()
  })

  it('falls back to the canonical order when kind is absent from levels', () => {
    expect(nextKindInLevels(['book', 'moment'], 'chapter', KIND_ORDER)).toBe('moment')
  })
})

describe('canReparent', () => {
  it('allows dropping onto a node of a strictly shallower kind', () => {
    expect(canReparent(tree(), 'mo1', 'book1', KIND_ORDER)).toBe(true)
  })

  it('rejects dropping onto itself', () => {
    expect(canReparent(tree(), 'ch1', 'ch1', KIND_ORDER)).toBe(false)
  })

  it('rejects dropping onto a node of equal or deeper kind (blocks descendant drops too)', () => {
    expect(canReparent(tree(), 'ch1', 'mo1', KIND_ORDER)).toBe(false)
    expect(canReparent(tree(), 'book1', 'ch1', KIND_ORDER)).toBe(false)
  })
})

describe('reparentNode', () => {
  it('moves the node to be the last child of the new parent and closes the gap left behind', () => {
    const result = reparentNode(tree(), 'mo1', 'ch2')
    expect(getChildren(result, 'ch2').map((n) => n.id)).toEqual(['mo1'])
    expect(getChildren(result, 'ch1').map((n) => n.id)).toEqual(['mo2'])
    expect(getChildren(result, 'ch1').find((n) => n.id === 'mo2')?.order).toBe(0)
  })

  it('is a no-op when the node does not exist', () => {
    const nodes = tree()
    expect(reparentNode(nodes, 'missing', 'ch2')).toEqual(nodes)
  })
})
