import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { emptyPlanner, newExercise, newMilestone, newPhase, newPhaseKind, newProcess, newTask, type Planner } from '../../../../lib/facets'
import { DRAG_PLAN } from '../../../../lib/planDrop'
import { planRows } from '../../../../lib/planRows'
import { DRAG_SEQ } from './dragSeq'
import { PlanTimeline } from './PlanTimeline'

// The Plan tile: rows for the project, its books and its chapters, a lane of bars on a chart of days over the cards, and the sections of each phase.

const TODAY = '2026-11-02'
const rows = planRows([{ id: 'b1', kind: 'book', parentId: null, title: 'Book One' }, { id: 'c1', kind: 'chapter', parentId: 'b1', title: 'Opening' }], 'Saga')

function fixture(): Planner {
  return {
    ...emptyPlanner(),
    timelineStart: '2026-11-02',
    phases: [
      newPhase('plan', 'Planning', { order: 0, lengthDays: 10, start: '2026-11-02', end: '2026-11-11', status: 'active' }),
      newPhase('write', 'Writing', { order: 1, lengthDays: 20, start: '2026-11-12', end: '2026-12-01' }),
      newPhase('edit', 'Editing', { order: 0, lengthDays: 7, start: '2026-11-02', end: '2026-11-08', level: 'book', nodeId: 'b1' }),
    ],
    milestones: [
      newMilestone('m1', 'Outline done', { phaseId: 'plan', order: 0, date: '2026-11-06' }),
      newMilestone('m2', 'Beats set', { phaseId: 'plan', order: 1, date: '2026-11-11' }),
      newMilestone('bm', 'Marked up', { phaseId: 'edit', order: 0, date: '2026-11-08' }),
    ],
    items: [newTask('t1', 'Write the outline', null, { milestoneId: 'm1', phaseId: 'plan' }), newTask('t2', 'Loose task', null)],
    processes: [newProcess('pr', 'Plot a beat sheet')],
    exercises: [newExercise('ex', 'Sprint', { milestoneIds: ['bm'], phaseIds: ['edit'] })],
  }
}

let latest: Planner
function Harness({ initial = fixture() }: { initial?: Planner }) {
  const [planner, setPlanner] = useState(initial)
  latest = planner
  return <PlanTimeline ownerId="p1" planner={planner} setPlanner={setPlanner} today={TODAY} metGoals={new Set()} rows={rows} />
}

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

const dt = (extra: Record<string, unknown> = {}) => ({ setData: vi.fn(), setDragImage: () => {}, getData: () => '', effectAllowed: '', dropEffect: '', types: [], ...extra })
const grip = (name: string) => screen.getByRole('img', { name })
// jsdom has no drag data: the drop is built by hand.
const drop = (el: Element, data: ReturnType<typeof dt>) => { const e = createEvent.drop(el); Object.defineProperty(e, 'dataTransfer', { value: data }); fireEvent(el, e) }
const dragOver = (el: Element, data: ReturnType<typeof dt>) => { const e = createEvent.dragOver(el); Object.defineProperty(e, 'dataTransfer', { value: data }); fireEvent(el, e) }
const card = (name: string) => screen.getByRole('region', { name })
const order = (key: 'phases') => latest[key].map(p => [p.id, p.order, p.start])

describe('the rows', () => {
  it('are the project, its books and the chapters that have phases', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('region', { name: 'Saga row' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Book One row' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Opening row' })).toBeNull()
    expect(screen.getByText(/1 chapter with no phases is not shown/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show every chapter' }))
    expect(screen.getByRole('region', { name: 'Opening row' })).toBeTruthy()
  })

  it('take a new phase of their own, dated from the row start, with the chapter row', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Show every chapter' }))
    await user.click(screen.getByRole('button', { name: 'New phase on Opening' }))
    const made = latest.phases.find(p => p.level === 'chapter')
    expect(made).toMatchObject({ nodeId: 'c1', title: 'New phase', status: 'active', start: '2026-11-02' })
    expect(within(screen.getByRole('region', { name: 'Opening row' })).getByRole('region', { name: 'New phase' })).toBeTruthy()
  })

  it('fold away, and say how many phases they hold', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const row = within(screen.getByRole('region', { name: 'Saga row' }))
    expect(row.getByText('2 phases')).toBeTruthy()
    await user.click(row.getByRole('button', { name: 'Saga phases' }))
    expect(row.queryByRole('region', { name: 'Planning' })).toBeNull()
  })
})

