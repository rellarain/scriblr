import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { feedbackBackend } from '../../../test/feedbackBackend'
import UserNotifications from './UserNotifications'

beforeEach(() => { feedbackBackend() })

describe('User > Dashboard > Notifications', () => {
  it('puts the questions asked of you first, then where the rest of your feedback stands', async () => {
    render(<UserNotifications />)
    const asking = await screen.findByRole('region', { name: 'Questions for you' })
    expect(within(asking).getByText('Questions for you (1)')).toBeInTheDocument()
    expect(within(asking).getByText(/Search inside the library/)).toBeInTheDocument()
    const rest = screen.getByRole('region', { name: 'Your feedback' })
    expect(within(rest).getByText(/The editor freezes/)).toBeInTheDocument()
    expect(within(rest).getByRole('listitem', { current: 'step' })).toHaveTextContent('In voting')
  })

  it('answers a question there, which moves the feedback down to the rest', async () => {
    render(<UserNotifications />)
    fireEvent.change(await screen.findByLabelText('Your answer to: Which words did you search for?'), { target: { value: 'Dragons.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send the answer' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Questions for you' })).toBeNull())
    expect(within(screen.getByRole('region', { name: 'Your feedback' })).getByText('Dragons.')).toBeInTheDocument()
  })
})
