// The Schedule's week timeline: where a shift sits in its day, how shifts that overlap share the width, what a drag changes, and how each 10-minute
// interval of a shift that has passed went (done when its facet logged something in it, missed when not).

import { SLOTS_PER_DAY, type ActivityEvent, type Facet } from './facets'
import type { ShiftOccurrence } from './recurrence'

export const MIN_SHIFT_SLOTS = 3
export const clampSlot = (slot: number): number => Math.max(0, Math.min(SLOTS_PER_DAY, Math.round(slot)))

// Overlapping shifts go side by side: each gets a lane and the number of lanes in its cluster.
export function layoutLanes<T extends { startSlot: number; endSlot: number }>(items: T[]): Array<T & { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.startSlot - b.startSlot || a.endSlot - b.endSlot)
  const out: Array<T & { lane: number; lanes: number }> = []
  let cluster: Array<T & { lane: number; lanes: number }> = []
  let clusterEnd = -1
  const close = () => { for (const c of cluster) c.lanes = Math.max(1, ...cluster.map(x => x.lane + 1)); out.push(...cluster); cluster = [] }
  for (const item of sorted) {
    if (cluster.length && item.startSlot >= clusterEnd) { close(); clusterEnd = -1 }
    const taken = new Set(cluster.filter(c => c.endSlot > item.startSlot).map(c => c.lane))
    let lane = 0
    while (taken.has(lane)) lane += 1
    cluster.push({ ...item, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, item.endSlot)
  }
  close()
  return out
}

export type DragMode = 'move' | 'top' | 'bottom'

// A drag of `dSlots` 10-minute steps (and `dDays` whole days, for a move) on a shift that runs from start to end.
export function dragResult(mode: DragMode, start: number, end: number, dSlots: number): { startSlot: number; endSlot: number } {
  const length = end - start
  if (mode === 'move') {
    const s = Math.max(0, Math.min(SLOTS_PER_DAY - length, start + dSlots))
    return { startSlot: s, endSlot: s + length }
  }
  if (mode === 'top') return { startSlot: Math.max(0, Math.min(end - MIN_SHIFT_SLOTS, start + dSlots)), endSlot: end }
  return { startSlot: start, endSlot: Math.min(SLOTS_PER_DAY, Math.max(start + MIN_SHIFT_SLOTS, end + dSlots)) }
}

// The range a drag across empty time made, never shorter than MIN_SHIFT_SLOTS.
export function rangeOf(a: number, b: number): { startSlot: number; endSlot: number } {
  const startSlot = clampSlot(Math.min(a, b))
  return { startSlot, endSlot: Math.min(SLOTS_PER_DAY, Math.max(startSlot + MIN_SHIFT_SLOTS, clampSlot(Math.max(a, b)) + 1)) }
}

export type IntervalState = 'done' | 'missed' | 'pending' | 'unknown'

// How each slot of a shift occurrence went. Events are only kept for a while: an occurrence older than that is `unknown`.
export function intervalStates(o: Pick<ShiftOccurrence, 'date' | 'startSlot' | 'endSlot' | 'facet'>, events: ActivityEvent[], today: string, nowSlot: number, keptFrom: string): IntervalState[] {
  const logged = new Set(events.filter(e => e.date === o.date && e.facet === (o.facet as Facet)).map(e => e.slot))
  const out: IntervalState[] = []
  for (let s = o.startSlot; s < o.endSlot; s += 1) {
    const passed = o.date < today || (o.date === today && s < nowSlot)
    out.push(logged.has(s) ? 'done' : !passed ? 'pending' : o.date < keptFrom ? 'unknown' : 'missed')
  }
  return out
}

export type ShiftStatus = 'upcoming' | 'inProgress' | 'done' | 'partly' | 'missed' | 'past'
export function shiftStatus(states: IntervalState[], o: Pick<ShiftOccurrence, 'date' | 'startSlot' | 'endSlot'>, today: string, nowSlot: number): ShiftStatus {
  if (o.date > today || (o.date === today && o.startSlot > nowSlot)) return 'upcoming'
  if (states.every(s => s === 'unknown')) return 'past'
  if (o.date === today && o.endSlot > nowSlot) return 'inProgress'
  const done = states.filter(s => s === 'done').length
  return done === 0 ? 'missed' : done === states.length ? 'done' : 'partly'
}
