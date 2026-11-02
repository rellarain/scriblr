import { describe, expect, it } from 'vitest'
import { emptyPlanner, newExercise, newMilestone, newPhase, newPhaseKind, newProcess, newTask, type Planner } from './facets'
import { rowOfPhase } from './planRows'
import { copyIntoPlanner, describeCounts, emptySelection, isEmptyPlan, saveToTemplate, selectAll, selectionSize, withDependencies } from './template'

const counter = () => { let n = 0; return (prefix: string) => `${prefix}${++n}` }

// A template: dates are offsets from the project's start.
function template(): Planner {
  return {
    ...emptyPlanner(),
    phases: [
      newPhase('ph1', 'Outlining', { result: 'A chapter list I trust', offsetDays: 0, lengthDays: 30 }),
      newPhase('ph2', 'First draft', { offsetDays: 30, lengthDays: 90, status: 'active' }),
      newPhase('ph3', 'Someday', {}),
    ],
    milestones: [newMilestone('m1', 'Outline locked', { offsetDays: 29, phaseId: 'ph1', done: true, doneOn: '2026-01-01' }), newMilestone('m2', 'Half way', { offsetDays: 75, phaseId: 'ph2' })],
    processes: [
      newProcess('pr1', 'Revise a chapter', {
        phaseIds: ['ph2', 'ph3'], requiredMilestoneIds: ['m1'], links: [{ otherId: 'pr2', relation: 'before' }],
        groups: [{ id: 'g', ordered: true, steps: [{ id: 's1', label: 'Reread', estimateMinutes: 30, facet: null }] }],
      }),
      newProcess('pr2', 'Proof a chapter', { links: [{ otherId: 'pr1', relation: 'after' }] }),
    ],
    exercises: [newExercise('ex1', 'Sprint', { phaseIds: ['ph2'], timesDone: 5, lastDone: '2026-01-02' })],
    routines: [{
      id: 'r1', label: 'Back up', facet: 'project', targetNodeId: 'n', targetTree: 'outline', shiftId: 's', phaseId: 'ph2', lastDone: '2026-01-02', pauses: [{ start: '2026-01-01', end: '2026-01-02' }],
      recurrence: { kind: 'weekly', every: 1, unit: 'week', days: [0], rangeMax: null, anchor: '2025-01-01', until: '2025-12-31' },
    }],
    items: [
      newTask('t1', 'Write chapter 1', '2026-01-01', { phaseId: 'ph2', shiftId: 'sh', doneOn: null, dueDate: '2026-02-01', subtasks: [{ id: 'x', label: 'Plan', done: true }], processId: 'pr1', afterId: 't0', aim: 500, targetNodeId: 'n', targetTree: 'outline' }),
      newTask('t2', 'Done already', null, { doneOn: '2026-01-05' }),
    ],
    goals: [{ id: 'g1', facet: 'draft', scope: 'chapter', nodeId: 'c1', kind: null, daily: 500, weekly: null, total: 80000, deadline: '2026-06-01', phaseId: 'ph2' }],
  }
}

describe('selectAll and withDependencies', () => {
  it('picks everything but the tasks already done', () => {
    const s = selectAll(template())
    expect(s.items).toEqual(['t1'])
    expect(selectionSize(s)).toBe(3 + 2 + 2 + 1 + 1 + 1 + 1)
  })

  it('brings the milestones a picked process needs', () => {
    const s = withDependencies(template(), { ...emptySelection(), processes: ['pr1'], milestones: ['m2'] })
    expect(s.milestones.sort()).toEqual(['m1', 'm2'])
    expect(withDependencies(template(), emptySelection()).milestones).toEqual([])
  })

  it('says whether a plan has anything in it', () => {
    expect(isEmptyPlan(emptyPlanner())).toBe(true)
    expect(isEmptyPlan(template())).toBe(false)
  })
})

