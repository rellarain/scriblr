import type { ActivityEvent, Facet } from './facets'
import { COUNTED } from './taskProgress'

// How far a shift got: what its facet logged inside the shift's slots on its day (words written, nodes added, flags resolved), against its aim.

export interface ShiftProgress { done: number; aim: number; pct: number }

export function shiftProgress(o: { date: string; startSlot: number; endSlot: number; facet: Facet; target: number | null }, events: ActivityEvent[]): ShiftProgress | null {
  if (!o.target) return null
  let sum = 0
  for (const e of events) {
    if (e.date !== o.date || e.facet !== o.facet || e.action !== COUNTED[o.facet] || e.slot < o.startSlot || e.slot >= o.endSlot) continue
    sum += o.facet === 'draft' ? e.amount : Math.max(0, e.amount)
  }
  const done = Math.max(0, sum)
  return { done, aim: o.target, pct: Math.min(1, done / o.target) }
}
