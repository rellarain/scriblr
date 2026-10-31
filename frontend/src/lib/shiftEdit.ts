// Changing a shift that repeats, Outlook style: this occurrence only, this and the ones after it, or all of them. Returns the shifts that replace it.

import { addDays, daysBetween } from './projection'
import type { Facet, Shift } from './facets'

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
