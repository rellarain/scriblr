import { useEffect, useRef } from 'react'
import { slotTime } from '../../../../lib/facets'

// Desktop notifications for today's shifts: a few minutes before each one that has yet to start, and at the end of each that ends with tasks still unticked.
// Nothing is asked of the system until reminders are turned on (`requestReminderPermission`, from the settings); without permission, or where there are no
// notifications, nothing happens.

export interface Remindable { title: string; date: string; startSlot: number }
export interface Endable { key: string; title: string; date: string; endSlot: number; pending: () => number }

export async function requestReminderPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

export const endReminderText = (pending: number): string => (pending === 1 ? '1 task is not ticked off.' : `${pending} tasks are not ticked off.`)

export function useShiftReminders(shifts: Remindable[], lead: number | null, today: string, now: () => Date = () => new Date()): void {
  const key = shifts.map(s => `${s.date}${s.startSlot}${s.title}`).join('|')
  useEffect(() => {
    if (lead === null || typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const at = now()
    for (const s of shifts) {
      if (s.date !== today) continue
      const start = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, s.startSlot * 10)
      const wait = start.getTime() - lead * 60_000 - at.getTime()
      if (wait < 0 || wait > 24 * 3_600_000) continue
      timers.push(setTimeout(() => { new Notification(s.title, { body: `Starts at ${slotTime(s.startSlot)}` }) }, wait))
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lead, today])
}

// At the end of each of today's shifts, a notification if it has tasks that are not ticked off (counted when the shift ends, not when it was scheduled).
export function useShiftEndReminders(shifts: Endable[], enabled: boolean, today: string, now: () => Date = () => new Date()): void {
  const latest = useRef(shifts)
  latest.current = shifts
  const key = shifts.map(s => `${s.key}${s.date}${s.endSlot}`).join('|')
  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const at = now()
    for (const s of latest.current) {
      if (s.date !== today) continue
      const end = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, s.endSlot * 10)
      const wait = end.getTime() - at.getTime()
      if (wait <= 0 || wait > 24 * 3_600_000) continue
      timers.push(setTimeout(() => {
        const pending = latest.current.find(x => x.key === s.key && x.date === s.date)?.pending() ?? 0
        if (pending > 0) new Notification(`${s.title} is over`, { body: endReminderText(pending) })
      }, wait))
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, today])
}
