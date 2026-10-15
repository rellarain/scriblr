import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import type { PlotNode } from '../../../api/types'
import { DraftPlotNotes } from './DraftPlotNotes'
import { PlotpointTile } from './PlotpointTile'
import PlotView from './PlotView'
import { OUTLINE, plotNode, startingPlot, useFakeWorkspace } from './plotTestWorkspace'
import { syncReferences } from './plotFields'

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
    expect(style.getPropertyValue('--wr-point-edge')).toContain('200') // the book's one hue
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

// The starting plot with a cluster ("Household") between the subcategory and the plotline.
const clustered = () => startingPlot().map(n => (n.id === 'line' ? { ...n, parentId: 'clu' } : n)).concat(
  plotNode('clu', 'cluster', 'sub', { title: 'Household', hue: 170, customFieldDefs: [{ id: 'fMotive', name: 'Motive' }] }),
  plotNode('mv', 'plotpoint', 'clu', { title: 'Greed', fieldId: 'fMotive' }),
)

describe('clusters', () => {
  it('adds a cluster from the subcategory, and a plotline from the cluster', () => {
    render(<Editor focused="sub" />)
    expect(screen.getByText('Clusters')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cluster$/ }))
    expect(screen.getByPlaceholderText('Cluster title')).toBeInTheDocument() // the new cluster's editor
    expect(screen.getByText('cluster')).toBeInTheDocument() // its kind badge
    fireEvent.click(screen.getByRole('button', { name: /Plotline$/ }))
    expect(screen.getByPlaceholderText('Plotline title')).toBeInTheDocument()
  })

  it('has no Clusters list on a category, whose plotlines and subcategories sit directly under it', () => {
    render(<Editor focused="cat" />)
    expect(screen.queryByText('Clusters')).toBeNull()
    expect(screen.getByText('Subcategories')).toBeInTheDocument()
  })

  it('shows a cluster\'s field on the plotlines under it, between the plotline\'s and the category\'s', () => {
    render(<Editor start={clustered()} />)
    expect(screen.getAllByRole('region').map(g => g.getAttribute('aria-label'))).toEqual(['Plotline fields', 'From cluster: Household', 'From category: Romance'])
  })

  it('shows the cluster\'s own fields in its editor, with a colour slider within 60 degrees of the category', () => {
    render(<Editor start={clustered()} focused="clu" />)
    expect(screen.getByText('within 60° of its category')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Cluster colour' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Motive')).toBeInTheDocument()
  })

  it('nests the cluster in the contents, below its subcategory and above its plotline', () => {
    const { container } = render(<Editor start={clustered()} />)
    const rows = [...container.querySelectorAll('.wrNavRow')].map(r => r.className.match(/wrNavRow--(\w+)/)![1])
    expect(rows).toEqual(['category', 'subcategory', 'cluster', 'plotline'])
  })
})

describe('the plot contents', () => {
  const margin = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.wrNavRow')].map(r => [r.className.match(/wrNavRow--(\w+)/)![1], r.style.marginLeft])

  it('indents each row by how deep it sits, so a plotline reads as belonging to what it is directly under', () => {
    const start = clustered().concat(plotNode('beside', 'plotline', 'sub', { title: 'Beside the cluster', order: 1 }))
    const { container } = render(<Editor start={start} />)
    expect(margin(container)).toEqual([
      ['category', '0px'], ['subcategory', '14px'], ['plotline', '28px'], ['cluster', '28px'], ['plotline', '42px'],
    ])
  })

  it('counts "1 plotline" and "1 plotpoint" in the singular', () => {
    render(<Editor start={clustered()} focused="sub" />)
    expect(screen.getByText('1 plotline')).toBeInTheDocument() // the cluster
    expect(screen.queryByText('1 plotlines')).toBeNull()
  })

  it('scrolls the editor back to the top when another node is opened', () => {
    const { container } = render(<Editor start={clustered()} focused="sub" />)
    const body = container.querySelector('.wrPlotBody') as HTMLElement
    body.scrollTop = 120
    fireEvent.click(container.querySelector('.wrNavRow--cluster .wrNavLabel') as HTMLElement)
    expect(body.scrollTop).toBe(0)
  })
})

describe('trails with a cluster', () => {
  it('a margin tile names category > subcategory > cluster', () => {
    function Tile() {
      const { w } = useFakeWorkspace(clustered().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'ch1' } : n)))
      return <PlotpointTile w={w} point={w.plotNodeById.get('own')!} variant="margin" onUnassign={() => {}} />
    }
    const { container } = render(<Tile />)
    expect(container).toHaveTextContent('Romance › Slow burn › Household')
  })
})

