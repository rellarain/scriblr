import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoteControl } from './VoteControl'
import type { FeedbackVote } from './feedbackTypes'

const vote = (over: Partial<FeedbackVote> = {}): FeedbackVote => ({
  adminId: 'me', approve: false, deny: false, approveNote: '', denyNote: '', updatedAt: '', ...over,
})

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const forBtn = () => screen.getByRole('button', { name: /vote for/i })
const againstBtn = () => screen.getByRole('button', { name: /vote against/i })

describe('VoteControl', () => {
  it('starts as two square buttons with their note fields collapsed', () => {
    render(<VoteControl label="this statement" onChange={() => {}} />)
    expect(forBtn()).toHaveAttribute('aria-pressed', 'false')
    expect(againstBtn()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText(/note on your vote for/i)).toBeDisabled()
  })

  it('turns a side on at once and opens its note', () => {
    const onChange = vi.fn()
    render(<VoteControl label="this statement" onChange={onChange} />)
    fireEvent.click(forBtn())
    expect(onChange).toHaveBeenCalledWith({ approve: true, deny: false, approveNote: '', denyNote: '' })
    expect(forBtn()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/note on your vote for/i)).toBeEnabled()
  })

  it('lets both sides be on at once, each with its own note', () => {
    const onChange = vi.fn()
    render(<VoteControl label="this statement" onChange={onChange} />)
    fireEvent.click(forBtn())
    fireEvent.click(againstBtn())
    expect(forBtn()).toHaveAttribute('aria-pressed', 'true')
    expect(againstBtn()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText(/note on your vote against/i), { target: { value: 'Too risky' } })
    fireEvent.change(screen.getByLabelText(/note on your vote for/i), { target: { value: 'Clear need' } })
    act(() => { vi.advanceTimersByTime(600) })
    expect(onChange).toHaveBeenLastCalledWith({ approve: true, deny: true, approveNote: 'Clear need', denyNote: 'Too risky' })
  })

  it('saves a note after a pause, once, and on leaving the field', () => {
    const onChange = vi.fn()
    render(<VoteControl vote={vote({ approve: true })} label="this statement" onChange={onChange} />)
    const note = screen.getByLabelText(/note on your vote for/i)
    fireEvent.change(note, { target: { value: 'Why' } })
    fireEvent.change(note, { target: { value: 'Why not' } })
    expect(onChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(600) })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ approve: true, deny: false, approveNote: 'Why not', denyNote: '' })
    fireEvent.change(note, { target: { value: 'Final' } })
    fireEvent.blur(note)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ approve: true, deny: false, approveNote: 'Final', denyNote: '' })
  })

  it('withdraws a side, and its note, when its button is clicked again', () => {
    const onChange = vi.fn()
    render(<VoteControl vote={vote({ deny: true, denyNote: 'No' })} label="this statement" onChange={onChange} />)
    expect(againstBtn()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(againstBtn())
    expect(onChange).toHaveBeenCalledWith({ approve: false, deny: false, approveNote: '', denyNote: '' })
    expect(screen.getByLabelText(/note on your vote against/i)).toHaveValue('')
  })

  it('shows what the server holds, and is read-only when disabled', () => {
    const { rerender } = render(<VoteControl vote={vote({ approve: true, approveNote: 'Yes' })} label="x" onChange={() => {}} />)
    expect(screen.getByLabelText(/note on your vote for/i)).toHaveValue('Yes')
    rerender(<VoteControl vote={vote({ approve: true, approveNote: 'Changed elsewhere' })} label="x" disabled disabledReason="Closed" onChange={() => {}} />)
    expect(screen.getByLabelText(/note on your vote for/i)).toHaveValue('Changed elsewhere')
    expect(forBtn()).toBeDisabled()
    expect(forBtn()).toHaveAttribute('title', 'Closed')
  })
})
