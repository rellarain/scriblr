import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PreviewSelect } from './PreviewSelect'

const OPTIONS = [
  { id: 'round', name: 'Round' }, { id: 'oval', name: 'Oval' }, { id: 'square', name: 'Square' }, { id: 'heart', name: 'Heart' }, { id: 'long', name: 'Long' },
  { id: 'wide', name: 'Wide' }, { id: 'pointed', name: 'Pointed chin' },
]

// A dropdown with its value kept in a parent, as the portrait keeps it. `drawn` counts the pictures asked for.
function Harness({ initial = 'oval', onPick, drawn, disabled }: { initial?: string; onPick?: (id: string) => void; drawn?: (id: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState(initial)
  return (
    <PreviewSelect
      label="Head shape" options={OPTIONS} value={value} disabled={disabled}
      onChange={id => { setValue(id); onPick?.(id) }}
      thumb={o => { drawn?.(o.id); return <svg data-testid={`thumb-${o.id}`} /> }}
    />
  )
}
const button = () => screen.getByRole('button', { name: /^Head shape: / })
const list = () => screen.getByRole('listbox', { name: 'Head shape' })
const active = () => list().getAttribute('aria-activedescendant')
const optionId = (name: string) => within(list()).getByRole('option', { name }).id

describe('the picture dropdown', () => {
  it('shows the chosen choice, with its picture and name, and says what it opens', () => {
    render(<Harness />)
    expect(button()).toHaveAccessibleName('Head shape: Oval')
    expect(button()).toHaveAttribute('aria-haspopup', 'listbox')
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(button()).not.toHaveAttribute('aria-controls')
    expect(button()).toHaveTextContent('Oval')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('draws only the chosen choice while it is closed, and every choice while it is open', async () => {
    const drawn = vi.fn()
    render(<Harness drawn={drawn} />)
    expect(new Set(drawn.mock.calls.map(c => c[0]))).toEqual(new Set(['oval']))
    drawn.mockClear()
    await userEvent.setup().click(button())
    expect(new Set(drawn.mock.calls.map(c => c[0]))).toEqual(new Set(OPTIONS.map(o => o.id)))
  })

  it('opens a listbox of options with the chosen one selected and active, and wires them for a screen reader', async () => {
    render(<Harness />)
    await userEvent.setup().click(button())
    expect(button()).toHaveAttribute('aria-expanded', 'true')
    expect(button()).toHaveAttribute('aria-controls', list().id)
    const options = within(list()).getAllByRole('option')
    expect(options.map(o => o.textContent)).toEqual(OPTIONS.map(o => o.name))
    expect(options.map(o => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false', 'false'])
    expect(active()).toBe(optionId('Oval'))
    expect(list()).toHaveFocus()
  })

  it('chooses by a click, closes, and gives the focus back to the button', async () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    const user = userEvent.setup()
    await user.click(button())
    await user.click(within(list()).getByRole('option', { name: 'Square' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('square')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(button()).toHaveAccessibleName('Head shape: Square')
    expect(button()).toHaveFocus()
  })

  it('moves over the choices with the arrow keys, Home, End and the page keys, and stops at the ends', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await user.click(button())
    await user.keyboard('{ArrowRight}')
    expect(active()).toBe(optionId('Square'))
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(active()).toBe(optionId('Round'))
    await user.keyboard('{End}')
    expect(active()).toBe(optionId('Pointed chin'))
    await user.keyboard('{ArrowRight}')
    expect(active()).toBe(optionId('Pointed chin'))
    await user.keyboard('{Home}')
    expect(active()).toBe(optionId('Round'))
    await user.keyboard('{PageDown}')
    expect(active()).toBe(optionId('Wide'))
    await user.keyboard('{PageUp}')
    expect(active()).toBe(optionId('Round'))
  })

  it('moves a row at a time with Up and Down (one choice at a time where the list is not a grid)', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await user.click(button())
    await user.keyboard('{ArrowDown}')
    expect(active()).toBe(optionId('Square'))
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(active()).toBe(optionId('Round'))
  })

  it('chooses with Enter or with Space', async () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    const user = userEvent.setup()
    await user.click(button())
    await user.keyboard('{ArrowRight}{Enter}')
    expect(onPick).toHaveBeenLastCalledWith('square')
    await user.click(button())
    await user.keyboard('{ArrowRight} ')
    expect(onPick).toHaveBeenLastCalledWith('heart')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape without choosing, and gives the focus back; Escape does not reach what is around it', async () => {
    const onPick = vi.fn(), outer = vi.fn()
    render(<div onKeyDown={outer}><Harness onPick={onPick} /></div>)
    const user = userEvent.setup()
    await user.click(button())
    await user.keyboard('{ArrowRight}{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
    expect(button()).toHaveFocus()
    expect(button()).toHaveAccessibleName('Head shape: Oval')
    expect(outer.mock.calls.filter(c => (c[0] as KeyboardEvent).key === 'Escape')).toHaveLength(0)
  })

  it('opens from the button with the arrow keys', async () => {
    render(<Harness />)
    button().focus()
    await userEvent.setup().keyboard('{ArrowDown}')
    expect(list()).toBeInTheDocument()
    expect(active()).toBe(optionId('Oval'))
  })

  it('goes to a choice by typing the start of its name, and again for the next with the same letter', async () => {
    // Letters typed within a moment of each other name one choice; the clock is moved on between the groups.
    let now = 1_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      render(<Harness />)
      const user = userEvent.setup()
      await user.click(button())
      const type = async (keys: string) => { now += 1000; await user.keyboard(keys) }
      await type('p')
      expect(active()).toBe(optionId('Pointed chin'))
      await type('s')
      expect(active()).toBe(optionId('Square'))
      await type('w')
      expect(active()).toBe(optionId('Wide'))
      // Two letters typed together name a choice: "he" is Heart.
      await type('he')
      expect(active()).toBe(optionId('Heart'))
      // The same letter again goes to the next choice that starts with it; a letter nothing starts with changes nothing.
      await type('r')
      expect(active()).toBe(optionId('Round'))
      await type('z')
      expect(active()).toBe(optionId('Round'))
    } finally {
      clock.mockRestore()
    }
  })

  it('closes when the focus leaves with Tab, and when a press lands outside', async () => {
    render(<><Harness /><button type="button">Elsewhere</button></>)
    const user = userEvent.setup()
    await user.click(button())
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.click(button())
    expect(list()).toBeInTheDocument()
    fireEvent(screen.getByRole('button', { name: 'Elsewhere' }), new MouseEvent('pointerdown', { bubbles: true }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('stays open for a press inside it, and the button closes it again', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await user.click(button())
    fireEvent(list(), new MouseEvent('pointerdown', { bubbles: true }))
    expect(list()).toBeInTheDocument()
    await user.click(button())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('follows the pointer with the active choice', async () => {
    render(<Harness />)
    await userEvent.setup().click(button())
    fireEvent.mouseMove(within(list()).getByRole('option', { name: 'Long' }))
    expect(active()).toBe(optionId('Long'))
  })

  it('does not open when it is disabled', async () => {
    render(<Harness disabled />)
    expect(button()).toBeDisabled()
    await userEvent.setup().click(button())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows the first choice for a value that is not in the list, and still chooses', async () => {
    const onPick = vi.fn()
    render(<Harness initial="from-a-newer-build" onPick={onPick} />)
    expect(button()).toHaveAccessibleName('Head shape: Round')
    const user = userEvent.setup()
    await user.click(button())
    await user.click(within(list()).getByRole('option', { name: 'Heart' }))
    expect(onPick).toHaveBeenCalledWith('heart')
  })
})