describe('copyIntoPlanner', () => {
  const into = (sel: Partial<ReturnType<typeof emptySelection>>, target = emptyPlanner()) => copyIntoPlanner(template(), { ...emptySelection(), ...sel }, target, '2026-11-02', counter())

  it('dates phases and milestones from the start day, and a phase with no dates has none', () => {
    const { planner } = into({ phases: ['ph1', 'ph2', 'ph3'], milestones: ['m1', 'm2'] })
    expect(planner.phases.map(p => [p.title, p.start, p.end, p.offsetDays, p.lengthDays, p.status])).toEqual([
      ['Outlining', '2026-11-02', '2026-12-01', null, null, 'planned'],
      ['First draft', '2026-12-02', '2027-02-29'.replace('02-29', '03-01'), null, null, 'planned'],
      ['Someday', null, null, null, null, 'planned'],
    ])
    expect(planner.milestones.map(m => [m.title, m.date, m.done, m.doneOn])).toEqual([['Outline locked', '2026-12-01', false, null], ['Half way', '2027-01-16', false, null]])
  })

  describe('phases of a level', () => {
    const levelled = (): Planner => {
      const t = template()
      return {
        ...t,
        phaseKinds: [newPhaseKind('k', 'Revision', { result: 'Clean', milestones: [{ id: 'km', title: 'Marked up', result: '', lengthDays: 5 }] })],
        phases: [
          newPhase('book1', 'Book pass', { level: 'book', offsetDays: 10, lengthDays: 14, kindId: 'k', overrides: ['result'], order: 1 }),
          newPhase('chap1', 'Chapter pass', { level: 'chapter', offsetDays: 20, lengthDays: 7, order: 2 }),
          newPhase('proj1', 'Project pass', { offsetDays: 0, lengthDays: 5, order: 0 }),
        ],
        milestones: [newMilestone('bm', 'Marked up', { phaseId: 'book1', offsetDays: 15, lengthDays: 5, kindMilestoneId: 'km', overrides: ['title'] }), newMilestone('cm', 'Read aloud', { phaseId: 'chap1', offsetDays: 25 })],
        processes: [newProcess('pr', 'Mark a chapter', { phaseIds: ['book1'], milestoneIds: ['bm'] })],
        items: [newTask('bt', 'Mark the book', null, { phaseId: 'book1', milestoneId: 'bm', estimateMinutes: 60 })],
        routines: [], goals: [], exercises: [],
      }
    }
    const pickAll = (p: Planner) => ({ ...emptySelection(), phases: p.phases.map(x => x.id), processes: ['pr'], items: ['bt'] })

    it('are put on each of the books and chapters chosen, with their sections, dated alike', () => {
      const p = levelled()
      const { planner, counts } = copyIntoPlanner(p, pickAll(p), emptyPlanner(), '2026-11-02', counter(), { books: ['b1', 'b2'], chapters: ['c1', 'c2', 'c3'] })
      expect(planner.phases.map(x => [x.title, x.level, x.nodeId, x.start])).toEqual([
        ['Project pass', 'project', null, '2026-11-02'],
        ['Book pass', 'book', 'b1', '2026-11-12'], ['Book pass', 'book', 'b2', '2026-11-12'],
        ['Chapter pass', 'chapter', 'c1', '2026-11-22'], ['Chapter pass', 'chapter', 'c2', '2026-11-22'], ['Chapter pass', 'chapter', 'c3', '2026-11-22'],
      ])
      expect(planner.milestones.filter(m => m.title === 'Marked up')).toHaveLength(2)
      expect(planner.milestones.filter(m => m.title === 'Read aloud').map(m => m.date)).toEqual(['2026-11-27', '2026-11-27', '2026-11-27'])
      expect(counts).toMatchObject({ phases: 6, milestones: 5 })
    })

    it('make the work placed in a milestone again for each copy of it, and place a process in all of them', () => {
      const p = levelled()
      const { planner } = copyIntoPlanner(p, pickAll(p), emptyPlanner(), '2026-11-02', counter(), { books: ['b1', 'b2'], chapters: [] })
      const marked = planner.milestones.filter(m => m.title === 'Marked up')
      expect(planner.items.map(i => i.milestoneId)).toEqual(marked.map(m => m.id))
      expect(planner.items.map(i => i.phaseId)).toEqual(marked.map(m => m.phaseId))
      expect(planner.processes[0].milestoneIds).toEqual(marked.map(m => m.id))
      expect(planner.processes[0].phaseIds).toEqual(planner.phases.filter(x => x.level === 'book').map(x => x.id))
    })

    it('are left out, and counted, when there is no book or chapter to put them on', () => {
      const p = levelled()
      const r = copyIntoPlanner(p, pickAll(p), emptyPlanner(), '2026-11-02', counter())
      expect(r.planner.phases.map(x => x.title)).toEqual(['Project pass'])
      expect(r.skipped).toBe(2)
      expect(r.planner.milestones).toEqual([]) // their sections went with them
      expect(r.planner.items.map(i => [i.label, i.milestoneId])).toEqual([['Mark the book', null]]) // the task is left with no place
    })

    it('bring the kind of a pass, once, and keep what the pass had changed', () => {
      const p = levelled()
      const { planner } = copyIntoPlanner(p, pickAll(p), emptyPlanner(), '2026-11-02', counter(), { books: ['b1', 'b2'], chapters: [] })
      expect(planner.phaseKinds).toHaveLength(1)
      const books = planner.phases.filter(x => x.level === 'book')
      expect(books.every(x => x.kindId === planner.phaseKinds[0].id && x.overrides.join() === 'result')).toBe(true)
      const km = planner.phaseKinds[0].milestones[0].id
      expect(planner.milestones.filter(m => m.title === 'Marked up').every(m => m.kindMilestoneId === km && m.overrides.join() === 'title')).toBe(true)
    })

    it('go on the rows after the phases that are there already, in the order they had', () => {
      const p = levelled()
      const target = { ...emptyPlanner(), phases: [newPhase('mine', 'Mine', { order: 4 })] }
      const { planner } = copyIntoPlanner(p, pickAll(p), target, '2026-11-02', counter(), { books: ['b1'], chapters: [] })
      expect(planner.phases.find(x => x.title === 'Project pass')?.order).toBe(5)
      expect(planner.phases.find(x => x.level === 'book')?.order).toBe(0)
    })

    it('keep their level when saved, not the book or chapter, and bring the kind', () => {
      const proj = { ...emptyPlanner(), timelineStart: '2026-11-01', phaseKinds: [newPhaseKind('k', 'Revision')], phases: [newPhase('p', 'Pass', { level: 'chapter', nodeId: 'c9', kindId: 'k', start: '2026-11-11', end: '2026-11-20' })] }
      const { planner } = saveToTemplate(proj, { ...emptySelection(), phases: ['p'] }, emptyPlanner(), counter())
      expect(planner.phases[0]).toMatchObject({ level: 'chapter', nodeId: null, offsetDays: 10, lengthDays: 10 })
      expect(planner.phaseKinds).toHaveLength(1)
      expect(planner.phases[0].kindId).toBe(planner.phaseKinds[0].id)
      expect(rowOfPhase(planner.phases[0])).toBe('chapter:')
    })
  })

  it('brings the sections of a phase that is picked', () => {
    const { planner, counts } = into({ phases: ['ph1'] })
    expect(planner.milestones.map(m => m.title)).toEqual(['Outline locked'])
    expect(counts.milestones).toBe(1)
  })

  it('gives everything new ids and keeps the tags between the copies', () => {
    const { planner } = into({ phases: ['ph1'], milestones: ['m1'] })
    expect(planner.phases[0].id).not.toBe('ph1')
    expect(planner.milestones[0].phaseId).toBe(planner.phases[0].id)
  })

  it('leaves the tag off what is tagged with a phase that was not picked, and keeps a project that has its own start', () => {
    const own = { ...emptyPlanner(), timelineStart: '2026-10-01', timelineEnd: '2027-05-01' }
    const { planner } = into({ routines: ['r1'], items: ['t1'], goals: ['g1'], exercises: ['ex1'] }, own)
    expect([planner.routines[0].phaseId, planner.items[0].phaseId, planner.goals[0].phaseId, planner.exercises[0].phaseIds]).toEqual([null, null, null, []])
    expect([planner.timelineStart, planner.timelineEnd]).toEqual(['2026-10-01', '2027-05-01'])
  })

  it('starts the project at the start day, and ends it at the last phase, when it had no dates', () => {
    const { planner } = into({ phases: ['ph1', 'ph2'] })
    expect([planner.timelineStart, planner.timelineEnd]).toEqual(['2026-11-02', '2027-03-01'])
    expect(into({ routines: ['r1'] }).planner.timelineStart).toBeNull() // nothing dated was copied
  })

  it('copies a process with its phases, the milestones it needs and a link only to a process that was copied too', () => {
    const { planner, counts } = into({ phases: ['ph2'], processes: ['pr1'] })
    const p = planner.processes[0]
    expect(p.phaseIds).toEqual([planner.phases[0].id]) // ph3 was not picked
    expect(p.requiredMilestoneIds).toEqual([planner.milestones[0].id]) // m1 came with it
    expect(planner.milestones[0].phaseId).toBeNull() // m1's own phase was not picked
    expect(p.links).toEqual([])
    expect(p.groups[0].id).not.toBe('g')
    expect(p.groups[0].steps[0]).toMatchObject({ label: 'Reread', estimateMinutes: 30 })
    expect(p.groups[0].steps[0].id).not.toBe('s1')
    expect(counts).toMatchObject({ phases: 1, milestones: 2, processes: 1 }) // m2 is the section of the phase picked
  })

  it('keeps a link between two processes that were both copied, read from each side', () => {
    const { planner } = into({ processes: ['pr1', 'pr2'] })
    const [a, b] = planner.processes
    expect(a.links).toEqual([{ otherId: b.id, relation: 'before' }])
    expect(b.links).toEqual([{ otherId: a.id, relation: 'after' }])
  })

  it('starts a copied routine, task and exercise afresh', () => {
    const { planner } = into({ routines: ['r1'], items: ['t1'], exercises: ['ex1'], goals: ['g1'] })
    expect(planner.routines[0]).toMatchObject({ shiftId: null, lastDone: null, pauses: [], targetNodeId: null })
    expect(planner.routines[0].recurrence).toMatchObject({ anchor: '2026-11-02', until: null, days: [0] })
    expect(planner.items[0]).toMatchObject({ label: 'Write chapter 1', shiftId: null, doneOn: null, dueDate: null, addedOn: '2026-11-02', processId: null, afterId: null, aim: null, targetNodeId: null })
    expect(planner.items[0].subtasks).toMatchObject([{ label: 'Plan', done: false }])
    expect(planner.exercises[0]).toMatchObject({ timesDone: 0, lastDone: null })
    expect(planner.goals[0]).toMatchObject({ scope: 'project', nodeId: null, deadline: null, total: 80000 })
  })

  it('adds to what the plan has and touches nothing else', () => {
    const target = { ...emptyPlanner(), phases: [newPhase('mine', 'Mine')], shifts: [] }
    const { planner } = into({ phases: ['ph1'] }, target)
    expect(planner.phases.map(p => p.title)).toEqual(['Mine', 'Outlining'])
    expect(target.phases).toHaveLength(1)
  })
})

