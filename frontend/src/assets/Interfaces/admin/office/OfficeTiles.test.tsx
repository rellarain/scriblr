import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStaffState } from '../../../../feedback/staffStore'
import { getRosterState } from '../../../../staff/rosterStore'
import { feedbackBackend } from '../../../../test/feedbackBackend'
import { ChannelTile, DepartmentTile, DeskTile, StaffTile, TeamTile, UserTile } from './OfficeTiles'

vi.setConfig({ testTimeout: 30000 })

// The slot in the tile's title bar that the tabs are put in (AUI gives each Office tile one).
let host: HTMLElement
beforeEach(() => {
  feedbackBackend()
  host = document.createElement('div')
  host.setAttribute('data-testid', 'title-bar')
  document.body.appendChild(host)
})
afterEach(() => { host.remove() })

const tabs = () => within(host).getByRole('tablist')
const openTab = (name: string) => fireEvent.click(within(tabs()).getByRole('tab', { name }))
const person = (id: string) => getRosterState().view?.people.find(p => p.id === id)
const statements = () => screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))

describe('the Office tiles', () => {
  it('puts the tabs in the title bar, opens one by click or arrow keys, and remembers the open one', async () => {
    const { unmount } = render(<DeskTile host={host} />)
    expect(within(tabs()).getAllByRole('tab').map(t => t.getAttribute('aria-label'))).toEqual(['Voting', 'Toning', 'Explication'])
    expect(within(tabs()).getByRole('tab', { name: 'Voting' })).toHaveAttribute('aria-selected', 'true')
    // the tabs are not in the body
    expect(screen.getByRole('tabpanel').contains(tabs())).toBe(false)
    openTab('Toning')
    expect(within(tabs()).getByRole('tab', { name: 'Toning' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(within(tabs()).getByRole('tab', { name: 'Toning' }), { key: 'ArrowRight' })
    const explication = within(tabs()).getByRole('tab', { name: 'Explication' })
    expect(explication).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(explication)
    unmount()
    render(<DeskTile host={host} />)
    expect(within(tabs()).getByRole('tab', { name: 'Explication' })).toHaveAttribute('aria-selected', 'true')
  })

  it("Desk's Toning sets a message's tone and its Explication what it is about and what should happen", async () => {
    render(<DeskTile host={host} />)
    openTab('Toning')
    const fix = await screen.findByRole('region', { name: 'Fix Writer > Draft > Draft' })
    fireEvent.click(within(within(fix).getByRole('group', { name: 'Tone of feedback fb-1' })).getByRole('button', { name: 'Mixed' }))
    await waitFor(() => expect(getStaffState().bundle?.messages.find(m => m.id === 'fb-1')?.tone).toBe('mixed'))
    openTab('Explication')
    const shelf = await screen.findByRole('region', { name: 'Increase Writer > Dashboard > Scratchpad' })
    expect(within(shelf).queryByRole('group', { name: 'Tone of feedback fb-6' })).toBeNull()
    fireEvent.change(within(shelf).getByLabelText('What should happen, feedback fb-6'), { target: { value: 'verb-fix' } })
    await waitFor(() => expect(getStaffState().bundle?.messages.find(m => m.id === 'fb-6')?.verbId).toBe('verb-fix'))
  })

  it("Department's picker chooses whose roster, details and teams are shown", async () => {
    render(<DepartmentTile host={host} />)
    const picker = await screen.findByRole('combobox', { name: 'Department' })
    openTab('Roster')
    await waitFor(() => expect(screen.getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Dana Ruiz', 'Lee Park']))
    fireEvent.change(picker, { target: { value: 'dep-support' } })
    expect(screen.getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Noor Haddad', 'Ari Chen', 'Sam Ortiz'])
    openTab('Details')
    expect(screen.getByText('1 team · 3 people · 1 admins · 2 helpers')).toBeInTheDocument()
    openTab('Teams')
    expect(screen.getByRole('listitem', { name: 'Help desk' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Writing tools' })).toBeNull()
    // parts with nothing to show yet say what they will hold
    openTab('Analytics')
    expect(screen.getByText(/Department analytics:/)).toBeInTheDocument()
  })

  it("Team's Members adds someone to the team and takes someone off it; Allotment lists only its people", async () => {
    render(<TeamTile host={host} />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Team' }), { target: { value: 'team-help' } })
    openTab('Allotment')
    await waitFor(() => expect(screen.getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Helper hours of Noor Haddad', 'Helper hours of Ari Chen', 'Helper hours of Sam Ortiz']))
    openTab('Members')
    fireEvent.change(screen.getByRole('combobox', { name: 'Add to Help desk' }), { target: { value: 'adm-lee' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to Help desk' }))
    await waitFor(() => expect(person('adm-lee')).toMatchObject({ teamId: 'team-help', departmentId: 'dep-support' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take Noor Haddad off Help desk' }))
    await waitFor(() => expect(person('hlp-noor')?.teamId).toBeNull())
  })

  it("Admin/Helper promotes on a console and to admin, demotes an admin to helper (who then leads nothing), and never terms the owner", async () => {
    render(<StaffTile host={host} />)
    const picker = await screen.findByRole('combobox', { name: 'Staff member' })
    fireEvent.change(picker, { target: { value: 'hlp-noor' } })
    openTab('Promote')
    expect(await screen.findByRole('button', { name: /^Promote Noor Haddad on Reader/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Make Noor Haddad an admin' }))
    await waitFor(() => expect(person('hlp-noor')?.kind).toBe('admin'))
    expect(await screen.findByRole('button', { name: 'Make Noor Haddad the manager of Help desk' })).toBeInTheDocument()

    fireEvent.change(picker, { target: { value: 'adm-sam' } })
    openTab('Demote')
    fireEvent.click(await screen.findByRole('button', { name: 'Make Sam Ortiz a helper' }))
    await waitFor(() => expect(person('adm-sam')?.kind).toBe('helper'))
    const view = getRosterState().view
    expect(view?.teams.find(t => t.id === 'team-help')?.managerId).toBeNull()
    expect(view?.departments.find(d => d.id === 'dep-support')?.directorId).toBeNull()

    fireEvent.change(picker, { target: { value: 'owner' } })
    openTab('Term')
    expect(screen.getByRole('button', { name: 'Term Owner' })).toBeDisabled()
    openTab('Demote')
    expect(screen.getByRole('button', { name: 'Make Owner a helper' })).toBeDisabled()
  })

  it("Channel's Helper-checked feedback shows the statements of the console picked", async () => {
    render(<ChannelTile host={host} />)
    const picker = await screen.findByRole('combobox', { name: 'Console' })
    openTab('Helper-checked feedback')
    fireEvent.change(picker, { target: { value: 'writer/draft' } })
    await waitFor(() => expect(statements()).toEqual(['Fix Writer > Draft > Draft']))
    fireEvent.change(picker, { target: { value: 'writer/dashboard' } })
    await waitFor(() => expect(statements()).toEqual(['Increase Writer > Dashboard > Scratchpad']))
    expect(screen.queryByLabelText('Show statements about')).toBeNull()
  })

  it("User's picker lists the writer and whoever asked for support, and Hire makes the user picked a helper", async () => {
    // a user asks for support in a chat
    await fetch('/api/support/chats', { method: 'POST', body: JSON.stringify({ userId: 'm.okafor', userName: 'Mia Okafor', focal: 'reader/library/catalog', text: 'How do I search by author?' }) })
    render(<UserTile host={host} />)
    const picker = screen.getByRole('combobox', { name: 'User' })
    await waitFor(() => expect(within(picker).getAllByRole('option').map(o => o.textContent)).toEqual(['Jordan Ellis', 'Mia Okafor']))
    fireEvent.change(picker, { target: { value: 'm.okafor' } })
    openTab('Hire')
    fireEvent.click(await screen.findByRole('button', { name: 'Hire Mia Okafor' }))
    expect(await screen.findByText('Mia Okafor is on the staff (Helper).')).toBeInTheDocument()
    expect(getRosterState().view?.people.find(p => p.name === 'Mia Okafor')?.kind).toBe('helper')
  })
})