describe('the chart', () => {
  it('draws a bar for each phase of a row in its lane, and a flag for each milestone', () => {
    render(<Harness />)
    const lane = within(screen.getByRole('group', { name: 'Saga on the timeline' }))
    expect(lane.getByRole('button', { name: /^Planning, Nov 2 to Nov 11/ })).toBeTruthy()
    expect(lane.getByRole('button', { name: /^Writing, Nov 12 to Dec 1/ })).toBeTruthy()
    expect(lane.getByRole('button', { name: 'Outline done, Nov 6, not achieved' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Book One on the timeline' })).getByRole('button', { name: /^Editing/ })).toBeTruthy()
  })

  it('marks the ruler by months, weeks or days as the zoom says', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const marks = () => Array.from(document.querySelectorAll('.wrPlanRuler span')).map(s => s.textContent)
    expect(marks()).toContain('Dec') // months: the first of each month
    await user.click(screen.getByRole('radio', { name: 'Weeks' }))
    expect(marks()).toContain('Nov 9')
    await user.click(screen.getByRole('radio', { name: 'Days' }))
    expect(marks()).toContain('3')
  })

  it('moves a phase a place with the arrow keys, and the row is dated again', () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole('button', { name: /^Writing, Nov 12/ }), { key: 'ArrowLeft' })
    expect(order('phases').filter(([id]) => id === 'write' || id === 'plan')).toEqual([['plan', 1, '2026-11-22'], ['write', 0, '2026-11-02']])
  })

  it('changes how long a phase lasts with Alt and the arrows, a week with Shift', () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole('button', { name: /^Planning, Nov 2/ }), { key: 'ArrowRight', altKey: true })
    expect(latest.phases.find(p => p.id === 'plan')).toMatchObject({ lengthDays: 11, end: '2026-11-12' })
    expect(latest.phases.find(p => p.id === 'write')?.start).toBe('2026-11-13')
    fireEvent.keyDown(screen.getByRole('button', { name: /^Planning, Nov 2/ }), { key: 'ArrowLeft', altKey: true, shiftKey: true })
    expect(latest.phases.find(p => p.id === 'plan')?.lengthDays).toBe(4)
  })

  it('ticks a milestone from its flag', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Outline done, Nov 6, not achieved' }))
    expect(latest.milestones.find(m => m.id === 'm1')).toMatchObject({ done: true, doneOn: TODAY })
  })

  it('says to give a phase dates when there is nothing to chart', () => {
    render(<Harness initial={emptyPlanner()} />)
    expect(screen.getByText(/to see the chart/)).toBeTruthy()
    expect(screen.getByText(/No phases yet/)).toBeTruthy()
  })
})

