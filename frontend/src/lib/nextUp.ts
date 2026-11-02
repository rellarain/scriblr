import type { ShiftOccurrence } from './recurrence'
import { daysBetween } from './projection'

// The shift to point at in the Agenda: the one running now, else the next to start (today or after).

export type NextUp<T extends ShiftOccurrence> =
  | { kind: 'running'; occ: T; minutes: number }
  | { kind: 'next'; occ: T; minutes: number; days: number }

// `minutes` is what is left of a running shift, or the time until a next one starts; `days` is how many days away (0 = today).
export function nextUp<T extends ShiftOccurrence>(occs: T[], today: string, nowSlot: number): NextUp<T> | null {
  const sorted = [...occs].sort((a, b) => a.date.localeCompare(b.date) || a.startSlot - b.startSlot)
  const running = sorted.find(o => o.date === today && o.startSlot <= nowSlot && nowSlot < o.endSlot)
  if (running) return { kind: 'running', occ: running, minutes: (running.endSlot - nowSlot) * 10 }
  const next = sorted.find(o => o.date > today || (o.date === today && o.startSlot > nowSlot))
  if (!next) return null
  const days = daysBetween(today, next.date)
  return { kind: 'next', occ: next, days, minutes: days * 1440 + (next.startSlot - nowSlot) * 10 }
}

// 5 min, 2 h, 1 h 30 min, 3 days.
export function durationText(minutes: number): string {
  if (minutes >= 2880) return `${Math.round(minutes / 1440)} days`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}
