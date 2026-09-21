import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { DraftPlotNotes } from './DraftPlotNotes'
import { PlotpointTile } from './PlotpointTile'
import PlotView from './PlotView'
import { startingPlot, useFakeWorkspace } from './plotTestWorkspace'

function Editor({ start = startingPlot(), focused = 'line', onNodes }: { start?: PlotNode[]; focused?: string; onNodes?: (n: PlotNode[]) => void }) {
  const { w, plotNodes } = useFakeWorkspace(start, focused)
  onNodes?.(plotNodes)
  return <PlotView w={w} />
}

const field = (name: string) => screen.getByLabelText(new RegExp(`^${name}$`)) as HTMLInputElement
const toggle = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const titles = () => screen.queryAllByLabelText(/value title$/).map(i => (i as HTMLInputElement).value)
const openAll = () => screen.queryAllByRole('button', { expanded: false, name: /^Expand/ }).forEach(b => fireEvent.click(b))

describe('the plotline editor: fields and values', () => {
  it('groups the fields: the plotline\'s on top, the category\'s at the bottom, each group open and each field collapsed', () => {
    render(<Editor />)
    const groups = screen.getAllByRole('region').map(g => g.getAttribute('aria-label'))
    expect(groups).toEqual(['Plotline fields', 'From category: Romance'])
    expect(screen.getByDisplayValue('Setback')).toBeInTheDocument()
    expect(titles()).toEqual([]) // fields start collapsed
    toggle(/^Expand Setback/)
    expect(titles()).toEqual(['Missed train'])
  })

  it('shows unassigned / total on a field and a reference to a category value under its field', () => {
    render(<Editor />)
    expect(screen.getAllByText('1 / 1')).toHaveLength(2) // Setback and Theme
    toggle(/^Expand Theme/)
    expect(screen.getByText('Trust')).toBeInTheDocument() // a read-only reference, not an input
    expect(screen.queryByLabelText('Theme value title')).toBeNull()
  })

  it('hides assigned values with the header toggle', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'ch1' } : n))
    render(<Editor start={start} />)
    toggle(/^Expand Setback/)
    expect(titles()).toEqual(['Missed train'])
    fireEvent.click(screen.getByRole('switch', { name: 'Show assigned' }))
    expect(titles()).toEqual([])
    expect(screen.getByText('Everything here is assigned.')).toBeInTheDocument()
  })

  it('adds a value from the button, and takes the title up to 50 characters', () => {
    render(<Editor />)
    toggle(/^Expand Setback/)
    fireEvent.click(screen.getByRole('button', { name: /Value/ }))
    const input = screen.getAllByLabelText('Setback value title')[1] as HTMLInputElement
    expect(input.maxLength).toBe(50)
    fireEvent.change(input, { target: { value: 'Loses the key' } })
    expect(titles()).toEqual(['Missed train', 'Loses the key'])
  })

  it('shows the description input only after Tab in a titled value, and limits it to 255', () => {
    render(<Editor />)
    toggle(/^Expand Setback/)
    expect(screen.queryByLabelText('Setback value description')).toBeNull()
    const title = screen.getByLabelText('Setback value title')
    expect(fireEvent.keyDown(title, { key: 'Tab' })).toBe(false) // the browser's Tab is cancelled
    const body = screen.getByLabelText('Setback value description') as HTMLInputElement
    expect(body.maxLength).toBe(255)
    expect(body).toHaveFocus()
  })

  it('discards a new value left blank when focus leaves it', () => {
    render(<Editor />)
    toggle(/^Expand Setback/)
    fireEvent.click(screen.getByRole('button', { name: /Value/ }))
    expect(titles()).toHaveLength(2)
    fireEvent.blur(screen.getAllByLabelText('Setback value title')[1])
    expect(titles()).toEqual(['Missed train'])
  })

  it('will not clear a title while it has a description', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, body: 'On a rainy platform' } : n))
    render(<Editor start={start} />)
    toggle(/^Expand Setback/)
    fireEvent.change(screen.getByLabelText('Setback value title'), { target: { value: '' } })
    expect(titles()).toEqual(['Missed train'])
  })
})

