import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Markup from './Markup'

// Practice questions (K3): choose, then Check, or Show the answer at any time; either reveals the right options (highlighted), dims the
// others and shows every explanation; hints one a press; a text answer ignores capitals and allows a small typo. Nothing is saved.

const q = () => within(screen.getByRole('group', { name: 'Practice question' }))

describe('a practice question', () => {
  it('checks a multiple-choice answer and reveals it', async () => {
    const user = userEvent.setup()
    render(<Markup text={'???? Which is a scene?\n?! A quarrel\n!! Something changes.\n?? A list of rooms\n!! Nothing changes.'} />)
    expect(q().getByRole('button', { name: 'Check' })).toBeDisabled()
    expect(q().queryByText('Something changes.')).toBeNull()
    await user.click(q().getByRole('radio', { name: 'A list of rooms' }))
    await user.click(q().getByRole('button', { name: 'Check' }))
    expect(q().getByRole('status')).toHaveTextContent('Not quite.')
    expect(q().getByText('A quarrel').closest('.mkOption')).toHaveClass('mkOption--right')
    expect(q().getByText('A list of rooms').closest('.mkOption')).toHaveClass('mkOption--wrong')
    expect(q().getByText('Something changes.')).toBeInTheDocument()
    expect(q().getByText('Nothing changes.')).toBeInTheDocument()
    // it stays answered
    expect(q().getByRole('radio', { name: 'A quarrel right' })).toBeDisabled()
    expect(q().getByRole('button', { name: 'Show the answer' })).toBeDisabled()
  })

  it('shows the answer at any time, without saying right or wrong', async () => {
    const user = userEvent.setup()
    render(<Markup text={'???? Pick\n??! a\n??? b'} />)
    await user.click(q().getByRole('button', { name: 'Show the answer' }))
    expect(q().getByText('a').closest('.mkOption')).toHaveClass('mkOption--right')
    expect(q().getByText('b').closest('.mkOption')).toHaveClass('mkOption--dim')
    expect(q().getByRole('status')).toHaveTextContent('')
  })

  it('gives a share for checkboxes', async () => {
    const user = userEvent.setup()
    render(<Markup text={'???? Pick\n??! a\n??! b\n??! c\n??? d'} />)
    await user.click(q().getByRole('checkbox', { name: 'a' }))
    await user.click(q().getByRole('checkbox', { name: 'b' }))
    await user.click(q().getByRole('button', { name: 'Check' }))
    expect(q().getByRole('status')).toHaveTextContent('2 of 3.')
  })

  it('shows hints one a press', async () => {
    const user = userEvent.setup()
    render(<Markup text={'???? Why?\n???! first\n???! second\n?! yes'} />)
    const hint = q().getByRole('button', { name: 'Hint' })
    await user.click(hint)
    expect(q().getByText('first')).toBeInTheDocument()
    expect(q().queryByText('second')).toBeNull()
    await user.click(hint)
    expect(q().getByText('second')).toBeInTheDocument()
    expect(hint).toBeDisabled()
  })

  it('takes a text answer with capitals and a small typo, and shows the accepted ones', async () => {
    const user = userEvent.setup()
    render(<Markup text={'???? The unit a draft is written in?\n? One word\n! moment'} />)
    const field = q().getByRole('textbox', { name: 'Your answer' })
    expect(field).toHaveAttribute('placeholder', 'One word')
    await user.type(field, 'MOMNET')
    await user.click(q().getByRole('button', { name: 'Check' }))
    expect(q().getByRole('status')).toHaveTextContent('Right.')
    expect(q().getByText('Accepted:').parentElement).toHaveTextContent('moment')
  })
})
