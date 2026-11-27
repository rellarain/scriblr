import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../api/types'
import { countsLine, nodesFromTemplate, shapeLines, templateCounts, templateFrom } from './outlineTemplates'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode => ({
  id, kind, parentId, order: 0, title: '', synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
  location: '', timeValue: {}, action: '', ...over,
})
const BOOK: OutlineNode[] = [
  node('b', 'book', null, { title: 'The Lantern Road', themeHue: 30 }),
  node('a1', 'arc', 'b', { title: 'Crossing', synopsis: 'She crosses.', themeHue: 40 }),
  node('c1', 'chapter', 'a1', { title: 'The Courier' }),
  node('fd', 'moment', 'c1', { freeDraft: true, draftRef: 'fd' }),
  node('s1', 'scene', 'c1', { location: 'The quay', action: 'She waits', timeValue: { h: 3 } }),
  node('m1', 'moment', 's1', { title: 'Lanterns', draftRef: 'm1' }),
  node('s2', 'scene', 'c1', { order: 1, location: 'The ferry' }),
  node('c2', 'chapter', 'a1', { order: 1, title: 'Tolls' }),
  node('a2', 'arc', 'b', { order: 1, title: 'The Toll' }),
  node('c3', 'chapter', 'a2', { title: 'Coins' }),
  node('other', 'chapter', 'elsewhere', { title: 'Not this book' }),
]

describe('a template from a book or a chapter', () => {
  it("keeps the book's shape in outline order, with titles and summaries when asked", () => {
    const t = templateFrom(BOOK, 'b', 'book', '  Three-arc mystery  ', { titles: true, summaries: true }, 'tpl1', '2026-11-27T10:00:00Z')
    expect(t).toMatchObject({ id: 'tpl1', kind: 'book', name: 'Three-arc mystery', createdAt: '2026-11-27T10:00:00Z' })
    expect(t.nodes.map(n => [n.key, n.parentKey, n.kind, n.title || n.location])).toEqual([
      ['t1', null, 'arc', 'Crossing'], ['t2', 't1', 'chapter', 'The Courier'], ['t3', 't2', 'scene', 'The quay'], ['t4', 't3', 'moment', 'Lanterns'],
      ['t5', 't2', 'scene', 'The ferry'], ['t6', 't1', 'chapter', 'Tolls'], ['t7', null, 'arc', 'The Toll'], ['t8', 't7', 'chapter', 'Coins'],
    ])
    expect(t.nodes[0].synopsis).toBe('She crosses.')
    expect(t.nodes[2].action).toBe('She waits')
  })

  it('leaves out the free-draft moment, the colours, the drafts and the times', () => {
    const t = templateFrom(BOOK, 'b', 'book', 'x', { titles: true, summaries: true }, 'id', 'now')
    expect(t.nodes.some(n => n.title === '' && n.kind === 'moment' && n.parentKey === 't2')).toBe(false)
    expect(Object.keys(t.nodes[0]).sort()).toEqual(['action', 'key', 'kind', 'location', 'parentKey', 'synopsis', 'title'])
  })

  it('keeps only the shape when titles and summaries are left out', () => {
    const t = templateFrom(BOOK, 'b', 'book', 'x', { titles: false, summaries: false }, 'id', 'now')
    expect(t.nodes.every(n => n.title === '' && n.synopsis === '' && n.location === '' && n.action === '')).toBe(true)
    expect(t.nodes).toHaveLength(8)
  })

  it("keeps a chapter's acts, scenes and moments", () => {
    const t = templateFrom(BOOK, 'c1', 'chapter', 'Cold open', { titles: true, summaries: false }, 'id', 'now')
    expect(t.nodes.map(n => n.kind)).toEqual(['scene', 'moment', 'scene'])
    expect(t.nodes[0].action).toBe('')
  })

  it('cuts a long name', () => {
    expect(templateFrom(BOOK, 'c1', 'chapter', 'n'.repeat(200), { titles: true, summaries: true }, 'id', 'now').name).toHaveLength(80)
  })
})

describe('what a template holds', () => {
  const t = templateFrom(BOOK, 'b', 'book', 'x', { titles: true, summaries: true }, 'id', 'now')

  it('is counted by kind and said in a line', () => {
    expect(templateCounts(t)).toEqual({ arc: 2, chapter: 3, scene: 2, moment: 1 })
    expect(countsLine(t)).toBe('2 arcs · 3 chapters · 2 scenes · 1 moment')
    expect(countsLine({ nodes: [] })).toBe('Nothing outlined yet.')
  })

  it('is drawn short for the save dialog: arcs with their chapters, each with its scenes', () => {
    expect(shapeLines(t)).toEqual([
      { text: 'Arc 1 · Crossing', depth: 0 }, { text: 'Chapter 1 · The Courier · 2 scenes', depth: 1 }, { text: 'Chapter 2 · Tolls', depth: 1 },
      { text: 'Arc 2 · The Toll', depth: 0 }, { text: 'Chapter 3 · Coins', depth: 1 },
    ])
    expect(shapeLines(t, 3)).toEqual([{ text: 'Arc 1 · Crossing', depth: 0 }, { text: 'Chapter 1 · The Courier · 2 scenes', depth: 1 }, { text: 'and 3 more', depth: 0 }])
  })
})

describe('a new book or chapter from a template', () => {
  it('makes every node of the shape under it, with fresh ids, each under its new parent and in order', () => {
    const t = templateFrom(BOOK, 'b', 'book', 'x', { titles: true, summaries: true }, 'id', 'now')
    let n = 0
    const made = nodesFromTemplate(t, 'newBook', kind => `${kind}-${++n}`)
    expect(made.map(m => [m.id, m.parentId, m.order, m.title || m.location])).toEqual([
      ['arc-1', 'newBook', 0, 'Crossing'], ['chapter-2', 'arc-1', 0, 'The Courier'], ['scene-3', 'chapter-2', 0, 'The quay'], ['moment-4', 'scene-3', 0, 'Lanterns'],
      ['scene-5', 'chapter-2', 1, 'The ferry'], ['chapter-6', 'arc-1', 1, 'Tolls'], ['arc-7', 'newBook', 1, 'The Toll'], ['chapter-8', 'arc-7', 0, 'Coins'],
    ])
  })
})
