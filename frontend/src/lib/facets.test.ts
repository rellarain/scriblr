import { describe, expect, it } from 'vitest'
import { emptyPlanner, normalizePlanner, type Planner } from './facets'

describe('normalizePlanner', () => {
  it('fills in a plan saved before phases had levels, kinds and sections', () => {
    const old = {
      ...emptyPlanner(),
      phases: [{ id: 'a', title: 'A', result: '', description: '', status: 'planned', start: null, end: null, offsetDays: null, lengthDays: null }, { id: 'b', title: 'B', result: '', description: '', status: 'planned', start: null, end: null, offsetDays: null, lengthDays: null }],
      milestones: [{ id: 'm', title: 'M', date: null, offsetDays: null, phaseId: 'a', done: false, doneOn: null }],
      processes: [{ id: 'p', title: 'P', description: '', phaseIds: [], facets: [], requiredMilestoneIds: [], groups: [], links: [] }],
      exercises: [{ id: 'e', title: 'E', description: '', durationMinutes: 15, facets: [], phaseIds: [], perWeek: null, timesDone: 0, lastDone: null }],
    }
    delete (old as unknown as Partial<Planner>).phaseKinds
    const p = normalizePlanner(old as unknown as Partial<Planner>)
    expect(p.phases.map(x => [x.level, x.nodeId, x.kindId, x.order, x.fixed, x.overrides])).toEqual([['project', null, null, 0, false, []], ['project', null, null, 1, false, []]])
    expect(p.milestones[0]).toMatchObject({ result: '', order: 0, lengthDays: null, fixed: false, kindMilestoneId: null, overrides: [], phaseId: 'a' })
    expect(p.processes[0].milestoneIds).toEqual([])
    expect(p.exercises[0].milestoneIds).toEqual([])
    expect(p.phaseKinds).toEqual([])
  })

  it('keeps what a plan already has, and is an empty plan for nothing', () => {
    const kept = normalizePlanner({ ...emptyPlanner(), phases: [{ ...normalizePlanner({}).phases[0], id: 'x', title: 'X', level: 'book', nodeId: 'b1', order: 3 }] })
    expect(kept.phases[0]).toMatchObject({ level: 'book', nodeId: 'b1', order: 3 })
    expect(normalizePlanner(null)).toEqual(emptyPlanner())
  })
})
