import { describe, expect, it } from 'vitest'
import { buildActivityGrid, currentStreak } from './activityGrid'
import { anyFull, grow, resolve, shrink, stateOf, toggleIcon, withFull, type ConsoleStates } from './consoleStates'
import { parseReaderPath, readerPath } from './readerRoutes'

describe('reader routes', () => {
  it('opens the Nook at /read and at /read/nook', () => {
    expect(parseReaderPath('/read')).toEqual({ page: 'nook', console: null, bookId: null, chapter: null })
    expect(parseReaderPath('/read/')).toEqual({ page: 'nook', console: null, bookId: null, chapter: null })
    expect(parseReaderPath('/read/nook/analytics')).toEqual({ page: 'nook', console: 'analytics', bookId: null, chapter: null })
  })

  it('reads the library, a book and its pages', () => {
    expect(parseReaderPath('/read/library/catalog')).toMatchObject({ page: 'library', console: 'catalog' })
    expect(parseReaderPath('/read/book/cold-harbor')).toMatchObject({ page: 'book', bookId: 'cold-harbor', console: null })
    expect(parseReaderPath('/read/book/cold-harbor/bookcard')).toMatchObject({ page: 'book', console: 'bookcard' })
    expect(parseReaderPath('/read/book/cold-harbor/pages')).toMatchObject({ page: 'pages', bookId: 'cold-harbor', chapter: null })
    expect(parseReaderPath('/read/book/cold-harbor/pages/3')).toMatchObject({ page: 'pages', chapter: 3 })
    expect(parseReaderPath('/read/book/cold-harbor/pages/x')).toMatchObject({ page: 'pages', chapter: null })
  })

  it('falls back to the Nook for anything it does not know', () => {
    expect(parseReaderPath('/read/nope').page).toBe('nook')
    expect(parseReaderPath('/read/book').page).toBe('nook')
  })

  it('builds the path of a location, and parses it back', () => {
    const locs = [
      { page: 'nook' as const },
      { page: 'nook' as const, console: 'feed' },
      { page: 'library' as const },
      { page: 'library' as const, console: 'shelves' },
      { page: 'book' as const, bookId: 'a b', console: 'bookface' },
      { page: 'pages' as const, bookId: 'x', chapter: 4 },
    ]
    for (const loc of locs) {
      const parsed = parseReaderPath(readerPath(loc))
      expect(parsed.page).toBe(loc.page)
      expect(parsed.bookId ?? null).toBe('bookId' in loc ? loc.bookId : null)
      expect(parsed.console ?? null).toBe('console' in loc ? loc.console : null)
    }
    expect(readerPath({ page: 'nook' })).toBe('/read')
    expect(readerPath({ page: 'book' })).toBe('/read/library') // a book page needs a book
  })
})

describe('console states', () => {
  const ids = ['a', 'b', 'c']
  const defaults: ConsoleStates = { a: 'tile', b: 'tile' }

  it('defaults to the page\'s own tiles, the rest icons, and keeps what the reader changed', () => {
    expect(resolve(ids, {}, defaults)).toEqual({ a: 'tile', b: 'tile', c: 'min' })
    expect(stateOf({ c: 'full' }, defaults, 'c')).toBe('full')
  })

  it('opens an icon as a tile, and minimizes an open console', () => {
    expect(toggleIcon({ a: 'tile', b: 'tile', c: 'min' }, 'c')).toEqual({ a: 'tile', b: 'tile', c: 'tile' })
    expect(toggleIcon({ a: 'tile', b: 'tile', c: 'tile' }, 'c')).toEqual({ a: 'tile', b: 'tile', c: 'min' })
  })

  it('steps a full console down to a tile when another icon opens', () => {
    expect(toggleIcon({ a: 'full', b: 'min', c: 'min' }, 'b')).toEqual({ a: 'tile', b: 'tile', c: 'min' })
  })

  it('opens a tile full and shrinks the others to icons, then steps down with the chevron', () => {
    const full = grow({ a: 'tile', b: 'tile', c: 'min' }, 'b')
    expect(full).toEqual({ a: 'min', b: 'full', c: 'min' })
    expect(anyFull(full)).toBe(true)
    expect(shrink(full, 'b')).toEqual({ a: 'min', b: 'tile', c: 'min' })
    expect(shrink({ a: 'tile', b: 'min', c: 'min' }, 'a')).toEqual({ a: 'min', b: 'min', c: 'min' })
  })

  it('opens the console a URL names as the full one', () => {
    expect(withFull(ids, { a: 'tile', b: 'tile', c: 'min' }, 'c')).toEqual({ a: 'min', b: 'min', c: 'full' })
    expect(withFull(ids, { a: 'tile', b: 'tile', c: 'min' }, 'zzz')).toEqual({ a: 'tile', b: 'tile', c: 'min' })
    expect(withFull(ids, { a: 'tile', b: 'tile', c: 'min' }, null)).toEqual({ a: 'tile', b: 'tile', c: 'min' })
  })
})

describe('the activity calendar', () => {
  const TODAY = '2026-10-11' // a Sunday

  it('is 53 weeks of 7 days, Sunday first, ending on the week that holds today', () => {
    const grid = buildActivityGrid({}, TODAY)
    expect(grid.cells).toHaveLength(53 * 7)
    expect(grid.cells[53 * 7 - 1].level).toBe(-1) // the last Saturday has not come
    expect(grid.cells[53 * 7 - 7].date).toBe(TODAY)
    expect(grid.cells[0].date).toBe('2025-10-12')
    expect(new Date(`${grid.cells[0].date}T00:00:00Z`).getUTCDay()).toBe(0)
  })

  it('labels a month at its first week, once', () => {
    const grid = buildActivityGrid({}, TODAY)
    expect(grid.months[0]).toEqual({ label: 'Oct', col: 1 })
    expect(grid.months.map(m => m.label)).toEqual(['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
  })

  it('shades a day by its share of the busiest day, and totals the year', () => {
    const grid = buildActivityGrid(
      { '2026-10-08': { pages: 52, minutes: 60, sessions: 1 }, '2026-10-07': { pages: 13, minutes: 20, sessions: 1 }, '2026-10-06': { pages: 30, minutes: 40, sessions: 2 } },
      TODAY,
    )
    const level = (date: string) => grid.cells.find(c => c.date === date)?.level
    expect(level('2026-10-08')).toBe(4)
    expect(level('2026-10-07')).toBe(1)
    expect(level('2026-10-06')).toBe(3)
    expect(level('2026-10-05')).toBe(0)
    expect(grid.total).toBe(95)
    expect(grid.activeDays).toBe(3)
    expect(grid.cells.find(c => c.date === '2026-10-08')?.title).toBe('52 pages on Oct 8')
    expect(buildActivityGrid({ '2026-10-08': { pages: 1, minutes: 7, sessions: 2 } }, TODAY, 'minutes').total).toBe(7)
  })

  it('ignores days older than the calendar', () => {
    expect(buildActivityGrid({ '2024-01-01': { pages: 9, minutes: 9, sessions: 1 } }, TODAY).total).toBe(0)
  })

  it('counts the streak that is still going, without breaking on a day not read yet', () => {
    const read = { pages: 5, minutes: 10, sessions: 1 }
    expect(currentStreak({ '2026-10-10': read, '2026-10-09': read, '2026-10-07': read }, TODAY)).toBe(2)
    expect(currentStreak({ '2026-10-11': read, '2026-10-10': read }, TODAY)).toBe(2)
    expect(currentStreak({}, TODAY)).toBe(0)
  })
})
