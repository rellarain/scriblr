import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BookProgress, OutlineNode } from '../../../api/types'
import { COVER_WIDTH, Shelf, Spine, SPINE_MAX_HEIGHT, SPINE_MAX_WIDTH, SPINE_MIN_HEIGHT, SPINE_MIN_WIDTH, spineHeight, spineWidth } from './Shelf'

const book = (over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id: 'b1', kind: 'book', parentId: null, order: 0, title: 'Cold Harbor', synopsis: '', draftRef: null, wordCountGoal: 80000, ...over } as OutlineNode)

const m = (done: number, total: number) => ({ done, total })
const progress = (over: Partial<BookProgress> = {}): BookProgress => ({
  plotting: m(0, 0), outlining: m(0, 0), planning: m(0, 0), assignment: m(0, 0), revision: m(0, 0), published: m(0, 0), words: m(0, 0), ...over,
})

describe('spine size', () => {
  it('is 20px wide with no goal, 8px wider for every 40,000 words, and never over 64px', () => {
    expect(SPINE_MIN_WIDTH).toBe(20)
    expect(spineWidth(null)).toBe(20)
    expect(spineWidth(80000)).toBe(36)
    expect(spineWidth(1_000_000)).toBe(SPINE_MAX_WIDTH)
  })

  it('is 160px tall with no goal, and never over 200px', () => {
    expect(spineHeight(null)).toBe(SPINE_MIN_HEIGHT)
    expect(spineHeight(80000)).toBe(176)
    expect(spineHeight(1_000_000)).toBe(SPINE_MAX_HEIGHT)
  })
})

