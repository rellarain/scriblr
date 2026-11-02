import type { Milestone, Phase, Planner } from './facets'
import { addDays, daysBetween } from './projection'
import { phasesOnRow, rowOfMilestone, rowOfPhase } from './planRows'

// The order a row's phases and a phase's milestones come in, and the dates that follow from it. Reordering re-dates one after another from the lengths; a phase
// or milestone that is pinned (`fixed`) keeps its date and the rest flows after it; a phase that is done never moves. Reflowing happens when the user reorders
// or changes a length, never on load. Work only moves inside its row; a move to another row is refused, with the reason. Pure, in whole UTC days.

export const DEFAULT_PHASE_DAYS = 14

export type Moved = { ok: true; planner: Planner } | { ok: false; reason: string }

// How long a phase lasts: its length, else the days between its dates, else a fortnight.
export function phaseLength(p: Phase): number {
  if (p.lengthDays) return p.lengthDays
  const start = p.start ?? p.end
  const end = p.end ?? p.start
  return start && end ? Math.max(1, daysBetween(start, end) + 1) : DEFAULT_PHASE_DAYS
}

const sortMilestones = (list: Milestone[]): Milestone[] => [...list].sort((a, b) => a.order - b.order || (a.date ?? '').localeCompare(b.date ?? ''))
export const milestonesOf = (planner: Planner, phaseId: string): Milestone[] => sortMilestones(planner.milestones.filter(m => m.phaseId === phaseId))

// A phase's milestones dated one after another across the phase's days. A pinned milestone keeps its date; the others take their length, or share what is
// left of the phase evenly, and the last one ends with the phase.
function reflowMilestones(milestones: Milestone[], start: string, end: string): Milestone[] {
  const out: Milestone[] = []
  let cursor = start
  milestones.forEach((m, i) => {
    if (m.fixed && m.date) { out.push(m); cursor = addDays(m.date, 1); return }
    const rest = milestones.slice(i).filter(x => !(x.fixed && x.date))
    const open = rest.filter(x => !x.lengthDays).length
    const explicit = rest.reduce((n, x) => n + (x.lengthDays ?? 0), 0)
    const left = Math.max(1, daysBetween(cursor, end) + 1)
    const len = m.lengthDays ?? Math.max(1, Math.floor(Math.max(1, left - explicit) / Math.max(1, open)))
    const last = i === milestones.length - 1
    const date = last && !m.lengthDays ? end : addDays(cursor, len - 1)
    const clipped = date > end ? end : date
    out.push({ ...m, date: clipped < cursor ? cursor : clipped })
    cursor = addDays(clipped < cursor ? cursor : clipped, 1)
  })
  return out
}

// Re-date a row: its phases one after another from `from` (the row's start), each as long as it is, and the milestones across each phase.
export function reflowRow(planner: Planner, key: string, from: string | null): Planner {
  const phases = phasesOnRow(planner, key)
  const dated = new Map<string, Phase>()
  let cursor = from
  for (const p of phases) {
    const pinned = (p.fixed || p.status === 'done') && !!(p.start ?? p.end)
    if (pinned) {
      const start = (p.start ?? p.end) as string
      const end = p.end ?? addDays(start, phaseLength(p) - 1)
      dated.set(p.id, { ...p, start, end })
      cursor = addDays(end, 1)
    } else if (cursor) {
      const len = phaseLength(p)
      dated.set(p.id, { ...p, start: cursor, end: addDays(cursor, len - 1), lengthDays: len })
      cursor = addDays(cursor, len)
    } else {
      dated.set(p.id, p)
    }
  }
  const milestones = new Map<string, Milestone>()
  for (const p of dated.values()) {
    if (!p.start || !p.end) continue
    for (const m of reflowMilestones(milestonesOf(planner, p.id), p.start, p.end)) milestones.set(m.id, m)
  }
  return { ...planner, phases: planner.phases.map(p => dated.get(p.id) ?? p), milestones: planner.milestones.map(m => milestones.get(m.id) ?? m) }
}

// Where a row begins: the project's start, else the day its first phase starts.
export const rowStart = (planner: Planner, key: string): string | null =>
  planner.timelineStart ?? phasesOnRow(planner, key).map(p => p.start).filter((d): d is string => !!d).sort()[0] ?? null

const insertAt = <T,>(list: T[], item: T, index: number): T[] => { const at = Math.max(0, Math.min(list.length, index)); return [...list.slice(0, at), item, ...list.slice(at)] }

