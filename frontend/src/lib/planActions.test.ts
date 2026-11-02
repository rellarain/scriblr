import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newPhase, newPhaseKind, newTask, type Planner } from './facets'
import { addMilestone, addPhase, deleteMilestone, deletePhase, nudgeMilestone, setMilestoneDate, setMilestoneLength, setPhaseLength, setPhaseStart, toggleMilestonePin, togglePhasePin } from './planActions'
import { milestonesOf } from './planSequence'

let n = 0
const id = (prefix: string) => `${prefix}${++n}`
const TODAY = '2026-11-02'
const project = { level: 'project' as const, nodeId: null }
const dates = (p: Planner) => p.phases.map(x => [x.title, x.start, x.end])

describe('addPhase', () => {
  it('puts a phase last on its row, dated from the row start (else today), the first one active', () => {
    const a = addPhase(emptyPlanner(), project, 'One', TODAY, id)
    const b = addPhase(a.planner, project, 'Two', TODAY, id)
    expect(dates(b.planner)).toEqual([['One', '2026-11-02', '2026-11-15'], ['Two', '2026-11-16', '2026-11-29']])
    expect(b.planner.phases.map(p => [p.status, p.order])).toEqual([['active', 0], ['planned', 1]])
    const onBook = addPhase(b.planner, { level: 'book', nodeId: 'b1' }, 'Book', TODAY, id)
    expect(onBook.planner.phases.at(-1)).toMatchObject({ level: 'book', nodeId: 'b1', order: 0, status: 'active', start: '2026-11-02' })
  })

  it('starts a row at the project start when it has one', () => {
    const r = addPhase({ ...emptyPlanner(), timelineStart: '2026-12-01' }, project, 'One', TODAY, id)
    expect(r.planner.phases[0].start).toBe('2026-12-01')
  })
})

describe('sections', () => {
  const start = () => {
    const a = addPhase(emptyPlanner(), project, 'One', TODAY, id)
    return { planner: a.planner, phase: a.id }
  }

  it('adds a section last in its phase, and dates the sections across the phase', () => {
    const { planner, phase } = start()
    const one = addMilestone(planner, phase, 'Draft done', TODAY, id)
    const two = addMilestone(one.planner, phase, 'Read through', TODAY, id)
    expect(milestonesOf(two.planner, phase).map(m => [m.title, m.order, m.date])).toEqual([['Draft done', 0, '2026-11-08'], ['Read through', 1, '2026-11-15']])
  })

  it('pins a section to a date and the others flow around it, and frees it again', () => {
    const { planner, phase } = start()
    const one = addMilestone(planner, phase, 'A', TODAY, id)
    const two = addMilestone(one.planner, phase, 'B', TODAY, id)
    const pinned = setMilestoneDate(two.planner, one.id, '2026-11-04', TODAY)
    expect(milestonesOf(pinned, phase).map(m => [m.date, m.fixed])).toEqual([['2026-11-04', true], ['2026-11-15', false]])
    const freed = toggleMilestonePin(pinned, one.id, TODAY)
    expect(milestonesOf(freed, phase).map(m => m.fixed)).toEqual([false, false])
    expect(milestonesOf(freed, phase)[0].date).toBe('2026-11-08')
    expect(toggleMilestonePin(planner, 'nope', TODAY)).toBe(planner)
  })

  it('sets the length of a section and moves it a place', () => {
    const { planner, phase } = start()
    const one = addMilestone(planner, phase, 'A', TODAY, id)
    const two = addMilestone(one.planner, phase, 'B', TODAY, id)
    const long = setMilestoneLength(two.planner, one.id, 10, TODAY)
    expect(milestonesOf(long, phase)[0].date).toBe('2026-11-11')
    const moved = nudgeMilestone(long, one.id, 1)
    expect(moved.ok && milestonesOf(moved.planner, phase).map(m => m.title)).toEqual(['B', 'A'])
    const edge = nudgeMilestone(long, one.id, -1)
    expect(edge.ok && edge.planner).toBe(long)
  })

  it('deletes a section and lets go of the work placed in it', () => {
    const { planner, phase } = start()
    const one = addMilestone(planner, phase, 'A', TODAY, id)
    const withWork = { ...one.planner, items: [newTask('t', 'T', null, { milestoneId: one.id })], exercises: [newExercise('e', 'E', { milestoneIds: [one.id] })] }
    const out = deleteMilestone(withWork, one.id, TODAY)
    expect(out.milestones).toEqual([])
    expect(out.items[0].milestoneId).toBeNull()
    expect(out.exercises[0].milestoneIds).toEqual([])
  })
})

describe('phases', () => {
  const two = () => {
    const a = addPhase(emptyPlanner(), project, 'One', TODAY, id)
    const b = addPhase(a.planner, project, 'Two', TODAY, id)
    return { planner: b.planner, a: a.id, b: b.id }
  }

  it('lengthens a phase and the rest of the row follows', () => {
    const { planner, a } = two()
    expect(dates(setPhaseLength(planner, a, 7, TODAY))).toEqual([['One', '2026-11-02', '2026-11-08'], ['Two', '2026-11-09', '2026-11-22']])
  })

  it('marks a pass\'s length as its own, so the kind no longer sets it', () => {
    const kind = newPhaseKind('k', 'Revision', { lengthDays: 14 })
    const pass = { ...emptyPlanner(), phaseKinds: [kind], phases: [newPhase('p', 'Revision', { kindId: 'k', lengthDays: 14 })] }
    expect(setPhaseLength(pass, 'p', 5, TODAY).phases[0].overrides).toEqual(['lengthDays'])
  })

  it('pins a phase to a start day, lets the rest flow after it, and frees it', () => {
    const { planner, a, b } = two()
    const pinned = setPhaseStart(planner, a, '2026-11-10', TODAY)
    expect(dates(pinned)).toEqual([['One', '2026-11-10', '2026-11-23'], ['Two', '2026-11-24', '2026-12-07']])
    expect(pinned.phases[0].fixed).toBe(true)
    const longer = setPhaseLength(pinned, a, 3, TODAY)
    expect(longer.phases[0].end).toBe('2026-11-12')
    const freed = togglePhasePin(longer, a, TODAY)
    expect(dates(freed)[0]).toEqual(['One', '2026-11-10', '2026-11-12'])
    expect(freed.phases[0].fixed).toBe(false)
    expect(togglePhasePin(emptyPlanner(), b, TODAY)).toEqual(emptyPlanner())
  })

  it('deletes a phase with its sections and closes the row up', () => {
    const { planner, a } = two()
    const withSection = addMilestone(planner, a, 'S', TODAY, id)
    const out = deletePhase(withSection.planner, a, TODAY)
    expect(dates(out)).toEqual([['Two', '2026-11-02', '2026-11-15']])
    expect(out.milestones).toEqual([])
    expect(deletePhase(planner, 'nope', TODAY)).toBe(planner)
  })

  it('leaves a section on no phase with no row to date', () => {
    const p = { ...emptyPlanner(), milestones: [newMilestone('m', 'M')] }
    expect(setMilestoneLength(p, 'm', 4, TODAY).milestones[0].lengthDays).toBe(4)
    expect(setMilestoneDate(p, 'm', '2026-11-30', TODAY).milestones[0]).toMatchObject({ date: '2026-11-30', fixed: true })
  })
})
