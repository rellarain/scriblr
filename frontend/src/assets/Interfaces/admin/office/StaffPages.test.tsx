import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetStaffForTests } from '../../../../feedback/staffStore'
import { getRosterState } from '../../../../staff/rosterStore'
import { feedbackBackend } from '../../../../test/feedbackBackend'
import { setChannels } from '../../../../channels/channelStore'
import { createMockChannels } from '../../../../designSystem/mockChannels'
import type { ResourceNode } from '../../../../api/types'
import { AllotmentPage, DepartmentsPage, HirePage, RosterPage, SlaPage, TrainingPage } from './StaffPages'

let backend: ReturnType<typeof feedbackBackend>
beforeEach(() => {
  __resetStaffForTests('adm-dana')
  backend = feedbackBackend()
})

const person = (id: string) => getRosterState().view?.people.find(p => p.id === id)

describe('Office staff pages', () => {
  it('lists one roster by department, then tier, active above inactive, then by name', async () => {
    render(<RosterPage />)
    const support = await screen.findByRole('region', { name: 'Support' })
    expect(within(support).getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Noor Haddad', 'Ari Chen', 'Sam Ortiz'])
    expect(within(support).getAllByRole('row')[3]).toHaveTextContent('Tier 4')
    const product = screen.getByRole('region', { name: 'Product' })
    expect(within(product).getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Dana Ruiz', 'Lee Park'])
  })

  it('hires a person into a team and terms them (kept, marked as left)', async () => {
    render(<HirePage />)
    const form = await screen.findByRole('form', { name: 'Hire' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Kim Lowe' } })
    fireEvent.change(within(form).getByLabelText('Team'), { target: { value: 'team-writing' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Hire' }))
    const term = await screen.findByRole('button', { name: 'Term Kim Lowe' })
    fireEvent.click(term)
    expect(await screen.findByRole('button', { name: 'Rehire Kim Lowe' })).toBeInTheDocument()
    expect(getRosterState().view?.people.find(p => p.name === 'Kim Lowe')).toMatchObject({ active: false, departmentId: 'dep-product' })
  })

  it('edits departments and teams: a new team with a manager', async () => {
    render(<DepartmentsPage />)
    const product = await screen.findByRole('region', { name: 'Product' })
    fireEvent.change(within(product).getByLabelText('New team in Product'), { target: { value: 'Storage' } })
    fireEvent.click(within(product).getByRole('button', { name: 'Add a team to Product' }))
    const storage = await within(screen.getByRole('region', { name: 'Product' })).findByRole('listitem', { name: 'Storage' })
    fireEvent.change(within(storage).getByLabelText('Manager of Storage'), { target: { value: 'adm-lee' } })
    await waitFor(() => expect(getRosterState().view?.teams.find(t => t.name === 'Storage')?.managerId).toBe('adm-lee'))
    // A department with people in it is not deleted.
    fireEvent.click(within(screen.getByRole('region', { name: 'Support' })).getByRole('button', { name: 'Delete Support' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Move its teams and people out first.')
  })

  it('allots helper hours from the four choices', async () => {
    render(<AllotmentPage />)
    const noor = await screen.findByRole('group', { name: 'Helper hours of Noor Haddad' })
    expect(within(noor).getAllByRole('button').map(b => b.textContent)).toEqual(['None', '5 h', '10 h', '20 h', '30 h'])
    fireEvent.click(within(noor).getByRole('button', { name: '30 h' }))
    await waitFor(() => expect(person('hlp-noor')?.allotment).toBe(30))
  })

  it('sets the SLA per priority with steppers, an hour at a time up to a day and then by days', async () => {
    render(<SlaPage />)
    const urgent = await screen.findByRole('group', { name: 'SLA for Urgent' })
    expect(urgent).toHaveTextContent('4 h')
    fireEvent.click(within(urgent).getByRole('button', { name: 'Lengthen the Urgent SLA' }))
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'SLA for Urgent' })).getByText('5 h')).toBeInTheDocument())
    const low = screen.getByRole('group', { name: 'SLA for Low' })
    expect(low).toHaveTextContent('7 days')
    fireEvent.click(within(low).getByRole('button', { name: 'Shorten the Low SLA' }))
    await waitFor(() => expect(getRosterState().view?.sla.low).toBe(144))
    expect(backend.calls).toContain('PUT /staff/sla')
  })

  it('records finished training, and only their director promotes', async () => {
    setChannels((createMockChannels().channels().body as { nodes: ResourceNode[] }).nodes)
    render(<TrainingPage />)
    // Dana directs Product; Noor is in Support, so Dana cannot promote her.
    const noor = await screen.findByRole('region', { name: 'Training of Noor Haddad' })
    expect(within(noor).getByRole('button', { name: 'Promote Noor Haddad on Reader' })).toBeDisabled()
    // Anyone records a finished training.
    fireEvent.change(within(noor).getByLabelText('Training Noor Haddad finished'), { target: { value: 'reader/nook' } })
    fireEvent.click(within(noor).getByRole('button', { name: "Record Noor Haddad's finished training" }))
    await waitFor(() => expect(person('hlp-noor')?.training.some(r => r.nodeId === 'reader/nook')).toBe(true))
    expect(within(noor).getByRole('rowheader', { name: 'Reader > Nook' })).toBeInTheDocument()
  })

  it('a director promotes, which gives the tier', async () => {
    __resetStaffForTests('adm-sam')
    setChannels((createMockChannels().channels().body as { nodes: ResourceNode[] }).nodes)
    render(<TrainingPage />)
    const noor = await screen.findByRole('region', { name: 'Training of Noor Haddad' })
    await waitFor(() => expect(within(noor).getByRole('button', { name: 'Promote Noor Haddad on Reader' })).toBeEnabled())
    fireEvent.click(within(noor).getByRole('button', { name: 'Promote Noor Haddad on Reader' }))
    await waitFor(() => expect(person('hlp-noor')?.tier).toBe(2))
    expect(await within(noor).findByRole('button', { name: "Take back Noor Haddad's promotion on Reader" })).toBeInTheDocument()
  })
})