// A phase moved to a place in its row's sequence (0 first); the row is re-dated.
export function movePhase(planner: Planner, id: string, toIndex: number): Moved {
  const phase = planner.phases.find(p => p.id === id)
  if (!phase) return { ok: false, reason: 'That phase is gone.' }
  const key = rowOfPhase(phase)
  const row = phasesOnRow(planner, key).filter(p => p.id !== id)
  const order = new Map(insertAt(row, phase, toIndex).map((p, i) => [p.id, i]))
  const next = { ...planner, phases: planner.phases.map(p => (order.has(p.id) ? { ...p, order: order.get(p.id) as number } : p)) }
  return { ok: true, planner: reflowRow(next, key, rowStart(next, key)) }
}

// A milestone moved to a place in a phase's sections. It can only go to a phase on its own row.
export function moveMilestone(planner: Planner, id: string, toPhaseId: string, toIndex: number): Moved {
  const m = planner.milestones.find(x => x.id === id)
  const to = planner.phases.find(p => p.id === toPhaseId)
  if (!m || !to) return { ok: false, reason: 'That milestone or phase is gone.' }
  const from = rowOfMilestone(planner, id)
  const key = rowOfPhase(to)
  if (from && from !== key) return { ok: false, reason: `${m.title || 'This milestone'} belongs to another row. It can only move inside its own row.` }
  const rest = milestonesOf(planner, toPhaseId).filter(x => x.id !== id)
  const order = new Map(insertAt(rest, { ...m, phaseId: toPhaseId }, toIndex).map((x, i) => [x.id, i]))
  const next = { ...planner, milestones: planner.milestones.map(x => (order.has(x.id) ? { ...x, phaseId: toPhaseId, order: order.get(x.id) as number } : x)) }
  return { ok: true, planner: reflowRow(next, key, rowStart(next, key)) }
}

export type WorkKind = 'task' | 'process' | 'exercise' | 'routine'

// The milestones a piece of work is placed in now.
export function placedIn(planner: Planner, kind: WorkKind, id: string): string[] {
  if (kind === 'task') { const m = planner.items.find(x => x.id === id)?.milestoneId; return m ? [m] : [] }
  if (kind === 'routine') { const m = planner.routines.find(x => x.id === id)?.milestoneId; return m ? [m] : [] }
  return (kind === 'process' ? planner.processes : planner.exercises).find(x => x.id === id)?.milestoneIds ?? []
}

// Work placed in a milestone (or taken out of every milestone with `to` null). Placing something that is not placed yet goes anywhere; moving something that is
// placed (`from` is the milestone it is dragged out of; a task or routine has only the one) goes only to a milestone on the same row. The phase of the milestone
// is tagged on a task or routine, and added to a process's or exercise's phases.
export function placeWork(planner: Planner, kind: WorkKind, id: string, to: string | null, from?: string | null): Moved {
  const target = to ? planner.milestones.find(m => m.id === to) : undefined
  if (to && !target) return { ok: false, reason: 'That milestone is gone.' }
  const source = from ?? (kind === 'task' || kind === 'routine' ? placedIn(planner, kind, id)[0] ?? null : null)
  if (to && source && source !== to) {
    const a = rowOfMilestone(planner, source)
    const b = rowOfMilestone(planner, to)
    if (a && b && a !== b) return { ok: false, reason: 'Work can only move to another milestone on its own row.' }
  }
  const phaseId = target?.phaseId ?? null
  if (kind === 'task') return { ok: true, planner: { ...planner, items: planner.items.map(x => (x.id === id ? { ...x, milestoneId: to, phaseId: to ? phaseId : x.phaseId } : x)) } }
  if (kind === 'routine') return { ok: true, planner: { ...planner, routines: planner.routines.map(x => (x.id === id ? { ...x, milestoneId: to, phaseId: to ? phaseId : x.phaseId } : x)) } }
  const retarget = <T extends { id: string; milestoneIds: string[]; phaseIds: string[] }>(x: T): T => {
    if (x.id !== id) return x
    const kept = x.milestoneIds.filter(m => m !== (source ?? '') && m !== to)
    return { ...x, milestoneIds: to ? [...kept, to] : kept, phaseIds: phaseId && !x.phaseIds.includes(phaseId) ? [...x.phaseIds, phaseId] : x.phaseIds }
  }
  return kind === 'process' ? { ok: true, planner: { ...planner, processes: planner.processes.map(retarget) } } : { ok: true, planner: { ...planner, exercises: planner.exercises.map(retarget) } }
}
