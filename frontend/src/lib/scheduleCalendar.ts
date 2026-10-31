// The Schedule console's activity grid: a square for every day of the last 52 weeks, a week to a column, the week starting on Monday or Sunday (a
// setting). Months are rectangles over the columns of the weeks that begin in them. Before the grid, one bar per month (the average a day) for the
// months that have been folded into monthly totals. Days are YYYY-MM-DD, local days as the backend records them.

import { DAY_MS, isoDay } from './activityCalendar'
import { FACETS, FACET_LABEL, dayValue, unitOf, type DayTotals, type Facet, type MonthTotals } from './facets'

export type WeekStart = 'monday' | 'sunday'
export type ShadeRule = 'goal' | 'busiest'
export const GRID_WEEKS = 52
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const rowLetters = (start: WeekStart): string[] => (start === 'monday' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'])
const parse = (date: string): number => Date.parse(`${date}T00:00:00Z`)
// How many days the week containing `t` began before it.
const sinceWeekStart = (t: number, start: WeekStart): number => (start === 'monday' ? (new Date(t).getUTCDay() + 6) % 7 : new Date(t).getUTCDay())

export interface FacetCell {
  date: string
  level: -1 | 0 | 1 | 2 | 3 | 4 // -1 = a day not here yet
  today: boolean
  met: boolean // a daily goal of a selected facet was reached that day
  facet: Facet | null // the selected facet with the most activity that day (its colour shades the cell)
  title: string
}
export interface MonthRect { key: string; name: string; col: number; span: number }
export interface MonthBar {
  key: string
  name: string
  title: string
  // The share of the tallest bar, 0 to 1, and each selected facet's part of it (parts add up to 1).
  height: number
  segments: Array<{ facet: Facet; part: number; perDay: number }>
}
// The years over the monthly bars: one rectangle for each run of bars of a year, over its columns (col is 1-based).
export interface YearRect { year: string; col: number; span: number }
export function barYears(bars: Array<{ key: string }>): YearRect[] {
  const out: YearRect[] = []
  bars.forEach((b, i) => {
    const year = b.key.slice(0, 4)
    const last = out[out.length - 1]
    if (last && last.year === year) last.span += 1
    else out.push({ year, col: i + 1, span: 1 })
  })
  return out
}

// The portrait grid: a row for each week, the newest first (the cells come oldest first, seven to a week).
export function weekRows<T>(cells: T[]): T[][] {
  const weeks: T[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks.reverse()
}
// A rectangle over weeks col..col+span-1 (1-based, oldest first), as the rows it covers in the portrait grid (1-based, the newest week first).
export const portraitRows = (col: number, span: number, weeks: number): { row: number; span: number } => ({ row: weeks - (col + span - 1) + 1, span })

export interface FacetGrid {
  cells: FacetCell[]
  months: MonthRect[]
  bars: MonthBar[]
  weeks: number
  total: Record<Facet, number>
  activeDays: number
}

export interface GridOptions {
  daily: Record<string, DayTotals>
  monthly: Record<string, MonthTotals>
  today: string
  facets: Facet[]
  rule: ShadeRule
  dailyGoals: Partial<Record<Facet, number>>
  weekStart: WeekStart
}

const levelByGoal = (value: number, goal: number): 0 | 1 | 2 | 3 | 4 => {
  if (value <= 0) return 0
  const r = value / goal
  return r < 0.25 ? 1 : r < 0.5 ? 2 : r < 1 ? 3 : 4
}
const levelByBusiest = (value: number, max: number): 0 | 1 | 2 | 3 | 4 => {
  if (value <= 0) return 0
  const s = max > 0 ? value / max : 0
  return s <= 0.25 ? 1 : s <= 0.5 ? 2 : s <= 0.75 ? 3 : 4
}

export function buildFacetGrid(o: GridOptions): FacetGrid {
  const end = parse(o.today)
  const start = end - sinceWeekStart(end, o.weekStart) * DAY_MS - (GRID_WEEKS - 1) * 7 * DAY_MS
  const facets = o.facets.length ? o.facets : FACETS
  const dates = Array.from({ length: GRID_WEEKS * 7 }, (_, i) => isoDay(start + i * DAY_MS))
  const busiest: Partial<Record<Facet, number>> = {}
  for (const f of facets) busiest[f] = Math.max(0, ...dates.map(d => (parse(d) > end ? 0 : dayValue(o.daily[d], f))))

  const total = { outline: 0, plot: 0, draft: 0, revision: 0, project: 0 } as Record<Facet, number>
  let activeDays = 0
  const cells: FacetCell[] = dates.map((date, i) => {
    const t = start + i * DAY_MS
    const d = new Date(t)
    const label = `${DOW3[d.getUTCDay()]}, ${MON3[d.getUTCMonth()]} ${d.getUTCDate()}`
    if (t > end) return { date, level: -1, today: false, met: false, facet: null, title: '' }
    let level: 0 | 1 | 2 | 3 | 4 = 0
    let met = false
    let lead: Facet | null = null // the facet with the highest level, the larger share of its measure when levels tie (the first of them when those tie too)
    let leadShare = -1
    const parts: string[] = []
    for (const f of facets) {
      const v = dayValue(o.daily[date], f)
      total[f] += v
      const goal = o.dailyGoals[f]
      if (goal && goal > 0 && v >= goal) met = true
      const l = o.rule === 'goal' && goal && goal > 0 ? levelByGoal(v, goal) : levelByBusiest(v, busiest[f] ?? 0)
      const share = goal && goal > 0 && o.rule === 'goal' ? v / goal : (busiest[f] ?? 0) > 0 ? v / (busiest[f] ?? 1) : 0
      if (l > 0 && (l > level || (l === level && share > leadShare))) { lead = f; leadShare = share }
      if (l > level) level = l
      if (v > 0) parts.push(`${FACET_LABEL[f]} ${v.toLocaleString('en-US')} ${unitOf(f, v)}`)
    }
    if (level > 0) activeDays += 1
    return { date, level, today: date === o.today, met, facet: level > 0 ? lead : null, title: parts.length ? `${label} · ${parts.join(' · ')}${met ? ' · goal met' : ''}` : `No activity on ${label}` }
  })

  // Month rectangles over the weeks that begin in the month.
  const months: MonthRect[] = []
  for (let w = 0; w < GRID_WEEKS; w += 1) {
    const d = new Date(start + w * 7 * DAY_MS)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const last = months[months.length - 1]
    if (last && last.key === key) last.span += 1
    else months.push({ key, name: MONTH_NAMES[d.getUTCMonth()], col: w + 1, span: 1 })
  }

  return { cells, months, bars: monthBars(o.monthly, months[0]?.key ?? '', facets), weeks: GRID_WEEKS, total, activeDays }
}

const daysIn = (key: string): number => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate()

// One bar per folded month before `before` (a YYYY-MM): the average a day of each selected facet, each scaled by its own busiest month so that
// words and nodes can share a bar; the bar's height is the share of the busiest month's.
export function monthBars(monthly: Record<string, MonthTotals>, before: string, facets: Facet[]): MonthBar[] {
  const keys = Object.keys(monthly).filter(k => k < before).sort()
  const perDay = (key: string, f: Facet): number => dayValue(monthly[key], f) / daysIn(key)
  const peak = Object.fromEntries(facets.map(f => [f, Math.max(0, ...keys.map(k => perDay(k, f)))])) as Record<Facet, number>
  const raw = keys.map(key => {
    const parts = facets.map(f => ({ facet: f, perDay: perDay(key, f), norm: peak[f] > 0 ? perDay(key, f) / peak[f] : 0 }))
    return { key, parts, sum: parts.reduce((a, p) => a + p.norm, 0) }
  })
  const tallest = Math.max(0, ...raw.map(r => r.sum))
  return raw.map(({ key, parts, sum }) => ({
    key,
    name: `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
    title: `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}${parts.filter(p => p.perDay > 0).map(p => ` · ${FACET_LABEL[p.facet]} ${(Math.round(p.perDay * 10) / 10).toLocaleString('en-US')} ${unitOf(p.facet, p.perDay)} a day`).join('')}`,
    height: tallest > 0 ? sum / tallest : 0,
    segments: parts.filter(p => p.norm > 0).map(p => ({ facet: p.facet, part: sum > 0 ? p.norm / sum : 0, perDay: p.perDay })),
  }))
}
