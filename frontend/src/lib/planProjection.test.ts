import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newPhase, newProcess, newTask, type Phase, type Planner, type Routine, type Shift } from './facets'
import { averages, capacityOf, DEFAULT_MINUTES, estimate, isDrafting, projectPlan, projectRow, remainingWork, routineDates, walk, wordsCheck } from './planProjection'
import { planRows } from './planRows'
import type { GoalProgress } from './projection'

// 2 November 2026 is a Monday. A shift is 10-minute slots: 54 to 66 is 9:00 to 11:00.
const TODAY = '2026-11-02'
const weekdays = { kind: 'weekly' as const, every: 1, unit: 'week' as const, days: [0, 1, 2, 3, 4], rangeMax: null, anchor: TODAY, until: null }
const shift = (id: string, over: Partial<Shift> = {}): Shift => ({
  id, title: id, facet: 'draft', date: TODAY, startSlot: 54, endSlot: 66, targetNodeId: null, targetTree: null, target: null, recurrence: weekdays, pauses: [], skipped: [], overrides: {}, ...over,
})
const routine = (id: string, over: Partial<Routine> = {}): Routine => ({
  id, label: id, facet: 'draft', targetNodeId: null, targetTree: null, shiftId: null, recurrence: { ...weekdays, kind: 'daily', every: 1, days: [] }, pauses: [], lastDone: null, ...over,
})
const plan = (over: Partial<Planner> = {}): Planner => ({ ...emptyPlanner(), shifts: [shift('s1')], ...over })

describe('averages', () => {
  it('are the mean of the work of each kind that has a time, and a default for a kind that has none', () => {
    const p = plan({
      items: [newTask('a', 'A', null, { estimateMinutes: 30 }), newTask('b', 'B', null, { estimateMinutes: 90 }), newTask('c', 'C', null)],
      exercises: [newExercise('e', 'E', { durationMinutes: 20 })],
    })
    expect(averages(p)).toEqual({ task: 60, process: DEFAULT_MINUTES, exercise: 20, routine: DEFAULT_MINUTES })
  })

  it('count the steps of a process, and the length of the shift a routine is on', () => {
    const p = plan({
      processes: [newProcess('p', 'P', { groups: [{ id: 'g', ordered: true, steps: [{ id: 's', label: 'S', estimateMinutes: 40, facet: null }, { id: 't', label: 'T', estimateMinutes: 20, facet: null }] }] })],
      routines: [routine('r', { shiftId: 's1' })],
    })
    expect(averages(p)).toMatchObject({ process: 60, routine: 120 })
  })
})

describe('routineDates', () => {
  it('are the days it comes round between two days, less the days paused and the rest days', () => {
    const r = routine('r', { pauses: [{ start: '2026-11-04', end: '2026-11-04' }] })
    expect(routineDates(r, '2026-11-02', '2026-11-06', [{ id: 'x', start: '2026-11-05', end: '2026-11-05', label: '' }])).toEqual(['2026-11-02', '2026-11-03', '2026-11-06'])
    expect(routineDates(r, '2026-11-06', '2026-11-02', [])).toEqual([])
  })

  it('come an interval after the last time it was done', () => {
    const r = routine('r', { lastDone: '2026-11-01', recurrence: { kind: 'interval', every: 3, unit: 'day', days: [], rangeMax: null, anchor: '2026-10-01', until: null } })
    expect(routineDates(r, '2026-11-02', '2026-11-12', [])).toEqual(['2026-11-04', '2026-11-07', '2026-11-10'])
  })
})

