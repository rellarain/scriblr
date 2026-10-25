import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { mockFetchBy } from '../../../test/mockFetch'
import { PlotNav } from './PlotNav'
import { plotNode, startingPlot, useFakeWorkspace } from './plotTestWorkspace'

// The Plot sidebar's contents: its "+ Category" and "+ Preset" buttons, and the description a row shows under its name.

const PUBLISHED = {
  presets: [{
    id: 'p1', version: 2, publishedAt: '2026-10-12T09:00:00Z',
    content: {
      name: 'Characters', description: 'The cast of the story.', keywords: ['cast'], fields: ['Name', 'Role'],
      subcategories: [{ id: 's', name: 'Heroes', description: 'Those we follow.', keywords: [], fields: ['Want'], clusters: [{ id: 'k', name: 'Core', description: '', keywords: [], fields: [] }] }],
    },
  }],
}

function Nav({ start = startingPlot(), onNodes, onOpen }: { start?: PlotNode[]; onNodes?: (n: PlotNode[]) => void; onOpen?: () => void }) {
  const { w, plotNodes } = useFakeWorkspace(start, 'line')
  onNodes?.(plotNodes)
  return <><PlotNav w={w} onOpenNode={onOpen} /><output aria-label="focused">{w.focusedPlotNodeId}</output></>
}

describe('+ Category and + Preset', () => {
  it('sit side by side at the bottom, Category first', () => {
    const { container } = render(<Nav />)
    const row = container.querySelector('.wrPlotNavAddRow') as HTMLElement
    expect(container.querySelector('.wrPlotNav')!.lastElementChild).toBe(row)
    expect([...row.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['Category', 'Preset'])
  })

  it('+ Category still adds an empty category and opens it', async () => {
    let nodes: PlotNode[] = []
    let opened = 0
    render(<Nav onNodes={n => { nodes = n }} onOpen={() => { opened += 1 }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Category' }))
    const added = nodes.filter(n => n.kind === 'category' && n.id !== 'cat')
    expect(added).toHaveLength(1)
    expect(added[0].title).toBe('')
    expect(opened).toBe(1)
    expect(screen.getByLabelText('focused')).toHaveTextContent(added[0].id)
  })

  it('+ Preset adds the chosen preset as a category with its subcategories and clusters, and opens it', async () => {
    mockFetchBy(() => PUBLISHED)
    let nodes: PlotNode[] = []
    let opened = 0
    render(<Nav onNodes={n => { nodes = n }} onOpen={() => { opened += 1 }} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Preset' }))
    await user.click(await screen.findByRole('menuitem', { name: /Characters/ }))
    const before = new Set(startingPlot().map(n => n.id))
    const added = nodes.filter(n => !before.has(n.id))
    expect(added.map(n => [n.kind, n.title])).toEqual([['category', 'Characters'], ['subcategory', 'Heroes'], ['cluster', 'Core']])
    expect(added[0]).toMatchObject({ body: 'The cast of the story.', keywords: ['cast'] })
    expect(added[0].customFieldDefs.map(f => f.name)).toEqual(['Name', 'Role'])
    expect(screen.getByLabelText('focused')).toHaveTextContent(added[0].id)
    expect(opened).toBe(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a preset can be added more than once, each time as a new category of its own', async () => {
    mockFetchBy(() => PUBLISHED)
    let nodes: PlotNode[] = []
    render(<Nav onNodes={n => { nodes = n }} />)
    const user = userEvent.setup()
    for (let i = 0; i < 2; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Preset' }))
      await user.click(await screen.findByRole('menuitem', { name: /Characters/ }))
    }
    expect(nodes.filter(n => n.title === 'Characters')).toHaveLength(2)
    expect(new Set(nodes.map(n => n.id)).size).toBe(nodes.length)
  })
})

describe('a row\'s description', () => {
  const start = () => [
    plotNode('cat', 'category', null, { title: 'Characters', body: 'The cast of the story.' }),
    plotNode('sub', 'subcategory', 'cat', { title: 'Heroes', body: 'Those we follow.' }),
    plotNode('clu', 'cluster', 'sub', { title: 'Core' }),
    plotNode('line', 'plotline', 'clu', { title: 'Ada', body: 'a plotline has no description row' }),
  ] as PlotNode[]

  it('shows under the name of a category, subcategory or cluster that has one, and in the row\'s own ink', () => {
    const { container } = render(<Nav start={start()} />)
    const rows = [...container.querySelectorAll('.wrNavRow')]
    const cat = rows.find(r => r.classList.contains('wrNavRow--category'))!
    expect(within(cat as HTMLElement).getByText('The cast of the story.')).toHaveClass('wrNavDesc')
    expect(within(cat as HTMLElement).getByText('The cast of the story.')).toHaveAttribute('title', 'The cast of the story.')
    expect(within(cat as HTMLElement).getByRole('button', { name: 'Characters' })).toBeInTheDocument()
    expect(within(rows.find(r => r.classList.contains('wrNavRow--subcategory')) as HTMLElement).getByText('Those we follow.')).toBeInTheDocument()
    expect(rows.find(r => r.classList.contains('wrNavRow--cluster'))!.querySelector('.wrNavDesc')).toBeNull()
  })

  it('is never shown for a plotline, and a row without one keeps its plain markup', () => {
    const { container } = render(<Nav start={start()} />)
    const line = container.querySelector('.wrNavRow--plotline') as HTMLElement
    expect(line.querySelector('.wrNavDesc')).toBeNull()
    expect(line.querySelector('.wrNavText')).toBeNull()
    expect(container.querySelector('.wrNavRow--cluster .wrNavLabel')!.parentElement).toHaveClass('wrNavRow')
  })

  it('still opens the node when the name is pressed', async () => {
    let opened = 0
    render(<Nav start={start()} onOpen={() => { opened += 1 }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Heroes' }))
    expect(screen.getByLabelText('focused')).toHaveTextContent('sub')
    expect(opened).toBe(1)
  })

  it('is not shown once the description is blank', async () => {
    const { container } = render(<Nav start={start().map(n => (n.id === 'cat' ? { ...n, body: '   ' } : n))} />)
    expect(container.querySelector('.wrNavRow--category .wrNavDesc')).toBeNull()
    await waitFor(() => expect(fireEvent.click(screen.getByRole('button', { name: 'Characters' }))).toBe(true))
  })
})
