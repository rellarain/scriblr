import { newMilestone, newPhase, type Milestone, type Phase, type PhaseKind, type PhaseLevel, type Planner } from './facets'
import { removeMilestone } from './planEdit'
import { phasesOnRow, rowKey, rowOfPhase } from './planRows'
import { milestonesOf, phaseLength, reflowRow, rowStart } from './planSequence'

// A kind of phase is a recipe for one that comes round (a Revision pass): a result, a length and the milestones along it. A new pass starts from it, and a pass
// follows the kind in every field it has not changed itself (`overrides` names the ones it has). Each pass is its own card, with its own dates, status and work.
// Pure: each returns the planner as it is afterwards.

type Id = (prefix: string) => string

export const PHASE_KIND_FIELDS = ['title', 'result', 'description', 'lengthDays'] as const
export const MILESTONE_KIND_FIELDS = ['title', 'result', 'lengthDays'] as const
export type PhaseKindField = (typeof PHASE_KIND_FIELDS)[number]
export type MilestoneKindField = (typeof MILESTONE_KIND_FIELDS)[number]

// "Revision 2": a pass's place among the passes of its kind on its row, 1 for the first. Phases of no kind have none.
export function passNumbers(planner: Planner): Map<string, number> {
  const out = new Map<string, number>()
  const seen = new Map<string, number>()
  for (const p of [...planner.phases].sort((a, b) => a.order - b.order)) {
    if (!p.kindId) continue
    const k = `${rowOfPhase(p)}|${p.kindId}`
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    out.set(p.id, n)
  }
  return out
}

const nextOrder = (planner: Planner, key: string): number => phasesOnRow(planner, key).reduce((n, p) => Math.max(n, p.order + 1), 0)
// A row is dated from its start, else from `today` when one is given.
const reflow = (planner: Planner, key: string, today: string | null = null): Planner => reflowRow(planner, key, rowStart(planner, key) ?? today)

// A new pass of a kind, last on a row: its result, description and length from the kind, and a section for each of the kind's milestones.
export function newPass(planner: Planner, kind: PhaseKind, row: { level: PhaseLevel; nodeId: string | null }, newId: Id, today: string | null = null): Planner {
  const key = rowKey(row.level, row.nodeId)
  const phase = newPhase(newId('phase'), kind.title, { result: kind.result, description: kind.description, lengthDays: kind.lengthDays, level: row.level, nodeId: row.level === 'project' ? null : row.nodeId, kindId: kind.id, order: nextOrder(planner, key) })
  const milestones = kind.milestones.map((km, i) => newMilestone(newId('ms'), km.title, { result: km.result, lengthDays: km.lengthDays, phaseId: phase.id, order: i, kindMilestoneId: km.id }))
  return reflow({ ...planner, phases: [...planner.phases, phase], milestones: [...planner.milestones, ...milestones] }, key, today)
}

const sameValue = (a: unknown, b: unknown): boolean => (a ?? null) === (b ?? null)

// A phase edited. A field of a pass that differs from its kind is marked as its own (so a later edit of the kind leaves it be); one set back to the kind's value follows again.
export function editPhase(planner: Planner, id: string, patch: Partial<Phase>): Planner {
  return {
    ...planner,
    phases: planner.phases.map(p => {
      if (p.id !== id) return p
      const next = { ...p, ...patch }
      const kind = planner.phaseKinds.find(k => k.id === p.kindId)
      if (!kind) return next
      let overrides = p.overrides
      for (const f of PHASE_KIND_FIELDS) {
        if (!(f in patch)) continue
        overrides = sameValue(next[f], kind[f]) ? overrides.filter(x => x !== f) : [...new Set([...overrides, f])]
      }
      return { ...next, overrides }
    }),
  }
}

export function editMilestone(planner: Planner, id: string, patch: Partial<Milestone>): Planner {
  return {
    ...planner,
    milestones: planner.milestones.map(m => {
      if (m.id !== id) return m
      const next = { ...m, ...patch }
      const phase = planner.phases.find(p => p.id === m.phaseId)
      const km = planner.phaseKinds.find(k => k.id === phase?.kindId)?.milestones.find(x => x.id === m.kindMilestoneId)
      if (!km) return next
      let overrides = m.overrides
      for (const f of MILESTONE_KIND_FIELDS) {
        if (!(f in patch)) continue
        overrides = sameValue(next[f], km[f]) ? overrides.filter(x => x !== f) : [...new Set([...overrides, f])]
      }
      return { ...next, overrides }
    }),
  }
}

// A field of a pass put back to what its kind says.
export function resetPhaseField(planner: Planner, id: string, field: PhaseKindField): Planner {
  const phase = planner.phases.find(p => p.id === id)
  const kind = planner.phaseKinds.find(k => k.id === phase?.kindId)
  if (!phase || !kind) return planner
  return editPhase(planner, id, { [field]: kind[field] } as Partial<Phase>)
}

export function resetMilestoneField(planner: Planner, id: string, field: MilestoneKindField): Planner {
  const m = planner.milestones.find(x => x.id === id)
  const phase = planner.phases.find(p => p.id === m?.phaseId)
  const km = planner.phaseKinds.find(k => k.id === phase?.kindId)?.milestones.find(x => x.id === m?.kindMilestoneId)
  if (!m || !km) return planner
  return editMilestone(planner, id, { [field]: km[field] } as Partial<Milestone>)
}

