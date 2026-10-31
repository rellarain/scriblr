// Shifts and deadlines as an iCalendar (.ics) file, to open in another calendar app. One-way and offline: the events are floating local times, so they
// stay at the same clock time wherever the file is opened.

import type { ShiftOccurrence } from './recurrence'

const pad = (n: number): string => String(n).padStart(2, '0')
const stamp = (date: string, slot: number): string => {
  const total = slot * 10
  return `${date.replace(/-/g, '')}T${pad(Math.floor(total / 60) % 24)}${pad(total % 60)}00`
}
// Text values escape backslash, semicolon, comma and newline; lines longer than 75 octets fold onto the next with a leading space.
const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ` ${rest.slice(74)}` }
  out.push(rest)
  return out.join('\r\n')
}

export interface IcsDeadline { date: string; title: string }

export function toIcs(shifts: Array<Pick<ShiftOccurrence, 'shiftId' | 'date' | 'title' | 'startSlot' | 'endSlot' | 'facet'>>, deadlines: IcsDeadline[], now: Date = new Date()): string {
  const made = `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Scriblr//Schedule//EN', 'CALSCALE:GREGORIAN']
  for (const s of shifts) {
    const end = s.endSlot >= 144 ? { date: new Date(Date.parse(`${s.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), slot: 0 } : { date: s.date, slot: s.endSlot }
    lines.push('BEGIN:VEVENT', `UID:${s.shiftId}-${s.date}@scriblr`, `DTSTAMP:${made}`, `DTSTART:${stamp(s.date, s.startSlot)}`, `DTEND:${stamp(end.date, end.slot)}`, `SUMMARY:${esc(s.title)}`, `CATEGORIES:${esc(s.facet)}`, 'END:VEVENT')
  }
  deadlines.forEach((d, i) => {
    const next = new Date(Date.parse(`${d.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `UID:deadline-${d.date}-${i}@scriblr`, `DTSTAMP:${made}`, `DTSTART;VALUE=DATE:${d.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${esc(d.title)}`, 'END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
