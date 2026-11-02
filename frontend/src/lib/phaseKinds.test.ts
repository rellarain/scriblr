import { describe, expect, it } from 'vitest'
import { emptyPlanner, newMilestone, newPhase, newPhaseKind, newTask, type Planner } from './facets'
import { applyToRows, editMilestone, editPhase, kindFromPhase, newPass, passNumbers, removeKind, repeatPhase, resetMilestoneField, resetPhaseField, syncKind } from './phaseKinds'
import { milestonesOf } from './planSequence'

let n = 0
const id = (prefix: string) => `${prefix}${++n}`

const revision = newPhaseKind('k', 'Revision', {
  result: 'A cleaner draft', description: 'Mark it up, then fix it', lengthDays: 14,
  milestones: [{ id: 'km1', title: 'Marked up', result: 'Every page marked', lengthDays: 5 }, { id: 'km2', title: 'Fixed', result: 'Every mark answered', lengthDays: null }],
})
const base = (): Planner => ({ ...emptyPlanner(), timelineStart: '2026-11-01', phaseKinds: [revision] })
const book = { level: 'book' as const, nodeId: 'b1' }

describe('newPass', () => {
  it("is a card on the row from the kind's recipe, with a section for each of its milestones, dated after the last pass", () => {
    const one = newPass(base(), revision, book, id)
    const two = newPass(one, revision, book, id)
    const [a, b] = two.phases
    expect(a).toMatchObject({ title: 'Revision', result: 'A cleaner draft', kindId: 'k', level: 'book', nodeId: 'b1', order: 0, start: '2026-11-01', end: '2026-11-14', overrides: [] })
    expect(b).toMatchObject({ order: 1, start: '2026-11-15', end: '2026-11-28' })
    expect(milestonesOf(two, a.id).map(m => [m.title, m.kindMilestoneId, m.date])).toEqual([['Marked up', 'km1', '2026-11-05'], ['Fixed', 'km2', '2026-11-14']])
    expect([...passNumbers(two)]).toEqual([[a.id, 1], [b.id, 2]])
  })

  it('numbers the passes of each kind on each row on its own', () => {
    const p = newPass(newPass(newPass(base(), revision, book, id), revision, { level: 'project', nodeId: null }, id), revision, book, id)
    expect([...passNumbers(p).values()]).toEqual([1, 1, 2])
  })
})

describe('editing a pass', () => {
  const start = () => newPass(base(), revision, book, id)

  it("marks a field that differs from the kind as the pass's own, and frees it again when it matches", () => {
    const p = start()
    const pass = p.phases[0].id
    const edited = editPhase(p, pass, { result: 'My own result', lengthDays: 20 })
    expect(edited.phases[0].overrides.sort()).toEqual(['lengthDays', 'result'])
    expect(editPhase(edited, pass, { result: 'A cleaner draft' }).phases[0].overrides).toEqual(['lengthDays'])
    expect(resetPhaseField(edited, pass, 'lengthDays').phases[0]).toMatchObject({ lengthDays: 14, overrides: ['result'] })
  })

  it("marks and resets a section's own fields", () => {
    const p = start()
    const m = p.milestones[0].id
    const edited = editMilestone(p, m, { title: 'Pencil pass' })
    expect(edited.milestones[0].overrides).toEqual(['title'])
    expect(resetMilestoneField(edited, m, 'title').milestones[0]).toMatchObject({ title: 'Marked up', overrides: [] })
  })

  it('has no overrides on a phase that is no pass', () => {
    const p = { ...base(), phases: [newPhase('plain', 'Plain')] }
    expect(editPhase(p, 'plain', { result: 'x' }).phases[0].overrides).toEqual([])
  })
})

describe('syncKind', () => {
  it('brings every pass along in the fields it has not changed, and leaves the ones it has', () => {
    let p = newPass(newPass(base(), revision, book, id), revision, book, id)
    const [a, b] = p.phases
    p = editPhase(p, b.id, { result: 'Mine' })
    const next = syncKind(p, { ...revision, result: 'A much cleaner draft', lengthDays: 7, milestones: [{ ...revision.milestones[0], title: 'Marked up twice' }, revision.milestones[1]] })
    expect(next.phases.find(x => x.id === a.id)).toMatchObject({ result: 'A much cleaner draft', lengthDays: 7, start: '2026-11-01', end: '2026-11-07' })
    expect(next.phases.find(x => x.id === b.id)).toMatchObject({ result: 'Mine', lengthDays: 7, start: '2026-11-08', end: '2026-11-14' })
    expect(milestonesOf(next, a.id)[0].title).toBe('Marked up twice')
    expect(next.phaseKinds[0].result).toBe('A much cleaner draft')
  })

  it('adds a section the kind gained to each pass, and takes out one it lost, with what was placed in it let go', () => {
    let p = newPass(base(), revision, book, id)
    const lost = p.milestones[1].id
    p = { ...p, items: [newTask('t', 'T', null, { milestoneId: lost })] }
    const next = syncKind(p, { ...revision, milestones: [revision.milestones[0], { id: 'km3', title: 'Read aloud', result: '', lengthDays: null }] })
    expect(milestonesOf(next, next.phases[0].id).map(m => m.title)).toEqual(['Marked up', 'Read aloud'])
    expect(next.items[0].milestoneId).toBeNull()
  })

  it('adds a kind that is new', () => {
    const next = syncKind({ ...base(), phaseKinds: [] }, revision)
    expect(next.phaseKinds).toEqual([revision])
  })
})

