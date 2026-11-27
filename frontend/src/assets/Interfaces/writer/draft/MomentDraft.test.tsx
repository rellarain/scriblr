import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AIDS, type StyleAids } from '../styleAids'
import { MomentDraft, type ChapterDestination, type MomentPin, type MomentTools } from './MomentDraft'

// One moment's draft text with the paragraph tools: the numbers in the gutter, the tools of the paragraph the caret is in, the dialog that
// moves a paragraph to another moment, the pins, and the style aids' marks.

const BODY = 'She had three coins and a letter.\n\nThe coins were for the crossing. The letter was not hers.\n\nOut on the dark water a bell rang twice.'
const DESTINATIONS: ChapterDestination[] = [
  { id: 'c1', label: 'Chapter 3 · The Ferry at Dusk', moments: [
    { id: 'm1', label: 'Scene 1 · Moment 1', detail: 'Mara reaches the landing' },
    { id: 'm2', label: 'Scene 1 · Moment 2', detail: "The ferryman's price" },
  ] },
  { id: 'c2', label: 'Chapter 4 · The Far Bank', moments: [{ id: 'm9', label: 'Moment 1', detail: 'Signs' }] },
]

let tools: MomentTools & { [K in 'move' | 'split' | 'join' | 'moveTo']: ReturnType<typeof vi.fn> }
let onPin: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  tools = { move: vi.fn(() => null), split: vi.fn(() => null), join: vi.fn(() => null), moveTo: vi.fn(async () => {}), busy: false }
  onPin = vi.fn()
})

function draft(over: { value?: string; aids?: Partial<StyleAids>; pins?: MomentPin[]; noTools?: boolean } = {}) {
  render(
    <MomentDraft
      momentId="m1" label="Moment 1 draft" placeholder="Start drafting…" value={over.value ?? BODY} onChange={() => {}}
      aids={{ ...DEFAULT_AIDS, ...over.aids }} tools={over.noTools ? null : tools} destinations={DESTINATIONS} chapterId="c1"
      pins={over.pins ?? []} onPin={onPin}
    />,
  )
  return screen.getByRole('textbox', { name: 'Moment 1 draft' }) as HTMLTextAreaElement
}

// Put the caret at `offset` of the text (and the focus in the box), as a click there would.
function caretAt(box: HTMLTextAreaElement, offset: number) {
  act(() => {
    box.setSelectionRange(offset, offset)
    box.focus()
  })
  fireEvent.keyUp(box)
}

