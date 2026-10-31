// The header ribbon: 144 ten-minute slots of today. A slot with activity is shaded by how today's events in it compare with the usual (the average of
// the last 28 days' events in that slot, per facet): higher, about the same, or lower. A scheduled slot still to come is `sched`; a scheduled slot that
// has passed is `missed` when its shift's own facet logged nothing in it. The slot the clock is in is `now`. Everything else is idle (collapsed).

import { FACETS, SLOTS_PER_DAY, type Facet, type RibbonData } from './facets'
import type { ShiftOccurrence } from './recurrence'

export type SlotKind = 'idle' | 'low' | 'avg' | 'high' | 'sched' | 'missed' | 'now'
export const HIGHER_THAN = 1.25
export const LOWER_THAN = 0.75
const RANK: Record<'low' | 'avg' | 'high', number> = { low: 1, avg: 2, high: 3 }

export function activityLevel(today: Record<Facet, number[]>, average: Record<Facet, number[]>, slot: number): 'low' | 'avg' | 'high' | null {
  let best: 'low' | 'avg' | 'high' | null = null
  for (const f of FACETS) {
    const n = today[f]?.[slot] ?? 0
    if (n <= 0) continue
    const usual = average[f]?.[slot] ?? 0
    const ratio = usual > 0 ? n / usual : Infinity
    const level = ratio > HIGHER_THAN ? 'high' : ratio < LOWER_THAN ? 'low' : 'avg'
    if (best === null || RANK[level] > RANK[best]) best = level
  }
  return best
}

export function ribbonSlots(data: RibbonData | null, shifts: ShiftOccurrence[], nowSlot: number): SlotKind[] {
  const slots: SlotKind[] = Array.from({ length: SLOTS_PER_DAY }, () => 'idle')
  for (let i = 0; i < SLOTS_PER_DAY; i += 1) {
    const level = data ? activityLevel(data.today, data.average, i) : null
    const mine = shifts.filter(s => i >= s.startSlot && i < s.endSlot)
    // Activity in any facet shows as work; a scheduled slot with none at all, so none in its shift's facet either, is missed once it has passed.
    if (level) slots[i] = level
    else if (mine.length) slots[i] = i > nowSlot || !data ? 'sched' : 'missed'
  }
  if (nowSlot >= 0 && nowSlot < SLOTS_PER_DAY) slots[nowSlot] = 'now'
  return slots
}

export const slotOfDate = (d: Date): number => Math.floor((d.getHours() * 60 + d.getMinutes()) / 10)
