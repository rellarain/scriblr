import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newPhase, newProcess } from './facets'
import { PX_PER_DAY, dropIndex, rulerMarks } from './planTimeline'
import { setPlacements } from './planSequence'

const range = { from: '2026-10-28', to: '2026-12-03', days: 37 }

describe('rulerMarks', () => {
  it('marks the first of each month by months, with the year at January, and the first day', () => {
    const marks = rulerMarks({ from: '2026-12-20', to: '2027-02-10', days: 53 }, 'month')
    expect(marks.map(m => [m.date, m.label, m.major])).toEqual([['2026-12-20', 'Dec', false], ['2027-01-01', 'Jan 2027', true], ['2027-02-01', 'Feb', true]])
  })

  it('marks each Monday by weeks, a month\'s first Monday as major', () => {
    const marks = rulerMarks(range, 'week')
    expect(marks.map(m => m.date)).toEqual(['2026-10-28', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(marks.map(m => m.major)).toEqual([false, true, false, false, false, false])
    expect(marks[1].label).toBe('Nov 2')
  })

  it('marks every day by days, naming the month on the first', () => {
    const marks = rulerMarks({ from: '2026-10-30', to: '2026-11-03', days: 5 }, 'day')
    expect(marks.map(m => m.label)).toEqual(['Oct 30', '31', 'Nov 1', '2', '3'])
    expect(marks.filter(m => m.major).map(m => m.date)).toEqual(['2026-11-01', '2026-11-02'])
  })

  it('draws a day wider as the zoom closes in', () => {
    expect(PX_PER_DAY.month).toBeLessThan(PX_PER_DAY.week)
    expect(PX_PER_DAY.week).toBeLessThan(PX_PER_DAY.day)
  })
})

describe('dropIndex', () => {
  const others = [newPhase('a', 'A', { start: '2026-11-01', end: '2026-11-10' }), newPhase('b', 'B', { start: '2026-11-11', end: '2026-11-20' }), newPhase('c', 'C')]
  it('is the number of the other phases that lie before the middle of the one dropped (a phase with no dates counts as before)', () => {
    expect(dropIndex(others, 0, range)).toBe(1) // before them all, but the undated one is always counted
    expect(dropIndex(others, 10, range)).toBe(2) // A's middle is 8 days from the range start (it starts 4 days in and is 10 long), so day 10 is after it
    expect(dropIndex(others, 30, range)).toBe(3)
  })
})

describe('setPlacements', () => {
  const base = {
    ...emptyPlanner(),
    phases: [newPhase('p1', 'One'), newPhase('p2', 'Two')],
    milestones: [newMilestone('m1', 'A', { phaseId: 'p1' }), newMilestone('m2', 'B', { phaseId: 'p2' }), newMilestone('free', 'Free')],
    processes: [newProcess('pr', 'P', { phaseIds: ['p9'] })],
    exercises: [newExercise('ex', 'E')],
  }

  it('sets the milestones of a process, adding their phases and keeping the ones it had', () => {
    const p = setPlacements(base, 'process', 'pr', ['m1', 'free', 'm2'])
    expect(p.processes[0]).toMatchObject({ milestoneIds: ['m1', 'free', 'm2'], phaseIds: ['p9', 'p1', 'p2'] })
    expect(setPlacements(p, 'process', 'pr', []).processes[0].milestoneIds).toEqual([])
  })

  it('does the same for an exercise, and touches nothing else', () => {
    const p = setPlacements(base, 'exercise', 'ex', ['m2'])
    expect(p.exercises[0]).toMatchObject({ milestoneIds: ['m2'], phaseIds: ['p2'] })
    expect(p.processes).toEqual(base.processes)
  })
})
