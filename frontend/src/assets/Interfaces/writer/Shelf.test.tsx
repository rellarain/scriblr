import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { COVER_WIDTH, Shelf, Spine, spineWidth } from './Shelf'

const book = (over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id: 'b1', kind: 'book', parentId: null, order: 0, title: 'Cold Harbor', synopsis: '', draftRef: null, wordCountGoal: 80000, ...over } as OutlineNode)

describe('spineWidth', () => {
  it('is 5px per 40,000 words of goal, never below a sliver', () => {
    expect(spineWidth(80000)).toBe(10)
    expect(spineWidth(40000)).toBe(8)
    expect(spineWidth(null)).toBe(8)
  })
})

describe('Spine', () => {
  it('is its goal-sized spine until selected, then swivels to a cover-wide front', () => {
    const { rerender } = render(<Spine book={book()} active={false} onOpen={() => {}} />)
    const spine = screen.getByRole('button', { name: 'Cold Harbor' })
    expect(spine.className).toBe('wrSpine')
    expect(spine.style.width).toBe('10px')
    expect(spine.getAttribute('aria-pressed')).toBe('false')

    rerender(<Spine book={book()} active onOpen={() => {}} />)
    expect(spine.className).toContain('wrSpine--active')
    expect(spine.style.width).toBe(`${COVER_WIDTH}px`)
    expect(spine.querySelector('.wrSpineFrontTitle')?.textContent).toBe('Cold Harbor')
  })

  it('opens its book when clicked', async () => {
    const onOpen = vi.fn()
    render(<Spine book={book()} active={false} onOpen={onOpen} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cold Harbor' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})

describe('Shelf', () => {
  it('stands each book on the shelf, with the selected one turned to its cover', () => {
    render(
      <Shelf
        label="Saga" meta="2 books" activeBookId="b2" onOpenBook={() => {}}
        groups={[{ series: null, books: [book(), book({ id: 'b2', title: 'Thaw' })] }]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cold Harbor' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Thaw' }).getAttribute('aria-pressed')).toBe('true')
  })
})
