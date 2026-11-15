import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { enableSymmetry } from './engine/symmetry'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The shape editor's drags (Z1): a point dragged over another shape shows that shape's outline and points, lands on a point it comes close to and turns the alert colour; a drag
// from a segment adds a point there, a drag on a shared segment moves it (along the line of symmetry of a symmetric shape), a double-click adds a point only on a shared segment;
// a drag on the empty grid draws a rectangle (Shift: a square).
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
function model(shapes: ModelShape[]): ModelContent {
  let c = addGroup(blank('Drags'), newGroup('g', 'Group'))
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
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number; shiftKey?: boolean } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0, shiftKey: at.shiftKey ?? false }))
}
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const click = (el: Element, at: [number, number]) => { pointer(el, 'pointerdown', pixelOf(...at)); pointer(canvas(), 'pointerup', pixelOf(...at)) }
const dots = () => Array.from(canvas().querySelectorAll('.cmPoint'))
const dotAt = (x: number, y: number) => dots().find(d => Math.abs(Number(d.getAttribute('cx')) - x) < 0.5 && Math.abs(Number(d.getAttribute('cy')) - y) < 0.5)
const pointsOf = (id: string) => {
  const nums = (pathOf(id).getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
  return Array.from({ length: nums.length / 2 }, (_, k) => [nums[2 * k], nums[2 * k + 1]])
}
const painted = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape'))

describe('a dragged point', () => {
  it('shows the outline and points of the shape it is over, lands on a point and turns the alert colour there', async () => {
    await open(model([box('a', 40, 40, 30, 30), box('b', 100, 40, 40, 40)]))
    click(pathOf('a'), [55, 55])
    pointer(dotAt(70, 40)!, 'pointerdown', pixelOf(70, 40))
    // over the middle of b: its four points show
    pointer(canvas(), 'pointermove', pixelOf(90, 50))
    pointer(canvas(), 'pointermove', pixelOf(120, 60))
    expect(canvas().querySelector('[data-hover="b"]')).not.toBeNull()
    expect(canvas().querySelectorAll('[data-hover-point]')).toHaveLength(4)
    // close to b's top left corner: the point is drawn on it, in the alert colour
    pointer(canvas(), 'pointermove', pixelOf(101.5, 41.5))
    const dragged = canvas().querySelector('.cmPoint--connect')!
    expect(Number(dragged.getAttribute('cx'))).toBeCloseTo(100, 1)
    expect(Number(dragged.getAttribute('cy'))).toBeCloseTo(40, 1)
    expect(dragged.classList.contains('cmPoint--hover')).toBe(false)
    pointer(canvas(), 'pointerup', pixelOf(101.5, 41.5))
    expect(canvas().querySelectorAll('[data-hover-point]')).toHaveLength(0)
  })
})

describe('a segment', () => {
  it('gets a new point from a drag, and is selected by a click', async () => {
    await open(model([box('a', 40, 40, 40, 40)]))
    click(pathOf('a'), [60, 60])
    // a click on the top segment selects it
    click(canvas(), [60, 40])
    expect(canvas().querySelector('.cmSeg--sel')).not.toBeNull()
    // a drag from it adds a point there and takes it along
    pointer(canvas(), 'pointerdown', pixelOf(60, 40))
    pointer(canvas(), 'pointermove', pixelOf(60, 34))
    pointer(canvas(), 'pointermove', pixelOf(60, 25))
    pointer(canvas(), 'pointerup', pixelOf(60, 25))
    expect(dots()).toHaveLength(5)
    expect(dotAt(60, 25)).toBeDefined()
  })

  it('is removed with Delete once selected, its two points joined into one', async () => {
    await open(model([box('a', 40, 40, 40, 40)]))
    click(pathOf('a'), [60, 60])
    click(canvas(), [60, 40])
    expect(canvas().querySelector('.cmSeg--sel')).not.toBeNull()
    fireEvent.keyDown(canvas(), { key: 'Delete' })
    expect(dots()).toHaveLength(3)
    // the joined point is at the middle of the segment
    expect(dotAt(60, 40)).toBeDefined()
  })

  it('gets no point from a double-click unless it is shared', async () => {
    await open(model([box('a', 40, 40, 40, 40)]))
    click(pathOf('a'), [60, 60])
    const spot = pixelOf(60, 40)
    fireEvent.doubleClick(canvas(), { clientX: spot.x, clientY: spot.y })
    expect(dots()).toHaveLength(4)
  })

  it('moves when it is shared, both shapes with it', async () => {
    // b's top two corners are welded to a's bottom two: the segment between them is shared
    const b = box('b', 40, 80, 40, 40)
    await open(model([box('a', 40, 40, 40, 40), { ...b, pts: b.pts.map((p, i) => (i === 0 ? { ...p, bind: weld('a', 3) } : i === 1 ? { ...p, bind: weld('a', 2) } : p)) }]))
    click(pathOf('a'), [60, 60])
    pointer(canvas(), 'pointerdown', pixelOf(60, 80))
    pointer(canvas(), 'pointermove', pixelOf(60, 86))
    pointer(canvas(), 'pointermove', pixelOf(70, 95))
    pointer(canvas(), 'pointerup', pixelOf(70, 95))
    const ys = pointsOf('a').map(q => q[1])
    expect(Math.max(...ys)).toBeCloseTo(95, 0)
    expect(Math.min(...pointsOf('b').map(q => q[1]))).toBeCloseTo(95, 0)
  })

  it('moves only along the line of symmetry of a symmetric shape', async () => {
    const made = enableSymmetry(box('chest', 40, 40, 40, 60), { a: 90, n: 1 }, 0, 60)
    if (!made.ok) throw new Error(made.reason)
    const chest = made.shape
    const at = (x: number, y: number) => chest.pts.findIndex(q => Math.abs(q.x - x) < 0.01 && Math.abs(q.y - y) < 0.01)
    const mid = at(60, 100), right = at(80, 100)
    expect(mid).toBeGreaterThanOrEqual(0)
    const belly = box('belly', 60, 100, 20, 30)
    await open(model([chest, { ...belly, pts: belly.pts.map((p, i) => (i === 0 ? { ...p, bind: weld('chest', mid) } : i === 1 ? { ...p, bind: weld('chest', right) } : p)) }]))
    click(pathOf('belly'), [70, 115])
    pointer(canvas(), 'pointerdown', pixelOf(70, 100))
    pointer(canvas(), 'pointermove', pixelOf(75, 105))
    pointer(canvas(), 'pointermove', pixelOf(95, 120))
    pointer(canvas(), 'pointerup', pixelOf(95, 120))
    // the chest's bottom went straight down by 20, both sides of it (the copy follows), and no further across
    const bottom = pointsOf('chest').filter(q => q[1] > 110)
    expect(bottom.map(q => Math.round(q[0])).sort((m, n) => m - n)).toEqual(expect.arrayContaining([40, 60, 80]))
    for (const q of bottom) expect(q[1]).toBeCloseTo(120, 0)
  })
})

describe('a drag on the empty grid', () => {
  it('draws a rectangle, and with Shift a square', async () => {
    await open(model([box('a', 40, 40, 20, 20)]))
    pointer(canvas(), 'pointerdown', pixelOf(120, 120))
    pointer(canvas(), 'pointermove', pixelOf(130, 125))
    pointer(canvas(), 'pointermove', pixelOf(160, 140))
    expect(canvas().querySelector('[data-draw-box]')).not.toBeNull()
    pointer(canvas(), 'pointerup', pixelOf(160, 140))
    expect(canvas().querySelector('[data-draw-box]')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Rectangle')
    const rect = painted().find(id => id !== 'a')!
    const xs = pointsOf(rect).map(q => q[0]), ys = pointsOf(rect).map(q => q[1])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40, 0)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(20, 0)
    // Shift keeps it square
    click(canvas(), [200, 300])
    pointer(canvas(), 'pointerdown', pixelOf(120, 200))
    pointer(canvas(), 'pointermove', { ...pixelOf(130, 205), shiftKey: true })
    pointer(canvas(), 'pointermove', { ...pixelOf(160, 220), shiftKey: true })
    pointer(canvas(), 'pointerup', { ...pixelOf(160, 220), shiftKey: true })
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Square')
  })

  it('unselects when it is a click', async () => {
    await open(model([box('a', 40, 40, 20, 20)]))
    click(pathOf('a'), [50, 50])
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toBeInTheDocument()
    click(canvas(), [150, 150])
    expect(screen.queryByRole('textbox', { name: 'Shape name' })).toBeNull()
  })
})
