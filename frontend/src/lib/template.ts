import type { Exercise, Goal, Milestone, Phase, PlanItem, Planner, Process, Routine } from './facets'
import { addDays, daysBetween } from './projection'

// The project template: one account-level plan (a Planner with only the parts that make a toolkit: phases, milestones, processes, exercises, routines, tasks
// and goals) whose dates are relative: a phase or milestone sits a number of days after the project's start, and a phase lasts a number of days. A project
// takes **copies** of what is picked (a copy is its own, never a link), dated from a start day that is asked; and a project's own items can be saved back.

export const PLAN_KINDS = ['phases', 'milestones', 'processes', 'exercises', 'routines', 'items', 'goals'] as const
export type PlanKindKey = (typeof PLAN_KINDS)[number]
export type PlanSelection = Record<PlanKindKey, string[]>
export const KIND_LABEL: Record<PlanKindKey, string> = { phases: 'Phases', milestones: 'Milestones', processes: 'Processes', exercises: 'Exercises', routines: 'Routines', items: 'Tasks', goals: 'Goals' }

export const emptySelection = (): PlanSelection => ({ phases: [], milestones: [], processes: [], exercises: [], routines: [], items: [], goals: [] })
export const selectionSize = (s: PlanSelection): number => PLAN_KINDS.reduce((n, k) => n + s[k].length, 0)
export const isEmptyPlan = (p: Planner): boolean => PLAN_KINDS.every(k => p[k].length === 0)

// Everything a plan could give: all but the tasks already done (and, in a project, the ones that belong to a shift that repeats, which are ticked a day at a time).
export function selectAll(p: Planner): PlanSelection {
  return {
    phases: p.phases.map(x => x.id), milestones: p.milestones.map(x => x.id), processes: p.processes.map(x => x.id), exercises: p.exercises.map(x => x.id),
    routines: p.routines.map(x => x.id), items: p.items.filter(i => !i.doneOn).map(x => x.id), goals: p.goals.map(x => x.id),
  }
}

// A process that is picked brings the milestones it needs, or it would be copied freer than it was.
export function withDependencies(p: Planner, sel: PlanSelection): PlanSelection {
  const needed = p.processes.filter(x => sel.processes.includes(x.id)).flatMap(x => x.requiredMilestoneIds).filter(id => p.milestones.some(m => m.id === id))
  return { ...sel, milestones: [...new Set([...sel.milestones, ...needed])] }
}

export interface CopyResult { planner: Planner; added: PlanSelection; counts: Record<PlanKindKey, number> }

const MAX_OFFSET = 3650
const pick = <T extends { id: string }>(list: T[], ids: string[]): T[] => list.filter(x => ids.includes(x.id))
const clamp = (n: number): number => Math.max(0, Math.min(MAX_OFFSET, n))

// How a phase and a milestone are dated on the way: real days from a start (into a project), or offsets from one (into the template).
interface Dating {
  phase: (p: Phase) => Pick<Phase, 'start' | 'end' | 'offsetDays' | 'lengthDays'>
  milestone: (m: Milestone) => Pick<Milestone, 'date' | 'offsetDays'>
  // The day a copied routine and task count from.
  anchor: string | null
}

function clone(source: Planner, sel: PlanSelection, dating: Dating, newId: (prefix: string) => string): { pieces: Pick<Planner, PlanKindKey>; added: PlanSelection } {
  const s = withDependencies(source, sel)
  const phases = pick(source.phases, s.phases)
  const milestones = pick(source.milestones, s.milestones)
  const processes = pick(source.processes, s.processes)
  const phaseId = new Map(phases.map(x => [x.id, newId('phase')]))
  const milestoneId = new Map(milestones.map(x => [x.id, newId('ms')]))
  const processId = new Map(processes.map(x => [x.id, newId('process')]))
  const mapped = (ids: string[], by: Map<string, string>): string[] => ids.filter(id => by.has(id)).map(id => by.get(id) as string)
  const tag = (id: string | null | undefined): string | null => (id ? phaseId.get(id) ?? null : null)

  const outPhases: Phase[] = phases.map(x => ({ ...x, id: phaseId.get(x.id) as string, status: 'planned', ...dating.phase(x) }))
  const outMilestones: Milestone[] = milestones.map(x => ({ ...x, id: milestoneId.get(x.id) as string, phaseId: tag(x.phaseId), done: false, doneOn: null, ...dating.milestone(x) }))
  const outProcesses: Process[] = processes.map(x => ({
    ...x, id: processId.get(x.id) as string, phaseIds: mapped(x.phaseIds, phaseId), requiredMilestoneIds: mapped(x.requiredMilestoneIds, milestoneId),
    groups: x.groups.map(g => ({ ...g, id: newId('group'), steps: g.steps.map(st => ({ ...st, id: newId('step') })) })),
    links: x.links.filter(l => processId.has(l.otherId)).map(l => ({ ...l, otherId: processId.get(l.otherId) as string })),
  }))
  const outExercises: Exercise[] = pick(source.exercises, s.exercises).map(x => ({ ...x, id: newId('exercise'), phaseIds: mapped(x.phaseIds, phaseId), timesDone: 0, lastDone: null }))
  const outRoutines: Routine[] = pick(source.routines, s.routines).map(x => ({
    ...x, id: newId('routine'), shiftId: null, lastDone: null, pauses: [], phaseId: tag(x.phaseId), targetNodeId: null, targetTree: null,
    recurrence: { ...x.recurrence, anchor: dating.anchor ?? x.recurrence.anchor, until: null },
  }))
  const outItems: PlanItem[] = pick(source.items, s.items).map(x => ({
    ...x, id: newId('item'), shiftId: null, doneOn: null, dueDate: null, addedOn: dating.anchor, carried: false, processId: null, afterId: null, phaseId: tag(x.phaseId),
    targetNodeId: null, targetTree: null, aim: null, subtasks: x.subtasks.map(st => ({ ...st, id: newId('sub'), done: false })),
  }))
  const outGoals: Goal[] = pick(source.goals, s.goals).map(x => ({ ...x, id: newId('goal'), scope: 'project', nodeId: null, deadline: null, phaseId: tag(x.phaseId) }))

  return {
    pieces: { phases: outPhases, milestones: outMilestones, processes: outProcesses, exercises: outExercises, routines: outRoutines, items: outItems, goals: outGoals },
    added: {
      phases: outPhases.map(x => x.id), milestones: outMilestones.map(x => x.id), processes: outProcesses.map(x => x.id), exercises: outExercises.map(x => x.id),
      routines: outRoutines.map(x => x.id), items: outItems.map(x => x.id), goals: outGoals.map(x => x.id),
    },
  }
}

