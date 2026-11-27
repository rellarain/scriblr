// A book's goals and how long the rest would take (Book details, `outline/BookGoals.tsx`). A book has goals for its words and for the
// outline to fill (chapters, scenes, moments), with or without dates. The writer's usual pace comes from their own activity: the words
// and nodes of each of the last weeks, the slower and the faster of their usual weeks. From it: how long what is left would take ("About
// 6 to 8 months"), when that is ("between late May and mid-July 2027"), each part of the book one after another on a timeline, and, for a
// date, the pace it needs and whether that is within reach. Pure functions of the counts and the daily activity totals.

import { addDays, daysBetween } from './projection'
import type { DayTotals } from './facets'

export type GoalUnit = 'words' | 'chapter' | 'scene' | 'moment'
export const GOAL_UNITS: GoalUnit[] = ['words', 'chapter', 'scene', 'moment']
// How many weeks of activity the pace is read from.
export const PACE_WEEKS = 8
// The timeline never runs further than this many years from today.
const MAX_YEARS = 5

const NAMES: Record<GoalUnit, [string, string]> = { words: ['word', 'words'], chapter: ['chapter', 'chapters'], scene: ['scene', 'scenes'], moment: ['moment', 'moments'] }
export const unitName = (unit: GoalUnit, n: number) => NAMES[unit][n === 1 ? 0 : 1]
const num = (n: number) => Math.round(n).toLocaleString('en-US')

// How much of a unit a day saw: net words drafted, or nodes of the kind made.
export function dayAmount(day: DayTotals | undefined, unit: GoalUnit): number {
  if (!day) return 0
  return unit === 'words' ? day.draft : day.kinds?.[unit] ?? 0
}

// The last weeks, each seven days (the one ending today first): how much of a unit each saw, never below nothing.
export function weeklyTotals(daily: Record<string, DayTotals>, unit: GoalUnit, today: string, weeks = PACE_WEEKS): number[] {
  const out: number[] = []
  for (let w = 0; w < weeks; w += 1) {
    let sum = 0
    for (let d = 0; d < 7; d += 1) sum += dayAmount(daily[addDays(today, -(w * 7 + d))], unit)
    out.push(Math.max(0, sum))
  }
  return out
}

export interface Pace { slower: number; faster: number } // a week

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

// The writer's usual pace: the slower and the faster of their usual weeks (the lower and upper quartiles). None with fewer than two weeks
// that saw any. A writer who skips more weeks than they work has their average week as the slower pace, so it is never nothing.
export function usualPace(weekly: number[]): Pace | null {
  if (weekly.filter(n => n > 0).length < 2) return null
  const sorted = [...weekly].sort((a, b) => a - b)
  const mean = weekly.reduce((s, n) => s + n, 0) / weekly.length
  const upper = quantile(sorted, 0.75)
  const faster = upper > 0 ? upper : mean
  const lower = quantile(sorted, 0.25)
  const slower = lower > 0 ? lower : Math.min(mean, faster)
  return { slower, faster: Math.max(faster, slower) }
}

// When an amount would be done at a pace, from a day: at the faster pace (early) and at the slower (late).
export interface Span { weeksMin: number; weeksMax: number; early: string; late: string }
export function spanFor(left: number, pace: Pace, from: string): Span {
  const weeksMin = left / pace.faster
  const weeksMax = left / pace.slower
  return { weeksMin, weeksMax, early: addDays(from, Math.ceil(weeksMin * 7)), late: addDays(from, Math.ceil(weeksMax * 7)) }
}