describe('remainingWork', () => {
  const base = (): Planner => plan({
    phases: [newPhase('ph', 'Draft', { start: '2026-11-02', end: '2026-11-20' })],
    milestones: [newMilestone('m', 'Act one', { phaseId: 'ph', date: '2026-11-06' })],
    items: [
      newTask('t1', 'Scene one', null, { milestoneId: 'm', estimateMinutes: 90, facet: 'draft' }),
      newTask('t2', 'Scene two', null, { milestoneId: 'm' }),
      newTask('t3', 'Done scene', null, { milestoneId: 'm', doneOn: '2026-11-01', estimateMinutes: 500 }),
    ],
  })

  it("adds a task's own time, the average where it has none, and nothing for work that is done", () => {
    const p = base()
    const work = remainingWork(p, 'm', TODAY)
    // (the average of the estimated tasks, the done one included, is (90 + 500) / 2)
    expect(work.map(w => [w.id, w.minutes])).toEqual([['t1', 90], ['t2', 295]])
  })

  it('counts a process by what is left of the tasks it made, or else by its steps', () => {
    const steps = [{ id: 's', label: 'S', estimateMinutes: 40, facet: null }, { id: 't', label: 'T', estimateMinutes: null, facet: null }]
    const p = { ...base(), items: [], processes: [newProcess('pr', 'Pr', { milestoneIds: ['m'], groups: [{ id: 'g', ordered: true, steps }] })] }
    expect(remainingWork(p, 'm', TODAY).map(w => [w.kind, w.minutes])).toEqual([['process', 40 + DEFAULT_MINUTES]])
    const made = { ...p, items: [newTask('a', 'A', null, { processId: 'pr', estimateMinutes: 25, doneOn: '2026-11-01' }), newTask('b', 'B', null, { processId: 'pr', estimateMinutes: 45 })] }
    expect(remainingWork(made, 'm', TODAY).map(w => w.minutes)).toEqual([45])
    const finished = { ...made, items: made.items.map(i => ({ ...i, doneOn: '2026-11-01' })) }
    expect(remainingWork(finished, 'm', TODAY)).toEqual([])
  })

  it('counts an exercise by its duration until it has been done since the phase began', () => {
    const p = { ...base(), items: [], exercises: [newExercise('e', 'E', { durationMinutes: 15, milestoneIds: ['m'], facets: ['draft'] })] }
    expect(remainingWork(p, 'm', TODAY).map(w => [w.kind, w.minutes, w.facet])).toEqual([['exercise', 15, 'draft']])
    expect(remainingWork({ ...p, exercises: [{ ...p.exercises[0], lastDone: '2026-11-03' }] }, 'm', TODAY)).toEqual([])
  })

  it("counts a routine's time every time it comes round before the milestone's date", () => {
    const p = { ...base(), items: [], routines: [routine('r', { milestoneId: 'm', shiftId: 's1' })] }
    // Daily, today to the 6th: five times, a shift of two hours each.
    expect(remainingWork(p, 'm', TODAY).map(w => [w.kind, w.minutes])).toEqual([['routine', 5 * 120]])
    // It is not "done" by having been done once: it still comes round.
    expect(remainingWork({ ...p, routines: [{ ...p.routines[0], lastDone: '2026-11-03' }] }, 'm', TODAY)[0].minutes).toBe(5 * 120)
  })
})

describe('capacityOf', () => {
  it('reads a week of time from the next four weeks of shifts, by facet, leaving out rest days', () => {
    const cap = capacityOf(plan({ shifts: [shift('s1'), shift('s2', { facet: 'revision', recurrence: { ...weekdays, days: [5] } })] }), TODAY)
    expect(cap.weekly(null)).toBe(5 * 120 + 120)
    expect(cap.weekly('draft')).toBe(600)
    expect(cap.weekly('revision')).toBe(120)
    expect(cap.weekly('plot')).toBe(0)
    const rest = capacityOf(plan({ restDays: [{ id: 'r', start: '2026-11-09', end: '2026-11-15', label: '' }] }), TODAY)
    expect(rest.weekly(null)).toBe((3 * 5 * 120) / 4)
  })

  it('counts a one-off shift in the next four weeks', () => {
    const cap = capacityOf(plan({ shifts: [shift('once', { recurrence: null, date: '2026-11-10' })] }), TODAY)
    expect(cap.weekly(null)).toBe(120 / 4)
  })

  it('takes only the shifts aimed at the nodes given, and all of them when none is aimed there in the next four weeks', () => {
    const p = plan({ shifts: [shift('s1'), shift('book', { targetNodeId: 'b1', recurrence: { ...weekdays, days: [0] } })] })
    expect(capacityOf(p, TODAY, new Set(['b1'])).weekly(null)).toBe(120)
    expect(capacityOf(p, TODAY, new Set(['other'])).weekly(null)).toBe(5 * 120 + 120)
  })
})

describe('walk', () => {
  const slots = [{ date: '2026-11-02', minutes: 120, facet: 'draft' as const }, { date: '2026-11-02', minutes: 60, facet: 'draft' as const }, { date: '2026-11-03', minutes: 120, facet: 'draft' as const }]
  it('goes through the shifts until the work is done, counting the shifts and the working days', () => {
    expect(walk(100, slots, TODAY)).toEqual({ finish: '2026-11-02', shifts: 1, days: 1 })
    expect(walk(250, slots, TODAY)).toEqual({ finish: '2026-11-03', shifts: 3, days: 2 })
    expect(walk(250, slots, '2026-11-03')).toEqual({ finish: null, shifts: 1, days: 1 })
    expect(walk(0, slots, TODAY)).toEqual({ finish: null, shifts: 0, days: 0 })
  })
})

