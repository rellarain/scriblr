import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The shape editor's gestures (S2): a click on another shape's point selects that shape and the point, the arrow keys move a selected segment's two ends, a dragged
// point lands on the grid (Snap to grid) or on another point of its shape (Snap), and Ctrl with the wheel zooms about the pointer.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// A is 60..100 across and 100..140 down; B is 80..120 across and 120..160 down.
function squares(): ModelContent {
  let c = addGroup(blank('Squares'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'oA', name: 'A part', layer: 'body', shapes: [] })
  c = addShape(c, 'oA', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
  c = addObject(c, 'g', { id: 'oB', name: 'B part', layer: 'body', shapes: [] })
  return addShape(c, 'oB', sharp('b', [[80, 120], [120, 120], [120, 160], [80, 160]]))
}

async function open() {
  modelsBackend([draftEntry('a', squares())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return { user }
}

const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
const worldOf = (px: number, py: number) => { const [x, y, w, h] = viewBox(); return [x + (px / 704) * w, y + (py / 616) * h] }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const select = (id: string, wx: number, wy: number) => { pointer(pathOf(id), 'pointerdown', pixelOf(wx, wy)); pointer(canvas(), 'pointerup') }
const dots = () => Array.from(canvas().querySelectorAll('.cmPoint'))
const at = (el: Element) => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]

describe('the shape editor on the canvas', () => {
  it('selects another shape and its point with one click on the point', async () => {
    await open()
    select('a', 70, 110)
    pointer(canvas(), 'pointermove', pixelOf(120, 160))
    pointer(canvas(), 'pointerdown', pixelOf(120, 160))
    pointer(canvas(), 'pointerup')
    expect(canvas().querySelector('[data-ring="b"]')).not.toBeNull()
    const on = dots().find(d => d.classList.contains('cmPoint--sel'))!
    expect(at(on)).toEqual([120, 160])
  })

  it('moves both ends of a selected segment with the arrow keys', async () => {
    await open()
    select('a', 70, 110)
    pointer(canvas(), 'pointermove', pixelOf(80, 100))
    pointer(canvas(), 'pointerdown', pixelOf(80, 100))
    pointer(canvas(), 'pointerup')
    canvas().focus()
    fireEvent.keyDown(canvas(), { key: 'ArrowUp', shiftKey: true })
    expect(at(dots()[0])).toEqual([60, 95])
    expect(at(dots()[1])).toEqual([100, 95])
    expect(at(dots()[2])).toEqual([100, 140])
  })

  it('puts a dragged point on the grid with Snap to grid', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Snap to grid' }))
    select('a', 70, 110)
    const from = pixelOf(60, 100)
    pointer(dots()[0], 'pointerdown', from)
    pointer(canvas(), 'pointermove', pixelOf(63.3, 97.2))
    pointer(canvas(), 'pointerup')
    const [x, y] = at(dots()[0])
    // the grid is a line every unit or half unit at this zoom: the point lands on one
    expect(Math.abs(x * 2 - Math.round(x * 2))).toBeLessThan(1e-6)
    expect(Math.abs(y * 2 - Math.round(y * 2))).toBeLessThan(1e-6)
    expect(x).not.toBe(60)
  })

  it('pulls a dragged point onto another point of the same shape with Snap', async () => {
    await open()
    select('a', 70, 110)
    pointer(dots()[0], 'pointerdown', pixelOf(60, 100))
    pointer(canvas(), 'pointermove', pixelOf(99.6, 100.3))
    pointer(canvas(), 'pointerup')
    expect(at(dots()[0])).toEqual([100, 100])
  })

  it('zooms with Ctrl and the wheel over the canvas, keeping the point under the pointer still', async () => {
    await open()
    const zoom = () => Number((screen.getByRole('slider', { name: 'Zoom' }) as HTMLInputElement).value)
    const before = zoom()
    const spot = { x: 500, y: 200 }
    const [wx0, wy0] = worldOf(spot.x, spot.y)
    fireEvent.wheel(canvas(), { deltaY: 120, ctrlKey: true, clientX: spot.x, clientY: spot.y })
    expect(zoom()).not.toBe(before)
    const [wx1, wy1] = worldOf(spot.x, spot.y)
    expect(wx1).toBeCloseTo(wx0, 3)
    expect(wy1).toBeCloseTo(wy0, 3)
    // without Ctrl the wheel leaves the zoom alone
    const now = zoom()
    fireEvent.wheel(canvas(), { deltaY: 120, clientX: spot.x, clientY: spot.y })
    expect(zoom()).toBe(now)
  })
})
