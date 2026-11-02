import { SLOTS_PER_DAY, newTask, type Exercise, type Facet, type PlanItem, type Planner, type Process, type Routine, type Shift } from './facets'
import { unmetMilestones } from './processOrder'
import { MIN_SHIFT_SLOTS } from './timeline'

// What a routine, a process or an exercise does when it is dropped on the Agenda (pure: each returns the planner as it is afterwards, or says why not).
//
//   routine   a shift that repeats the way the routine does (a routine that comes round after an interval, which a shift cannot, becomes a one-off shift),
//             with the routine on it
//   process   a shift whose checklist is the process's steps: each a task, and in an ordered group each follows the one before it (it can be ticked once that
//             one is). A process that needs milestones not yet done is blocked: nothing is made
//   exercise  a shift as long as the exercise, with one task on it: the exercise, its prompt in the notes
//
// Dropped on a shift that is there already, the same things go on that shift instead of a new one.

export const DRAG_PLAN = 'application/x-scriblr-plan'
export type PlanKind = 'routine' | 'process' | 'exercise'
export interface PlanDrag { ownerId: string; kind: PlanKind; id: string }
// Dropped on a day of the month or the year, where there is no time to point at: at nine in the morning.
export const DAY_DROP_SLOT = 54
const DEFAULT_SLOTS = 6
const MAX_SLOTS = 48

export type DropResult = { ok: true; planner: Planner; shiftId: string } | { ok: false; reason: string }

const clampSlots = (minutes: number | null | undefined): number => Math.max(MIN_SHIFT_SLOTS, Math.min(MAX_SLOTS, minutes ? Math.ceil(minutes / 10) : DEFAULT_SLOTS))
const place = (slot: number, length: number): number => Math.max(0, Math.min(SLOTS_PER_DAY - length, slot))

function shiftOf(id: string, title: string, facet: Facet, date: string, slot: number, length: number, extra: Partial<Shift> = {}): Shift {
  const startSlot = place(slot, length)
  return { id, title, facet, date, startSlot, endSlot: startSlot + length, targetNodeId: null, targetTree: null, target: null, recurrence: null, pauses: [], skipped: [], overrides: {}, ...extra }
}

// The tasks a process makes: its steps, group by group, each tied to the process and its first phase, and in an ordered group to the step before it.
export function processTasks(process: Process, shiftId: string, today: string, newId: () => string): PlanItem[] {
  const out: PlanItem[] = []
  for (const g of process.groups) {
    let before: string | null = null
    for (const s of g.steps) {
      const id = newId()
      out.push(newTask(id, s.label, today, {
        shiftId, facet: s.facet ?? process.facets[0] ?? null, estimateMinutes: s.estimateMinutes, processId: process.id, phaseId: process.phaseIds[0] ?? null,
        afterId: g.ordered ? before : null,
      }))
      before = id
    }
  }
  return out
}

const processMinutes = (p: Process): number => p.groups.reduce((n, g) => n + g.steps.reduce((m, s) => m + (s.estimateMinutes ?? 0), 0), 0)

function blocked(process: Process, planner: Planner): string | null {
  const unmet = unmetMilestones(process, planner.milestones)
  if (unmet.length === 0) return null
  const names = unmet.map(id => planner.milestones.find(m => m.id === id)?.title || 'a milestone that is gone')
  return `${process.title || 'This process'} needs ${names.join(', ')} done first.`
}

// A routine on the Agenda: on an empty slot a new shift, on a shift that is there already it joins it.
export function dropRoutine(planner: Planner, routine: Routine, at: { date: string; slot: number } | { shiftId: string }, newId: () => string): DropResult {
  if ('shiftId' in at) return { ok: true, shiftId: at.shiftId, planner: { ...planner, routines: planner.routines.map(r => (r.id === routine.id ? { ...r, shiftId: at.shiftId } : r)) } }
  const rec = routine.recurrence.kind === 'interval' || routine.recurrence.kind === 'once' ? null : { ...routine.recurrence, anchor: at.date, until: routine.recurrence.until }
  const shift = shiftOf(newId(), routine.label, routine.facet ?? 'draft', at.date, at.slot, DEFAULT_SLOTS, { targetNodeId: routine.targetNodeId, targetTree: routine.targetTree, recurrence: rec })
  return { ok: true, shiftId: shift.id, planner: { ...planner, shifts: [...planner.shifts, shift], routines: planner.routines.map(r => (r.id === routine.id ? { ...r, shiftId: shift.id } : r)) } }
}

export function dropProcess(planner: Planner, process: Process, at: { date: string; slot: number } | { shiftId: string }, today: string, newId: () => string): DropResult {
  const why = blocked(process, planner)
  if (why) return { ok: false, reason: why }
  if ('shiftId' in at) return { ok: true, shiftId: at.shiftId, planner: { ...planner, items: [...planner.items, ...processTasks(process, at.shiftId, today, newId)] } }
  const shift = shiftOf(newId(), process.title, process.facets[0] ?? 'draft', at.date, at.slot, clampSlots(processMinutes(process)))
  return { ok: true, shiftId: shift.id, planner: { ...planner, shifts: [...planner.shifts, shift], items: [...planner.items, ...processTasks(process, shift.id, today, newId)] } }
}

export function dropExercise(planner: Planner, exercise: Exercise, at: { date: string; slot: number } | { shiftId: string }, today: string, newId: () => string): DropResult {
  const task = (shiftId: string) => newTask(newId(), exercise.title, today, { shiftId, facet: exercise.facets[0] ?? null, estimateMinutes: exercise.durationMinutes, notes: exercise.description, phaseId: exercise.phaseIds[0] ?? null })
  if ('shiftId' in at) return { ok: true, shiftId: at.shiftId, planner: { ...planner, items: [...planner.items, task(at.shiftId)] } }
  const shift = shiftOf(newId(), exercise.title, exercise.facets[0] ?? 'draft', at.date, at.slot, clampSlots(exercise.durationMinutes))
  return { ok: true, shiftId: shift.id, planner: { ...planner, shifts: [...planner.shifts, shift], items: [...planner.items, task(shift.id)] } }
}

// A step that follows another cannot be ticked until that one is (done once, or ticked on the day).
export function isLocked(item: PlanItem, items: PlanItem[], isDone: (i: PlanItem) => boolean): boolean {
  if (!item.afterId) return false
  const before = items.find(i => i.id === item.afterId)
  return !!before && !isDone(before)
}
