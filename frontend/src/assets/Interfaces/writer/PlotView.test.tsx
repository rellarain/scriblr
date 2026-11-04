import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import type { OutlineNode, PlotNode } from '../../../api/types'
import { DraftPlotNotes } from './DraftPlotNotes'
import { PlotpointTile } from './PlotpointTile'
import PlotView from './PlotView'
import { holdTile } from '../../../test/tileDrag'
import { OUTLINE, outlineNode, placing, plotNode, startingPlot, useFakeWorkspace } from './plotTestWorkspace'
import { syncReferences } from './plotFields'

function Editor({ start = startingPlot(), focused = 'line', onNodes, outline }: { start?: PlotNode[]; focused?: string; onNodes?: (n: PlotNode[]) => void; outline?: OutlineNode[] }) {
  const { w, plotNodes } = useFakeWorkspace(start, focused, outline)
  onNodes?.(plotNodes)
  return <PlotView w={w} />
}

const field = (name: string) => screen.getByLabelText(new RegExp(`^${name}$`)) as HTMLInputElement
const toggle = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const titles = () => screen.queryAllByLabelText(/value title$/).map(i => (i as HTMLInputElement).value)
const openAll = () => screen.queryAllByRole('button', { expanded: false, name: /^Expand/ }).forEach(b => fireEvent.click(b))
// The console's tiles are regions too; the field groups are the others.
const TILES = ['Contents', 'Editor', 'Chapters', 'Compare', 'Plotpoints']
const fieldGroups = () => screen.getAllByRole('region').map(g => g.getAttribute('aria-label')).filter(l => !TILES.includes(l ?? ''))
const tile = (name: string) => within(screen.getByRole('region', { name }))

describe('the plotline editor: fields and values', () => {
  it('groups the fields: the plotline\'s on top, the category\'s at the bottom, each group open and each field collapsed', () => {
    render(<Editor />)
    const groups = fieldGroups()
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

  it('hides placed values with the header toggle', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch1')] } : n))
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

describe('the colour slider in a plot editor', () => {
  const unlabelled = (container: HTMLElement) => {
    expect(container.querySelector('.wrCardPanel .wrLabel')?.textContent).toBe('Description') // the first label is the description's: none over the colour
    expect([...container.querySelectorAll('.wrLabel')].some(l => /Colour/.test(l.textContent ?? ''))).toBe(false)
    expect(screen.queryByText(/within \d+°/)).toBeNull()
  }

  it.each([['cat', 'Category colour'], ['sub', 'Subcategory colour']])('has no label or hint over the %s\'s slider, which keeps its name', (id, name) => {
    const { container } = render(<Editor focused={id} />)
    expect(screen.getByRole('slider', { name })).toBeInTheDocument()
    unlabelled(container)
  })
})

describe('the eye', () => {
  const placed = () => startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('m1', 'front')] } : n))

  it('shows on a placement on a moment, in the chapter\'s box, replaces the x there, and cycles the four states', () => {
    const { container } = render(<Editor start={placed()} />)
    toggle(/^Expand Setback/)
    const eyes = () => [...container.querySelectorAll<HTMLElement>('.wrEye')].map(e => e.dataset.awareness)
    // The eye belongs to the placement, not to the plotpoint: the card in its field has none.
    expect(eyes()).toEqual(['front'])
    expect(container.querySelector('.wrPlotValue .wrEye')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Unassign/ })).toBeNull()
    fireEvent.click(container.querySelector('.wrPlotChip .wrEye')!)
    expect(eyes()).toEqual(['back'])
    fireEvent.click(container.querySelector('.wrPlotChip .wrEye')!)
    fireEvent.click(container.querySelector('.wrPlotChip .wrEye')!)
    fireEvent.click(container.querySelector('.wrPlotChip .wrEye')!)
    expect(eyes()).toEqual(['front'])
  })

  it('gives each placement its own awareness: two on moments cycle on their own', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('m1', 'front'), placing('m2', 'off')] } : n))
    const { container } = render(<Editor start={start} outline={[...OUTLINE, outlineMoment2]} />)
    const eyes = () => [...container.querySelectorAll<HTMLElement>('.wrPlotChip .wrEye')].map(e => e.dataset.awareness)
    expect(eyes()).toEqual(['front', 'off'])
    fireEvent.click(container.querySelectorAll('.wrPlotChip .wrEye')[0])
    expect(eyes()).toEqual(['back', 'off'])
  })

  it('shows a lock, not an eye, for a plotpoint placed on an act', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('act')] } : n))
    const { container } = render(<Editor start={start} />)
    toggle(/^Expand Setback/)
    expect(container.querySelector('.wrEye')).toBeNull()
    expect(container.querySelectorAll('.wrPlotValueLock').length).toBeGreaterThan(0)
  })

  it('colours a placement\'s box with its book (a chapter) or its awareness shade (a moment), and the card in the field keeps its category colours', () => {
    const chapterOnly = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch1')] } : n))
    const first = render(<Editor start={chapterOnly} />)
    toggle(/^Expand Setback/)
    const style = (first.container.querySelector('.wrPlotChip') as HTMLElement).style
    expect(style.getPropertyValue('--wr-point-bg')).toContain('--color-theme-s') // book primary, from the theme's variables
    expect(style.getPropertyValue('--wr-point-edge')).toContain('200') // the book's one hue
    expect((first.container.querySelector('.wrPlotValue--assigned') as HTMLElement).style.getPropertyValue('--wr-point-bg')).toBe('')
    first.unmount()
    const withEye = render(<Editor start={placed()} />)
    expect((withEye.container.querySelector('.wrPlotChip') as HTMLElement).style.getPropertyValue('--wr-point-bg')).toMatch(/^hsl\(200,/)
  })
})

// A second moment under the same scene as the first (OUTLINE has the moment 'm1').
const outlineMoment2 = outlineNode('m2', 'moment', 'scene', { order: 1 })