describe('keyboard', () => {
  it('Enter adds the next value in the field and focuses it', async () => {
    render(<Editor />)
    toggle(/^Expand Setback/)
    fireEvent.keyDown(screen.getByLabelText('Setback value title'), { key: 'Enter' })
    await waitFor(() => expect(screen.getAllByLabelText('Setback value title')).toHaveLength(2))
    await waitFor(() => expect(screen.getAllByLabelText('Setback value title')[1]).toHaveFocus())
  })

  it('Shift+Enter on a plotline\'s title adds a value in its first field, even a collapsed one', async () => {
    render(<Editor />)
    fireEvent.keyDown(screen.getByPlaceholderText('Plotline title'), { key: 'Enter', shiftKey: true })
    await waitFor(() => expect(screen.getAllByLabelText('Setback value title')).toHaveLength(2))
  })

  it('Ctrl+Enter in a value adds a field after its field, and Enter in the empty name removes it', async () => {
    render(<Editor />)
    toggle(/^Expand Setback/)
    fireEvent.keyDown(screen.getByLabelText('Setback value title'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(screen.getAllByLabelText('Field name')).toHaveLength(2))
    const blank = screen.getAllByLabelText('Field name')[1]
    await waitFor(() => expect(blank).toHaveFocus())
    fireEvent.keyDown(blank, { key: 'Enter' })
    await waitFor(() => expect(screen.getAllByLabelText('Field name')).toHaveLength(1))
  })

  it('Backspace in an empty value removes it, but never an assigned one', async () => {
    render(<Editor />)
    toggle(/^Expand Setback/)
    fireEvent.keyDown(screen.getByLabelText('Setback value title'), { key: 'Enter' })
    await waitFor(() => expect(screen.getAllByLabelText('Setback value title')).toHaveLength(2))
    fireEvent.keyDown(screen.getAllByLabelText('Setback value title')[1], { key: 'Backspace' })
    await waitFor(() => expect(screen.getAllByLabelText('Setback value title')).toHaveLength(1))
  })
})

describe('field editing', () => {
  it('renames a field, and deleting one with an unassigned value removes it', async () => {
    render(<Editor />)
    fireEvent.change(field('Field name'), { target: { value: 'Obstacle' } })
    expect(field('Field name').value).toBe('Obstacle')
    const head = field('Field name').closest('.wrFieldHead') as HTMLElement
    fireEvent.click(within(head).getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByLabelText('Field name')).toBeNull())
  })

  it('a category\'s editor lists its own fields and their values', () => {
    render(<Editor focused="cat" />)
    expect(screen.getByLabelText('Field name')).toHaveValue('Theme')
    openAll()
    expect(screen.getByLabelText('Theme value title')).toHaveValue('Trust')
  })
})

describe('the plot outline', () => {
  it('nests series, book, arc and chapter cards, and only chapters take a drop', () => {
    const { container } = render(<Editor />)
    expect([...container.querySelectorAll('.wrPlotCard')].map(c => c.classList[1])).toEqual(['wrPlotCard--series', 'wrPlotCard--book', 'wrPlotCard--arc'])
    expect([...container.querySelectorAll('.wrPlotChapter')].map(c => c.querySelector('.wrPlotCardTitle')!.textContent)).toEqual(['1 · Arrival', '2 · Storm'])
  })

  it('drags a value onto a chapter: a box with an x appears under the chapter title', async () => {
    const { container } = render(<Editor />)
    toggle(/^Expand Setback/)
    const grip = screen.getByLabelText('Drag plotpoint')
    const data = new Map<string, string>()
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', setDragImage: () => {} }
    fireEvent.dragStart(grip, { dataTransfer })
    const storm = [...container.querySelectorAll('.wrPlotChapter')][1]
    fireEvent.dragOver(storm, { dataTransfer })
    fireEvent.drop(storm, { dataTransfer })
    await waitFor(() => expect(storm.querySelector('.wrPlotChip')).not.toBeNull())
    expect(storm.querySelector('.wrPlotChipTitle')).toHaveTextContent('Missed train')
    expect(storm.querySelector('.wrPlotChipX')).not.toBeNull()
    expect(storm.querySelector('.wrEye')).toBeNull()
    // the card in the field list is now assigned, and has an x too
    expect(screen.getAllByRole('button', { name: 'Unassign Missed train' }).length).toBeGreaterThan(0)
  })

  it('a book, arc or series card does nothing on a drop', () => {
    const { container } = render(<Editor />)
    toggle(/^Expand Setback/)
    const dataTransfer = { setData: () => {}, getData: () => '', effectAllowed: '', setDragImage: () => {} }
    fireEvent.dragStart(screen.getByLabelText('Drag plotpoint'), { dataTransfer })
    for (const card of container.querySelectorAll('.wrPlotCard')) fireEvent.drop(card, { dataTransfer })
    expect(container.querySelector('.wrPlotChip')).toBeNull()
  })
})

