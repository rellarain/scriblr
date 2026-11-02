import type { Planner } from './facets'

// Taking something out of the plan, and leaving nothing pointing at it: a phase's tag comes off what was tagged with it, a milestone stops being required,
// and a process's links and the tasks it made are let go. Each returns a new planner.

export function removePhase(p: Planner, id: string): Planner {
  const untag = <T extends { phaseId?: string | null }>(list: T[]): T[] => list.map(x => (x.phaseId === id ? { ...x, phaseId: null } : x))
  return {
    ...p,
    phases: p.phases.filter(x => x.id !== id),
    milestones: untag(p.milestones),
    goals: untag(p.goals),
    routines: untag(p.routines),
    items: untag(p.items),
    processes: p.processes.map(x => ({ ...x, phaseIds: x.phaseIds.filter(v => v !== id) })),
    exercises: p.exercises.map(x => ({ ...x, phaseIds: x.phaseIds.filter(v => v !== id) })),
  }
}

export function removeMilestone(p: Planner, id: string): Planner {
  return { ...p, milestones: p.milestones.filter(x => x.id !== id), processes: p.processes.map(x => ({ ...x, requiredMilestoneIds: x.requiredMilestoneIds.filter(v => v !== id) })) }
}

export function removeProcess(p: Planner, id: string): Planner {
  return {
    ...p,
    processes: p.processes.filter(x => x.id !== id).map(x => ({ ...x, links: x.links.filter(l => l.otherId !== id) })),
    items: p.items.map(x => (x.processId === id ? { ...x, processId: null } : x)),
  }
}

// Ticking a milestone says on which day it was done.
export function tickMilestone(p: Planner, id: string, on: boolean, today: string): Planner {
  return { ...p, milestones: p.milestones.map(m => (m.id === id ? { ...m, done: on, doneOn: on ? today : null } : m)) }
}

// One link between two processes is kept on both sides, so that it reads the same from either: "A before B" is also "B after A", and "with" goes both ways.
export function linkProcesses(p: Planner, from: string, to: string, relation: 'before' | 'after' | 'with' | null): Planner {
  if (from === to) return p
  const mirror = { before: 'after', after: 'before', with: 'with' } as const
  const strip = (links: Planner['processes'][number]['links'], other: string) => links.filter(l => l.otherId !== other)
  return {
    ...p,
    processes: p.processes.map(x => {
      if (x.id === from) return { ...x, links: [...strip(x.links, to), ...(relation ? [{ otherId: to, relation }] : [])] }
      if (x.id === to) return { ...x, links: [...strip(x.links, from), ...(relation ? [{ otherId: from, relation: mirror[relation] }] : [])] }
      return x
    }),
  }
}
