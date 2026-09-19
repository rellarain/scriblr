import { describe, expect, it } from 'vitest'
import {
  TIME_PRESETS, compareTimeValues, formatClock, formatTime, hasTime, pruneTimeValue, standardSystem, systemForBook, timeChanged, type TimeValue,
} from './timeSystem'

const preset = (key: string) => TIME_PRESETS.find(p => p.key === key)!.build()

describe('formatClock', () => {
  it('uses a 12-hour clock', () => {
    expect(formatClock(0)).toBe('12:00 AM')
    expect(formatClock(570)).toBe('9:30 AM')
    expect(formatClock(720)).toBe('12:00 PM')
    expect(formatClock(1439)).toBe('11:59 PM')
  })
})

describe('formatTime', () => {
  it('reads the standard system as a date and time', () => {
    const s = standardSystem()
    expect(formatTime(s, { year: 1024, month: 2, day: 9, time: 570 })).toBe('March 9, 1024 · 9:30 AM')
    expect(formatTime(s, { month: 2, day: 9 })).toBe('March 9')
    expect(formatTime(s, { year: 1024 })).toBe('1024')
    expect(formatTime(s, { time: 1080 })).toBe('6:00 PM')
    expect(formatTime(s, {})).toBe('')
    expect(formatTime(s, undefined)).toBe('')
  })

  it('lists each set unit for other systems', () => {
    expect(formatTime(preset('weeks'), { week: 3, day: 2 })).toBe('Week 3, Day 2')
    expect(formatTime(preset('weeks'), { day: 2 })).toBe('Day 2')
    expect(formatTime(preset('seasons'), { year: 12, season: 2, day: 5 })).toBe('Year 12, Autumn, Day 5')
    expect(formatTime(preset('storyDays'), { day: 1, time: 810 })).toBe('Day 1, 1:30 PM')
  })
})

describe('compareTimeValues', () => {
  const s = standardSystem()

  it('compares units from largest to smallest', () => {
    expect(compareTimeValues(s, { year: 1, month: 5 }, { year: 2, month: 0 })).toBe(-1)
    expect(compareTimeValues(s, { year: 2, month: 0 }, { year: 1, month: 5 })).toBe(1)
    expect(compareTimeValues(s, { year: 1, month: 2, day: 9 }, { year: 1, month: 2, day: 10 })).toBe(-1)
    expect(compareTimeValues(s, { year: 1, month: 2, day: 9, time: 600 }, { year: 1, month: 2, day: 9, time: 570 })).toBe(1)
    expect(compareTimeValues(s, { year: 1, day: 3 }, { year: 1, day: 3 })).toBe(0)
  })

  it('sorts a blank unit after any value', () => {
    expect(compareTimeValues(s, { year: 1 }, { year: 1, month: 0 })).toBe(1)
    expect(compareTimeValues(s, { year: 1, month: 0 }, { year: 1 })).toBe(-1)
    expect(compareTimeValues(s, undefined, { year: 1 })).toBe(1)
  })

  it('orders whole weeks before later days', () => {
    const weeks = preset('weeks')
    const values: TimeValue[] = [{ week: 4, day: 1 }, { week: 3, day: 5 }, { week: 3, day: 2 }, { week: 4 }]
    values.sort((a, b) => compareTimeValues(weeks, a, b))
    expect(values).toEqual([{ week: 3, day: 2 }, { week: 3, day: 5 }, { week: 4, day: 1 }, { week: 4 }])
  })
})

describe('timeChanged / hasTime / prune', () => {
  it('detects a different value regardless of key order', () => {
    expect(timeChanged({ day: 1, time: 5 }, { time: 5, day: 1 })).toBe(false)
    expect(timeChanged({ day: 1 }, { day: 2 })).toBe(true)
    expect(timeChanged({ day: 1 }, undefined)).toBe(true)
    expect(timeChanged(undefined, {})).toBe(false)
  })

  it('knows when a value is empty', () => {
    expect(hasTime(undefined)).toBe(false)
    expect(hasTime({})).toBe(false)
    expect(hasTime({ day: 0 })).toBe(true)
  })

  it('drops units a system no longer has', () => {
    expect(pruneTimeValue(preset('weeks'), { week: 1, day: 2, time: 60 })).toEqual({ week: 1, day: 2 })
  })
})

describe('systemForBook', () => {
  const systems = [standardSystem(), preset('weeks')]
  it('uses the book\'s system, else the first', () => {
    expect(systemForBook(systems, { timeSystemId: 'weeks' }).id).toBe('weeks')
    expect(systemForBook(systems, { timeSystemId: 'gone' }).id).toBe('standard')
    expect(systemForBook(systems, { timeSystemId: null }).id).toBe('standard')
    expect(systemForBook(systems, undefined).id).toBe('standard')
    expect(systemForBook([], undefined).id).toBe('standard')
  })
})