// A kind saved, and every pass brought along in the fields it has not changed: its title, result, description and length, and its sections (a section the kind
// gained is added to each pass; one it lost is taken out, with whatever was placed in it let go). Each row that holds a pass is re-dated.
export function syncKind(planner: Planner, kind: PhaseKind, today: string | null = null): Planner {
  const exists = planner.phaseKinds.some(k => k.id === kind.id)
  let next: Planner = { ...planner, phaseKinds: exists ? planner.phaseKinds.map(k => (k.id === kind.id ? kind : k)) : [...planner.phaseKinds, kind] }
  const passes = next.phases.filter(p => p.kindId === kind.id)
  const rows = new Set(passes.map(rowOfPhase))
  for (const pass of passes) {
    const follow = (f: PhaseKindField): Partial<Phase> => (pass.overrides.includes(f) ? {} : ({ [f]: kind[f] } as Partial<Phase>))
    const patch = { ...follow('title'), ...follow('result'), ...follow('description'), ...follow('lengthDays') }
    next = { ...next, phases: next.phases.map(p => (p.id === pass.id ? { ...p, ...patch } : p)) }
    const have = milestonesOf(next, pass.id)
    for (const m of have) if (m.kindMilestoneId && !kind.milestones.some(km => km.id === m.kindMilestoneId)) next = removeMilestone(next, m.id)
    kind.milestones.forEach((km, i) => {
      const mine = next.milestones.find(m => m.phaseId === pass.id && m.kindMilestoneId === km.id)
      if (!mine) { next = { ...next, milestones: [...next.milestones, newMilestone(`${pass.id}-${km.id}`, km.title, { result: km.result, lengthDays: km.lengthDays, phaseId: pass.id, order: i, kindMilestoneId: km.id })] }; return }
      const f = (field: MilestoneKindField): Partial<Milestone> => (mine.overrides.includes(field) ? {} : ({ [field]: km[field] } as Partial<Milestone>))
      next = { ...next, milestones: next.milestones.map(m => (m.id === mine.id ? { ...m, ...f('title'), ...f('result'), ...f('lengthDays'), order: i } : m)) }
    })
  }
  for (const key of rows) next = reflow(next, key, today)
  return next
}

// A kind taken away: its passes stay, as plain phases.
export function removeKind(planner: Planner, id: string): Planner {
  const passes = new Set(planner.phases.filter(p => p.kindId === id).map(p => p.id))
  return {
    ...planner,
    phaseKinds: planner.phaseKinds.filter(k => k.id !== id),
    phases: planner.phases.map(p => (p.kindId === id ? { ...p, kindId: null, overrides: [] } : p)),
    milestones: planner.milestones.map(m => (m.phaseId && passes.has(m.phaseId) ? { ...m, kindMilestoneId: null, overrides: [] } : m)),
  }
}

// A phase copied onto a row as a plain card (no kind): the same result, length and sections, planned, undone, with none of the work in it. Last on the row.
function stamp(planner: Planner, source: Phase, row: { level: PhaseLevel; nodeId: string | null }, keepKind: boolean, newId: Id): Planner {
  const key = rowKey(row.level, row.nodeId)
  const copy: Phase = {
    ...source, id: newId('phase'), level: row.level, nodeId: row.level === 'project' ? null : row.nodeId, status: 'planned', start: null, end: null, fixed: false,
    order: nextOrder(planner, key), kindId: keepKind ? source.kindId : null, overrides: keepKind ? source.overrides : [],
  }
  const sections = milestonesOf(planner, source.id).map((m, i) => ({ ...m, id: newId('ms'), phaseId: copy.id, date: null, done: false, doneOn: null, fixed: false, order: i, kindMilestoneId: keepKind ? m.kindMilestoneId : null, overrides: keepKind ? m.overrides : [] }))
  return { ...planner, phases: [...planner.phases, copy], milestones: [...planner.milestones, ...sections] }
}

// Repeat: the phase again, next in its own row.
export function repeatPhase(planner: Planner, id: string, newId: Id, today: string | null = null): Planner {
  const phase = planner.phases.find(p => p.id === id)
  if (!phase) return planner
  const key = rowOfPhase(phase)
  return reflow(stamp(planner, phase, { level: phase.level, nodeId: phase.nodeId }, false, newId), key, today)
}

// Apply to all: the phase stamped onto each of the rows given (a phase already on one of them is not stamped there again), still a pass of its kind.
export function applyToRows(planner: Planner, id: string, rows: Array<{ level: PhaseLevel; nodeId: string | null }>, newId: Id, today: string | null = null): Planner {
  const phase = planner.phases.find(p => p.id === id)
  if (!phase) return planner
  let next = planner
  for (const row of rows) {
    const key = rowKey(row.level, row.nodeId)
    if (key === rowOfPhase(phase)) continue
    next = reflow(stamp(next, phase, row, true, newId), key, today)
  }
  return next
}

// A phase kept as a kind: its result, description, length and sections become the recipe, and the phase becomes the first pass of it.
export function kindFromPhase(planner: Planner, phaseId: string, newId: Id): { planner: Planner; kind: PhaseKind } | null {
  const phase = planner.phases.find(p => p.id === phaseId)
  if (!phase) return null
  const sections = milestonesOf(planner, phaseId)
  const recipe = sections.map(m => ({ id: newId('km'), title: m.title, result: m.result, lengthDays: m.lengthDays }))
  const kind: PhaseKind = { id: newId('kind'), title: phase.title, result: phase.result, description: phase.description, lengthDays: phaseLength(phase), milestones: recipe }
  const link = new Map(sections.map((m, i) => [m.id, recipe[i].id]))
  return {
    kind,
    planner: {
      ...planner,
      phaseKinds: [...planner.phaseKinds, kind],
      phases: planner.phases.map(p => (p.id === phaseId ? { ...p, kindId: kind.id, overrides: [], lengthDays: kind.lengthDays } : p)),
      milestones: planner.milestones.map(m => (link.has(m.id) ? { ...m, kindMilestoneId: link.get(m.id) as string, overrides: [] } : m)),
    },
  }
}
