import { describe, expect, it } from 'vitest'
import { emptyPlanner, newTask, type Planner, type Shift } from './facets'
import { carryForward, endedItems } from './carryForward'

const carriedIds = (p: Planner, today: string, nowSlot: number) => endedItems(p, today, nowSlot).map(e => e.item.id)

const shift = (over: Partial<Shift>): Shift => ({
  id: 's', title: 'Write', facet: 'draft', date: '2026-11-03', startSlot: 54, endSlot: 66, targetNodeId: null, targetTree: null, target: null,
  recurrence: null, pauses: [], skipped: [], overrides: {}, ...over,
})
const planner = (shifts: Shift[], shiftId = 's', doneOn: string | null = null): Planner => ({
  ...emptyPlanner(), shifts, items: [newTask('a', 'A', null, { shiftId, doneOn }), newTask('b', 'B', null, { priority: 'high' })],
})

describe('carryForward', () => {
  it('sends the undone tasks of a one-off shift on an earlier day back to the backlog, marked carried', () => {
    const out = carryForward(planner([shift({})]), '2026-11-04', 0)
    expect(out.items[0]).toMatchObject({ shiftId: null, carried: true })
    expect(out.items[1].carried).toBe(false)
  })
  it('waits for the shift to end on its own day', () => {
    const p = planner([shift({})])
    expect(carriedIds(p, '2026-11-03', 65)).toEqual([])
    expect(carriedIds(p, '2026-11-03', 66)).toEqual(['a'])
  })
  it('leaves a shift that is still to come, and a task that is done', () => {
    expect(carriedIds(planner([shift({ date: '2026-11-09' })]), '2026-11-04', 0)).toEqual([])
    expect(carriedIds(planner([shift({})], 's', '2026-11-03'), '2026-11-04', 0)).toEqual([])
  })
  it('never moves a task off a repeating shift', () => {
    const rec = { kind: 'daily' as const, every: 1, unit: 'day' as const, days: [], rangeMax: null, anchor: '2026-11-01', until: null }
    expect(carriedIds(planner([shift({ recurrence: rec })]), '2026-11-04', 0)).toEqual([])
  })
  it('carries the tasks of a skipped one-off shift', () => {
    expect(carriedIds(planner([shift({ date: '2026-11-09', skipped: ['2026-11-09'] })]), '2026-11-04', 0)).toEqual(['a'])
  })
  it('marks a task ticked on the day of its shift done that day instead of carrying it', () => {
    const out = carryForward(planner([shift({})]), '2026-11-04', 0, (date, id) => date === '2026-11-03' && id === 'a')
    expect(out.items[0]).toMatchObject({ shiftId: 's', doneOn: '2026-11-03', carried: false })
  })
  it('returns the same planner when there is nothing to carry', () => {
    const p = planner([shift({ date: '2026-11-09' })])
    expect(carryForward(p, '2026-11-04', 0)).toBe(p)
  })
})
