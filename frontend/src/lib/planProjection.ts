import type { Facet, Milestone, Phase, PlanItem, Planner, Routine } from './facets'
import { milestoneWork } from './milestoneProgress'
import { phasesOnRow, rowOfPhase, type PlanRow } from './planRows'
import { milestonesOf } from './planSequence'
import { addDays, daysBetween, type GoalProgress } from './projection'
import { addUnits, isPaused, isRest, patternDays, shiftOccurrences } from './recurrence'

// When the plan would be done, from the work left and the time scheduled for it. The time of each piece of work still to do is added up (its own estimate, else the
// average of the same kind of work in the project; a routine counts each time it comes round before the milestone's date); that is set against the project's
// shifts, a week of them read from the next four weeks, to say how many weeks, working days and shifts it needs and the day that ends on. A milestone is
// worked through after the one before it, a phase after the one before it in its row (a phase that runs late pushes the next one), and a row (the project, a
// book, a chapter) is its phases. The plan itself is never changed. Pure, in whole days.

export const DEFAULT_MINUTES = 30
// A week of scheduled time is read from this many days ahead; the walk through the shifts goes as far as this many.
export const CAPACITY_DAYS = 28
export const HORIZON_DAYS = 730

export type Verdict = 'ahead' | 'track' | 'behind'
export type WorkKind = 'task' | 'process' | 'exercise' | 'routine'
export interface WorkTime { kind: WorkKind; id: string; label: string; facet: Facet | null; minutes: number }

// ---- the time of a piece of work ----

export type Averages = Record<WorkKind, number>

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)

const shiftMinutes = (planner: Planner, shiftId: string | null): number | null => {
  const s = shiftId ? planner.shifts.find(x => x.id === shiftId) : undefined
  return s ? (s.endSlot - s.startSlot) * 10 : null
}

// The average time of each kind of work in the project that has an estimate, for the work that has none (a default where none of the kind has).
export function averages(planner: Planner): Averages {
  const task = mean(planner.items.map(i => i.estimateMinutes).filter((m): m is number => !!m)) ?? DEFAULT_MINUTES
  const stepsOf = (steps: Array<{ estimateMinutes: number | null }>): number => steps.reduce((n, s) => n + (s.estimateMinutes ?? 0), 0)
  const process = mean(planner.processes.map(p => stepsOf(p.groups.flatMap(g => g.steps))).filter(m => m > 0)) ?? DEFAULT_MINUTES
  const exercise = mean(planner.exercises.map(e => e.durationMinutes)) ?? DEFAULT_MINUTES
  const routine = mean(planner.routines.map(r => shiftMinutes(planner, r.shiftId)).filter((m): m is number => !!m)) ?? DEFAULT_MINUTES
  return { task, process, exercise, routine }
}

// The days a routine comes round between two days (an interval routine counts from its last day done).
export function routineDates(r: Routine, from: string, to: string, rest: Planner['restDays']): string[] {
  if (to < from) return []
  let days: string[]
  if (r.recurrence.kind === 'interval') {
    days = []
    let d = r.lastDone ?? r.recurrence.anchor
    const step = Math.max(1, r.recurrence.every)
    for (let i = 0; i < 2000 && d <= to; i++) {
      d = addUnits(d, step, r.recurrence.unit)
      if (d >= from && d <= to) days.push(d)
    }
  } else {
    days = patternDays(r.recurrence, from, to)
  }
  return days.filter(d => !isPaused(r.pauses, d) && !isRest(rest, d))
}

const taskMinutes = (i: PlanItem, avg: Averages): number => i.estimateMinutes ?? avg.task

