import type { ActivityDay } from '../../../api/reader'
import { buildCalendar, streakUntil, type ActivityGrid } from '../../../lib/activityCalendar'

// The Reader's activity calendar: the shared calendar (lib/activityCalendar.ts) over the pages, minutes or sessions read each day.

export type { ActivityCell, ActivityGrid } from '../../../lib/activityCalendar'
export type ActivityMetric = 'pages' | 'minutes' | 'sessions'

export function buildActivityGrid(activity: Record<string, ActivityDay>, today: string, metric: ActivityMetric = 'pages'): ActivityGrid {
  const values: Record<string, number> = {}
  for (const [date, day] of Object.entries(activity)) values[date] = day[metric]
  return buildCalendar(values, today, metric, 'No reading')
}

// The run of days up to today with reading (the streak that is still going; today not read yet does not break it).
export function currentStreak(activity: Record<string, ActivityDay>, today: string): number {
  return streakUntil(date => {
    const day = activity[date]
    return Boolean(day) && day.pages + day.minutes > 0
  }, today)
}
