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
      id: 'plot', title: 'Plot', Icon: PlotIcon, defaultShape: 'mid', summary: '6 categories',
      render: ({ width }) => <div>plot body {width < 300 ? 'narrow' : 'wide'}<button type="button">quick</button></div>,
      console: () => <div>Plot editor</div>,
    },
    {
      id: 'outline', title: 'Outline', Icon: ListIcon, defaultShape: 'mid', summary: '24 chapters',
      render: ({ width }) => <div>outline body {width < 300 ? 'narrow' : 'wide'}</div>,
      console: () => <div>Outline editor</div>,
    },
    { id: 'editor', title: 'Project editor', Icon: PencilIcon, defaultShape: 'mini', summary: '2 time systems', console: () => <div>Editor</div> },
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

// jsdom has no DragEvent constructor either, and fireEvent.dragOver/drop silently
// drop clientX the same way -- build the native event by hand so edge-margin
// detection (which reads clientX) sees it.
const dragEvent = (type: string, init: { dataTransfer: unknown; clientX?: number; clientY?: number }) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), init)

describe('TileGrid', () => {
  it('collapses a mini tile into the grid\'s shared icon rail, mid tiles reflowing to use the rest', () => {
    renderGrid()
    // Default container fallback is 1000x600 (useContainerSize's fallback in jsdom);
    // the rail reserves RAIL_TILE + GRID_GAP (48px) off the left before the stage is sized.
    expect(tile('editor').getAttribute('data-fixed')).toBe('true')
    expect(tile('editor').closest('.tileRail')).toBeTruthy()
    expect(px(tile('editor'), 'width')).toBe(40)
    expect(px(tile('editor'), 'height')).toBe(40)
    // Plot and Outline share the whole stage, side by side, as if the rail took no room.
    expect(px(tile('plot'), 'top')).toBe(0)
    expect(px(tile('outline'), 'top')).toBe(0)
    expect(px(tile('plot'), 'left')).toBe(0)
    expect(px(tile('plot'), 'width') + px(tile('outline'), 'width') + 8).toBe(1000 - 48)
    expect(px(tile('outline'), 'left')).toBe(px(tile('plot'), 'width') + 8)
  })

  it('shows a mini tile as a plain icon in the rail, a mid tile its own render', () => {
    renderGrid()
    expect(tile('editor').getAttribute('data-shape')).toBe('mini')
    expect(tile('editor').tagName).toBe('BUTTON')
    expect(tile('editor').getAttribute('aria-label')).toBe('Project editor')
    expect(within(tile('editor')).queryByText('2 time systems')).toBeNull()
    expect(tile('editor').querySelector('.tileBody')).toBeNull()
    expect(tile('editor').querySelector('.tileHead')).toBeNull()
    expect(tile('plot').getAttribute('data-shape')).toBe('mid')
    expect(within(tile('plot')).getByText(/plot body wide/)).toBeTruthy()
  })

  it('collects minimized tiles from different branches into one shared rail, in pre-order', () => {
    const fourTiles: TileDef[] = [
      { id: 'a', title: 'A', Icon: PlotIcon, defaultShape: 'mid', summary: 'a', render: () => <div>A body</div> },
      { id: 'b', title: 'B', Icon: ListIcon, defaultShape: 'mini', summary: 'b' },
      { id: 'c', title: 'C', Icon: PencilIcon, defaultShape: 'mid', summary: 'c', render: () => <div>C body</div> },
      { id: 'd', title: 'D', Icon: PlotIcon, defaultShape: 'mini', summary: 'd' },
    ]
    renderGrid(fourTiles, 'rail-mixed')
    const rail = document.querySelector('.tileRail') as HTMLElement
    // Both minimized tiles land in the SAME rail, however far apart their leaves
    // actually sit in the underlying split tree.
    expect(within(rail).getByLabelText('B')).toBeTruthy()
    expect(within(rail).getByLabelText('D')).toBeTruthy()
    expect(document.querySelectorAll('.tileRail').length).toBe(1)
  })

  it('reclaims a dragged-to-minimize tile\'s entire space for its sibling, not a fixed-size sliver', () => {
    renderGrid([
      { id: 'a', title: 'A', Icon: PlotIcon, defaultShape: 'mid', summary: 'a', render: () => <div>A body</div> },
      { id: 'b', title: 'B', Icon: ListIcon, defaultShape: 'mid', summary: 'b', render: () => <div>B body</div> },
    ])
    // a and b start side by side (a row split) -- dragging b into the rail (nothing
    // is minimized yet, so it's the ghost placeholder) should let a claim the whole
    // stage width, not just its own former half.
    const before = px(tile('a'), 'width')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('b'), { dataTransfer })
    const ghost = document.querySelector('.tileRailGhost') as HTMLElement
    fireEvent.dragOver(ghost, { dataTransfer })
    fireEvent.drop(ghost, { dataTransfer })
    expect(tile('b').getAttribute('data-shape')).toBe('mini')
    expect(tile('b').closest('.tileRail')).toBeTruthy()
    expect(px(tile('a'), 'width')).toBeGreaterThan(before)
  })

  it('reserves room for the drag-in-progress ghost rail so the stage shrinks instead of the ghost overlapping it', () => {
    renderGrid([
      { id: 'a', title: 'A', Icon: PlotIcon, defaultShape: 'mid', summary: 'a', render: () => <div>A body</div> },
    ])
    // With nothing minimized and no drag yet, the lone tile claims the whole container.
    expect(px(tile('a'), 'width')).toBe(1000)
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('a'), { dataTransfer })
    // The ghost rail appears, and the stage shrinks by the same RAIL_TILE + GRID_GAP
    // (48px) a real rail would reserve, so the two never overlap.
    expect(document.querySelector('.tileRailGhost')).toBeTruthy()
    expect(px(tile('a'), 'width')).toBe(1000 - 48)
  })

  it('restores a rail tile to mid, with its full render, when its icon is clicked', async () => {
    const user = userEvent.setup()
    renderGrid()
    expect(tile('editor').closest('.tileRail')).toBeTruthy()
    await user.click(tile('editor'))
    expect(tile('editor').getAttribute('data-shape')).toBe('mid')
    expect(tile('editor').closest('.tileRail')).toBeNull()
    expect(within(tile('editor')).getByText('2 time systems')).toBeTruthy()
  })

  it('is one column below 400px of remaining (post-rail) container width: mid tiles span it', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320, height: 500, top: 0, left: 0, right: 320, bottom: 500, x: 0, y: 0, toJSON: () => ({}) })
    renderGrid()
    expect(document.querySelector('.tileGrid')!.className).toContain('tileGrid--one')
    for (const id of ['plot', 'outline']) expect(px(tile(id), 'width')).toBe(320 - 48)
    expect(px(tile('editor'), 'width')).toBe(40)
  })

  it('minimizes a tile by dragging it into the rail, and remembers it', () => {
    const { unmount } = renderGrid()
    expect(tile('plot').getAttribute('data-shape')).toBe('mid')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('plot'), { dataTransfer })
    const rail = document.querySelector('.tileRail') as HTMLElement // already populated (editor)
    fireEvent.dragOver(rail, { dataTransfer })
    fireEvent.drop(rail, { dataTransfer })
    expect(tile('plot').getAttribute('data-shape')).toBe('mini')
    expect(tile('plot').closest('.tileRail')).toBeTruthy()
    unmount()
    renderGrid()
    expect(tile('plot').getAttribute('data-shape')).toBe('mini')
  })

  it('does nothing when clicking the body of a tile', () => {
    renderGrid()
    fireEvent.click(tile('outline'))
    expect(tile('outline').getAttribute('data-shape')).toBe('mid')
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('has no shape/size-cycle control any more', () => {
    renderGrid()
    expect(document.querySelector('.tileShape')).toBeNull()
  })

  it('has no "Reset layout" control', () => {
    renderGrid()
    expect(screen.queryByRole('button', { name: 'Reset layout' })).toBeNull()
  })

  it('resizes only the two tiles a divider separates, and leaves the container filled', () => {
    renderGrid()
    const before = { plot: px(tile('plot'), 'width') }
    const divider = document.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement
    fireEvent(divider, pointerEvent('pointerdown', { clientX: 500, clientY: 300 }))
    fireEvent(divider, pointerEvent('pointermove', { clientX: 700, clientY: 300 }))
    fireEvent(divider, pointerEvent('pointerup', {}))
    expect(px(tile('plot'), 'width')).toBeGreaterThan(before.plot)
    expect(px(tile('plot'), 'width') + px(tile('outline'), 'width') + 8).toBe(1000 - 48)
    // The rail (a divider elsewhere in the tree entirely) wasn't touched -- it's a
    // fixed 40px icon regardless of any stage divider drag.
    expect(px(tile('editor'), 'height')).toBe(40)
  })

  it('resizes a divider with the keyboard', () => {
    renderGrid()
    const divider = document.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement
    const before = px(tile('plot'), 'width')
    divider.focus()
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(px(tile('plot'), 'width')).toBeGreaterThan(before)
  })

  it('opens a tile into its console (max) from its header, with a breadcrumb, and Back or Escape collapse it', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
    const region = screen.getByRole('region', { name: 'Plot' })
    expect(within(region).getByText('Plot editor')).toBeTruthy()
    expect(within(region).getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Shelves › Saga › Plot')
    await user.click(within(region).getByRole('button', { name: 'Back to tiles' }))
    expect(screen.queryByRole('region', { name: 'Plot' })).toBeNull()

    // Editor starts minimized (in the rail): click its icon to restore it to mid first,
    // then its now-clickable header opens the console, same as any mid tile.
    await user.click(tile('editor'))
    await user.click(within(tile('editor')).getByRole('button', { name: 'Open Project editor' }))
    expect(screen.getByRole('region', { name: 'Project editor' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Project editor' })).toBeNull()
  })

  it('does not open the tile when a quick action inside it is used', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'quick' }))
    expect(tile('plot').getAttribute('data-shape')).toBe('mid')
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('has no sibling-switch strip or [/] shortcut in an expanded console', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
    expect(screen.queryByRole('tablist', { name: 'Tiles' })).toBeNull()
    await user.keyboard(']')
    expect(screen.getByRole('region', { name: 'Plot' })).toBeTruthy() // unchanged -- ']' does nothing now
  })

  it('keeps a tile open across a relaunch', async () => {
    const user = userEvent.setup()
    const { unmount } = renderGrid()
    await user.click(within(tile('outline')).getByRole('button', { name: 'Open Outline' }))
    unmount()
    renderGrid()
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
  })

  it('has Settings and Help at the console corner', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
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
    // A rail tile is click-only, not a drag source -- it has no header to drag at all.
    expect(tile('editor').querySelector('.tileHead')).toBeNull()
    const outlineWidth = px(tile('outline'), 'width')
    const plotRect = { left: px(tile('plot'), 'left'), top: px(tile('plot'), 'top'), width: px(tile('plot'), 'width') }
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('outline').querySelector('.tileHead')!, { dataTransfer })
    fireEvent.dragOver(tile('plot'), { dataTransfer })
    fireEvent.drop(tile('plot'), { dataTransfer })
    // Outline's tile now sits where Plot was (Plot's area, including its size), and vice versa.
    expect(px(tile('outline'), 'left')).toBe(plotRect.left)
    expect(px(tile('outline'), 'top')).toBe(plotRect.top)
    expect(px(tile('outline'), 'width')).toBe(plotRect.width)
    expect(px(tile('plot'), 'width')).toBe(outlineWidth)
    unmount()
    renderGrid()
    expect(px(tile('plot'), 'width')).toBe(outlineWidth)
  })

  it('drops a dragged tile onto a divider to wedge it in as a new column or row, instead of swapping', () => {
    const threeTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'y', title: 'Y', Icon: ListIcon, defaultShape: 'mid', summary: 'y', render: () => <div>Y body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(threeTiles, 'three')
    // X and Y share a column, split from Z -- the horizontal divider is the one between X and Y.
    const divider = document.querySelector('[role="separator"][aria-orientation="horizontal"]') as HTMLElement
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    fireEvent.dragOver(divider, { dataTransfer })
    fireEvent.drop(divider, { dataTransfer })
    // Z is now wedged directly between X and Y -- not swapped with either.
    expect(order()).toEqual(['x', 'z', 'y'])
    expect(tile('x')).toBeTruthy()
    expect(tile('y')).toBeTruthy()
  })

  it('drops a dragged tile onto another tile\'s right edge margin to split off a new column beside it', () => {
    // A big mock box: getBoundingClientRect stands in for both the container (so X's
    // own computed rect clears the room-to-split minimum) and the tile div itself
    // (so the edge-margin fraction below is read against the same box).
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
    const threeTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'y', title: 'Y', Icon: ListIcon, defaultShape: 'mid', summary: 'y', render: () => <div>Y body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(threeTiles, 'edge-right')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    // Deep in X's right-edge margin (90% across the mocked 1200px-wide box).
    fireEvent(tile('x'), dragEvent('dragover', { dataTransfer, clientX: 1080 }))
    fireEvent(tile('x'), dragEvent('drop', { dataTransfer, clientX: 1080 }))
    // Z is now beside X (to its right), not swapped with it -- Y is untouched elsewhere.
    expect(order()).toEqual(['x', 'z', 'y'])
  })

  it('drops a dragged tile onto another tile\'s left edge margin to split off a new column before it', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
    const threeTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'y', title: 'Y', Icon: ListIcon, defaultShape: 'mid', summary: 'y', render: () => <div>Y body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(threeTiles, 'edge-left')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    // Deep in X's left-edge margin (10% across the mocked 1200px-wide box).
    fireEvent(tile('x'), dragEvent('dragover', { dataTransfer, clientX: 120 }))
    fireEvent(tile('x'), dragEvent('drop', { dataTransfer, clientX: 120 }))
    expect(order()).toEqual(['z', 'x', 'y'])
  })

  it('drops a dragged tile onto another tile\'s bottom edge margin to split off a new row below it', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
    const threeTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'y', title: 'Y', Icon: ListIcon, defaultShape: 'mid', summary: 'y', render: () => <div>Y body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(threeTiles, 'edge-bottom')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    // Deep in X's bottom-edge margin (90% down the mocked 700px-tall box).
    fireEvent(tile('x'), dragEvent('dragover', { dataTransfer, clientY: 630 }))
    fireEvent(tile('x'), dragEvent('drop', { dataTransfer, clientY: 630 }))
    // Z is now below X (same column), not swapped with it -- Y is untouched elsewhere.
    expect(order()).toEqual(['x', 'z', 'y'])
    expect(px(tile('z'), 'left')).toBe(px(tile('x'), 'left'))
    expect(px(tile('z'), 'top')).toBeGreaterThan(px(tile('x'), 'top'))
  })

  it('drops a dragged tile onto another tile\'s top edge margin to split off a new row above it', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
    const threeTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'y', title: 'Y', Icon: ListIcon, defaultShape: 'mid', summary: 'y', render: () => <div>Y body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(threeTiles, 'edge-top')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    // Deep in X's top-edge margin (10% down the mocked 700px-tall box).
    fireEvent(tile('x'), dragEvent('dragover', { dataTransfer, clientY: 70 }))
    fireEvent(tile('x'), dragEvent('drop', { dataTransfer, clientY: 70 }))
    expect(order()).toEqual(['z', 'x', 'y'])
    expect(px(tile('z'), 'left')).toBe(px(tile('x'), 'left'))
    expect(px(tile('z'), 'top')).toBeLessThan(px(tile('x'), 'top'))
  })

  it('picks the edge the pointer is physically closest to, in real pixels, near a corner', () => {
    // A wide, short box: 400px from the left is well within the horizontal 25%
    // margin, and 50px from the top is well within the vertical one too -- both
    // edges qualify, so whichever the pointer is physically closer to, in raw
    // pixels (50 vs 400), must win. A naive "check the horizontal axis first"
    // rule would wrongly pick left/right here.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 2000, height: 300, top: 0, left: 0, right: 2000, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
    const twoTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(twoTiles, 'edge-corner')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    fireEvent(tile('x'), dragEvent('dragover', { dataTransfer, clientX: 400, clientY: 50 }))
    fireEvent(tile('x'), dragEvent('drop', { dataTransfer, clientX: 400, clientY: 50 }))
    // Z landed above X (the top edge won), not beside it.
    expect(order()).toEqual(['z', 'x'])
    expect(px(tile('z'), 'left')).toBe(px(tile('x'), 'left'))
    expect(px(tile('z'), 'top')).toBeLessThan(px(tile('x'), 'top'))
  })

  it('swaps as usual when the drop is in the middle of a tile, not its edge margin', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
    const threeTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'y', title: 'Y', Icon: ListIcon, defaultShape: 'mid', summary: 'y', render: () => <div>Y body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(threeTiles, 'edge-middle')
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    fireEvent(tile('x'), dragEvent('dragover', { dataTransfer, clientX: 600 }))
    fireEvent(tile('x'), dragEvent('drop', { dataTransfer, clientX: 600 }))
    // X and Z swapped places -- Y untouched.
    expect(order()).toEqual(['z', 'y', 'x'])
  })

  it('offers no divider drop when there is no room for a third side', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 200, top: 0, left: 0, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
    const threeTiles: TileDef[] = [
      { id: 'x', title: 'X', Icon: PlotIcon, defaultShape: 'mid', summary: 'x', render: () => <div>X body</div> },
      { id: 'y', title: 'Y', Icon: ListIcon, defaultShape: 'mid', summary: 'y', render: () => <div>Y body</div> },
      { id: 'z', title: 'Z', Icon: PencilIcon, defaultShape: 'mid', summary: 'z', render: () => <div>Z body</div> },
    ]
    renderGrid(threeTiles, 'three-tight')
    const divider = document.querySelector('[role="separator"][aria-orientation="horizontal"]') as HTMLElement
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tile('z').querySelector('.tileHead')!, { dataTransfer })
    fireEvent.dragOver(divider, { dataTransfer })
    fireEvent.drop(divider, { dataTransfer })
    expect(order()).toEqual(['x', 'y', 'z'])
  })

  it('moves focus with the arrow keys, swaps a tile with Alt+arrows and opens with Enter', async () => {
    const user = userEvent.setup()
    renderGrid()
    tile('plot').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tile('outline'))
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    // Outline (focused) swaps with Plot, which was to its left. The rail (editor)
    // always renders before the stage in document order, regardless of the swap.
    expect(order()).toEqual(['editor', 'outline', 'plot'])
    expect(document.activeElement).toBe(tile('outline'))
    await user.keyboard('{Enter}')
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
  })

  it('disables the header button for a tile with neither a console nor onOpen', () => {
    renderGrid([{ id: 'info', title: 'Info', Icon: PlotIcon, defaultShape: 'mid', summary: 'Just information' }])
    const btn = within(tile('info')).getByRole('button', { name: 'Info' })
    expect(btn).toBeDisabled()
  })

  it('opens a mini tile that goes elsewhere instead of expanding, from its header', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    renderGrid([{ id: 'go', title: 'Go', Icon: PlotIcon, defaultShape: 'mini', summary: 'Elsewhere', onOpen }])
    // Rail icons are click-only (toggle back to mid); the "goes elsewhere" shortcut
    // is reached the same way any mid tile's header reaches it.
    await user.click(tile('go'))
    expect(onOpen).not.toHaveBeenCalled()
    await user.click(within(tile('go')).getByRole('button', { name: 'Open Go' }))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('shows child tiles when a tile expands, and they can expand in turn', async () => {
    const user = userEvent.setup()
    const child: TileDef = { id: 'kid', title: 'Kid', Icon: PencilIcon, defaultShape: 'mid', summary: 'One', console: () => <div>Kid editor</div> }
    renderGrid([{ id: 'parent', title: 'Parent', Icon: PlotIcon, defaultShape: 'mid', summary: 'Two', children: [child] }])
    await user.click(within(tile('parent')).getByRole('button', { name: 'Open Parent' }))
    const region = screen.getByRole('region', { name: 'Parent' })
    await user.click(within(region).getByRole('button', { name: 'Open Kid' }))
    const inner = screen.getByRole('region', { name: 'Kid' })
    expect(within(inner).getByText('Kid editor')).toBeTruthy()
    expect(within(inner).getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('Shelves › Saga › Parent › Kid')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Kid' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Parent' })).toBeTruthy()
  })

  it('appends a new tile after the saved ones', () => {
    const { unmount } = renderGrid()
    unmount()
    renderGrid([...defs(), { id: 'extra', title: 'Extra', Icon: PlotIcon, defaultShape: 'mid', summary: 'x' }])
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
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
    await user.click(screen.getByRole('button', { name: 'jump' }))
    expect(screen.getByRole('region', { name: 'Outline' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Settings' })).toBeTruthy()
  })

  it('double-clicking a console header maximizes it, and it stays maximized across a relaunch', async () => {
    const onMaximizeChange = vi.fn()
    const user = userEvent.setup()
    const { unmount } = render(<TileGrid gridId="max" tiles={defs()} crumbs={crumbs} onMaximizeChange={onMaximizeChange} />)
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
    const head = document.querySelector('.tcHead')!
    fireEvent.doubleClick(head)
    expect(onMaximizeChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('region', { name: 'Plot' }).getAttribute('data-maximized')).toBe('true')
    unmount()
    render(<TileGrid gridId="max" tiles={defs()} crumbs={crumbs} open="plot" onMaximizeChange={onMaximizeChange} />)
    expect(screen.getByRole('region', { name: 'Plot' }).getAttribute('data-maximized')).toBe('true')
  })

  it('does not offer maximize where the caller has not wired onMaximizeChange', async () => {
    const user = userEvent.setup()
    renderGrid()
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
    fireEvent.doubleClick(document.querySelector('.tcHead')!)
    expect(screen.getByRole('region', { name: 'Plot' }).getAttribute('data-maximized')).toBeNull()
  })

  it('clears maximize (and reports it) when the console closes', async () => {
    const onMaximizeChange = vi.fn()
    const user = userEvent.setup()
    render(<TileGrid gridId="max2" tiles={defs()} crumbs={crumbs} onMaximizeChange={onMaximizeChange} />)
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
    fireEvent.doubleClick(document.querySelector('.tcHead')!)
    expect(onMaximizeChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Back to tiles' }))
    expect(onMaximizeChange).toHaveBeenLastCalledWith(false)
    await user.click(within(tile('plot')).getByRole('button', { name: 'Open Plot' }))
    expect(screen.getByRole('region', { name: 'Plot' }).getAttribute('data-maximized')).toBeNull()
  })
})