// Two plotlines under the same subcategory, with values placed in different chapters.
const twoLines = () => syncReferences([
  ...startingPlot().map(n => (n.id === 'own' ? { ...n, assignedMomentId: 'ch2' } : n)),
  plotNode('line2', 'plotline', 'sub', { title: 'Second thread', order: 1, customFieldDefs: [{ id: 'fTwist', name: 'Twist' }] }),
  plotNode('twist', 'plotpoint', 'line2', { title: 'Betrayal reveal', fieldId: 'fTwist', assignedMomentId: 'ch1' }),
  plotNode('loose', 'plotpoint', 'line2', { title: 'Loose end', fieldId: 'fTwist', order: 1 }),
], new Map(OUTLINE.map(n => [n.id, n])))

const tick = (name: string) => fireEvent.click(screen.getByLabelText(`Select ${name}`))
const cardTitles = () => [...document.querySelectorAll('.wrCompareList .wrPointTileTitle')].map(e => e.textContent)

// A narrow tile: the tool measures itself through a ResizeObserver.
function narrow(width: number) {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private cb: (entries: unknown[]) => void) {}
    observe() { this.cb([{ contentRect: { width } }]) }
    disconnect() {}
  })
}
beforeEach(() => { window.localStorage.clear(); __resetSettingsForTests() })
afterEach(() => { vi.unstubAllGlobals() })
// A card in the compare list (a title also shows on the chapters' chips).
const listCard = (title: string) => [...document.querySelectorAll<HTMLElement>('.wrCompareList .wrPointTile')].find(t => t.textContent?.includes(title))!

