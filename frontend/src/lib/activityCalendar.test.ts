import { describe, expect, it } from 'vitest'
import { bestStreak, buildCalendar, lastWeek, streakUntil } from './activityCalendar'

const TODAY = '2026-10-11' // a Sunday

describe('the calendar', () => {
  it('is 53 weeks of 7 days, Sunday first, with today in the last column and the days after it hidden', () => {
    const g = buildCalendar({}, '2026-10-14', 'words', 'No writing') // a Wednesday
    expect(g.cells).toHaveLength(53 * 7)
    expect(g.cells[0].date.slice(0, 4)).toBe('2025')
    expect(new Date(`${g.cells[0].date}T00:00:00Z`).getUTCDay()).toBe(0)
    const last = g.cells.slice(-7)
    expect(last.map(c => c.level)).toEqual([0, 0, 0, 0, -1, -1, -1]) // Sunday to Wednesday are here; Thursday on are not
    expect(last[3].date).toBe('2026-10-14')
  })

  it('shades a day by its share of the busiest day, in four steps', () => {
    const g = buildCalendar({ '2026-10-11': 100, '2026-10-10': 80, '2026-10-09': 40, '2026-10-08': 10 }, TODAY, 'words', 'No writing')
    const level = (d: string) => g.cells.find(c => c.date === d)?.level
    expect([level('2026-10-11'), level('2026-10-10'), level('2026-10-09'), level('2026-10-08'), level('2026-10-07')]).toEqual([4, 4, 2, 1, 0])
    expect(g.total).toBe(230)
    expect(g.activeDays).toBe(4)
  })

  it('titles a day with its count or says it was quiet, and ignores days outside the 53 weeks', () => {
    const g = buildCalendar({ '2026-10-11': 1200, '2024-01-01': 999 }, TODAY, 'words', 'No writing')
    expect(g.cells.find(c => c.date === '2026-10-11')?.title).toBe('1,200 words on Oct 11')
    expect(g.cells.find(c => c.date === '2026-10-10')?.title).toBe('No writing on Oct 10')
    expect(g.total).toBe(1200)
  })

  it('labels the months at the first week of each', () => {
    const g = buildCalendar({}, TODAY, 'words', 'idle')
    expect(g.months[g.months.length - 1].label).toBe('Oct')
    expect(g.months.length).toBeGreaterThanOrEqual(12)
  })
})

describe('streaks', () => {
  const has = (...days: string[]) => (d: string) => days.includes(d)
  it('counts the days up to today, and a quiet today does not break it', () => {
    expect(streakUntil(has('2026-10-11', '2026-10-10', '2026-10-09'), TODAY)).toBe(3)
    expect(streakUntil(has('2026-10-10', '2026-10-09'), TODAY)).toBe(2)
    expect(streakUntil(has('2026-10-08'), TODAY)).toBe(0)
  })
  it('finds the longest run in the year', () => {
    expect(bestStreak(has('2026-03-01', '2026-03-02', '2026-03-03', '2026-05-01', '2026-05-02'), TODAY)).toBe(3)
    expect(bestStreak(has(), TODAY)).toBe(0)
  })
  it('lists the seven days ending today with their letters', () => {
    const week = lastWeek(TODAY)
    expect(week.map(d => d.date)[6]).toBe(TODAY)
    expect(week.map(d => d.letter).join('')).toBe('MTWTFSS')
  })
})
