import { fireEvent, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { __resetSettingsForTests, setKv } from '../../../../settings/settingsStore'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { placeValue } from '../plotPlacement'
import { outlineNode, plotNode } from '../plotTestWorkspace'
import OutlineNav from './OutlineNav'

// The contents' cards with no chapter focused: one chapter is open (a card with its title in place, its contents and its footer), and the
// others are compact cards (a title to click, the counts and the tools) that a click opens. (The Outline level always narrows its
// contents with the tabs at the book's edge, so it never lists an open chapter among others; this is the list's own behaviour.)

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

const OUTLINE: OutlineNode[] = [
  outlineNode('b', 'book', null, { title: 'Cold Harbor' }),
  outlineNode('c1', 'chapter', 'b', { title: 'Ice Out' }),
  outlineNode('c2', 'chapter', 'b', { title: 'The Harbor Master', order: 1 }),
  outlineNode('c3', 'chapter', 'b', { title: '', order: 2 }),
  outlineNode('act', 'act', 'c2', { title: 'An act' }),
  outlineNode('scene', 'scene', 'act'),
]
const PLOT: PlotNode[] = [
  plotNode('cat', 'category', null, { title: 'Romance' }),
  plotNode('line', 'plotline', 'cat', { title: 'The Smuggler' }),
  plotNode('pp1', 'plotpoint', 'line', { title: 'They meet' }),
]
const COUNTS = { chapters: {}, books: {}, nodes: { c1: 12, c2: 30 } }

function Harness({ open = 'c1', dragging = null, openChapter }: { open?: string | null; dragging?: string | null; openChapter: (id: string) => void }) {
  const [active, setActive] = useState<string | null>(open)
  const [plot, setPlot] = useState<PlotNode[]>(PLOT)
  const [dragId, setDragId] = useState<string | null>(dragging)
  const byId = new Map(OUTLINE.map(n => [n.id, n]))
  const w = makeWorkspace({
    outlineNodes: OUTLINE, plotNodes: plot, activeChapterId: active, selectChapter: setActive, openChapter,
    levelHueOf: () => 200, levelTintOf: () => 'hsl(200, 30%, 50%)', hueCentreOf: () => null, setNodeHue: vi.fn(), moveOutlineNodeInto: vi.fn(),
    addOutlineNode: vi.fn(() => 'new'), updateOutlineNode: vi.fn(), deleteOutlineNode: vi.fn(),
    placePlotpoint: (id: string, target: string) => setPlot(prev => placeValue(prev, id, target, byId)),
  })
  return (
    <OutlineNav
      w={w} book={OUTLINE[0]} counts={COUNTS} focus={null} plotDrag={{ dragId, setDragId }}
      chapterBody={() => <p data-testid="contents">What the chapter holds</p>}
    />
  )
}

const setup = (props: { open?: string | null; dragging?: string | null } = {}) => {
  const openChapter = vi.fn()
  const view = render(<Harness {...props} openChapter={openChapter} />)
  return { openChapter, user: userEvent.setup(), ...view }
}
const card = (id: string) => document.querySelector<HTMLElement>(`[data-node="${id}"]`)!
const head = (id: string) => card(id).querySelector<HTMLElement>(':scope > .wrCardHead')!
const counts = (id: string) => Array.from(card(id).querySelectorAll(':scope > .wrNodeStats span')).map(span => span.textContent)
const footOf = (id: string) => card(id).querySelector(':scope > .wrCardFoot--tools')

describe('Outline contents: a chapter that is open and the others', () => {
  it('shows the open chapter with its title in place, its contents and its footer, and the others as compact cards', () => {
    setup()
    expect(card('c1').getAttribute('aria-current')).toBe('true')
    expect(within(card('c1')).getByLabelText('Chapter 1 title')).toHaveProperty('value', 'Ice Out')
    expect(within(card('c1')).getByTestId('contents')).toBeTruthy()
    expect(footOf('c1')).not.toBeNull()

    for (const id of ['c2', 'c3']) {
      expect(card(id).getAttribute('aria-current')).toBeNull()
      expect(card(id).querySelector('input')).toBeNull()
      expect(within(card(id)).queryByTestId('contents')).toBeNull()
      expect(footOf(id)).toBeNull()
    }
  })

  it('gives a compact card its number, its title as text, its counts and its tools', () => {
    setup()
    expect(head('c2').querySelector('.wrNumBadge')?.textContent).toBe('2')
    expect(within(head('c2')).getByRole('button', { name: 'Open chapter 2' }).textContent).toBe('The Harbor Master')
    expect(counts('c2')).toEqual(['1 act', '1 scene', '0 moments', '30 words'])
    expect(within(head('c2')).getByRole('button', { name: 'Write chapter 2' })).toBeTruthy()
    expect(within(head('c2')).getByRole('button', { name: 'Expand chapter 2' }).getAttribute('aria-expanded')).toBe('false')
    expect(head('c2').querySelector('.wrGrip')).not.toBeNull()
    // A chapter with no title says so.
    expect(within(head('c3')).getByRole('button', { name: 'Open chapter 3' }).textContent).toBe('Untitled chapter')
  })

  it('opens a compact card when it is clicked, from its title, its chevron or anywhere else on it', async () => {
    const { user } = setup()
    await user.click(within(head('c2')).getByRole('button', { name: 'Open chapter 2' }))
    expect(card('c2').getAttribute('aria-current')).toBe('true')
    expect(card('c1').getAttribute('aria-current')).toBeNull()
    expect(within(card('c2')).getByLabelText('Chapter 2 title')).toBeTruthy()

    await user.click(within(head('c1')).getByRole('button', { name: 'Expand chapter 1' }))
    expect(card('c1').getAttribute('aria-current')).toBe('true')

    await user.click(card('c3').querySelector(':scope > .wrNodeStats')!)
    expect(card('c3').getAttribute('aria-current')).toBe('true')
    expect(within(card('c3')).getByLabelText('Chapter 3 title')).toHaveProperty('value', '')
  })

  it('does not open a card from its other tools: the pencil writes the chapter and leaves the open one as it is', async () => {
    const { user, openChapter } = setup()
    await user.click(within(head('c3')).getByRole('button', { name: 'Write chapter 3' }))
    expect(openChapter).toHaveBeenCalledWith('c3')
    expect(card('c1').getAttribute('aria-current')).toBe('true')
    expect(card('c3').getAttribute('aria-current')).toBeNull()
  })

  it('opens a chapter as it was left: one folded earlier stays folded until its chevron is used', async () => {
    setKv('scriblr.writer.outlineOpen', { c2: false })
    const { user } = setup()
    await user.click(within(head('c2')).getByRole('button', { name: 'Open chapter 2' }))
    expect(within(card('c2')).getByLabelText('Chapter 2 title')).toBeTruthy()
    expect(within(card('c2')).queryByTestId('contents')).toBeNull()
    expect(footOf('c2')).toBeNull()
    await user.click(within(head('c2')).getByRole('button', { name: 'Expand chapter 2' }))
    expect(within(card('c2')).getByTestId('contents')).toBeTruthy()
    expect(footOf('c2')).not.toBeNull()
  })

  it('takes a plotpoint dropped on a compact card for the chapter, and counts it there', () => {
    setup({ dragging: 'pp1' })
    expect(counts('c3')).toEqual(['0 acts', '0 scenes', '0 moments', '0 words'])
    fireEvent.dragOver(card('c3'))
    expect(card('c3').classList.contains('wrOutlineCard--plotOver')).toBe(true)
    fireEvent.drop(card('c3'))
    expect(counts('c3')).toEqual(['0 acts', '0 scenes', '0 moments', '1 plotpoint', '0 words'])
    expect(card('c3').classList.contains('wrOutlineCard--plotOver')).toBe(false)
  })

  it('takes no plotpoint when none is being dragged', () => {
    setup()
    fireEvent.dragOver(card('c3'))
    expect(card('c3').classList.contains('wrOutlineCard--plotOver')).toBe(false)
  })
})
