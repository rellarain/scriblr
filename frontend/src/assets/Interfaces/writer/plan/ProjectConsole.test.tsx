import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { mockFetchBy } from '../../../../test/mockFetch'
import { emptyDay, emptyPlanner, newExercise, newMilestone, newPhase, newProcess, newTask, type Planner } from '../../../../lib/facets'
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
  await screen.findByText('Outlining')
}
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const lastSaved = async (check: (p: Planner) => boolean) => { await waitFor(() => expect(saved.some(check)).toBe(true)); return saved.filter(check).at(-1) as Planner }

describe('the Project console', () => {
  it('has the phases, the goals and the work as tiles, with the rail of them above', async () => {
    await open()
    expect(Array.from(document.querySelectorAll('[data-tile-id]')).map(t => t.getAttribute('data-tile-id')).sort()).toEqual(['goals', 'phases', 'work'])
    const rail = screen.getByRole('toolbar', { name: 'Project tiles tabs' })
    expect(within(rail).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Phases', 'Goals', 'Work'])
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
    await user.click(phases.getByRole('button', { name: 'New phase' }))
    expect(phases.getByRole('textbox', { name: 'Phase title' })).toBeTruthy() // opened for editing
    await user.click(phases.getByRole('button', { name: 'New milestone on New phase' }))
    await user.click(phases.getByRole('checkbox', { name: 'New milestone done' }))
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
    await user.click(phases.getByRole('checkbox', { name: 'Half way done' }))
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
    await user.click(within(phases()).getByRole('checkbox', { name: 'Outline locked done' }))
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

  it('lets the Dash choose between the account and a project, each with its own plan', async () => {
    const user = userEvent.setup()
    render(<ProjectConsole scope="dash" projectIds={['p1']} titles={{ p1: 'Saga' }} />)
    await screen.findByText('Outlining')
    const pick = screen.getByRole('combobox', { name: 'Plan for' })
    expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual(['Account', 'Saga'])
    await user.selectOptions(pick, 'account')
    expect(await within(tile('phases')).findByText(/No phases yet/)).toBeTruthy()
    vi.useRealTimers()
  })
})

function phases() { return tile('phases') }
