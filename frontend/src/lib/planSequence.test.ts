import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newPhase, newProcess, newTask, type Milestone, type Phase, type Planner } from './facets'
import { milestonesOf, moveMilestone, movePhase, phaseLength, placeWork, placedIn, reflowRow, rowStart } from './planSequence'

const plan = (phases: Phase[], milestones: Milestone[] = [], over: Partial<Planner> = {}): Planner => ({ ...emptyPlanner(), phases, milestones, ...over })
const dates = (p: Planner) => p.phases.map(x => [x.id, x.start, x.end])

describe('phaseLength', () => {
  it('is its length, else the days between its dates, else a fortnight', () => {
    expect(phaseLength(newPhase('a', 'A', { lengthDays: 5, start: '2026-11-01', end: '2026-11-30' }))).toBe(5)
    expect(phaseLength(newPhase('a', 'A', { start: '2026-11-01', end: '2026-11-10' }))).toBe(10)
    expect(phaseLength(newPhase('a', 'A', { start: '2026-11-01' }))).toBe(1)
    expect(phaseLength(newPhase('a', 'A'))).toBe(14)
  })
})

describe('reflowRow', () => {
  it("dates a row's phases one after another from the start, each as long as it is", () => {
    const p = plan([newPhase('a', 'A', { order: 0, lengthDays: 10 }), newPhase('b', 'B', { order: 1, lengthDays: 5 }), newPhase('c', 'C', { order: 2 })])
    expect(dates(reflowRow(p, 'project', '2026-11-01'))).toEqual([['a', '2026-11-01', '2026-11-10'], ['b', '2026-11-11', '2026-11-15'], ['c', '2026-11-16', '2026-11-29']])
  })

  it('leaves a pinned phase where it is, and a done one, and flows the rest after them', () => {
    const p = plan([
      newPhase('a', 'A', { order: 0, lengthDays: 3 }),
      newPhase('pin', 'Pin', { order: 1, lengthDays: 4, fixed: true, start: '2026-11-20', end: '2026-11-23' }),
      newPhase('b', 'B', { order: 2, lengthDays: 2 }),
      newPhase('done', 'Done', { order: 3, status: 'done', start: '2026-10-01', end: '2026-10-05' }),
      newPhase('c', 'C', { order: 4, lengthDays: 2 }),
    ])
    expect(dates(reflowRow(p, 'project', '2026-11-01'))).toEqual([
      ['a', '2026-11-01', '2026-11-03'], ['pin', '2026-11-20', '2026-11-23'], ['b', '2026-11-24', '2026-11-25'], ['done', '2026-10-01', '2026-10-05'], ['c', '2026-10-06', '2026-10-07'],
    ])
  })

  it('does not touch other rows, and gives nothing a date without a start', () => {
    const p = plan([newPhase('a', 'A'), newPhase('b', 'B', { level: 'book', nodeId: 'b1', start: '2026-12-01', end: '2026-12-03' })])
    expect(dates(reflowRow(p, 'project', null))).toEqual([['a', null, null], ['b', '2026-12-01', '2026-12-03']])
    expect(dates(reflowRow(p, 'project', '2026-11-01'))[1]).toEqual(['b', '2026-12-01', '2026-12-03'])
  })

  it("dates a phase's milestones across its days: lengths first, the rest shared, the last one ending with the phase", () => {
    const p = plan(
      [newPhase('a', 'A', { lengthDays: 10 })],
      [newMilestone('m1', 'One', { phaseId: 'a', order: 0, lengthDays: 4 }), newMilestone('m2', 'Two', { phaseId: 'a', order: 1 }), newMilestone('m3', 'Three', { phaseId: 'a', order: 2 })],
    )
    const out = reflowRow(p, 'project', '2026-11-01')
    expect(milestonesOf(out, 'a').map(m => m.date)).toEqual(['2026-11-04', '2026-11-07', '2026-11-10'])
  })

  it('holds a pinned milestone and flows the others around it', () => {
    const p = plan(
      [newPhase('a', 'A', { lengthDays: 10 })],
      [newMilestone('m1', 'One', { phaseId: 'a', order: 0, fixed: true, date: '2026-11-03' }), newMilestone('m2', 'Two', { phaseId: 'a', order: 1 })],
    )
    expect(milestonesOf(reflowRow(p, 'project', '2026-11-01'), 'a').map(m => m.date)).toEqual(['2026-11-03', '2026-11-10'])
  })
})

describe('rowStart', () => {
  it("is the project's start, else the day the row's first phase starts", () => {
    const p = plan([newPhase('a', 'A', { start: '2026-12-05' }), newPhase('b', 'B', { start: '2026-12-01' })])
    expect(rowStart(p, 'project')).toBe('2026-12-01')
    expect(rowStart({ ...p, timelineStart: '2026-11-01' }, 'project')).toBe('2026-11-01')
    expect(rowStart(plan([]), 'project')).toBeNull()
  })
})

