import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { getKv } from '../../../settings/settingsStore'
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
  it('sit side by side in the head, in place of a title, Category first and before the circles', () => {
    const { container } = render(<Nav />)
    const head = container.querySelector('.wrPlotNavHead') as HTMLElement
    const row = head.querySelector('.wrPlotNavAddRow') as HTMLElement
    expect(head.firstElementChild).toBe(row)
    expect(head.lastElementChild).toHaveClass('wrNavTools')
    expect([...row.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['Category', 'Preset'])
    expect(screen.queryByText('Categories')).toBeNull() // no title
    expect(container.querySelectorAll('.wrPlotNavAddRow')).toHaveLength(1) // and no row at the foot
    expect(container.querySelector('.wrPlotNav')!.lastElementChild).toHaveClass('wrPlotNavRows')
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
    plotNode('line', 'plotline', 'clu', { title: 'Ada', body: 'She leaves home.\nShe never writes.' }),
  ] as PlotNode[]
  const toggle = () => screen.getByRole('button', { name: /full descriptions$/ })
  const row = (container: HTMLElement, kind: string) => container.querySelector(`.wrNavRow--${kind}`) as HTMLElement

  it('is the fourth circle at the top right, after the three that fold a level, and not part of their group', () => {
    const { container } = render(<Nav start={start()} />)
    const tools = container.querySelector('.wrPlotNavHead')!.lastElementChild as HTMLElement
    expect(tools).toHaveClass('wrNavTools')
    expect([...tools.children].map(c => c.className)).toEqual(['wrNavDots', 'wrNavDot wrNavDot--desc', 'wrNavDot wrNavDot--keys']) // the fifth is the keywords
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

  it('shows a plotline\'s whole description under its name too, line breaks kept', async () => {
    const { container } = render(<Nav start={start()} />)
    expect(row(container, 'plotline').querySelector('.wrNavDesc')).toBeNull()
    await userEvent.click(toggle())
    expect(row(container, 'plotline')).toHaveClass('wrNavRow--desc')
    expect(within(row(container, 'plotline')).getByRole('button', { name: 'Ada' })).toBeInTheDocument()
    expect(row(container, 'plotline').querySelector('.wrNavDesc')!.textContent).toBe('She leaves home.\nShe never writes.')
    await userEvent.click(toggle())
    expect(row(container, 'plotline').querySelector('.wrNavDesc')).toBeNull()
    expect(row(container, 'plotline').querySelector('.wrNavText')).toBeNull()
  })

  it('shows nothing for a row without one (or with only blanks), and the name still opens the node', async () => {
    let opened = 0
    const noLineBody = start().map(n => (n.kind === 'plotline' ? { ...n, body: '  \n ' } : n))
    const { container } = render(<Nav start={noLineBody} onOpen={() => { opened += 1 }} />)
    await userEvent.click(toggle())
    expect(row(container, 'plotline').querySelector('.wrNavDesc')).toBeNull()
    expect(row(container, 'plotline').querySelector('.wrNavText')).toBeNull()
    expect(row(container, 'plotline')).not.toHaveClass('wrNavRow--desc')
    expect(row(container, 'cluster').querySelector('.wrNavDesc')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Heroes' }))
    expect(screen.getByLabelText('focused')).toHaveTextContent('sub')
    expect(opened).toBe(1)
  })

  it('a plotline\'s name still opens it and its checkbox still ticks it while the description shows', async () => {
    let opened = 0
    const { container } = render(<Nav start={start()} onOpen={() => { opened += 1 }} />)
    await userEvent.click(toggle())
    await userEvent.click(within(row(container, 'plotline')).getByRole('button', { name: 'Ada' }))
    expect(screen.getByLabelText('focused')).toHaveTextContent('line')
    expect(opened).toBe(1)
    await userEvent.click(within(row(container, 'plotline')).getByRole('checkbox', { name: 'Select Ada' }))
    expect(within(row(container, 'plotline')).getByRole('checkbox', { name: 'Select Ada' })).toBeChecked()
  })

  it('is dimmed and cannot be pressed while no category, subcategory, cluster or plotline has a description', () => {
    const blank = start().map(n => ({ ...n, body: n.id === 'cat' ? '   ' : '' }))
    render(<Nav start={blank} />)
    expect(toggle()).toBeDisabled()
  })

  it('can be pressed when only a plotline has a description', () => {
    const onlyLine = start().map(n => ({ ...n, body: n.kind === 'plotline' ? n.body : '' }))
    render(<Nav start={onlyLine} />)
    expect(toggle()).toBeEnabled()
  })

  it('is kept when the contents are opened again', async () => {
    const first = render(<Nav start={start()} />)
    await userEvent.click(toggle())
    first.unmount()
    const { container } = render(<Nav start={start()} />)
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(within(row(container, 'category')).getByText('The cast of the story.')).toBeInTheDocument()
    expect(row(container, 'plotline').querySelector('.wrNavDesc')).not.toBeNull()
  })
})

describe('the rows\' colours', () => {
  const start = () => [
    plotNode('cat', 'category', null, { title: 'Characters', hue: 200 }),
    plotNode('sub', 'subcategory', 'cat', { title: 'Heroes', hue: 230 }),
    plotNode('clu', 'cluster', 'sub', { title: 'Core', hue: 170 }),
    plotNode('line', 'plotline', 'clu', { title: 'Ada' }),
  ] as PlotNode[]
  const row = (container: HTMLElement, kind: string) => container.querySelector(`.wrNavRow--${kind}`) as HTMLElement

  it('gives a category row its fill beside its colour, as a subcategory and a cluster row have theirs', () => {
    const { container } = render(<Nav start={start()} />)
    expect(row(container, 'category').style.getPropertyValue('--wr-cat-fill')).not.toBe('')
    expect(row(container, 'category').style.getPropertyValue('--wr-cat')).not.toBe('')
    expect(row(container, 'subcategory').style.getPropertyValue('--wr-sub-fill')).not.toBe('')
    expect(row(container, 'cluster').style.getPropertyValue('--wr-cluster-fill')).not.toBe('')
  })

  it('keeps the names as they were typed (capitals are drawn by the styles, not typed over)', () => {
    const { container } = render(<Nav start={start()} />)
    expect(within(row(container, 'category')).getByRole('button', { name: 'Characters' })).toHaveTextContent('Characters')
    expect(within(row(container, 'subcategory')).getByRole('button', { name: 'Heroes' })).toHaveTextContent('Heroes')
  })
})

describe('the keywords toggle', () => {
  const start = () => [
    plotNode('cat', 'category', null, { title: 'Characters', body: 'The cast of the story.', keywords: ['cast', 'people'] }),
    plotNode('sub', 'subcategory', 'cat', { title: 'Heroes', keywords: ['brave'] }),
    plotNode('clu', 'cluster', 'sub', { title: 'Core' }),
    plotNode('line', 'plotline', 'clu', { title: 'Ada', body: 'She leaves home.', keywords: ['rain', 'train', 'Coat'] }),
  ] as PlotNode[]
  const keys = () => screen.getByRole('button', { name: /keywords$/ })
  const desc = () => screen.getByRole('button', { name: /full descriptions$/ })
  const row = (container: HTMLElement, kind: string) => container.querySelector(`.wrNavRow--${kind}`) as HTMLElement
  const chips = (r: HTMLElement) => [...r.querySelectorAll('.wrNavChip')].map(c => c.textContent)

  it('is the fifth circle, after the description one, and not part of the fold group', () => {
    render(<Nav start={start()} />)
    expect(within(screen.getByRole('group', { name: 'Fold a whole level' })).queryByRole('button', { name: /keywords/ })).toBeNull()
    expect(keys()).toHaveAttribute('aria-pressed', 'false')
    expect(keys()).toHaveAttribute('aria-label', 'Show keywords')
    expect(keys().previousElementSibling).toBe(desc())
  })

  it('shows no keyword until it is pressed, then each row\'s as read-only chips in the node\'s order, as typed, and hides them again', async () => {
    const { container } = render(<Nav start={start()} />)
    expect(container.querySelector('.wrNavChip')).toBeNull()
    await userEvent.click(keys())
    expect(keys()).toHaveAttribute('aria-pressed', 'true')
    expect(keys()).toHaveAttribute('aria-label', 'Hide keywords')
    expect(keys()).toHaveClass('wrNavDot--keys', 'wrNavDot--on')
    expect(chips(row(container, 'category'))).toEqual(['cast', 'people'])
    expect(chips(row(container, 'subcategory'))).toEqual(['brave'])
    expect(chips(row(container, 'plotline'))).toEqual(['rain', 'train', 'Coat'])
    expect(chips(row(container, 'cluster'))).toEqual([]) // a node with none has none
    await userEvent.click(keys())
    expect(container.querySelector('.wrNavChip')).toBeNull()
    expect(keys()).not.toHaveClass('wrNavDot--on')
  })

  it('is a list of plain items: nothing in a chip can be pressed, typed in or removed, and a click on one opens nothing', async () => {
    const { container } = render(<Nav start={start()} />)
    await userEvent.click(keys())
    const list = within(row(container, 'plotline')).getByRole('list', { name: 'Keywords of Ada' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(list.querySelectorAll('button, input, a, [tabindex]')).toHaveLength(0)
    await userEvent.click(within(row(container, 'subcategory')).getByRole('button', { name: 'Heroes' }))
    expect(screen.getByLabelText('focused')).toHaveTextContent('sub')
    await userEvent.click(within(list).getByText('rain'))
    expect(screen.getByLabelText('focused')).toHaveTextContent('sub') // a chip is not a way to open its plotline
    expect(chips(row(container, 'plotline'))).toEqual(['rain', 'train', 'Coat'])
  })

  it('puts the chips under the description when it is shown, and under the name when it is not, and each circle works without the other', async () => {
    const { container } = render(<Nav start={start()} />)
    await userEvent.click(keys())
    const line = row(container, 'plotline')
    expect(line).toHaveClass('wrNavRow--stack')
    expect(line).not.toHaveClass('wrNavRow--desc') // keywords alone: no description
    expect([...line.querySelector('.wrNavText')!.children].map(c => c.className)).toEqual(['wrNavLabel', 'wrNavChips'])
    expect(container.querySelector('.wrNavDesc')).toBeNull()
    await userEvent.click(desc())
    expect(line).toHaveClass('wrNavRow--stack', 'wrNavRow--desc')
    expect([...line.querySelector('.wrNavText')!.children].map(c => c.className)).toEqual(['wrNavLabel', 'wrNavDesc', 'wrNavChips'])
    await userEvent.click(keys())
    expect([...line.querySelector('.wrNavText')!.children].map(c => c.className)).toEqual(['wrNavLabel', 'wrNavDesc'])
    expect(container.querySelector('.wrNavChip')).toBeNull()
  })

  it('leaves a row without keywords as one line, and the name still opens the node', async () => {
    let opened = 0
    const { container } = render(<Nav start={start()} onOpen={() => { opened += 1 }} />)
    await userEvent.click(keys())
    expect(row(container, 'cluster')).not.toHaveClass('wrNavRow--stack')
    expect(row(container, 'cluster').querySelector('.wrNavText')).toBeNull()
    await userEvent.click(within(row(container, 'subcategory')).getByRole('button', { name: 'Heroes' }))
    expect(screen.getByLabelText('focused')).toHaveTextContent('sub')
    expect(opened).toBe(1)
  })

  it('is dimmed and cannot be pressed while no category, subcategory, cluster or plotline has a keyword', () => {
    render(<Nav start={start().map(n => ({ ...n, keywords: [] }))} />)
    expect(keys()).toBeDisabled()
  })

  it('can be pressed when only a plotline has a keyword', () => {
    render(<Nav start={start().map(n => ({ ...n, keywords: n.kind === 'plotline' ? n.keywords : [] }))} />)
    expect(keys()).toBeEnabled()
  })

  it('is its own setting, kept when the contents are opened again, apart from the description circle', async () => {
    const first = render(<Nav start={start()} />)
    await userEvent.click(keys())
    expect(getKv('scriblr.writer.plotNavKeywords')).toBe(true)
    expect(getKv('scriblr.writer.plotNavDescriptions')).toBeUndefined()
    first.unmount()
    const { container } = render(<Nav start={start()} />)
    expect(keys()).toHaveAttribute('aria-pressed', 'true')
    expect(chips(row(container, 'category'))).toEqual(['cast', 'people'])
    expect(desc()).toHaveAttribute('aria-pressed', 'false')
  })
})
