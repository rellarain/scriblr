import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newPhase, newProcess, newTask, type Planner, type Routine } from './facets'
import { milestoneState, milestoneWork, phaseReached } from './milestoneProgress'

const routine = (id: string, patch: Partial<Routine> = {}): Routine => ({
  id, label: id, facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: null,
  recurrence: { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: '2026-11-01', until: null }, ...patch,
})

const base = (): Planner => ({ ...emptyPlanner(), phases: [newPhase('ph', 'Revision', { start: '2026-11-10', end: '2026-11-30' })], milestones: [newMilestone('m', 'Marked up', { phaseId: 'ph' })] })

describe('milestoneWork', () => {
  it('lists the tasks, processes, exercises and routines placed in the milestone, and what is done', () => {
    const p: Planner = {
      ...base(),
      items: [newTask('t1', 'Done', null, { milestoneId: 'm', doneOn: '2026-11-11' }), newTask('t2', 'Open', null, { milestoneId: 'm' }), newTask('x', 'Elsewhere', null, { milestoneId: 'other' })],
      processes: [newProcess('pr', 'Mark a chapter', { milestoneIds: ['m'] })],
      exercises: [newExercise('ex', 'Dialogue only', { milestoneIds: ['m'], lastDone: '2026-11-12' })],
      routines: [routine('r', { milestoneId: 'm', lastDone: '2026-11-01' })],
    }
    expect(milestoneWork(p, 'm').map(w => [w.kind, w.id, w.done])).toEqual([['task', 't1', true], ['task', 't2', false], ['process', 'pr', false], ['exercise', 'ex', true], ['routine', 'r', false]])
  })

  it('counts a process as done once every task it made is done, and counts those tasks only through the process', () => {
    const p: Planner = {
      ...base(),
      processes: [newProcess('pr', 'P', { milestoneIds: ['m'] })],
      items: [newTask('a', 'A', null, { processId: 'pr', milestoneId: 'm', doneOn: '2026-11-11' }), newTask('b', 'B', null, { processId: 'pr' })],
    }
    expect(milestoneWork(p, 'm').map(w => [w.kind, w.done])).toEqual([['process', false]])
    const done = { ...p, items: p.items.map(i => ({ ...i, doneOn: '2026-11-12' })) }
    expect(milestoneWork(done, 'm').map(w => [w.kind, w.done])).toEqual([['process', true]])
  })

  it('has nothing for a milestone that is gone', () => {
    expect(milestoneWork(base(), 'nope')).toEqual([])
  })
})

describe('milestoneState', () => {
  it('is achieved once all its work is done, or when ticked by hand, and never with no work and no tick', () => {
    const p: Planner = { ...base(), items: [newTask('a', 'A', null, { milestoneId: 'm', doneOn: '2026-11-11' }), newTask('b', 'B', null, { milestoneId: 'm' })] }
    expect(milestoneState(p, 'm')).toEqual({ done: 1, total: 2, achieved: false })
    expect(milestoneState({ ...p, items: p.items.map(i => ({ ...i, doneOn: '2026-11-12' })) }, 'm').achieved).toBe(true)
    expect(milestoneState({ ...p, milestones: p.milestones.map(m => ({ ...m, done: true })) }, 'm').achieved).toBe(true)
    expect(milestoneState(base(), 'm')).toEqual({ done: 0, total: 0, achieved: false })
  })
})

describe('phaseReached', () => {
  it('is when the last milestone is achieved, or the phase is marked done if it has none', () => {
    const p = { ...base(), milestones: [newMilestone('m1', 'One', { phaseId: 'ph', order: 0, done: true }), newMilestone('m2', 'Two', { phaseId: 'ph', order: 1 })] }
    expect(phaseReached(p, p.phases[0])).toBe(false)
    expect(phaseReached({ ...p, milestones: p.milestones.map(m => ({ ...m, done: true })) }, p.phases[0])).toBe(true)
    expect(phaseReached({ ...emptyPlanner(), phases: [newPhase('x', 'X', { status: 'done' })] }, newPhase('x', 'X', { status: 'done' }))).toBe(true)
  })
})