function merge(into: Planner, pieces: Pick<Planner, PlanKindKey>, added: PlanSelection): CopyResult {
  const planner: Planner = { ...into }
  for (const k of PLAN_KINDS) (planner[k] as unknown[]) = [...into[k], ...pieces[k]]
  return { planner, added, counts: Object.fromEntries(PLAN_KINDS.map(k => [k, added[k].length])) as Record<PlanKindKey, number> }
}

// The template's picked items copied into a plan, dated from `startDay`. A project with no start of its own takes that day, and the end of the last phase copied.
export function copyIntoPlanner(template: Planner, sel: PlanSelection, target: Planner, startDay: string, newId: (prefix: string) => string): CopyResult {
  const dating: Dating = {
    anchor: startDay,
    phase: p => {
      if (p.offsetDays === null && p.lengthDays === null) return { start: null, end: null, offsetDays: null, lengthDays: null }
      const start = addDays(startDay, p.offsetDays ?? 0)
      return { start, end: p.lengthDays ? addDays(start, p.lengthDays - 1) : null, offsetDays: null, lengthDays: null }
    },
    milestone: m => ({ date: m.offsetDays === null ? null : addDays(startDay, m.offsetDays), offsetDays: null }),
  }
  const { pieces, added } = clone(template, sel, dating, newId)
  const result = merge(target, pieces, added)
  const ends = pieces.phases.map(p => p.end ?? p.start).filter((d): d is string => !!d).sort()
  if (pieces.phases.length > 0) result.planner = { ...result.planner, timelineStart: target.timelineStart ?? startDay, timelineEnd: target.timelineEnd ?? ends.at(-1) ?? null }
  return result
}

// A plan's picked items saved into the template, dated by how many days after the plan's start they are (its start, or else its earliest date).
export function saveToTemplate(source: Planner, sel: PlanSelection, template: Planner, newId: (prefix: string) => string): CopyResult {
  const dates = [source.timelineStart, ...source.phases.flatMap(p => [p.start, p.end]), ...source.milestones.map(m => m.date)].filter((d): d is string => !!d).sort()
  const base = source.timelineStart ?? dates[0] ?? null
  const offset = (d: string): number => (base ? clamp(daysBetween(base, d)) : 0)
  const dating: Dating = {
    anchor: null,
    phase: p => {
      const start = p.start ?? p.end
      const end = p.end ?? p.start
      if (!base || !start || !end) return { start: null, end: null, offsetDays: null, lengthDays: null }
      return { start: null, end: null, offsetDays: offset(start), lengthDays: Math.max(1, Math.min(MAX_OFFSET, daysBetween(start, end) + 1)) }
    },
    milestone: m => ({ date: null, offsetDays: base && m.date ? offset(m.date) : null }),
  }
  const { pieces, added } = clone(source, sel, dating, newId)
  return merge(template, pieces, added)
}

// What a result says, for the line under the button: "2 phases, 3 milestones and a process".
export function describeCounts(counts: Record<PlanKindKey, number>): string {
  const one: Record<PlanKindKey, string> = { phases: 'phase', milestones: 'milestone', processes: 'process', exercises: 'exercise', routines: 'routine', items: 'task', goals: 'goal' }
  const many: Record<PlanKindKey, string> = { phases: 'phases', milestones: 'milestones', processes: 'processes', exercises: 'exercises', routines: 'routines', items: 'tasks', goals: 'goals' }
  const parts = PLAN_KINDS.filter(k => counts[k] > 0).map(k => `${counts[k]} ${counts[k] === 1 ? one[k] : many[k]}`)
  if (parts.length === 0) return 'nothing'
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}
