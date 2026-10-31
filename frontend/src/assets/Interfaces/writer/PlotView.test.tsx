import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import type { OutlineNode, PlotNode } from '../../../api/types'
import { DraftPlotNotes } from './DraftPlotNotes'
import { PlotpointTile } from './PlotpointTile'
import PlotView from './PlotView'
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
    expect(screen.getAllByRole('region').map(g => g.getAttribute('aria-label'))).toEqual(['Plotline fields', 'From cluster: Household', 'From category: Romance'])
  })

  it('shows the cluster\'s own fields in its editor, with a colour slider within 30 degrees of its subcategory', () => {
    render(<Editor start={clustered()} focused="clu" />)
    expect(screen.getByText('within 30° of its subcategory')).toBeInTheDocument()
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

// The parents above an editor's title: read-only chips, top-down, each with its description.
const described = (nodes: PlotNode[]) => nodes.map(n => (n.id === 'cat' ? { ...n, body: 'Two people, slowly.' } : n.id === 'sub' ? { ...n, body: 'It takes a whole winter.' } : n))

describe('the parent chips', () => {
  const chips = () => within(screen.getByRole('group', { name: 'Parents' }))

  it('sit above the plotline\'s title, top-down, each with its title', () => {
    render(<Editor start={described(clustered())} />)
    const group = screen.getByRole('group', { name: 'Parents' })
    const title = screen.getByPlaceholderText('Plotline title')
    expect(group.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect([...group.querySelectorAll('.wrParent')].map(c => c.className.match(/wrParent--(\w+)/)![1])).toEqual(['category', 'subcategory', 'cluster'])
    expect(chips().getByRole('button', { name: /Romance/ })).not.toHaveTextContent('Two people, slowly.') // a closed chip is only its title
    expect(chips().getByRole('button', { name: /Romance/ })).toHaveAttribute('title', 'Two people, slowly.') // the whole of it on hover
    expect(screen.queryByText('plotline', { selector: '.wrKindBadge' })).not.toBeNull() // the editor itself is unchanged
  })

  it('show only the title for a parent with no description, and the title opens that parent', () => {
    render(<Editor start={described(clustered())} />)
    expect(chips().getByRole('button', { name: 'Open Household' })).not.toHaveAttribute('aria-expanded') // nothing to open
    fireEvent.click(chips().getByRole('button', { name: 'Open Household' }))
    expect(screen.getByPlaceholderText('Cluster title')).toHaveValue('Household')
  })

  it('open on a click to the whole description, and the title then opens the parent\'s editor', () => {
    render(<Editor start={described(clustered())} />)
    const chip = chips().getByRole('button', { name: /Slow burn/ })
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chip)
    expect(chips().getByText('It takes a whole winter.')).toBeInTheDocument()
    fireEvent.click(chips().getByRole('button', { name: 'Collapse Slow burn' }))
    expect(chips().getByRole('button', { name: /Slow burn/ })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chips().getByRole('button', { name: /Slow burn/ }))
    fireEvent.click(chips().getByRole('button', { name: 'Open Slow burn' }))
    expect(screen.getByPlaceholderText('Subcategory title')).toHaveValue('Slow burn')
  })

  it('are read-only: no input in them, and a description cannot be typed over', () => {
    render(<Editor start={described(clustered())} />)
    expect(document.querySelector('.wrParents input, .wrParents textarea')).toBeNull()
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

  it('head each plotline in the compare view\'s groups, and a title there leaves the comparison for that parent', () => {
    render(<Editor start={described(twoLines())} />)
    tick('Meet cute'); tick('Second thread')
    fireEvent.click(screen.getByRole('switch', { name: 'Group by plotline' }))
    const group = screen.getByRole('region', { name: 'Romance › Slow burn › Second thread' })
    const parents = within(within(group).getByRole('group', { name: 'Parents' }))
    expect(parents.getByRole('button', { name: /Romance/ })).toBeInTheDocument()
    fireEvent.click(parents.getByRole('button', { name: /Slow burn/ }))
    fireEvent.click(parents.getByRole('button', { name: 'Open Slow burn' }))
    expect(document.querySelector('.wrCompare')).toBeNull()
    expect(screen.getByPlaceholderText('Subcategory title')).toHaveValue('Slow burn')
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

  it('sit at the top right as three, for categories, subcategories and clusters, with the full descriptions circle after them, and "Category" is at the bottom', () => {
    const { container } = render(<Editor start={clustered()} />)
    const head = container.querySelector('.wrPlotNavHead') as HTMLElement
    expect(head.lastElementChild).toHaveClass('wrNavTools')
    expect(head.lastElementChild!.firstElementChild).toHaveClass('wrNavDots')
    expect(within(head).queryByRole('button', { name: /^\s*Category$/ })).toBeNull()
    expect([...container.querySelectorAll('.wrNavDots .wrNavDot')].map(d => d.getAttribute('aria-label'))).toEqual(['Collapse all categories', 'Collapse all subcategories', 'Collapse all clusters'])
    expect(head.lastElementChild!.lastElementChild).toHaveClass('wrNavDot--desc')
    expect(container.querySelector('.wrPlotNav')!.lastElementChild).toHaveTextContent('Category')
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
  const dragData = () => {
    const data = new Map<string, string>()
    return { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '', setDragImage: () => {} }
  }
  // jsdom has no layout, so a group's rows are given one (each 40px tall, 46px apart from the top of the group), and the pointer's place is said
  // by the row it is over: `upperHalf(0)` is the top of the first row, `lowerHalf(2)` the bottom of the third.
  const layOut = (group: Element) => {
    [...group.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.field).forEach((row, i) => {
      Object.defineProperty(row, 'offsetTop', { value: i * 46, configurable: true })
      Object.defineProperty(row, 'offsetHeight', { value: 40, configurable: true })
    })
    return group
  }
  // jsdom has no DragEvent, so the pointer's height is put on the event by hand.
  const dragAt = (type: 'dragOver' | 'dragEnter' | 'drop', el: Element, pointer: { clientY: number }, dataTransfer: object) => {
    const event = createEvent[type](el, { dataTransfer })
    Object.defineProperty(event, 'clientY', { value: pointer.clientY })
    return fireEvent(el, event)
  }
  const upperHalf = (row: number) => ({ clientY: row * 46 + 5 })
  const lowerHalf = (row: number) => ({ clientY: row * 46 + 35 })
  const bodyOf = (name: string) => layOut(set(name).querySelector('.wrFieldSetBody')!)

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
    const dataTransfer = dragData()
    fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder fields')[0], { dataTransfer })
    fireEvent.dragOver(set('Setting'), { dataTransfer })
    fireEvent.drop(set('Setting'), { dataTransfer })
    expect(values(within(set('Setting')).getAllByLabelText('Field name'))).toEqual(['Place', 'Theme'])
    expect(document.querySelector('.wrFieldLoose')).toBeNull()

    fireEvent.dragStart(within(set('Setting')).getAllByLabelText('Drag to reorder fields')[1], { dataTransfer })
    const out = screen.getByText('Drop here to take it out of its set')
    fireEvent.dragOver(out, { dataTransfer })
    fireEvent.drop(out, { dataTransfer })
    expect(values(within(set('Setting')).getAllByLabelText('Field name'))).toEqual(['Place'])
    expect(values([...document.querySelectorAll<HTMLElement>('.wrFieldLoose [aria-label="Field name"]')])).toEqual(['Theme'])
  })

  it('opens the take-it-out spot below the sets, so no row moves when a drag of a field in a set starts', () => {
    // The browser cancels a drag whose source moves in the dragstart event, so what a drag opens must not push the rows down. Without layout
    // in the test, that is the order of things: the spot comes after the last set and in front of nothing the drag was started from.
    render(<Editor start={twoSets()} focused="cat" />)
    const rows = () => [...document.querySelectorAll('.wrFieldLoose, .wrFieldSet')]
    const before = rows()
    fireEvent.dragStart(within(set('Setting')).getAllByLabelText('Drag to reorder fields')[0], { dataTransfer: dragData() })
    const out = screen.getByText('Drop here to take it out of its set')
    expect(rows()).toEqual(before)
    expect(out.previousElementSibling).toBe(set('Mood'))
    for (const row of before) expect(row.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('accepts a dragged field as soon as it enters a field, a set or a spot (a drag let go on arrival still drops)', () => {
    render(<Editor start={twoSets()} focused="cat" />)
    const dataTransfer = dragData()
    fireEvent.dragStart(within(set('Setting')).getAllByLabelText('Drag to reorder fields')[0], { dataTransfer }) // Place
    bodyOf('Mood')
    const tone = within(set('Mood')).getByLabelText('Field name').closest('.wrFieldBlock') as HTMLElement
    // fireEvent returns false when the handler cancelled the event, which is what tells the browser the target takes the drop
    expect(dragAt('dragEnter', tone, upperHalf(0), dataTransfer)).toBe(false)
    expect(fireEvent.dragEnter(set('Mood'), { dataTransfer })).toBe(false)
    expect(fireEvent.dragEnter(screen.getByText('Drop here to take it out of its set'), { dataTransfer })).toBe(false)
    dragAt('drop', tone, upperHalf(0), dataTransfer)
    expect(values(within(set('Mood')).getAllByLabelText('Field name'))).toEqual(['Place', 'Tone'])
  })

  it('drops a field on another field to sit before it, in that field\'s set', () => {
    render(<Editor start={twoSets()} focused="cat" />)
    const dataTransfer = dragData()
    fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder fields')[0], { dataTransfer }) // Theme
    bodyOf('Mood')
    const tone = within(set('Mood')).getByLabelText('Field name').closest('.wrFieldBlock') as HTMLElement
    dragAt('dragOver', tone, upperHalf(0), dataTransfer)
    dragAt('drop', tone, upperHalf(0), dataTransfer)
    expect(values(within(set('Mood')).getAllByLabelText('Field name'))).toEqual(['Theme', 'Tone'])
  })

  describe('sorting a field among its group: the rows slide out of the way', () => {
    // Setting holds Place, Era and Light, in that order; Theme is loose.
    const three = (): PlotNode[] => withSet().map(n => (n.id === 'cat'
      ? { ...n, customFieldDefs: [...n.customFieldDefs, { id: 'fEra', name: 'Era', setId: 'sSet' }, { id: 'fLight', name: 'Light', setId: 'sSet' }] }
      : n))
    const rowOf = (name: string) => within(set('Setting')).getByDisplayValue(name).closest('.wrFieldBlock') as HTMLElement
    const gripOf = (name: string) => within(rowOf(name)).getByLabelText('Drag to reorder fields')
    const slide = (name: string) => rowOf(name).style.transform
    const order = () => values(within(set('Setting')).getAllByLabelText('Field name'))

    it('slides the rows a field passes down, into the room it leaves, when it is dragged up, and the field itself leaves its place', () => {
      render(<Editor start={three()} focused="cat" />)
      const dataTransfer = dragData()
      fireEvent.dragStart(gripOf('Light'), { dataTransfer })
      const body = bodyOf('Setting')
      expect(body).not.toHaveClass('wrFieldRows--sliding') // nothing moves just because a drag has started
      expect(rowOf('Light')).toHaveClass('wrFieldBlock--dragging')
      dragAt('dragOver', rowOf('Place'), upperHalf(0), dataTransfer)
      expect(body).toHaveClass('wrFieldRows--sliding')
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['translateY(40px)', 'translateY(40px)', ''])
      expect(rowOf('Light')).toHaveClass('wrFieldBlock--lifted')
      // the pointer in the middle: only the row it passes
      dragAt('dragOver', rowOf('Era'), upperHalf(1), dataTransfer)
      expect([slide('Place'), slide('Era')]).toEqual(['', 'translateY(40px)'])
    })

    it('slides the rows it passes up when a field is dragged down, and all below it when it goes last', () => {
      render(<Editor start={three()} focused="cat" />)
      const dataTransfer = dragData()
      fireEvent.dragStart(gripOf('Place'), { dataTransfer })
      bodyOf('Setting')
      dragAt('dragOver', rowOf('Light'), upperHalf(2), dataTransfer)
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', 'translateY(-40px)', ''])
      dragAt('dragOver', rowOf('Light'), lowerHalf(2), dataTransfer)
      expect([slide('Era'), slide('Light')]).toEqual(['translateY(-40px)', 'translateY(-40px)'])
    })

    it('moves nothing while the pointer holds the field\'s own place', () => {
      render(<Editor start={three()} focused="cat" />)
      const dataTransfer = dragData()
      fireEvent.dragStart(gripOf('Era'), { dataTransfer })
      bodyOf('Setting')
      dragAt('dragOver', rowOf('Era'), upperHalf(1), dataTransfer)
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', '', ''])
      dragAt('drop', rowOf('Era'), upperHalf(1), dataTransfer)
      expect(order()).toEqual(['Place', 'Era', 'Light'])
    })

    it('drops where the gap is: in front of a row, or last, which used to change nothing in the field\'s own set', () => {
      render(<Editor start={three()} focused="cat" />)
      const dataTransfer = dragData()
      fireEvent.dragStart(gripOf('Light'), { dataTransfer })
      bodyOf('Setting')
      dragAt('dragOver', rowOf('Place'), upperHalf(0), dataTransfer)
      dragAt('drop', rowOf('Place'), upperHalf(0), dataTransfer)
      expect(order()).toEqual(['Light', 'Place', 'Era'])
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', '', '']) // the slides are gone once it has dropped

      fireEvent.dragStart(gripOf('Light'), { dataTransfer })
      bodyOf('Setting')
      dragAt('dragOver', rowOf('Era'), lowerHalf(2), dataTransfer)
      dragAt('drop', rowOf('Era'), lowerHalf(2), dataTransfer)
      expect(order()).toEqual(['Place', 'Era', 'Light'])
    })

    it('draws a line, not a slide, over another group, and drops the field there in front of that row', () => {
      render(<Editor start={three()} focused="cat" />)
      const dataTransfer = dragData()
      fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder fields')[0], { dataTransfer }) // Theme, loose
      bodyOf('Setting')
      dragAt('dragOver', rowOf('Era'), upperHalf(1), dataTransfer)
      expect(rowOf('Era')).toHaveClass('wrFieldBlock--before')
      expect([slide('Place'), slide('Era'), slide('Light')]).toEqual(['', '', ''])
      dragAt('dragOver', rowOf('Light'), lowerHalf(2), dataTransfer)
      expect(rowOf('Era')).not.toHaveClass('wrFieldBlock--before')
      expect(rowOf('Light')).toHaveClass('wrFieldBlock--after')
      dragAt('dragOver', rowOf('Era'), upperHalf(1), dataTransfer)
      dragAt('drop', rowOf('Era'), upperHalf(1), dataTransfer)
      expect(order()).toEqual(['Place', 'Theme', 'Era', 'Light'])
    })

    it('puts the slides away when the pointer leaves the group, and when the drag ends', () => {
      render(<Editor start={three()} focused="cat" />)
      const dataTransfer = dragData()
      fireEvent.dragStart(gripOf('Light'), { dataTransfer })
      const body = bodyOf('Setting')
      dragAt('dragOver', rowOf('Place'), upperHalf(0), dataTransfer)
      expect(slide('Place')).toBe('translateY(40px)')
      fireEvent.dragLeave(body, { dataTransfer, relatedTarget: document.body })
      expect([slide('Place'), slide('Era')]).toEqual(['', ''])
      expect(rowOf('Light')).not.toHaveClass('wrFieldBlock--lifted')
      dragAt('dragOver', rowOf('Place'), upperHalf(0), dataTransfer)
      fireEvent.dragEnd(gripOf('Light'), { dataTransfer })
      expect(body).not.toHaveClass('wrFieldRows--sliding')
      expect([slide('Place'), slide('Era')]).toEqual(['', ''])
    })

    it('sorts the loose fields among themselves too', () => {
      const loose = three().map(n => (n.id === 'cat' ? { ...n, customFieldDefs: [{ id: 'fTheme', name: 'Theme' }, { id: 'fMood', name: 'Mood' }, ...n.customFieldDefs.slice(1)] } : n))
      render(<Editor start={loose} focused="cat" />)
      const dataTransfer = dragData()
      const group = layOut(document.querySelector('.wrFieldLoose')!)
      const looseOrder = () => values([...document.querySelectorAll<HTMLElement>('.wrFieldLoose [aria-label="Field name"]')])
      fireEvent.dragStart(screen.getAllByLabelText('Drag to reorder fields')[0], { dataTransfer }) // Theme
      const mood = group.querySelector('[data-field="fMood"]') as HTMLElement
      dragAt('dragOver', mood, lowerHalf(1), dataTransfer)
      expect((group.querySelector('[data-field="fMood"]') as HTMLElement).style.transform).toBe('translateY(-40px)')
      dragAt('drop', mood, lowerHalf(1), dataTransfer)
      expect(looseOrder()).toEqual(['Mood', 'Theme'])
    })
  })

  it('drags a set above another, and to the end', () => {
    render(<Editor start={twoSets()} focused="cat" />)
    const names = () => values(screen.getAllByLabelText('Fieldset name'))
    const dataTransfer = dragData()
    fireEvent.dragStart(within(set('Mood')).getByLabelText('Drag to reorder fieldsets'), { dataTransfer })
    fireEvent.dragOver(set('Setting'), { dataTransfer })
    fireEvent.drop(set('Setting'), { dataTransfer })
    expect(names()).toEqual(['Mood', 'Setting'])

    fireEvent.dragStart(within(set('Mood')).getByLabelText('Drag to reorder fieldsets'), { dataTransfer })
    const last = screen.getByText('Drop here to move it last')
    fireEvent.dragOver(last, { dataTransfer })
    fireEvent.drop(last, { dataTransfer })
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
