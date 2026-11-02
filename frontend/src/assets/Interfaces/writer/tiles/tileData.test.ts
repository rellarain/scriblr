import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { bookRows, projectRows, projectTotals } from './tileData'

const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)

const nodes = [
  outline('b1', 'book', null, { title: 'One' }), outline('b2', 'book', null, { title: 'Two' }),
  outline('c1', 'chapter', 'b1'), outline('c2', 'chapter', 'b1'), outline('c3', 'chapter', 'b2'),
  outline('m1', 'moment', 'c1'), outline('m2', 'moment', 'c1', { freeDraft: true }),
]

describe('projectRows and projectTotals', () => {
  it('counts books, chapters and moments (not the free draft) per project', () => {
    const rows = projectRows([{ projectId: 'p1', title: 'Saga' }, { projectId: 'p2', title: 'Empty' }], { p1: nodes })
    expect(rows).toEqual([
      { id: 'p1', title: 'Saga', books: 2, chapters: 3, moments: 1 },
      { id: 'p2', title: 'Empty', books: 0, chapters: 0, moments: 0 },
    ])
    expect(projectTotals(rows)).toEqual({ projects: 2, books: 2, chapters: 3, moments: 1 })
  })
})

describe('bookRows', () => {
  it('lists each book with its chapter count', () => {
    expect(bookRows(nodes)).toEqual([{ id: 'b1', title: 'One', chapters: 2 }, { id: 'b2', title: 'Two', chapters: 1 }])
  })
})
