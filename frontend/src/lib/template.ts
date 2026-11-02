import type { Exercise, Goal, Milestone, Phase, PhaseKind, PhaseLevel, PlanItem, Planner, Process, Routine } from './facets'
import { rowKey, rowOfPhase } from './planRows'
import { addDays, daysBetween } from './projection'

// The project template: one account-level plan (a Planner with only the parts that make a toolkit: phases, milestones, processes, exercises, routines, tasks
// and goals, and the kinds of phase) whose dates are relative: a phase or milestone sits a number of days after the project's start, and a phase lasts a number of
// days. A template phase has a **level**: of the project, or of each book, or of each chapter. A project takes **copies** of what is picked (a copy is its own, never
// a link), dated from a start day that is asked; a book phase is copied onto each of the books chosen and a chapter phase onto each of the chapters chosen, with its
// milestones and what is placed in them. A project's own items can be saved back (their levels kept, not their books or chapters).

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

// A phase that is picked brings its milestones (its sections are part of it), and a process that is picked brings the milestones it needs, or it would be copied
// freer than it was.
export function withDependencies(p: Planner, sel: PlanSelection): PlanSelection {
  const needed = p.processes.filter(x => sel.processes.includes(x.id)).flatMap(x => x.requiredMilestoneIds).filter(id => p.milestones.some(m => m.id === id))
  const sections = p.milestones.filter(m => m.phaseId && sel.phases.includes(m.phaseId)).map(m => m.id)
  return { ...sel, milestones: [...new Set([...sel.milestones, ...needed, ...sections])] }
}

// The books and chapters (their outline ids) the template's book and chapter phases are copied onto.
export interface CopyTargets { books: string[]; chapters: string[] }
export interface CopyResult { planner: Planner; added: PlanSelection; counts: Record<PlanKindKey, number>; skipped: number }

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

interface Row { level: PhaseLevel; nodeId: string | null }
interface Copy { phaseId: string; row: Row }

