import { describe, expect, it } from 'vitest'
import { goalMet, lastDays, lastMonths, monthlyAverage, monthlyCount } from './readerAnalytics'

const day = (pages: number, minutes: number) => ({ pages, minutes, sessions: 1 })

describe('lastMonths', () => {
  it('lists the months that end with the current one, oldest first, across a year end', () => {
    const months = lastMonths('2026-02-10', 4)
    expect(months.map(m => m.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(months.map(m => m.label)).toEqual(['Nov', 'Dec', 'Jan', 'Feb'])
  })

  it('gives this month the days it has had and the others all of theirs', () => {
    expect(lastMonths('2028-03-10', 2).map(m => m.days)).toEqual([29, 10]) // 2028 is a leap year
  })
})

describe('monthlyAverage', () => {
  const activity = { '2026-09-02': day(30, 60), '2026-09-20': day(10, 30), '2026-10-01': day(8, 20), '2026-10-05': day(100, 100), '2026-11-30': day(500, 500) }

  it('averages a day of each month: its total over the days it has had', () => {
    const bars = monthlyAverage(activity, '2026-10-10', 'pages', 3)
    expect(bars.map(b => [b.key, b.value])).toEqual([['2026-08', 0], ['2026-09', 1.3], ['2026-10', 10.8]]) // 40 / 30, 108 / 10
  })

  it('counts minutes as well, and leaves out days after today', () => {
    const bars = monthlyAverage(activity, '2026-10-10', 'minutes', 2)
    expect(bars.map(b => b.value)).toEqual([3, 12])
  })
})

describe('monthlyCount', () => {
  it('counts the times in each month', () => {
    const bars = monthlyCount(['2026-09-02T10:00:00Z', '2026-09-30T23:00:00Z', '2026-10-01T00:00:00Z', '2025-01-01T00:00:00Z'], '2026-10-10', 3)
    expect(bars.map(b => [b.label, b.value])).toEqual([['Aug', 0], ['Sep', 2], ['Oct', 1]])
  })
})

describe('lastDays', () => {
  it('lists one number for each of the days up to today, 0 where nothing was done', () => {
    const days = lastDays({ '2026-10-09': day(12, 5), '2026-10-10': day(3, 2) }, '2026-10-10', 'pages', 3)
    expect(days).toEqual([{ date: '2026-10-08', value: 0 }, { date: '2026-10-09', value: 12 }, { date: '2026-10-10', value: 3 }])
  })
})

describe('goalMet', () => {
  it('is met at the goal or above it, and never without a goal', () => {
    expect([goalMet(20, 20), goalMet(19, 20), goalMet(5, 0)]).toEqual([true, false, false])
  })
})
