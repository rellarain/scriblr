import { describe, expect, it } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { bookRows, categoryRows, plotCounts, projectRows, projectTotals } from './tileData'

const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)
const plot = (id: string, kind: PlotNode['kind'], parentId: string | null, over: Partial<PlotNode> = {}): PlotNode =>
  ({ id, kind, parentId, order: 0, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, sourceFieldId: null, fieldId: null, refId: null, awareness: null, ...over } as PlotNode)

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

describe('plotCounts and categoryRows', () => {
  const plotNodes = [
    plot('cat', 'category', null, { title: 'Romance' }), plot('cat2', 'category', null, { title: 'Mystery', order: 1 }),
    plot('sub', 'subcategory', 'cat'), plot('line1', 'plotline', 'sub'), plot('line2', 'plotline', 'cat'), plot('line3', 'plotline', 'cat2'),
    plot('v1', 'plotpoint', 'line1', { fieldId: 'f' }), plot('v2', 'plotpoint', 'line1', { fieldId: 'f', assignedMomentId: 'c1' }),
    plot('v3', 'plotpoint', 'line2', { fieldId: 'f' }),
  ]

  it('counts the plot and splits the values into placed and waiting', () => {
    expect(plotCounts(plotNodes)).toEqual({ categories: 2, plotlines: 3, values: 3, placed: 1, waiting: 2 })
    expect(plotCounts([])).toEqual({ categories: 0, plotlines: 0, values: 0, placed: 0, waiting: 0 })
  })

  it('counts the plotlines under each category, through its subcategories', () => {
    expect(categoryRows(plotNodes)).toEqual([
      { id: 'cat', title: 'Romance', plotlines: 2 },
      { id: 'cat2', title: 'Mystery', plotlines: 1 },
    ])
  })
})
