import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlotIcon, ListIcon, PencilIcon } from '../../assets/icons'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import TileGrid, { useTileHost } from './TileGrid'
import type { TileDef } from './tileTypes'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function defs(): TileDef[] {
  return [
    {
      id: 'plot', title: 'Plot', Icon: PlotIcon, shapes: ['landscape', 'portrait'], defaultShape: 'landscape', summary: '6 categories',
      render: ({ shape }) => <div>plot body {shape}<button type="button">quick</button></div>,
      console: () => <div>Plot editor</div>,
    },
    {
      id: 'outline', title: 'Outline', Icon: ListIcon, shapes: ['small', 'portrait'], defaultShape: 'small', summary: '24 chapters',
      render: ({ shape }) => <div>outline body {shape}</div>,
      console: () => <div>Outline editor</div>,
    },
    { id: 'editor', title: 'Project editor', Icon: PencilIcon, shapes: ['link'], defaultShape: 'link', summary: '2 time systems', console: () => <div>Editor</div> },
  ]
}

const crumbs = [{ label: 'Shelves' }, { label: 'Saga' }]
const renderGrid = (tiles: TileDef[] = defs(), gridId = 'test') => render(<TileGrid gridId={gridId} tiles={tiles} crumbs={crumbs} />)
const order = () => Array.from(document.querySelectorAll('[data-tile-id]')).map(el => el.getAttribute('data-tile-id'))
const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement

describe('TileGrid', () => {
  it('shows each tile in its shape; a link tile is only its name and summary', () => {
    renderGrid()
    expect(tile('plot').getAttribute('data-shape')).toBe('landscape')
    expect(within(tile('plot')).getByText(/plot body landscape/)).toBeTruthy()
    expect(tile('outline').getAttribute('data-shape')).toBe('small')
    expect(tile('editor').getAttribute('data-shape')).toBe('link')
    expect(within(tile('editor')).getByText('2 time systems')).toBeTruthy()
    expect(tile('editor').querySelector('.tileBody')).toBeNull()
  })

  it('spans the columns each shape takes', () => {
    renderGrid()
    expect(tile('plot').style.gridColumn).toBe('span 2')
    expect(tile('plot').style.gridRow).toBe('span 3')
    expect(tile('outline').style.gridRow).toBe('span 3')
    expect(tile('editor').style.gridRow).toBe('span 1')
  })

  it('is one column of rows in a narrow container: small and landscape become rows, portrait keeps its body', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320, height: 500, top: 0, left: 0, right: 320, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
    renderGrid()
    expect(document.querySelector('.tileGrid')!.className).toContain('tileGrid--one')
    // Landscape and small: the row version has the summary and no body.
    expect(tile('plot').className).toContain('tile--row')
    expect(tile('plot').querySelector('.tileBody')).toBeNull()
    expect(within(tile('plot')).getByText('6 categories')).toBeTruthy()
    expect(tile('plot').style.gridColumn).toBe('span 1')
    expect(tile('plot').style.gridRow).toBe('span 2')
    // Change Outline to portrait: it keeps its full body and five rows.
    fireEvent.click(within(tile('outline')).getByRole('button', { name: /Change shape of Outline/ }))
    expect(tile('outline').className).not.toContain('tile--row')
    expect(within(tile('outline')).getByText(/outline body portrait/)).toBeTruthy()
    expect(tile('outline').style.gridRow).toBe('span 5')
  })

  it('changes a tile shape with its control and remembers it', async () => {
    const user = userEvent.setup()
    const { unmount } = renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: /Change shape of Plot \(now landscape\)/ }))
    expect(tile('plot').getAttribute('data-shape')).toBe('portrait')
    expect(tile('editor').querySelector('.tileShape')).toBeNull() // one shape only
    unmount()
    renderGrid()
    expect(tile('plot').getAttribute('data-shape')).toBe('portrait')
  })

  it('opens a tile into its console with a breadcrumb, and Back or Escape collapse it', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'Plot' }))
    const region = screen.getByRole('region', { name: 'Plot' })
    expect(within(region).getByText('Plot editor')).toBeTruthy()
    expect(within(region).getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Shelves › Saga › Plot')
    await user.click(within(region).getByRole('button', { name: 'Back to tiles' }))
    expect(screen.queryByRole('region', { name: 'Plot' })).toBeNull()

    await user.click(tile('editor'))
    expect(screen.getByRole('region', { name: 'Project editor' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Project editor' })).toBeNull()
  })

  it('does not open a tile when a quick action inside it is used', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'quick' }))
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('switches tiles from the strip of mini tiles, and with [ and ]', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'Plot' }))
    const strip = screen.getByRole('tablist', { name: 'Tiles' })
    expect(within(strip).getAllByRole('tab').map(t => t.textContent?.trim())).toEqual(['Plot', 'Outline', 'Project editor'])
    await user.click(within(strip).getByRole('tab', { name: /Outline/ }))
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
    await user.keyboard(']')
    expect(screen.getByRole('region', { name: 'Project editor' })).toBeTruthy()
    await user.keyboard('[[')
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
  })

  it('keeps a tile open across a relaunch', async () => {
    const user = userEvent.setup()
    const { unmount } = renderGrid()
    await user.click(tile('outline'))
    unmount()
    renderGrid()
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
  })

  it('has Settings and Help at the console corner', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(tile('plot'))
    await user.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('region', { name: 'Help' }).textContent).toContain('Resources and assistance')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('region', { name: 'Settings' }).textContent).toContain('Preferences')
    expect(screen.queryByRole('region', { name: 'Help' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByRole('region', { name: 'Settings' })).toBeNull()
  })

  it('reorders tiles by dragging a header, and remembers the order', () => {
    const { unmount } = renderGrid()
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('editor').querySelector('.tileHead')!, { dataTransfer })
    fireEvent.dragOver(tile('plot'), { dataTransfer })
    fireEvent.drop(tile('plot'), { dataTransfer })
    expect(order()).toEqual(['editor', 'plot', 'outline'])
    unmount()
    renderGrid()
    expect(order()).toEqual(['editor', 'plot', 'outline'])
  })

  it('moves focus with the arrow keys, moves a tile with Alt+arrows and opens with Enter', async () => {
    const user = userEvent.setup()
    renderGrid()
    tile('plot').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tile('outline'))
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    expect(order()).toEqual(['plot', 'editor', 'outline'])
    expect(document.activeElement).toBe(tile('outline'))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(tile('editor'))
    await user.keyboard('{Enter}')
    expect(screen.getByRole('region', { name: 'Project editor' })).toBeTruthy()
  })

  it('opens a link tile that goes elsewhere instead of expanding', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    renderGrid([{ id: 'go', title: 'Go', Icon: PlotIcon, shapes: ['link'], defaultShape: 'link', summary: 'Elsewhere', onOpen }])
    await user.click(tile('go'))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('shows child tiles when a tile expands, and they can expand in turn', async () => {
    const user = userEvent.setup()
    const child: TileDef = { id: 'kid', title: 'Kid', Icon: PencilIcon, shapes: ['small'], defaultShape: 'small', summary: 'One', console: () => <div>Kid editor</div> }
    renderGrid([{ id: 'parent', title: 'Parent', Icon: PlotIcon, shapes: ['small'], defaultShape: 'small', summary: 'Two', children: [child] }])
    await user.click(tile('parent'))
    const region = screen.getByRole('region', { name: 'Parent' })
    await user.click(within(region).getByRole('button', { name: 'Kid' }))
    const inner = screen.getByRole('region', { name: 'Kid' })
    expect(within(inner).getByText('Kid editor')).toBeTruthy()
    expect(within(inner).getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Shelves › Saga › Parent › Kid')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Kid' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Parent' })).toBeTruthy()
  })

  it('appends a new tile after the saved ones', async () => {
    const user = userEvent.setup()
    const { unmount } = renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: /Change shape/ }))
    unmount()
    renderGrid([...defs(), { id: 'extra', title: 'Extra', Icon: PlotIcon, shapes: ['small'], defaultShape: 'small', summary: 'x' }])
    expect(order()).toEqual(['plot', 'outline', 'editor', 'extra'])
  })

  it('can be controlled from outside: the open tile comes from props and closing reports back', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<TileGrid gridId="ctl" tiles={defs()} crumbs={crumbs} open="outline" onOpenChange={onOpenChange} />)
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back to tiles' }))
    expect(onOpenChange).toHaveBeenCalledWith(null)
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy() // still open until the parent says so
    await user.click(screen.getByRole('tab', { name: /Plot/ }))
    expect(onOpenChange).toHaveBeenCalledWith('plot')
  })

  it('shows the grid when the controlled tile is null', () => {
    render(<TileGrid gridId="ctl2" tiles={defs()} crumbs={crumbs} open={null} />)
    expect(screen.queryByRole('region')).toBeNull()
    expect(tile('plot')).toBeTruthy()
  })

  it('lets the content of a tile open another tile, with its Settings panel showing', async () => {
    const user = userEvent.setup()
    function Jump() {
      const host = useTileHost()
      return <button type="button" onClick={() => host.open('outline', 'settings')}>jump</button>
    }
    const tiles = defs()
    tiles[0] = { ...tiles[0], console: () => <Jump /> }
    renderGrid(tiles)
    await user.click(within(tile('plot')).getByRole('button', { name: 'Plot' }))
    await user.click(screen.getByRole('button', { name: 'jump' }))
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Settings' })).toBeTruthy()
  })
})