// The pieces of what is picked, made new. A phase has a copy for each row it is put on (`place`), and so do its milestones; work placed in a milestone is made
// again for each copy of it (a process or exercise, being a definition, is placed in all of them). A tag that names one thing names the first copy of it.
function clone(source: Planner, sel: PlanSelection, dating: Dating, newId: (prefix: string) => string, place: (p: Phase) => Row[]): { pieces: Pick<Planner, PlanKindKey | 'phaseKinds'>; added: PlanSelection; skipped: number } {
  const s = withDependencies(source, sel)
  const phases = pick(source.phases, s.phases)
  const milestones = pick(source.milestones, s.milestones)
  const processes = pick(source.processes, s.processes)
  const processId = new Map(processes.map(x => [x.id, newId('process')]))

  const phaseCopies = new Map<string, Copy[]>(phases.map(p => [p.id, place(p).map(row => ({ phaseId: newId('phase'), row }))]))
  const skipped = phases.filter(p => (phaseCopies.get(p.id) ?? []).length === 0).length
  // The kinds of the phases copied, each once.
  const kindId = new Map<string, string>()
  const kindMilestoneId = new Map<string, string>()
  const outKinds: PhaseKind[] = []
  for (const p of phases) {
    const k = p.kindId && !kindId.has(p.kindId) && (phaseCopies.get(p.id) ?? []).length > 0 ? source.phaseKinds.find(x => x.id === p.kindId) : undefined
    if (!k) continue
    kindId.set(k.id, newId('kind'))
    outKinds.push({ ...k, id: kindId.get(k.id) as string, milestones: k.milestones.map(m => { const id = newId('km'); kindMilestoneId.set(m.id, id); return { ...m, id } }) })
  }

  // A milestone of a phase that is copied has a copy in each copy of the phase; one whose phase was not picked is copied loose; one whose phase had nowhere to go is dropped.
  interface MsCopy { id: string; phaseId: string | null }
  const msCopies = new Map<string, MsCopy[]>()
  for (const m of milestones) {
    if (m.phaseId && phaseCopies.has(m.phaseId)) msCopies.set(m.id, (phaseCopies.get(m.phaseId) ?? []).map(c => ({ id: newId('ms'), phaseId: c.phaseId })))
    else msCopies.set(m.id, [{ id: newId('ms'), phaseId: null }])
  }
  const firstPhase = (id: string | null | undefined): string | null => (id ? phaseCopies.get(id)?.[0]?.phaseId ?? null : null)
  const firstMs = (id: string | null | undefined): string | null => (id ? msCopies.get(id)?.[0]?.id ?? null : null)
  const allPhases = (ids: string[]): string[] => ids.flatMap(id => (phaseCopies.get(id) ?? []).map(c => c.phaseId))
  const allMs = (ids: string[]): string[] => ids.flatMap(id => (msCopies.get(id) ?? []).map(c => c.id))

  const outPhases: Phase[] = phases.flatMap(x => (phaseCopies.get(x.id) ?? []).map((c): Phase => ({
    ...x, id: c.phaseId, status: 'planned', level: c.row.level, nodeId: c.row.nodeId, fixed: false,
    kindId: x.kindId ? kindId.get(x.kindId) ?? null : null, overrides: x.kindId && kindId.has(x.kindId) ? x.overrides : [], ...dating.phase(x),
  })))
  const outMilestones: Milestone[] = milestones.flatMap(x => (msCopies.get(x.id) ?? []).map((c): Milestone => ({
    ...x, id: c.id, phaseId: c.phaseId, done: false, doneOn: null, fixed: false,
    kindMilestoneId: x.kindMilestoneId ? kindMilestoneId.get(x.kindMilestoneId) ?? null : null, overrides: x.kindMilestoneId && kindMilestoneId.has(x.kindMilestoneId) ? x.overrides : [], ...dating.milestone(x),
  })))
  const outProcesses: Process[] = processes.map(x => ({
    ...x, id: processId.get(x.id) as string, phaseIds: allPhases(x.phaseIds), milestoneIds: allMs(x.milestoneIds), requiredMilestoneIds: x.requiredMilestoneIds.map(firstMs).filter((id): id is string => !!id),
    groups: x.groups.map(g => ({ ...g, id: newId('group'), steps: g.steps.map(st => ({ ...st, id: newId('step') })) })),
    links: x.links.filter(l => processId.has(l.otherId)).map(l => ({ ...l, otherId: processId.get(l.otherId) as string })),
  }))
  const outExercises: Exercise[] = pick(source.exercises, s.exercises).map(x => ({ ...x, id: newId('exercise'), phaseIds: allPhases(x.phaseIds), milestoneIds: allMs(x.milestoneIds), timesDone: 0, lastDone: null }))
  // Work placed in a milestone is made again for each copy of the milestone, each tagged with its own milestone and the phase of that.
  const fan = <T extends { milestoneId?: string | null; phaseId?: string | null }>(x: T): Array<{ milestoneId: string | null; phaseId: string | null }> => {
    const copies = x.milestoneId ? msCopies.get(x.milestoneId) : undefined
    return copies && copies.length > 0 ? copies.map(c => ({ milestoneId: c.id, phaseId: c.phaseId ?? firstPhase(x.phaseId) })) : [{ milestoneId: null, phaseId: firstPhase(x.phaseId) }]
  }
  const outRoutines: Routine[] = pick(source.routines, s.routines).flatMap(x => fan(x).map((t): Routine => ({
    ...x, id: newId('routine'), shiftId: null, lastDone: null, pauses: [], ...t, targetNodeId: null, targetTree: null,
    recurrence: { ...x.recurrence, anchor: dating.anchor ?? x.recurrence.anchor, until: null },
  })))
  const outItems: PlanItem[] = pick(source.items, s.items).flatMap(x => fan(x).map((t): PlanItem => ({
    ...x, id: newId('item'), shiftId: null, doneOn: null, dueDate: null, addedOn: dating.anchor, carried: false, processId: null, afterId: null, ...t,
    targetNodeId: null, targetTree: null, aim: null, subtasks: x.subtasks.map(st => ({ ...st, id: newId('sub'), done: false })),
  })))
  const outGoals: Goal[] = pick(source.goals, s.goals).map(x => ({ ...x, id: newId('goal'), scope: 'project', nodeId: null, deadline: null, phaseId: firstPhase(x.phaseId) }))

  return {
    pieces: { phases: outPhases, milestones: outMilestones, processes: outProcesses, exercises: outExercises, routines: outRoutines, items: outItems, goals: outGoals, phaseKinds: outKinds },
    added: {
      phases: outPhases.map(x => x.id), milestones: outMilestones.map(x => x.id), processes: outProcesses.map(x => x.id), exercises: outExercises.map(x => x.id),
      routines: outRoutines.map(x => x.id), items: outItems.map(x => x.id), goals: outGoals.map(x => x.id),
    },
    skipped,
  }
}

