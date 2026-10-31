// The review card: a week or a month of activity against the one before it, facet by facet.

import { FACETS, dayValue, type DayTotals, type Facet } from './facets'
import { addDays, weekOf } from './projection'

export type ReviewPeriod = 'week' | 'month'
export interface ReviewRow { facet: Facet; now: number; before: number; activeDays: number }
export interface Review { from: string; to: string; rows: ReviewRow[]; activeDays: number }

export function periodRange(period: ReviewPeriod, today: string): { from: string; to: string; prevFrom: string; prevTo: string } {
  if (period === 'week') {
    const from = weekOf(today)
    return { from, to: addDays(from, 6), prevFrom: addDays(from, -7), prevTo: addDays(from, -1) }
  }
  const from = `${today.slice(0, 8)}01`
  const prevTo = addDays(from, -1)
  return { from, to: today, prevFrom: `${prevTo.slice(0, 8)}01`, prevTo }
}

const sum = (daily: Record<string, DayTotals>, facet: Facet, from: string, to: string): { total: number; days: number } => {
  let total = 0
  let days = 0
  for (let d = from; d <= to; d = addDays(d, 1)) { const v = dayValue(daily[d], facet); total += v; if (v > 0) days += 1 }
  return { total, days }
}

export function review(daily: Record<string, DayTotals>, today: string, period: ReviewPeriod): Review {
  const r = periodRange(period, today)
  const rows = FACETS.map(facet => ({ facet, now: sum(daily, facet, r.from, r.to).total, before: sum(daily, facet, r.prevFrom, r.prevTo).total, activeDays: sum(daily, facet, r.from, r.to).days }))
  let activeDays = 0
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) if (FACETS.some(f => dayValue(daily[d], f) > 0)) activeDays += 1
  return { from: r.from, to: r.to, rows, activeDays }
}
