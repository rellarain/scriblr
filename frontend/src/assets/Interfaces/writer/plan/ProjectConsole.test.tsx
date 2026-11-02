import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getKv, setKv } from '../../../../settings/settingsStore'
import { mockFetchBy } from '../../../../test/mockFetch'
import { emptyDay, emptyPlanner, newExercise, newMilestone, newPhase, newProcess, newTask, type Planner } from '../../../../lib/facets'
import { DRAG_PLAN } from '../../../../lib/planDrop'
import { TEMPLATE_KEY } from './useTemplate'
import ProjectConsole from './ProjectConsole'

const TODAY = '2026-10-31'

function planner(): Planner {
  return {
    ...emptyPlanner(),
    phases: [
      newPhase('ph1', 'Outlining', { result: 'A chapter list I trust', status: 'done', start: '2026-10-01', end: '2026-10-20' }),
      newPhase('ph2', 'First draft', { result: '80,000 words', status: 'active', start: '2026-10-21', end: '2027-02-28' }),
    ],
    milestones: [newMilestone('m1', 'Outline locked', { phaseId: 'ph1', date: '2026-10-20' }), newMilestone('m2', 'Half way', { phaseId: 'ph2', date: '2026-12-15' })],
    items: [newTask('t1', 'Draft chapter 1', null, { phaseId: 'ph2', doneOn: '2026-10-30' }), newTask('t2', 'Draft chapter 2', null, { phaseId: 'ph2' })],
    processes: [newProcess('pr1', 'Revise a chapter', { phaseIds: ['ph2'], requiredMilestoneIds: ['m1'] }), newProcess('pr2', 'Proof a chapter')],
    exercises: [newExercise('ex1', 'Ten-minute sprint', { description: 'Write without stopping.', durationMinutes: 10, perWeek: 3, timesDone: 4 })],
  }
}

let saved: Planner[]
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  saved = []
  mockFetchBy((url, init) => {
    if (url.endsWith('/activity/facets')) return { today: TODAY, events: [], daily: { [TODAY]: { ...emptyDay(), draft: 100 } }, monthly: {} }
    if (url.endsWith('/planner')) {
      if (init?.method === 'PUT') { const body = JSON.parse(String(init.body)) as Planner; saved.push(body); return body }
      return planner()
    }
    if (url.endsWith('/analytics')) return { totals: { totalWordCount: 52200 }, nodeWordCounts: {} }
    if (url.endsWith('/outline')) return { nodes: [{ id: 'b1', kind: 'book', parentId: null, title: 'Book One' }] }
    if (url.endsWith('/plot')) return { nodes: [] }
    return {}
  })
})

const open = async () => {
  render(<ProjectConsole scope="project" projectIds={['p1']} titles={{ p1: 'Saga' }} />)
  await screen.findByRole('region', { name: 'Outlining' })
}
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const lastSaved = async (check: (p: Planner) => boolean) => { await waitFor(() => expect(saved.some(check)).toBe(true)); return saved.filter(check).at(-1) as Planner }

