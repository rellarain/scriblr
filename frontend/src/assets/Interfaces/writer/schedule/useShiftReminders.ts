import { useEffect } from 'react'
import { slotTime } from '../../../../lib/facets'

// A desktop notification a few minutes before each of today's shifts that has yet to start. Nothing is asked of the system until reminders are turned
// on (`requestReminderPermission`, from the settings); without permission, or where there are no notifications, nothing happens.

export interface Remindable { title: string; date: string; startSlot: number }

export async function requestReminderPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

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
