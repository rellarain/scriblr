import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { emptyPlanner, newExercise, newMilestone, newPhase, newProcess, newTask, type Planner } from '../../../../lib/facets'
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
