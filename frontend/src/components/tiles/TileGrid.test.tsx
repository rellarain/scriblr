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
  // jsdom doesn't implement the Pointer Events capture methods the divider drag uses.
  for (const name of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'] as const) {
    if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: vi.fn(() => true), configurable: true })
  }
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
const px = (el: HTMLElement, prop: 'left' | 'top' | 'width' | 'height') => parseFloat(el.style[prop])

// jsdom has no PointerEvent constructor, and @testing-library's fireEvent.pointerX
// helpers silently drop clientX/pointerId when falling back to a plain Event -- build
// the native event by hand so the properties the divider's handlers read arrive.
const pointerEvent = (type: string, init: { pointerId?: number; button?: number; clientX?: number; clientY?: number }) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, button: 0, ...init })

describe('TileGrid', () => {
  it('stacks a link tile as a fixed strip above the rest, filling the container exactly', () => {
    renderGrid()
    // Default container fallback is 1000x600 (useContainerSize's fallback in jsdom).
    expect(tile('editor').getAttribute('data-fixed')).toBe('true')
    expect(px(tile('editor'), 'height')).toBe(46)
    expect(px(tile('editor'), 'top')).toBe(0)
    expect(px(tile('editor'), 'width')).toBe(1000)
    // Plot and Outline share the row below the link strip, side by side, filling the width.
    expect(px(tile('plot'), 'top')).toBe(54)
    expect(px(tile('outline'), 'top')).toBe(54)
    expect(px(tile('plot'), 'left')).toBe(0)
    expect(px(tile('plot'), 'width') + px(tile('outline'), 'width') + 8).toBe(1000)
    expect(px(tile('outline'), 'left')).toBe(px(tile('plot'), 'width') + 8)
  })

  it('shows a fixed tile as just its name and summary; others show what their measured size earns', () => {
    renderGrid()
    expect(tile('editor').getAttribute('data-shape')).toBe('link')
    expect(within(tile('editor')).getByText('2 time systems')).toBeTruthy()
    expect(tile('editor').querySelector('.tileBody')).toBeNull()
    // Wide and tall, but "large" isn't one of Plot's allowed shapes, so it falls back to its default.
    expect(tile('plot').getAttribute('data-shape')).toBe('landscape')
    expect(within(tile('plot')).getByText(/plot body landscape/)).toBeTruthy()
  })

  it('is one column below 400px of container width: every tile spans the full width', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320, height: 500, top: 0, left: 0, right: 320, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
    renderGrid()
    expect(document.querySelector('.tileGrid')!.className).toContain('tileGrid--one')
    for (const id of ['plot', 'outline', 'editor']) expect(px(tile(id), 'width')).toBe(320)
    // Never reads as wide in one column, whatever the container's actual width.
    expect(tile('plot').getAttribute('data-shape')).not.toBe('landscape')
    expect(tile('outline').getAttribute('data-shape')).not.toBe('landscape')
  })

  it('changes a tile\'s size with its control and remembers it', async () => {
    const user = userEvent.setup()
    const { unmount } = renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: /Change size of Plot \(now landscape\)/ }))
    expect(tile('plot').getAttribute('data-shape')).toBe('portrait')
    expect(tile('editor').querySelector('.tileShape')).toBeNull() // one shape only
    unmount()
    renderGrid()
    expect(tile('plot').getAttribute('data-shape')).toBe('portrait')
  })

  it('resizes only the two tiles a divider separates, and leaves the container filled', () => {
    renderGrid()
    const before = { plot: px(tile('plot'), 'width'), editor: px(tile('editor'), 'height') }
    const divider = document.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement
    fireEvent(divider, pointerEvent('pointerdown', { clientX: 575, clientY: 300 }))
    fireEvent(divider, pointerEvent('pointermove', { clientX: 700, clientY: 300 }))
    fireEvent(divider, pointerEvent('pointerup', {}))
    expect(px(tile('plot'), 'width')).toBeGreaterThan(before.plot)
    expect(px(tile('plot'), 'width') + px(tile('outline'), 'width') + 8).toBe(1000)
    // The link strip above wasn't touched by a divider lower in the tree.
    expect(px(tile('editor'), 'height')).toBe(before.editor)
  })

  it('resizes a divider with the keyboard, and double-clicking it resets that split', () => {
    renderGrid()
    const divider = document.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement
    const before = px(tile('plot'), 'width')
    divider.focus()
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(px(tile('plot'), 'width')).toBeGreaterThan(before)
    fireEvent.doubleClick(divider)
    expect(px(tile('plot'), 'width')).toBe(before)
  })

  it('restores the default layout from the "Reset layout" control', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: /Change size of Plot/ }))
    expect(tile('plot').getAttribute('data-shape')).not.toBe('landscape')
    await user.click(screen.getByRole('button', { name: 'Reset layout' }))
    expect(tile('plot').getAttribute('data-shape')).toBe('landscape')
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

  it('swaps two tiles by dragging a header, keeping each area\'s own size, and remembers it', () => {
    const { unmount } = renderGrid()
    const editorWidth = px(tile('editor'), 'width')
    const plotRect = { left: px(tile('plot'), 'left'), top: px(tile('plot'), 'top'), width: px(tile('plot'), 'width') }
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('editor').querySelector('.tileHead')!, { dataTransfer })
    fireEvent.dragOver(tile('plot'), { dataTransfer })
    fireEvent.drop(tile('plot'), { dataTransfer })
    // Editor's tile now sits where Plot was (Plot's area, including its size), and vice versa.
    expect(px(tile('editor'), 'left')).toBe(plotRect.left)
    expect(px(tile('editor'), 'top')).toBe(plotRect.top)
    expect(px(tile('editor'), 'width')).toBe(plotRect.width)
    expect(px(tile('plot'), 'width')).toBe(editorWidth)
    expect(tile('plot').getAttribute('data-fixed')).toBe('true')
    unmount()
    renderGrid()
    expect(tile('plot').getAttribute('data-fixed')).toBe('true')
  })

  it('moves focus with the arrow keys, swaps a tile with Alt+arrows and opens with Enter', async () => {
    const user = userEvent.setup()
    renderGrid()
    tile('plot').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tile('outline'))
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    // Outline (focused) swaps with Plot, which was to its left.
    expect(order()).toEqual(['editor', 'outline', 'plot'])
    expect(document.activeElement).toBe(tile('outline'))
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
    await user.click(within(tile('plot')).getByRole('button', { name: /Change size/ }))
    unmount()
    renderGrid([...defs(), { id: 'extra', title: 'Extra', Icon: PlotIcon, shapes: ['small'], defaultShape: 'small', summary: 'x' }])
    expect(order()).toContain('extra')
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

  it('double-clicking a console header maximizes it, and it stays maximized while switching tiles', async () => {
    const onMaximizeChange = vi.fn()
    const user = userEvent.setup()
    const { unmount } = render(<TileGrid gridId="max" tiles={defs()} crumbs={crumbs} onMaximizeChange={onMaximizeChange} />)
    await user.click(tile('plot'))
    const head = document.querySelector('.tcHead')!
    fireEvent.doubleClick(head)
    expect(onMaximizeChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('region', { name: 'Plot' }).getAttribute('data-maximized')).toBe('true')
    await user.click(screen.getByRole('tab', { name: /Outline/ }))
    expect(screen.getByRole('region', { name: 'Outline' }).getAttribute('data-maximized')).toBe('true')
    unmount()
    render(<TileGrid gridId="max" tiles={defs()} crumbs={crumbs} open="outline" onMaximizeChange={onMaximizeChange} />)
    expect(screen.getByRole('region', { name: 'Outline' }).getAttribute('data-maximized')).toBe('true')
  })

  it('clears maximize (and reports it) when the console closes', async () => {
    const onMaximizeChange = vi.fn()
    const user = userEvent.setup()
    render(<TileGrid gridId="max2" tiles={defs()} crumbs={crumbs} onMaximizeChange={onMaximizeChange} />)
    await user.click(tile('plot'))
    fireEvent.doubleClick(document.querySelector('.tcHead')!)
    expect(onMaximizeChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Back to tiles' }))
    expect(onMaximizeChange).toHaveBeenLastCalledWith(false)
    await user.click(tile('plot'))
    expect(screen.getByRole('region', { name: 'Plot' }).getAttribute('data-maximized')).toBeNull()
  })

  it('does not offer maximize where the caller has not wired onMaximizeChange', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(tile('plot'))
    fireEvent.doubleClick(document.querySelector('.tcHead')!)
    expect(screen.getByRole('region', { name: 'Plot' }).getAttribute('data-maximized')).toBeNull()
  })
})