describe('saveToTemplate', () => {
  function project(): Planner {
    return {
      ...emptyPlanner(),
      timelineStart: '2026-10-01',
      phases: [newPhase('a', 'Outlining', { start: '2026-10-01', end: '2026-10-30', status: 'done' }), newPhase('b', 'Draft', { start: '2026-11-15' }), newPhase('c', 'Undated')],
      milestones: [newMilestone('m', 'Beta', { date: '2026-12-31', done: true, doneOn: '2026-12-30' }), newMilestone('n', 'Someday')],
    }
  }

  it('turns days into how many days after the start, and a span into a length', () => {
    const { planner } = saveToTemplate(project(), { ...emptySelection(), phases: ['a', 'b', 'c'], milestones: ['m', 'n'] }, emptyPlanner(), counter())
    expect(planner.phases.map(p => [p.start, p.end, p.offsetDays, p.lengthDays, p.status])).toEqual([[null, null, 0, 30, 'planned'], [null, null, 45, 1, 'planned'], [null, null, null, null, 'planned']])
    expect(planner.milestones.map(m => [m.date, m.offsetDays, m.done])).toEqual([[null, 91, false], [null, null, false]])
  })

  it('counts from the earliest date when the project has no start, and gives no offsets without any date', () => {
    const noStart = { ...project(), timelineStart: null }
    expect(saveToTemplate(noStart, { ...emptySelection(), phases: ['b'] }, emptyPlanner(), counter()).planner.phases[0].offsetDays).toBe(45)
    const none = { ...emptyPlanner(), phases: [newPhase('x', 'X')] }
    expect(saveToTemplate(none, { ...emptySelection(), phases: ['x'] }, emptyPlanner(), counter()).planner.phases[0].offsetDays).toBeNull()
  })

  it('and copying it back into a project at another start gives the same shape, moved', () => {
    const saved = saveToTemplate(project(), { ...emptySelection(), phases: ['a', 'b'], milestones: ['m'] }, emptyPlanner(), counter()).planner
    const back = copyIntoPlanner(saved, selectAll(saved), emptyPlanner(), '2027-01-04', counter()).planner
    // (a phase that had one date comes back a day long)
    expect(back.phases.map(p => [p.start, p.end])).toEqual([['2027-01-04', '2027-02-02'], ['2027-02-18', '2027-02-18']])
    expect(back.milestones[0].date).toBe('2027-04-05')
  })
})

describe('describeCounts', () => {
  it('reads as a plain list', () => {
    expect(describeCounts({ phases: 2, milestones: 3, processes: 1, exercises: 0, routines: 0, items: 0, goals: 0 })).toBe('2 phases, 3 milestones and 1 process')
    expect(describeCounts({ phases: 1, milestones: 0, processes: 0, exercises: 0, routines: 0, items: 0, goals: 0 })).toBe('1 phase')
    expect(describeCounts({ phases: 0, milestones: 0, processes: 0, exercises: 0, routines: 0, items: 0, goals: 0 })).toBe('nothing')
  })
})
