import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { __resetSettingsForTests, getKv } from '../../../../settings/settingsStore'
import TileGrid from '../../../../components/tiles/TileGrid'
import type { TileDef } from '../../../../components/tiles/tileTypes'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { bookLinkTiles } from './bookTiles'
import { shelfTiles } from './shelfTiles'
import { shelvesTiles } from './shelvesTiles'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})
afterEach(() => { vi.unstubAllGlobals() })

const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)
const plot = (id: string, kind: PlotNode['kind'], parentId: string | null, over: Partial<PlotNode> = {}): PlotNode =>
  ({ id, kind, parentId, order: 0, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, sourceFieldId: null, fieldId: null, refId: null, awareness: null, ...over } as PlotNode)

const outlineNodes = [
  outline('b1', 'book', null, { title: 'Book One' }), outline('a1', 'arc', 'b1'),
  outline('c1', 'chapter', 'a1'), outline('c2', 'chapter', 'a1'),
]
const plotNodes = [
  plot('cat', 'category', null, { title: 'Romance' }), plot('line', 'plotline', 'cat'),
  plot('v1', 'plotpoint', 'line', { fieldId: 'f' }), plot('v2', 'plotpoint', 'line', { fieldId: 'f', assignedMomentId: 'c1' }),
]

function workspace(over: Record<string, unknown> = {}): WriterWorkspace {
  return {
    projects: [{ projectId: 'p1', title: 'Saga' }], projectOutlines: { p1: outlineNodes },
    outlineNodes, plotNodes, activeBook: outlineNodes[0],
    activeProject: { title: 'Saga', settings: { timeSystems: [{ id: 't' }] } },
    openBook: vi.fn(),
    ...over,
  } as unknown as WriterWorkspace
}

const grid = (tiles: TileDef[], gridId: string) => render(<TileGrid gridId={gridId} tiles={tiles} crumbs={[{ label: 'Shelves' }]} />)
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement
const shapes = () => Array.from(document.querySelectorAll('[data-tile-id]')).map(el => `${el.getAttribute('data-tile-id')}:${el.getAttribute('data-shape')}`)

describe('Shelves tiles', () => {
  it('are the template, schedule, analytics and scratchpad', () => {
    grid(shelvesTiles(workspace()), 'shelves')
    expect(shapes()).toEqual(['schedule:mid', 'analytics:mid', 'scratchpad:mid', 'template:mini'])
  })

  it('shows the chapters of each project in the analytics tile', () => {
    grid(shelvesTiles(workspace()), 'shelves')
    expect(within(tile('analytics')).getByText('Saga')).toBeTruthy()
    expect(within(tile('analytics')).getByText('2 chapters')).toBeTruthy()
  })

  it('adds and ticks a task from the schedule tile without opening it', async () => {
    const user = userEvent.setup()
    grid(shelvesTiles(workspace()), 'shelves')
    await user.type(within(tile('schedule')).getByLabelText('Add a task'), 'Draft chapter 3{Enter}')
    expect(within(tile('schedule')).getByText('Draft chapter 3')).toBeTruthy()
    await user.click(within(tile('schedule')).getByRole('checkbox'))
    expect(getKv<Array<{ label: string; done: boolean }>>('scriblr.writer.tasks')).toEqual([expect.objectContaining({ label: 'Draft chapter 3', done: true })])
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('adds a note from the scratchpad tile', async () => {
    const user = userEvent.setup()
    grid(shelvesTiles(workspace()), 'shelves')
    await user.type(within(tile('scratchpad')).getByLabelText('Add a note'), 'Rework the storm{Enter}')
    expect(within(tile('scratchpad')).getByText('Rework the storm')).toBeTruthy()
    expect(getKv<Array<{ title: string }>>('scriblr.writer.scratchpad')![0].title).toBe('Rework the storm')
  })

  it('expands the schedule tile into its panel', async () => {
    const user = userEvent.setup()
    grid(shelvesTiles(workspace()), 'shelves')
    await user.click(within(tile('schedule')).getByRole('button', { name: 'Open Schedule' }))
    const region = screen.getByRole('region', { name: 'Schedule' })
    expect(within(region).getByText('Routines')).toBeTruthy()
  })
})

describe('Shelf tiles', () => {
  it('are the working editors as summary tiles, then placeholders, then link tiles', () => {
    grid(shelfTiles(workspace()), 'shelf')
    // Mini tiles (schedule, history, editor, template) stack as a fixed strip below the rest.
    expect(shapes()).toEqual([
      'plot:mid', 'outline:mid', 'analytics:mid', 'schedule:mini', 'history:mini', 'editor:mini', 'template:mini',
    ])
  })

  it('summarises the plot: categories with their plotlines, and values placed and waiting', () => {
    grid(shelfTiles(workspace()), 'shelf')
    expect(within(tile('plot')).getByText('Romance')).toBeTruthy()
    expect(within(tile('plot')).getByText('1 plotline')).toBeTruthy()
    expect(within(tile('plot')).getByText('1 value placed, 1 waiting')).toBeTruthy()
  })

  it('opens a book straight from the outline tile without expanding it', async () => {
    const w = workspace()
    const user = userEvent.setup()
    grid(shelfTiles(w), 'shelf')
    await user.click(within(tile('outline')).getByRole('button', { name: 'Book One' }))
    expect(w.openBook).toHaveBeenCalledWith('b1')
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('shows link tiles as a name and a summary, and expands a placeholder tile', async () => {
    const user = userEvent.setup()
    grid(shelfTiles(workspace()), 'shelf')
    expect(within(tile('editor')).getByText('1 time system')).toBeTruthy()
    await user.click(within(tile('history')).getByRole('button', { name: 'Open History' }))
    expect(within(screen.getByRole('region', { name: 'History' })).getByText(/version and activity/)).toBeTruthy()
  })
})

describe('Book link tiles', () => {
  it('are the outline template and the arc outline, as short link tiles', async () => {
    const user = userEvent.setup()
    grid(bookLinkTiles(workspace()), 'book')
    expect(shapes()).toEqual(['outlineTemplate:mini', 'arcOutline:mini'])
    expect(within(tile('arcOutline')).getByText('1 arc')).toBeTruthy()
    await user.click(within(tile('arcOutline')).getByRole('button', { name: 'Open Arc outline' }))
    expect(within(screen.getByRole('region', { name: 'Arc outline' })).getByText(/Manage this book/)).toBeTruthy()
  })
})
