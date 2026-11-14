import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { enableSymmetry } from './engine/symmetry'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { clearClipboard } from './shapeClipboard'

// Editing keys in the shape editor (T2): Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste the selected shape (as many times as wanted, under the pointer, into another model too); Delete
// removes the selected shape; Ctrl + click removes a point or joins a segment's two points; a right-click on a point opens the point form.
vi.setConfig({ testTimeout: 30000 })
afterEach(() => clearClipboard())

const square = (id: string, x: number, y: number, w: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + w], [x, y + w]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })), ...extra,
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
function model(shapes: ModelShape[], name = 'Keys'): ModelContent {
  let c = addGroup(blank(name), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  for (const s of shapes) c = addShape(c, 'o', s)
  return c
}
async function open(c: ModelContent) {
  modelsBackend([draftEntry('m', c)])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}

const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave', at: { x?: number; y?: number; button?: number; ctrlKey?: boolean } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0, ctrlKey: at.ctrlKey ?? false }))
}
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const select = (id: string, wx: number, wy: number) => { pointer(pathOf(id), 'pointerdown', pixelOf(wx, wy)); pointer(canvas(), 'pointerup') }
const painted = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape')!)
const dots = () => Array.from(canvas().querySelectorAll('.cmPoint'))
const at = (el: Element) => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]
const key = (k: string, extra: { ctrlKey?: boolean } = { ctrlKey: true }) => fireEvent.keyDown(canvas(), { key: k, ...extra })
const centreOf = (el: Element) => {
  const nums = (el.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

describe('copy, cut and paste', () => {
  it('pastes the copied shape under the pointer as many times as asked', async () => {
    await open(model([square('a', 60, 60, 40)]))
    select('a', 70, 70)
    key('c')
    pointer(canvas(), 'pointermove', pixelOf(150, 200))
    key('v')
    expect(painted()).toHaveLength(2)
    const first = painted().find(id => id !== 'a')!
    const [cx, cy] = centreOf(pathOf(first))
    expect(cx).toBeCloseTo(150, 0)
    expect(cy).toBeCloseTo(200, 0)
    pointer(canvas(), 'pointermove', pixelOf(40, 220))
    key('v')
    expect(painted()).toHaveLength(3)
  })

  it('pastes a little right of and below the copied shape when the pointer is away from the canvas, without its links', async () => {
    const a = square('a', 60, 60, 40)
    await open(model([a, square('b', 60, 60, 40, { pts: a.pts.map((p, i) => ({ ...p, bind: weld('a', i) })) })]))
    select('b', 90, 90)
    key('c')
    pointer(canvas(), 'pointerleave')
    key('v')
    const made = painted().find(id => id !== 'a' && id !== 'b')!
    const [cx, cy] = centreOf(pathOf(made))
    expect(cx).toBeCloseTo(90, 0)
    expect(cy).toBeCloseTo(90, 0)
    // the copy follows nothing, so it is not a stretch shape
    expect(screen.queryByText('Stretch: every point follows a shape')).toBeNull()
  })

  it('cuts the shape, and pastes it back', async () => {
    await open(model([square('a', 60, 60, 40), square('b', 130, 60, 20)]))
    select('a', 70, 70)
    key('x')
    expect(painted()).toEqual(['b'])
    pointer(canvas(), 'pointermove', pixelOf(80, 80))
    key('v')
    expect(painted()).toHaveLength(2)
  })

  it('pastes into another model', async () => {
    await open(model([square('a', 60, 60, 40)]))
    select('a', 70, 70)
    key('c')
    cleanup()
    await open(model([square('z', 20, 20, 30)], 'Other'))
    pointer(canvas(), 'pointermove', pixelOf(120, 120))
    key('v')
    expect(painted()).toHaveLength(2)
  })
})

describe('Delete and Ctrl + click', () => {
  it('deletes the selected shape with Delete when no point is selected', async () => {
    await open(model([square('a', 60, 60, 40), square('b', 130, 60, 20)]))
    select('a', 70, 70)
    key('Delete', {})
    expect(painted()).toEqual(['b'])
  })

  it('removes a point with Ctrl + click, and joins a segment\'s two points at its middle', async () => {
    await open(model([square('a', 60, 60, 40), square('b', 130, 60, 40)]))
    select('a', 70, 70)
    const corner = dots().find(d => at(d)[0] === 100 && at(d)[1] === 100)!
    pointer(corner, 'pointerdown', { ...pixelOf(100, 100), ctrlKey: true })
    pointer(canvas(), 'pointerup')
    expect(dots()).toHaveLength(3)
    // b's top side, from (130, 60) to (170, 60), joined: one point at (150, 60)
    pointer(pathOf('b'), 'pointerdown', pixelOf(150, 90))
    pointer(canvas(), 'pointerup')
    pointer(canvas(), 'pointermove', pixelOf(150, 60))
    pointer(canvas(), 'pointerdown', { ...pixelOf(150, 60), ctrlKey: true })
    pointer(canvas(), 'pointerup')
    expect(dots()).toHaveLength(3)
    expect(dots().map(at)).toContainEqual([150, 60])
  })

  it('joins a segment of a symmetric shape in every copy', async () => {
    const r = enableSymmetry(square('s', 60, 100, 40), { a: 0, n: 2 }, 1, 60)
    if (!r.ok) throw new Error(r.reason)
    await open(model([r.shape]))
    select('s', 70, 110)
    expect(dots()).toHaveLength(8)
    // the segment from the middle of the top side (80, 100) to the top right corner (100, 100)
    pointer(canvas(), 'pointermove', pixelOf(90, 100))
    pointer(canvas(), 'pointerdown', { ...pixelOf(90, 100), ctrlKey: true })
    pointer(canvas(), 'pointerup')
    expect(dots()).toHaveLength(4)
  })
})

describe('the point form', () => {
  it('opens on a right-click on a point and changes its type', async () => {
    const user = await open(model([square('a', 60, 60, 40)]))
    select('a', 70, 70)
    const corner = dots().find(d => at(d)[0] === 100 && at(d)[1] === 100)!
    pointer(corner, 'pointerdown', { ...pixelOf(100, 100), button: 2 })
    pointer(canvas(), 'pointerup', { ...pixelOf(100, 100), button: 2 })
    const form = within(screen.getByRole('dialog', { name: 'Point type' }))
    expect(form.getByRole('button', { name: 'Sharp' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(form.getByRole('button', { name: 'Curve' }))
    expect(screen.queryByRole('dialog', { name: 'Point type' })).toBeNull()
    const modes = within(screen.getByRole('group', { name: /^Mode of point/ }))
    expect(modes.getByRole('button', { name: 'Curve' })).toHaveAttribute('aria-pressed', 'true')
  })
})
