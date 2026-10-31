import { describe, expect, it } from 'vitest'
import { migrateLegacy } from './legacySchedule'

describe('moving the old task list, routine list and word goals into the planner', () => {
  it('makes tasks into items, routines into daily routines, and the word goals into a draft goal', () => {
    const m = migrateLegacy(
      [{ id: 't1', label: 'Draft chapter 3', done: false }, { id: 't2', label: 'Email editor', done: true }],
      [{ id: 'r1', label: 'Morning pages', done: true }, { id: 'r2', label: 'Backup' }],
      { wordsPerDay: 500, wordsPerWeek: 3000 }, '2026-10-31',
    )!
    expect(m.planner.items.map(i => [i.id, i.label, i.doneOn])).toEqual([['t1', 'Draft chapter 3', null], ['t2', 'Email editor', '2026-10-31']])
    expect(m.planner.routines.map(r => [r.id, r.recurrence.kind, r.recurrence.anchor])).toEqual([['r1', 'daily', '2026-10-31'], ['r2', 'daily', '2026-10-31']])
    expect(m.ticked).toEqual(['r1'])
    expect(m.planner.goals).toEqual([expect.objectContaining({ facet: 'draft', scope: 'project', daily: 500, weekly: 3000, total: null })])
  })
  it('has nothing to move when there was nothing', () => {
    expect(migrateLegacy(undefined, undefined, undefined, '2026-10-31')).toBeNull()
    expect(migrateLegacy([], [], {}, '2026-10-31')).toBeNull()
    expect(migrateLegacy([{ id: 'x', label: '' }], [], undefined, '2026-10-31')).toBeNull()
  })
  it('moves just the goals when that is all there is', () => {
    const m = migrateLegacy([], [], { wordsPerDay: 250 }, '2026-10-31')!
    expect(m.planner.items).toEqual([])
    expect(m.planner.goals[0]).toMatchObject({ daily: 250, weekly: null })
  })
})
