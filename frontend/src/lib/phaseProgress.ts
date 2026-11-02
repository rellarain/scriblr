import type { Milestone, Phase, Planner } from './facets'

// How far a phase is: what builds to its result (the tasks, the milestones and the goals tagged with it), done over all. A phase with nothing tagged has no
// progress to show (null), and "mark done" is offered once everything tagged is done.

export interface PhaseProgress { done: number; total: number; pct: number | null; tasks: [number, number]; milestones: [number, number]; goals: [number, number] }

// `metGoalIds` are the goals that are met (their status is Done: the console reads that from the goal's progress).
export function phaseProgress(planner: Planner, phaseId: string, metGoalIds: ReadonlySet<string> = new Set()): PhaseProgress {
  const tasks = planner.items.filter(i => i.phaseId === phaseId)
  const milestones = planner.milestones.filter(m => m.phaseId === phaseId)
  const goals = planner.goals.filter(g => g.phaseId === phaseId)
  const t: [number, number] = [tasks.filter(i => i.doneOn).length, tasks.length]
  const m: [number, number] = [milestones.filter(x => x.done).length, milestones.length]
  const g: [number, number] = [goals.filter(x => metGoalIds.has(x.id)).length, goals.length]
  const done = t[0] + m[0] + g[0]
  const total = t[1] + m[1] + g[1]
  return { done, total, pct: total === 0 ? null : Math.round((done / total) * 100), tasks: t, milestones: m, goals: g }
}

// The phase to show first: the one marked active, else the one whose dates hold today, else the first that is not done.
export function currentPhase(phases: Phase[], today: string): Phase | null {
  return (
    phases.find(p => p.status === 'active')
    ?? phases.find(p => p.status !== 'done' && p.start && p.end && p.start <= today && today <= p.end)
    ?? phases.find(p => p.status !== 'done')
    ?? null
  )
}

// The milestone that comes next: the earliest one not done that falls today or later (else, the earliest one not done that has no date yet).
export function nextMilestone(milestones: Milestone[], today: string): Milestone | null {
  const open = milestones.filter(m => !m.done)
  return open.filter(m => m.date && m.date >= today).sort((a, b) => (a.date as string).localeCompare(b.date as string))[0] ?? open.find(m => !m.date) ?? null
}
