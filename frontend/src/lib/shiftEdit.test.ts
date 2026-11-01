import { describe, expect, it } from 'vitest'
import { newTask, type Shift } from './facets'
import { diffPatch, editShift, shiftForTask, slotsForTask } from './shiftEdit'
import { shiftOccurrences } from './recurrence'

const weekdays: Shift = {
  id: 's1', title: 'Draft', facet: 'draft', date: '2026-10-05', startSlot: 48, endSlot: 60, targetNodeId: null, targetTree: null, target: 800,
  recurrence: { kind: 'weekly', every: 1, unit: 'day', days: [0, 1, 2, 3, 4], rangeMax: null, anchor: '2026-10-05', until: null },
  pauses: [], skipped: [], overrides: {},
}
let n = 0
const id = () => `new${++n}`
const days = (shifts: Shift[], to = '2026-10-16') => shiftOccurrences(shifts, [], '2026-10-05', to).map(o => `${o.date}@${o.startSlot}`)

describe('editing a shift that repeats', () => {
  it('this occurrence: a day\'s own time, the rest unchanged', () => {
    const out = editShift(weekdays, '2026-10-07', { startSlot: 54, endSlot: 66 }, 'this', id)
    expect(out).toHaveLength(1)
    expect(days(out, '2026-10-08')).toEqual(['2026-10-05@48', '2026-10-06@48', '2026-10-07@54', '2026-10-08@48'])
  })
  it('this occurrence moved to another day: the day is skipped and a one-off holds the new one', () => {
    const out = editShift(weekdays, '2026-10-07', { date: '2026-10-10', startSlot: 60, endSlot: 72 }, 'this', id)
    expect(out).toHaveLength(2)
    expect(out[0].skipped).toEqual(['2026-10-07'])
    expect(out[1]).toMatchObject({ date: '2026-10-10', startSlot: 60, endSlot: 72, recurrence: null })
    expect(out[1].id).not.toBe(weekdays.id)
    expect(days(out, '2026-10-12')).not.toContain('2026-10-07@48')
    expect(days(out, '2026-10-12')).toContain('2026-10-10@60')
  })
  it('this and the following: the pattern stops the day before and a changed one carries on', () => {
    const out = editShift(weekdays, '2026-10-12', { startSlot: 72, endSlot: 84, title: 'Evening draft' }, 'following', id)
    expect(out).toHaveLength(2)
    expect(out[0].recurrence?.until).toBe('2026-10-11')
    expect(days(out)).toEqual(['2026-10-05@48', '2026-10-06@48', '2026-10-07@48', '2026-10-08@48', '2026-10-09@48', '2026-10-12@72', '2026-10-13@72', '2026-10-14@72', '2026-10-15@72', '2026-10-16@72'])
    expect(out[1].title).toBe('Evening draft')
    expect(out[0].title).toBe('Draft')
  })
  it('following, moved a day on: the weekdays move with it, and later skips and changes go along', () => {
    const base = { ...weekdays, skipped: ['2026-10-14'], overrides: { '2026-10-15': { startSlot: 54 } } }
    const out = editShift(base, '2026-10-12', { date: '2026-10-13' }, 'following', id)
    expect(out[1].recurrence?.days).toEqual([1, 2, 3, 4, 5]) // Tue to Sat
    expect(out[1].skipped).toEqual(['2026-10-15'])
    expect(out[1].overrides).toEqual({ '2026-10-16': { startSlot: 54 } })
    expect(out[1].date).toBe('2026-10-13')
  })
  it('all of them: the times change everywhere, and moving a day moves the whole pattern', () => {
    const times = editShift(weekdays, '2026-10-07', { startSlot: 40, endSlot: 52 }, 'all', id)
    expect(days(times, '2026-10-06')).toEqual(['2026-10-05@40', '2026-10-06@40'])
    const moved = editShift(weekdays, '2026-10-07', { date: '2026-10-08' }, 'all', id)
    expect(moved[0].recurrence?.days).toEqual([1, 2, 3, 4, 5])
    expect(moved[0].recurrence?.anchor).toBe('2026-10-06')
  })
  it('the first occurrence of a pattern is always the whole pattern', () => {
    const out = editShift(weekdays, '2026-10-05', { title: 'Morning pages' }, 'following', id)
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Morning pages')
    expect(out[0].recurrence?.until).toBeNull()
  })
  it('a shift that does not repeat is changed in place, and moved by date', () => {
    const once: Shift = { ...weekdays, recurrence: null }
    const out = editShift(once, '2026-10-05', { date: '2026-10-09', startSlot: 50 }, 'this', id)
    expect(out).toEqual([{ ...once, date: '2026-10-09', startSlot: 50 }])
  })
})

describe('diffPatch', () => {
  it('holds only the fields that changed, so a day override never carries the others', () => {
    expect(diffPatch(weekdays, { ...weekdays, title: 'Evening', endSlot: 66 })).toEqual({ title: 'Evening', endSlot: 66 })
    expect(diffPatch(weekdays, { ...weekdays })).toEqual({})
    expect(diffPatch(weekdays, { ...weekdays, target: null })).toEqual({ target: null })
  })
})

describe('shiftForTask', () => {
  it('makes a one-off shift for a task at the slot it was dropped on, as long as its estimate', () => {
    const task = newTask('t', 'Revise ch 3', null, { facet: 'plot', estimateMinutes: 45, targetNodeId: 'n', targetTree: 'outline' })
    expect(slotsForTask(task)).toBe(5)
    expect(shiftForTask(task, 'new', '2026-11-04', 54)).toMatchObject({ id: 'new', title: 'Revise ch 3', facet: 'plot', date: '2026-11-04', startSlot: 54, endSlot: 59, targetNodeId: 'n', targetTree: 'outline', recurrence: null })
  })
  it('is an hour of drafting without an estimate or a facet, and stays inside the day', () => {
    const task = newTask('t', 'Plain', null)
    expect(slotsForTask(task)).toBe(6)
    expect(shiftForTask(task, 'new', '2026-11-04', 143)).toMatchObject({ facet: 'draft', startSlot: 138, endSlot: 144 })
    expect(slotsForTask(newTask('t', 'Quick', null, { estimateMinutes: 5 }))).toBe(3) // never shorter than a shift can be
  })
})
