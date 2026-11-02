import { newMilestone, newPhase, type Milestone, type Phase, type PhaseLevel, type Planner } from './facets'
import { editMilestone, editPhase } from './phaseKinds'
import { removeMilestone, removePhase } from './planEdit'
import { phasesOnRow, rowKey, rowOfPhase } from './planRows'
import { milestonesOf, moveMilestone, phaseLength, reflowRow, rowStart, type Moved } from './planSequence'
import { addDays } from './projection'

// What the plan's editors do to a row, each as one step that leaves the row dated again (from the row's start, else from `today`): add a phase or a section,
// change a length, pin or free a date, delete. Pure: each returns the planner as it is afterwards.

type Id = (prefix: string) => string

const reflow = (p: Planner, key: string, today: string): Planner => reflowRow(p, key, rowStart(p, key) ?? today)
const rowOf = (p: Planner, phaseId: string | null): string | null => { const ph = p.phases.find(x => x.id === phaseId); return ph ? rowOfPhase(ph) : null }

export const DEFAULT_NEW_DAYS = 14

// A new phase, last on a row (the first one of a row begins active).
export function addPhase(planner: Planner, row: { level: PhaseLevel; nodeId: string | null }, title: string, today: string, newId: Id): { planner: Planner; id: string } {
  const key = rowKey(row.level, row.nodeId)
  const mine = phasesOnRow(planner, key)
  const phase = newPhase(newId('phase'), title, {
    level: row.level, nodeId: row.level === 'project' ? null : row.nodeId, order: mine.reduce((n, p) => Math.max(n, p.order + 1), 0), lengthDays: DEFAULT_NEW_DAYS, status: mine.length === 0 ? 'active' : 'planned',
  })
  return { planner: reflow({ ...planner, phases: [...planner.phases, phase] }, key, today), id: phase.id }
}

// A new section, last in its phase.
export function addMilestone(planner: Planner, phaseId: string, title: string, today: string, newId: Id): { planner: Planner; id: string } {
  const phase = planner.phases.find(p => p.id === phaseId)
  if (!phase) return { planner, id: '' }
  const m = newMilestone(newId('ms'), title, { phaseId, order: milestonesOf(planner, phaseId).reduce((n, x) => Math.max(n, x.order + 1), 0) })
  return { planner: reflow({ ...planner, milestones: [...planner.milestones, m] }, rowOfPhase(phase), today), id: m.id }
}

// A phase made as long as given. A pinned phase keeps its start and moves its end; the rest of the row follows.
export function setPhaseLength(planner: Planner, id: string, days: number, today: string): Planner {
  const phase = planner.phases.find(p => p.id === id)
  if (!phase) return planner
  const length = Math.max(1, Math.min(3650, Math.round(days)))
  const patch: Partial<Phase> = { lengthDays: length }
  if (phase.fixed && phase.start) patch.end = addDays(phase.start, length - 1)
  return reflow(editPhase(planner, id, patch), rowOfPhase(phase), today)
}

// A phase's start set to a day: it is pinned there, and the rest of the row flows after it.
export function setPhaseStart(planner: Planner, id: string, date: string, today: string): Planner {
  const phase = planner.phases.find(p => p.id === id)
  if (!phase || !date) return planner
  const length = phaseLength(phase)
  return reflow(editPhase(planner, id, { start: date, end: addDays(date, length - 1), lengthDays: length, fixed: true }), rowOfPhase(phase), today)
}

// Pin a phase where it is, or let it flow again.
export function togglePhasePin(planner: Planner, id: string, today: string): Planner {
  const phase = planner.phases.find(p => p.id === id)
  if (!phase || (!phase.fixed && !phase.start)) return planner
  return reflow(editPhase(planner, id, { fixed: !phase.fixed }), rowOfPhase(phase), today)
}

export function setMilestoneLength(planner: Planner, id: string, days: number | null, today: string): Planner {
  const m = planner.milestones.find(x => x.id === id)
  if (!m) return planner
  const key = rowOf(planner, m.phaseId)
  const next = editMilestone(planner, id, { lengthDays: days === null ? null : Math.max(1, Math.min(3650, Math.round(days))) })
  return key ? reflow(next, key, today) : next
}

// A section's date set: it is pinned there, and the sections after it flow from it.
export function setMilestoneDate(planner: Planner, id: string, date: string | null, today: string): Planner {
  const m = planner.milestones.find(x => x.id === id)
  if (!m) return planner
  const key = rowOf(planner, m.phaseId)
  const next = editMilestone(planner, id, { date, fixed: !!date })
  return key ? reflow(next, key, today) : next
}

export function toggleMilestonePin(planner: Planner, id: string, today: string): Planner {
  const m = planner.milestones.find(x => x.id === id)
  if (!m || (!m.fixed && !m.date)) return planner
  const key = rowOf(planner, m.phaseId)
  const next = editMilestone(planner, id, { fixed: !m.fixed })
  return key ? reflow(next, key, today) : next
}

// A section one place earlier or later in its phase.
export function nudgeMilestone(planner: Planner, id: string, by: -1 | 1): Moved {
  const m = planner.milestones.find(x => x.id === id)
  if (!m?.phaseId) return { ok: false, reason: 'That milestone is on no phase.' }
  const at = milestonesOf(planner, m.phaseId).findIndex(x => x.id === id)
  const to = at + by
  if (at < 0 || to < 0 || to >= milestonesOf(planner, m.phaseId).length) return { ok: true, planner }
  return moveMilestone(planner, id, m.phaseId, to)
}

// A section taken out; nothing stays placed in it.
export function deleteMilestone(planner: Planner, id: string, today: string): Planner {
  const m = planner.milestones.find(x => x.id === id)
  const key = rowOf(planner, m?.phaseId ?? null)
  const next = removeMilestone(planner, id)
  return key ? reflow(next, key, today) : next
}

// A phase taken out with its sections; the work that was in them is let go, and the rest of the row closes up.
export function deletePhase(planner: Planner, id: string, today: string): Planner {
  const phase = planner.phases.find(p => p.id === id)
  if (!phase) return planner
  let next = planner
  for (const m of planner.milestones.filter(x => x.phaseId === id)) next = removeMilestone(next, m.id)
  const key = rowOfPhase(phase)
  // The row keeps the start it had (read before the phase went), so what follows moves up to take its place.
  return reflowRow(removePhase(next, id), key, rowStart(planner, key) ?? today)
}

export type { Milestone }
