import { describe, expect, it } from 'vitest'
import { emptyPlanner, newTask, type PlanItem, type Planner, type Routine, type Shift } from './facets'
import { DEFAULT_FILTER, moveItem, organise, type BacklogFilter } from './backlog'

const TODAY = '2026-11-04'
const routine = (id: string, over: Partial<Routine> = {}): Routine => ({
  id, label: id, facet: null, targetNodeId: null, targetTree: null, shiftId: null, pauses: [], lastDone: null,
  recurrence: { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: '2026-10-01', until: null }, ...over,
})
const shift = (id: string, startSlot: number, endSlot: number, over: Partial<Shift> = {}): Shift => ({
  id, title: id, facet: 'draft', date: TODAY, startSlot, endSlot, targetNodeId: null, targetTree: null, target: null, recurrence: null, pauses: [], skipped: [], overrides: {}, ...over,
})
const planner = (items: PlanItem[], extra: Partial<Planner> = {}): Planner => ({ ...emptyPlanner(), items, ...extra })
const run = (p: Planner, filter: Partial<BacklogFilter> = {}, nowSlot = 60, ticked: string[] = []) =>
  organise({ owners: [{ id: 'p', planner: p }], today: TODAY, nowSlot, filter: { ...DEFAULT_FILTER, ...filter }, ticked: (_o, id) => ticked.includes(id) })
const ids = (list: { item: PlanItem }[]) => list.map(e => e.item.id)

describe('organise: priority groups', () => {
  const p = planner([
    newTask('lowA', 'low a', null, { priority: 'low' }), newTask('hi', 'hi', null, { priority: 'high' }), newTask('none', 'none', null),
    newTask('hiDue', 'hi due', null, { priority: 'high', dueDate: '2026-11-10' }), newTask('med', 'med', null, { priority: 'medium' }),
    newTask('carried', 'carried', null, { priority: 'high', carried: true }),
  ])
  it('groups the tasks by priority, carried first, then the soonest due, then as kept', () => {
    const o = run(p)
    expect(ids(o.groups.high)).toEqual(['carried', 'hiDue', 'hi'])
    expect(ids(o.groups.medium)).toEqual(['med'])
    expect(ids(o.groups.low)).toEqual(['lowA'])
    expect(ids(o.groups.none)).toEqual(['none'])
  })
  it('lists the tasks flat in the sort asked for', () => {
    expect(ids(run(p, { sort: 'due' }).flat).slice(0, 1)).toEqual(['hiDue'])
    expect(ids(run(p, { sort: 'manual' }).flat)).toEqual(['lowA', 'hi', 'none', 'hiDue', 'med', 'carried'])
    const dated = planner([newTask('a', 'a', '2026-11-01'), newTask('b', 'b', '2026-11-03'), newTask('c', 'c', '2026-11-03')])
    expect(ids(run(dated, { sort: 'newest' }).flat)).toEqual(['c', 'b', 'a'])
  })
  it('opens the None fold only when nothing else is waiting', () => {
    expect(run(p).noneOpen).toBe(false)
    expect(run(planner([newTask('n', 'n', null)])).noneOpen).toBe(true)
    expect(run(planner([])).empty).toBe(true)
  })
})

describe('organise: overdue', () => {
  it('lifts tasks past their due date, and routines past their range, out of the groups', () => {
    const p = planner(
      [newTask('late', 'late', null, { priority: 'low', dueDate: '2026-11-01' }), newTask('ok', 'ok', null, { priority: 'low', dueDate: TODAY })],
      { routines: [routine('r', { recurrence: { kind: 'interval', every: 7, unit: 'day', days: [], rangeMax: 10, anchor: '2026-09-01', until: null }, lastDone: '2026-10-20' })] },
    )
    const o = run(p)
    expect(o.overdue.map(e => (e.kind === 'task' ? e.item.id : e.routine.id))).toEqual(['late', 'r'])
    expect(ids(o.groups.low)).toEqual(['ok'])
  })
})

