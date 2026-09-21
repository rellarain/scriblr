import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFeedback, resetFeedbackStore } from '../helper/inbox/feedbackStore'
import { bundle } from '../helper/inbox/inboxTestData'
import RoleAssignment from './RoleAssignment'

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: 'x', json: async () => body })

beforeEach(() => { resetFeedbackStore('adm-dana') })
afterEach(() => { vi.unstubAllGlobals() })

describe('Admin > Manager > Assignment', () => {
  it('lists the admins with a checkbox per role for the chosen console', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(bundle())))
    await loadFeedback()
    render(<RoleAssignment />)
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Processor on Helper > Inbox' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Configurer on Helper > Inbox' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Planner on Helper > Inbox' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Lee Park: Configurer on Helper > Inbox' })).not.toBeChecked()
    expect(screen.getByText('Changing roles as Dana Ruiz')).toBeInTheDocument()
  })

  it('sends the whole set of roles for that admin and console when a box is toggled', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(bundle()))
    vi.stubGlobal('fetch', fetchMock)
    await loadFeedback()
    render(<RoleAssignment />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lee Park: Configurer on Helper > Inbox' }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2))
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/feedback/admins/adm-lee/roles')
    expect(init).toMatchObject({ method: 'PUT', headers: expect.objectContaining({ 'X-Admin-Id': 'adm-dana' }) })
    expect(JSON.parse(String(init?.body))).toEqual({ console: 'Helper/Inbox', roles: ['processor', 'configurer'] })
  })

  it('switches console and shows the reason when the server refuses a change', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => reply(bundle()))
    vi.stubGlobal('fetch', fetchMock)
    await loadFeedback()
    render(<RoleAssignment />)
    fireEvent.change(screen.getByLabelText('Console'), { target: { value: 'Writer/Shelf' } })
    expect(screen.getByRole('checkbox', { name: 'Dana Ruiz: Processor on Writer > Shelf' })).not.toBeChecked()
    vi.stubGlobal('fetch', vi.fn(async () => reply({ detail: 'You cannot remove your own Configurer role on Helper > Inbox.' }, 403)))
    fireEvent.change(screen.getByLabelText('Console'), { target: { value: 'Helper/Inbox' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dana Ruiz: Configurer on Helper > Inbox' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot remove your own Configurer role')
  })
})