// "About 3 weeks", "About 6 to 8 months", "About 2 to 3 years".
export function durationPhrase(weeksMin: number, weeksMax: number): string {
  const range = (a: number, b: number, one: string, many: string) => {
    const lo = Math.max(1, Math.round(a))
    const hi = Math.max(lo, Math.round(b))
    return lo === hi ? `About ${lo === 1 ? `a ${one}` : `${lo} ${many}`}` : `About ${lo} to ${hi} ${many}`
  }
  if (weeksMax < 9) return range(weeksMin, weeksMax, 'week', 'weeks')
  const months = (w: number) => w / (52 / 12)
  if (months(weeksMax) < 24) return range(months(weeksMin), months(weeksMax), 'month', 'months')
  return range(weeksMin / 52, weeksMax / 52, 'year', 'years')
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthOf = (day: string) => Number(day.slice(5, 7)) - 1
const yearOf = (day: string) => day.slice(0, 4)

// "early June", "mid-July", "late May" ("late Feb" short).
export function partOfMonth(day: string, short = false): string {
  const d = Number(day.slice(8, 10))
  const name = short ? MONTHS[monthOf(day)].slice(0, 3) : MONTHS[monthOf(day)]
  return d <= 10 ? `early ${name}` : d <= 20 ? `mid-${name}` : `late ${name}`
}

// "between late May and mid-July 2027", "between late December 2026 and mid-February 2027", "around mid-July 2027".
export function rangePhrase(early: string, late: string): string {
  const a = partOfMonth(early)
  const b = partOfMonth(late)
  if (a === b && yearOf(early) === yearOf(late)) return `around ${b} ${yearOf(late)}`
  return yearOf(early) === yearOf(late) ? `between ${a} and ${b} ${yearOf(late)}` : `between ${a} ${yearOf(early)} and ${b} ${yearOf(late)}`
}

// "late Feb to mid-Mar" (no year), "mid-Mar".
export function shortRange(early: string, late: string): string {
  const a = partOfMonth(early, true)
  const b = partOfMonth(late, true)
  return a === b ? b : `${a} to ${b}`
}

// A pace said in words: "1,450 to 1,900 words", "about 2 chapters", "0.5 to 1.5 chapters".
export function paceAmount(pace: Pace, unit: GoalUnit): string {
  const round = (n: number) => {
    if (unit === 'words') return num(n >= 1000 ? Math.round(n / 50) * 50 : Math.round(n / 10) * 10)
    return n < 10 ? String(Math.round(n * 2) / 2) : num(n)
  }
  const lo = round(pace.slower)
  const hi = round(pace.faster)
  return lo === hi ? `about ${hi} ${unitName(unit, Number(hi.replace(/,/g, '')))}` : `${lo} to ${hi} ${NAMES[unit][1]}`
}

export type BookTargets = Record<GoalUnit, number | null>
export type BookCounts = Record<GoalUnit, number>

export interface GoalLine { unit: GoalUnit; done: number; target: number; left: number; pace: Pace | null; span: Span | null }
export interface BookEstimate {
  lines: GoalLine[] // the goals set, in the order of GOAL_UNITS
  met: boolean // every goal set is reached
  // When the book would be done (every goal reached), at the faster and the slower pace; none when a goal left has no pace yet.
  span: Span | null
  noPace: GoalUnit[] // the goals left that have no pace yet
}

export function bookEstimate(targets: BookTargets, counts: BookCounts, daily: Record<string, DayTotals>, today: string): BookEstimate {
  const lines: GoalLine[] = GOAL_UNITS.filter(u => (targets[u] ?? 0) > 0).map(unit => {
    const target = targets[unit] as number
    const done = counts[unit]
    const left = Math.max(0, target - done)
    const pace = usualPace(weeklyTotals(daily, unit, today))
    return { unit, done, target, left, pace, span: left > 0 && pace ? spanFor(left, pace, today) : null }
  })
  const open = lines.filter(l => l.left > 0)
  const noPace = open.filter(l => !l.pace).map(l => l.unit)
  const spans = open.map(l => l.span).filter((s): s is Span => s !== null)
  const span = open.length > 0 && noPace.length === 0
    ? spans.reduce((a, b) => ({
        weeksMin: Math.max(a.weeksMin, b.weeksMin), weeksMax: Math.max(a.weeksMax, b.weeksMax),
        early: a.early > b.early ? a.early : b.early, late: a.late > b.late ? a.late : b.late,
      }))
    : null
  return { lines, met: lines.length > 0 && open.length === 0, span, noPace }
}

// The goals' paces in one line: "1,450 to 1,900 words and about 2 chapters a week".
export function paceLine(lines: GoalLine[]): string | null {
  const parts = lines.filter(l => l.pace).map(l => paceAmount(l.pace as Pace, l.unit))
  if (parts.length === 0) return null
  return `${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`} a week`
}

// The unit the parts and the dates are planned in: words when there is a word goal, else the first outline goal set.
export function primaryUnit(targets: BookTargets): GoalUnit | null {
  return GOAL_UNITS.find(u => (targets[u] ?? 0) > 0) ?? null
}

// ---- the parts of the book, one after another ----

export interface BookPart { id: string; label: string; done: number; chapters: number; due: string | null }
export interface PartTarget { id: string; label: string; target: number; done: number; due: string | null }

// Each part's share of a goal: its share of the book's chapters (none when the book has no chapters).
export function shareGoal(parts: BookPart[], goal: number): PartTarget[] {
  const chapters = parts.reduce((s, p) => s + p.chapters, 0)
  if (chapters === 0) return []
  return parts.map(p => ({ id: p.id, label: p.label, target: Math.round((goal * p.chapters) / chapters), done: p.done, due: p.due }))
}

export type PartStatus = 'done' | 'reach' | 'above' | 'past'
export interface PartPlan {
  id: string
  label: string
  target: number
  done: number
  left: number
  // When it would start and end at the writer's pace, after the parts before it (none for a part with nothing left, or without a pace).
  start: string | null
  early: string | null
  late: string | null
  due: string | null
  // With a date: the pace it needs a week, from the later of today and the date of the part before it (`after`, that part's label).
  needs: number | null
  after: string | null
  status: PartStatus | null
}

export function planParts(parts: PartTarget[], pace: Pace | null, today: string): PartPlan[] {
  let cum = 0
  let prevEarly = today
  let prevDue: { day: string; label: string } | null = null
  return parts.map(p => {
    const left = Math.max(0, p.target - p.done)
    cum += left
    let start: string | null = null
    let early: string | null = null
    let late: string | null = null
    if (left > 0 && pace) {
      const span = spanFor(cum, pace, today)
      start = prevEarly
      early = span.early
      late = span.late
      prevEarly = span.early
    }
    let needs: number | null = null
    let after: string | null = null
    let status: PartStatus | null = null
    if (p.due) {
      const from = prevDue && prevDue.day > today ? prevDue.day : today
      after = prevDue && prevDue.day > today ? prevDue.label : null
      needs = left / (Math.max(1, daysBetween(from, p.due)) / 7)
      status = left === 0 ? 'done' : p.due < today ? 'past' : pace ? (needs <= pace.faster ? 'reach' : 'above') : null
      prevDue = { day: p.due, label: p.label }
    } else if (left === 0) {
      status = 'done'
    }
    return { id: p.id, label: p.label, target: p.target, done: p.done, left, start, early, late, due: p.due, needs, after, status }
  })
}

// ---- the timeline ----

export interface Axis { start: string; end: string; months: Array<{ key: string; label: string; year: string | null; at: number }> }
const monthStart = (day: string) => `${day.slice(0, 7)}-01`
const nextMonth = (first: string) => {
  const y = Number(first.slice(0, 4))
  const m = Number(first.slice(5, 7))
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

// From the start of this month to the end of the month of the last day given (at least two months; at most MAX_YEARS years), with a label
// for each month ("Nov", with its year under the first and under each January), or for every second, third... month when there are more
// than twelve.
export function timelineAxis(today: string, days: Array<string | null>): Axis {
  const start = monthStart(today)
  const cap = addDays(today, MAX_YEARS * 365)
  const last = days.filter((d): d is string => !!d).reduce((a, b) => (b > a ? b : a), addDays(today, 31))
  const end = addDays(nextMonth(monthStart(last > cap ? cap : last)), -1)
  const firsts: string[] = []
  for (let m = start; m <= end; m = nextMonth(m)) firsts.push(m)
  const every = Math.ceil(firsts.length / 12)
  const total = daysBetween(start, end) + 1
  const months = firsts
    .map((first, i) => ({ first, i }))
    .filter(({ i }) => i % every === 0)
    .map(({ first, i }) => ({
      key: first,
      label: MONTHS[monthOf(first)].slice(0, 3),
      year: i === 0 || monthOf(first) === 0 ? yearOf(first) : null,
      at: (daysBetween(start, first) / total) * 100,
    }))
  return { start, end, months }
}

// Where a day sits on the axis, as a percentage of its width (held inside it).
export function axisAt(axis: Axis, day: string): number {
  const total = daysBetween(axis.start, axis.end) + 1
  return Math.min(100, Math.max(0, (daysBetween(axis.start, day) / total) * 100))
}

// The amount a part needs a week, said: "needs 1,575 words a week".
export function needsPhrase(needs: number, unit: GoalUnit): string {
  const n = unit === 'words' ? Math.ceil(needs / 5) * 5 : Math.ceil(needs * 2) / 2
  return `needs ${n.toLocaleString('en-US')} ${unitName(unit, n)} a week`
}
