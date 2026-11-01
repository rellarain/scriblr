import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { ListIcon, PencilIcon, PlotIcon } from '../../icons'
import SplitArea, { columnsTree, type SplitTile } from './SplitArea'
import { mockFetch } from '../../../test/mockFetch'
import { dragTile, holdTile, pointerEvent } from '../../../test/tileDrag'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
  // jsdom doesn't implement the Pointer Events capture methods the divider drag uses.
  for (const name of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'] as const) {
    if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: vi.fn(() => true), configurable: true })
  }
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const tiles = (ids = ['x', 'y', 'z']): SplitTile[] => ids.map((id, i) => ({
  id, title: id.toUpperCase(), Icon: [PlotIcon, ListIcon, PencilIcon][i % 3], children: <div>{id} body<input aria-label={`${id} input`} /></div>,
}))
const tile = (id: string) => document.querySelector<HTMLElement>(`[data-tile-id="${id}"]`)!
const px = (el: HTMLElement, prop: 'left' | 'top' | 'width' | 'height') => parseFloat(el.style[prop])
const handle = (id: string) => tile(id).querySelector<HTMLElement>('.wrTabTileTitle')!

function Harness({ ids = ['x', 'y', 'z'], gridId = 'test', bar = false }: { ids?: string[]; gridId?: string; bar?: boolean }) {
  return <SplitArea gridId={gridId} tiles={tiles(ids)} bar={bar} />
}