describe('the Project console', () => {
  it('has the plan, the goals, the work and the template as tiles, with the rail of them above', async () => {
    await open()
    expect(Array.from(document.querySelectorAll('[data-tile-id]')).map(t => t.getAttribute('data-tile-id')).sort()).toEqual(['goals', 'phases', 'template', 'work'])
    const rail = screen.getByRole('toolbar', { name: 'Project tiles tabs' })
    expect(within(rail).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Plan', 'Goals', 'Work', 'Template'])
  })

  it('lists the phases with their result, status and how far each is (what is tagged with it, done over all)', async () => {
    await open()
    const phases = within(tile('phases'))
    expect(phases.getByText('A chapter list I trust')).toBeTruthy()
    const draft = phases.getByRole('region', { name: 'First draft' })
    expect(within(draft).getByText('Active')).toBeTruthy()
    expect(within(draft).getByRole('progressbar', { name: 'First draft progress' }).getAttribute('aria-valuenow')).toBe('33') // 1 of 3: two tasks and a milestone, one task done
    expect(within(phases.getByRole('region', { name: 'Outlining' })).getByText('Done')).toBeTruthy()
  })

  it('edits a phase in place and saves the planner as it goes', async () => {
    const user = userEvent.setup()
    await open()
    const phases = within(tile('phases'))
    await user.click(phases.getByRole('button', { name: 'First draft details' }))
    const title = phases.getByRole('textbox', { name: 'Phase title' })
    await user.clear(title)
    await user.type(title, 'Draft')
    await user.click(phases.getByRole('radio', { name: 'Done' }))
    const got = await lastSaved(p => p.phases[1].title === 'Draft' && p.phases[1].status === 'done')
    expect(got.phases[1].result).toBe('80,000 words')
  })

  it('adds a phase with a milestone, ticks the milestone with the day, and takes a phase away leaving nothing pointing at it', async () => {
    const user = userEvent.setup()
    await open()
    const phases = within(tile('phases'))
    await user.click(phases.getByRole('button', { name: 'New phase on Saga' }))
    expect(phases.getByRole('textbox', { name: 'Phase title' })).toBeTruthy() // opened for editing
    await user.click(phases.getByRole('button', { name: 'New milestone on New phase' }))
    await user.click(phases.getByRole('checkbox', { name: 'New milestone achieved' }))
    const ticked = await lastSaved(p => p.milestones.some(m => m.done && m.title === 'New milestone'))
    expect(ticked.milestones.find(m => m.title === 'New milestone')?.doneOn).toBe(TODAY)
    await user.click(phases.getByRole('button', { name: 'First draft details' }))
    await user.click(phases.getByRole('button', { name: 'Delete First draft' }))
    const gone = await lastSaved(p => p.phases.length === 2 && !p.phases.some(x => x.id === 'ph2'))
    expect(gone.items.every(i => !i.phaseId)).toBe(true)
    expect(gone.processes[0].phaseIds).toEqual([])
  })

  it('offers to mark a phase done once everything tagged with it is', async () => {
    const user = userEvent.setup()
    await open()
    const phases = within(tile('phases'))
    await user.click(phases.getByRole('button', { name: 'First draft details' }))
    expect(phases.queryByRole('button', { name: 'Mark the phase done' })).toBeNull() // two tasks and a milestone: one of three is done
    await user.click(phases.getByRole('checkbox', { name: 'Half way achieved' }))
    const work = within(tile('work'))
    await user.click(work.getByRole('button', { name: /^Tasks/, expanded: false }))
    await user.click(work.getByRole('checkbox', { name: 'Draft chapter 2' }))
    await user.click(await phases.findByRole('button', { name: 'Mark the phase done' }))
    const got = await lastSaved(p => p.phases[1].status === 'done')
    expect(got.milestones[1].done).toBe(true)
  })

  it('adds a process, with a step group in order and one in any order, and the steps a recipe is made of', async () => {
    const user = userEvent.setup()
    await open()
    const work = within(tile('work'))
    await user.type(work.getByRole('textbox', { name: 'New process' }), 'Edit a scene{Enter}')
    await user.click(work.getByRole('button', { name: 'Add a step group' }))
    await user.type(work.getByRole('textbox', { name: 'New step in group 1' }), 'Read it aloud{Enter}')
    await user.type(work.getByRole('textbox', { name: 'New step in group 1' }), 'Cut a third{Enter}')
    await user.click(work.getByRole('button', { name: 'Add a step group' }))
    await user.click(within(work.getByRole('radiogroup', { name: 'Group 2 order' })).getByRole('radio', { name: 'Any order' }))
    await user.type(work.getByRole('textbox', { name: 'New step in group 2' }), 'Fix the dialogue{Enter}')
    const got = await lastSaved(p => p.processes.some(x => x.title === 'Edit a scene' && x.groups.length === 2 && x.groups[1].steps.length === 1))
    const made = got.processes.find(x => x.title === 'Edit a scene')
    expect(made?.groups.map(g => [g.ordered, g.steps.map(s => s.label)])).toEqual([[true, ['Read it aloud', 'Cut a third']], [false, ['Fix the dialogue']]])
  })

  it('shows a process as blocked until the milestones it needs are done, and its place in the sequence the links make', async () => {
    const user = userEvent.setup()
    await open()
    const work = within(tile('work'))
    const revise = work.getByRole('region', { name: 'Revise a chapter' })
    expect(within(revise).getByText(/Blocked/)).toBeTruthy()
    await user.click(within(revise).getByRole('button', { name: 'Revise a chapter details' }))
    await user.selectOptions(within(revise).getByRole('combobox', { name: 'Link to a process' }), 'pr2')
    const got = await lastSaved(p => p.processes[0].links.length === 1 && p.processes[1].links.length === 1)
    expect(got.processes[0].links).toEqual([{ otherId: 'pr2', relation: 'before' }])
    expect(got.processes[1].links).toEqual([{ otherId: 'pr1', relation: 'after' }])
    expect(within(revise).getByText('Stage 1')).toBeTruthy()
    expect(within(work.getByRole('region', { name: 'Proof a chapter' })).getByText('Stage 2')).toBeTruthy()
    await user.click(within(phases()).getByRole('button', { name: 'Outlining details' })) // its milestones show while it is open
    await user.click(within(phases()).getByRole('checkbox', { name: 'Outline locked achieved' }))
    await waitFor(() => expect(within(revise).queryByText(/Blocked/)).toBeNull())
  })

  it('logs an exercise each time it is done', async () => {
    const user = userEvent.setup()
    await open()
    const work = within(tile('work'))
    await user.click(work.getByRole('button', { name: /^Exercises/, expanded: false }))
    await user.click(work.getByRole('button', { name: 'Ten-minute sprint details' }))
    await user.click(work.getByRole('button', { name: 'I did Ten-minute sprint' }))
    const got = await lastSaved(p => p.exercises[0].timesDone === 5)
    expect(got.exercises[0].lastDone).toBe(TODAY)
  })

  it('lists the tasks, ticks one done with the day, and tags it with a phase', async () => {
    const user = userEvent.setup()
    await open()
    const work = within(tile('work'))
    await user.click(work.getByRole('button', { name: /^Tasks/, expanded: false }))
    expect(work.getAllByText('First draft', { selector: '.wrTaskFact' })).toHaveLength(2) // the phase beside each task of it
    await user.click(work.getByRole('checkbox', { name: 'Draft chapter 2' }))
    const got = await lastSaved(p => p.items[1].doneOn === TODAY)
    expect(got.items[1].phaseId).toBe('ph2')
  })

  it('has a grip on a process, an exercise and a routine to drag them onto the Agenda, and a lock instead on a process that is blocked', async () => {
    const user = userEvent.setup()
    await open()
    const work = within(tile('work'))
    expect(work.getByRole('img', { name: 'Revise a chapter cannot go on the Agenda yet: Needs Outline locked done first' })).toBeTruthy()
    const free = work.getByRole('img', { name: 'Drag Proof a chapter onto the Agenda' })
    expect(free.getAttribute('draggable')).toBe('true')
    await user.click(work.getByRole('button', { name: /^Exercises/, expanded: false }))
    const setData = vi.fn()
    fireEvent.dragStart(work.getByRole('img', { name: 'Drag Ten-minute sprint onto the Agenda' }), { dataTransfer: { setData, setDragImage: () => {}, effectAllowed: '' } })
    expect(setData).toHaveBeenCalledWith(DRAG_PLAN, JSON.stringify({ ownerId: 'p1', kind: 'exercise', id: 'ex1' }))
  })

  it('shows the chart of the project row, with a bar for each phase and a flag for each milestone', async () => {
    await open()
    const phases = within(tile('phases'))
    expect(phases.getByRole('group', { name: 'Saga on the timeline' })).toBeTruthy()
    expect(phases.getByRole('button', { name: /^First draft, Oct 21 to Feb 28/ })).toBeTruthy()
    expect(phases.getByRole('button', { name: 'Half way, Dec 15, not achieved' })).toBeTruthy()
  })

  it('has a row for each book of the outline, to put a phase of its own on', async () => {
    const user = userEvent.setup()
    await open()
    const phases = within(tile('phases'))
    expect(phases.getByRole('region', { name: 'Saga row' })).toBeTruthy()
    await user.click(phases.getByRole('button', { name: 'New phase on Book One' }))
    const got = await lastSaved(p => p.phases.some(x => x.level === 'book' && x.nodeId === 'b1'))
    expect(got.phases.find(x => x.nodeId === 'b1')).toMatchObject({ level: 'book', title: 'New phase', status: 'active' })
    expect(within(phases.getByRole('region', { name: 'Book One row' })).getByRole('region', { name: 'New phase' })).toBeTruthy()
  })

  describe('the template', () => {
    const template = (): Planner => ({
      ...emptyPlanner(),
      phases: [newPhase('t1', 'Outlining', { offsetDays: 0, lengthDays: 30 }), newPhase('t2', 'Drafting', { offsetDays: 30, lengthDays: 60 })],
      milestones: [newMilestone('tm', 'Outline locked', { offsetDays: 29, phaseId: 't1' })],
      processes: [newProcess('tp', 'Revise a chapter', { requiredMilestoneIds: ['tm'] })],
    })

    it('is a plan of its own to edit at the Dash, with days counted from the project start instead of dates', async () => {
      const user = userEvent.setup()
      setKv(TEMPLATE_KEY, template())
      render(<ProjectConsole scope="dash" projectIds={['p1']} titles={{ p1: 'Saga' }} />)
      await screen.findByRole('region', { name: 'Outlining' })
      await user.selectOptions(screen.getByRole('combobox', { name: 'Plan for' }), 'template')
      const phases = within(tile('phases'))
      const drafting = await phases.findByRole('region', { name: 'Drafting' })
      expect(within(drafting).getByText('from day 31, 60 days')).toBeTruthy()
      expect(phases.queryByRole('group', { name: 'Phase timeline' })).toBeNull() // no dates to draw
      await user.click(within(drafting).getByRole('button', { name: 'Drafting details' }))
      expect(within(drafting).queryByRole('radiogroup', { name: 'Status' })).toBeNull()
      const lasts = within(drafting).getByLabelText('Phase lasts days')
      await user.clear(lasts)
      await user.type(lasts, '90')
      expect((getKv<Planner>(TEMPLATE_KEY) as Planner).phases[1]).toMatchObject({ offsetDays: 30, lengthDays: 90 })
      expect(within(tile('template')).getByText(/You are editing the template/)).toBeTruthy()
      // Its cards are not dragged onto the Agenda, and nothing in it is blocked.
      expect(within(tile('work')).queryByRole('img', { name: /onto the Agenda/ })).toBeNull()
    })

    it('copies the items picked from the template into the project, dated from the start day asked, and takes the copy back', async () => {
      const user = userEvent.setup()
      setKv(TEMPLATE_KEY, template())
      await open()
      const tpl = within(tile('template'))
      await user.click(tpl.getByRole('checkbox', { name: 'Drafting' }))
      await user.click(tpl.getByRole('checkbox', { name: 'Revise a chapter' })) // it brings the milestone it needs
      expect((tpl.getByRole('checkbox', { name: 'Outline locked' }) as HTMLInputElement).checked).toBe(true)
      fireEvent.change(tpl.getByLabelText('Start day of the copy'), { target: { value: '2026-12-01' } })
      await user.click(tpl.getByRole('button', { name: 'Copy into Saga' }))
      expect((await tpl.findByRole('status')).textContent).toMatch(/Copied 1 phase, 1 milestone and 1 process into Saga, from 2026-12-01\./)
      const got = await lastSaved(p => p.phases.some(x => x.title === 'Drafting'))
      expect(got.phases.find(x => x.title === 'Drafting')).toMatchObject({ start: '2026-12-31', end: '2027-02-28', status: 'planned', offsetDays: null })
      const copied = got.milestones.find(x => x.title === 'Outline locked' && x.id !== 'm1') // (the project has one of its own with that name)
      expect(copied).toMatchObject({ date: '2026-12-30', phaseId: null }) // its phase was not picked
      expect(got.processes.find(x => x.title === 'Revise a chapter' && x.id !== 'pr1')?.requiredMilestoneIds).toEqual([copied?.id])
      // The template is untouched, and the copy can be taken back while nothing else has changed the plan.
      expect((getKv<Planner>(TEMPLATE_KEY) as Planner).phases).toHaveLength(2)
      await user.click(tpl.getByRole('button', { name: 'Undo the copy' }))
      await lastSaved(p => !p.phases.some(x => x.title === 'Drafting') && p.phases.length === 2)
      expect(tpl.getByRole('status').textContent).toBe('Took the copy back.')
    })

    it('says so when the template is empty, and saves picked items from the project into it, as days from the start', async () => {
      const user = userEvent.setup()
      await open()
      const tpl = within(tile('template'))
      expect(tpl.getByText(/The template is empty/)).toBeTruthy()
      await user.click(tpl.getByRole('button', { name: /^Save to the template/ }))
      await user.click(tpl.getByRole('checkbox', { name: 'First draft' }))
      await user.click(tpl.getByRole('button', { name: 'Add to the template' }))
      expect(tpl.getByRole('status').textContent).toBe('Saved 1 phase to the template.')
      const saved = getKv<Planner>(TEMPLATE_KEY) as Planner
      expect(saved.phases).toHaveLength(1)
      expect(saved.phases[0]).toMatchObject({ title: 'First draft', start: null, end: null, offsetDays: 20, lengthDays: 131 }) // 21 Oct to 28 Feb, counted from the project's earliest date, 1 Oct
    })
  })

  it('lets the Dash choose between the account and a project, each with its own plan', async () => {
    const user = userEvent.setup()
    render(<ProjectConsole scope="dash" projectIds={['p1']} titles={{ p1: 'Saga' }} />)
    await screen.findByRole('region', { name: 'Outlining' })
    const pick = screen.getByRole('combobox', { name: 'Plan for' })
    expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual(['Account', 'Saga', 'Template'])
    await user.selectOptions(pick, 'account')
    expect(await within(tile('phases')).findByText(/No phases yet/)).toBeTruthy()
    vi.useRealTimers()
  })
})

function phases() { return tile('phases') }