// What is left to do in a milestone, a piece of work at a time. A task is its estimate; a process what is left of the tasks it made (else the steps it is made of);
// an exercise its duration; a routine its time every time it comes round before the milestone ends. Work that is done is not here.
export function remainingWork(planner: Planner, milestoneId: string, today: string, avg: Averages = averages(planner)): WorkTime[] {
  const m = planner.milestones.find(x => x.id === milestoneId)
  if (!m) return []
  const phase = planner.phases.find(p => p.id === m.phaseId)
  const out: WorkTime[] = []
  for (const w of milestoneWork(planner, milestoneId)) {
    if (w.kind === 'task') {
      const i = planner.items.find(x => x.id === w.id)
      if (i && !i.doneOn) out.push({ kind: 'task', id: i.id, label: i.label, facet: i.facet, minutes: taskMinutes(i, avg) })
    } else if (w.kind === 'process') {
      const p = planner.processes.find(x => x.id === w.id)
      if (!p) continue
      const made = planner.items.filter(i => i.processId === p.id)
      const steps = p.groups.flatMap(g => g.steps)
      const minutes = made.length > 0 ? made.filter(i => !i.doneOn).reduce((n, i) => n + taskMinutes(i, avg), 0) : steps.reduce((n, s) => n + (s.estimateMinutes ?? avg.task), 0) || avg.process
      if (!(made.length > 0 && made.every(i => !!i.doneOn))) out.push({ kind: 'process', id: p.id, label: p.title, facet: p.facets[0] ?? steps.find(s => s.facet)?.facet ?? null, minutes })
    } else if (w.kind === 'exercise') {
      const e = planner.exercises.find(x => x.id === w.id)
      if (e && !w.done) out.push({ kind: 'exercise', id: e.id, label: e.title, facet: e.facets[0] ?? null, minutes: e.durationMinutes })
    } else {
      const r = planner.routines.find(x => x.id === w.id)
      if (!r) continue
      const from = phase?.start && phase.start > today ? phase.start : today
      const to = m.date ?? phase?.end ?? addDays(today, CAPACITY_DAYS)
      const times = routineDates(r, from, to < from ? from : to, planner.restDays).length
      const each = shiftMinutes(planner, r.shiftId) ?? avg.routine
      if (times > 0) out.push({ kind: 'routine', id: r.id, label: r.label, facet: r.facet, minutes: each * times })
    }
  }
  return out
}

// Work tagged with a phase that is placed in none of its milestones.
export function looseWork(planner: Planner, phaseId: string, today: string, avg: Averages = averages(planner)): WorkTime[] {
  void today
  return planner.items
    .filter(i => i.phaseId === phaseId && !i.milestoneId && !i.doneOn && !i.processId)
    .map((i): WorkTime => ({ kind: 'task', id: i.id, label: i.label, facet: i.facet, minutes: taskMinutes(i, avg) }))
}

// ---- the time scheduled ----

export interface Slot { date: string; minutes: number; facet: Facet }
export interface Capacity { slots: Slot[]; weekly: (facet: Facet | null) => number }

// The shifts held from `from` on, as slots; a week of time is the average of the next four weeks. With `nodeIds`, only the shifts aimed at those nodes, unless there
// are none in the next four weeks, when it is all of them.
export function capacityOf(planner: Planner, from: string, nodeIds: ReadonlySet<string> | null = null): Capacity {
  const to = addDays(from, HORIZON_DAYS)
  const all = shiftOccurrences(planner.shifts, planner.restDays, from, to)
  const target = (shiftId: string) => planner.shifts.find(s => s.id === shiftId)?.targetNodeId ?? null
  const near = (o: { date: string }) => o.date < addDays(from, CAPACITY_DAYS)
  const aimed = nodeIds ? all.filter(o => { const t = target(o.shiftId); return !!t && nodeIds.has(t) }) : all
  const use = nodeIds && !aimed.some(near) ? all : aimed
  const slots = use.map((o): Slot => ({ date: o.date, minutes: (o.endSlot - o.startSlot) * 10, facet: o.facet }))
  const weekly = (facet: Facet | null): number => slots.filter(s => near(s) && (facet === null || s.facet === facet)).reduce((n, s) => n + s.minutes, 0) / (CAPACITY_DAYS / 7)
  return { slots, weekly }
}

// Work through `minutes` of work in the slots from `from` on: the day the last of it is done, and the shifts and working days it took. Null for the finish when the
// shifts run out first (or there are none).
export function walk(minutes: number, slots: Slot[], from: string): { finish: string | null; shifts: number; days: number } {
  if (minutes <= 0) return { finish: null, shifts: 0, days: 0 }
  let left = minutes
  let shifts = 0
  const days = new Set<string>()
  for (const s of slots) {
    if (s.date < from || s.minutes <= 0) continue
    left -= s.minutes
    shifts += 1
    days.add(s.date)
    if (left <= 0) return { finish: s.date, shifts, days: days.size }
  }
  return { finish: null, shifts, days: days.size }
}