describe('placing a value many times', () => {
  const several = () => startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch1'), placing('ch2')] } : n))
  const dataTransfer = () => { const data = new Map<string, string>(); return { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', setDragImage: () => {} } }

  it('counts the placements on the value card and, added up, on the field\'s heading, and a placed value stays in its field', () => {
    render(<Editor start={several()} />)
    toggle(/^Expand Setback/)
    const card = screen.getByLabelText('Setback value title').closest('.wrPlotValue') as HTMLElement
    expect(within(card).getByLabelText('Placed 2 times').textContent).toBe('×2')
    const head = screen.getByLabelText('Field name').closest('.wrFieldHead') as HTMLElement
    expect(head.querySelector('.wrFieldCount')).toHaveTextContent('0 / 1') // none left to place
    expect(within(head).getByTitle('2 placements in all').textContent).toBe('×2')
    expect(titles()).toEqual(['Missed train'])
  })

  it('shows a box in each chapter it is placed in, and the x of one takes only that placement away', () => {
    const { container } = render(<Editor start={several()} />)
    const chips = () => [...container.querySelectorAll('.wrPlotChapter .wrPlotChip')].map(c => c.closest('.wrPlotChapter')!.querySelector('.wrPlotCardTitle')!.textContent)
    expect(chips()).toEqual(['1 · Arrival', '2 · Storm'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Unassign Missed train' })[0])
    expect(chips()).toEqual(['2 · Storm'])
    toggle(/^Expand Setback/)
    expect(screen.getByLabelText('Placed once').textContent).toBe('×1')
  })

  it('drags a placed value onto another chapter for one more placement, and onto one it is already on for none', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch1')] } : n))
    const { container } = render(<Editor start={start} />)
    toggle(/^Expand Setback/)
    const dt = dataTransfer()
    const chapters = [...container.querySelectorAll('.wrPlotChapter')]
    fireEvent.dragStart(screen.getByLabelText('Drag plotpoint'), { dataTransfer: dt }) // a placed value still has its grip
    fireEvent.dragOver(chapters[1], { dataTransfer: dt })
    fireEvent.drop(chapters[1], { dataTransfer: dt })
    expect(container.querySelectorAll('.wrPlotChip')).toHaveLength(2)
    expect(screen.getByLabelText('Placed 2 times')).toBeInTheDocument()
    fireEvent.dragStart(screen.getByLabelText('Drag plotpoint'), { dataTransfer: dt })
    fireEvent.drop(chapters[0], { dataTransfer: dt })
    expect(container.querySelectorAll('.wrPlotChip')).toHaveLength(2)
  })

  it('cannot be deleted while it has a placement, and says how many', () => {
    render(<Editor start={several()} />)
    toggle(/^Expand Setback/)
    const card = screen.getByLabelText('Setback value title').closest('.wrPlotValue') as HTMLElement
    expect(within(card).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(card.querySelector('.wrPlotValueLock')).toHaveAttribute('title', expect.stringContaining('Placed 2 times'))
  })
})

describe('the chapter page tiles', () => {
  const nodes = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch1')] } : n))
  function Tile(props: { variant: 'margin' | 'placed'; onMoment?: boolean; count?: number; position?: { n: number; of: number } }) {
    const { w } = useFakeWorkspace(props.onMoment ? nodes.map(n => (n.id === 'own' ? { ...n, placements: [placing('m1', 'front')] } : n)) : nodes)
    const point = w.plotNodeById.get('own')!
    return <PlotpointTile w={w} point={point} placement={props.variant === 'placed' ? point.placements?.[0] : undefined} variant={props.variant} count={props.count} position={props.position} onUnassign={() => {}} />
  }

  it('a margin tile shows category > subcategory, plotline and field, title and description, and how many times the plotpoint is placed', () => {
    const { container } = render(<Tile variant="margin" count={3} />)
    expect(container).toHaveTextContent('Romance › Slow burn')
    expect(container).toHaveTextContent('Meet cute · Setback')
    expect(container).toHaveTextContent('Missed train')
    expect(screen.getByLabelText('Placed 3 times').textContent).toBe('×3')
  })

  it('has no counter for a plotpoint placed nowhere, and says "once" for one place', () => {
    const none = render(<Tile variant="margin" count={0} />)
    expect(none.container.querySelector('.wrCount')).toBeNull()
    none.unmount()
    render(<Tile variant="margin" count={1} />)
    expect(screen.getByLabelText('Placed once').textContent).toBe('×1')
  })

  it('a placed tile leaves out the trail, has the eye of its own placement next to the x, and says which of several places it is', () => {
    const { container } = render(<Tile variant="placed" onMoment position={{ n: 2, of: 3 }} />)
    expect(container).not.toHaveTextContent('Romance › Slow burn')
    expect(container).toHaveTextContent('Meet cute · Setback')
    expect(container.querySelector('.wrEye')).not.toBeNull()
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unassign Missed train' })).toHaveAttribute('title', 'Take this placement away')
  })

  it('says nothing of its place when it is the only one', () => {
    render(<Tile variant="placed" position={{ n: 1, of: 1 }} />)
    expect(screen.queryByText(/ of /)).toBeNull()
  })
})

describe('draft footnotes', () => {
  function Notes() {
    const nodes = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('m1', 'back')], body: 'On a rainy platform' } : n))
    const { w } = useFakeWorkspace(nodes)
    const point = w.plotNodeById.get('own')!
    return <DraftPlotNotes w={w} points={[{ point, placement: point.placements![0] }]} momentIds={new Set(['m1'])} />
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
  it('a plotline with a placed plotpoint cannot be deleted', () => {
    const start = startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch1')] } : n))
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
    expect(fieldGroups()).toEqual(['Plotline fields', 'From cluster: Household', 'From category: Romance'])
  })

  it('shows the cluster\'s own fields in its editor, with a colour slider within 30 degrees of its subcategory', () => {
    render(<Editor start={clustered()} focused="clu" />)
    expect(screen.getByRole('slider', { name: 'Cluster colour' })).toBeInTheDocument()
    expect(screen.queryByText(/within 30°/)).toBeNull() // no label or hint over the slider
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
    const body = container.querySelector('.wrPlotBody--editor') as HTMLElement
    body.scrollTop = 120
    fireEvent.click(container.querySelector('.wrNavRow--cluster .wrNavLabel') as HTMLElement)
    expect(body.scrollTop).toBe(0)
  })
})

describe('trails with a cluster', () => {
  it('a margin tile names category > subcategory > cluster', () => {
    function Tile() {
      const { w } = useFakeWorkspace(clustered().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch1')] } : n)))
      return <PlotpointTile w={w} point={w.plotNodeById.get('own')!} variant="margin" onUnassign={() => {}} />
    }
    const { container } = render(<Tile />)
    expect(container).toHaveTextContent('Romance › Slow burn › Household')
  })
})

// Two plotlines under the same subcategory, with values placed in different chapters.
const twoLines = () => syncReferences([
  ...startingPlot().map(n => (n.id === 'own' ? { ...n, placements: [placing('ch2')] } : n)),
  plotNode('line2', 'plotline', 'sub', { title: 'Second thread', order: 1, customFieldDefs: [{ id: 'fTwist', name: 'Twist' }] }),
  plotNode('twist', 'plotpoint', 'line2', { title: 'Betrayal reveal', fieldId: 'fTwist', placements: [placing('ch1'), placing('ch2')] }),
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

  it('turns the compare tile on at two ticked plotlines, and a row\'s name opens its editor beside it', () => {
    render(<Editor start={twoLines()} />)
    tick('Meet cute')
    expect(screen.queryByRole('region', { name: 'Compare' })).toBeNull()
    tick('Second thread')
    expect(screen.getByRole('group', { name: 'Plotlines being compared' })).toBeInTheDocument()
    fireEvent.click(tile('Contents').getByRole('button', { name: 'Second thread' })) // the row's name
    expect(screen.getByDisplayValue('Second thread')).toBeInTheDocument() // its editor
    expect(screen.getByRole('group', { name: 'Plotlines being compared' })).toBeInTheDocument() // the comparison stays
  })

  it('brings the compare tile back with Compare (n) after it is turned off', () => {
    render(<Editor start={twoLines()} />)
    tick('Meet cute'); tick('Second thread')
    fireEvent.click(screen.getByRole('button', { name: 'Compare', pressed: true })) // its tab in the rail
    expect(screen.queryByRole('region', { name: 'Compare' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Compare (2)' }))
    expect(screen.getByRole('group', { name: 'Plotlines being compared' })).toBeInTheDocument()
  })

  it('keeps the ticks while browsing, and unticking down to one leaves the compare tile empty', () => {
    render(<Editor start={twoLines()} />)
    tick('Meet cute'); tick('Second thread')
    fireEvent.click(tile('Contents').getByRole('button', { name: 'Romance' }))
    expect((screen.getByLabelText('Select Meet cute') as HTMLInputElement).checked).toBe(true)
    tick('Second thread')
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull() // the tile asks for two
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
    fireEvent.click(tile('Compare').getByRole('button', { name: 'In story' }))
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
    expect(card).toHaveTextContent('1 · Arrival and 1 more') // its first place in story order, and how many more it has
    expect(listCard('Missed train')).toHaveTextContent('2 · Storm')
    expect(listCard('Missed train')).not.toHaveTextContent('more')
    expect(listCard('Loose end')).toHaveTextContent('Not placed yet')
    expect(within(card).getByLabelText('Placed 2 times')).toBeInTheDocument()
  })

  it('hides a plotline\'s cards from its chip, and takes it out with the x', () => {
    open()
    const chip = within(screen.getByRole('group', { name: 'Plotlines being compared' }))
    fireEvent.click(chip.getByRole('button', { name: 'Romance › Slow burn › Second thread' }))
    expect(cardTitles()).not.toContain('Betrayal reveal')
    expect(cardTitles()).toContain('Missed train')
    fireEvent.click(chip.getByRole('button', { name: 'Deselect Second thread' }))
    expect(screen.queryByRole('group', { name: 'Plotlines being compared' })).toBeNull() // one left: the tile asks for another
    expect(tile('Compare').getByText(/Tick two or more plotlines/)).toBeInTheDocument()
  })

  it('opens the plotline\'s editor from a card', () => {
    open()
    fireEvent.click(listCard('Betrayal reveal'))
    expect(screen.getByDisplayValue('Second thread')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Plotlines being compared' })).toBeInTheDocument() // the comparison stays open beside it
  })

  it('opens the field of the plotpoint it jumps to, so it can be seen', () => {
    open()
    fireEvent.click(listCard('Betrayal reveal'))
    expect(screen.getAllByLabelText('Twist value title')).toHaveLength(2) // the Twist field is open, not collapsed
  })

  it('is read-only: no unassign button, and cards do not drag', () => {
    open()
    expect(tile('Compare').queryByRole('button', { name: /^Unassign/ })).toBeNull()
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
    const chips = [...screen.getByRole('region', { name: 'Compare' }).querySelectorAll('.wrPlotChip')].map(c => c.textContent)
    expect(chips.join(' ')).toContain('Betrayal reveal')
    expect(chips.join(' ')).toContain('Missed train')
  })
})

describe('on a narrow tile', () => {
  it('compares in one column, with plotline sections that fold and the chapters folded away', () => {
    narrow(500)
    render(<Editor start={twoLines()} />)
    tick('Meet cute'); tick('Second thread')
    const compare = tile('Compare')
    fireEvent.click(compare.getByRole('switch', { name: 'Group by plotline' }))
    const section = compare.getByRole('button', { name: /Second thread/, expanded: true })
    fireEvent.click(section)
    expect(compare.queryByText('Betrayal reveal')).toBeNull()
    expect(compare.getByRole('button', { name: 'Chapters', expanded: false })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Compare' }).querySelector('.wrPlotChip')).toBeNull()
  })
})

// The parents above an editor's title: read-only chips, top-down, each with its description.
const described = (nodes: PlotNode[]) => nodes.map(n => (n.id === 'cat' ? { ...n, body: 'Two people, slowly.' } : n.id === 'sub' ? { ...n, body: 'It takes a whole winter.' } : n))

describe('the parent chips', () => {
  const chips = () => within(screen.getByRole('group', { name: 'Parents' }))

  it('sit above the plotline\'s title, top-down, each minimized to its title', () => {
    render(<Editor start={described(clustered())} />)
    const group = screen.getByRole('group', { name: 'Parents' })
    const title = screen.getByPlaceholderText('Plotline title')
    expect(group.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect([...group.querySelectorAll('.wrParent')].map(c => c.className.match(/wrParent--(\w+)/)![1])).toEqual(['category', 'subcategory', 'cluster'])
    expect(chips().getByRole('button', { name: 'Expand Romance' })).toHaveAttribute('aria-expanded', 'false')
    expect(group).not.toHaveTextContent('Two people, slowly.') // minimized: no description
    expect(screen.queryByText('plotline', { selector: '.wrKindBadge' })).not.toBeNull() // the editor itself is unchanged
  })

  it('show the keywords when minimized, and the whole description besides when expanded', () => {
    const start = described(clustered()).map(n => (n.id === 'cat' ? { ...n, keywords: ['love', 'slow'] } : n))
    render(<Editor start={start} />)
    const cat = document.querySelector('.wrParent--category') as HTMLElement
    expect(within(within(cat).getByRole('list', { name: 'Keywords of Romance' })).getAllByRole('listitem').map(i => i.textContent)).toEqual(['love', 'slow'])
    const clu = document.querySelector('.wrParent--cluster') as HTMLElement
    expect(clu.querySelector('.wrParentBody')).toBeNull() // no description, no keywords: only its title
    expect(within(clu).queryByRole('list')).toBeNull()
    fireEvent.click(within(cat).getByRole('button', { name: 'Expand Romance' }))
    expect(cat).toHaveClass('wrParent--open')
    expect(within(cat).getByText('Two people, slowly.')).toHaveClass('wrParentBody') // the whole of it
    expect(within(cat).getByRole('list', { name: 'Keywords of Romance' })).toBeInTheDocument() // the keywords stay
    expect(within(cat).queryByLabelText('Category title')).toBeNull() // not the editor yet
    fireEvent.click(within(cat).getByRole('button', { name: 'Collapse Romance' }))
    expect(within(cat).queryByText('Two people, slowly.')).toBeNull()
    expect(within(cat).getByRole('list', { name: 'Keywords of Romance' })).toBeInTheDocument()
  })

  it('open the editor only from the expanded state, and the pencil goes back to it', () => {
    render(<Editor start={described(clustered())} />)
    expect(chips().queryByRole('button', { name: 'Edit Romance' })).toBeNull() // minimized: there is no pencil
    fireEvent.click(chips().getByRole('button', { name: 'Expand Romance' }))
    expect(chips().queryByLabelText('Category title')).toBeNull()
    fireEvent.click(chips().getByRole('button', { name: 'Edit Romance' }))
    expect(chips().getByLabelText('Category title')).toHaveValue('Romance')
    expect(document.querySelector('.wrParent--category')).toHaveClass('wrParent--editing')
    fireEvent.click(chips().getByRole('button', { name: 'Stop editing Romance' }))
    expect(chips().queryByLabelText('Category title')).toBeNull()
    expect(chips().getByText('Two people, slowly.')).toBeInTheDocument() // back to expanded
    fireEvent.click(chips().getByRole('button', { name: 'Edit Romance' }))
    fireEvent.click(chips().getByRole('button', { name: 'Collapse Romance' })) // the chevron minimizes from the editor too
    expect(chips().getByRole('button', { name: 'Expand Romance' })).toBeInTheDocument()
    expect(chips().queryByLabelText('Category title')).toBeNull()
  })

  it('expand for a parent with no description too, and the title then opens that parent', () => {
    render(<Editor start={described(clustered())} />)
    fireEvent.click(chips().getByRole('button', { name: 'Expand Household' })) // a description can be written in the editor
    expect(chips().queryByLabelText('Cluster title')).toBeNull()
    fireEvent.click(chips().getByRole('button', { name: 'Edit Household' }))
    expect(chips().getByLabelText('Cluster title')).toHaveValue('Household')
    fireEvent.click(chips().getByRole('button', { name: 'Open Household' }))
    expect(screen.getByPlaceholderText('Cluster title')).toHaveValue('Household')
  })

  it('open the parent\'s editor from the pencil, and the title then opens the parent\'s own editor', () => {
    render(<Editor start={described(clustered())} />)
    fireEvent.click(chips().getByRole('button', { name: 'Expand Slow burn' }))
    fireEvent.click(chips().getByRole('button', { name: 'Edit Slow burn' }))
    expect(chips().getByLabelText('Subcategory description')).toHaveValue('It takes a whole winter.')
    fireEvent.click(chips().getByRole('button', { name: 'Collapse Slow burn' }))
    expect(chips().getByRole('button', { name: 'Expand Slow burn' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chips().getByRole('button', { name: 'Expand Slow burn' }))
    fireEvent.click(chips().getByRole('button', { name: 'Open Slow burn' }))
    expect(screen.getByPlaceholderText('Subcategory title')).toHaveValue('Slow burn')
  })

  it('are closed with no input in them, and the editor has the title, description, colour and keywords to change in place', () => {
    render(<Editor start={described(clustered())} />)
    expect(document.querySelector('.wrParents input, .wrParents textarea')).toBeNull()
    fireEvent.click(chips().getByRole('button', { name: 'Expand Romance' }))
    expect(document.querySelector('.wrParents input, .wrParents textarea')).toBeNull() // expanded is still only reading
    fireEvent.click(chips().getByRole('button', { name: 'Edit Romance' }))
    expect(chips().getByRole('slider', { name: 'Category colour' })).toBeInTheDocument()
    expect(chips().getByPlaceholderText('Add keyword…')).toBeInTheDocument()
    fireEvent.change(chips().getByLabelText('Category title'), { target: { value: 'Love stories' } })
    fireEvent.change(chips().getByLabelText('Category description'), { target: { value: 'Always two people.' } })
    expect(tile('Contents').getByRole('button', { name: 'Love stories' })).toBeInTheDocument() // the contents follow
    expect(chips().getByLabelText('Category description')).toHaveValue('Always two people.')
  })

  it('open the grandparent and the parent together, each onto its own fields', () => {
    render(<Editor start={described(clustered())} />)
    fireEvent.click(chips().getByRole('button', { name: 'Expand Romance' }))
    fireEvent.click(chips().getByRole('button', { name: 'Edit Romance' }))
    fireEvent.click(chips().getByRole('button', { name: 'Expand Slow burn' }))
    fireEvent.click(chips().getByRole('button', { name: 'Edit Slow burn' }))
    fireEvent.change(chips().getByLabelText('Subcategory title'), { target: { value: 'Long winter' } })
    expect(chips().getByLabelText('Category title')).toHaveValue('Romance') // the other one is unchanged
    expect(tile('Contents').getByRole('button', { name: 'Long winter' })).toBeInTheDocument()
  })

  it('show on a cluster\'s and a subcategory\'s editor, and not on a category\'s', () => {
    const { unmount } = render(<Editor start={described(clustered())} focused="clu" />)
    expect([...document.querySelectorAll('.wrParent')].map(c => c.className.match(/wrParent--(\w+)/)![1])).toEqual(['category', 'subcategory'])
    unmount()
    const sub = render(<Editor start={described(clustered())} focused="sub" />)
    expect([...document.querySelectorAll('.wrParent')].map(c => c.className.match(/wrParent--(\w+)/)![1])).toEqual(['category'])
    sub.unmount()
    render(<Editor start={described(clustered())} focused="cat" />)
    expect(screen.queryByRole('group', { name: 'Parents' })).toBeNull()
  })

  it('head each plotline in the compare view\'s groups, and a title there opens that parent in the editor', () => {
    render(<Editor start={described(twoLines())} />)
    tick('Meet cute'); tick('Second thread')
    fireEvent.click(screen.getByRole('switch', { name: 'Group by plotline' }))
    const group = screen.getByRole('region', { name: 'Romance › Slow burn › Second thread' })
    const parents = within(within(group).getByRole('group', { name: 'Parents' }))
    expect(parents.getByRole('button', { name: /Romance/ })).toBeInTheDocument()
    fireEvent.click(parents.getByRole('button', { name: /Slow burn/ }))
    expect(parents.getByText('It takes a whole winter.')).toBeInTheDocument() // expanded: the description
    expect(parents.queryByRole('button', { name: /^Edit / })).toBeNull() // and no editor in Compare
    fireEvent.click(parents.getByRole('button', { name: 'Open Slow burn' }))
    expect(screen.getByPlaceholderText('Subcategory title')).toHaveValue('Slow burn') // the editor goes to the parent; the comparison stays
  })
})

describe('the contents order', () => {
  it('lists a category\'s own plotlines before its subcategories, and a subcategory\'s before its clusters', () => {
    const start = clustered().concat(
      plotNode('direct', 'plotline', 'cat', { title: 'Zzz straight under', order: 5 }),
      plotNode('late', 'plotline', 'sub', { title: 'Zzz late', order: 6 }),
    )
    const { container } = render(<Editor start={start} />)
    const rows = [...container.querySelectorAll('.wrNavRow')].map(r => [r.className.match(/wrNavRow--(\w+)/)![1], r.querySelector('.wrNavLabel')?.textContent])
    expect(rows).toEqual([
      ['category', 'Romance'], ['plotline', 'Zzz straight under'],
      ['subcategory', 'Slow burn'], ['plotline', 'Zzz late'], ['cluster', 'Household'], ['plotline', 'Meet cute'],
    ])
  })
})

describe('fields inherited down the tree', () => {
  // The starting plot: Romance (Theme) > Slow burn > Meet cute. Clustered: Household (Motive) sits between Slow burn and Meet cute.
  const regions = () => fieldGroups().filter(l => /^(Fields|From )/.test(l ?? ''))

  it('shows the fields of a category as its own only', () => {
    render(<Editor focused="cat" />)
    expect(regions()).toEqual(['Fields'])
  })

  it('gives a subcategory the fields of its category, read-only, under its own', () => {
    render(<Editor focused="sub" />)
    expect(regions()).toEqual(['Fields', 'From category: Romance'])
    const group = screen.getByRole('region', { name: 'From category: Romance' })
    expect(group.querySelector('.wrFieldGroupOrigin')).toHaveTextContent(/^Category$/)
    expect(within(group).getByText('Theme')).toBeInTheDocument()
    expect(within(group).queryByLabelText('Field name')).toBeNull() // defined above: not renamed here
  })

  it('gives a cluster the fields of its subcategory and its category, nearest first', () => {
    const sub = clustered().map(n => (n.id === 'sub' ? { ...n, customFieldDefs: [{ id: 'fPace', name: 'Pace' }] } : n))
    render(<Editor start={sub} focused="clu" />)
    expect(regions()).toEqual(['Fields', 'From subcategory: Slow burn', 'From category: Romance'])
    expect(within(screen.getByRole('region', { name: 'From subcategory: Slow burn' })).getByText('Pace')).toBeInTheDocument()
  })

  it('lets a subcategory answer an inherited field with values of its own, which its plotlines then show as references', () => {
    const seen: { nodes: PlotNode[] } = { nodes: [] }
    render(<Editor focused="sub" onNodes={n => { seen.nodes = n }} />)
    const group = screen.getByRole('region', { name: 'From category: Romance' })
    expect(within(group).queryByText('Trust')).toBeNull() // the category's own value is the category's
    fireEvent.click(within(group).getByRole('button', { name: /^Expand Theme/ }))
    fireEvent.click(within(group).getByRole('button', { name: /Value/ }))
    const held = seen.nodes.filter(n => n.kind === 'plotpoint' && n.fieldId === 'fTheme' && n.parentId === 'sub' && !n.refId)
    expect(held).toHaveLength(1)
    // the plotline under it holds a reference to that value as well as to the category's
    expect(seen.nodes.filter(n => n.parentId === 'line' && n.fieldId === 'fTheme' && n.refId).map(n => n.refId).sort()).toEqual([held[0].id, 'val'].sort())
  })
})

describe('inherited field groups', () => {
  it('put the parent\'s title first and its kind ("Category") at the far right of the head', () => {
    render(<Editor />)
    const head = screen.getByRole('region', { name: 'From category: Romance' }).querySelector('.wrFieldGroupHead') as HTMLElement
    expect(head.querySelector('.wrFieldGroupName')).toHaveTextContent('Romance')
    expect(head.lastElementChild).toHaveClass('wrFieldGroupOrigin')
    expect(head.lastElementChild).toHaveTextContent(/^Category$/)
  })
})

describe('the level fold circles', () => {
  const dots = () => within(screen.getByRole('group', { name: 'Fold a whole level' }))
  const rowKinds = (container: HTMLElement) => [...container.querySelectorAll('.wrNavRow')].map(r => r.className.match(/wrNavRow--(\w+)/)![1])
  const withTwo = () => clustered().concat(plotNode('cat2', 'category', null, { title: 'Action', order: 1 }), plotNode('sub2', 'subcategory', 'cat2', { title: 'Chase' }), plotNode('line2', 'plotline', 'sub2', { title: 'Rooftop' }))

  it('sit at the top right as three, for categories, subcategories and clusters, with the full descriptions and keywords circles after them, and "Category" is in the head too', () => {
    const { container } = render(<Editor start={clustered()} />)
    const head = container.querySelector('.wrPlotNavHead') as HTMLElement
    expect(head.lastElementChild).toHaveClass('wrNavTools')
    expect(head.lastElementChild!.firstElementChild).toHaveClass('wrNavDots')
    expect(within(head).getByRole('button', { name: /^\s*Category$/ })).toBeInTheDocument()
    expect([...container.querySelectorAll('.wrPlotNavHead .wrNavDots .wrNavDot')].map(d => d.getAttribute('aria-label'))).toEqual(['Collapse all categories', 'Collapse all subcategories', 'Collapse all clusters'])
    expect([...head.lastElementChild!.children].map(c => c.className)).toEqual(['wrNavDots', 'wrNavDot wrNavDot--desc', 'wrNavDot wrNavDot--keys'])
    expect(container.querySelector('.wrPlotNav')!.lastElementChild).toHaveClass('wrPlotNavRows')
  })

  it('are lit while any node of their level is open, and a click folds or opens the whole level', () => {
    const { container } = render(<Editor start={withTwo()} />)
    expect(rowKinds(container).filter(k => k === 'category')).toHaveLength(2)
    expect(dots().getByRole('button', { name: 'Collapse all categories' })).toHaveClass('wrNavDot--on')
    fireEvent.click(dots().getByRole('button', { name: 'Collapse all categories' }))
    expect(rowKinds(container)).toEqual(['category', 'category']) // both closed: nothing under them shows
    expect(dots().getByRole('button', { name: 'Expand all categories' })).not.toHaveClass('wrNavDot--on')
    fireEvent.click(dots().getByRole('button', { name: 'Expand all categories' }))
    expect(rowKinds(container)).toContain('plotline')
  })

  it('fold one level without touching the others', () => {
    const { container } = render(<Editor start={withTwo()} />)
    fireEvent.click(dots().getByRole('button', { name: 'Collapse all clusters' }))
    expect(rowKinds(container)).toEqual(['category', 'subcategory', 'plotline', 'category', 'subcategory', 'cluster'])
    expect(dots().getByRole('button', { name: 'Collapse all subcategories' })).toHaveClass('wrNavDot--on')
    expect(dots().getByRole('button', { name: 'Expand all clusters' })).not.toHaveClass('wrNavDot--on')
  })

  it('light again when one node of the level is opened by its own chevron, and are off when no node of the level has anything under it', () => {
    const { container } = render(<Editor start={clustered()} />)
    fireEvent.click(dots().getByRole('button', { name: 'Collapse all categories' }))
    fireEvent.click(container.querySelector('.wrNavRow--category .wrNavChevron') as HTMLElement)
    expect(dots().getByRole('button', { name: 'Collapse all categories' })).toHaveClass('wrNavDot--on')
    const flat = render(<Editor start={[plotNode('only', 'category', null, { title: 'Alone' })]} focused="only" />)
    expect(within(flat.container).getAllByRole('button', { name: /all (categories|subcategories|clusters)$/ }).every(b => (b as HTMLButtonElement).disabled)).toBe(true)
  })
})

describe('the parent chips between pages', () => {
  it('stay open when another plotline is opened, in the editor and in the compare view\'s groups', () => {
    render(<Editor start={described(twoLines())} />)
    const parents = () => within(screen.getByRole('group', { name: 'Parents' }))
    fireEvent.click(parents().getByRole('button', { name: /Romance/ }))
    expect(parents().getByRole('button', { name: 'Collapse Romance' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Second thread' })[0]) // its row in the contents
    expect(screen.getByPlaceholderText('Plotline title')).toHaveValue('Second thread')
    expect(parents().getByRole('button', { name: 'Collapse Romance' })).toBeInTheDocument() // still open
    expect(parents().getByRole('button', { name: /Slow burn/ })).toHaveAttribute('aria-expanded', 'false') // the others were never opened
    tick('Meet cute'); tick('Second thread')
    fireEvent.click(screen.getByRole('switch', { name: 'Group by plotline' }))
    const group = screen.getByRole('region', { name: 'Romance › Slow burn › Second thread' })
    expect(within(group).getByRole('button', { name: 'Collapse Romance' })).toBeInTheDocument()
  })
})

describe('the parent chips, by level', () => {
  // A second category with its own subcategory, cluster and plotline.
  const other = () => described(clustered()).concat(
    plotNode('cat2', 'category', null, { title: 'Action', body: 'Fast.', order: 1 }),
    plotNode('sub2', 'subcategory', 'cat2', { title: 'Chase', body: 'On foot.' }),
    plotNode('clu2', 'cluster', 'sub2', { title: 'Rooftops', body: 'High up.' }),
    plotNode('line2', 'plotline', 'clu2', { title: 'Leap' }),
  ).map(n => (n.id === 'clu' ? { ...n, body: 'Under one roof.' } : n))
  const parents = () => within(screen.getByRole('group', { name: 'Parents' }))
  const expandedKinds = () => [...document.querySelectorAll('.wrParent--open')].map(c => c.className.match(/wrParent--(category|subcategory|cluster)/)![1])

  it('keep a level open on any other plotline, even under different parents', () => {
    render(<Editor start={other()} />)
    fireEvent.click(parents().getByRole('button', { name: /Romance/ })) // category
    fireEvent.click(parents().getByRole('button', { name: /Slow burn/ })) // subcategory
    expect(expandedKinds()).toEqual(['category', 'subcategory'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Leap' })[0])
    expect(screen.getByPlaceholderText('Plotline title')).toHaveValue('Leap')
    expect(expandedKinds()).toEqual(['category', 'subcategory']) // Action and Chase are open, Rooftops is not
    expect(parents().getByRole('button', { name: 'Collapse Action' })).toBeInTheDocument()
    expect(parents().getByRole('button', { name: 'Collapse Chase' })).toBeInTheDocument()
    expect(parents().getByRole('button', { name: /Rooftops/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('open a cluster chip with a subcategory chip too, and close a level everywhere by closing it once', () => {
    render(<Editor start={other()} />)
    fireEvent.click(parents().getByRole('button', { name: /Slow burn/ }))
    fireEvent.click(parents().getByRole('button', { name: /Household/ }))
    expect(expandedKinds()).toEqual(['subcategory', 'cluster'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Leap' })[0])
    expect(expandedKinds()).toEqual(['subcategory', 'cluster'])
    fireEvent.click(parents().getByRole('button', { name: 'Collapse Chase' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Meet cute' })[0])
    expect(expandedKinds()).toEqual(['cluster'])
  })
})

describe('fieldsets', () => {
  // The category keeps Theme loose and has a set, "Setting", holding Place.
  const withSet = (): PlotNode[] => startingPlot().map(n => (n.id === 'cat'
    ? { ...n, customFieldSets: [{ id: 'sSet', name: 'Setting' }], customFieldDefs: [{ id: 'fTheme', name: 'Theme' }, { id: 'fPlace', name: 'Place', setId: 'sSet' }] }
    : n))
  const twoSets = (): PlotNode[] => withSet().map(n => (n.id === 'cat'
    ? { ...n, customFieldSets: [...n.customFieldSets!, { id: 'sMood', name: 'Mood' }], customFieldDefs: [...n.customFieldDefs, { id: 'fTone', name: 'Tone', setId: 'sMood' }] }
    : n))
  const set = (name: string) => screen.getByRole('group', { name: `Fieldset ${name}` })
  const values = (els: HTMLElement[]) => els.map(e => (e as HTMLInputElement).value)
  // jsdom has no layout, so a group's rows are given one (each 40px tall, 46px apart from the top of the group, which sits at `top` on the page), and the
  // pointer's place is said by the row it is over: `upperHalf(0)` is the top of the first row, `lowerHalf(2)` the bottom of the third.
  const AWAY = { x: 2000, y: 2000 }
  const box = (el: Element, left: number, top: number, width: number, height: number) => {
    (el as HTMLElement).getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })
  }
  const layOut = (group: Element, top = 0) => {
    [...group.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.field).forEach((row, i) => {
      Object.defineProperty(row, 'offsetTop', { value: i * 46, configurable: true })
      Object.defineProperty(row, 'offsetHeight', { value: 40, configurable: true })
    })
    box(group, 0, top, 500, 300)
    return group
  }
  const upperHalf = (row: number, top = 0) => ({ x: 20, y: top + row * 46 + 5 })
  const lowerHalf = (row: number, top = 0) => ({ x: 20, y: top + row * 46 + 35 })
  const to = (held: ReturnType<typeof holdTile>, p: { x: number; y: number }) => held.moveTo(p.x, p.y)
  const bodyOf = (name: string, top = 0) => layOut(set(name).querySelector('.wrFieldSetBody')!, top)

  it('lists the loose fields, then each set with its fields and a count', () => {
    render(<Editor start={withSet()} focused="cat" />)
    expect(values(screen.getAllByLabelText('Field name'))).toEqual(['Theme', 'Place'])
    expect(within(set('Setting')).getByLabelText('Field name')).toHaveValue('Place')
    expect(within(set('Setting')).getByLabelText('Fieldset name')).toHaveValue('Setting')
    expect(set('Setting').querySelector('.wrFieldCount')).toHaveTextContent('1')
  })

  it('folds a set, open at first, and remembers the fold', () => {
    const { unmount } = render(<Editor start={withSet()} focused="cat" />)
    fireEvent.click(within(set('Setting')).getByRole('button', { name: 'Collapse Setting' }))
    expect(within(set('Setting')).queryByLabelText('Field name')).toBeNull()
    unmount()
    render(<Editor start={withSet()} focused="cat" />)
    expect(within(set('Setting')).queryByLabelText('Field name')).toBeNull()
    fireEvent.click(within(set('Setting')).getByRole('button', { name: 'Expand Setting' }))
    expect(within(set('Setting')).getByLabelText('Field name')).toHaveValue('Place')
  })

  it('+ Fieldset makes a set whose name takes focus; left blank and empty it is dropped, named it stays', async () => {
    render(<Editor focused="cat" />)
    fireEvent.click(screen.getByRole('button', { name: 'Fieldset' }))
    const blank = screen.getByLabelText('Fieldset name')
    await waitFor(() => expect(blank).toHaveFocus())
    expect((blank as HTMLInputElement).maxLength).toBe(30)
    fireEvent.blur(blank)
    expect(screen.queryByLabelText('Fieldset name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fieldset' }))
    fireEvent.change(screen.getByLabelText('Fieldset name'), { target: { value: 'Mood' } })
    fireEvent.blur(screen.getByLabelText('Fieldset name'))
    expect(screen.getByLabelText('Fieldset name')).toHaveValue('Mood')
  })

  it('adds a field to a set from its + Field, and the set counts it', () => {
    render(<Editor start={withSet()} focused="cat" />)
    fireEvent.click(within(set('Setting')).getByRole('button', { name: 'Add a field to Setting' }))
    expect(within(set('Setting')).getAllByLabelText('Field name')).toHaveLength(2)
    expect(set('Setting').querySelector('.wrFieldCount')).toHaveTextContent('2')
    expect(values(screen.getAllByLabelText('Field name')).slice(0, 1)).toEqual(['Theme'])
  })

  it('deleting a set says its fields stay, and keeps them as loose fields', async () => {
    render(<Editor start={withSet()} focused="cat" />)
    fireEvent.click(within(set('Setting').querySelector<HTMLElement>('.wrFieldSetHead')!).getByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/Its field stays/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Fieldset Setting' })).toBeNull())
    expect(values(screen.getAllByLabelText('Field name'))).toEqual(['Theme', 'Place'])
  })

  it('shows a category\'s set on its plotlines, read-only, inside the category\'s group', () => {
    render(<Editor start={withSet()} />)
    const group = within(screen.getByRole('region', { name: 'From category: Romance' })).getByRole('group', { name: 'Fieldset Setting' })
    expect(within(group).queryByLabelText('Fieldset name')).toBeNull()
    expect(within(group).getByText('Place')).toBeInTheDocument()
    expect(group.querySelector('.wrFieldSetHead')!.querySelector('.wrTrashBtn')).toBeNull()
    expect(within(group).queryByRole('button', { name: /Add a field/ })).toBeNull()
    expect(within(group).queryByLabelText('Drag to reorder fieldsets')).toBeNull()
  })

  it('lets a plotline make its own set, and put a field in it', () => {
    render(<Editor />)
    const own = screen.getByRole('region', { name: 'Plotline fields' })
    fireEvent.click(within(own).getByRole('button', { name: 'Fieldset' }))
    fireEvent.change(within(own).getByLabelText('Fieldset name'), { target: { value: 'Clues' } })
    fireEvent.click(within(own).getByRole('button', { name: 'Add a field to Clues' }))
    expect(within(set('Clues')).getAllByLabelText('Field name')).toHaveLength(1)
    expect(values(within(own).getAllByLabelText('Field name'))).toEqual(['Setback', ''])
  })

  it('drags a field into a set, and out again onto the spot that appears', () => {
    render(<Editor start={withSet()} focused="cat" />)
    box(set('Setting'), 0, 100, 500, 200) // the set as a whole: its head, away from its rows
    let held = holdTile(screen.getAllByLabelText('Drag to reorder fields')[0], AWAY)
    held.moveTo(250, 110)
    held.drop()
    expect(values(within(set('Setting')).getAllByLabelText('Field name'))).toEqual(['Place', 'Theme'])
    expect(document.querySelector('.wrFieldLoose')).toBeNull()

    held = holdTile(within(set('Setting')).getAllByLabelText('Drag to reorder fields')[1], AWAY)
    const out = screen.getByText('Drop here to take it out of its set')
    box(out, 0, 500, 500, 30)
    held.moveTo(250, 510)
    held.drop()
    expect(values(within(set('Setting')).getAllByLabelText('Field name'))).toEqual(['Place'])
    expect(values([...document.querySelectorAll<HTMLElement>('.wrFieldLoose [aria-label="Field name"]')])).toEqual(['Theme'])
  })

  it('opens the take-it-out spot below the sets once a field of a set is dragged', () => {
    render(<Editor start={twoSets()} focused="cat" />)
    expect(screen.queryByText('Drop here to take it out of its set')).toBeNull()
    const held = holdTile(within(set('Setting')).getAllByLabelText('Drag to reorder fields')[0], AWAY)
    const out = screen.getByText('Drop here to take it out of its set')
    expect(out.previousElementSibling).toBe(set('Mood'))
    held.cancel()
    expect(screen.queryByText('Drop here to take it out of its set')).toBeNull()
  })

  it('drops a field on another field to sit before it, in that field\'s set', () => {
    render(<Editor start={twoSets()} focused="cat" />)
    const held = holdTile(screen.getAllByLabelText('Drag to reorder fields')[0], AWAY) // Theme
    bodyOf('Mood', 300)
    to(held, upperHalf(0, 300))
    held.drop()
    expect(values(within(set('Mood')).getAllByLabelText('Field name'))).toEqual(['Theme', 'Tone'])
  })

  describe('sorting a field among its group: the rows slide out of the way', () => {
    // Setting holds Place, Era and Light, in that order; Theme is loose.
    const three = (): PlotNode[] => withSet().map(n => (n.id === 'cat'
      ? { ...n, customFieldDefs: [...n.customFieldDefs, { id: 'fEra', name: 'Era', setId: 'sSet' }, { id: 'fLight', name: 'Light', setId: 'sSet' }] }
      : n))
    const rowOf = (name: string) => within(set('Setting')).getAllByDisplayValue(name).find(el => !el.closest('.dragPicture'))!.closest('.wrFieldBlock') as HTMLElement
    const gripOf = (name: string) => within(rowOf(name)).getByLabelText('Drag to reorder fields')
    const slide = (name: string) => rowOf(name).style.transform
    const order = () => values(within(set('Setting')).getAllByLabelText('Field name').filter(el => !el.closest('.dragPicture')))

    it('slides the rows a field passes down, into the room it leaves, when it is dragged up, and the field itself leaves its place', () => {
      render(<Editor start={three()} focused="cat" />)
      const body = bodyOf('Setting')
      const held = holdTile(gripOf('Light'), AWAY)
      expect(body).not.toHaveClass('wrFieldRows--sliding') // nothing moves until the pointer is over the rows
      expect(rowOf('Light')).toHaveClass('wrFieldBlock--dragging')
      to(held, upperHalf(0))
      expect(body).toHaveClass('wrFieldRows--sliding')
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['translateY(40px)', 'translateY(40px)', ''])
      expect(rowOf('Light')).toHaveClass('wrFieldBlock--lifted')
      // a dashed gap where it will land: the first row's place
      const gap = body.querySelector<HTMLElement>('.dragGap')!
      expect([gap.style.top, gap.style.height]).toEqual(['0px', '40px'])
      // the pointer in the middle: only the row it passes
      to(held, upperHalf(1))
      expect([slide('Place'), slide('Era')]).toEqual(['', 'translateY(40px)'])
      held.cancel()
    })

    it('slides the rows it passes up when a field is dragged down, and all below it when it goes last', () => {
      render(<Editor start={three()} focused="cat" />)
      bodyOf('Setting')
      const held = holdTile(gripOf('Place'), AWAY)
      to(held, upperHalf(2))
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', 'translateY(-40px)', ''])
      to(held, lowerHalf(2))
      expect([slide('Era'), slide('Light')]).toEqual(['translateY(-40px)', 'translateY(-40px)'])
      held.cancel()
    })

    it('moves nothing while the pointer holds the field\'s own place', () => {
      render(<Editor start={three()} focused="cat" />)
      bodyOf('Setting')
      const held = holdTile(gripOf('Era'), AWAY)
      to(held, upperHalf(1))
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', '', ''])
      held.drop()
      expect(order()).toEqual(['Place', 'Era', 'Light'])
    })

    it('drops where the gap is: in front of a row, or last, which used to change nothing in the field\'s own set', () => {
      render(<Editor start={three()} focused="cat" />)
      bodyOf('Setting')
      let held = holdTile(gripOf('Light'), AWAY)
      to(held, upperHalf(0))
      held.drop()
      expect(order()).toEqual(['Light', 'Place', 'Era'])
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', '', '']) // the slides are gone once it has dropped

      bodyOf('Setting')
      held = holdTile(gripOf('Light'), AWAY)
      to(held, lowerHalf(2))
      held.drop()
      expect(order()).toEqual(['Place', 'Era', 'Light'])
    })

    it('draws a line, not a slide, over another group, and drops the field there in front of that row', () => {
      render(<Editor start={three()} focused="cat" />)
      bodyOf('Setting')
      const held = holdTile(screen.getAllByLabelText('Drag to reorder fields')[0], AWAY) // Theme, loose
      to(held, upperHalf(1))
      expect(rowOf('Era')).toHaveClass('wrFieldBlock--before')
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', '', ''])
      expect(document.querySelector('.dragGap')).toBeNull() // another group: a line, as a slide there would grow it
      to(held, lowerHalf(2))
      expect(rowOf('Era')).not.toHaveClass('wrFieldBlock--before')
      expect(rowOf('Light')).toHaveClass('wrFieldBlock--after')
      to(held, upperHalf(1))
      held.drop()
      expect(order()).toEqual(['Place', 'Theme', 'Era', 'Light'])
    })

    it('puts the slides away when the pointer leaves the group, and when the drag ends', () => {
      render(<Editor start={three()} focused="cat" />)
      const body = bodyOf('Setting')
      const held = holdTile(gripOf('Light'), AWAY)
      to(held, upperHalf(0))
      expect(slide('Place')).toBe('translateY(40px)')
      held.moveTo(AWAY.x, AWAY.y)
      expect([slide('Place'), slide('Era')]).toEqual(['', ''])
      expect(rowOf('Light')).not.toHaveClass('wrFieldBlock--lifted')
      to(held, upperHalf(0))
      held.cancel() // Escape
      expect(body).not.toHaveClass('wrFieldRows--sliding')
      expect([slide('Place'), slide('Era')]).toEqual(['', ''])
    })

    it('sorts the loose fields among themselves too', () => {
      const loose = three().map(n => (n.id === 'cat' ? { ...n, customFieldDefs: [{ id: 'fTheme', name: 'Theme' }, { id: 'fMood', name: 'Mood' }, ...n.customFieldDefs.slice(1)] } : n))
      render(<Editor start={loose} focused="cat" />)
      const group = layOut(document.querySelector('.wrFieldLoose')!)
      const looseOrder = () => values([...document.querySelectorAll<HTMLElement>('.wrFieldLoose [aria-label="Field name"]')].filter(el => !el.closest('.dragPicture')))
      const held = holdTile(screen.getAllByLabelText('Drag to reorder fields')[0], AWAY) // Theme
      to(held, lowerHalf(1))
      expect((group.querySelector('[data-field="fMood"]') as HTMLElement).style.transform).toBe('translateY(-40px)')
      held.drop()
      expect(looseOrder()).toEqual(['Mood', 'Theme'])
    })
  })

  it('drags a set above another, and to the end', () => {
    render(<Editor start={twoSets()} focused="cat" />)
    const names = () => values(screen.getAllByLabelText('Fieldset name').filter(el => !el.closest('.dragPicture')))
    box(set('Setting'), 0, 0, 500, 100)
    let held = holdTile(within(set('Mood')).getByLabelText('Drag to reorder fieldsets'), AWAY)
    held.moveTo(250, 50)
    held.drop()
    expect(names()).toEqual(['Mood', 'Setting'])

    held = holdTile(within(set('Mood')).getByLabelText('Drag to reorder fieldsets'), AWAY)
    const last = screen.getByText('Drop here to move it last')
    box(last, 0, 500, 500, 30)
    held.moveTo(250, 510)
    held.drop()
    expect(names()).toEqual(['Setting', 'Mood'])
  })

  it('Ctrl+Enter in a value adds the next field into the same set', async () => {
    const start = syncReferences(withSet().concat(plotNode('pv', 'plotpoint', 'cat', { title: 'Harbour', fieldId: 'fPlace' })), new Map(OUTLINE.map(n => [n.id, n])))
    render(<Editor start={start} focused="cat" />)
    toggle(/^Expand Place/)
    fireEvent.keyDown(screen.getByLabelText('Place value title'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(within(set('Setting')).getAllByLabelText('Field name')).toHaveLength(2))
  })
})

describe('the Plot console\'s tiles', () => {
  const rail = () => within(screen.getByRole('toolbar', { name: 'Plot tiles tabs' }))

  it('has a tab for each tile, the contents, editor and chapters on and the compare and plotpoints off', () => {
    render(<Editor />)
    expect(rail().getAllByRole('button').map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([
      ['Contents', 'true'], ['Editor', 'true'], ['Chapters', 'true'], ['Compare', 'false'], ['Plotpoints', 'false'],
    ])
    expect(screen.getAllByRole('region').map(r => r.getAttribute('aria-label')).filter(l => TILES.includes(l ?? ''))).toEqual(expect.arrayContaining(['Contents', 'Editor', 'Chapters']))
    expect(screen.queryByRole('region', { name: 'Plotpoints' })).toBeNull()
  })

  it('turns a tile on and off from its tab, and keeps the choice', () => {
    const first = render(<Editor />)
    fireEvent.click(rail().getByRole('button', { name: 'Plotpoints' }))
    expect(tile('Plotpoints').getByRole('complementary', { name: 'Plotpoints' })).toBeInTheDocument() // the tray
    fireEvent.click(rail().getByRole('button', { name: 'Chapters' }))
    expect(screen.queryByRole('region', { name: 'Chapters' })).toBeNull()
    first.unmount()
    render(<Editor />)
    expect(screen.getByRole('region', { name: 'Plotpoints' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Chapters' })).toBeNull()
  })

  it('shows the open plotline\'s chapters in their own tile, and asks for a plotline when a category is open', () => {
    const line = render(<Editor />)
    expect(tile('Chapters').getByText('Outline')).toBeInTheDocument()
    expect(tile('Editor').queryByText('Outline')).toBeNull() // no longer under the fields
    line.unmount()
    render(<Editor focused="cat" />)
    expect(tile('Chapters').getByText(/Open a plotline/)).toBeInTheDocument()
  })

  it('brings the editor back when a row is chosen in the contents', () => {
    render(<Editor focused="cat" />)
    fireEvent.click(rail().getByRole('button', { name: 'Editor' }))
    expect(screen.queryByRole('region', { name: 'Editor' })).toBeNull()
    fireEvent.click(tile('Contents').getByRole('button', { name: 'Meet cute' }))
    expect(screen.getByDisplayValue('Meet cute')).toBeInTheDocument()
  })
})

// A node's links, kept on both ends (plotLinks.ts), and what the editors show of them.
describe('linked plot nodes', () => {
  const linked = () => within(screen.getByRole('list', { name: /^Linked to / }))
  const withLink = (a: string, b: string) => (nodes: PlotNode[]) =>
    nodes.map(n => (n.id === a ? { ...n, links: [b] } : n.id === b ? { ...n, links: [a] } : n))

  it('has a Linked section in a plotline details, empty to begin with, whose picker leaves out its own parents', () => {
    render(<Editor start={clustered()} />)
    expect(screen.getByText('Linked')).toBeInTheDocument()
    expect(screen.getByText('Nothing linked yet.')).toBeInTheDocument()
    const picker = screen.getByRole('combobox', { name: 'Add link' })
    expect(picker).toBeDisabled()
    expect(picker.querySelectorAll('optgroup')).toHaveLength(0)
  })

  it('links the plotline to a cluster of another category and lists it, in that node colour, with its keywords and description', () => {
    const start = startingPlot().concat(
      plotNode('cat2', 'category', null, { title: 'Heist', hue: 20 }),
      plotNode('crew', 'cluster', 'cat2', { title: 'Crew', hue: 40, body: 'The team.', keywords: ['a', 'b', 'c', 'd', 'e'] }),
    )
    render(<Editor start={start} />)
    const picker = screen.getByRole('combobox', { name: 'Add link' })
    expect([...picker.querySelectorAll('optgroup')].map(g => g.getAttribute('label'))).toEqual(['Categories', 'Clusters'])
    fireEvent.change(picker, { target: { value: 'crew' } })
    const chip = within(screen.getByRole('list', { name: 'Linked to Meet cute' })).getByRole('button', { name: 'Open Crew' }).closest('.wrChildRow') as HTMLElement
    expect(chip).toHaveClass('wrChildRow--cluster')
    expect(chip.style.getPropertyValue('--wr-cluster-fill')).not.toBe('')
    expect(within(chip).getByText('cluster')).toBeInTheDocument()
    expect(within(chip).getByText('Heist')).toBeInTheDocument()
    expect(within(chip).getByText('The team.')).toBeInTheDocument()
    expect(within(within(chip).getByRole('list', { name: 'Keywords of Crew' })).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('Nothing linked yet.')).toBeNull()
  })

  it('shows the link from the other end, and a click on it opens that node', () => {
    render(<Editor start={withLink('line', 'sub')(startingPlot())} focused="sub" />)
    fireEvent.click(linked().getByRole('button', { name: 'Open Meet cute' }))
    expect(screen.getByPlaceholderText('Plotline title')).toHaveValue('Meet cute')
    expect(linked().getByRole('button', { name: 'Open Slow burn' })).toBeInTheDocument()
  })

  it('asks before removing a link, and removes it from both ends', () => {
    const start = withLink('line', 'cold')(startingPlot().concat(plotNode('cold', 'plotline', 'cat', { title: 'Cold open' })))
    render(<Editor start={start} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove the link to Cold open' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove the link to Cold open?' })).getByRole('button', { name: 'Cancel' }))
    expect(linked().getByRole('button', { name: 'Open Cold open' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove the link to Cold open' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove the link to Cold open?' })).getByRole('button', { name: 'Confirm' }))
    expect(screen.queryByRole('list', { name: /^Linked to / })).toBeNull()
    expect(screen.getByText('Nothing linked yet.')).toBeInTheDocument()
  })

  it('has the section in a category, a subcategory and a cluster editor too', () => {
    for (const id of ['cat', 'sub', 'clu']) {
      const { unmount } = render(<Editor start={clustered()} focused={id} />)
      expect(screen.getByText('Linked')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Add link' })).toBeInTheDocument()
      unmount()
    }
  })
})

// The child rows of an editor: every keyword, the whole description, and the colour of the node itself.
describe('the child rows of an editor', () => {
  const rich = (nodes: PlotNode[]) => nodes.map(n => (n.id === 'sub'
    ? { ...n, body: 'It takes a whole winter.', keywords: ['k1', 'k2', 'k3', 'k4', 'k5'], hue: 250 }
    : n.id === 'line' ? { ...n, body: 'They meet.', keywords: ['m1', 'm2', 'm3', 'm4'] } : n))
  const row = (name: string) => screen.getByRole('button', { name: `Open ${name}` }).closest('.wrChildRow') as HTMLElement

  it('show all the keywords and the description of a subcategory under a category', () => {
    render(<Editor start={rich(startingPlot())} focused="cat" />)
    const sub = row('Slow burn')
    expect(within(within(sub).getByRole('list', { name: 'Keywords of Slow burn' })).getAllByRole('listitem').map(i => i.textContent)).toEqual(['k1', 'k2', 'k3', 'k4', 'k5'])
    expect(within(sub).getByText('It takes a whole winter.')).toBeInTheDocument()
    expect(within(sub).getByText('1 plotline')).toBeInTheDocument()
  })

  it('wear the colour of the node, not of the parent: a subcategory own fill, set on the row', () => {
    render(<Editor start={rich(startingPlot())} focused="cat" />)
    const sub = row('Slow burn')
    const parentCard = document.querySelector('.wrCardPanel--category') as HTMLElement
    expect(sub).toHaveClass('wrChildRow--subcategory')
    expect(sub.style.getPropertyValue('--wr-sub-fill')).not.toBe('')
    expect(parentCard.style.getPropertyValue('--wr-sub-fill')).toBe('') // a category has no subcategory colour of its own to hand down
  })

  it('list a plotline keywords and description under a subcategory, and open it from its title', () => {
    render(<Editor start={rich(startingPlot())} focused="sub" />)
    const line = row('Meet cute')
    expect(line).toHaveClass('wrChildRow--plotline')
    expect(within(line).getAllByRole('listitem').map(i => i.textContent)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(within(line).getByText('They meet.')).toBeInTheDocument()
    fireEvent.click(within(line).getByRole('button', { name: 'Open Meet cute' }))
    expect(screen.getByPlaceholderText('Plotline title')).toHaveValue('Meet cute')
  })
})
