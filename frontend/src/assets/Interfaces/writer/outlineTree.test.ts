import { describe, expect, it } from 'vitest'
import type { OutlineNode, OutlineNodeKind } from '../../../api/types'
import {
  booksOf, buildChildIndex, chaptersOfBook, dissolveSeries, inheritedSceneValues, moveNode, moveNodeTo, rollUpWordCounts, sceneChanges, scenesInOrder, shelfGroups,
} from './outlineTree'

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

describe('inheritedSceneValues', () => {
  const scene = (id: string, extra: Partial<OutlineNode> = {}) => node(id, 'scene', 'a1', 0, extra)

  it('has nothing to inherit before the first scene', () => {
    expect(inheritedSceneValues([scene('x', { location: 'Hall' })], 0)).toEqual({})
  })

  it('takes each field from the nearest earlier scene that has a value', () => {
    const scenes = [
      scene('s1', { location: 'Hall', action: 'Arrives', timeValue: { day: 1 } }),
      scene('s2', { location: 'Cellar' }),
      scene('s3', {}),
    ]
    expect(inheritedSceneValues(scenes, 2)).toEqual({ location: 'Cellar', action: 'Arrives', timeValue: { day: 1 } })
    expect(inheritedSceneValues(scenes, 1)).toEqual({ location: 'Hall', action: 'Arrives', timeValue: { day: 1 } })
  })

  it('chains through scenes that are themselves empty', () => {
    const scenes = [scene('s1', { location: 'Hall' }), scene('s2'), scene('s3'), scene('s4')]
    expect(inheritedSceneValues(scenes, 3).location).toBe('Hall')
  })

  it('ignores blank text and empty times', () => {
    const scenes = [scene('s1', { location: 'Hall' }), scene('s2', { location: '   ', timeValue: {} }), scene('s3')]
    expect(inheritedSceneValues(scenes, 2)).toEqual({ location: 'Hall' })
  })
})

