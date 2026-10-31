import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { getKv } from '../../../settings/settingsStore'
import { PlotOutlinePanel } from './PlotOutlinePanel'
import { OUTLINE, outlineNode, startingPlot, useFakeWorkspace } from './plotTestWorkspace'

// The Outline panel's head: three circles that fold a whole level (series, books, arcs) and a fourth that shows each card's synopsis.

function Panel({ outline, readOnly = false }: { outline?: OutlineNode[]; readOnly?: boolean }) {
  const { w } = useFakeWorkspace(startingPlot(), 'line', outline)
  return <PlotOutlinePanel w={w} plotlines={[w.plotNodeById.get('line')!]} dragId={null} onDropChapter={() => {}} readOnly={readOnly} />
}

const written = (over: Record<string, string>) => OUTLINE.map(n => (n.id in over ? { ...n, synopsis: over[n.id] } : n))
const SYNOPSES = { series: 'The whole saga.', book: 'First of three.\nA slow start.', arc: 'They set out.', ch1: 'Arrival in the rain.', ch2: '  ' }

const group = () => within(screen.getByRole('group', { name: 'Fold a whole level of the outline' }))
const synopsisCircle = () => screen.getByRole('button', { name: /synopses$/ })
const chapters = (container: HTMLElement) => [...container.querySelectorAll('.wrPlotChapter')].map(c => c.querySelector('.wrPlotCardTitle')!.textContent)
const cards = (container: HTMLElement) => [...container.querySelectorAll('.wrPlotCard')].map(c => c.classList[1].replace('wrPlotCard--', ''))

