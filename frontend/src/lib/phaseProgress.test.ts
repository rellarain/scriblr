import { describe, expect, it } from 'vitest'
import { emptyPlanner, newMilestone, newPhase, newTask } from './facets'
import { currentPhase, daysBetween, nextMilestone, phaseProgress } from './phaseProgress'

const goal = (id: string, phaseId: string) => ({ id, facet: 'draft' as const, scope: 'project' as const, nodeId: null, kind: null, daily: null, weekly: null, total: 1000, deadline: null, phaseId })

describe('phaseProgress', () => {
  it('counts the tasks, milestones and goals tagged with the phase, done over all', () => {
    const p = {
      ...emptyPlanner(),
      items: [newTask('a', 'A', null, { phaseId: 'ph', doneOn: '2026-10-01' }), newTask('b', 'B', null, { phaseId: 'ph' }), newTask('c', 'C', null, { phaseId: 'other', doneOn: '2026-10-01' })],
      milestones: [newMilestone('m', 'M', { phaseId: 'ph', done: true })],
      goals: [goal('g1', 'ph'), goal('g2', 'ph')],
    }
    const r = phaseProgress(p, 'ph', new Set(['g1']))
    expect(r).toMatchObject({ done: 3, total: 5, pct: 60, tasks: [1, 2], milestones: [1, 1], goals: [1, 2] })
  })

  it('has no progress for a phase with nothing tagged', () => {
    expect(phaseProgress(emptyPlanner(), 'ph').pct).toBeNull()
  })
})

describe('currentPhase', () => {
  const phases = [newPhase('a', 'A', { status: 'done' }), newPhase('b', 'B', { start: '2026-11-01', end: '2026-11-30' }), newPhase('c', 'C', { status: 'active' })]
  it('is the one marked active, then the one whose dates hold today, then the first not done', () => {
    expect(currentPhase(phases, '2026-11-10')?.id).toBe('c')
    expect(currentPhase(phases.slice(0, 2), '2026-11-10')?.id).toBe('b')
    expect(currentPhase(phases.slice(0, 2), '2027-01-01')?.id).toBe('b')
    expect(currentPhase([phases[0]], '2026-11-10')).toBeNull()
  })
})

describe('nextMilestone', () => {
  it('is the earliest open one from today on, else one with no date yet', () => {
    const ms = [newMilestone('old', 'Old', { date: '2026-10-01' }), newMilestone('b', 'B', { date: '2026-12-01' }), newMilestone('a', 'A', { date: '2026-11-05' }), newMilestone('d', 'D', { date: '2026-11-04', done: true })]
    expect(nextMilestone(ms, '2026-11-01')?.id).toBe('a')
    expect(nextMilestone([newMilestone('x', 'X')], '2026-11-01')?.id).toBe('x')
    expect(nextMilestone([newMilestone('d', 'D', { done: true })], '2026-11-01')).toBeNull()
  })
})

describe('daysBetween', () => {
  it('counts whole days across a month end', () => { expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3) })
})
