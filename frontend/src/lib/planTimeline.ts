import { addDays, daysBetween } from './projection'
import type { Phase, Planner, RestRange } from './facets'

// The phase timeline's geometry: the days it spans, where a date, a phase bar, a milestone, the rest days and today fall as a share of its width, and what
// moving or resizing a bar by some days does to its dates. Pure, in whole UTC days (YYYY-MM-DD).

export interface TimelineRange { from: string; to: string; days: number }

const MIN_SPAN = 14

// The days the chart shows: from the earliest to the latest of the project's dates (its start and end, the phases' dates, the milestones'), at least two
// weeks; null when nothing has a date yet.
export function timelineRange(p: Planner): TimelineRange | null {
  const dates = [p.timelineStart, p.timelineEnd, ...p.phases.flatMap(x => [x.start, x.end]), ...p.milestones.map(m => m.date)].filter((d): d is string => !!d).sort()
  if (dates.length === 0) return null
  const from = dates[0]
  const last = dates[dates.length - 1]
  const to = daysBetween(from, last) < MIN_SPAN ? addDays(from, MIN_SPAN) : last
  return { from, to, days: daysBetween(from, to) + 1 }
}

// A day's place across the chart, 0 to 100 (the left edge of that day), and its width.
export const pct = (date: string, r: TimelineRange): number => (daysBetween(r.from, date) / r.days) * 100
export const widthPct = (days: number, r: TimelineRange): number => (days / r.days) * 100

// The bar of a phase: where it starts and how wide it is. A phase with one date is a one-day bar; with none, nothing.
export function barOf(phase: Phase, r: TimelineRange): { left: number; width: number } | null {
  const start = phase.start ?? phase.end
  const end = phase.end ?? phase.start
  if (!start || !end) return null
  return { left: pct(start, r), width: widthPct(daysBetween(start, end) + 1, r) }
}

// The rest days that fall inside the range, clipped to it.
export function restBars(rest: RestRange[], r: TimelineRange): Array<{ id: string; label: string; left: number; width: number }> {
  return rest
    .filter(x => x.end >= r.from && x.start <= r.to)
    .map(x => { const s = x.start < r.from ? r.from : x.start; const e = x.end > r.to ? r.to : x.end; return { id: x.id, label: x.label, left: pct(s, r), width: widthPct(daysBetween(s, e) + 1, r) } })
}

// Today's place, or null when it is outside the range.
export const todayPct = (today: string, r: TimelineRange): number | null => (today >= r.from && today <= r.to ? pct(today, r) + widthPct(1, r) / 2 : null)

// Whole days for a distance in pixels across a chart of the given width.
export const daysForPx = (px: number, widthPx: number, r: TimelineRange): number => (widthPx > 0 ? Math.round((px / widthPx) * r.days) : 0)

export type BarEdge = 'move' | 'start' | 'end'

// A phase moved (both its dates), or its start or end changed, by some days. A phase with one date moves that date; the start never passes the end.
export function dragPhase(phase: Phase, edge: BarEdge, delta: number): Pick<Phase, 'start' | 'end'> {
  const start = phase.start ?? phase.end
  const end = phase.end ?? phase.start
  if (!start || !end || delta === 0) return { start: phase.start, end: phase.end }
  if (edge === 'move') return { start: phase.start ? addDays(phase.start, delta) : null, end: phase.end ? addDays(phase.end, delta) : null }
  if (edge === 'start') { const next = addDays(start, delta); return { start: next > end ? end : next, end } }
  const next = addDays(end, delta)
  return { start, end: next < start ? start : next }
}
