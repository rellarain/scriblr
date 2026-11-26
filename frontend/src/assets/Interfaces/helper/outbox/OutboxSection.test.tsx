import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetStaffForTests, getStaffState } from '../../../../feedback/staffStore'
import { feedbackBackend } from '../../../../test/feedbackBackend'
import OutboxSection from './OutboxSection'

let backend: ReturnType<typeof feedbackBackend>
beforeEach(() => {
  __resetStaffForTests('adm-dana')
  backend = feedbackBackend()
})

const holdOne = () => backend.hold({ channelId: 'writer/draft/draft', verbId: 'verb-fix', text: 'Saving does nothing.', tone: null }, 'u-1', 'Jordan', 'adm-dana', 'chat-9')

describe('Helper > Outbox', () => {
  it('lists the feedback writers confirmed in your chats today, from whom', async () => {
    const id = holdOne()
    render(<OutboxSection />)
    const today = await screen.findByRole('region', { name: "From today's chats" })
    expect(within(today).getByRole('article', { name: `Feedback ${id}` })).toHaveTextContent('Saving does nothing.')
    expect(within(today).getByText('From Jordan')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Earlier' })).toBeNull()
  })

  it('completes it (its tone, here) and sends it, with a note, to the Inbox, where it waits to be checked', async () => {
    const id = holdOne()
    render(<OutboxSection />)
    const card = await screen.findByRole('article', { name: `Feedback ${id}` })
    const send = within(card).getByRole('button', { name: 'Send to the Inbox' })
    expect(send).toBeDisabled()
    fireEvent.click(within(card).getByRole('button', { name: 'Mixed' }))
    await waitFor(() => expect(send).toBeEnabled())
    expect(backend.calls).toContain(`PUT /feedback/outbox/${id}`)
    fireEvent.change(within(card).getByRole('textbox', { name: 'A note for staff (optional)' }), { target: { value: 'Asked about it twice.' } })
    fireEvent.click(send)
    await waitFor(() => expect(getStaffState().bundle?.outbox).toEqual([]))
    const sent = getStaffState().bundle?.messages.find(m => m.id === id)
    expect([sent?.checked, sent?.tone, sent?.comments.map(c => c.text)]).toEqual([false, 'mixed', ['Asked about it twice.']])
    expect(await screen.findByText(/Nothing to send/)).toBeInTheDocument()
  })

  it('says there is nothing to send when the Outbox is empty', async () => {
    render(<OutboxSection />)
    expect(await screen.findByText(/Nothing to send/)).toBeInTheDocument()
  })
})
