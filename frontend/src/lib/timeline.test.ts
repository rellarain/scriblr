import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from './facets'
import { dragResult, intervalStates, layoutLanes, rangeOf, shiftStatus } from './timeline'

const s = (startSlot: number, endSlot: number) => ({ startSlot, endSlot })

describe('lanes', () => {
  it('puts overlapping shifts side by side and lets a later one reuse the free lane', () => {
    const out = layoutLanes([s(48, 60), s(54, 66), s(60, 70), s(100, 110)])
    expect(out.map(o => [o.startSlot, o.lane, o.lanes])).toEqual([[48, 0, 2], [54, 1, 2], [60, 0, 2], [100, 0, 1]])
  })
  it('gives a lone shift the whole width', () => {
    expect(layoutLanes([s(10, 20)])).toEqual([{ startSlot: 10, endSlot: 20, lane: 0, lanes: 1 }])
    expect(layoutLanes([])).toEqual([])
  })
  it('keeps shifts that only touch in separate clusters', () => {
    expect(layoutLanes([s(10, 20), s(20, 30)]).map(o => o.lanes)).toEqual([1, 1])
  })
})

describe('dragging', () => {
  it('moves a shift without leaving the day', () => {
    expect(dragResult('move', 48, 60, 6)).toEqual(s(54, 66))
    expect(dragResult('move', 48, 60, -100)).toEqual(s(0, 12))
    expect(dragResult('move', 48, 60, 500)).toEqual(s(132, 144))
  })
  it('resizes from either edge, never below half an hour', () => {
    expect(dragResult('top', 48, 60, -6)).toEqual(s(42, 60))
    expect(dragResult('top', 48, 60, 50)).toEqual(s(57, 60))
    expect(dragResult('bottom', 48, 60, 6)).toEqual(s(48, 66))
    expect(dragResult('bottom', 48, 60, -50)).toEqual(s(48, 51))
    expect(dragResult('bottom', 48, 60, 500)).toEqual(s(48, 144))
  })
  it('makes a range from where a drag began to where it ended, either way', () => {
    expect(rangeOf(50, 58)).toEqual(s(50, 59))
    expect(rangeOf(58, 50)).toEqual(s(50, 59))
    expect(rangeOf(50, 50)).toEqual(s(50, 53))
    expect(rangeOf(142, 143)).toEqual(s(142, 144))
  })
})

describe('how a shift went, interval by interval', () => {
  const event = (slot: number, facet: ActivityEvent['facet'] = 'draft', date = '2026-10-30'): ActivityEvent => ({ ts: '', date, slot, facet, action: 'edit', nodeId: null, kind: null, label: null, amount: 1 })
  const o = { date: '2026-10-30', startSlot: 48, endSlot: 54, facet: 'draft' as const }
  it('is done where the facet logged something and missed where not, each slot by itself', () => {
    const states = intervalStates(o, [event(48), event(50), event(51, 'plot'), event(60)], '2026-10-31', 0, '2026-10-17')
    expect(states).toEqual(['done', 'missed', 'done', 'missed', 'missed', 'missed'])
    expect(shiftStatus(states, o, '2026-10-31', 0)).toBe('partly')
  })
  it('is done when every slot is, missed when none is', () => {
    const all = intervalStates(o, [48, 49, 50, 51, 52, 53].map(n => event(n)), '2026-10-31', 0, '2026-10-17')
    expect(shiftStatus(all, o, '2026-10-31', 0)).toBe('done')
    const none = intervalStates(o, [], '2026-10-31', 0, '2026-10-17')
    expect(shiftStatus(none, o, '2026-10-31', 0)).toBe('missed')
  })
  it('is pending until the clock reaches a slot, and upcoming before the shift starts', () => {
    const today = { ...o, date: '2026-10-31' }
    const states = intervalStates(today, [event(48, 'draft', '2026-10-31')], '2026-10-31', 50, '2026-10-17')
    expect(states).toEqual(['done', 'missed', 'pending', 'pending', 'pending', 'pending'])
    expect(shiftStatus(states, today, '2026-10-31', 50)).toBe('inProgress')
    expect(shiftStatus(states, today, '2026-10-31', 40)).toBe('upcoming')
    expect(shiftStatus(states, { ...o, date: '2026-11-02' }, '2026-10-31', 90)).toBe('upcoming')
  })
  it('does not call an old shift missed once the events it would show have been dropped', () => {
    const old = { ...o, date: '2026-09-01' }
    const states = intervalStates(old, [], '2026-10-31', 0, '2026-10-17')
    expect(states.every(x => x === 'unknown')).toBe(true)
    expect(shiftStatus(states, old, '2026-10-31', 0)).toBe('past')
  })
})