describe('estimate', () => {
  const cap = capacityOf(plan(), TODAY)
  const work = (minutes: number, facet: 'draft' | 'plot' | null = null) => [{ kind: 'task' as const, id: 'w', label: 'w', facet, minutes }]

  it('is the time, the weeks of the scheduled week it needs, and the shifts and day it ends on', () => {
    expect(estimate(work(180), cap, TODAY)).toEqual({ minutes: 180, weeks: 0.3, days: 2, shifts: 2, finish: '2026-11-03', noShifts: false })
  })

  it('sets work of a facet against the shifts of that facet, so work with no shift of its own cannot be done', () => {
    const e = estimate(work(120, 'plot'), cap, TODAY)
    expect(e).toMatchObject({ weeks: null, finish: null, noShifts: false })
    expect(estimate(work(120, 'draft'), cap, TODAY).finish).toBe('2026-11-02')
  })

  it('says there is no time scheduled when there are no shifts, and nothing to do when there is no work', () => {
    expect(estimate(work(60), capacityOf(plan({ shifts: [] }), TODAY), TODAY)).toMatchObject({ weeks: null, finish: null, noShifts: true })
    expect(estimate([], cap, TODAY)).toEqual({ minutes: 0, weeks: 0, days: 0, shifts: 0, finish: null, noShifts: false })
  })
})

describe('projectRow', () => {
  const phase = (id: string, over: Partial<Phase> = {}): Phase => newPhase(id, id, { lengthDays: 7, ...over })
  const build = (over: Partial<Planner> = {}): Planner => plan({
    phases: [
      phase('a', { order: 0, start: '2026-11-02', end: '2026-11-06' }),
      phase('b', { order: 1, start: '2026-11-09', end: '2026-11-13' }),
    ],
    milestones: [newMilestone('ma1', 'A1', { phaseId: 'a', order: 0, date: '2026-11-04' }), newMilestone('ma2', 'A2', { phaseId: 'a', order: 1, date: '2026-11-06' }), newMilestone('mb', 'B1', { phaseId: 'b', date: '2026-11-13' })],
    items: [
      newTask('t1', 'T1', null, { milestoneId: 'ma1', estimateMinutes: 120, facet: 'draft' }),
      newTask('t2', 'T2', null, { milestoneId: 'ma2', estimateMinutes: 120, facet: 'draft' }),
      newTask('t3', 'T3', null, { milestoneId: 'mb', estimateMinutes: 240, facet: 'draft' }),
    ],
    ...over,
  })

  it('works through the milestones of a phase one after another, and the phases of a row one after another', () => {
    const r = projectRow(build(), 'project', TODAY, capacityOf(build(), TODAY))
    const a = r.phases[0]
    expect(a.milestones.map(m => [m.milestone.id, m.projection.start, m.projection.finish])).toEqual([['ma1', '2026-11-02', '2026-11-02'], ['ma2', '2026-11-03', '2026-11-03']])
    expect(a.projection).toMatchObject({ minutes: 240, finish: '2026-11-03', planned: '2026-11-06', verdict: 'ahead', diffDays: -3 })
    // Phase B is planned to start on the 9th, and its four hours are two shifts.
    expect(r.phases[1].projection).toMatchObject({ start: '2026-11-09', minutes: 240, finish: '2026-11-10', shifts: 2, verdict: 'ahead' })
    expect(r.projection).toMatchObject({ minutes: 480, finish: '2026-11-10', planned: '2026-11-13', start: '2026-11-02', shifts: 4 })
  })

  it('pushes the phase after one that runs late, and says behind by how many days', () => {
    const heavy = build({ items: [newTask('t1', 'T1', null, { milestoneId: 'ma1', estimateMinutes: 1200, facet: 'draft' }), ...build().items.slice(1)] })
    const r = projectRow(heavy, 'project', TODAY, capacityOf(heavy, TODAY))
    // Ten shifts for A1 (two weeks), then A2: A finishes on the 16th against the 6th; B follows.
    expect(r.phases[0].projection).toMatchObject({ finish: '2026-11-16', verdict: 'behind', diffDays: 10 })
    expect(r.phases[1].projection.start).toBe('2026-11-17')
    expect(r.phases[1].projection).toMatchObject({ finish: '2026-11-18', verdict: 'behind' })
    expect(r.projection.verdict).toBe('behind')
  })

  it('has no finish when there are no shifts, and leaves a done phase as it is', () => {
    const noShifts = build({ shifts: [] })
    const r = projectRow(noShifts, 'project', TODAY, capacityOf(noShifts, TODAY))
    expect(r.projection).toMatchObject({ finish: null, weeks: null, noShifts: true, verdict: null })
    const done = build({ phases: build().phases.map(p => (p.id === 'a' ? { ...p, status: 'done' as const } : p)) })
    const d = projectRow(done, 'project', TODAY, capacityOf(done, TODAY))
    expect(d.phases[0].projection).toMatchObject({ minutes: 0, finish: '2026-11-06' })
    expect(d.projection.minutes).toBe(240)
  })

  it('counts the work tagged with a phase and placed in no milestone', () => {
    const loose = build({ items: [...build().items, newTask('x', 'Loose', null, { phaseId: 'a', estimateMinutes: 60, facet: 'draft' })] })
    const r = projectRow(loose, 'project', TODAY, capacityOf(loose, TODAY))
    expect(r.phases[0].projection.minutes).toBe(300)
  })
})

