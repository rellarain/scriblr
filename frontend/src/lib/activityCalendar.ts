// The Reader's activity calendar (pages read): a square for every day of the last 53 weeks, a week to a column, starting on Monday or Sunday (a
// setting), with each month a rectangle over the weeks that begin in it. (The Writer's own grid is lib/scheduleCalendar.ts.) Days are YYYY-MM-DD.

export interface ActivityCell {
  date: string
  // 0 = nothing that day; 1 to 4 by the day's share of the busiest day; -1 = a day not here yet (the last column).
  level: -1 | 0 | 1 | 2 | 3 | 4
  value: number
  today: boolean
  title: string
}

export interface ActivityGrid {
  cells: ActivityCell[]
  // Each month by its whole name, over the columns of the weeks that begin in it.
  months: Array<{ label: string; col: number; span: number }>
  total: number
  activeDays: number
  weeks: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export type WeekStart = 'monday' | 'sunday'
export const DAY_MS = 86_400_000
export const CALENDAR_WEEKS = 53

export const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

// `unit` is what a day's value counts ("pages", "words"); `idle` says a quiet day ("No reading").
export function buildCalendar(values: Record<string, number>, today: string, unit: string, idle: string, weekStart: WeekStart = 'sunday'): ActivityGrid {
  const end = Date.parse(`${today}T00:00:00Z`)
  const since = weekStart === 'monday' ? (new Date(end).getUTCDay() + 6) % 7 : new Date(end).getUTCDay()
  const endOfWeekStart = end - since * DAY_MS // the week that holds today is the last column
  const start = endOfWeekStart - (CALENDAR_WEEKS - 1) * 7 * DAY_MS
  const inRange = new Map<string, number>()
  let max = 0
  for (const [date, value] of Object.entries(values)) {
    const t = Date.parse(`${date}T00:00:00Z`)
    if (t < start || t > end) continue
    inRange.set(date, value)
    max = Math.max(max, value)
  }
  const cells: ActivityCell[] = []
  const months: Array<{ label: string; col: number; span: number }> = []
  let total = 0
  let activeDays = 0
  for (let i = 0; i < CALENDAR_WEEKS * 7; i += 1) {
    const t = start + i * DAY_MS
    const date = isoDay(t)
    const d = new Date(t)
    if (i % 7 === 0) {
      const label = MONTH_NAMES[d.getUTCMonth()]
      const last = months[months.length - 1]
      if (last && last.label === label && last.col + last.span === i / 7 + 1) last.span += 1
      else months.push({ label, col: i / 7 + 1, span: 1 })
    }
    const label = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
    if (t > end) {
      cells.push({ date, level: -1, value: 0, today: false, title: '' })
      continue
    }
    const value = inRange.get(date) ?? 0
    total += value
    if (value > 0) activeDays += 1
    const share = max > 0 ? value / max : 0
    const level = value <= 0 ? 0 : share <= 0.25 ? 1 : share <= 0.5 ? 2 : share <= 0.75 ? 3 : 4
    cells.push({ date, level, value, today: date === today, title: value > 0 ? `${value.toLocaleString('en-US')} ${unit} on ${label}` : `${idle} on ${label}` })
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