describe('removeKind', () => {
  it('leaves its passes as plain phases', () => {
    const p = removeKind(editPhase(newPass(base(), revision, book, id), 'x', {}), 'k')
    expect(p.phaseKinds).toEqual([])
    expect(p.phases[0]).toMatchObject({ kindId: null, overrides: [] })
    expect(p.milestones.every(m => m.kindMilestoneId === null)).toBe(true)
  })
})

describe('repeatPhase', () => {
  it("copies a card as a plain one, next in its row, with its sections but none of its work or progress", () => {
    let p = newPass(base(), revision, book, id)
    const pass = p.phases[0].id
    p = { ...p, phases: p.phases.map(x => ({ ...x, status: 'done' as const })), milestones: p.milestones.map(m => ({ ...m, done: true, doneOn: '2026-11-03' })), items: [newTask('t', 'T', null, { milestoneId: p.milestones[0].id })] }
    const next = repeatPhase(p, pass, id)
    const copy = next.phases[1]
    expect(copy).toMatchObject({ title: 'Revision', kindId: null, status: 'planned', order: 1, level: 'book', nodeId: 'b1', start: '2026-11-15' })
    expect(milestonesOf(next, copy.id).map(m => [m.title, m.done, m.kindMilestoneId])).toEqual([['Marked up', false, null], ['Fixed', false, null]])
    expect(next.items).toHaveLength(1)
  })
})

describe('applyToRows', () => {
  it('stamps a phase onto each row given, still a pass of its kind, and not onto its own row again', () => {
    const p = newPass(base(), revision, book, id)
    const rows = [book, { level: 'chapter' as const, nodeId: 'c1' }, { level: 'chapter' as const, nodeId: 'c2' }]
    const next = applyToRows(p, p.phases[0].id, rows, id)
    expect(next.phases.map(x => [x.level, x.nodeId, x.kindId])).toEqual([['book', 'b1', 'k'], ['chapter', 'c1', 'k'], ['chapter', 'c2', 'k']])
    expect(next.phases[1]).toMatchObject({ start: '2026-11-01', status: 'planned' })
    expect(next.milestones.filter(m => m.phaseId === next.phases[2].id).map(m => m.kindMilestoneId)).toEqual(['km1', 'km2'])
  })

  it('does nothing for a phase that is gone', () => {
    const p = base()
    expect(applyToRows(p, 'nope', [book], id)).toBe(p)
  })
})

describe('dating from today', () => {
  it('dates a row that has no start from the day given', () => {
    const none = { ...emptyPlanner(), phaseKinds: [revision] }
    expect(newPass(none, revision, book, id).phases[0].start).toBeNull()
    expect(newPass(none, revision, book, id, '2026-11-02').phases[0]).toMatchObject({ start: '2026-11-02', end: '2026-11-15' })
    const p = newPass(none, revision, book, id, '2026-11-02')
    expect(repeatPhase(p, p.phases[0].id, id, '2026-11-02').phases[1].start).toBe('2026-11-16')
    expect(syncKind(p, { ...revision, lengthDays: 7 }, '2026-11-02').phases[0].end).toBe('2026-11-08')
  })
})

describe('kindFromPhase', () => {
  it('keeps a phase as a kind, and the phase becomes the first pass of it', () => {
    const phase = newPhase('ph', 'Polish', { result: 'Shiny', description: 'Sand it', lengthDays: 9, level: 'book', nodeId: 'b1', start: '2026-11-01', end: '2026-11-09' })
    const p = { ...emptyPlanner(), phases: [phase], milestones: [newMilestone('m1', 'Sanded', { phaseId: 'ph', result: 'Smooth', lengthDays: 3 }), newMilestone('m2', 'Varnished', { phaseId: 'ph', order: 1 })] }
    const r = kindFromPhase(p, 'ph', id)
    expect(r?.kind).toMatchObject({ title: 'Polish', result: 'Shiny', description: 'Sand it', lengthDays: 9 })
    expect(r?.kind.milestones.map(m => [m.title, m.result, m.lengthDays])).toEqual([['Sanded', 'Smooth', 3], ['Varnished', '', null]])
    expect(r?.planner.phases[0]).toMatchObject({ kindId: r?.kind.id, overrides: [] })
    expect(r?.planner.milestones.map(m => m.kindMilestoneId)).toEqual(r?.kind.milestones.map(m => m.id))
    // A pass made from it now follows it.
    const next = r ? syncKind(r.planner, { ...r.kind, result: 'Brilliant' }) : p
    expect(next.phases[0].result).toBe('Brilliant')
  })

  it('is nothing for a phase that is gone', () => {
    expect(kindFromPhase(emptyPlanner(), 'nope', id)).toBeNull()
  })
})

describe('a milestone with the helpers', () => {
  it('can be made by hand and is kept by the sequence helpers', () => {
    const p = { ...base(), phases: [newPhase('a', 'A', { lengthDays: 4 })], milestones: [newMilestone('m', 'M', { phaseId: 'a' })] }
    expect(milestonesOf(p, 'a')).toHaveLength(1)
  })
})
