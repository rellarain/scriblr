import type { Projection, Verdict, WordsCheck } from '../../../../lib/planProjection'

// What the projection says of a milestone, a phase or a row: the work left (its time), the weeks of the scheduled week it needs, the day it ends on and how that is
// against the plan. A glyph says ahead (up), on track (a dot) or behind (down), as the goals do, so the colour is not all there is to it.

const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const GLYPH: Record<Verdict, string> = { ahead: '▲', track: '●', behind: '▼' }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
// Work time in hours (never in days: a day of the schedule is not a day of 24 hours).
export const workText = (minutes: number): string => {
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const rest = m % 60
  return h === 0 ? `${rest} min` : rest === 0 ? `${h} h` : h >= 10 ? `${h} h` : `${h} h ${rest} min`
}
const weeksText = (w: number): string => `${w < 10 ? (Math.round(w * 10) / 10).toString() : Math.round(w)} wk`

export function verdictText(p: Projection): string | null {
  if (!p.verdict || p.diffDays === null) return null
  return p.verdict === 'track' ? 'On track' : `${p.verdict === 'ahead' ? 'Ahead' : 'Behind'} ${Math.abs(p.diffDays)}d`
}

// The short line: "12 h · 3 wk · ends Nov 28 · ▼ Behind 5d"; "no shifts scheduled" when there is no time to do the work in.
export function projectionShort(p: Projection): string | null {
  if (p.minutes <= 0) return null
  const parts = [workText(p.minutes)]
  if (p.noShifts) return `${parts[0]} · no shifts scheduled`
  if (p.weeks !== null) parts.push(weeksText(p.weeks))
  if (p.finish) parts.push(`ends ${dayLabel(p.finish)}`)
  else parts.push('no time scheduled for it')
  const v = verdictText(p)
  if (v && p.verdict) parts.push(`${GLYPH[p.verdict]} ${v}`)
  return parts.join(' · ')
}

// The whole of it, for the tooltip and for a screen reader.
export function projectionLong(p: Projection): string | null {
  if (p.minutes <= 0) return null
  const lines = [`${workText(p.minutes)} of work left`]
  if (p.noShifts) return `${lines[0]}, and no shifts are scheduled.`
  if (p.weeks !== null) lines.push(`${weeksText(p.weeks)} of the time scheduled in a week`)
  if (p.days !== null && p.shifts !== null) lines.push(`${plural(p.days, 'working day')} and ${plural(p.shifts, 'shift')} of the schedule`)
  lines.push(p.finish ? `it ends on ${dayLabel(p.finish)}` : 'there is no time scheduled to do it in')
  if (p.planned && p.finish && p.diffDays !== null) lines.push(p.diffDays === 0 ? `the plan says ${dayLabel(p.planned)}` : `${plural(Math.abs(p.diffDays), 'day')} ${p.diffDays < 0 ? 'before' : 'after'} the plan's ${dayLabel(p.planned)}`)
  return `${lines.join('; ')}.`
}

export function ProjectionChip({ p, className = '' }: { p: Projection | undefined; className?: string }) {
  const short = p ? projectionShort(p) : null
  if (!p || !short) return null
  return <span className={`wrSchedTag wrProj${p.verdict ? ` wrProj--${p.verdict}` : ''}${className ? ` ${className}` : ''}`} title={projectionLong(p) ?? undefined} aria-label={projectionLong(p) ?? undefined}>{short}</span>
}

// The words left in a drafting phase against the recent words a day: a second line beside the time.
export function wordsText(w: WordsCheck): string {
  const left = `${w.left.toLocaleString('en-US')} words left of ${w.total.toLocaleString('en-US')}`
  if (w.left === 0) return `${left}: the goal is reached.`
  if (w.pace <= 0) return `${left}; no words written lately to project from.`
  return `${left}; at ${Math.round(w.pace).toLocaleString('en-US')} a day${w.finishes ? `, about ${dayLabel(w.finishes)}` : ''}.`
}