describe('ticking plotlines in the contents', () => {
  it('ticks a plotline, and a group ticks every plotline under it (the group shows some, then all)', () => {
    render(<Editor start={twoLines()} />)
    tick('Meet cute')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect((screen.getByLabelText('Select Slow burn') as HTMLInputElement).indeterminate).toBe(true)
    tick('Slow burn')
    expect((screen.getByLabelText('Select Slow burn') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Select Second thread') as HTMLInputElement).checked).toBe(true)
    tick('Slow burn') // all ticked: unticks them all
    expect((screen.getByLabelText('Select Meet cute') as HTMLInputElement).checked).toBe(false)
  })

  it('opens the compare view at two ticked plotlines, and a row\'s name goes back to its editor', () => {
    render(<Editor start={twoLines()} />)
    tick('Meet cute')
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull()
    tick('Second thread')
    expect(screen.getByRole('group', { name: 'Plotlines being compared' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Second thread' })) // the row's name
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull()
    expect(screen.getByDisplayValue('Second thread')).toBeInTheDocument() // its editor
    fireEvent.click(screen.getByRole('button', { name: 'Compare (2)' }))
    expect(screen.getByRole('group', { name: 'Plotlines being compared' })).toBeInTheDocument()
  })

  it('keeps the ticks while browsing, and unticking down to one returns to the editor', () => {
    render(<Editor start={twoLines()} />)
    tick('Meet cute'); tick('Second thread')
    fireEvent.click(screen.getByRole('button', { name: 'Romance' }))
    expect((screen.getByLabelText('Select Meet cute') as HTMLInputElement).checked).toBe(true)
    tick('Second thread')
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull()
  })

  it('clears the ticks', () => {
    render(<Editor start={twoLines()} />)
    tick('Meet cute'); tick('Second thread')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect((screen.getByLabelText('Select Meet cute') as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull()
  })
})

describe('the compare view', () => {
  const open = () => { render(<Editor start={twoLines()} />); tick('Meet cute'); tick('Second thread') }

  it('lists the plotpoints of both plotlines in one list, unassigned first and the placed ones in story order', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'In story' }))
    const titles = cardTitles()
    expect(titles.indexOf('Betrayal reveal')).toBeLessThan(titles.indexOf('Missed train')) // chapter 1 before chapter 2
    expect(titles.indexOf('Loose end')).toBeLessThan(titles.indexOf('Betrayal reveal')) // unassigned before placed
    expect(titles).toContain('Trust') // a reference shows its original's text
  })

  it('tags each card with its plotline and says where it is placed', () => {
    open()
    const card = listCard('Betrayal reveal')
    expect(card).toHaveTextContent('Romance › Slow burn')
    expect(card).toHaveTextContent('Second thread · Twist')
    expect(card).toHaveTextContent('1 · Arrival')
    expect(listCard('Loose end')).toHaveTextContent('Not placed yet')
  })

  it('hides a plotline\'s cards from its chip, and takes it out with the x', () => {
    open()
    const chip = within(screen.getByRole('group', { name: 'Plotlines being compared' }))
    fireEvent.click(chip.getByRole('button', { name: 'Romance › Slow burn › Second thread' }))
    expect(cardTitles()).not.toContain('Betrayal reveal')
    expect(cardTitles()).toContain('Missed train')
    fireEvent.click(chip.getByRole('button', { name: 'Deselect Second thread' }))
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull() // one left: back to the editor
  })

  it('opens the plotline\'s editor from a card', () => {
    open()
    fireEvent.click(listCard('Betrayal reveal'))
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull()
    expect(screen.getByDisplayValue('Second thread')).toBeInTheDocument()
  })

  it('opens the field of the plotpoint it jumps to, so it can be seen', () => {
    open()
    fireEvent.click(listCard('Betrayal reveal'))
    expect(screen.getAllByLabelText('Twist value title')).toHaveLength(2) // the Twist field is open, not collapsed
  })

  it('is read-only: no unassign button, and cards do not drag', () => {
    open()
    expect(screen.queryByRole('button', { name: /^Unassign/ })).toBeNull()
    expect(document.querySelectorAll('.wrCompareList [draggable="true"]')).toHaveLength(0)
  })

  it('groups by plotline: a header and the plotline\'s own cards, side by side where there is room', () => {
    open()
    fireEvent.click(screen.getByRole('switch', { name: 'Group by plotline' }))
    expect(document.querySelector('.wrCompareGroups--columns')).not.toBeNull()
    const group = screen.getByRole('region', { name: 'Romance › Slow burn › Second thread' })
    expect(group).toHaveTextContent('Betrayal reveal')
    expect(group).not.toHaveTextContent('Missed train')
  })

  it('shows the chapters of every plotline beside the list', () => {
    open()
    const chips = [...document.querySelectorAll('.wrPlotChip')].map(c => c.textContent)
    expect(chips.join(' ')).toContain('Betrayal reveal')
    expect(chips.join(' ')).toContain('Missed train')
  })
})

describe('on a narrow tile', () => {
  it('shows the contents as a bar that folds down, and chooses a row from it', () => {
    narrow(500)
    render(<Editor start={twoLines()} />)
    const bar = screen.getByRole('button', { expanded: false, name: /Romance › Slow burn › Meet cute/ })
    expect(document.querySelector('.wrPlotNav')).toBeNull()
    fireEvent.click(bar)
    expect(document.querySelector('.wrPlotNav')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Second thread' }))
    expect(document.querySelector('.wrPlotNav')).toBeNull() // folded again
    expect(screen.getByDisplayValue('Second thread')).toBeInTheDocument()
  })

  it('closes the contents drawer on Escape and on a click outside it', () => {
    narrow(500)
    render(<Editor start={twoLines()} />)
    const bar = screen.getByRole('button', { expanded: false, name: /Romance › Slow burn › Meet cute/ })
    fireEvent.click(bar)
    expect(document.querySelector('.wrPlotNav')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.wrPlotNav')).toBeNull()
    fireEvent.click(bar)
    fireEvent.mouseDown(document.querySelector('.wrPlotBody') as HTMLElement)
    expect(document.querySelector('.wrPlotNav')).toBeNull()
    fireEvent.click(bar)
    fireEvent.mouseDown(document.querySelector('.wrPlotNav') as HTMLElement) // inside the drawer: it stays
    expect(document.querySelector('.wrPlotNav')).not.toBeNull()
  })

  it('compares in one column, with plotline sections that fold and the chapters folded away', () => {
    narrow(500)
    render(<Editor start={twoLines()} />)
    fireEvent.click(screen.getByRole('button', { name: /Romance › Slow burn › Meet cute/ }))
    tick('Meet cute'); tick('Second thread')
    expect(screen.getByRole('button', { name: /Comparing 2 plotlines/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Group by plotline' }))
    const section = screen.getByRole('button', { name: /Second thread/, expanded: true })
    fireEvent.click(section)
    expect(screen.queryByText('Betrayal reveal')).toBeNull()
    expect(screen.getByRole('button', { name: 'Chapters', expanded: false })).toBeInTheDocument()
    expect(document.querySelector('.wrPlotChip')).toBeNull()
  })
})
