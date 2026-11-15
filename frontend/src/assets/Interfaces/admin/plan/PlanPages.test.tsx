import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetStaffForTests, getStaffState, setActingAdmin } from '../../../../feedback/staffStore'
import { getPlanState } from '../../../../plan/projectPlanStore'
import { feedbackBackend } from '../../../../test/feedbackBackend'
import { BoardPage, MyWorkPage, NodePlanPage, TimelinePage } from './PlanPages'

let backend: ReturnType<typeof feedbackBackend>
beforeEach(() => {
  __resetStaffForTests('adm-dana')
  backend = feedbackBackend()
})

const items = () => getPlanState().view?.items ?? []
// A part of the app in the tree (the first of that name: the Draft console comes before its Draft component).
const pick = async (name: string) => {
  fireEvent.click((await screen.findAllByRole('button', { name }))[0])
}

describe('Project Plan > Plan', () => {
  it('shows a node\'s statements and accepts one, which becomes a task that answers it', async () => {
    render(<NodePlanPage />)
    await pick('Dashboard')
    await pick('Scratchpad')
    const node = screen.getByRole('region', { name: 'Plan of Writer > Dashboard > Scratchpad' })
    const card = within(node).getByRole('region', { name: 'Increase Writer > Dashboard > Scratchpad' })
    fireEvent.change(within(card).getByLabelText('Note on the decision, Increase'), { target: { value: 'Three reports.' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Accept Increase' }))
    expect(await within(node).findByRole('group', { name: 'Task: Increase Writer > Dashboard > Scratchpad' })).toBeInTheDocument()
    expect(items()[0].statementIds).toHaveLength(1)
    expect(getStaffState().bundle?.statements.find(s => s.channelId === 'writer/dashboard/scratchpad')?.decision).toBe('accepted')
    expect(within(card).getByText('Accepted')).toBeInTheDocument()
  })

  it('builds a procedure with a process and a task, and shows how far it has got', async () => {
    render(<NodePlanPage />)
    await pick('Draft')
    fireEvent.click(await screen.findByRole('button', { name: 'Add a procedure' }))
    const proc = await screen.findByRole('group', { name: 'Procedure: New procedure' })
    fireEvent.change(within(proc).getByLabelText('Title of New procedure'), { target: { value: 'Release' } })
    fireEvent.blur(within(proc).getByLabelText('Title of New procedure'))
    const release = await screen.findByRole('group', { name: 'Procedure: Release' })
    fireEvent.click(within(release).getByRole('button', { name: 'Add a task to Release' }))
    const task = await within(release).findByRole('group', { name: 'Task: New task' })
    fireEvent.change(within(task).getByLabelText('Status of New task'), { target: { value: 'done' } })
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Procedure: Release' })).getByTitle('Tasks done')).toHaveTextContent('1/1'))
    expect(items().map(i => [i.kind, i.parentId === null])).toEqual(expect.arrayContaining([['procedure', true], ['task', false]]))
  })

  it('leaves the plan read-only where the staff member acting is not a Planner', async () => {
    __resetStaffForTests('adm-lee')
    render(<NodePlanPage />)
    await pick('Draft')
    expect(screen.queryByRole('button', { name: 'Add a task' })).toBeNull()
  })
})

describe('Project Plan > My work, Board and Timeline', () => {
  async function seed() {
    render(<NodePlanPage />)
    await pick('Draft')
    fireEvent.click(await screen.findByRole('button', { name: 'Add a task' }))
    const task = await screen.findByRole('group', { name: 'Task: New task' })
    fireEvent.change(within(task).getByLabelText('Due date of New task'), { target: { value: '2026-11-20' } })
    await waitFor(() => expect(items()[0]?.due).toBe('2026-11-20'))
  }

  it('claims an unassigned item from My work, starts it and finishes it', async () => {
    await seed()
    const { unmount } = render(<MyWorkPage />)
    const open = await screen.findByRole('region', { name: 'To claim' })
    fireEvent.click(within(open).getByRole('button', { name: 'Claim New task' }))
    const mine = screen.getByRole('region', { name: 'Mine' })
    await waitFor(() => expect(within(mine).getByRole('article', { name: 'New task' })).toBeInTheDocument())
    fireEvent.click(within(mine).getByRole('button', { name: 'Start New task' }))
    await waitFor(() => expect(items()[0].status).toBe('inProgress'))
    fireEvent.click(within(mine).getByRole('button', { name: 'Finish New task' }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Done' })).getByRole('article', { name: 'New task' })).toBeInTheDocument())
    unmount()
  })

  it('moves a card along the Board with its buttons', async () => {
    await seed()
    render(<BoardPage />)
    const todo = await screen.findByRole('region', { name: 'To do' })
    fireEvent.click(within(todo).getByRole('button', { name: 'Move New task on' }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Claimed' })).getByRole('article', { name: 'New task' })).toBeInTheDocument())
    expect(backend.calls.some(c => c.startsWith('PATCH /project-plan/items/'))).toBe(true)
  })

  it('draws dated items on the Timeline by part of the app', async () => {
    await seed()
    render(<TimelinePage />)
    const row = await screen.findByRole('row', { name: /Writer > Draft/ })
    expect(within(row).getByTitle(/New task: 2026-11-20 to 2026-11-20/)).toBeInTheDocument()
  })

  it('loads the plan again when someone else is acting', async () => {
    await seed()
    render(<MyWorkPage />)
    await screen.findByRole('region', { name: 'Mine' })
    setActingAdmin('adm-lee')
    await waitFor(() => expect(getPlanState().view?.me).toBe('adm-lee'))
  })
})
