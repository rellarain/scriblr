import { describe, expect, it } from 'vitest'
import { emptyDay, type ActivityEvent } from './facets'
import {
  chapterPlaces, currentPass, goalProgress, goalTitle, kindsList, passesInOrder, passFlags, passReads, passState, passSummary, passWordChange,
  type FlagLike, type PassFacts, type RevisionPass,
} from './revisionPasses'

const pass = (over: Partial<RevisionPass> = {}): RevisionPass => ({ id: 'p', name: 'Tighten', start: '2026-11-14', end: '2026-12-20', kinds: ['remove', 'merge', 'simplify'], goals: [], ...over })
const flag = (id: string, type: FlagLike['type'], resolvedAt: string | null = null): FlagLike => ({ id, scope: 'passage', type, resolvedAt })
const event = (date: string, nodeId: string, action: ActivityEvent['action'] = 'read'): ActivityEvent =>
  ({ ts: `${date}T10:00:00`, date, slot: 60, facet: 'revision', action, nodeId, kind: 'chapter', label: null, amount: 1 })
const day = (draft: number) => ({ ...emptyDay(), draft })

describe('a revision pass', () => {
  it('is upcoming, running or done by its days, and runs on without a last day', () => {
    expect(passState(pass(), '2026-11-13')).toBe('upcoming')
    expect(passState(pass(), '2026-11-14')).toBe('running')
    expect(passState(pass(), '2026-12-20')).toBe('running')
    expect(passState(pass(), '2026-12-21')).toBe('done')
    expect(passState(pass({ end: null }), '2030-01-01')).toBe('running')
  })

  it('works through the open flags of its kinds and those resolved while it runs', () => {
    const flags = [
      flag('a', 'remove'), flag('b', 'merge', '2026-11-20T12:00:00'), flag('c', 'simplify', '2026-11-01T12:00:00'),
      flag('d', 'change'), flag('e', 'remove', '2026-12-25T12:00:00'),
    ]
    const mine = passFlags(pass(), flags, '2026-12-30')
    expect(mine.open.map(f => f.id)).toEqual(['a'])
    expect(mine.resolved.map(f => f.id)).toEqual(['b']) // c was resolved before it started, e after it ended
    expect(mine.total).toBe(2)
  })

  it('counts the net words while it runs, and the chapters read', () => {
    const daily = { '2026-11-13': day(-500), '2026-11-15': day(-2000), '2026-11-16': day(300), '2026-12-21': day(-900) }
    expect(passWordChange(pass(), daily, '2026-12-30')).toBe(-1700)
    expect(passWordChange(pass({ start: '2027-01-05', end: null }), daily, '2026-12-30')).toBe(0)
    const events = [event('2026-11-15', 'c1'), event('2026-11-16', 'c1'), event('2026-11-17', 'c2'), event('2026-11-01', 'c3'), event('2026-11-18', 'c4', 'edit')]
    expect([...passReads(pass(), events, '2026-11-20')]).toEqual(['c1', 'c2'])
  })
})

describe("a pass's goals", () => {
  const facts: PassFacts = {
    flags: [flag('a', 'remove'), flag('b', 'merge', '2026-11-20T12:00:00')],
    daily: { '2026-11-15': day(-3150) },
    events: [event('2026-11-15', 'c1'), event('2026-11-16', 'c2')],
    chapterIds: ['c1', 'c2', 'c3'],
    today: '2026-11-21',
  }

  it('say what they ask', () => {
    expect(goalTitle({ id: 'g', kind: 'flags', words: null }, pass())).toBe('Resolve every Remove, Merge and Simplify flag')
    expect(goalTitle({ id: 'g', kind: 'flags', words: null }, pass({ kinds: [] }))).toContain('choose their kinds')
    expect(goalTitle({ id: 'g', kind: 'words', words: -8000 }, pass())).toBe('Cut 8,000 words across the project')
    expect(goalTitle({ id: 'g', kind: 'words', words: 1200 }, pass())).toBe('Add 1,200 words across the project')
    expect(goalTitle({ id: 'g', kind: 'read', words: null }, pass())).toBe('Read every chapter once')
    expect(kindsList(['review'])).toBe('Review')
    expect(kindsList(['add', 'review'])).toBe('Add and Review')
  })

  it('say how far they have come', () => {
    expect(goalProgress({ id: 'g', kind: 'flags', words: null }, pass(), facts)).toEqual({ done: 1, target: 2, text: '1 of 2' })
    expect(goalProgress({ id: 'g', kind: 'words', words: -8000 }, pass(), facts)).toEqual({ done: 3150, target: 8000, text: '3,150 cut' })
    expect(goalProgress({ id: 'g', kind: 'words', words: 500 }, pass(), facts)).toEqual({ done: 0, target: 500, text: '0 added' })
    expect(goalProgress({ id: 'g', kind: 'read', words: null }, pass(), facts)).toEqual({ done: 2, target: 3, text: '2 of 3 chapters' })
  })
})

describe('the passes together', () => {
  const passes = [
    pass({ id: 'p3', name: 'Polish', start: '2027-01-05', end: null }),
    pass({ id: 'p1', name: 'Structure', start: '2026-10-01', end: '2026-11-02' }),
    pass({ id: 'p2' }),
  ]

  it('come in the order of their first days, the running one shown first', () => {
    expect(passesInOrder(passes).map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(currentPass(passes, '2026-11-20')?.id).toBe('p2')
    expect(currentPass(passes, '2026-12-25')?.id).toBe('p3')
    expect(currentPass(passes.filter(p => p.id === 'p1'), '2026-12-25')?.id).toBe('p1')
    expect(currentPass([], '2026-12-25')).toBeNull()
  })

  it("each say on its card when it runs and how many of its flags are done", () => {
    const flags = [flag('a', 'remove', '2026-10-10T12:00:00')]
    expect(passSummary(passes[1], flags, '2026-11-20')).toBe('Done 2 Nov · 1 of 1 flags')
    expect(passSummary(passes[2], [], '2026-11-20')).toBe('14 Nov to 20 Dec · 0 of 0 flags')
    expect(passSummary(passes[0], [], '2026-11-20')).toBe('From 5 Jan · not started')
    expect(passSummary(pass({ end: null, kinds: [] }), [], '2026-11-20')).toBe('From 14 Nov')
  })
})

describe("the project's chapters", () => {
  it('come in outline order, each said by its book and number', () => {
    const outline = [
      { id: 'series', kind: 'series', parentId: null, title: 'Saga', order: 0 },
      { id: 'b2', kind: 'book', parentId: 'series', title: 'Two', order: 1 },
      { id: 'b1', kind: 'book', parentId: 'series', title: 'One', order: 0 },
      { id: 'arc', kind: 'arc', parentId: 'b1', title: 'Arc', order: 0 },
      { id: 'c2', kind: 'chapter', parentId: 'arc', title: 'B', order: 1 },
      { id: 'c1', kind: 'chapter', parentId: 'arc', title: 'A', order: 0 },
      { id: 'c3', kind: 'chapter', parentId: 'b2', title: 'C', order: 0 },
      { id: 'loose', kind: 'chapter', parentId: null, title: 'Alone', order: 1 },
    ]
    const places = chapterPlaces(outline)
    expect(places.chapterIds).toEqual(['c1', 'c2', 'c3', 'loose'])
    expect(['c1', 'c2', 'c3', 'loose', 'nope'].map(places.whereOf)).toEqual(['Book 1 · Ch 1', 'Book 1 · Ch 2', 'Book 2 · Ch 1', 'Ch 1', ''])
  })
})
