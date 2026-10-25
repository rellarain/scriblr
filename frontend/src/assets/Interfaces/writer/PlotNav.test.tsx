import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { mockFetchBy } from '../../../test/mockFetch'
import { PlotNav } from './PlotNav'
import { plotNode, startingPlot, useFakeWorkspace } from './plotTestWorkspace'

// The Plot sidebar's contents: its "+ Category" and "+ Preset" buttons, and the toggle that shows each row's full description under its name.

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

describe('the full descriptions toggle', () => {
  const start = () => [
    plotNode('cat', 'category', null, { title: 'Characters', body: 'The cast of the story.' }),
    plotNode('sub', 'subcategory', 'cat', { title: 'Heroes', body: 'Those we follow.\nThey want things.' }),
    plotNode('clu', 'cluster', 'sub', { title: 'Core' }),
    plotNode('line', 'plotline', 'clu', { title: 'Ada', body: 'a plotline has no description row' }),
  ] as PlotNode[]
  const toggle = () => screen.getByRole('button', { name: /full descriptions$/ })
  const row = (container: HTMLElement, kind: string) => container.querySelector(`.wrNavRow--${kind}`) as HTMLElement

  it('is the fourth circle at the top right, after the three that fold a level, and not part of their group', () => {
    const { container } = render(<Nav start={start()} />)
    const tools = container.querySelector('.wrPlotNavHead')!.lastElementChild as HTMLElement
    expect(tools).toHaveClass('wrNavTools')
    expect([...tools.children].map(c => c.className)).toEqual(['wrNavDots', 'wrNavDot wrNavDot--desc'])
    expect(within(screen.getByRole('group', { name: 'Fold a whole level' })).queryByRole('button', { name: /descriptions/ })).toBeNull()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    expect(toggle()).toHaveAttribute('aria-label', 'Show full descriptions')
  })

  it('shows no description until it is pressed, then the whole of each, and hides them again', async () => {
    const { container } = render(<Nav start={start()} />)
    expect(container.querySelector('.wrNavDesc')).toBeNull()
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(toggle()).toHaveAttribute('aria-label', 'Hide full descriptions')
    expect(toggle()).toHaveClass('wrNavDot--desc', 'wrNavDot--on')
    expect(within(row(container, 'category')).getByText('The cast of the story.')).toHaveClass('wrNavDesc')
    expect(row(container, 'subcategory').querySelector('.wrNavDesc')!.textContent).toBe('Those we follow.\nThey want things.')
    await userEvent.click(toggle())
    expect(container.querySelector('.wrNavDesc')).toBeNull()
    expect(toggle()).not.toHaveClass('wrNavDot--on')
  })

  it('shows the whole of a long description, not the start of it', async () => {
    const long = 'A long description. '.repeat(12).trim()
    const { container } = render(<Nav start={start().map(n => (n.id === 'cat' ? { ...n, body: long } : n))} />)
    await userEvent.click(toggle())
    expect(row(container, 'category').querySelector('.wrNavDesc')!.textContent).toBe(long)
  })

  it('never shows one for a plotline or for a row without one, and the name still opens the node', async () => {
    let opened = 0
    const { container } = render(<Nav start={start()} onOpen={() => { opened += 1 }} />)
    await userEvent.click(toggle())
    expect(row(container, 'plotline').querySelector('.wrNavDesc')).toBeNull()
    expect(row(container, 'plotline').querySelector('.wrNavText')).toBeNull()
    expect(row(container, 'cluster').querySelector('.wrNavDesc')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Heroes' }))
    expect(screen.getByLabelText('focused')).toHaveTextContent('sub')
    expect(opened).toBe(1)
  })

  it('is dimmed and cannot be pressed while no category, subcategory or cluster has a description', () => {
    const blank = start().map(n => (n.kind === 'plotline' ? n : { ...n, body: n.id === 'cat' ? '   ' : '' }))
    render(<Nav start={blank} />)
    expect(toggle()).toBeDisabled()
  })

  it('is kept when the contents are opened again', async () => {
    const first = render(<Nav start={start()} />)
    await userEvent.click(toggle())
    first.unmount()
    const { container } = render(<Nav start={start()} />)
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(within(row(container, 'category')).getByText('The cast of the story.')).toBeInTheDocument()
  })
})
