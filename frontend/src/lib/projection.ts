// Goal progress and projections for the Schedule console: how far a goal is, the pace of the last 28 days, when that pace finishes it, and whether
// that is ahead of, on track for or behind its deadline. Pure functions of the activity totals; the amounts already done (`current`) come from the
// project itself (words in the drafts, nodes in the trees, flags resolved), not from the activity.

import { DAY_MS, isoDay } from './activityCalendar'
import { dayValue, type DayTotals, type Facet, type Goal, type MonthTotals } from './facets'

export const PACE_DAYS = 28
export type GoalStatus = 'ahead' | 'track' | 'behind' | 'done'
const parse = (date: string): number => Date.parse(`${date}T00:00:00Z`)
export const addDays = (date: string, n: number): string => isoDay(parse(date) + n * DAY_MS)
export const daysBetween = (from: string, to: string): number => Math.round((parse(to) - parse(from)) / DAY_MS)

// The average a day of a facet over the PACE_DAYS days up to and including today.
export function paceOf(daily: Record<string, DayTotals>, facet: Facet, today: string, days = PACE_DAYS): number {
  let sum = 0
  for (let i = 0; i < days; i += 1) sum += dayValue(daily[addDays(today, -i)], facet)
  return sum / days
}

// The Monday on or before a date (the week goals are counted over).
export function weekOf(date: string): string {
  return addDays(date, -((new Date(parse(date)).getUTCDay() + 6) % 7))
}

export interface GoalProgress {
  goal: Goal
  current: number
  pct: number | null // of the total, 0 to 100
  today: number // done today
  week: number // done since Monday
  pace: number // a day, over the last 28 days
  deadline: string | null
  daysLeft: number | null
  needed: number | null // a day, to finish by the deadline
  finishes: string | null // the day this pace finishes it
  status: GoalStatus | null
}

export function goalProgress(
  goal: Goal,
  o: { current: number; daily: Record<string, DayTotals>; today: string; fallbackDeadline?: string | null },
): GoalProgress {
  const pace = paceOf(o.daily, goal.facet, o.today)
  const monday = weekOf(o.today)
  let week = 0
  for (let i = 0; i <= daysBetween(monday, o.today); i += 1) week += dayValue(o.daily[addDays(monday, i)], goal.facet)
  const total = goal.total
  const remaining = total === null ? null : Math.max(0, total - o.current)
  const deadline = goal.deadline ?? o.fallbackDeadline ?? null
  const daysLeft = deadline ? daysBetween(o.today, deadline) : null
  const needed = remaining !== null && daysLeft !== null ? (daysLeft > 0 ? remaining / daysLeft : remaining) : null
  const finishes = remaining === null ? null : remaining === 0 ? o.today : pace > 0 ? addDays(o.today, Math.ceil(remaining / pace)) : null
  let status: GoalStatus | null = null
  if (remaining === 0 && total !== null) status = 'done'
  else if (needed !== null) status = pace >= needed * 1.1 ? 'ahead' : pace >= needed * 0.9 ? 'track' : 'behind'
  return {
    goal, current: o.current, pct: total ? Math.min(100, Math.round((o.current / total) * 100)) : null,
    today: dayValue(o.daily[o.today], goal.facet), week, pace, deadline, daysLeft, needed, finishes, status,
  }
}

export interface SeriesPoint { date: string; pct: number }
export interface GoalSeries { points: SeriesPoint[]; projection: SeriesPoint[] }

const monthEnd = (key: string): string => isoDay(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0))

// The share of a total done over time: worked back from what is done now, taking off what was done after each point (a month's worth at its last
// day for the months folded into monthly totals, a point a day after that). The projection runs on at the recent pace to the total or the deadline.
export function goalSeries(
  facet: Facet,
  o: { daily: Record<string, DayTotals>; monthly: Record<string, MonthTotals>; today: string; current: number; total: number; deadline?: string | null; horizon?: number },
): GoalSeries {
  const steps: Array<{ date: string; value: number }> = [
    ...Object.entries(o.monthly).map(([key, m]) => ({ date: monthEnd(key), value: dayValue(m, facet) })),
    ...Object.entries(o.daily).map(([date, d]) => ({ date, value: dayValue(d, facet) })),
  ].filter(s => s.date <= o.today).sort((a, b) => a.date.localeCompare(b.date))
  const points: SeriesPoint[] = []
  let after = 0
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    points.unshift({ date: steps[i].date, pct: Math.max(0, Math.min(1, (o.current - after) / o.total)) })
    after += steps[i].value
  }
  const pace = paceOf(o.daily, facet, o.today)
  const projection: SeriesPoint[] = []
  if (pace > 0 && o.current < o.total) {
    const limit = addDays(o.today, o.horizon ?? 400)
    const stop = o.deadline && o.deadline > o.today ? o.deadline : limit
    projection.push({ date: o.today, pct: o.current / o.total })
    const finish = addDays(o.today, Math.ceil((o.total - o.current) / pace))
    const end = finish < stop ? finish : stop
    projection.push({ date: end, pct: Math.min(1, (o.current + pace * daysBetween(o.today, end)) / o.total) })
  }
  return { points, projection }
}