// ---- an estimate ----

export interface Estimate {
  minutes: number
  // Weeks of the scheduled week the work needs (the work set against the time in a week); null when there is no time scheduled for it.
  weeks: number | null
  // Working days and shifts it takes, walking through the schedule, and the day it ends on.
  days: number | null
  shifts: number | null
  finish: string | null
  noShifts: boolean
}

// Work set against the schedule: each facet's work against the shifts of that facet, all of it against all the shifts, and the latest of them is when it is done.
export function estimate(work: WorkTime[], cap: Capacity, from: string): Estimate {
  const minutes = work.reduce((n, w) => n + w.minutes, 0)
  if (minutes <= 0) return { minutes: 0, weeks: 0, days: 0, shifts: 0, finish: null, noShifts: false }
  const byFacet = new Map<Facet, number>()
  for (const w of work) if (w.facet) byFacet.set(w.facet, (byFacet.get(w.facet) ?? 0) + w.minutes)
  const buckets: Array<{ need: number; slots: Slot[]; weekly: number }> = [{ need: minutes, slots: cap.slots, weekly: cap.weekly(null) }]
  for (const [facet, need] of byFacet) buckets.push({ need, slots: cap.slots.filter(s => s.facet === facet), weekly: cap.weekly(facet) })
  let weeks: number | null = 0
  let days = 0
  let shifts = 0
  let finish: string | null = ''
  for (const b of buckets) {
    weeks = weeks === null || b.weekly <= 0 ? null : Math.max(weeks, b.need / b.weekly)
    const w = walk(b.need, b.slots, from)
    days = Math.max(days, w.days)
    shifts = Math.max(shifts, w.shifts)
    finish = finish === null || w.finish === null ? null : w.finish > finish ? w.finish : finish
  }
  return { minutes, weeks, days: finish === null ? null : days, shifts: finish === null ? null : shifts, finish, noShifts: cap.slots.length === 0 }
}

export interface Projection extends Estimate {
  // The day it starts being worked on in the projection, the day planned for it to be done, and how that compares.
  start: string
  planned: string | null
  verdict: Verdict | null
  diffDays: number | null
}

const verdictOf = (finish: string | null, planned: string | null): { verdict: Verdict | null; diffDays: number | null } => {
  if (!finish || !planned) return { verdict: null, diffDays: null }
  const diff = daysBetween(planned, finish)
  return { verdict: Math.abs(diff) <= 1 ? 'track' : diff < 0 ? 'ahead' : 'behind', diffDays: diff }
}
const project = (e: Estimate, start: string, planned: string | null): Projection => ({ ...e, start, planned, ...verdictOf(e.finish, planned) })

// ---- the roll-up ----

export interface PhaseProjection { phase: Phase; projection: Projection; milestones: Array<{ milestone: Milestone; projection: Projection }> }
export interface RowProjection { key: string; projection: Projection; phases: PhaseProjection[] }

// Parts worked through one after another (the milestones of a phase, the phases of a row) added up: the time, the weeks, working days and shifts they need
// together, and the day the last of them ends. If some part cannot be done in the scheduled time, neither can the whole.
function rollUp(parts: Estimate[], noShifts: boolean): Estimate {
  const live = parts.filter(p => p.minutes > 0)
  const stuck = live.some(p => p.finish === null)
  const sum = (f: (p: Estimate) => number | null): number | null => (live.some(p => f(p) === null) ? null : live.reduce((n, p) => n + (f(p) ?? 0), 0))
  return {
    minutes: live.reduce((n, p) => n + p.minutes, 0), noShifts,
    weeks: sum(p => p.weeks), days: stuck ? null : sum(p => p.days), shifts: stuck ? null : sum(p => p.shifts),
    finish: stuck || live.length === 0 ? null : live.map(p => p.finish as string).sort().at(-1) ?? null,
  }
}

