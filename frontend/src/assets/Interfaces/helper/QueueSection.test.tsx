import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setChannels } from '../../../channels/channelStore'
import { createMockChannels } from '../../../designSystem/mockChannels'
import { __resetStaffForTests, loadStaff, setActingAdmin } from '../../../feedback/staffStore'
import type { ResourceNode } from '../../../api/types'
import { getStaffChats, loadStaffChats, startChat, takeChat } from '../../../support/supportStores'
import { feedbackBackend } from '../../../test/feedbackBackend'
import QueueSection from './QueueSection'
import SettingsSection from './SettingsSection'

// The pretend store gives everyone with helper hours except Noor a block around now (designSystem/mockSupport.ts). Ari is a helper:
// tier 2 on the Writer's consoles (promoted on the interface). Dana is an admin: channel support of Writer > Draft (tier 3), no hours.
beforeEach(async () => {
  feedbackBackend()
  __resetStaffForTests('hlp-ari')
  setChannels((createMockChannels().channels().body as { nodes: ResourceNode[] }).nodes)
  await act(async () => { await loadStaff() })
})

const draftRow = () => screen.getByRole('switch', { name: 'Take chats from Writer > Draft' })

describe('Queue console', () => {
  it("is a helper's switchboard: optional queues toggle, required ones are on", async () => {
    render(<QueueSection />)
    expect(await screen.findByText('On shift')).toBeInTheDocument()
    const board = screen.getByRole('region', { name: 'Switchboard' })
    // Only consoles where Ari has a tier: the Writer's, not the Reader's.
    expect(within(board).queryByRole('switch', { name: /Reader/ })).toBeNull()
    expect(draftRow()).toHaveAttribute('aria-checked', 'false')
    expect(draftRow()).toBeEnabled()
    fireEvent.click(draftRow())
    await waitFor(() => expect(draftRow()).toHaveAttribute('aria-checked', 'true'))
    // Three waiting makes it medium: required for tier 2, on and locked.
    fireEvent.click(draftRow())
    await waitFor(() => expect(draftRow()).toHaveAttribute('aria-checked', 'false'))
    await act(async () => { for (const t of ['a', 'b', 'c']) await startChat('writer/draft/draft', t) })
    await waitFor(() => expect(draftRow()).toHaveAttribute('aria-checked', 'true'))
    expect(draftRow()).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Queues' })).toBeNull()
  })

  it("shows admins each queue's people and chats without messages, and its channel support sets the levels", async () => {
    // Ari takes a chat; then Dana looks.
    await act(async () => {
      await startChat('writer/draft/draft', 'Pasting freezes.')
      await loadStaffChats()
      await takeChat(getStaffChats().view.waiting[0].id)
    })
    await act(async () => { setActingAdmin('adm-dana'); await loadStaff() })
    render(<QueueSection />)
    const queues = await screen.findByRole('region', { name: 'Queues' })
    const card = within(queues).getByText('Writer > Draft').closest('details') as HTMLElement
    fireEvent.click(within(card).getByText('Writer > Draft'))
    const people = within(card).getByRole('list', { name: 'People on Writer > Draft' })
    expect(within(people).getByText('Ari Chen').closest('li')).toHaveTextContent('Active')
    const chats = within(card).getByRole('table', { name: 'Chats in progress on Writer > Draft' })
    expect(chats).toHaveTextContent('Ari Chen')
    expect(chats).not.toHaveTextContent('Pasting freezes.')
    fireEvent.change(within(card).getByLabelText('Raise the level of Writer > Draft'), { target: { value: 'urgent' } })
    await waitFor(() => expect(within(card).getByText('Urgent')).toBeInTheDocument())
  })
})

describe('Helper > Settings', () => {
  it("shows this week's fixed hours and saves next week's within the allotment", async () => {
    render(<SettingsSection />)
    const thisWeek = await screen.findByRole('region', { name: 'This week' })
    expect(thisWeek).toHaveTextContent('4 h')
    const next = screen.getByRole('region', { name: 'Next week' })
    const monday = within(next).getByRole('switch', { name: 'Work on Monday' })
    if (monday.getAttribute('aria-checked') === 'true') fireEvent.click(monday)
    fireEvent.click(within(next).getByRole('switch', { name: 'Work on Monday' }))
    fireEvent.click(within(next).getByRole('button', { name: 'Raise Monday hours' }))
    expect(within(next).getByRole('group', { name: 'Monday hours' })).toHaveTextContent('5 h')
    fireEvent.click(within(next).getByRole('button', { name: 'Save next week' }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Next week' })).getByRole('button', { name: 'Save next week' })).toBeDisabled())
    expect(screen.getByRole('region', { name: 'This week' })).toHaveTextContent('4 h')
  })

  it('says so when no helper hours are allotted', async () => {
    __resetStaffForTests('adm-dana')
    await act(async () => { await loadStaff() })
    render(<SettingsSection />)
    expect(await screen.findByText('No helper hours are allotted to you.')).toBeInTheDocument()
  })
})
