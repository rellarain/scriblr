import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from './facets'
import { shiftProgress } from './shiftProgress'
import { durationText, nextUp } from './nextUp'
import type { ShiftOccurrence } from './recurrence'

const ev = (slot: number, amount: number, over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  ts: '', date: '2026-11-04', slot, facet: 'draft', action: 'words', nodeId: 'm', kind: 'moment', label: null, amount, ...over,
})
const shift = { date: '2026-11-04', startSlot: 54, endSlot: 66, facet: 'draft' as const, target: 800 }

describe('shiftProgress', () => {
  it('counts what the facet logged inside the shift\'s slots on its day, against the aim', () => {
    const events = [ev(54, 300), ev(65, 100), ev(66, 999), ev(53, 999), ev(60, 50, { date: '2026-11-03' }), ev(60, 50, { facet: 'plot', action: 'create' })]
    expect(shiftProgress(shift, events)).toEqual({ done: 400, aim: 800, pct: 0.5 })
  })
  it('does not go below zero or past the aim, and has none without an aim', () => {
    expect(shiftProgress(shift, [ev(60, -200)])?.done).toBe(0)
    expect(shiftProgress(shift, [ev(60, 5000)])?.pct).toBe(1)
    expect(shiftProgress({ ...shift, target: null }, [ev(60, 100)])).toBeNull()
  })
  it('counts nodes added for an outline shift', () => {
    const outline = { ...shift, facet: 'outline' as const, target: 4 }
    expect(shiftProgress(outline, [ev(60, 1, { facet: 'outline', action: 'create' }), ev(61, 1, { facet: 'outline', action: 'edit' })])).toMatchObject({ done: 1, aim: 4 })
  })
})

const occ = (date: string, startSlot: number, endSlot: number): ShiftOccurrence => ({ shiftId: `${date}${startSlot}`, date, title: 't', startSlot, endSlot, facet: 'draft', target: null, repeats: false })

describe('nextUp', () => {
  const list = [occ('2026-11-05', 54, 66), occ('2026-11-04', 90, 100), occ('2026-11-04', 54, 66)]
  it('is the shift running now, with the time left', () => {
    expect(nextUp(list, '2026-11-04', 60)).toMatchObject({ kind: 'running', minutes: 60, occ: { startSlot: 54 } })
  })
  it('is else the next to start, today or on a later day, with the time until it', () => {
    expect(nextUp(list, '2026-11-04', 70)).toMatchObject({ kind: 'next', days: 0, minutes: 200, occ: { startSlot: 90 } })
    expect(nextUp(list, '2026-11-04', 120)).toMatchObject({ kind: 'next', days: 1, occ: { date: '2026-11-05' } })
  })
  it('is nothing when there is no shift left', () => {
    expect(nextUp([occ('2026-11-03', 54, 66)], '2026-11-04', 0)).toBeNull()
  })
})

describe('durationText', () => {
  it('reads minutes, hours and days', () => {
    expect([durationText(5), durationText(120), durationText(90), durationText(4320)]).toEqual(['5 min', '2 h', '1 h 30 min', '3 days'])
  })
})
