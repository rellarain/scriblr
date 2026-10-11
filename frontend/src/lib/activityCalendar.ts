// The activity calendar, shared by the Reader (pages read) and the Writer (words written): a square for every day of the last 53 weeks, a week to a
// column, Sunday first, as on GitHub. Days are UTC dates (YYYY-MM-DD), as the backend records them.

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
export const DAY_MS = 86_400_000
export const CALENDAR_WEEKS = 53

export const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

// `unit` is what a day's value counts ("pages", "words"); `idle` says a quiet day ("No reading").
export function buildCalendar(values: Record<string, number>, today: string, unit: string, idle: string): ActivityGrid {
  const end = Date.parse(`${today}T00:00:00Z`)
  const endSunday = end - new Date(end).getUTCDay() * DAY_MS // the week that holds today is the last column
  const start = endSunday - (CALENDAR_WEEKS - 1) * 7 * DAY_MS
  const inRange = new Map<string, number>()
  let max = 0
  for (const [date, value] of Object.entries(values)) {
    const t = Date.parse(`${date}T00:00:00Z`)
    if (t < start || t > end) continue
    inRange.set(date, value)
    max = Math.max(max, value)
  }
  const cells: ActivityCell[] = []
  const months: Array<{ label: string; col: number }> = []
  let lastMonth = -1
  let total = 0
  let activeDays = 0
  for (let i = 0; i < CALENDAR_WEEKS * 7; i += 1) {
    const t = start + i * DAY_MS
    const date = isoDay(t)
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
    const value = inRange.get(date) ?? 0
    total += value
    if (value > 0) activeDays += 1
    const share = max > 0 ? value / max : 0
    const level = value <= 0 ? 0 : share <= 0.25 ? 1 : share <= 0.5 ? 2 : share <= 0.75 ? 3 : 4
    cells.push({ date, level, value, title: value > 0 ? `${value.toLocaleString('en-US')} ${unit} on ${label}` : `${idle} on ${label}` })
  }
  return { cells, months, total, activeDays, weeks: CALENDAR_WEEKS }
}

// The run of days up to today with activity (the streak still going: a quiet today does not break it).
export function streakUntil(active: (date: string) => boolean, today: string): number {
  let streak = 0
  for (let t = Date.parse(`${today}T00:00:00Z`); ; t -= DAY_MS) {
    if (!active(isoDay(t))) {
      if (streak === 0 && isoDay(t) === today) continue
      return streak
    }
    streak += 1
  }
}

// The longest run of days with activity in the last 53 weeks.
export function bestStreak(active: (date: string) => boolean, today: string): number {
  const end = Date.parse(`${today}T00:00:00Z`)
  let best = 0
  let run = 0
  for (let t = end - (CALENDAR_WEEKS * 7 - 1) * DAY_MS; t <= end; t += DAY_MS) {
    run = active(isoDay(t)) ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

// The seven days ending today, oldest first.
export function lastWeek(today: string): { date: string; letter: string }[] {
  const end = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: 7 }, (_, i) => {
    const t = end - (6 - i) * DAY_MS
    return { date: isoDay(t), letter: 'SMTWTFS'[new Date(t).getUTCDay()] }
  })
}
