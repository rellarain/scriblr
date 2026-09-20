import { describe, expect, it } from 'vitest'
import { fullDate, latestOf, shortDate } from './chapterDates'

describe('chapter dates', () => {
  it('formats a short date and a full date with time', () => {
    expect(shortDate('2026-09-19T15:30:00Z', 'en-US')).toMatch(/^Sep 19, 2026$|^Sep 20, 2026$/)
    expect(fullDate('2026-09-19T15:30:00Z', 'en-US')).toMatch(/2026/)
  })

  it('gives nothing for a missing or invalid date', () => {
    expect(shortDate('nope')).toBe('')
    expect(fullDate('')).toBe('')
  })

  it('picks the newest timestamp and ignores blanks', () => {
    expect(latestOf(['2026-01-01T00:00:00Z', null, '2026-03-01T00:00:00Z', undefined, 'bad', '2026-02-01T00:00:00Z']))
      .toBe('2026-03-01T00:00:00Z')
    expect(latestOf([null, undefined])).toBeNull()
  })
})
