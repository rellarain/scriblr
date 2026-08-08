import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../types'
import BookSpine from './BookSpine'

function makeBook(overrides: Partial<OutlineNode> = {}): OutlineNode {
  return {
    id: 'book1',
    kind: 'book',
    parentId: null,
    order: 0,
    title: 'Test Book',
    synopsis: '',
    draftRef: null,
    flag: null,
    color: null,
    chapterCountTarget: null,
    plotlineIds: [],
    wordCountGoal: null,
    ...overrides,
  }
}

describe('BookSpine', () => {
  it('renders the book title and calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<BookSpine book={makeBook()} wordCount={0} isActive={false} onClick={onClick} />)
    const spine = screen.getByRole('button', { name: /test book/i })
    await userEvent.click(spine)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders a wider spine for a book with a larger word-count goal', () => {
    render(
      <>
        <BookSpine book={makeBook({ id: 'small', wordCountGoal: 10000 })} wordCount={0} isActive={false} onClick={() => {}} />
        <BookSpine book={makeBook({ id: 'big', wordCountGoal: 200000 })} wordCount={0} isActive={false} onClick={() => {}} />
      </>
    )
    const [small, big] = screen.getAllByRole('button').map((el) => parseFloat((el as HTMLElement).style.width))
    expect(big).toBeGreaterThan(small)
  })

  it('floors spine width so an unset/tiny goal still renders a clickable spine', () => {
    render(<BookSpine book={makeBook({ wordCountGoal: 100 })} wordCount={0} isActive={false} onClick={() => {}} />)
    const spine = screen.getByRole('button')
    expect(parseFloat(spine.style.width)).toBeGreaterThanOrEqual(16)
  })

  it('marks the spine active when isActive is true', () => {
    render(<BookSpine book={makeBook()} wordCount={0} isActive onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveClass('is-active')
  })
})