describe('sceneChanges', () => {
  const scene = (extra: Partial<OutlineNode> = {}) => node('s', 'scene', 'a1', 0, extra)
  const inherited = { location: 'Front door', action: 'Arrives', timeValue: { day: 1, time: 1080 } }

  it('flags only a value of its own that differs from what it inherits', () => {
    expect(sceneChanges(scene({ location: 'Cellar' }), inherited)).toEqual({ location: true, time: false, action: false })
    expect(sceneChanges(scene({ location: 'Front door', action: 'Arrives', timeValue: { time: 1080, day: 1 } }), inherited))
      .toEqual({ location: false, time: false, action: false })
    expect(sceneChanges(scene({ timeValue: { day: 2, time: 1080 } }), inherited).time).toBe(true)
  })

  it('never flags an empty field (it inherits)', () => {
    expect(sceneChanges(scene(), inherited)).toEqual({ location: false, time: false, action: false })
    expect(sceneChanges(scene({ location: '  ' }), inherited).location).toBe(false)
  })

  it('has no change to flag when there is nothing to compare against', () => {
    expect(sceneChanges(scene({ location: 'Cellar', action: 'Hides', timeValue: { day: 3 } }), {}))
      .toEqual({ location: false, time: false, action: false })
  })

  it('compares each field with its own earlier value', () => {
    const scenes = [
      node('s1', 'scene', 'a1', 0, { location: 'Hall', action: 'Arrives' }),
      node('s2', 'scene', 'a1', 1, { location: 'Cellar' }),
      node('s3', 'scene', 'a1', 2, { location: 'Cellar', action: 'Hides' }),
    ]
    expect(sceneChanges(scenes[2], inheritedSceneValues(scenes, 2))).toEqual({ location: false, time: false, action: true })
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

describe('moveNodeTo', () => {
  it('places a node before a given child, or last with no before-id', () => {
    expect(parentsOf(moveNodeTo(tree, 'm1', 's2', 'm3')!, 's2')).toEqual(['m2', 'm1', 'm3'])
    expect(parentsOf(moveNodeTo(tree, 'm1', 's2', null)!, 's2')).toEqual(['m2', 'm3', 'm1'])
    expect(parentsOf(moveNodeTo(tree, 'm1', 's2', null)!, 's1')).toEqual([])
  })

  it('reorders inside the same parent (after the last, before the first)', () => {
    expect(parentsOf(moveNodeTo(tree, 's1', 'a1', null)!, 'a1')).toEqual(['s2', 's1'])
    expect(parentsOf(moveNodeTo(tree, 's2', 'a1', 's1')!, 'a1')).toEqual(['s2', 's1'])
  })

  it('drops into an empty container of a kind that may hold it', () => {
    const withEmptyScene = [...tree, node('s3', 'scene', 'a1', 2)]
    expect(parentsOf(moveNodeTo(withEmptyScene, 'm1', 's3', null)!, 's3')).toEqual(['m1'])
  })

  it('lets a moment sit directly in an act or chapter (strictly shallower parent)', () => {
    expect(parentsOf(moveNodeTo(tree, 'm1', 'a1', null)!, 'a1')).toEqual(['s1', 's2', 'm1'])
    expect(parentsOf(moveNodeTo(tree, 'm1', 'c1', 'a1')!, 'c1')).toEqual(['m1', 'a1'])
  })

  it('rejects nesting-rule breaks, own subtree, self and unknown siblings', () => {
    expect(moveNodeTo(tree, 'a1', 's1', null)).toBeNull()
    expect(moveNodeTo(tree, 'a1', 'a1', null)).toBeNull()
    expect(moveNodeTo(tree, 's1', 's1', null)).toBeNull()
    expect(moveNodeTo(tree, 'm1', 's2', 'm1')).toBeNull()
    expect(moveNodeTo(tree, 'm1', 's2', 'nope')).toBeNull()
    expect(moveNodeTo(tree, 'c1', 'arc1', 'a1')).toBeNull() // a1 is not a child of arc1
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

// Project level: loose book b0, series sr1 (b1, b2), loose books b3, b4, empty series sr2.
const shelf: OutlineNode[] = [
  node('b0', 'book', null, 0),
  node('sr1', 'series', null, 1),
  node('b1', 'book', 'sr1', 0),
  node('b2', 'book', 'sr1', 1),
  node('b3', 'book', null, 2),
  node('b4', 'book', null, 3),
  node('sr2', 'series', null, 4),
  node('c1', 'chapter', 'b1', 0),
]

describe('shelfGroups', () => {
  it('groups books by series and keeps runs of loose books together, in outline order', () => {
    const groups = shelfGroups(shelf)
    expect(groups.map(g => [g.series?.id ?? null, g.books.map(b => b.id)])).toEqual([
      [null, ['b0']], ['sr1', ['b1', 'b2']], [null, ['b3', 'b4']], ['sr2', []],
    ])
  })

  it('is one loose group for a project without series', () => {
    expect(shelfGroups([node('x', 'book', null, 0), node('y', 'book', null, 1)]).map(g => g.books.length)).toEqual([2])
    expect(shelfGroups([])).toEqual([])
  })
})

describe('dissolveSeries', () => {
  it('frees its books in the place of the series and removes only the series', () => {
    const next = dissolveSeries(shelf, 'sr1')
    expect(next.some(n => n.id === 'sr1')).toBe(false)
    const root = next.filter(n => n.parentId === null).sort((a, b) => a.order - b.order).map(n => n.id)
    expect(root).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'sr2'])
    expect(next.find(n => n.id === 'c1')?.parentId).toBe('b1') // chapters untouched
  })

  it('leaves the tree alone for an unknown id or a non-series', () => {
    expect(dissolveSeries(shelf, 'nope')).toBe(shelf)
    expect(dissolveSeries(shelf, 'b1')).toBe(shelf)
  })
})

describe('moveNodeTo at the project level', () => {
  const rootIds = (nodes: OutlineNode[]) => nodes.filter(n => n.parentId === null).sort((a, b) => a.order - b.order).map(n => n.id)

  it('takes a book out of a series to the top level, and into one', () => {
    expect(rootIds(moveNodeTo(shelf, 'b1', null, 'b3')!)).toEqual(['b0', 'sr1', 'b1', 'b3', 'b4', 'sr2'])
    expect(parentsOf(moveNodeTo(shelf, 'b3', 'sr2', null)!, 'sr2')).toEqual(['b3'])
    expect(parentsOf(moveNodeTo(shelf, 'b0', 'sr1', 'b2')!, 'sr1')).toEqual(['b1', 'b0', 'b2'])
  })

  it('moves a series (with its books) among loose books', () => {
    const next = moveNodeTo(shelf, 'sr1', null, 'b0')!
    expect(rootIds(next)).toEqual(['sr1', 'b0', 'b3', 'b4', 'sr2'])
    expect(parentsOf(next, 'sr1')).toEqual(['b1', 'b2'])
  })

  it('keeps series out of series and out of books, and only books and series at the top', () => {
    expect(moveNodeTo(shelf, 'sr2', 'sr1', null)).toBeNull()
    expect(moveNodeTo(shelf, 'b1', 'b0', null)).toBeNull()
    expect(moveNodeTo(shelf, 'c1', null, null)).toBeNull()
  })
})
