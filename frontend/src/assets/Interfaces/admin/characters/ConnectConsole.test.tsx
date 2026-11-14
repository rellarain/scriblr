import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Connections in the shape editor (S5): a point dragged over a point or a segment of another shape turns the alert colour and is connected where it is dropped; a welded
// point drags the point it is welded to, a locked one slides along its segment, two welds side by side share a segment, a right-drag pulls a point free, and a connection
// and a shared segment can be named.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// A is 60..100 across, B 120..160, both 100..140 down.
function two(): ModelContent {
  let c = addGroup(blank('Two'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'oA', name: 'A part', layer: 'body', shapes: [] })
  c = addShape(c, 'oA', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
  c = addObject(c, 'g', { id: 'oB', name: 'B part', layer: 'body', shapes: [] })
  return addShape(c, 'oB', sharp('b', [[120, 100], [160, 100], [160, 140], [120, 140]]))
}

async function open() {
  modelsBackend([draftEntry('m', two())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}

const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const select = (id: string, wx: number, wy: number) => { pointer(pathOf(id), 'pointerdown', pixelOf(wx, wy)); pointer(canvas(), 'pointerup') }
const dots = () => Array.from(canvas().querySelectorAll('.cmPoint'))
const at = (el: Element) => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]
// press point i of the selected shape where it is drawn and drag it to (wx, wy)
function dragPoint(i: number, wx: number, wy: number, opts: { button?: number; release?: boolean } = {}) {
  const dot = dots()[i], [x, y] = at(dot)
  pointer(dot, 'pointerdown', { ...pixelOf(x, y), button: opts.button ?? 0 })
  pointer(canvas(), 'pointermove', { ...pixelOf(wx, wy), button: opts.button ?? 0 })
  if (opts.release !== false) pointer(canvas(), 'pointerup', { ...pixelOf(wx, wy), button: opts.button ?? 0 })
}
const connections = () => screen.queryByRole('group', { name: 'Connections' })

describe('dropping a point on another shape', () => {
  it('shows the point in the alert colour over a point it can weld to, and welds it there when dropped', async () => {
    await open()
    select('a', 70, 110)
    dragPoint(1, 120.4, 100.3, { release: false })
    expect(dots()[1]).toHaveClass('cmPoint--connect')
    expect(canvas().querySelector('[data-connect="point"]')).not.toBeNull()
    pointer(canvas(), 'pointerup', pixelOf(120.4, 100.3))
    expect(canvas().querySelector('[data-connect]')).toBeNull()
    expect(at(dots()[1])).toEqual([120, 100])
    expect(within(connections()!).getByText('Welded to point 1 of b shape')).toBeInTheDocument()
  })

  it('moves both points when either is dragged afterwards', async () => {
    await open()
    select('a', 70, 110)
    dragPoint(1, 120.4, 100.3)
    // dragging A's welded point moves B's point under it
    dragPoint(1, 126, 94)
    expect(at(dots()[1])).toEqual([126, 94])
    expect(pathOf('b').getAttribute('d')).toMatch(/^M126 94/)
  })

  it('locks a point onto a segment, and it then slides along that segment only', async () => {
    await open()
    select('a', 70, 110)
    dragPoint(2, 120.3, 121)
    expect(canvas().querySelector('[data-connect]')).toBeNull()
    expect(within(connections()!).getByText('On a segment of b shape')).toBeInTheDocument()
    expect(at(dots()[2])[0]).toBe(120)
    dragPoint(2, 131, 108)
    const [x, y] = at(dots()[2])
    expect(x).toBe(120)
    expect(y).toBeCloseTo(108, 0)
  })
})

describe('two welds side by side', () => {
  async function shared() {
    const user = await open()
    select('a', 70, 110)
    dragPoint(1, 120.3, 100.3)
    dragPoint(2, 120.3, 139.7)
    return user
  }

  it('share a segment, which the panel names and a right-click curves in both shapes', async () => {
    const user = await shared()
    // select A's segment from point 2 to point 3, now from (120, 100) to (120, 140)
    pointer(canvas(), 'pointermove', pixelOf(120, 120))
    pointer(canvas(), 'pointerdown', pixelOf(120, 120))
    pointer(canvas(), 'pointerup', pixelOf(120, 120))
    const panel = within(connections()!)
    expect(panel.getByText('Shared with b shape')).toBeInTheDocument()
    await user.type(panel.getByRole('textbox', { name: 'Name of the shared segment' }), 'Seam')
    expect(canvas().querySelector('[data-segment-name="1"] title')!.textContent).toBe('Seam')
    pointer(canvas(), 'pointerdown', { ...pixelOf(120, 120), button: 2 })
    pointer(canvas(), 'pointerup', { ...pixelOf(120, 120), button: 2 })
    expect(pathOf('b').getAttribute('d')).toContain('C')
    expect(pathOf('a').getAttribute('d')).toContain('C')
  })
})

describe('a right-drag on a connected point', () => {
  it('pulls it free and drags it, the other shape staying where it was', async () => {
    await open()
    select('a', 70, 110)
    dragPoint(1, 120.4, 100.3)
    expect(connections()).not.toBeNull()
    const before = pathOf('b').getAttribute('d')
    dragPoint(1, 110, 90, { button: 2 })
    expect(connections()).toBeNull()
    expect(at(dots()[1])).toEqual([110, 90])
    expect(pathOf('b').getAttribute('d')).toBe(before)
  })
})

describe('the Connections section', () => {
  it('names a connection, shown on the point when hovered, and Disconnect cuts it', async () => {
    const user = await open()
    select('a', 70, 110)
    dragPoint(1, 120.4, 100.3)
    const panel = within(connections()!)
    await user.type(panel.getByRole('textbox', { name: 'Name of the connection' }), 'Hinge')
    expect(dots()[1].querySelector('title')!.textContent).toBe('Hinge')
    await user.click(panel.getByRole('button', { name: 'Disconnect' }))
    expect(connections()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(connections()).not.toBeNull()
  })
})
