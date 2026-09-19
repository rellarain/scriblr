import { describe, expect, it } from 'vitest'
import type { OutlineNode, OutlineNodeKind } from '../../../api/types'
import { booksOf, buildChildIndex, chaptersOfBook, moveNode, rollUpWordCounts, sceneChanges, scenesInOrder } from './outlineTree'

function node(id: string, kind: OutlineNodeKind, parentId: string | null, order: number, extra: Partial<OutlineNode> = {}): OutlineNode {
  return {
    id, kind, parentId, order, title: id, synopsis: '', draftRef: null, flag: null,
    color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null, ...extra,
  }
}

// book > arc > chapter c1 (act a1 > scene s1 > m1, scene s2 > m2, m3), chapter c2
const tree: OutlineNode[] = [
  node('b1', 'book', null, 0),
  node('arc1', 'arc', 'b1', 0),
  node('c1', 'chapter', 'arc1', 0),
  node('c2', 'chapter', 'arc1', 1),
  node('a1', 'act', 'c1', 0),
  node('s1', 'scene', 'a1', 0, { location: 'Front door', timeValue: { day: 1, time: 1080 }, action: 'Arrives' }),
  node('s2', 'scene', 'a1', 1, { location: 'Cellar', timeValue: { day: 1, time: 1080 }, action: '' }),
  node('m1', 'moment', 's1', 0),
  node('m2', 'moment', 's2', 0),
  node('m3', 'moment', 's2', 1),
]

const parentsOf = (nodes: OutlineNode[], parentId: string) =>
  nodes.filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order).map(n => n.id)

describe('outline queries', () => {
  it('finds books, chapters (through arcs) and scenes in outline order', () => {
    expect(booksOf(tree).map(n => n.id)).toEqual(['b1'])
    expect(chaptersOfBook(tree, 'b1').map(n => n.id)).toEqual(['c1', 'c2'])
    expect(scenesInOrder(tree, 'c1').map(n => n.id)).toEqual(['s1', 's2'])
  })
})

describe('sceneChanges', () => {
  it('flags only non-empty values that differ from the previous scene', () => {
    const [s1, s2] = scenesInOrder(tree, 'c1')
    expect(sceneChanges(s1, undefined)).toEqual({ location: false, time: false, action: false })
    expect(sceneChanges(s2, s1)).toEqual({ location: true, time: false, action: false })
  })
})

describe('moveNode', () => {
  it('moves a moment before another moment in a different scene', () => {
    const next = moveNode(tree, 'm3', 'm1', 'before')!
    expect(parentsOf(next, 's1')).toEqual(['m3', 'm1'])
    expect(parentsOf(next, 's2')).toEqual(['m2'])
  })

  it('appends a moment to a scene when dropped on it', () => {
    const next = moveNode(tree, 'm1', 's2', 'inside')!
    expect(parentsOf(next, 's2')).toEqual(['m2', 'm3', 'm1'])
  })

  it('reorders scenes and moves a scene into another act', () => {
    const before = moveNode(tree, 's2', 's1', 'before')!
    expect(parentsOf(before, 'a1')).toEqual(['s2', 's1'])
  })

  it('rejects moves that break the nesting rule or loop into the node’s own subtree', () => {
    expect(moveNode(tree, 'a1', 's1', 'inside')).toBeNull() // act cannot live inside a scene
    expect(moveNode(tree, 'a1', 'm1', 'before')).toBeNull() // target is inside the act itself
    expect(moveNode(tree, 'm1', 'm1', 'before')).toBeNull()
  })
})

describe('rollUpWordCounts', () => {
  it('sums moment counts up through scenes, acts and the chapter', () => {
    const totals = rollUpWordCounts(buildChildIndex(tree), 'c1', { m1: 10, m2: 5, m3: 7 })
    expect(totals.get('m1')).toBe(10)
    expect(totals.get('s1')).toBe(10)
    expect(totals.get('s2')).toBe(12)
    expect(totals.get('a1')).toBe(22)
    expect(totals.get('c1')).toBe(22)
  })

  it('treats moments without a draft as zero words', () => {
    const totals = rollUpWordCounts(buildChildIndex(tree), 'c1', {})
    expect(totals.get('c1')).toBe(0)
    expect(totals.get('s2')).toBe(0)
  })
})