describe('projectPlan', () => {
  it("gives each row its own phases, with the time of the shifts aimed at its own book (and its chapters), else all of the project's", () => {
    const rows = planRows([{ id: 'b1', kind: 'book', parentId: null, title: 'B' }, { id: 'c1', kind: 'chapter', parentId: 'b1', title: 'C' }], 'Saga')
    const p = plan({
      shifts: [shift('all'), shift('book', { targetNodeId: 'c1', recurrence: { ...weekdays, days: [3] } })],
      phases: [newPhase('proj', 'P', { start: TODAY, end: '2026-11-30' }), newPhase('bk', 'B', { level: 'book', nodeId: 'b1', start: TODAY, end: '2026-11-30' })],
      milestones: [newMilestone('mp', 'MP', { phaseId: 'proj' }), newMilestone('mb', 'MB', { phaseId: 'bk' })],
      items: [newTask('a', 'A', null, { milestoneId: 'mp', estimateMinutes: 240 }), newTask('b', 'B', null, { milestoneId: 'mb', estimateMinutes: 240 })],
    })
    const out = projectPlan(p, rows, TODAY)
    expect(out.get('project')?.projection).toMatchObject({ minutes: 240, finish: '2026-11-03' })
    // The book has the one shift aimed at its chapter, on Thursdays: two of them.
    expect(out.get('book:b1')?.projection).toMatchObject({ minutes: 240, finish: '2026-11-12', shifts: 2 })
  })
})

describe('drafting', () => {
  it('is a phase with work of the Draft facet in its milestones or tagged with it', () => {
    const p = plan({
      phases: [newPhase('d', 'Draft'), newPhase('r', 'Revise')],
      milestones: [newMilestone('m', 'M', { phaseId: 'd' })],
      items: [newTask('t', 'T', null, { milestoneId: 'm', facet: 'draft' }), newTask('u', 'U', null, { phaseId: 'r', facet: 'revision' })],
    })
    expect(isDrafting(p, 'd')).toBe(true)
    expect(isDrafting(p, 'r')).toBe(false)
  })

  it('reads the words left from the draft goal of the row, with the recent pace', () => {
    const goal = (scope: 'project' | 'book', nodeId: string | null, total: number): GoalProgress => ({
      goal: { id: 'g', facet: 'draft', scope, nodeId, kind: null, daily: null, weekly: null, total, deadline: null }, current: 30000, pct: 0, today: 0, week: 0, pace: 600, deadline: null, daysLeft: null, needed: null, finishes: '2027-02-01', status: null,
    })
    expect(wordsCheck([goal('project', null, 80000)], { level: 'project', nodeId: null })).toEqual({ left: 50000, total: 80000, pace: 600, finishes: '2027-02-01' })
    expect(wordsCheck([goal('book', 'b1', 50000)], { level: 'book', nodeId: 'b1' })?.left).toBe(20000)
    expect(wordsCheck([goal('book', 'b1', 50000)], { level: 'book', nodeId: 'b2' })).toBeNull()
    expect(wordsCheck([], { level: 'project', nodeId: null })).toBeNull()
  })
})
