import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newPhase, newProcess, newTask, type Planner } from './facets'
import { linkProcesses, removeMilestone, removePhase, removeProcess, tickMilestone } from './planEdit'

const base = (): Planner => ({
  ...emptyPlanner(),
  phases: [newPhase('ph', 'Draft'), newPhase('ph2', 'Revise')],
  milestones: [newMilestone('m', 'Outline locked', { phaseId: 'ph' })],
  items: [newTask('t', 'Write', null, { phaseId: 'ph', processId: 'pr' })],
  goals: [{ id: 'g', facet: 'draft', scope: 'project', nodeId: null, kind: null, daily: null, weekly: null, total: 1, deadline: null, phaseId: 'ph' }],
  processes: [newProcess('pr', 'Revise', { phaseIds: ['ph', 'ph2'], requiredMilestoneIds: ['m'], links: [{ otherId: 'pr2', relation: 'before' }] }), newProcess('pr2', 'Proof', { links: [{ otherId: 'pr', relation: 'after' }] })],
  exercises: [newExercise('ex', 'Sprint', { phaseIds: ['ph'] })],
})

describe('removing from the plan', () => {
  it('takes a phase off everything tagged with it', () => {
    const p = removePhase(base(), 'ph')
    expect(p.phases.map(x => x.id)).toEqual(['ph2'])
    expect(p.milestones[0].phaseId).toBeNull()
    expect(p.items[0].phaseId).toBeNull()
    expect(p.goals[0].phaseId).toBeNull()
    expect(p.processes[0].phaseIds).toEqual(['ph2'])
    expect(p.exercises[0].phaseIds).toEqual([])
  })

  it('stops a milestone being required once it is gone', () => {
    const p = removeMilestone(base(), 'm')
    expect(p.milestones).toEqual([])
    expect(p.processes[0].requiredMilestoneIds).toEqual([])
  })

  it('lets go of the work placed in a milestone that is gone', () => {
    const placed = { ...base(), items: [newTask('t', 'Write', null, { milestoneId: 'm' })], processes: [newProcess('pr', 'P', { milestoneIds: ['m', 'k'] })], exercises: [newExercise('ex', 'E', { milestoneIds: ['m'] })] }
    const p = removeMilestone(placed, 'm')
    expect(p.items[0].milestoneId).toBeNull()
    expect(p.processes[0].milestoneIds).toEqual(['k'])
    expect(p.exercises[0].milestoneIds).toEqual([])
  })

  it('drops a process, the links to it and the mark on the tasks it made', () => {
    const p = removeProcess(base(), 'pr')
    expect(p.processes.map(x => x.id)).toEqual(['pr2'])
    expect(p.processes[0].links).toEqual([])
    expect(p.items[0].processId).toBeNull()
  })
})

describe('tickMilestone', () => {
  it('says which day it was done, and clears it again', () => {
    const on = tickMilestone(base(), 'm', true, '2026-11-01')
    expect(on.milestones[0]).toMatchObject({ done: true, doneOn: '2026-11-01' })
    expect(tickMilestone(on, 'm', false, '2026-11-02').milestones[0]).toMatchObject({ done: false, doneOn: null })
  })
})

describe('linkProcesses', () => {
  it('keeps one link on both sides, read from each', () => {
    const p = linkProcesses({ ...base(), processes: [newProcess('a', 'A'), newProcess('b', 'B')] }, 'a', 'b', 'before')
    expect(p.processes[0].links).toEqual([{ otherId: 'b', relation: 'before' }])
    expect(p.processes[1].links).toEqual([{ otherId: 'a', relation: 'after' }])
    const swapped = linkProcesses(p, 'a', 'b', 'with')
    expect(swapped.processes.map(x => x.links)).toEqual([[{ otherId: 'b', relation: 'with' }], [{ otherId: 'a', relation: 'with' }]])
    expect(linkProcesses(swapped, 'a', 'b', null).processes.map(x => x.links)).toEqual([[], []])
  })

  it('does not link a process to itself', () => {
    const p = base()
    expect(linkProcesses(p, 'pr', 'pr', 'with')).toBe(p)
  })
})