describe('Spine', () => {
  it('is its goal-sized spine until selected, then swivels to a cover-wide front', () => {
    const { rerender } = render(<Spine book={book()} number={1} active={false} onOpen={() => {}} />)
    const spine = screen.getByRole('button', { name: 'Cold Harbor' })
    expect(spine.className).toBe('wrSpine')
    expect(spine.style.width).toBe('36px')
    expect(spine.style.height).toBe('176px')
    expect(spine.getAttribute('aria-pressed')).toBe('false')

    rerender(<Spine book={book()} number={1} active onOpen={() => {}} />)
    expect(spine.className).toContain('wrSpine--active')
    expect(spine.style.width).toBe(`${COVER_WIDTH}px`)
    expect(spine.querySelector('.wrSpineFrontTitle')?.textContent).toBe('Cold Harbor')
  })

  it('opens its book when clicked', async () => {
    const onOpen = vi.fn()
    render(<Spine book={book()} number={1} active={false} onOpen={onOpen} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cold Harbor' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it("has the book's number at the top and no title text on its side", () => {
    render(<Spine book={book()} number={3} active={false} onOpen={() => {}} />)
    const side = document.querySelector('.wrSpineSide') as HTMLElement
    expect(side.querySelector('.wrSpineNumber')?.textContent).toBe('3')
    expect(side.textContent).toBe('3')
    expect(screen.getByRole('button', { name: 'Cold Harbor' }).getAttribute('title')).toBe('Cold Harbor (book 3)')
  })

  it('has planning, plotting and outlining bars on top, and placed, revision and published bars at the bottom', () => {
    const all = progress({ plotting: m(1, 2), outlining: m(1, 2), planning: m(1, 2), assignment: m(1, 2), revision: m(1, 2), published: m(1, 2) })
    render(<Spine book={book()} number={1} progress={all} active={false} onOpen={() => {}} />)
    const side = document.querySelector('.wrSpineSide') as HTMLElement
    const groups = side.querySelectorAll('.wrSpineBars')
    expect(Array.from(groups[0].querySelectorAll('.wrSpineBar')).map(b => b.getAttribute('aria-label')?.split(':')[0])).toEqual(['Planning', 'Plotting', 'Outlining'])
    expect(Array.from(groups[1].querySelectorAll('.wrSpineBar')).map(b => b.getAttribute('aria-label')?.split(':')[0])).toEqual(['Plotpoints placed', 'Revision', 'Published'])
    // The vertical words bar sits between them.
    expect(groups[0].compareDocumentPosition(side.querySelector('.wrSpineWords')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(side.querySelector('.wrSpineWords')!.compareDocumentPosition(groups[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('fills each horizontal bar by its progress, and says what it measures in its tooltip', () => {
    render(<Spine book={book()} number={1} progress={progress({ outlining: m(3, 5), plotting: m(1, 4) })} active={false} onOpen={() => {}} />)
    const bar = (label: string) => screen.getByRole('img', { name: new RegExp(label) }) as HTMLElement
    expect((bar('Outlining').querySelector('.wrSpineBarFill') as HTMLElement).style.width).toBe('60%')
    expect((bar('Plotting').querySelector('.wrSpineBarFill') as HTMLElement).style.width).toBe('25%')
    expect(bar('Outlining').getAttribute('title')).toBe('Outlining: 3 of 5 chapters outlined')
  })

  it('shows a bar only where a goal or a measure is set: none for a book with nothing to measure against', () => {
    render(<Spine book={book()} number={1} progress={progress({ outlining: m(1, 5) })} active={false} onOpen={() => {}} />)
    expect(screen.getAllByRole('img').map(b => b.getAttribute('aria-label')?.split(':')[0])).toEqual(['Outlining'])
  })

  it('turns a bar to the accent colour once it is complete, and not before', () => {
    render(<Spine book={book()} number={1} progress={progress({ outlining: m(5, 5), plotting: m(4, 5) })} active={false} onOpen={() => {}} />)
    expect(screen.getByRole('img', { name: /Outlining/ }).className).toContain('wrSpineBar--complete')
    expect(screen.getByRole('img', { name: /Plotting/ }).className).not.toContain('wrSpineBar--complete')
    expect(screen.queryByRole('img', { name: /Planning/ })).toBeNull() // 0 of 0: no bar
  })

  it('fills the vertical words bar from the bottom against the goal, accent past it, and has none without a goal', () => {
    const { rerender } = render(<Spine book={book()} number={1} progress={progress({ words: m(20000, 80000) })} active={false} onOpen={() => {}} />)
    const words = () => document.querySelector('.wrSpineBar--v') as HTMLElement | null
    expect((words()!.querySelector('.wrSpineBarFill') as HTMLElement).style.height).toBe('25%')
    expect(words()!.className).not.toContain('wrSpineBar--complete')
    rerender(<Spine book={book()} number={1} progress={progress({ words: m(90000, 80000) })} active={false} onOpen={() => {}} />)
    expect((words()!.querySelector('.wrSpineBarFill') as HTMLElement).style.height).toBe('100%')
    expect(words()!.className).toContain('wrSpineBar--complete')
    rerender(<Spine book={book({ wordCountGoal: null })} number={1} progress={progress({ words: m(500, 0) })} active={false} onOpen={() => {}} />)
    expect(words()).toBeNull()
  })

  it('has no bars while the progress has not loaded', () => {
    render(<Spine book={book()} number={1} active={false} onOpen={() => {}} />)
    expect(document.querySelectorAll('.wrSpineBar')).toHaveLength(0)
    expect(document.querySelector('.wrSpineNumber')).not.toBeNull()
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

  it("carries the project's title on the board under the books, not in a row above", () => {
    render(<Shelf label="Saga" meta="2 books" activeBookId={null} onOpenBook={() => {}} onOpen={() => {}} groups={[{ series: null, books: [book()] }]} />)
    const board = document.querySelector('.wrShelfBoard') as HTMLElement
    expect(board.textContent).toContain('Saga')
    expect(board.textContent).toContain('2 books')
    expect(document.querySelector('.wrShelfHeader')).toBeNull()
    const books = document.querySelector('.wrShelfBooks') as HTMLElement
    expect(books.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("puts a series' title across the top of its section, and numbers the books across the shelf", () => {
    const series = { id: 's1', kind: 'series', parentId: null, order: 0, title: 'The Cycle', synopsis: '' } as OutlineNode
    render(
      <Shelf
        label="Saga" meta="3 books" activeBookId={null} onOpenBook={() => {}}
        groups={[{ series: null, books: [book()] }, { series, books: [book({ id: 'b2', title: 'Two' }), book({ id: 'b3', title: 'Three' })] }]}
      />,
    )
    const section = screen.getByRole('group', { name: 'Series: The Cycle' })
    expect(section.firstElementChild?.className).toBe('wrShelfSeriesLabel')
    expect(section.firstElementChild?.textContent).toBe('The Cycle')
    expect(Array.from(document.querySelectorAll('.wrSpineNumber')).map(n => n.textContent)).toEqual(['1', '2', '3'])
  })

  it('passes each book its own bars', () => {
    render(
      <Shelf
        label="Saga" meta="1 book" activeBookId={null} onOpenBook={() => {}} groups={[{ series: null, books: [book()] }]}
        progress={{ b1: progress({ planning: m(4, 4) }) }}
      />,
    )
    expect(screen.getByRole('img', { name: /Planning/ }).className).toContain('wrSpineBar--complete')
  })
})
