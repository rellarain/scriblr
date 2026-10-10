import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { ListIcon, PencilIcon, PlotIcon } from '../../icons'
import SplitArea, { columnsTree, type SplitTile } from './SplitArea'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
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
const dt = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' })
// jsdom has no PointerEvent / DragEvent constructors: build the native events by hand so clientX arrives.
const pointerEvent = (type: string, init: { clientX?: number; clientY?: number }) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, button: 0, ...init })
const dragEvent = (type: string, init: { dataTransfer: unknown; clientX?: number; clientY?: number }) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), init)

function Harness({ ids = ['x', 'y', 'z'], gridId = 'test' }: { ids?: string[]; gridId?: string }) {
  return <SplitArea gridId={gridId} tiles={tiles(ids)} />
}

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

  it('has a title bar on each tile (its icon and name) to drag it by, and the body is its own', () => {
    render(<Harness />)
    for (const id of ['x', 'y', 'z']) {
      expect(handle(id).textContent).toContain(id.toUpperCase())
      expect(handle(id).getAttribute('draggable')).toBe('true')
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

  it('swaps two tiles dragged by a title bar, each area keeping its size, and remembers it', () => {
    const first = render(<Harness ids={['x', 'y']} />)
    const resizer = document.querySelector('[role="separator"]') as HTMLElement
    fireEvent.keyDown(resizer, { key: 'ArrowRight' }) // make the two unequal
    const xWidth = px(tile('x'), 'width')
    const yRect = { left: px(tile('y'), 'left'), width: px(tile('y'), 'width') }
    const data = dt()
    fireEvent.dragStart(handle('x'), { dataTransfer: data })
    fireEvent.dragOver(tile('y'), { dataTransfer: data })
    fireEvent.drop(tile('y'), { dataTransfer: data })
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
    const data = dt()
    fireEvent.dragStart(handle('x'), { dataTransfer: data })
    fireEvent.dragOver(tile('y'), { dataTransfer: data })
    fireEvent.drop(tile('y'), { dataTransfer: data })
    expect(screen.getByLabelText('x input')).toBe(input)
    expect(input.value).toBe('hello')
  })

  it('drops a tile onto the right edge margin of another to split off a new column beside it', () => {
    // A big mock box stands in for the tile's on-screen box, so the edge margin is read against it.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 700, top: 0, left: 0, right: 1200, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
    render(<Harness />)
    const data = dt()
    fireEvent.dragStart(handle('z'), { dataTransfer: data })
    fireEvent(tile('x'), dragEvent('dragover', { dataTransfer: data, clientX: 1080, clientY: 350 }))
    expect(tile('x').className).toContain('wrSplitTile--edge-right')
    fireEvent(tile('x'), dragEvent('drop', { dataTransfer: data, clientX: 1080, clientY: 350 }))
    // Z now sits to the right of X, the two sharing X's former row.
    expect(px(tile('z'), 'left')).toBeGreaterThan(px(tile('x'), 'left'))
    expect(px(tile('z'), 'top')).toBe(px(tile('x'), 'top'))
  })

  it('drops a tile onto a divider to wedge it in as a new column or row, instead of swapping', () => {
    render(<Harness />)
    const divider = document.querySelector('[role="separator"][aria-orientation="horizontal"]') as HTMLElement
    const data = dt()
    fireEvent.dragStart(handle('z'), { dataTransfer: data })
    fireEvent.dragOver(divider, { dataTransfer: data })
    expect(divider.className).toContain('tileDivider--drop')
    fireEvent.drop(divider, { dataTransfer: data })
    // Z is wedged directly between X and Y, in the column they shared.
    expect(px(tile('x'), 'top')).toBeLessThan(px(tile('z'), 'top'))
    expect(px(tile('z'), 'top')).toBeLessThan(px(tile('y'), 'top'))
  })

  it('moves focus with the arrow keys between title bars, and swaps a tile with Alt+arrows', async () => {
    const user = userEvent.setup()
    render(<Harness ids={['x', 'y']} />)
    handle('x').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(handle('y'))
    const yLeft = px(tile('y'), 'left')
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(px(tile('y'), 'left')).toBe(0)
    expect(px(tile('x'), 'left')).toBe(yLeft)
    expect(document.activeElement).toBe(handle('y'))
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
    const data = dt()
    fireEvent.dragStart(handle('x'), { dataTransfer: data })
    fireEvent.dragOver(tile('y'), { dataTransfer: data })
    fireEvent.drop(tile('y'), { dataTransfer: data })
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
