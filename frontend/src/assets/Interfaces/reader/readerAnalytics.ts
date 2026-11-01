import type { ActivityDay } from '../../../api/reader'

// The numbers behind the Analytics console's charts: the average a day of each month, what is written in a club each month, and the last days one by one.
// Dates are UTC days, YYYY-MM-DD, as the activity is kept.

export type DayMetric = 'minutes' | 'pages'

export interface MonthBar {
  key: string // YYYY-MM
  label: string // Jan, Feb, ...
  value: number
  // The days the month has had so far (all of them but this month's, which has the days up to today).
  days: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000
const parse = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

// The `count` months that end with today's, oldest first.
export function lastMonths(today: string, count = 12): Array<{ key: string; label: string; year: number; month: number; days: number }> {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) - 1
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(Date.UTC(year, month - (count - 1 - i), 1))
    const y = at.getUTCFullYear()
    const m = at.getUTCMonth()
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    return { key, label: MONTHS[m], year: y, month: m, days: key === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysIn(y, m) }
  })
}

// What a day of each month averages: the month's total over the days it has had (a day with nothing counts as 0).
export function monthlyAverage(activity: Record<string, ActivityDay>, today: string, metric: DayMetric, count = 12): MonthBar[] {
  const totals = new Map<string, number>()
  for (const [date, day] of Object.entries(activity)) {
    if (date > today) continue
    const key = date.slice(0, 7)
    totals.set(key, (totals.get(key) ?? 0) + day[metric])
  }
  return lastMonths(today, count).map(m => ({ key: m.key, label: m.label, days: m.days, value: Math.round(((totals.get(m.key) ?? 0) / m.days) * 10) / 10 }))
}

// How many of the given times (ISO timestamps, a club post's `at`) fall in each month.
export function monthlyCount(times: string[], today: string, count = 12): MonthBar[] {
  const counts = new Map<string, number>()
  for (const t of times) {
    const key = t.slice(0, 7)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return lastMonths(today, count).map(m => ({ key: m.key, label: m.label, days: m.days, value: counts.get(m.key) ?? 0 }))
}

export interface DayPoint { date: string; value: number }

// The last `count` days, oldest first, ending today: one number a day.
export function lastDays(activity: Record<string, ActivityDay>, today: string, metric: DayMetric, count = 30): DayPoint[] {
  const end = parse(today)
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(end - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10)
    return { date, value: activity[date]?.[metric] ?? 0 }
  })
}

// The days that reached the goal (a goal of 0 is no goal).
export const goalMet = (value: number, goal: number): boolean => goal > 0 && value >= goal
