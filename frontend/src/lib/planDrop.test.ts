import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newProcess, newTask, type Process, type Routine } from './facets'
import { DAY_DROP_SLOT, dropExercise, dropProcess, dropRoutine, isLocked, processTasks } from './planDrop'

const ids = () => { let n = 0; return () => `id${++n}` }
const step = (id: string, label: string, estimateMinutes: number | null = null) => ({ id, label, estimateMinutes, facet: null })
const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1', label: 'Export a backup', facet: 'project', targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: null,
  recurrence: { kind: 'weekly', every: 1, unit: 'week', days: [0, 3], rangeMax: null, anchor: '2026-09-01', until: '2027-01-01' }, ...over,
})
const revise = (): Process => newProcess('pr', 'Revise a chapter', {
  facets: ['revision', 'draft'], phaseIds: ['ph'], requiredMilestoneIds: ['m'],
  groups: [{ id: 'g1', ordered: true, steps: [step('s1', 'Reread', 30), step('s2', 'Mark', 20)] }, { id: 'g2', ordered: false, steps: [step('s3', 'Fix dialogue', 40), step('s4', 'Fix pacing', 10)] }],
})
const ready = () => ({ ...emptyPlanner(), milestones: [newMilestone('m', 'Outline locked', { done: true })] })

describe('dropRoutine', () => {
  it('makes a shift that repeats as the routine does, from the day it was dropped on, and puts the routine on it', () => {
    const r = dropRoutine({ ...emptyPlanner(), routines: [routine()] }, routine(), { date: '2026-11-04', slot: 54 }, ids())
    if (!r.ok) throw new Error('refused')
    const shift = r.planner.shifts[0]
    expect(shift).toMatchObject({ title: 'Export a backup', facet: 'project', date: '2026-11-04', startSlot: 54, endSlot: 60 })
    expect(shift.recurrence).toMatchObject({ kind: 'weekly', days: [0, 3], anchor: '2026-11-04', until: '2027-01-01' })
    expect(r.planner.routines[0].shiftId).toBe(shift.id)
  })

  it('makes a one-off shift for a routine that comes round after an interval, which a shift cannot', () => {
    const rec = { kind: 'interval' as const, every: 7, unit: 'day' as const, days: [], rangeMax: 10, anchor: '2026-10-01', until: null }
    const r = dropRoutine({ ...emptyPlanner(), routines: [routine({ recurrence: rec })] }, routine({ recurrence: rec }), { date: '2026-11-04', slot: 54 }, ids())
    expect(r.ok && r.planner.shifts[0].recurrence).toBeNull()
  })

  it('puts the routine on a shift that is there already', () => {
    const r = dropRoutine({ ...emptyPlanner(), routines: [routine()] }, routine(), { shiftId: 's9' }, ids())
    expect(r.ok && r.planner.routines[0].shiftId).toBe('s9')
    expect(r.ok && r.planner.shifts).toEqual([])
  })
})

describe('dropProcess', () => {
  it('makes a shift as long as its steps, whose checklist is the steps, each following the one before it in an ordered group', () => {
    const r = dropProcess(ready(), revise(), { date: '2026-11-04', slot: 60 }, '2026-11-01', ids())
    if (!r.ok) throw new Error('refused')
    expect(r.planner.shifts[0]).toMatchObject({ title: 'Revise a chapter', facet: 'revision', date: '2026-11-04', startSlot: 60, endSlot: 70 }) // 100 minutes
    const tasks = r.planner.items
    expect(tasks.map(t => t.label)).toEqual(['Reread', 'Mark', 'Fix dialogue', 'Fix pacing'])
    expect(tasks.every(t => t.shiftId === r.shiftId && t.processId === 'pr' && t.phaseId === 'ph')).toBe(true)
    expect(tasks.map(t => t.afterId)).toEqual([null, tasks[0].id, null, null]) // the unordered group has no order
    expect(tasks[0]).toMatchObject({ estimateMinutes: 30, facet: 'revision', addedOn: '2026-11-01' })
  })

  it('is refused, and says what it needs, while a milestone it needs is not done', () => {
    const r = dropProcess({ ...emptyPlanner(), milestones: [newMilestone('m', 'Outline locked')] }, revise(), { date: '2026-11-04', slot: 60 }, '2026-11-01', ids())
    expect(r).toEqual({ ok: false, reason: 'Revise a chapter needs Outline locked done first.' })
  })

  it('puts its steps on a shift that is there already, and an hour is the length of a process with no estimates', () => {
    const p = newProcess('p2', 'Plan', { groups: [{ id: 'g', ordered: true, steps: [step('a', 'One')] }] })
    const onShift = dropProcess(emptyPlanner(), p, { shiftId: 's1' }, '2026-11-01', ids())
    expect(onShift.ok && onShift.planner.items.map(i => i.shiftId)).toEqual(['s1'])
    const made = dropProcess(emptyPlanner(), p, { date: '2026-11-04', slot: 54 }, '2026-11-01', ids())
    expect(made.ok && made.planner.shifts[0].endSlot - made.planner.shifts[0].startSlot).toBe(6)
  })

  it('keeps a shift inside the day', () => {
    const r = dropProcess(ready(), revise(), { date: '2026-11-04', slot: 143 }, '2026-11-01', ids())
    expect(r.ok && r.planner.shifts[0].endSlot).toBe(144)
  })
})

describe('dropExercise', () => {
  const sprint = newExercise('ex', 'Ten-minute sprint', { description: 'Write without stopping.', durationMinutes: 10, facets: ['draft'], phaseIds: ['ph'] })
  it('makes a timed shift with the exercise as its one task, its prompt in the notes', () => {
    const r = dropExercise(emptyPlanner(), sprint, { date: '2026-11-04', slot: DAY_DROP_SLOT }, '2026-11-01', ids())
    if (!r.ok) throw new Error('refused')
    expect(r.planner.shifts[0]).toMatchObject({ title: 'Ten-minute sprint', facet: 'draft', startSlot: 54, endSlot: 57 }) // never under half an hour: three slots
    expect(r.planner.items[0]).toMatchObject({ label: 'Ten-minute sprint', notes: 'Write without stopping.', estimateMinutes: 10, shiftId: r.shiftId, phaseId: 'ph' })
  })

  it('puts the exercise on a shift that is there already', () => {
    const r = dropExercise(emptyPlanner(), sprint, { shiftId: 's1' }, '2026-11-01', ids())
    expect(r.ok && [r.planner.shifts.length, r.planner.items[0].shiftId]).toEqual([0, 's1'])
  })
})

describe('isLocked', () => {
  it('locks a step until the one before it is done', () => {
    const items = [newTask('a', 'A', null), newTask('b', 'B', null, { afterId: 'a' }), newTask('c', 'C', null)]
    const done = new Set<string>()
    expect(items.map(i => isLocked(i, items, x => done.has(x.id)))).toEqual([false, true, false])
    done.add('a')
    expect(isLocked(items[1], items, x => done.has(x.id))).toBe(false)
  })

  it('does not lock a step whose predecessor is gone', () => {
    const lone = newTask('b', 'B', null, { afterId: 'gone' })
    expect(isLocked(lone, [lone], () => false)).toBe(false)
  })
})

describe('processTasks', () => {
  it('numbers nothing it does not need: a process with no steps makes no tasks', () => {
    expect(processTasks(newProcess('p', 'Empty'), 's', '2026-11-01', ids())).toEqual([])
  })
})