// Without a saved layout the default of x, y and z is x over y on the left (0..496) and z the full height on the right (504..1000)
// of the 1000 x 600 area.
describe('SplitArea', () => {
  it('lays the tiles out filling the area exactly, with the gap between them and nothing left over', () => {
    render(<Harness ids={['x', 'y']} />)
    expect(px(tile('x'), 'left')).toBe(0)
    expect(px(tile('x'), 'width') + px(tile('y'), 'width') + 8).toBe(1000)
    expect(px(tile('x'), 'height')).toBe(600)
    expect(px(tile('y'), 'left')).toBe(px(tile('x'), 'width') + 8)
  })

  it('gives a lone tile the whole area and no divider', () => {
    render(<Harness ids={['x']} />)
    expect(px(tile('x'), 'width')).toBe(1000)
    expect(px(tile('x'), 'height')).toBe(600)
    expect(document.querySelector('[role="separator"]')).toBeNull()
  })

  it('has a title bar on each tile (its icon and name) to drag it by, with no minimize button, and the body is its own', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /^Minimize/ })).toBeNull()
    for (const id of ['x', 'y', 'z']) {
      expect(handle(id).textContent).toContain(id.toUpperCase())
      expect(tile(id).querySelector('.wrTabTileBody')?.textContent).toContain(`${id} body`)
    }
  })

  it('resizes only the two tiles a divider separates, and leaves the area filled', () => {
    render(<Harness ids={['x', 'y']} />)
    const before = px(tile('x'), 'width')
    const divider = document.querySelector('[role="separator"][aria-orientation="vertical"]') as HTMLElement
    fireEvent(divider, pointerEvent('pointerdown', { clientX: 500, clientY: 300 }))
    fireEvent(divider, pointerEvent('pointermove', { clientX: 700, clientY: 300 }))
    fireEvent(divider, pointerEvent('pointerup', {}))
    expect(px(tile('x'), 'width')).toBeGreaterThan(before)
    expect(px(tile('x'), 'width') + px(tile('y'), 'width') + 8).toBe(1000)
  })

  it('resizes with the keyboard on a focused divider, and remembers the size across a remount', () => {
    const first = render(<Harness ids={['x', 'y']} />)
    const divider = document.querySelector('[role="separator"]') as HTMLElement
    const before = px(tile('x'), 'width')
    divider.focus()
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    const after = px(tile('x'), 'width')
    expect(after).toBeGreaterThan(before)
    first.unmount()
    render(<Harness ids={['x', 'y']} />)
    expect(px(tile('x'), 'width')).toBe(after)
  })

  it('swaps two tiles dragged by a title bar onto the middle of another, each area keeping its size, and remembers it', () => {
    const first = render(<Harness ids={['x', 'y']} />)
    const resizer = document.querySelector('[role="separator"]') as HTMLElement
    fireEvent.keyDown(resizer, { key: 'ArrowRight' }) // make the two unequal
    const xWidth = px(tile('x'), 'width')
    const yRect = { left: px(tile('y'), 'left'), width: px(tile('y'), 'width') }
    dragTile(handle('x'), { x: 10, y: 10 }, { x: yRect.left + yRect.width / 2, y: 300 })
    expect(px(tile('x'), 'left')).toBe(yRect.left)
    expect(px(tile('x'), 'width')).toBe(yRect.width)
    expect(px(tile('y'), 'width')).toBe(xWidth)
    first.unmount()
    render(<Harness ids={['x', 'y']} />)
    expect(px(tile('y'), 'width')).toBe(xWidth)
  })

  it('keeps what is typed in a tile when it moves (the same element, moved)', async () => {
    const user = userEvent.setup()
    render(<Harness ids={['x', 'y']} />)
    const input = screen.getByLabelText('x input') as HTMLInputElement
    await user.type(input, 'hello')
    dragTile(handle('x'), { x: 10, y: 10 }, { x: 750, y: 300 })
    expect(screen.getByLabelText('x input')).toBe(input)
    expect(input.value).toBe('hello')
  })

  it('does not start a drag from a control in the title bar', () => {
    render(<SplitArea gridId="ctrl" tiles={tiles(['x', 'y']).map(t => ({ ...t, maximizable: true }))} />)
    const before = px(tile('x'), 'left')
    const held = holdTile(screen.getByRole('button', { name: 'Maximize X' }), { x: 10, y: 10 })
    held.moveTo(750, 300)
    held.drop()
    expect(px(tile('x'), 'left')).toBe(before)
    expect(document.querySelector('.gtGap')).toBeNull()
  })

  it('slides the others aside to open a highlighted gap while a tile is dragged, and puts them back if it is let go (Escape)', () => {
    render(<Harness />)
    const yWidth = px(tile('y'), 'width')
    expect(document.querySelector('.gtGap')).toBeNull()
    const held = holdTile(handle('z'), { x: 700, y: 20 })
    held.moveTo(480, 148) // the right-middle cell of x
    expect(document.querySelector('.gtGap')).toBeTruthy()
    expect(px(tile('y'), 'width')).toBeGreaterThan(yWidth) // z left its column, so the left one widens
    const gap = document.querySelector('.gtGap') as HTMLElement
    expect(parseFloat(gap.style.left)).toBeGreaterThan(px(tile('x'), 'left'))
    expect(tile('z').className).toContain('gtTile--lifted')
    held.cancel()
    expect(document.querySelector('.gtGap')).toBeNull()
    expect(px(tile('y'), 'width')).toBe(yWidth)
    expect(tile('z').className).not.toContain('gtTile--lifted')
  })

  it('puts a tile beside another when it is dropped on the middle of that tile\'s right edge', () => {
    render(<Harness />)
    dragTile(handle('z'), { x: 700, y: 20 }, { x: 480, y: 148 })
    // Z now sits to the right of X, the two sharing X's former row.
    expect(px(tile('z'), 'left')).toBeGreaterThan(px(tile('x'), 'left'))
    expect(px(tile('z'), 'top')).toBe(px(tile('x'), 'top'))
    expect(px(tile('z'), 'height')).toBe(px(tile('x'), 'height'))
  })

  it('puts a tile above another on its top middle cell', () => {
    render(<Harness />)
    dragTile(handle('z'), { x: 700, y: 20 }, { x: 248, y: 330 }) // y's top middle (y: top 304, height 296)
    expect(px(tile('z'), 'top')).toBeLessThan(px(tile('y'), 'top'))
    expect(px(tile('z'), 'left')).toBe(px(tile('y'), 'left'))
    expect(px(tile('z'), 'top')).toBeGreaterThan(px(tile('x'), 'top'))
  })

  it('makes a corner a new column across the whole area when the tile touches that outer edge', () => {
    render(<Harness />)
    dragTile(handle('z'), { x: 700, y: 20 }, { x: 5, y: 25 }) // x's top-left corner, nearer its left edge
    expect(px(tile('z'), 'left')).toBe(0)
    expect(px(tile('z'), 'top')).toBe(0)
    expect(px(tile('z'), 'height')).toBe(600)
    expect(px(tile('x'), 'left')).toBeGreaterThan(0)
  })

  it('makes a corner a new row across the whole area at the top when the pointer is nearer the top edge', () => {
    render(<Harness />)
    dragTile(handle('z'), { x: 700, y: 20 }, { x: 40, y: 3 })
    expect(px(tile('z'), 'top')).toBe(0)
    expect(px(tile('z'), 'width')).toBe(1000)
    expect(px(tile('x'), 'top')).toBeGreaterThan(0)
  })

  it('falls back to the edge next to the tile when a corner tile does not touch the outer edge', () => {
    render(<Harness />)
    // x's bottom-right corner, nearer its right: x touches neither the right nor the bottom of the area.
    dragTile(handle('z'), { x: 700, y: 20 }, { x: 494, y: 250 })
    expect(px(tile('z'), 'left')).toBeGreaterThan(px(tile('x'), 'left'))
    expect(px(tile('z'), 'height')).toBeLessThan(600)
  })

  it('drops a tile onto a divider to wedge it in as a new column or row, instead of swapping', () => {
    render(<Harness />)
    const divider = document.querySelector('[role="separator"][aria-orientation="horizontal"]') as HTMLElement
    const held = holdTile(handle('z'), { x: 700, y: 20 })
    held.moveTo(parseFloat(divider.style.left) + 100, parseFloat(divider.style.top) + 4)
    expect(document.querySelector('.gtGap')).toBeTruthy()
    held.drop()
    // Z is wedged directly between X and Y, in the column they shared.
    expect(px(tile('x'), 'top')).toBeLessThan(px(tile('z'), 'top'))
    expect(px(tile('z'), 'top')).toBeLessThan(px(tile('y'), 'top'))
  })

  it('does not move a tile dropped on itself, or outside every tile', () => {
    render(<Harness />)
    const places = () => ['x', 'y', 'z'].map(id => [px(tile(id), 'left'), px(tile(id), 'top')])
    const before = places()
    dragTile(handle('z'), { x: 700, y: 20 }, { x: 750, y: 300 })
    dragTile(handle('x'), { x: 10, y: 10 }, { x: -50, y: -50 })
    expect(places()).toEqual(before)
  })

  it('moves focus with the arrow keys between title bars, and no longer swaps tiles with Alt+arrows', async () => {
    const user = userEvent.setup()
    render(<Harness ids={['x', 'y']} />)
    handle('x').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(handle('y'))
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(px(tile('x'), 'left')).toBe(0)
    expect(document.activeElement).toBe(handle('y'))
  })

  it('turns a tile off with its icon in the rail: it gives up its room but keeps its slot, and is remembered', () => {
    const first = render(<Harness ids={['x', 'y']} bar />)
    fireEvent.click(screen.getByRole('button', { name: 'X', pressed: true }))
    expect(tile('x')).toBeNull()
    expect(px(tile('y'), 'width')).toBe(1000)
    expect(document.querySelector('[role="separator"]')).toBeNull()
    first.unmount()
    render(<Harness ids={['x', 'y']} bar />)
    expect(tile('x')).toBeNull()
  })

  it('shows a tab bar with an icon per tile, pressed while open: pressing one minimizes or restores the tile in its old slot', () => {
    render(<Harness ids={['x', 'y']} bar />)
    expect(screen.getByRole('toolbar').querySelectorAll('button')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'X', pressed: true }))
    expect(tile('x')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'X', pressed: false }))
    expect(px(tile('x'), 'left')).toBe(0)
    expect(px(tile('y'), 'left')).toBeGreaterThan(0)
  })

  it('minimizes a tile dropped on the tab bar, and a dragged-out icon puts it back where it is dropped', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const bar = this.hasAttribute('data-tile-bar')
      return { width: 1000, height: bar ? 40 : 0, top: bar ? -50 : 0, left: 0, right: 1000, bottom: bar ? -10 : 0, x: 0, y: bar ? -50 : 0, toJSON: () => ({}) }
    })
    render(<Harness ids={['x', 'y']} bar />)
    const held = holdTile(handle('x'), { x: 10, y: 10 })
    held.moveTo(500, -30)
    expect(screen.getByRole('toolbar').className).toContain('tileTabBar--drop')
    expect(px(tile('y'), 'width')).toBe(1000) // the other has already taken its room
    held.drop()
    expect(tile('x')).toBeNull()
    expect(screen.getByRole('toolbar').className).not.toContain('tileTabBar--drop')
    // The icon is dragged back into the layout: onto the right edge of y.
    dragTile(screen.getByRole('button', { name: 'X', pressed: false }), { x: 10, y: -30 }, { x: 990, y: 300 })
    expect(tile('x')).toBeTruthy()
    expect(px(tile('x'), 'left')).toBeGreaterThan(px(tile('y'), 'left'))
    expect(screen.getByRole('button', { name: 'X' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('reorders the tab-bar icons by dragging one along the bar, and remembers the order', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = ['x', 'y', 'z'].indexOf(this.dataset.tabId ?? '')
      if (index >= 0) return { width: 30, height: 30, top: -45, left: index * 40, right: index * 40 + 30, bottom: -15, x: index * 40, y: -45, toJSON: () => ({}) }
      const bar = this.hasAttribute('data-tile-bar')
      return { width: 1000, height: bar ? 40 : 0, top: bar ? -50 : 0, left: 0, right: 1000, bottom: bar ? -10 : 0, x: 0, y: bar ? -50 : 0, toJSON: () => ({}) }
    })
    const first = render(<Harness bar />)
    const order = () => Array.from(screen.getByRole('toolbar').querySelectorAll('button')).map(b => b.getAttribute('aria-label'))
    expect(order()).toEqual(['X', 'Y', 'Z'])
    const held = holdTile(screen.getByRole('button', { name: 'Z' }), { x: 90, y: -30 })
    held.moveTo(5, -30) // the left half of x
    expect(screen.getByRole('button', { name: 'X' }).className).toContain('tileTabBtn--before')
    held.drop()
    expect(order()).toEqual(['Z', 'X', 'Y'])
    expect(tile('z')).toBeTruthy() // moving an icon does not change the tiles
    first.unmount()
    render(<Harness bar />)
    expect(order()).toEqual(['Z', 'X', 'Y'])
  })

  it('lets a console decide itself which tiles are minimized, and tells it when the user minimizes or restores one', () => {
    const changed = vi.fn()
    render(<SplitArea gridId="ctl" bar tiles={tiles(['x', 'y'])} minimized={['y']} onMinimizedChange={changed} />)
    expect(tile('y')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'X', pressed: true }))
    expect(changed).toHaveBeenCalledWith('x', true)
    expect(tile('x')).toBeTruthy() // the console has not (yet) changed its list
  })

  it('maximizes a tile that asks for it to fill the area, and puts it back', () => {
    render(<SplitArea gridId="max" tiles={tiles(['x', 'y']).map(t => ({ ...t, maximizable: true }))} />)
    fireEvent.click(screen.getByRole('button', { name: 'Maximize X' }))
    expect(tile('y')).toBeNull()
    expect(px(tile('x'), 'width')).toBe(1000)
    fireEvent.click(screen.getByRole('button', { name: 'Restore X' }))
    expect(tile('y')).toBeTruthy()
  })

  it('grafts a tile that opens onto the layout and prunes one that closes, keeping the others where they were', async () => {
    const user = userEvent.setup()
    function Toggling() {
      const [ids, setIds] = useState(['x', 'y'])
      return <><button type="button" onClick={() => setIds(['x', 'y', 'z'])}>open z</button><button type="button" onClick={() => setIds(['y', 'z'])}>close x</button><Harness ids={ids} /></>
    }
    render(<Toggling />)
    await user.click(screen.getByRole('button', { name: 'open z' }))
    expect(tile('z')).toBeTruthy()
    expect(px(tile('z'), 'width')).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'close x' }))
    expect(tile('x')).toBeNull()
    expect(px(tile('y'), 'width') + px(tile('z'), 'width') + 8).toBe(1000)
  })

  it('keeps a tile that opened after the first render when another is moved (a move is made against the latest tiles)', async () => {
    const user = userEvent.setup()
    function Growing() {
      const [ids, setIds] = useState(['x', 'y'])
      return <><button type="button" onClick={() => setIds(['x', 'y', 'z'])}>open z</button><SplitArea gridId="growing" tiles={tiles(ids)} defaultTree={columnsTree(ids)} /></>
    }
    render(<Growing />)
    await user.click(screen.getByRole('button', { name: 'open z' }))
    dragTile(handle('x'), { x: 10, y: 10 }, { x: 750, y: 300 })
    // X and Y swapped; Z stays under the one on the left (it was in X's column) rather than being regrafted elsewhere.
    expect(px(tile('y'), 'left')).toBe(0)
    expect(px(tile('z'), 'left')).toBe(0)
    expect(px(tile('z'), 'top')).toBeGreaterThan(px(tile('y'), 'top'))
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(2) // three tiles, two dividers
  })

  it('starts from a given default layout (a tree), until a tile is moved', () => {
    render(<SplitArea gridId="seeded" tiles={tiles()} defaultTree={{ dir: 'col', ratio: 0.2, a: { id: 'x' }, b: { dir: 'col', ratio: 0.25, a: { id: 'y' }, b: { id: 'z' } } }} />)
    expect(px(tile('x'), 'top')).toBe(0)
    expect(px(tile('x'), 'width')).toBe(1000)
    expect(px(tile('x'), 'height')).toBeLessThan(px(tile('z'), 'height'))
    expect(px(tile('y'), 'top')).toBeLessThan(px(tile('z'), 'top'))
  })

  it('can start with the tiles in two alternating columns, each column sharing its height evenly', () => {
    render(<SplitArea gridId="cols" tiles={tiles(['x', 'y', 'z', 'w'])} defaultTree={columnsTree(['x', 'y', 'z', 'w'])} />)
    expect(px(tile('x'), 'left')).toBe(0)
    expect(px(tile('z'), 'left')).toBe(0)
    expect(px(tile('y'), 'left')).toBe(px(tile('w'), 'left'))
    expect(px(tile('y'), 'left')).toBeGreaterThan(0)
    expect(px(tile('x'), 'top')).toBe(px(tile('y'), 'top'))
    expect(px(tile('z'), 'top')).toBeGreaterThan(px(tile('x'), 'top'))
    expect(px(tile('x'), 'height')).toBe(px(tile('z'), 'height'))
  })

  it('stacks the tiles in one column when the area is narrow', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 600, top: 0, left: 0, right: 300, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    render(<Harness />)
    expect(['x', 'y', 'z'].every(id => px(tile(id), 'left') === 0 && px(tile(id), 'width') === 300)).toBe(true)
  })
})