describe('the paragraph gutter', () => {
  it('numbers each paragraph, and shows no tools until the caret is in one', () => {
    draft()
    expect(['¶1', '¶2', '¶3'].every(n => screen.getByText(n))).toBe(true)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it("shows the caret's paragraph's tools in place of its number", () => {
    const box = draft()
    caretAt(box, BODY.indexOf('The letter'))
    const bar = screen.getByRole('toolbar', { name: 'Paragraph 2' })
    expect(within(bar).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([
      'Move the paragraph up', 'Move the paragraph down', 'Move the paragraph to another moment', 'Split the paragraph at the cursor', 'Join with the next paragraph',
    ])
    expect(screen.queryByText('¶2')).toBeNull()
  })

  it('moves, splits and joins the paragraph the caret is in', () => {
    const box = draft()
    const caret = BODY.indexOf('The letter')
    caretAt(box, caret)
    fireEvent.click(screen.getByRole('button', { name: 'Move the paragraph up' }))
    expect(tools.move).toHaveBeenCalledWith(1, -1)
    fireEvent.click(screen.getByRole('button', { name: 'Move the paragraph down' }))
    expect(tools.move).toHaveBeenCalledWith(1, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Split the paragraph at the cursor' }))
    expect(tools.split).toHaveBeenCalledWith(caret)
    fireEvent.click(screen.getByRole('button', { name: 'Join with the next paragraph' }))
    expect(tools.join).toHaveBeenCalledWith(1)
  })

  it('offers no move past the edge, no split at a paragraph edge and no join for the last paragraph', () => {
    const box = draft()
    caretAt(box, 0)
    expect(screen.getByRole('button', { name: 'Move the paragraph up' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Split the paragraph at the cursor' })).toHaveProperty('disabled', true)
    caretAt(box, BODY.length)
    expect(screen.getByRole('button', { name: 'Move the paragraph down' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Join with the next paragraph' })).toHaveProperty('disabled', true)
  })

  it('has no tools where there is nowhere to move a paragraph to', () => {
    const box = draft({ noTools: true })
    caretAt(box, 3)
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.getByText('¶1')).toBeTruthy()
  })
})

describe('moving a paragraph to another moment', () => {
  it("lists this chapter's other moments, or another chapter's, and moves it to the start or the end", () => {
    const box = draft()
    caretAt(box, BODY.indexOf('The coins'))
    fireEvent.click(screen.getByRole('button', { name: 'Move the paragraph to another moment' }))
    const dialog = screen.getByRole('dialog', { name: 'Move paragraph 2' })
    const moments = () => within(within(dialog).getByRole('group', { name: 'Moment' })).getAllByRole('button').map(b => b.textContent)
    expect(moments()).toEqual(["Scene 1 · Moment 2The ferryman's price"])
    expect(within(dialog).getByRole('button', { name: 'Move' })).toHaveProperty('disabled', true)
    fireEvent.change(within(dialog).getByLabelText('Chapter'), { target: { value: 'c2' } })
    expect(moments()).toEqual(['Moment 1Signs'])
    fireEvent.click(within(dialog).getByRole('button', { name: /Moment 1/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'At the end' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }))
    expect(tools.moveTo).toHaveBeenCalledWith(1, 'c2', 'm9', 'end')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Cancel and on Escape', () => {
    const box = draft()
    caretAt(box, 3)
    fireEvent.click(screen.getByRole('button', { name: 'Move the paragraph to another moment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Move the paragraph to another moment' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('plotpoints pinned to a paragraph', () => {
  const pins: MomentPin[] = [
    { pointId: 'p1', placementId: 'pl1', title: 'The unopened letter', paragraph: 1 },
    { pointId: 'p2', placementId: 'pl2', title: 'The debt comes due', paragraph: null },
  ]

  it('shows the pin under the paragraph, unpins it, and pins another of the moment’s plotpoints', () => {
    const box = draft({ pins })
    caretAt(box, BODY.indexOf('The coins'))
    expect(screen.getByText(/Plotpoint: The unopened letter · moves with this paragraph/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unpin The unopened letter' }))
    expect(onPin).toHaveBeenCalledWith('p1', 'pl1', null)
    caretAt(box, 3)
    fireEvent.change(screen.getByLabelText('Pin a plotpoint to paragraph 1'), { target: { value: 'pl1' } })
    expect(onPin).toHaveBeenCalledWith('p1', 'pl1', 0)
    expect(screen.getByRole('option', { name: 'The unopened letter (now ¶2)' })).toBeTruthy()
  })

  it('marks a pinned paragraph in the gutter and says the pin goes with it when it moves', () => {
    const box = draft({ pins })
    expect(screen.getByText('¶2').querySelector('svg')).toBeTruthy()
    caretAt(box, BODY.indexOf('The coins'))
    fireEvent.click(screen.getByRole('button', { name: 'Move the paragraph to another moment' }))
    expect(screen.getByText('Its pinned plotpoint goes with it.')).toBeTruthy()
  })
})

describe('the style aids', () => {
  const long = 'The lanterns along the quay were already lit, each lantern swinging on its hook as the wind came up off the water, and somewhere behind the lanterns a dog was barking at nothing at all tonight.'

  it('underlines a long sentence and says how long it is for the paragraph the caret is in', () => {
    const box = draft({ value: `Short.\n\n${long}`, aids: { long: true } })
    const mirror = document.querySelector('.wrDraftMirror')!
    expect(mirror.querySelector('.wrAidLong')?.textContent).toBe(long)
    caretAt(box, 10)
    expect(screen.getByText(/Long sentence: \d+ words/)).toBeTruthy()
  })

  it('marks repeated words, and nothing when the aids are off', () => {
    draft({ value: long, aids: { repeat: true } })
    expect([...document.querySelectorAll('.wrAidRepeat')].map(e => e.textContent)).toEqual(['lanterns', 'lantern', 'lanterns'])
  })

  it('draws no marks with the aids off', () => {
    draft({ value: long })
    expect(document.querySelector('.wrAidLong, .wrAidRepeat')).toBeNull()
  })
})
