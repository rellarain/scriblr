import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetStaffForTests, getStaffState } from '../../../../../feedback/staffStore'
import { feedbackBackend } from '../../../../../test/feedbackBackend'
import InboxSection from './InboxSection'

let backend: ReturnType<typeof feedbackBackend>
beforeEach(() => {
  __resetStaffForTests('adm-dana')
  backend = feedbackBackend()
})

const cards = () => screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))

describe('Helper > Inbox', () => {
  it('lists the messages nobody has checked yet, oldest first, with the count on the tab', async () => {
    render(<InboxSection />)
    expect(await screen.findByRole('button', { name: 'Check, 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(cards()).toEqual(['Feedback fb-5', 'Feedback fb-7'])
    // The words that could mean a verb are marked.
    expect(within(screen.getByRole('article', { name: 'Feedback fb-7' })).getByTitle('Could mean: Increase')).toHaveTextContent('brighter')
  })

  it('checks a message once it has a tone: it leaves the list and joins its statement', async () => {
    render(<InboxSection />)
    const card = await screen.findByRole('article', { name: 'Feedback fb-7' })
    const check = within(card).getByRole('button', { name: 'Check this message' })
    expect(check).toBeDisabled()
    fireEvent.click(within(card).getByRole('button', { name: 'Mixed' }))
    await waitFor(() => expect(check).toBeEnabled())
    fireEvent.click(check)
    await waitFor(() => expect(cards()).toEqual(['Feedback fb-5']))
    const shelf = getStaffState().bundle?.statements.find(s => s.channelId === 'writer/dashboard/scratchpad')
    expect(shelf?.messageIds).toEqual(['fb-2', 'fb-6', 'fb-7'])
    expect(backend.calls).toContain('PUT /feedback/messages/fb-7')
  })

  it('corrects the subject and the verb before checking', async () => {
    render(<InboxSection />)
    const card = await screen.findByRole('article', { name: 'Feedback fb-5' })
    fireEvent.click(within(card).getByRole('button', { name: 'Fix' }))
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Feedback fb-5' })).getByRole('button', { name: 'Fix' })).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(within(screen.getByRole('article', { name: 'Feedback fb-5' })).getByRole('button', { name: 'Admin' }))
    await waitFor(() => expect(getStaffState().bundle?.messages.find(m => m.id === 'fb-5')?.channelId).toBe('admin'))
  })

  it('opens a message\'s replies in a drawer, to ask the writer a question or comment for staff', async () => {
    render(<InboxSection />)
    const card = await screen.findByRole('article', { name: 'Feedback fb-5' })
    const chip = within(card).getByRole('button', { name: /0 replies/ })
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chip)
    expect(within(card).getByText('No replies yet.')).toBeInTheDocument()
    fireEvent.change(within(card).getByRole('textbox', { name: 'Ask the writer' }), { target: { value: 'Which button?' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Ask the writer' }))
    expect(await within(card).findByText('Which button?')).toBeInTheDocument()
    expect(within(card).getByText('Waiting for the writer')).toBeInTheDocument()
    fireEvent.change(within(card).getByRole('textbox', { name: 'Comment for staff' }), { target: { value: 'Seen this before.' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Comment for staff' }))
    expect(await within(card).findByText('Seen this before.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /2 replies/ })).toBeInTheDocument()
  })
})
