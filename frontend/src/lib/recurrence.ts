// When shifts and routines come round: daily, weekly (on chosen weekdays, every N weeks), or after an interval of days, weeks or months, which can be a
// range (every 7-10 days: low priority and tickable inside the range, put on the schedule once it is passed). Pauses and rest days skip a day; they are
// not missed ones. Days are local YYYY-MM-DD strings; weekdays are 0 = Monday.

import { DAY_MS, isoDay } from './activityCalendar'
import type { Pause, Recurrence, RestRange, Routine, Shift } from './facets'

const parse = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const weekday = (t: number): number => (new Date(t).getUTCDay() + 6) % 7

// A date `n` units on, a month being a calendar month (clamped to the end of a shorter one).
export function addUnits(date: string, n: number, unit: 'day' | 'week' | 'month'): string {
  if (unit === 'day') return isoDay(parse(date) + n * DAY_MS)
  if (unit === 'week') return isoDay(parse(date) + n * 7 * DAY_MS)
  const d = new Date(parse(date))
  const target = d.getUTCMonth() + n
  const year = d.getUTCFullYear() + Math.floor(target / 12)
  const month = ((target % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return isoDay(Date.UTC(year, month, Math.min(d.getUTCDate(), last)))
}

const within = (day: string, a: string, b: string): boolean => day >= a && day <= b
export const isPaused = (pauses: Pause[], day: string): boolean => pauses.some(p => within(day, p.start, p.end))
export const isRest = (rest: RestRange[], day: string): boolean => rest.some(r => within(day, r.start, r.end))

// The days from `from` to `to` (inclusive) a pattern falls on. Interval patterns are not days: see routineWindow.
export function patternDays(rec: Recurrence, from: string, to: string): string[] {
  const out: string[] = []
  const anchor = parse(rec.anchor)
  for (let t = Math.max(parse(from), anchor); t <= parse(to); t += DAY_MS) {
    const day = isoDay(t)
    if (rec.until && day > rec.until) break
    const since = Math.round((t - anchor) / DAY_MS)
    if (rec.kind === 'once') {
      if (since === 0) out.push(day)
    } else if (rec.kind === 'daily') {
      if (since % rec.every === 0) out.push(day)
    } else if (rec.kind === 'weekly') {
      const weeks = Math.floor((t - (anchor - weekday(anchor) * DAY_MS)) / (7 * DAY_MS))
      const days = rec.days.length ? rec.days : [weekday(anchor)]
      if (weeks % rec.every === 0 && days.includes(weekday(t))) out.push(day)
    }
  }
  return out
}

export interface ShiftOccurrence {
  shiftId: string
  date: string
  title: string
  startSlot: number
  endSlot: number
  facet: Shift['facet']
  target: number | null
  repeats: boolean
}

// Every held occurrence of the shifts in a range: a one-off on its day, a repeating one on its pattern, less its pauses, skipped days and rest
// days, with a day's own changes applied.
export function shiftOccurrences(shifts: Shift[], rest: RestRange[], from: string, to: string): ShiftOccurrence[] {
  const out: ShiftOccurrence[] = []
  for (const s of shifts) {
    const days = s.recurrence ? patternDays(s.recurrence, from, to) : within(s.date, from, to) ? [s.date] : []
    for (const date of days) {
      if (s.skipped.includes(date) || isPaused(s.pauses, date) || isRest(rest, date)) continue
      const o = s.overrides[date]
      out.push({
        shiftId: s.id, date, title: o?.title ?? s.title, startSlot: o?.startSlot ?? s.startSlot, endSlot: o?.endSlot ?? s.endSlot,
        facet: s.facet, target: s.target, repeats: s.recurrence !== null,
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startSlot - b.startSlot)
}

export type RoutineState = 'paused' | 'resting' | 'upcoming' | 'due' | 'inRange' | 'overdue'
export interface RoutineWindow {
  state: RoutineState
  from: string // the first day it can be done
  to: string // the last day of its range (the day it is due, for a fixed interval)
  day: number // days since it was last done (or since its anchor)
}

// Where a routine stands today. A pattern routine (daily, weekly) is `due` on its days and `upcoming` otherwise; an interval routine counts
// from the last time it was done: `inRange` from `every` units on, `overdue` once past `rangeMax` (or past `every`, with no range).
export function routineWindow(r: Routine, today: string, rest: RestRange[] = []): RoutineWindow {
  const rec = r.recurrence
  const base = r.lastDone ?? rec.anchor
  const day = Math.max(0, Math.round((parse(today) - parse(base)) / DAY_MS))
  if (isPaused(r.pauses, today)) return { state: 'paused', from: base, to: base, day }
  if (rec.kind !== 'interval') {
    const due = patternDays(rec, today, today).length > 0
    if (due && isRest(rest, today)) return { state: 'resting', from: today, to: today, day }
    return { state: due ? 'due' : 'upcoming', from: today, to: today, day }
  }
  const from = addUnits(base, rec.every, rec.unit)
  const to = addUnits(base, rec.rangeMax ?? rec.every, rec.unit)
  if (today < from) return { state: 'upcoming', from, to, day }
  if (today > to) return { state: 'overdue', from, to, day }
  return { state: rec.rangeMax && rec.rangeMax > rec.every && today < to ? 'inRange' : 'due', from, to, day }
}