describe('organise: today', () => {
  const p = planner(
    [newTask('early', 'early', null, { shiftId: 'a' }), newTask('now', 'now', null, { shiftId: 'b' }), newTask('later', 'later', null, { shiftId: 'c', priority: 'high' }), newTask('free', 'free', null, { priority: 'high' })],
    { shifts: [shift('a', 30, 40), shift('b', 54, 66), shift('c', 90, 100), shift('far', 54, 66, { date: '2026-11-20' })], routines: [routine('daily')] },
  )
  it('puts the running shift\'s tasks first, then the other shifts in time order, then the routines due', () => {
    const o = run(p, {}, 60)
    expect(o.today.map(e => (e.kind === 'task' ? e.item.id : e.routine.id))).toEqual(['now', 'early', 'later', 'daily'])
    expect(o.today[0]).toMatchObject({ running: true })
    expect(ids(o.groups.high)).toEqual(['free'])
  })
  it('keeps a task off the backlog while it is on a shift on another day', () => {
    const away = planner([newTask('x', 'x', null, { shiftId: 'far' })], { shifts: [shift('far', 54, 66, { date: '2026-11-20' })] })
    const o = run(away)
    expect(o.today).toEqual([])
    expect(o.empty).toBe(true)
  })
  it('hides what is ticked when done is hidden, and shows it otherwise', () => {
    expect(run(p, { done: 'hide' }, 60, ['daily']).today.map(e => e.kind === 'routine')).not.toContain(true)
    expect(run(p, { done: 'today' }, 60, ['daily']).today.at(-1)).toMatchObject({ kind: 'routine', ticked: true })
  })
})

describe('organise: done, search and filters', () => {
  const p = planner([
    newTask('d1', 'done today', null, { doneOn: TODAY }), newTask('d2', 'done before', null, { doneOn: '2026-10-01' }),
    newTask('a', 'Revise the harbour scene', null, { facet: 'draft', notes: 'tidy up' }),
    newTask('b', 'Map', null, { facet: 'plot', subtasks: [{ id: '1', label: 'rivers', done: false }], targetNodeId: 'n1' }),
  ])
  it('shows the done tasks asked for', () => {
    expect(ids(run(p, { done: 'hide' }).done)).toEqual([])
    expect(ids(run(p, { done: 'today' }).done)).toEqual(['d1'])
    expect(ids(run(p, { done: 'all' }).done)).toEqual(['d1', 'd2'])
  })
  it('searches the label, notes, subtasks and the name of the linked node', () => {
    const found = (search: string) => ids([...run(p, { search }).groups.none])
    expect(found('harbour')).toEqual(['a'])
    expect(found('TIDY')).toEqual(['a'])
    expect(found('rivers')).toEqual(['b'])
    const byNode = organise({ owners: [{ id: 'p', planner: p }], today: TODAY, nowSlot: 0, filter: { ...DEFAULT_FILTER, search: 'chapter 3' }, ticked: () => false, nodeTitle: id => (id === 'n1' ? 'Chapter 3' : undefined) })
    expect(ids(byNode.groups.none)).toEqual(['b'])
  })
  it('filters by facet and by project', () => {
    expect(ids(run(p, { facet: 'plot' }).groups.none)).toEqual(['b'])
    const o = organise({ owners: [{ id: 'p', planner: p }, { id: 'q', planner: planner([newTask('z', 'z', null)]) }], today: TODAY, nowSlot: 0, filter: { ...DEFAULT_FILTER, project: 'q' }, ticked: () => false })
    expect(ids(o.groups.none)).toEqual(['z'])
  })
})

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd'].map(id => newTask(id, id, null))
  const order = (list: PlanItem[]) => list.map(i => i.id).join('')
  it('moves a task before another, or to the end', () => {
    expect(order(moveItem(items, 'd', 'b'))).toBe('adbc')
    expect(order(moveItem(items, 'a', null))).toBe('bcda')
    expect(order(moveItem(items, 'b', 'c'))).toBe('abcd')
  })
  it('leaves the list alone for an unknown task or place', () => {
    expect(moveItem(items, 'x', 'a')).toBe(items)
    expect(moveItem(items, 'a', 'x')).toBe(items)
  })
})
