import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyPlanner, newTask, type Planner, type Shift } from '../../../../lib/facets'
import { Backlog } from './Backlog'
import { ScheduleCard, type ScheduleOwner, type TicksApi } from './ScheduleCard'

const TODAY = '2026-10-31'
const shift = (id: string, title: string, over: Partial<Shift> = {}): Shift => ({
  id, title, facet: 'draft', date: TODAY, startSlot: 54, endSlot: 66, targetNodeId: null, targetTree: null, target: null, recurrence: null, pauses: [], skipped: [], overrides: {}, ...over,
})
const ticks: TicksApi = { get: () => [], loaded: () => true, load: () => {}, set: () => {} }
const COLORS = { p1: 'rgb(10, 20, 30)' }

let latest: Record<string, Planner>
function Dash({ onAddTo = () => {} }: { onAddTo?: (id: string) => void }) {
  const [planners, setPlanners] = useState<Record<string, Planner>>({
    account: { ...emptyPlanner(), shifts: [shift('a1', 'Taxes', { startSlot: 20, endSlot: 26 })] },
    p1: { ...emptyPlanner(), shifts: [shift('s1', 'Saga draft')] },
  })
  const [project, setProject] = useState<string | null>(null)
  const [addTo, setAddTo] = useState('p1')
  latest = planners
  const owners: ScheduleOwner[] = [
    { id: 'account', label: 'Account', projectId: null, planner: planners.account, setPlanner: p => setPlanners(prev => ({ ...prev, account: p })) },
    { id: 'p1', label: 'Saga', projectId: 'p1', planner: planners.p1, setPlanner: p => setPlanners(prev => ({ ...prev, p1: p })) },
  ]
  return (
    <ScheduleCard
      owners={owners} today={TODAY} nowSlot={0} events={[]} weekStart="monday" targets={[]} ticks={ticks}
      projects={{ project, onProject: setProject, addTo, onAddTo: id => { setAddTo(id); onAddTo(id) }, colors: COLORS }}
    />
  )
}
const block = (name: RegExp) => within(document.querySelector(`[data-date="${TODAY}"]`) as HTMLElement).queryByRole('button', { name })

describe('the Planner at the Dash', () => {
  it('shows every project\'s shifts, a project\'s in its colour and the account\'s with none', () => {
    render(<Dash />)
    expect(block(/^Taxes/)).toBeTruthy()
    const saga = block(/^Saga draft/) as HTMLElement
    expect(saga.classList.contains('wrSchedBlock--proj')).toBe(true)
    expect(saga.style.getPropertyValue('--wr-pc')).toBe(COLORS.p1)
    expect((block(/^Taxes/) as HTMLElement).classList.contains('wrSchedBlock--proj')).toBe(false)
  })

  it('shows one project at a time from the choice in its head, the account being one of the choices', async () => {
    const user = userEvent.setup()
    render(<Dash />)
    const choice = screen.getByRole('combobox', { name: 'Show project' })
    expect(within(choice).getAllByRole('option').map(o => o.textContent)).toEqual(['All projects', 'Account', 'Saga'])
    await user.selectOptions(choice, 'p1')
    expect(block(/^Taxes/)).toBeNull()
    expect(block(/^Saga draft/)).toBeTruthy()
    await user.selectOptions(choice, 'account')
    expect(block(/^Saga draft/)).toBeNull()
    expect(block(/^Taxes/)).toBeTruthy()
  })

  it('asks which project a new shift is for, the last one used being the first answer, and moves it when another is chosen', async () => {
    const user = userEvent.setup()
    const onAddTo = vi.fn()
    render(<Dash onAddTo={onAddTo} />)
    await user.click(screen.getByRole('button', { name: 'New shift' }))
    const panel = screen.getByRole('form', { name: 'New shift' })
    const project = within(panel).getByRole('combobox', { name: 'Project' }) as HTMLSelectElement
    expect(project.value).toBe('p1')
    expect(latest.p1.shifts).toHaveLength(2)
    await user.type(within(panel).getByLabelText('Title'), 'Pay the bills')
    await user.selectOptions(project, 'account')
    expect(onAddTo).toHaveBeenCalledWith('account')
    expect(latest.p1.shifts.map(s => s.title)).toEqual(['Saga draft'])
    expect(latest.account.shifts.map(s => s.title).sort()).toEqual(['Pay the bills', 'Taxes'])
    await user.type(within(panel).getByLabelText('Title'), '!')
    expect(latest.account.shifts.map(s => s.title).sort()).toEqual(['Pay the bills!', 'Taxes']) // it goes on being changed there
  })

  it('does not ask a project where there is only one', async () => {
    const user = userEvent.setup()
    const only: ScheduleOwner = { id: 'p1', label: 'Saga', projectId: 'p1', planner: emptyPlanner(), setPlanner: () => {} }
    render(<ScheduleCard owners={[only]} today={TODAY} nowSlot={0} events={[]} weekStart="monday" targets={[]} ticks={ticks} />)
    expect(screen.queryByRole('combobox', { name: 'Show project' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'New shift' }))
    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull()
  })
})

describe('the Backlog at the Dash', () => {
  const planners = {
    account: { ...emptyPlanner(), items: [newTask('t1', 'Renew passport', null, { priority: 'high' })] },
    p1: { ...emptyPlanner(), items: [newTask('t2', 'Fix chapter 4', null, { priority: 'high' })] },
  }
  const owners = [{ id: 'account', label: 'Account', planner: planners.account }, { id: 'p1', label: 'Saga', planner: planners.p1 }]
  const props = { owners, today: TODAY, nowSlot: 0, todayTicks: {}, onPlanner: () => {}, onTick: () => {}, events: [], targets: [], nodes: [] }

  it('lists every project\'s tasks with the project beside each, in its colour, and shows one project when it is chosen', () => {
    const { rerender } = render(<Backlog {...props} colors={COLORS} />)
    expect(screen.getByText('Renew passport')).toBeTruthy()
    const saga = screen.getByText('Saga', { selector: '.wrTaskFact' })
    expect((saga.querySelector('.wrSchedDot') as HTMLElement).style.background).toBe('rgb(10, 20, 30)')
    rerender(<Backlog {...props} colors={COLORS} project="p1" />)
    expect(screen.queryByText('Renew passport')).toBeNull()
    expect(screen.getByText('Fix chapter 4')).toBeTruthy()
  })

  it('shares its project choice with whoever holds it, and puts a new task where the last one went', async () => {
    const user = userEvent.setup()
    const onProject = vi.fn()
    const onAddTo = vi.fn()
    const onPlanner = vi.fn()
    render(<Backlog {...props} onPlanner={onPlanner} onProject={onProject} addTo="account" onAddTo={onAddTo} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Show project' }), 'p1')
    expect(onProject).toHaveBeenCalledWith('p1')
    expect((screen.getByRole('combobox', { name: 'Add to' }) as HTMLSelectElement).value).toBe('account')
    await user.type(screen.getByLabelText('New task'), 'Call the bank{Enter}')
    expect(onPlanner.mock.calls.at(-1)?.[0]).toBe('account')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Add to' }), 'p1')
    expect(onAddTo).toHaveBeenCalledWith('p1')
  })
})
