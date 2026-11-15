import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetStaffForTests, getStaffState } from '../../../../feedback/staffStore'
import { feedbackBackend } from '../../../../test/feedbackBackend'
import { ChannelManagementPage, VotingPage } from './StatementPages'

let backend: ReturnType<typeof feedbackBackend>
beforeEach(() => {
  __resetStaffForTests('adm-dana')
  backend = feedbackBackend()
})

const statements = () => screen.getAllByRole('region').map(r => r.getAttribute('aria-label'))

describe('Office > Voting', () => {
  it('lists the statements in voting, most messages first, and filters them by console', async () => {
    render(<VotingPage />)
    await waitFor(() => expect(statements()).toEqual([
      'Increase Writer > Dashboard > Scratchpad', 'Fix Writer > Draft > Draft', 'Improve Reader > Library > Catalog', 'Keep Reader > Nook > Stack',
    ]))
    const shelf = screen.getByRole('region', { name: 'Increase Writer > Dashboard > Scratchpad' })
    expect(within(shelf).getByText('2 messages')).toBeInTheDocument()
    expect(within(shelf).getByLabelText('1 yes, 1 no, 0 pass')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Show statements about'), { target: { value: 'reader' } })
    expect(statements()).toEqual(['Improve Reader > Library > Catalog', 'Keep Reader > Nook > Stack'])
  })

  it('records a vote (advice only), and the tally follows', async () => {
    render(<VotingPage />)
    const fix = await screen.findByRole('region', { name: 'Fix Writer > Draft > Draft' })
    fireEvent.click(within(fix).getByRole('button', { name: 'Vote yes on Fix Writer > Draft > Draft' }))
    await waitFor(() => expect(within(fix).getByLabelText('1 yes, 0 no, 0 pass')).toBeInTheDocument())
    expect(backend.calls.some(c => c.startsWith('PUT /feedback/statements/') && c.endsWith('/vote'))).toBe(true)
  })

  it('leaves the vote buttons off on a console where the admin acting is not a Voter', async () => {
    __resetStaffForTests('adm-sam')
    render(<VotingPage />)
    const fix = await screen.findByRole('region', { name: 'Fix Writer > Draft > Draft' })
    const yes = within(fix).getByRole('button', { name: 'Vote yes on Fix Writer > Draft > Draft' })
    expect(yes).toBeDisabled()
    expect(yes).toHaveAttribute('title', 'Voting needs the Voter role on Writer > Draft.')
  })
})

describe('Office > Channel Management', () => {
  it('moves a message to another verb: it leaves its statement and starts another', async () => {
    render(<ChannelManagementPage />)
    const shelf = await screen.findByRole('region', { name: 'Increase Writer > Dashboard > Scratchpad' })
    fireEvent.change(within(shelf).getByLabelText('What should happen, feedback fb-6'), { target: { value: 'verb-fix' } })
    expect(await screen.findByRole('region', { name: 'Fix Writer > Dashboard > Scratchpad' })).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Increase Writer > Dashboard > Scratchpad' })).getByText('1 message')).toBeInTheDocument())
  })

  it('sets the tone, moves a message up its path, and shows the reason when the server refuses a move', async () => {
    render(<ChannelManagementPage />)
    const fix = await screen.findByRole('region', { name: 'Fix Writer > Draft > Draft' })
    fireEvent.click(within(within(fix).getByRole('group', { name: 'Tone of feedback fb-1' })).getByRole('button', { name: 'Mixed' }))
    await waitFor(() => expect(getStaffState().bundle?.messages.find(m => m.id === 'fb-1')?.tone).toBe('mixed'))
    const about = () => within(screen.getByRole('region', { name: /^Fix Writer > Draft/ })).getByRole('group', { name: 'What feedback fb-1 is about' })
    fireEvent.click(within(about()).getAllByRole('button', { name: 'Draft' })[0])
    await waitFor(() => expect(getStaffState().bundle?.messages.find(m => m.id === 'fb-1')?.channelId).toBe('writer/draft'))
    // Dana is a Channel manager on the Writer's consoles, not on the Writer interface itself.
    fireEvent.click(within(about()).getByRole('button', { name: 'Writer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Moving a statement there needs the Channel manager role')
    expect(getStaffState().bundle?.messages.find(m => m.id === 'fb-1')?.channelId).toBe('writer/draft')
  })

  it('leaves the corrections off where the admin acting is not a Channel manager', async () => {
    __resetStaffForTests('adm-sam')
    render(<ChannelManagementPage />)
    const fix = await screen.findByRole('region', { name: 'Fix Writer > Draft > Draft' })
    expect(within(fix).getByLabelText('What should happen, feedback fb-1')).toBeDisabled()
  })
})