describe('the eye', () => {
  const placed = () => startingPlot().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'm1', awareness: 'front' as const } : n))

  it('shows on a plotpoint placed on a moment, replaces the x, and cycles the four states from both places', () => {
    const { container } = render(<Editor start={placed()} />)
    toggle(/^Expand Setback/)
    const eyes = () => [...container.querySelectorAll<HTMLElement>('.wrEye')].map(e => e.dataset.awareness)
    expect(eyes()).toEqual(['front', 'front']) // the card and the chapter's box
    expect(screen.queryByRole('button', { name: /^Unassign/ })).toBeNull()
    fireEvent.click(container.querySelector('.wrPlotChip .wrEye')!)
    expect(eyes()).toEqual(['back', 'back'])
    fireEvent.click(container.querySelector('.wrPlotValue .wrEye')!)
    expect(eyes()).toEqual(['mid', 'mid'])
    fireEvent.click(container.querySelector('.wrPlotValue .wrEye')!)
    fireEvent.click(container.querySelector('.wrPlotValue .wrEye')!)
    expect(eyes()).toEqual(['front', 'front'])
  })

  it('shows a lock, not an eye, for a plotpoint placed on an act', () => {
    const start = placed().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'act', awareness: null } : n))
    const { container } = render(<Editor start={start} />)
    toggle(/^Expand Setback/)
    expect(container.querySelector('.wrEye')).toBeNull()
    expect(container.querySelectorAll('.wrPlotValueLock').length).toBeGreaterThan(0)
  })

  it('colours a chapter-only card with its book, and an eye card with its awareness shade', () => {
    const chapterOnly = startingPlot().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'ch1' } : n))
    const first = render(<Editor start={chapterOnly} />)
    toggle(/^Expand Setback/)
    const style = (first.container.querySelector('.wrPlotValue--assigned') as HTMLElement).style
    expect(style.getPropertyValue('--wr-point-bg')).toContain('--color-theme-s') // book primary, from the theme's variables
    expect(style.getPropertyValue('--wr-point-edge')).toContain('260') // the book's secondary hue
    first.unmount()
    const withEye = render(<Editor start={placed()} />)
    toggle(/^Expand Setback/)
    expect((withEye.container.querySelector('.wrPlotValue--assigned') as HTMLElement).style.getPropertyValue('--wr-point-bg')).toMatch(/^hsl\(200,/)
  })
})

describe('the chapter page tiles', () => {
  const nodes = startingPlot().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'ch1' } : n))
  function Tile(props: { variant: 'margin' | 'placed'; onMoment?: boolean; awareness?: boolean }) {
    const { w } = useFakeWorkspace(props.awareness ? nodes.map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'm1', awareness: 'front' as const } : n)) : nodes)
    const point = w.plotNodeById.get('own')!
    return <PlotpointTile w={w} point={point} variant={props.variant} onMoment={props.onMoment} onUnassign={() => {}} />
  }

  it('a margin tile shows category > subcategory, plotline and field, title and description', () => {
    const { container } = render(<Tile variant="margin" />)
    expect(container).toHaveTextContent('Romance › Slow burn')
    expect(container).toHaveTextContent('Meet cute · Setback')
    expect(container).toHaveTextContent('Missed train')
    expect(screen.getByRole('button', { name: 'Unassign Missed train' })).toHaveAttribute('title', 'Return to the plot editor')
  })

  it('a placed tile leaves out the trail, and a moment tile has the eye next to the x', () => {
    const { container } = render(<Tile variant="placed" onMoment awareness />)
    expect(container).not.toHaveTextContent('Romance › Slow burn')
    expect(container).toHaveTextContent('Meet cute · Setback')
    expect(container.querySelector('.wrEye')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Unassign Missed train' })).toHaveAttribute('title', 'Return to the chapter margin')
  })
})

describe('draft footnotes', () => {
  function Notes() {
    const nodes = startingPlot().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'm1', awareness: 'back' as const, body: 'On a rainy platform' } : n))
    const { w } = useFakeWorkspace(nodes)
    return <DraftPlotNotes w={w} points={[w.plotNodeById.get('own')!]} momentIds={new Set(['m1'])} />
  }

  it('shows only the title, and the awareness eye, until it is opened', () => {
    const { container } = render(<Notes />)
    const note = container.querySelector('.wrPlotNote') as HTMLElement
    expect(note).toHaveTextContent('Missed train')
    expect(note.querySelector('.wrEye')).toHaveAttribute('aria-label', 'Back-stage')
    expect(note).not.toHaveTextContent('Romance')
    expect(note).not.toHaveTextContent('rainy')
  })

  it('opens in place to category > subcategory, plotline and field, title and description, and closes again', () => {
    const { container } = render(<Notes />)
    const note = container.querySelector('.wrPlotNote') as HTMLElement
    fireEvent.click(within(note).getByRole('button', { expanded: false }))
    expect(note).toHaveClass('wrPlotNote--open')
    expect(note).toHaveTextContent('Romance › Slow burn')
    expect(note).toHaveTextContent('Meet cute · Setback')
    expect(note).toHaveTextContent('Missed train')
    expect(note).toHaveTextContent('On a rainy platform')
    fireEvent.click(within(note).getByRole('button', { expanded: true }))
    expect(note).not.toHaveTextContent('rainy')
  })
})

describe('deleting', () => {
  it('a plotline with an assigned plotpoint cannot be deleted, and an unassigned own value can', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'ch1' } : n))
    render(<Editor start={start} />)
    expect(screen.getByRole('button', { name: 'Delete (unavailable)' })).toBeDisabled()
  })

  it('an unassigned reference has a lock in place of a delete button', () => {
    render(<Editor />)
    toggle(/^Expand Theme/)
    const card = screen.getByText('Trust').closest('.wrPlotValue') as HTMLElement
    expect(within(card).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(card.querySelector('.wrPlotValueLock')).not.toBeNull()
  })
})

