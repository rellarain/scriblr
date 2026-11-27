import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../api/types'
import type { ChapterRevisionSummary, TreeSnapshotSummary } from '../types'
import { emptyDay, type ActivityEvent } from './facets'
import { chapterPlacesOf, dayLabel, dayLine, filterItems, historyDays, historyItems, localDayOf, localTimeOf } from './historyTimeline'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, title = '', order = 0): OutlineNode =>
  ({ id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null } as OutlineNode)
const NODES = [
  node('b1', 'book', null, 'The Lantern Road'), node('a1', 'arc', 'b1', 'Crossing'),
  node('c1', 'chapter', 'a1', 'The Courier'), node('m1', 'moment', 'c1'),
  node('c2', 'chapter', 'b1', 'Tolls', 1), node('m2', 'moment', 'c2'),
  node('b2', 'book', null, 'Salt', 1), node('c3', 'chapter', 'b2', 'Tide'), node('m3', 'moment', 'c3'),
]
// A local time on a day, as the backend writes an event's ts.
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00`).toISOString()
const words = (day: string, hm: string, nodeId: string, amount: number): ActivityEvent =>
  ({ ts: at(day, hm), date: day, slot: 0, facet: 'draft', action: 'words', nodeId, kind: 'moment', label: null, amount })
const flagEvent = (day: string, hm: string, action: 'flag' | 'resolve'): ActivityEvent =>
  ({ ts: at(day, hm), date: day, slot: 0, facet: 'revision', action, nodeId: 'f', kind: 'passage-flag', label: null, amount: 1 })
const snap = (id: string, day: string, hm: string, summary: string, nodeCount: number, trigger: TreeSnapshotSummary['trigger'] = 'auto'): TreeSnapshotSummary =>
  ({ snapshotId: id, treeType: 'outline', createdAt: at(day, hm), trigger, nodeCount, summary })
const rev = (id: string, chapterId: string, day: string, hm: string, trigger: ChapterRevisionSummary['trigger'], label: string, wordCount = 100): ChapterRevisionSummary =>
  ({ snapshotId: id, chapterId, createdAt: at(day, hm), label, trigger, wordCount })

describe('the chapters’ places', () => {
  it('name each chapter by its number across its book, and find a node’s chapter and book', () => {
    const p = chapterPlacesOf(NODES)
    expect(p.name('c1')).toBe('Chapter 1 · The Courier')
    expect(p.name('c2')).toBe('Chapter 2 · Tolls')
    expect(p.name('c3')).toBe('Chapter 1 · Tide')
    expect(p.name('gone')).toBe('A chapter no longer in the outline')
    expect(p.chapterOf('m2')).toBe('c2')
    expect(p.bookOf('m3')).toBe('b2')
  })
})

describe('the history’s items', () => {
  const input = {
    events: [
      words('2026-11-26', '09:10', 'm1', 120), words('2026-11-26', '09:40', 'm2', 66),
      words('2026-11-26', '14:00', 'm2', -20),
      flagEvent('2026-11-26', '10:00', 'flag'), flagEvent('2026-11-26', '10:05', 'flag'), flagEvent('2026-11-26', '11:00', 'resolve'),
    ],
    daily: { '2026-11-20': { ...emptyDay(), draft: 1940 }, '2026-11-26': { ...emptyDay(), draft: 166 } },
    outline: [snap('o2', '2026-11-26', '09:58', '+1 added, 2 modified', 13), snap('o1', '2026-11-20', '19:00', '+12 added', 12)], // newest first, as the backend lists them
    plot: [],
    revisions: [rev('r1', 'c1', '2026-11-26', '10:15', 'auto', 'Auto'), rev('r2', 'c3', '2026-11-25', '16:20', 'manual', '2026-11-25 16:20', 920)],
    nodes: NODES,
  }

  it('put the writing in sittings, with its words and chapters, and a day before the events as its total', () => {
    const writing = historyItems(input).filter(i => i.kind === 'writing')
    expect(writing.map(i => [i.day, i.time, i.text])).toEqual([
      ['2026-11-26', '14:00', '20 words cut in Chapter 2 · Tolls'],
      ['2026-11-26', '09:40', '186 words in Chapters 1 and 2'],
      ['2026-11-20', '', '1,940 words written that day'],
    ])
    expect(writing[1].books).toEqual(['b1'])
  })

  it('count the flags added and resolved each day', () => {
    expect(historyItems(input).filter(i => i.kind === 'flags').map(i => [i.time, i.text])).toEqual([['11:00', '1 flag resolved'], ['10:05', '2 flags added']])
  })

  it('say what each outline snapshot changed, and let it be restored', () => {
    const outline = historyItems(input).filter(i => i.kind === 'outline')
    expect(outline.map(i => i.text)).toEqual(['1 added, 2 changed · the outline then: 13 nodes', 'The outline’s oldest snapshot · 12 nodes'])
    expect(outline[0].restore).toEqual({ scope: 'outline', snapshotId: 'o2' })
    expect(outline[0].books).toEqual([])
  })

  it('name each revision by its chapter and how it was made, to compare and restore', () => {
    const revisions = historyItems(input).filter(i => i.kind === 'revision')
    expect(revisions.map(i => i.text)).toEqual(['Chapter 1 · The Courier · the rolling snapshot after 5 minutes idle', 'Chapter 1 · Tide · saved by you, 2026-11-25 16:20 (920 words)'])
    expect(revisions[0]).toMatchObject({ books: ['b1'], restore: { scope: 'chapter', chapterId: 'c1', snapshotId: 'r1' }, compare: { chapterId: 'c1', snapshotId: 'r1' } })
  })

  it('come newest first, by day, each day with its words and changes', () => {
    const days = historyDays(historyItems(input), input.daily, '2026-11-26')
    expect(days.map(d => d.day)).toEqual(['2026-11-26', '2026-11-25', '2026-11-20'])
    expect(dayLine(days[0])).toBe(`Today, Thursday 26 November · 166 words · ${days[0].items.length} changes`)
    expect(dayLine(days[1])).toBe('Yesterday, Wednesday 25 November · 1 change')
  })

  it('are kept by kind and by book (what is about the whole project shows for every book only)', () => {
    const items = historyItems(input)
    expect(filterItems(items, ['revision', 'outline'], null).every(i => i.kind === 'revision' || i.kind === 'outline')).toBe(true)
    const book2 = filterItems(items, null, 'b2')
    expect(book2.map(i => i.id)).toEqual([`r-c3-r2`])
  })

  it('and by the words searched for, each somewhere in the text, in any case', () => {
    const items = historyItems(input)
    expect(filterItems(items, null, null, '  tolls  CUT ').map(i => i.text)).toEqual(['20 words cut in Chapter 2 · Tolls'])
    expect(filterItems(items, null, null, '')).toHaveLength(items.length)
  })
})

describe('the days', () => {
  it('are called today, yesterday or by their date, with the year when it is not this one', () => {
    expect(dayLabel('2026-11-23', '2026-11-26')).toBe('Monday 23 November')
    expect(dayLabel('2025-12-26', '2026-11-26')).toBe('Friday 26 December 2025')
  })

  it('and times are local', () => {
    const iso = new Date('2026-11-26T08:05:00').toISOString()
    expect(localDayOf(iso)).toBe('2026-11-26')
    expect(localTimeOf(iso)).toBe('08:05')
  })
})