describe('the circles at the top of the panel', () => {
  it('sit at the right of the head, after the label, which carries the hint as its title', () => {
    const { container } = render(<Panel />)
    const head = container.querySelector('.wrChildRowsHead') as HTMLElement
    expect([...head.children].map(c => c.className)).toEqual(['wrLabel', 'wrNavTools'])
    expect(head.firstElementChild).toHaveTextContent(/^Outline$/)
    expect(head.firstElementChild).toHaveAttribute('title', 'Drop a plotpoint on a chapter')
    expect(container.querySelector('.wrOutlineMeta')).toBeNull()
    expect(screen.queryByText('Drop a plotpoint on a chapter')).toBeNull()
  })

  it('are three for series, books and arcs, then the synopses circle, which is not part of their group', () => {
    const { container } = render(<Panel />)
    const tools = container.querySelector('.wrNavTools') as HTMLElement
    expect([...tools.children].map(c => c.className)).toEqual(['wrNavDots', 'wrNavDot wrNavDot--desc'])
    expect(group().getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Collapse all series', 'Collapse all books', 'Collapse all arcs'])
    expect(group().queryByRole('button', { name: /synopses/ })).toBeNull()
    expect(synopsisCircle()).toHaveAttribute('aria-label', 'Show synopses')
    expect(synopsisCircle()).toHaveAttribute('aria-pressed', 'false')
  })

  it('say where each plotpoint sits when the panel is read-only, as the compare view has it', () => {
    const { container } = render(<Panel readOnly />)
    expect(container.querySelector('.wrChildRowsHead')!.firstElementChild).toHaveAttribute('title', 'Where each plotpoint sits')
    expect(group().getAllByRole('button')).toHaveLength(3)
    expect(synopsisCircle()).toBeInTheDocument()
  })
})

describe('the fold circles', () => {
  it('are lit while any card of their level is open, and a click folds or opens the whole level', async () => {
    const { container } = render(<Panel />)
    expect(cards(container)).toEqual(['series', 'book', 'arc'])
    expect(chapters(container)).toEqual(['1 · Arrival', '2 · Storm'])
    for (const name of ['Collapse all series', 'Collapse all books', 'Collapse all arcs']) expect(group().getByRole('button', { name })).toHaveClass('wrNavDot--on')

    await userEvent.click(group().getByRole('button', { name: 'Collapse all arcs' }))
    expect(cards(container)).toEqual(['series', 'book', 'arc']) // the arc stays, what is under it goes
    expect(chapters(container)).toEqual([])
    expect(group().getByRole('button', { name: 'Expand all arcs' })).not.toHaveClass('wrNavDot--on')
    expect(group().getByRole('button', { name: 'Collapse all books' })).toHaveClass('wrNavDot--on')

    await userEvent.click(group().getByRole('button', { name: 'Collapse all books' }))
    expect(cards(container)).toEqual(['series', 'book']) // the book closes over its arc
    await userEvent.click(group().getByRole('button', { name: 'Collapse all series' }))
    expect(cards(container)).toEqual(['series'])

    await userEvent.click(group().getByRole('button', { name: 'Expand all series' }))
    await userEvent.click(group().getByRole('button', { name: 'Expand all books' }))
    expect(cards(container)).toEqual(['series', 'book', 'arc'])
    expect(chapters(container)).toEqual([]) // the arcs are still closed
    await userEvent.click(group().getByRole('button', { name: 'Expand all arcs' }))
    expect(chapters(container)).toEqual(['1 · Arrival', '2 · Storm'])
    expect(group().getByRole('button', { name: 'Collapse all arcs' })).toHaveClass('wrNavDot--on')
  })

  it('follow a card folded by its own head', async () => {
    const { container } = render(<Panel />)
    await userEvent.click(screen.getByRole('button', { name: /Setting out/ }))
    expect(chapters(container)).toEqual([])
    expect(group().getByRole('button', { name: 'Expand all arcs' })).toBeInTheDocument()
  })

  it('are dimmed when no card of their level has anything under it', () => {
    render(<Panel outline={OUTLINE.filter(n => n.id === 'series' || n.id === 'book')} />)
    expect(group().getByRole('button', { name: 'Collapse all series' })).toBeEnabled()
    expect(group().getByRole('button', { name: 'Expand all books' })).toBeDisabled() // a book with no arc or chapter
    expect(group().getByRole('button', { name: 'Expand all arcs' })).toBeDisabled() // there is none
  })
})

describe('the synopses circle', () => {
  it('is dimmed and cannot be pressed while no card has a synopsis', () => {
    render(<Panel />)
    expect(synopsisCircle()).toBeDisabled()
  })

  it('shows the whole synopsis of a series, a book, an arc and a chapter under its name, line breaks kept, and hides them again', async () => {
    const { container } = render(<Panel outline={written(SYNOPSES)} />)
    expect(container.querySelector('.wrPlotCardDesc')).toBeNull()
    await userEvent.click(synopsisCircle())
    expect(synopsisCircle()).toHaveAttribute('aria-label', 'Hide synopses')
    expect(synopsisCircle()).toHaveAttribute('aria-pressed', 'true')
    expect(synopsisCircle()).toHaveClass('wrNavDot--desc', 'wrNavDot--on')
    const text = (kind: string) => container.querySelector(`.wrPlotCard--${kind} > .wrPlotCardDesc`)!.textContent
    expect(text('series')).toBe('The whole saga.')
    expect(text('book')).toBe('First of three.\nA slow start.')
    expect(text('arc')).toBe('They set out.')
    const [arrival, storm] = [...container.querySelectorAll('.wrPlotChapter')]
    expect(arrival.querySelector('.wrPlotCardTitle')!.nextElementSibling).toHaveClass('wrPlotCardDesc')
    expect(arrival.querySelector('.wrPlotCardDesc')).toHaveTextContent('Arrival in the rain.')
    expect(storm.querySelector('.wrPlotCardDesc')).toBeNull() // a blank one shows nothing
    await userEvent.click(synopsisCircle())
    expect(container.querySelector('.wrPlotCardDesc')).toBeNull()
    expect(synopsisCircle()).not.toHaveClass('wrNavDot--on')
  })

  it('keeps a folded card\'s synopsis under its name', async () => {
    const { container } = render(<Panel outline={written(SYNOPSES)} />)
    await userEvent.click(synopsisCircle())
    await userEvent.click(group().getByRole('button', { name: 'Collapse all books' }))
    expect(container.querySelector('.wrPlotCard--book > .wrPlotCardDesc')).toHaveTextContent('First of three.')
    expect(container.querySelector('.wrPlotCard--arc')).toBeNull()
  })

  it('is its own setting, kept when the panel is opened again, and apart from the contents\' circle', async () => {
    const first = render(<Panel outline={written(SYNOPSES)} />)
    await userEvent.click(synopsisCircle())
    expect(getKv('scriblr.writer.plotOutlineDescriptions')).toBe(true)
    expect(getKv('scriblr.writer.plotNavDescriptions')).toBeUndefined()
    first.unmount()
    const { container } = render(<Panel outline={written(SYNOPSES)} />)
    expect(synopsisCircle()).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.wrPlotCard--series > .wrPlotCardDesc')).toHaveTextContent('The whole saga.')
  })

  it('works in the read-only panel too', async () => {
    const { container } = render(<Panel outline={written({ ch1: 'Arrival in the rain.' })} readOnly />)
    await userEvent.click(synopsisCircle())
    expect(container.querySelector('.wrPlotChapter .wrPlotCardDesc')).toHaveTextContent('Arrival in the rain.')
  })

  it('lights only for the four kinds the panel shows: an act\'s synopsis does not count', () => {
    render(<Panel outline={[...OUTLINE.filter(n => n.id !== 'act'), outlineNode('act', 'act', 'ch1', { synopsis: 'not shown' })]} />)
    expect(synopsisCircle()).toBeDisabled() // only an act has one
  })
})
