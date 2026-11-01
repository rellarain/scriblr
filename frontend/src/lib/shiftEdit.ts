// Changing a shift that repeats, Outlook style: this occurrence only, this and the ones after it, or all of them. Returns the shifts that replace it.

import { addDays, daysBetween } from './projection'
import { SLOTS_PER_DAY, type Facet, type PlanItem, type Shift } from './facets'
import { MIN_SHIFT_SLOTS } from './timeline'

export type EditScope = 'this' | 'following' | 'all'
export interface ShiftPatch {
  title?: string
  facet?: Facet
  date?: string // the day the occurrence is moved to
  startSlot?: number
  endSlot?: number
  target?: number | null
  targetNodeId?: string | null
  targetTree?: 'outline' | 'plot' | null
}

function apply(shift: Shift, patch: ShiftPatch): Shift {
  const { date: _date, ...rest } = patch
  return { ...shift, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) }
}

// Moving the whole pattern by `delta` days moves its weekdays with it.
function moveBy(shift: Shift, delta: number): Shift {
  if (delta === 0 || !shift.recurrence) return shift
  const r = shift.recurrence
  return {
    ...shift, date: addDays(shift.date, delta),
    recurrence: { ...r, anchor: addDays(r.anchor, delta), days: r.kind === 'weekly' ? r.days.map(d => (((d + delta) % 7) + 7) % 7) : r.days },
  }
}

export function editShift(shift: Shift, occurrence: string, patch: ShiftPatch, scope: EditScope, id: () => string): Shift[] {
  const to = patch.date ?? occurrence
  const delta = daysBetween(occurrence, to)
  if (!shift.recurrence) return [{ ...apply(shift, patch), date: to }]
  const rec = shift.recurrence
  if (scope === 'all' || occurrence <= rec.anchor) return [moveBy(apply(shift, patch), delta)]
  if (scope === 'this') {
    if (delta === 0) {
      const o = shift.overrides[occurrence] ?? {}
      const next = { ...o, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.startSlot !== undefined ? { startSlot: patch.startSlot } : {}), ...(patch.endSlot !== undefined ? { endSlot: patch.endSlot } : {}) }
      // The rest of the patch (facet, target, item) is the pattern's, not a day's: it applies to the whole.
      return [{ ...apply({ ...shift, overrides: { ...shift.overrides, [occurrence]: next } }, { facet: patch.facet, target: patch.target, targetNodeId: patch.targetNodeId, targetTree: patch.targetTree }) }]
    }
    const lone: Shift = { ...apply(shift, patch), id: id(), date: to, recurrence: null, pauses: [], skipped: [], overrides: {} }
    return [{ ...shift, skipped: [...shift.skipped, occurrence] }, lone]
  }
  // following: the pattern ends the day before, and a new one carries on from here, changed.
  const head: Shift = { ...shift, recurrence: { ...rec, until: addDays(occurrence, -1) } }
  const after = (days: string[]) => days.filter(d => d >= occurrence).map(d => addDays(d, delta))
  const tail = moveBy({
    ...apply(shift, patch), id: id(), date: occurrence, recurrence: { ...rec, anchor: occurrence, until: rec.until },
    skipped: after(shift.skipped),
    overrides: Object.fromEntries(Object.entries(shift.overrides).filter(([d]) => d >= occurrence).map(([d, o]) => [addDays(d, delta), o])),
  }, delta)
  return [head, tail]
}

const PATCH_KEYS: Array<keyof ShiftPatch> = ['title', 'facet', 'date', 'startSlot', 'endSlot', 'target', 'targetNodeId', 'targetTree']

// What the panel changed: the fields of the shift as edited that differ from the shift as it was opened (so a change to one field never writes the others
// into a day's overrides, where they would hide a later change to the whole pattern).
export function diffPatch(base: Shift, edited: Shift): ShiftPatch {
  const out: Record<string, unknown> = {}
  for (const k of PATCH_KEYS) if (edited[k] !== base[k]) out[k] = edited[k]
  return out as ShiftPatch
}

// How long a task takes, in 10-minute slots: its estimate rounded up, else an hour.
export const slotsForTask = (item: PlanItem): number => Math.max(MIN_SHIFT_SLOTS, Math.min(SLOTS_PER_DAY, item.estimateMinutes ? Math.ceil(item.estimateMinutes / 10) : 6))

// A shift for a task dropped on an empty slot of a day: its name, its facet (a draft shift when it has none), its node, and as long as its estimate.
export function shiftForTask(item: PlanItem, id: string, date: string, slot: number): Shift {
  const length = slotsForTask(item)
  const startSlot = Math.max(0, Math.min(SLOTS_PER_DAY - length, slot))
  return {
    id, title: item.label, facet: item.facet ?? 'draft', date, startSlot, endSlot: startSlot + length,
    targetNodeId: item.targetNodeId, targetTree: item.targetTree, target: null, recurrence: null, pauses: [], skipped: [], overrides: {},
  }
}
