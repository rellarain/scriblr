import type { Phase, Planner } from './facets'
import { milestonesOf } from './planSequence'

// A milestone is a deliverable reached by finishing the work placed in it: its tasks (ticked), its processes (every task the process made is done), its
// exercises and its routines (done since its phase began). It can also be ticked by hand. Pure.

export type WorkEntryKind = 'task' | 'process' | 'exercise' | 'routine'
export interface WorkEntry { kind: WorkEntryKind; id: string; label: string; done: boolean }

export function milestoneWork(planner: Planner, milestoneId: string): WorkEntry[] {
  const m = planner.milestones.find(x => x.id === milestoneId)
  if (!m) return []
  const phase = planner.phases.find(p => p.id === m.phaseId)
  const since = phase?.start ?? null
  const doneSince = (day: string | null): boolean => !!day && (!since || day >= since)
  const processes = planner.processes.filter(p => p.milestoneIds.includes(milestoneId))
  const inProcess = new Set(processes.map(p => p.id))
  const tasks = planner.items.filter(i => i.milestoneId === milestoneId && !(i.processId && inProcess.has(i.processId)))
  return [
    ...tasks.map((i): WorkEntry => ({ kind: 'task', id: i.id, label: i.label, done: !!i.doneOn })),
    ...processes.map((p): WorkEntry => {
      const made = planner.items.filter(i => i.processId === p.id)
      return { kind: 'process', id: p.id, label: p.title, done: made.length > 0 && made.every(i => !!i.doneOn) }
    }),
    ...planner.exercises.filter(x => x.milestoneIds.includes(milestoneId)).map((x): WorkEntry => ({ kind: 'exercise', id: x.id, label: x.title, done: doneSince(x.lastDone) })),
    ...planner.routines.filter(r => r.milestoneId === milestoneId).map((r): WorkEntry => ({ kind: 'routine', id: r.id, label: r.label, done: doneSince(r.lastDone) })),
  ]
}

export interface MilestoneState { done: number; total: number; achieved: boolean }

// Achieved when ticked by hand, or when it holds work and all of it is done.
export function milestoneState(planner: Planner, milestoneId: string): MilestoneState {
  const work = milestoneWork(planner, milestoneId)
  const done = work.filter(w => w.done).length
  const ticked = !!planner.milestones.find(m => m.id === milestoneId)?.done
  return { done, total: work.length, achieved: ticked || (work.length > 0 && done === work.length) }
}

// A phase is done when its last milestone is achieved (a phase with no milestones is done only when it is marked so).
export function phaseReached(planner: Planner, phase: Phase): boolean {
  const last = milestonesOf(planner, phase.id).at(-1)
  return last ? milestoneState(planner, last.id).achieved : phase.status === 'done'
}