// A row's phases worked through in their order, each after the one before it (and not before it is planned to start, nor before today), and each phase's
// milestones one after another, then the work tagged with the phase and placed in none of them. A phase that is done is left as it is.
export function projectRow(planner: Planner, key: string, today: string, cap: Capacity, avg: Averages = averages(planner)): RowProjection {
  const phases: PhaseProjection[] = []
  const live: Estimate[] = []
  let cursor = today
  let rowStart: string | null = null
  for (const phase of phasesOnRow(planner, key)) {
    if (phase.status === 'done') {
      const planned = phase.end ?? phase.start
      phases.push({ phase, projection: project({ minutes: 0, weeks: 0, days: 0, shifts: 0, finish: planned, noShifts: false }, phase.start ?? today, planned), milestones: [] })
      continue
    }
    const start = [today, phase.start ?? today, cursor].sort().at(-1) as string
    let from = start
    const sections: PhaseProjection['milestones'] = []
    for (const m of milestonesOf(planner, phase.id)) {
      const e = estimate(remainingWork(planner, m.id, today, avg), cap, from)
      sections.push({ milestone: m, projection: project(e, from, m.date) })
      if (e.finish) from = addDays(e.finish, 1)
    }
    const loose = looseWork(planner, phase.id, today, avg)
    const looseEstimate = estimate(loose, cap, from)
    const whole = rollUp([...sections.map(s => s.projection), looseEstimate], cap.slots.length === 0)
    phases.push({ phase, projection: project(whole, start, phase.end ?? null), milestones: sections })
    live.push(whole)
    rowStart ??= start
    if (whole.finish) cursor = addDays(whole.finish, 1)
  }
  const last = phasesOnRow(planner, key).at(-1)
  return { key, projection: project(rollUp(live, cap.slots.length === 0), rowStart ?? today, last?.end ?? null), phases }
}

// Every row of the plan projected: each row against the shifts aimed at its own book or chapter (a book: its chapters too), else all of the project's.
export function projectPlan(planner: Planner, rows: PlanRow[], today: string): Map<string, RowProjection> {
  const avg = averages(planner)
  const out = new Map<string, RowProjection>()
  for (const row of rows) {
    const ids = new Set<string>()
    if (row.nodeId) { ids.add(row.nodeId); for (const r of rows) if (r.parentKey === row.key && r.nodeId) ids.add(r.nodeId) }
    out.set(row.key, projectRow(planner, row.key, today, capacityOf(planner, today, row.level === 'project' ? null : ids), avg))
  }
  // Phases on a row that is gone are projected against all the shifts.
  const known = new Set(rows.map(r => r.key))
  for (const p of planner.phases) {
    const key = rowOfPhase(p)
    if (!known.has(key) && !out.has(key)) out.set(key, projectRow(planner, key, today, capacityOf(planner, today), avg))
  }
  return out
}

// ---- drafting: the words left, as a second line ----

export interface WordsCheck { left: number; total: number; pace: number; finishes: string | null }

// Whether a phase is drafting: any of the work in it is of the Draft facet.
export function isDrafting(planner: Planner, phaseId: string): boolean {
  const facetsOf = (kind: WorkKind, id: string): Array<Facet | null> => {
    if (kind === 'task') return [planner.items.find(x => x.id === id)?.facet ?? null]
    if (kind === 'process') return planner.processes.find(x => x.id === id)?.facets ?? []
    if (kind === 'exercise') return planner.exercises.find(x => x.id === id)?.facets ?? []
    return [planner.routines.find(x => x.id === id)?.facet ?? null]
  }
  const placed = milestonesOf(planner, phaseId).flatMap(m => milestoneWork(planner, m.id))
  return placed.some(w => facetsOf(w.kind, w.id).includes('draft')) || planner.items.some(i => i.phaseId === phaseId && i.facet === 'draft')
}

// The words left against the recent words a day, from the draft goal (with a total) of the row's own project, book or chapter.
export function wordsCheck(goals: GoalProgress[], row: { level: 'project' | 'book' | 'chapter'; nodeId: string | null }): WordsCheck | null {
  const g = goals.find(x => x.goal.facet === 'draft' && x.goal.total && (row.level === 'project' ? x.goal.scope === 'project' : x.goal.scope === row.level && x.goal.nodeId === row.nodeId))
  if (!g || !g.goal.total) return null
  return { left: Math.max(0, g.goal.total - g.current), total: g.goal.total, pace: g.pace, finishes: g.finishes }
}
