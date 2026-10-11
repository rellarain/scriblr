import type { ActivityDay } from '../../../api/reader'

// The activity calendar: a square for every day of the last 53 weeks, a week to a column, Sunday first, as on GitHub.

export type ActivityMetric = 'pages' | 'minutes' | 'sessions'

export interface ActivityCell {
  date: string
  // 0 = nothing that day; 1 to 4 by the day's share of the busiest day; -1 = a day not here yet (the last column).
  level: -1 | 0 | 1 | 2 | 3 | 4
  value: number
  title: string
}

export interface ActivityGrid {
  cells: ActivityCell[]
  months: Array<{ label: string; col: number }>
  total: number
  activeDays: number
  weeks: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000
const WEEKS = 53

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function buildActivityGrid(activity: Record<string, ActivityDay>, today: string, metric: ActivityMetric = 'pages'): ActivityGrid {
  const end = Date.parse(`${today}T00:00:00Z`)
  const endSunday = end - new Date(end).getUTCDay() * DAY_MS // the week that holds today is the last column
  const start = endSunday - (WEEKS - 1) * 7 * DAY_MS
  const values = new Map<string, number>()
  let max = 0
  for (const [date, day] of Object.entries(activity)) {
    const t = Date.parse(`${date}T00:00:00Z`)
    if (t < start || t > end) continue
    values.set(date, day[metric])
    max = Math.max(max, day[metric])
  }
  const cells: ActivityCell[] = []
  const months: Array<{ label: string; col: number }> = []
  let lastMonth = -1
  let total = 0
  let activeDays = 0
  for (let i = 0; i < WEEKS * 7; i += 1) {
    const t = start + i * DAY_MS
    const date = iso(t)
    const d = new Date(t)
    if (i % 7 === 0) {
      const month = d.getUTCMonth()
      if (month !== lastMonth && (d.getUTCDate() <= 7 || i === 0)) {
        months.push({ label: MONTHS[month], col: i / 7 + 1 })
        lastMonth = month
      }
    }
    const label = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
    if (t > end) {
      cells.push({ date, level: -1, value: 0, title: '' })
      continue
    }
    const value = values.get(date) ?? 0
    total += value
    if (value > 0) activeDays += 1
    const share = max > 0 ? value / max : 0
    const level = value <= 0 ? 0 : share <= 0.25 ? 1 : share <= 0.5 ? 2 : share <= 0.75 ? 3 : 4
    cells.push({ date, level, value, title: value > 0 ? `${value} ${metric} on ${label}` : `No reading on ${label}` })
  }
  return { cells, months, total, activeDays, weeks: WEEKS }
}

// The run of days up to today with reading (the streak that is still going; today not read yet does not break it).
export function currentStreak(activity: Record<string, ActivityDay>, today: string): number {
  let streak = 0
  for (let t = Date.parse(`${today}T00:00:00Z`); ; t -= DAY_MS) {
    const day = activity[iso(t)]
    if (!day || day.pages + day.minutes <= 0) {
      if (streak === 0 && iso(t) === today) continue
      return streak
    }
    streak += 1
  }
}
