import { describe, expect, it } from 'vitest'
import { emptyPlanner, newMilestone, newPhase } from './facets'
import { barOf, dragPhase, daysForPx, pct, restBars, timelineRange, todayPct, widthPct } from './planTimeline'

const plan = (over = {}) => ({
  ...emptyPlanner(),
  timelineStart: '2026-10-01', timelineEnd: '2026-12-30',
  phases: [newPhase('a', 'Outline', { start: '2026-10-01', end: '2026-10-30' }), newPhase('b', 'Draft', { start: '2026-11-01', end: '2026-12-30' })],
  ...over,
})

describe('timelineRange', () => {
  it('runs from the earliest date to the latest, across the project, the phases and the milestones', () => {
    const r = timelineRange(plan({ milestones: [newMilestone('m', 'Beta', { date: '2027-01-14' })] }))
    expect(r).toEqual({ from: '2026-10-01', to: '2027-01-14', days: 106 })
  })

  it('has nothing to show before anything is dated, and is never under two weeks', () => {
    expect(timelineRange(emptyPlanner())).toBeNull()
    const r = timelineRange({ ...emptyPlanner(), phases: [newPhase('a', 'A', { start: '2026-10-01', end: '2026-10-03' })] })
    expect(r).toEqual({ from: '2026-10-01', to: '2026-10-15', days: 15 })
  })

  it('leaves out the dates of a phase that has none', () => {
    expect(timelineRange({ ...emptyPlanner(), phases: [newPhase('a', 'A', { offsetDays: 30, lengthDays: 60 })] })).toBeNull()
  })
})

describe('where things fall', () => {
  const r = { from: '2026-10-01', to: '2026-10-20', days: 20 }
  it('puts a date and a width as shares of the chart', () => {
    expect(pct('2026-10-11', r)).toBe(50)
    expect(widthPct(5, r)).toBe(25)
  })

  it('draws a bar from the first day to the last inclusive, a one-day bar for one date and none for none', () => {
    expect(barOf(newPhase('a', 'A', { start: '2026-10-01', end: '2026-10-10' }), r)).toEqual({ left: 0, width: 50 })
    expect(barOf(newPhase('a', 'A', { start: '2026-10-05' }), r)).toEqual({ left: 20, width: 5 })
    expect(barOf(newPhase('a', 'A'), r)).toBeNull()
  })

  it('clips the rest days to the range and leaves out those outside it', () => {
    const bars = restBars([{ id: 'x', start: '2026-09-28', end: '2026-10-02', label: 'Away' }, { id: 'y', start: '2026-11-01', end: '2026-11-03', label: 'Later' }], r)
    expect(bars).toEqual([{ id: 'x', label: 'Away', left: 0, width: 10 }])
  })

  it('puts today in the middle of its day, or nowhere when it is outside', () => {
    expect(todayPct('2026-10-01', r)).toBe(2.5)
    expect(todayPct('2026-11-01', r)).toBeNull()
  })

  it('turns a distance of pixels into whole days', () => {
    expect(daysForPx(100, 400, r)).toBe(5)
    expect(daysForPx(10, 0, r)).toBe(0)
  })
})

describe('dragPhase', () => {
  const p = newPhase('a', 'A', { start: '2026-10-10', end: '2026-10-20' })
  it('moves both dates, or changes only the start or the end', () => {
    expect(dragPhase(p, 'move', 3)).toEqual({ start: '2026-10-13', end: '2026-10-23' })
    expect(dragPhase(p, 'start', -2)).toEqual({ start: '2026-10-08', end: '2026-10-20' })
    expect(dragPhase(p, 'end', 5)).toEqual({ start: '2026-10-10', end: '2026-10-25' })
  })

  it('never lets the start pass the end or the end pass the start', () => {
    expect(dragPhase(p, 'start', 30)).toEqual({ start: '2026-10-20', end: '2026-10-20' })
    expect(dragPhase(p, 'end', -30)).toEqual({ start: '2026-10-10', end: '2026-10-10' })
  })

  it('moves the one date of a phase that has one, and leaves an undated phase alone', () => {
    expect(dragPhase(newPhase('a', 'A', { start: '2026-10-10' }), 'move', 2)).toEqual({ start: '2026-10-12', end: null })
    expect(dragPhase(newPhase('a', 'A'), 'move', 2)).toEqual({ start: null, end: null })
  })
})
