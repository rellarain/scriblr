import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setChannels } from '../../../channels/channelStore'
import { createMockChannels } from '../../../designSystem/mockChannels'
import { __resetStaffForTests, loadStaff } from '../../../feedback/staffStore'
import { staffBundle } from '../../../feedback/testData'
import type { ResourceNode } from '../../../api/types'
import RoleAssignment from './RoleAssignment'

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: 'x', json: async () => body })

beforeEach(() => {
  __resetStaffForTests('adm-dana')
  setChannels((createMockChannels().channels().body as { nodes: ResourceNode[] }).nodes)
})

describe('Admin > Office > Assignment', () => {
  it('lists the admins with a checkbox per role for the chosen console', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(staffBundle())))
    await loadStaff()
    render(<RoleAssignment />)
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Checker on Helper > Inbox' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Channel manager on Helper > Inbox' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Planner on Helper > Inbox' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Lee Park: Channel manager on Helper > Inbox' })).not.toBeChecked()
    expect(screen.getByText('Changing roles as Dana Ruiz')).toBeInTheDocument()
    // Interfaces and their consoles are offered.
    expect(screen.getByRole('option', { name: 'Writer (the interface)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Writer > Draft' })).toBeInTheDocument()
  })

  it('sends the whole set of roles for that admin and console when a box is toggled', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(staffBundle()))
    vi.stubGlobal('fetch', fetchMock)
    await loadStaff()
    render(<RoleAssignment />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lee Park: Voter on Helper > Inbox' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/feedback/admins/adm-lee/roles')
    expect(init).toMatchObject({ method: 'PUT', headers: expect.objectContaining({ 'X-Admin-Id': 'adm-dana' }) })
    expect(JSON.parse(String(init?.body))).toEqual({ scope: 'helper/inbox', roles: ['checker', 'voter'] })
  })

  it('switches console and shows the reason when the server refuses a change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(staffBundle())))
    await loadStaff()
    render(<RoleAssignment />)
    fireEvent.change(screen.getByLabelText('Console'), { target: { value: 'writer/draft' } })
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Planner on Writer > Draft' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Lee Park: Planner on Writer > Draft' })).not.toBeChecked()
    vi.stubGlobal('fetch', vi.fn(async () => reply({ detail: 'You cannot remove your own Channel manager role on Helper > Inbox.' }, 403)))
    fireEvent.change(screen.getByLabelText('Console'), { target: { value: 'helper/inbox' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dana Ruiz: Channel manager on Helper > Inbox' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot remove your own Channel manager role')
  })
})