describe('movePhase', () => {
  it('puts a phase in a place in its row and re-dates the row', () => {
    const p = plan([newPhase('a', 'A', { order: 0, lengthDays: 2, start: '2026-11-01', end: '2026-11-02' }), newPhase('b', 'B', { order: 1, lengthDays: 5 }), newPhase('c', 'C', { order: 2, lengthDays: 1 })])
    const r = movePhase(p, 'c', 0)
    expect(r.ok && r.planner.phases.map(x => [x.id, x.order, x.start])).toEqual([['a', 1, '2026-11-02'], ['b', 2, '2026-11-04'], ['c', 0, '2026-11-01']])
  })

  it('says so for a phase that is gone', () => {
    expect(movePhase(plan([]), 'x', 0)).toEqual({ ok: false, reason: 'That phase is gone.' })
  })
})

describe('moveMilestone', () => {
  const p = plan(
    [newPhase('a', 'A', { lengthDays: 6 }), newPhase('b', 'B', { order: 1, lengthDays: 6 }), newPhase('book', 'Bk', { level: 'book', nodeId: 'b1', lengthDays: 6 })],
    [newMilestone('m1', 'One', { phaseId: 'a', order: 0 }), newMilestone('m2', 'Two', { phaseId: 'a', order: 1 }), newMilestone('free', 'Free')],
  )

  it('reorders within a phase, and moves to another phase on the same row', () => {
    const within = moveMilestone(p, 'm2', 'a', 0)
    expect(within.ok && milestonesOf(within.planner, 'a').map(m => m.id)).toEqual(['m2', 'm1'])
    const across = moveMilestone(p, 'm1', 'b', 0)
    expect(across.ok && across.planner.milestones.find(m => m.id === 'm1')?.phaseId).toBe('b')
  })

  it('refuses a phase on another row, and takes a milestone that is on no phase anywhere', () => {
    const r = moveMilestone(p, 'm1', 'book', 0)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/own row/)
    expect(moveMilestone(p, 'free', 'book', 0).ok).toBe(true)
  })
})

describe('placeWork', () => {
  const base = plan(
    [newPhase('a', 'A'), newPhase('book', 'Bk', { level: 'book', nodeId: 'b1' })],
    [newMilestone('m1', 'One', { phaseId: 'a' }), newMilestone('m2', 'Two', { phaseId: 'a' }), newMilestone('bm', 'Book one', { phaseId: 'book' })],
    { items: [newTask('t', 'T', null)], processes: [newProcess('pr', 'Pr')], exercises: [newExercise('ex', 'Ex')] },
  )

  it('places a task in a milestone, tagging its phase, and moves it to another milestone of the row', () => {
    const placed = placeWork(base, 'task', 't', 'm1')
    expect(placed.ok && placed.planner.items[0]).toMatchObject({ milestoneId: 'm1', phaseId: 'a' })
    const moved = placed.ok ? placeWork(placed.planner, 'task', 't', 'm2') : placed
    expect(moved.ok && moved.planner.items[0].milestoneId).toBe('m2')
  })

  it('refuses to move work that is placed to a milestone on another row, but places what is not placed anywhere', () => {
    const placed = placeWork(base, 'task', 't', 'm1')
    const refused = placed.ok ? placeWork(placed.planner, 'task', 't', 'bm') : placed
    expect(refused.ok).toBe(false)
    expect(placeWork(base, 'task', 't', 'bm').ok).toBe(true)
  })

  it('puts a process or an exercise in several milestones, and moves it from one to another', () => {
    const one = placeWork(base, 'process', 'pr', 'm1')
    const two = one.ok ? placeWork(one.planner, 'process', 'pr', 'm2') : one
    expect(two.ok && two.planner.processes[0]).toMatchObject({ milestoneIds: ['m1', 'm2'], phaseIds: ['a'] })
    expect(placedIn(two.ok ? two.planner : base, 'process', 'pr')).toEqual(['m1', 'm2'])
    const across = two.ok ? placeWork(two.planner, 'process', 'pr', 'bm', 'm1') : two
    expect(across.ok).toBe(false)
    const shifted = two.ok ? placeWork(two.planner, 'process', 'pr', 'm2', 'm1') : two
    expect(shifted.ok && shifted.planner.processes[0].milestoneIds).toEqual(['m2'])
    expect(placeWork(base, 'exercise', 'ex', 'm1').ok).toBe(true)
  })

  it('takes work out of its milestone', () => {
    const placed = placeWork(base, 'task', 't', 'm1')
    const out = placed.ok ? placeWork(placed.planner, 'task', 't', null) : placed
    expect(out.ok && out.planner.items[0].milestoneId).toBeNull()
  })
})
