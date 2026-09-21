import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VoteControl } from './VoteControl'
import { vote } from './inboxTestData'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const yes = () => screen.getByRole('button', { name: /vote yes/i })
const no = () => screen.getByRole('button', { name: /vote no/i })
const pass = () => screen.getByRole('button', { name: /vote pass/i })
const rows = (container: HTMLElement) => [...container.querySelectorAll('.voteRow')].map(r => r.className.replace('voteRow voteRow--', ''))
const rest = (container: HTMLElement) => container.querySelector('.voteRest')

const EMPTY = { approve: false, deny: false, passed: false, approveNote: '', denyNote: '', passNote: '' }

describe('VoteControl', () => {
  it('starts as three square buttons in one row of their own, with no note fields', () => {
    const { container } = render(<VoteControl label="this statement" onChange={() => {}} />)
    for (const b of [yes(), no(), pass()]) expect(b).toHaveAttribute('aria-pressed', 'false')
    expect(rows(container)).toEqual([])
    expect(rest(container)?.querySelectorAll('button')).toHaveLength(3)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a selected button takes a full row with its note, and the unselected ones share the row below', () => {
    const onChange = vi.fn()
    const { container } = render(<VoteControl label="this statement" onChange={onChange} />)
    fireEvent.click(no())
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, deny: true })
    expect(rows(container)).toEqual(['deny'])
    expect(rest(container)?.querySelectorAll('button')).toHaveLength(2)
    expect(rest(container)).not.toHaveClass('voteRest--single')
    expect(screen.getByLabelText(/note on your no vote/i)).toBeEnabled()
  })

  it('a second selected button takes the next row down; the remaining one stays on its own at the bottom', () => {
    const { container } = render(<VoteControl label="this statement" onChange={() => {}} />)
    fireEvent.click(pass())
    fireEvent.click(yes())
    expect(rows(container)).toEqual(['pass', 'approve'])          // in the order they were selected
    expect(rest(container)).toHaveClass('voteRest--single')      // half width
    expect(rest(container)?.querySelectorAll('button')).toHaveLength(1)
    fireEvent.click(no())
    expect(rows(container)).toEqual(['pass', 'approve', 'deny'])
    expect(rest(container)).toBeNull()
  })

  it('any combination can be on, each with its own note, saved after a pause', () => {
    const onChange = vi.fn()
    render(<VoteControl label="this statement" onChange={onChange} />)
    fireEvent.click(yes())
    fireEvent.click(no())
    fireEvent.change(screen.getByLabelText(/note on your no vote/i), { target: { value: 'Too risky' } })
    fireEvent.change(screen.getByLabelText(/note on your yes vote/i), { target: { value: 'Clear need' } })
    act(() => { vi.advanceTimersByTime(600) })
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, approve: true, deny: true, approveNote: 'Clear need', denyNote: 'Too risky' })
  })

  it('saves a note once after a pause and on leaving the field', () => {
    const onChange = vi.fn()
    render(<VoteControl vote={vote({ mine: true, passed: true })} label="this statement" onChange={onChange} />)
    const note = screen.getByLabelText(/note on your pass vote/i)
    fireEvent.change(note, { target: { value: 'Why' } })
    fireEvent.change(note, { target: { value: 'Why not' } })
    expect(onChange).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(600) })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, passed: true, passNote: 'Why not' })
    fireEvent.change(note, { target: { value: 'Final' } })
    fireEvent.blur(note)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, passed: true, passNote: 'Final' })
  })

  it('withdraws a button, and its note, when it is clicked again, and the row goes back down', () => {
    const onChange = vi.fn()
    const { container } = render(<VoteControl vote={vote({ mine: true, deny: true, denyNote: 'No' })} label="this statement" onChange={onChange} />)
    expect(rows(container)).toEqual(['deny'])
    fireEvent.click(no())
    expect(onChange).toHaveBeenCalledWith(EMPTY)
    expect(rows(container)).toEqual([])
    expect(rest(container)?.querySelectorAll('button')).toHaveLength(3)
  })

  it('shows what the server holds, and is read-only when disabled', () => {
    const { rerender } = render(<VoteControl vote={vote({ mine: true, approve: true, approveNote: 'Yes' })} label="x" onChange={() => {}} />)
    expect(screen.getByLabelText(/note on your yes vote/i)).toHaveValue('Yes')
    rerender(<VoteControl vote={vote({ mine: true, approve: true, approveNote: 'Changed elsewhere' })} label="x" disabled disabledReason="Closed" onChange={() => {}} />)
    expect(screen.getByLabelText(/note on your yes vote/i)).toHaveValue('Changed elsewhere')
    expect(yes()).toBeDisabled()
    expect(yes()).toHaveAttribute('title', 'Closed')
  })
})
