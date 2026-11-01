import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { endReminderText, useShiftEndReminders } from './useShiftReminders'

const notes: Array<{ title: string; body?: string }> = []
class FakeNotification {
  static permission = 'granted'
  constructor(title: string, options?: { body?: string }) { notes.push({ title, body: options?.body }) }
}

beforeEach(() => {
  notes.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0)) // 10:00 AM, slot 60
  vi.stubGlobal('Notification', FakeNotification)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const shift = (pending: () => number, endSlot = 66) => ({ key: 's1', title: 'Morning draft', date: '2026-11-04', endSlot, pending })

describe('useShiftEndReminders', () => {
  it('says at the end of a shift how many tasks are not ticked off', () => {
    renderHook(() => useShiftEndReminders([shift(() => 2)], true, '2026-11-04'))
    vi.advanceTimersByTime(59 * 60_000)
    expect(notes).toEqual([])
    vi.advanceTimersByTime(61_000)
    expect(notes).toEqual([{ title: 'Morning draft is over', body: '2 tasks are not ticked off.' }])
  })

  it('counts the tasks when the shift ends, not when it was scheduled, and says nothing when all are ticked', () => {
    let pending = 3
    renderHook(() => useShiftEndReminders([shift(() => pending)], true, '2026-11-04'))
    pending = 0
    vi.advanceTimersByTime(61 * 60_000)
    expect(notes).toEqual([])
  })

  it('does nothing when reminders are off, for a shift that has ended or on another day', () => {
    renderHook(() => useShiftEndReminders([shift(() => 1)], false, '2026-11-04'))
    renderHook(() => useShiftEndReminders([shift(() => 1, 50)], true, '2026-11-04'))
    renderHook(() => useShiftEndReminders([{ ...shift(() => 1), date: '2026-11-05' }], true, '2026-11-04'))
    vi.advanceTimersByTime(24 * 3_600_000)
    expect(notes).toEqual([])
  })
})

describe('endReminderText', () => {
  it('says one task or several', () => {
    expect([endReminderText(1), endReminderText(4)]).toEqual(['1 task is not ticked off.', '4 tasks are not ticked off.'])
  })
})
