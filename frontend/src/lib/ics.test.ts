import { describe, expect, it } from 'vitest'
import { toIcs } from './ics'

const shift = { shiftId: 's1', date: '2026-10-26', title: 'Draft, ch. 12; polish', startSlot: 48, endSlot: 60, facet: 'draft' as const }
const at = new Date('2026-10-31T09:30:00Z')

describe('the iCalendar export', () => {
  it('makes a calendar with a floating-time event for each shift, text escaped', () => {
    const ics = toIcs([shift], [], at)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART:20261026T080000\r\n')
    expect(ics).toContain('DTEND:20261026T100000\r\n')
    expect(ics).toContain('SUMMARY:Draft\\, ch. 12\\; polish\r\n')
    expect(ics).toContain('UID:s1-2026-10-26@scriblr')
    expect(ics).toContain('DTSTAMP:20261031T093000Z')
    expect(ics).toContain('CATEGORIES:draft')
  })
  it('ends a shift that runs to midnight at the next day\'s midnight', () => {
    expect(toIcs([{ ...shift, startSlot: 132, endSlot: 144 }], [], at)).toContain('DTEND:20261027T000000')
  })
  it('lists a deadline as a whole-day event', () => {
    const ics = toIcs([], [{ date: '2027-03-01', title: 'Draft goal due' }], at)
    expect(ics).toContain('DTSTART;VALUE=DATE:20270301')
    expect(ics).toContain('DTEND;VALUE=DATE:20270302')
    expect(ics).toContain('SUMMARY:Draft goal due')
  })
  it('folds long lines at 75 characters', () => {
    const ics = toIcs([{ ...shift, title: 'x'.repeat(200) }], [], at)
    expect(ics.split('\r\n').every(l => l.length <= 75)).toBe(true)
    expect(ics).toContain('\r\n xxxxxxxx')
  })
})
