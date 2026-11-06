import { describe, expect, it } from 'vitest'
import type { ItemDoc, OutlineNode } from '../../../../api/types'
import { newItem } from '../../../../designSystem/mockItems'
import { storyPoints } from '../characters/story'
import { holderAt, holdingsInOrder, itemsEverHeldBy, itemsHeldBy, nextPointAfter } from './itemModel'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number): OutlineNode => ({ id, kind, parentId, order, title: id } as OutlineNode)
const points = storyPoints([node('b1', 'book', null, 0), node('c1', 'chapter', 'b1', 0), node('c2', 'chapter', 'b1', 1), node('c3', 'chapter', 'b1', 2)])

const withHoldings = (holdings: ItemDoc['holdings']): ItemDoc => ({ ...newItem('i1', { name: 'Key' }, 0), holdings })
const h = (id: string, holder: string, at: string) => ({ id, holder, at, note: '' })

describe('the holdings of an item', () => {
  it('come in book order, the start of the story first and a point that is gone last', () => {
    const item = withHoldings([h('a', 'char:x', 'c3'), h('b', 'char:y', 'gone'), h('c', '', ''), h('d', 'char:z', 'c1')])
    expect(holdingsInOrder(item, points).map(x => x.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('say who has the item at a point: the last holding that starts at or before it', () => {
    const item = withHoldings([h('a', '', ''), h('b', 'char:x', 'c2'), h('c', 'char:y', 'c3')])
    expect(holderAt(item, points, 'c1')?.holder).toBe('')
    expect(holderAt(item, points, 'c2')?.holder).toBe('char:x')
    expect(holderAt(item, points, 'c3')?.holder).toBe('char:y')
    expect(holderAt(item, points, null)?.holder).toBe('char:y')
    expect(holderAt(item, points, 'nowhere')).toBeNull()
    expect(holderAt(withHoldings([]), points, null)).toBeNull()
  })

  it('leave out a holding whose point is gone when asking for the end of the story', () => {
    const item = withHoldings([h('a', 'char:x', 'c1'), h('b', 'char:y', 'gone')])
    expect(holderAt(item, points, null)?.holder).toBe('char:x')
  })

  it('tell what a character holds at a point and what they have ever held', () => {
    const sword = { ...withHoldings([h('a', 'char:x', ''), h('b', 'char:y', 'c2')]), id: 'sword' }
    const key = { ...withHoldings([h('a', 'char:y', 'c1')]), id: 'key' }
    expect(itemsHeldBy([sword, key], 'char:x', points, 'c1').map(i => i.id)).toEqual(['sword'])
    expect(itemsHeldBy([sword, key], 'char:x', points, 'c2')).toEqual([])
    expect(itemsHeldBy([sword, key], 'char:y', points, null).map(i => i.id)).toEqual(['sword', 'key'])
    const ever = itemsEverHeldBy([sword, key], 'char:x', points)
    expect(ever).toHaveLength(1)
    expect(ever[0]).toMatchObject({ from: null, now: false })
    expect(itemsEverHeldBy([sword, key], 'char:y', points).map(e => [e.item.id, e.from, e.now])).toEqual([['sword', 'c2', true], ['key', 'c1', true]])
  })

  it('suggest the point after the last one for a new holding', () => {
    expect(nextPointAfter(withHoldings([]), points)).toBe('')
    expect(nextPointAfter(withHoldings([h('a', 'char:x', '')]), points)).toBe('c1')
    expect(nextPointAfter(withHoldings([h('a', 'char:x', 'c1')]), points)).toBe('c2')
    expect(nextPointAfter(withHoldings([h('a', 'char:x', 'c3')]), points)).toBe('c3')
  })
})
