import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CopyPlainText from './CopyPlainText'
import Markup, { MarkupInline } from './Markup'
import MarkupEditor from './MarkupEditor'

// The read-only view of the markup, its editor (three views, the checks, the cheat sheet) and Copy as plain text.

describe('Markup', () => {
  it('draws headings whose levels follow the container, lists, quotes and inline styles', () => {
    const text = '###### Start\n\nSome **bold** and *it*.\nNext line.\n\n# Small\n\n>> one\n>>>> one.one\n> dot\n\n" A quote'
    const { container } = render(<Markup text={text} baseLevel={3} />)
    expect(screen.getByRole('heading', { level: 4, name: 'Start' })).toHaveClass('mkH6')
    expect(screen.getByRole('heading', { level: 6, name: 'Small' })).toHaveClass('mkH1')
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelector('em')).toHaveTextContent('it')
    expect(container.querySelector('.mkP br')).not.toBeNull()
    const items = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(items[0]).toContain('1.one')
    expect(items).toContain('1.1one.one')
    expect(container.querySelector('blockquote')).toHaveTextContent('A quote')
  })

  it('shows a knowledge check as its question and options, never its answers or hints', () => {
    render(<Markup text={'???? Which?\n???! a hint\n?! yes\n!! secret\n?? no'} />)
    const q = within(screen.getByRole('group', { name: 'Practice question' }))
    expect(q.getByText('Which?')).toBeInTheDocument()
    expect(q.getByText('yes')).toBeInTheDocument()
    expect(q.queryByText('a hint')).toBeNull()
    expect(q.queryByText('secret')).toBeNull()
  })

  it('shows what it is told to when empty, and a row shows only its first line', () => {
    render(<><Markup text={'  \n'} empty={<p>none</p>} /><MarkupInline text={'\n## A **bold** start\nmore'} /></>)
    expect(screen.getByText('none')).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.queryByText('more')).toBeNull()
  })
})

function Editor({ start = '' }: { start?: string }) {
  const [text, setText] = useState(start)
  return <MarkupEditor value={text} onChange={setText} label="Guide" />
}

describe('MarkupEditor', () => {
  it('writes, reads formatted, and shows both side by side', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    const views = within(screen.getByRole('group', { name: 'View of Guide' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Guide' }), { target: { value: '###### Hello' } })
    await user.click(views.getByRole('button', { name: 'Read-only' }))
    expect(screen.queryByRole('textbox', { name: 'Guide' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Guide, formatted' })).getByRole('heading', { name: 'Hello' })).toBeInTheDocument()
    await user.click(views.getByRole('button', { name: 'Side by side' }))
    expect(screen.getByRole('textbox', { name: 'Guide' })).toHaveValue('###### Hello')
    expect(screen.getByRole('region', { name: 'Guide, formatted' })).toBeInTheDocument()
    expect(views.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('lists the checks by line, and a click selects that line', async () => {
    const user = userEvent.setup()
    render(<Editor start={'Fine\n?! stray\n???? Q\n?? a'} />)
    expect(screen.getByRole('status', { name: '2 checks' })).toBeInTheDocument()
    const check = screen.getByRole('button', { name: /Line 2 An option outside a question/ })
    await user.click(check)
    await waitFor(() => {
      const field = screen.getByRole('textbox', { name: 'Guide' }) as HTMLTextAreaElement
      expect(document.activeElement).toBe(field)
      expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('?! stray')
    })
    expect(screen.getByRole('button', { name: /Line 3 This question has no right option/ })).toBeInTheDocument()
  })

  it('opens and closes the cheat sheet', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    const button = screen.getByRole('button', { name: 'Markup cheat sheet' })
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('region', { name: 'Markup cheat sheet' })).getByText('###### Largest heading')).toBeInTheDocument()
    await user.click(button)
    expect(screen.queryByRole('region', { name: 'Markup cheat sheet' })).toBeNull()
  })
})

describe('CopyPlainText', () => {
  it('copies the words without answers, and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<CopyPlainText text={'###### Title\n\n???? Q\n?! yes\n!! why'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy as plain text' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Copied'))
    expect(writeText).toHaveBeenCalledWith('Title\n\nQ\n○ yes')
  })
})