describe('the cards', () => {
  it('show their sections in the Sequence view, and only while open in the Dates view', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByRole('region', { name: 'Milestone Outline done' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Planning details' }))
    expect(screen.getByRole('region', { name: 'Milestone Outline done' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Planning details' }))
    await user.click(screen.getByRole('button', { name: 'Sequence view' }))
    expect(screen.getByRole('region', { name: 'Milestone Beats set' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Milestone Marked up' })).toBeTruthy()
    expect(document.querySelector('.wrLane')).toBeNull() // no chart in the Sequence view
  })

  it('reorder in their own row by dragging a grip onto another card', () => {
    render(<Harness />)
    const data = dt()
    fireEvent.dragStart(grip('Drag Writing to reorder it within this row'), { dataTransfer: data })
    expect(data.setData).toHaveBeenCalledWith(DRAG_SEQ, 'write')
    dragOver(card('Planning'), data)
    drop(card('Planning'), data)
    expect(order('phases').filter(([id]) => id !== 'edit')).toEqual([['plan', 1, '2026-11-22'], ['write', 0, '2026-11-02']])
  })

  it('refuse to be dropped on another row, and say why', () => {
    render(<Harness />)
    const data = dt()
    fireEvent.dragStart(grip('Drag Writing to reorder it within this row'), { dataTransfer: data })
    drop(card('Editing'), data)
    expect(screen.getByRole('status').textContent).toMatch(/Editing is on another row. It can only move inside its own row./)
    expect(latest.phases.find(p => p.id === 'write')).toMatchObject({ order: 1, start: '2026-11-12' })
  })

  it('edit a phase in place and note the pass of a kind', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Writing details' }))
    const title = screen.getByRole('textbox', { name: 'Phase title' })
    await user.clear(title)
    await user.type(title, 'Drafting')
    expect(latest.phases.find(p => p.id === 'write')?.title).toBe('Drafting')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Phase length in days' }), { target: { value: '5' } })
    expect(latest.phases.find(p => p.id === 'write')).toMatchObject({ lengthDays: 5, end: '2026-11-16' })
    await user.click(screen.getByRole('button', { name: 'Pin Drafting to its start' }))
    expect(latest.phases.find(p => p.id === 'write')?.fixed).toBe(true)
  })

  it('delete a phase with its sections and close the row up', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Planning details' }))
    await user.click(screen.getByRole('button', { name: 'Delete Planning' }))
    expect(latest.phases.map(p => p.id)).not.toContain('plan')
    expect(latest.milestones.map(m => m.id)).toEqual(['bm'])
    expect(latest.items.find(i => i.id === 't1')?.milestoneId).toBeNull()
    expect(latest.phases.find(p => p.id === 'write')?.start).toBe('2026-11-02')
  })
})

describe('the sections', () => {
  const sequence = async () => { const user = userEvent.setup(); render(<Harness />); await user.click(screen.getByRole('button', { name: 'Sequence view' })); return user }

  it('are achieved when the work in them is done, or ticked by hand', async () => {
    const user = await sequence()
    const outline = within(screen.getByRole('region', { name: 'Milestone Outline done' }))
    expect((outline.getByRole('checkbox', { name: 'Outline done achieved' }) as HTMLInputElement).checked).toBe(false)
    expect(outline.getByText('Write the outline')).toBeTruthy()
    await user.click(outline.getByRole('checkbox', { name: 'Outline done achieved' }))
    expect(latest.milestones.find(m => m.id === 'm1')).toMatchObject({ done: true, doneOn: TODAY })
  })

  it('move a place earlier or later with the buttons, and are dated again', async () => {
    const user = await sequence()
    await user.click(screen.getByRole('button', { name: 'Move Outline done later' }))
    expect(latest.milestones.filter(m => m.phaseId === 'plan').sort((a, b) => a.order - b.order).map(m => m.id)).toEqual(['m2', 'm1'])
    expect(screen.getByRole('button', { name: 'Move Beats set earlier' }).hasAttribute('disabled')).toBe(true)
  })

  it('take a new section, and a length, and pin to a date', async () => {
    const user = await sequence()
    await user.click(screen.getByRole('button', { name: 'New milestone on Planning' }))
    expect(latest.milestones.filter(m => m.phaseId === 'plan')).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Outline done date'), { target: { value: '2026-11-05' } })
    expect(latest.milestones.find(m => m.id === 'm1')).toMatchObject({ date: '2026-11-05', fixed: true })
  })

  it('give work to another section of the row by dragging it, and refuse another row', async () => {
    await sequence()
    const data = dt()
    fireEvent.dragStart(grip('Drag Write the outline to another milestone of this row'), { dataTransfer: data })
    drop(screen.getByRole('region', { name: 'Milestone Beats set' }), data)
    expect(latest.items.find(i => i.id === 't1')?.milestoneId).toBe('m2')

    fireEvent.dragStart(grip('Drag Sprint to another milestone of this row'), { dataTransfer: data })
    drop(screen.getByRole('region', { name: 'Milestone Beats set' }), data)
    expect(screen.getByRole('status').textContent).toMatch(/Beats set is on another row/)
    expect(latest.exercises[0].milestoneIds).toEqual(['bm'])
  })

  it('take in a process dragged from the Work tile, and a task from the Backlog, from any row', async () => {
    await sequence()
    const target = screen.getByRole('region', { name: 'Milestone Marked up' })
    drop(target, dt({ types: [DRAG_PLAN], getData: (t: string) => (t === DRAG_PLAN ? JSON.stringify({ ownerId: 'p1', kind: 'process', id: 'pr' }) : '') }))
    expect(latest.processes[0]).toMatchObject({ milestoneIds: ['bm'], phaseIds: ['edit'] })
    drop(target, dt({ types: ['application/x-scriblr-item'], getData: (t: string) => (t === 'application/x-scriblr-item' ? JSON.stringify({ ownerId: 'p1', itemId: 't2' }) : '') }))
    expect(latest.items.find(i => i.id === 't2')).toMatchObject({ milestoneId: 'bm', phaseId: 'edit' })
    // Work of another plan is not taken.
    drop(target, dt({ types: [DRAG_PLAN], getData: () => JSON.stringify({ ownerId: 'other', kind: 'process', id: 'pr' }) }))
    expect(latest.processes[0].milestoneIds).toEqual(['bm'])
  })

  it('take work out of a section, and show its progress', async () => {
    const user = await sequence()
    const marked = within(screen.getByRole('region', { name: 'Milestone Marked up' }))
    expect(marked.getByText('Sprint')).toBeTruthy()
    await user.click(marked.getByRole('button', { name: 'Take Sprint out of this milestone' }))
    expect(latest.exercises[0].milestoneIds).toEqual([])
    const outline = within(screen.getByRole('region', { name: 'Milestone Outline done' }))
    expect(outline.getByRole('progressbar', { name: 'Outline done progress' }).getAttribute('aria-valuenow')).toBe('0')
  })

  it('reorder by dragging one onto another in the same phase', async () => {
    await sequence()
    const data = dt()
    fireEvent.dragStart(grip('Drag Beats set to reorder it within this row'), { dataTransfer: data })
    drop(screen.getByRole('region', { name: 'Milestone Outline done' }), data)
    expect(latest.milestones.filter(m => m.phaseId === 'plan').sort((a, b) => a.order - b.order).map(m => m.id)).toEqual(['m2', 'm1'])
  })
})

describe('the kinds of phase', () => {
  const revision = newPhaseKind('k', 'Revision', {
    result: 'A cleaner draft', lengthDays: 14,
    milestones: [{ id: 'km1', title: 'Marked up', result: 'Every page marked', lengthDays: 5 }, { id: 'km2', title: 'Fixed', result: '', lengthDays: null }],
  })
  const withKind = (): Planner => ({ ...fixture(), phaseKinds: [revision] })
  const openKind = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /^Phase kinds/ }))
    await user.click(screen.getByRole('button', { name: 'Revision kind details' }))
  }

  it('are listed in a fold, with how many passes follow each, and one can be made', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /^Phase kinds/ }))
    await user.click(screen.getByRole('button', { name: 'New phase kind' }))
    expect(latest.phaseKinds).toHaveLength(1)
    expect(latest.phaseKinds[0].title).toBe('New kind')
    const title = screen.getByRole('textbox', { name: 'Kind title' })
    await user.clear(title)
    await user.type(title, 'Polish')
    await user.click(screen.getByRole('button', { name: 'New milestone in Polish' }))
    expect(latest.phaseKinds[0].title).toBe('Polish')
    expect(latest.phaseKinds[0].milestones).toHaveLength(1)
    expect(screen.getByText('No pass follows it yet.')).toBeTruthy()
  })

  it('give a row a pass from a choice on its head, numbered, with the sections of the kind', async () => {
    const user = userEvent.setup()
    render(<Harness initial={withKind()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'New pass on Saga' }), 'k')
    await user.selectOptions(screen.getByRole('combobox', { name: 'New pass on Saga' }), 'k')
    const passes = latest.phases.filter(p => p.kindId === 'k')
    expect(passes).toHaveLength(2)
    expect(passes.map(p => [p.title, p.result, p.start])).toEqual([['Revision', 'A cleaner draft', '2026-12-02'], ['Revision', 'A cleaner draft', '2026-12-16']])
    expect(latest.milestones.filter(m => m.phaseId === passes[0].id).map(m => m.title)).toEqual(['Marked up', 'Fixed'])
    expect(screen.getAllByText(/^Revision · [12]$/)).toHaveLength(2)
  })

  it('carry an edit of the kind to the passes that have not changed that field, and show which have', async () => {
    const user = userEvent.setup()
    render(<Harness initial={withKind()} />)
    const pick = screen.getByRole('combobox', { name: 'New pass on Saga' })
    await user.selectOptions(pick, 'k')
    await user.selectOptions(pick, 'k')
    const [a, b] = latest.phases.filter(p => p.kindId === 'k')
    // The second pass is given a result of its own.
    await user.click(screen.getAllByRole('button', { name: 'Revision details' })[1])
    const result = screen.getByRole('textbox', { name: 'Result' })
    await user.clear(result)
    await user.type(result, 'Mine')
    expect(latest.phases.find(p => p.id === b.id)?.overrides).toEqual(['result'])
    expect(screen.getByRole('button', { name: 'Reset the result of Revision to Revision' })).toBeTruthy()
    // The kind is changed.
    await openKind(user)
    const kindResult = screen.getByRole('textbox', { name: 'Kind result' })
    await user.clear(kindResult)
    await user.type(kindResult, 'Spotless')
    expect(latest.phases.find(p => p.id === a.id)?.result).toBe('Spotless')
    expect(latest.phases.find(p => p.id === b.id)?.result).toBe('Mine')
    // And the pass is put back to follow it.
    await user.click(screen.getByRole('button', { name: 'Reset the result of Revision to Revision' }))
    expect(latest.phases.find(p => p.id === b.id)).toMatchObject({ result: 'Spotless', overrides: [] })
    expect(screen.getByText(/2 passes follow it/)).toBeTruthy()
  })

  it('are left as plain phases when deleted', async () => {
    const user = userEvent.setup()
    render(<Harness initial={withKind()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'New pass on Saga' }), 'k')
    await openKind(user)
    await user.click(screen.getByRole('button', { name: 'Delete the Revision kind' }))
    expect(latest.phaseKinds).toEqual([])
    expect(latest.phases.find(p => p.title === 'Revision')).toMatchObject({ kindId: null, overrides: [] })
  })

  it('can be made from a phase, which becomes its first pass', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Planning details' }))
    await user.click(screen.getByRole('button', { name: 'Keep Planning as a kind' }))
    expect(latest.phaseKinds.map(k => [k.title, k.lengthDays, k.milestones.map(m => m.title)])).toEqual([['Planning', 10, ['Outline done', 'Beats set']]])
    expect(latest.phases.find(p => p.id === 'plan')?.kindId).toBe(latest.phaseKinds[0].id)
    expect(screen.queryByRole('button', { name: 'Keep Planning as a kind' })).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Planning is kept as a kind/)
  })
})

