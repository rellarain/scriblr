import { describe, expect, it } from 'vitest'
import { isToday, newestFirst, nextSetting, nextSnapshot, sameValue, todayUtc } from './logUndo'

const NOW = new Date('2026-10-10T20:00:00Z')
const e = (id: string, createdAt: string) => ({ id, createdAt })
// newest first
const LOG = [e('c', '2026-10-10T19:00:00Z'), e('b', '2026-10-10T09:00:00Z'), e('a', '2026-10-09T23:59:00Z')]

describe('the day', () => {
  it('is the UTC date', () => {
    expect(todayUtc(NOW)).toBe('2026-10-10')
    expect(isToday('2026-10-10T00:00:01Z', NOW)).toBe(true)
    expect(isToday('2026-10-09T23:59:59Z', NOW)).toBe(false)
  })

  it('sorts newest first', () => {
    expect(newestFirst([LOG[2], LOG[0], LOG[1]]).map(x => x.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('nextSnapshot', () => {
  it('goes back one entry at a time, as far as the state before the first change of today', () => {
    expect(nextSnapshot(LOG, null, NOW)?.id).toBe('b') // from c (today) to b
    expect(nextSnapshot(LOG, 'b', NOW)?.id).toBe('a') // from b (today): the state before today's first change
    expect(nextSnapshot(LOG, 'a', NOW)).toBeNull() // a is not from today: stop
  })

  it('has nothing to go back to with one entry, or when the newest is from an earlier day', () => {
    expect(nextSnapshot([LOG[0]], null, NOW)).toBeNull()
    expect(nextSnapshot([LOG[2], e('z', '2026-10-08T00:00:00Z')], null, NOW)).toBeNull()
    expect(nextSnapshot([], null, NOW)).toBeNull()
  })

  it('keeps its place when saves add entries on top', () => {
    const grown = [e('d', '2026-10-10T19:30:00Z'), ...LOG]
    expect(nextSnapshot(grown, 'b', NOW)?.id).toBe('a')
    expect(nextSnapshot(grown, 'gone', NOW)).toBeNull()
  })
})

describe('nextSetting', () => {
  it('undoes the changes of today newest first, and none from an earlier day', () => {
    expect(nextSetting(LOG, null, NOW)?.id).toBe('c')
    expect(nextSetting(LOG, 'c', NOW)?.id).toBe('b')
    expect(nextSetting(LOG, 'b', NOW)).toBeNull() // a is from yesterday
    expect(nextSetting([], null, NOW)).toBeNull()
  })

  it('keeps its place when a save adds an entry on top', () => {
    const grown = [e('d', '2026-10-10T19:30:00Z'), ...LOG]
    expect(nextSetting(grown, 'c', NOW)?.id).toBe('b')
    expect(nextSetting(grown, 'unknown', NOW)).toBeNull()
  })
})

describe('sameValue', () => {
  it('compares by content', () => {
    expect(sameValue({ a: [1] }, { a: [1] })).toBe(true)
    expect(sameValue({ a: [1] }, { a: [2] })).toBe(false)
  })
})
