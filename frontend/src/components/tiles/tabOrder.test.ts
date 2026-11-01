import { describe, expect, it } from 'vitest'
import { moveTab, orderTabs, tabDropAt } from './tabOrder'

describe('orderTabs', () => {
  it('keeps the saved order, drops what is gone and puts new tabs last', () => {
    expect(orderTabs(['a', 'b', 'c'], ['c', 'x', 'a'])).toEqual(['c', 'a', 'b'])
    expect(orderTabs(['a', 'b'], undefined)).toEqual(['a', 'b'])
  })
})

describe('moveTab', () => {
  it('moves a tab before another, or to the end', () => {
    expect(moveTab(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(moveTab(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a'])
    expect(moveTab(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c'])
    expect(moveTab(['a', 'b', 'c'], 'a', 'ghost')).toEqual(['a', 'b', 'c'])
  })
})

describe('tabDropAt', () => {
  const boxes = [{ id: 'a', left: 0, top: 0, right: 30, bottom: 30 }, { id: 'b', left: 32, top: 0, right: 62, bottom: 30 }]
  it('drops before an icon on its left half and after it on its right half', () => {
    expect(tabDropAt(boxes, 5, 10)).toEqual({ beforeId: 'a', markId: 'a', side: 'before' })
    expect(tabDropAt(boxes, 25, 10)).toEqual({ beforeId: 'b', markId: 'a', side: 'after' })
    expect(tabDropAt(boxes, 60, 10)).toEqual({ beforeId: null, markId: 'b', side: 'after' })
  })
  it('is nothing where the pointer is over no icon', () => {
    expect(tabDropAt(boxes, 100, 10)).toBeNull()
  })
})