describe('repeating a phase and applying it to rows', () => {
  it('repeat puts the same phase again, next in its row, as a plain card with its sections', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Planning details' }))
    await user.click(screen.getByRole('button', { name: 'Repeat Planning' }))
    const copies = latest.phases.filter(p => p.title === 'Planning')
    expect(copies).toHaveLength(2)
    expect(copies[1]).toMatchObject({ kindId: null, status: 'planned', level: 'project', order: 2 })
    expect(latest.milestones.filter(m => m.phaseId === copies[1].id).map(m => m.title)).toEqual(['Outline done', 'Beats set'])
    expect(latest.items.filter(i => latest.milestones.find(m => m.id === i.milestoneId)?.phaseId === copies[1].id)).toEqual([])
  })

  it('apply stamps it onto the books and chapters under the row that are picked, leaving out a row that has one', async () => {
    const user = userEvent.setup()
    const base = fixture()
    render(<Harness initial={{ ...base, phases: [...base.phases, newPhase('own', 'Planning', { level: 'book', nodeId: 'b1', order: 5 })] }} />)
    await user.click(screen.getAllByRole('button', { name: 'Planning details' })[0])
    await user.click(screen.getByRole('button', { name: 'Apply Planning to other rows' }))
    const panel = within(screen.getByRole('group', { name: 'Apply Planning to' }))
    expect((panel.getByRole('checkbox', { name: /^Book One/ }) as HTMLInputElement).disabled).toBe(true) // it has a Planning already
    expect(panel.getByText('Book One (has one)')).toBeTruthy()
    expect((panel.getByRole('checkbox', { name: 'Opening' }) as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Apply Planning to the checked rows' }))
    const onChapter = latest.phases.find(p => p.level === 'chapter')
    expect(onChapter).toMatchObject({ nodeId: 'c1', title: 'Planning', status: 'planned', start: '2026-11-02' })
    expect(latest.milestones.filter(m => m.phaseId === onChapter?.id)).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toMatch(/Planning was applied to 1 row\./)
    expect(latest.phases.filter(p => p.level === 'book')).toHaveLength(2) // the book was not stamped again
  })

  it('has nothing to apply a chapter phase to', async () => {
    const user = userEvent.setup()
    const base = fixture()
    render(<Harness initial={{ ...base, phases: [...base.phases, newPhase('c', 'Scene pass', { level: 'chapter', nodeId: 'c1' })] }} />)
    await user.click(screen.getByRole('button', { name: 'Show every chapter' }))
    await user.click(screen.getByRole('button', { name: 'Scene pass details' }))
    expect(screen.queryByRole('button', { name: 'Apply Scene pass to other rows' })).toBeNull()
  })
})

describe('the projection', () => {
  // Two hours every weekday from today (a Monday), for the drafting.
  const weekdays = { kind: 'weekly' as const, every: 1, unit: 'week' as const, days: [0, 1, 2, 3, 4], rangeMax: null, anchor: TODAY, until: null }
  const shift = { id: 's1', title: 'Writing', facet: 'draft' as const, date: TODAY, startSlot: 54, endSlot: 66, targetNodeId: null, targetTree: null, target: null, recurrence: weekdays, pauses: [], skipped: [], overrides: {} }
  const scheduled = (): Planner => ({
    ...fixture(),
    shifts: [shift],
    items: [
      newTask('t1', 'Write the outline', null, { milestoneId: 'm1', phaseId: 'plan', estimateMinutes: 240, facet: 'draft' }),
      newTask('t2', 'Loose task', null),
    ],
  })

  it('says on a milestone, a phase and a row what is left to do and when it would be done', async () => {
    const user = userEvent.setup()
    render(<Harness initial={scheduled()} />)
    await user.click(screen.getByRole('button', { name: 'Sequence view' }))
    // Four hours is two shifts of two hours: Monday and Tuesday, ending on the 3rd, before the milestone's 6th.
    const milestone = within(screen.getByRole('region', { name: 'Milestone Outline done' }))
    expect(milestone.getByText('4 h · 0.4 wk · ends Nov 3 · ▲ Ahead 3d')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Planning' })).getAllByText(/^4 h · /).length).toBe(2) // the phase's, and its milestone's
    expect(within(screen.getByRole('region', { name: 'Saga row' })).getAllByText(/^4 h · /).length).toBeGreaterThan(0)
    expect(milestone.getByText('4 h · 0.4 wk · ends Nov 3 · ▲ Ahead 3d').getAttribute('aria-label')).toMatch(/4 h of work left; 0.4 wk of the time scheduled in a week; 2 working days and 2 shifts of the schedule; it ends on Nov 3; 3 days before the plan's Nov 6\./)
  })

  it('shows work with no estimate by the average, and no shifts scheduled when there are none', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Sequence view' }))
    expect(within(screen.getByRole('region', { name: 'Milestone Outline done' })).getByText('30 min · no shifts scheduled')).toBeTruthy()
  })

  it('says behind when the work runs past the day the plan gives it, and draws the tail on the chart', () => {
    const heavy = scheduled()
    render(<Harness initial={{ ...heavy, items: [newTask('t1', 'Big', null, { milestoneId: 'm1', phaseId: 'plan', estimateMinutes: 2400, facet: 'draft' })] }} />)
    // Twenty hours is ten shifts: two weeks, ending on the 13th against the phase's 11th.
    expect(screen.getAllByText(/▼ Behind/).length).toBeGreaterThan(0)
    expect(document.querySelector('.wrTimelineTail')).toBeTruthy()
  })

  it('gives a drafting phase the words left against the recent pace as a line of its own', () => {
    const goals = [{
      goal: { id: 'g', facet: 'draft' as const, scope: 'project' as const, nodeId: null, kind: null, daily: null, weekly: null, total: 80000, deadline: null },
      current: 30000, pct: 38, today: 0, week: 0, pace: 600, deadline: null, daysLeft: null, needed: null, finishes: '2027-01-24', status: null,
    }]
    const planner = scheduled()
    function WithGoals() {
      const [p, set] = useState(planner)
      latest = p
      return <PlanTimeline ownerId="p1" planner={p} setPlanner={set} today={TODAY} metGoals={new Set()} goals={goals} rows={rows} />
    }
    render(<WithGoals />)
    expect(screen.getByText('50,000 words left of 80,000; at 600 a day, about Jan 24.')).toBeTruthy() // the Planning phase has Draft work
    expect(screen.queryAllByText(/words left of/)).toHaveLength(1) // the Writing phase has none
  })
})