// The phases that come in take their place in the sequence of their row, after those that are there (in the order they had in the plan they came from).
function sequenced(into: Planner, incoming: Phase[]): Phase[] {
  const base = new Map<string, number>()
  for (const p of into.phases) { const k = rowOfPhase(p); base.set(k, Math.max(base.get(k) ?? 0, p.order + 1)) }
  const taken = new Map<string, number>()
  return [...incoming].sort((a, b) => a.order - b.order).map(p => {
    const k = rowOfPhase(p)
    const n = taken.get(k) ?? 0
    taken.set(k, n + 1)
    return { ...p, order: (base.get(k) ?? 0) + n }
  })
}

function merge(into: Planner, pieces: Pick<Planner, PlanKindKey | 'phaseKinds'>, added: PlanSelection, skipped: number): CopyResult {
  const planner: Planner = { ...into, phaseKinds: [...into.phaseKinds, ...pieces.phaseKinds] }
  for (const k of PLAN_KINDS) (planner[k] as unknown[]) = [...into[k], ...(k === 'phases' ? sequenced(into, pieces.phases) : pieces[k])]
  return { planner, added, counts: Object.fromEntries(PLAN_KINDS.map(k => [k, added[k].length])) as Record<PlanKindKey, number>, skipped }
}

// The template's picked items copied into a plan, dated from `startDay`: a project phase once, a book phase onto each of the `targets` books and a chapter phase
// onto each of the chapters (with no target of a level, the phases of that level are left out and counted as skipped). A project with no start of its own takes the
// start day, and the end of the last phase copied.
export function copyIntoPlanner(template: Planner, sel: PlanSelection, target: Planner, startDay: string, newId: (prefix: string) => string, targets: CopyTargets = { books: [], chapters: [] }): CopyResult {
  const dating: Dating = {
    anchor: startDay,
    phase: p => {
      if (p.offsetDays === null && p.lengthDays === null) return { start: null, end: null, offsetDays: null, lengthDays: null }
      const start = addDays(startDay, p.offsetDays ?? 0)
      return { start, end: p.lengthDays ? addDays(start, p.lengthDays - 1) : null, offsetDays: null, lengthDays: null }
    },
    milestone: m => ({ date: m.offsetDays === null ? null : addDays(startDay, m.offsetDays), offsetDays: null }),
  }
  const place = (p: Phase): Row[] => (p.level === 'project' ? [{ level: 'project', nodeId: null }] : (p.level === 'book' ? targets.books : targets.chapters).map(nodeId => ({ level: p.level, nodeId })))
  const { pieces, added, skipped } = clone(template, sel, dating, newId, place)
  const result = merge(target, pieces, added, skipped)
  const ends = pieces.phases.map(p => p.end ?? p.start).filter((d): d is string => !!d).sort()
  if (pieces.phases.length > 0) result.planner = { ...result.planner, timelineStart: target.timelineStart ?? startDay, timelineEnd: target.timelineEnd ?? ends.at(-1) ?? null }
  return result
}

// A plan's picked items saved into the template, dated by how many days after the plan's start they are (its start, or else its earliest date). A phase keeps its
// level, but not the book or chapter it was on: in the template it is for each book or chapter.
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
  const { pieces, added, skipped } = clone(source, sel, dating, newId, p => [{ level: p.level, nodeId: null }])
  return merge(template, pieces, added, skipped)
}

// The rows a template's phases are on: the project's, each book's and each chapter's, which are not particular books or chapters.
export const TEMPLATE_ROWS = [
  { key: rowKey('project', null), level: 'project' as const, title: 'The project' },
  { key: rowKey('book', null), level: 'book' as const, title: 'Each book' },
  { key: rowKey('chapter', null), level: 'chapter' as const, title: 'Each chapter' },
]

// What a result says, for the line under the button: "2 phases, 3 milestones and a process".
export function describeCounts(counts: Record<PlanKindKey, number>): string {
  const one: Record<PlanKindKey, string> = { phases: 'phase', milestones: 'milestone', processes: 'process', exercises: 'exercise', routines: 'routine', items: 'task', goals: 'goal' }
  const many: Record<PlanKindKey, string> = { phases: 'phases', milestones: 'milestones', processes: 'processes', exercises: 'exercises', routines: 'routines', items: 'tasks', goals: 'goals' }
  const parts = PLAN_KINDS.filter(k => counts[k] > 0).map(k => `${counts[k]} ${counts[k] === 1 ? one[k] : many[k]}`)
  if (parts.length === 0) return 'nothing'
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}
