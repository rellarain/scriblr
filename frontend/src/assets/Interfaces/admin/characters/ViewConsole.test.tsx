import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import CharacterModelsConsole from './CharacterModelsConsole'
import { newShape } from './engine/edit'
import { boxOf, build, flatten } from './engine/geometry'
import { gridStep } from './engine/gridSnap'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// The designer's view: it is fitted when the selection changes (or Fit is pressed) and then held, so the grid stays still while something is dragged; holding a drag at an
// edge or a corner pans it; and Fit to screen takes the box round everything that is drawn, with little blank space.
vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A torso (70..130 across, 40..140 down) with an arm beside it (134..148, 50..120): everything drawn lies in 70..148 across and 40..140 down.
function figure(): ModelContent {
  let c = blank('Adult')
  c = addGroup(c, newGroup('gT', 'Torso')); c = addGroup(c, newGroup('gA', 'Arm'))
  c = addObject(c, 'gT', { id: 'oT', name: 'Torso part', layer: 'body', shapes: [] }); c = addShape(c, 'oT', newShape('torso', 'Torso shape', 'rounded', box(70, 40, 60, 100)))
  c = addObject(c, 'gA', { id: 'oA', name: 'Arm part', layer: 'body', shapes: [] }); c = addShape(c, 'oA', newShape('arm', 'Arm shape', 'rounded', box(134, 50, 14, 70)))
  return c
}
const EVERYTHING = box(70, 40, 78, 100)

async function openWith() {
  const backend = modelsBackend([draftEntry('a', figure())])
  const user = userEvent.setup()
  render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  return { user, backend }
}
async function open() {
  return (await openWith()).user
}

const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
// Select the torso (the view fits it), and switch to Move shape.
async function pickTorso(user: ReturnType<typeof userEvent.setup>) {
  pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
  pointer(canvas(), 'pointerup')
  await user.click(screen.getByRole('button', { name: 'Move shape' }))
}

afterEach(() => { vi.useRealTimers() })

describe('the view while something is dragged', () => {
  it('stays still while a shape is dragged, however far it goes', async () => {
    const user = await open()
    await pickTorso(user)
    const before = viewBox()
    const d0 = pathOf('torso').getAttribute('d')
    const from = pixelOf(100, 90)
    pointer(pathOf('torso'), 'pointerdown', from)
    for (const step of [60, 120, 180]) pointer(canvas(), 'pointermove', { x: from.x + step * 0.8, y: from.y + step * 0.4 })
    pointer(canvas(), 'pointerup')
    expect(pathOf('torso').getAttribute('d')).not.toBe(d0)
    expect(viewBox()).toEqual(before)
  })

  it('stays still while a point is dragged', async () => {
    const user = await open()
    pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
    pointer(canvas(), 'pointerup')
    expect(screen.getByRole('button', { name: 'Point editor' })).toHaveAttribute('aria-pressed', 'true')
    const before = viewBox()
    const dot = canvas().querySelector('[data-point="0"]') ?? canvas().querySelector('.cmPoint')
    expect(dot).not.toBeNull()
    const from = pixelOf(70, 40)
    pointer(dot!, 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x - 70, y: from.y - 50 })
    pointer(canvas(), 'pointerup')
    expect(viewBox()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Move shape' }))
  })

  it('leaves the view where it is when what is selected is in view, however it is selected', async () => {
    await open()
    const start = viewBox()
    // a click on a shape, and a click on another one
    pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
    pointer(canvas(), 'pointerup')
    expect(viewBox()).toEqual(start)
    pointer(pathOf('arm'), 'pointerdown', pixelOf(141, 90))
    pointer(canvas(), 'pointerup')
    expect(viewBox()).toEqual(start)
    // a right-click selects a shape, moves it on to Move shape, and then unselects it: none of it moves the view
    for (const id of ['torso', 'torso', 'torso']) {
      pointer(pathOf(id), 'pointerdown', { ...pixelOf(100, 90), button: 2 })
      pointer(canvas(), 'pointerup', { button: 2 })
      expect(viewBox()).toEqual(start)
    }
    expect(screen.getByRole('button', { name: 'Point editor' })).toHaveAttribute('aria-pressed', 'true')
    // a right-click on the grid unselects, and nothing selected leaves the view too
    pointer(pathOf('arm'), 'pointerdown', { ...pixelOf(141, 90), button: 2 })
    pointer(canvas(), 'pointerup', { button: 2 })
    pointer(canvas(), 'pointerdown', { x: 10, y: 10, button: 2 })
    pointer(canvas(), 'pointerup', { button: 2 })
    expect(viewBox()).toEqual(start)
  })

  it('fits a selection that cannot be seen in the view, and then holds that view', async () => {
    const user = await open()
    const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
    // the view is panned right away from the figure (a right-drag), so nothing is in it
    const panAway = () => {
      pointer(canvas(), 'pointerdown', { x: 600, y: 300, button: 2 })
      pointer(canvas(), 'pointermove', { x: 50, y: 300, button: 2 })
      pointer(canvas(), 'pointerup', { button: 2 })
    }
    panAway()
    const away = viewBox()
    expect(away[0]).toBeGreaterThan(148)
    await user.click(tree().getByRole('button', { name: 'Torso shape' }))
    const torso = viewBox()
    expect(torso).not.toEqual(away)
    expect(torso[0]).toBeLessThanOrEqual(70)
    expect(torso[0] + torso[2]).toBeGreaterThanOrEqual(130)
    // and again for the arm, from a view that has gone away from it
    panAway()
    expect(viewBox()[0]).toBeGreaterThan(148)
    await user.click(tree().getByRole('button', { name: 'Arm shape' }))
    const arm = viewBox()
    expect(arm[0]).toBeLessThanOrEqual(134)
    expect(arm[0] + arm[2]).toBeGreaterThanOrEqual(148)
    // the torso sticks out of that view, so selecting it fits it again
    await user.click(tree().getByRole('button', { name: 'Torso shape' }))
    expect(viewBox()).not.toEqual(arm)
    expect(viewBox()[0]).toBeLessThanOrEqual(70)
    expect(viewBox()[0] + viewBox()[2]).toBeGreaterThanOrEqual(130)
  })

  it('pans only while the drag is held at an edge, after a short hold, and the shape follows the view', async () => {
    const user = await open()
    await pickTorso(user)
    const before = viewBox()
    const from = pixelOf(100, 90)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    pointer(pathOf('torso'), 'pointerdown', from)
    // in the middle of the canvas: nothing moves, however long it is held
    pointer(canvas(), 'pointermove', { x: from.x + 20, y: from.y })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(viewBox()).toEqual(before)
    // at the right edge: not at once, then the view goes right
    pointer(canvas(), 'pointermove', { x: 702, y: 300 })
    act(() => { vi.advanceTimersByTime(150) })
    expect(viewBox()).toEqual(before)
    const shapeBefore = pathOf('torso').getAttribute('d')
    act(() => { vi.advanceTimersByTime(900) })
    const panned = viewBox()
    expect(panned[0]).toBeGreaterThan(before[0] + 1)
    expect(panned[1]).toBeCloseTo(before[1], 6)
    expect(panned[2]).toBeCloseTo(before[2], 6)
    expect(pathOf('torso').getAttribute('d')).not.toBe(shapeBefore)
    // away from the edge again: it stops
    pointer(canvas(), 'pointermove', { x: 350, y: 300 })
    act(() => { vi.advanceTimersByTime(100) })
    const stopped = viewBox()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(viewBox()).toEqual(stopped)
    pointer(canvas(), 'pointerup')
    // a drag that has ended never pans
    pointer(canvas(), 'pointermove', { x: 702, y: 300 })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(viewBox()).toEqual(stopped)
  })

  it('pans along both axes at a corner', async () => {
    const user = await open()
    await pickTorso(user)
    const before = viewBox()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
    pointer(canvas(), 'pointermove', { x: 2, y: 2 })
    act(() => { vi.advanceTimersByTime(1200) })
    const panned = viewBox()
    expect(panned[0]).toBeLessThan(before[0] - 1)
    expect(panned[1]).toBeLessThan(before[1] - 1)
    pointer(canvas(), 'pointerup')
  })

  it('does not pan a view that is not being dragged in', async () => {
    const user = await open()
    await pickTorso(user)
    const before = viewBox()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    pointer(canvas(), 'pointermove', { x: 702, y: 300 })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(viewBox()).toEqual(before)
  })
})

describe('Fit to screen', () => {
  const fit = () => screen.getByRole('button', { name: 'Fit to screen' })
  const inside = (vb: number[], b: { x: number; y: number; w: number; h: number }) => vb[0] <= b.x && vb[1] <= b.y && vb[0] + vb[2] >= b.x + b.w && vb[1] + vb[3] >= b.y + b.h

  it('takes the box round everything that is drawn, with little blank space', async () => {
    const user = await open()
    await user.click(fit())
    const vb = viewBox()
    expect(fit()).toHaveAttribute('aria-pressed', 'true')
    expect(inside(vb, EVERYTHING)).toBe(true)
    // the limiting side has about 4% and a few units of room, not the 70% of the figure's whole height that it used to have
    expect(vb[3]).toBeLessThan(EVERYTHING.h * 1.15)
    expect(vb[3]).toBeGreaterThanOrEqual(EVERYTHING.h)
    // and the other side is only as wide as the canvas's shape needs
    expect(vb[2] / vb[3]).toBeCloseTo(8 / 7, 4)
  })

  it('fits everything whatever is selected, and holds still while a shape is dragged', async () => {
    const user = await open()
    await user.click(fit())
    const before = viewBox()
    pointer(pathOf('arm'), 'pointerdown', pixelOf(141, 90))
    pointer(canvas(), 'pointerup')
    expect(viewBox()).toEqual(before)
    await user.click(screen.getByRole('button', { name: 'Move shape' }))
    const from = pixelOf(141, 90)
    pointer(pathOf('arm'), 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x - 80, y: from.y + 40 })
    pointer(canvas(), 'pointerup')
    expect(viewBox()).toEqual(before)
  })

  it('fits again after the view was panned or zoomed, and is switched off by a second press', async () => {
    const user = await open()
    await user.click(fit())
    const fitted = viewBox()
    pointer(canvas(), 'pointerdown', { x: 300, y: 300, button: 2 })
    pointer(canvas(), 'pointermove', { x: 380, y: 340, button: 2 })
    pointer(canvas(), 'pointerup', { button: 2 })
    expect(viewBox()).not.toEqual(fitted)
    await user.click(fit())
    expect(fit()).toHaveAttribute('aria-pressed', 'true')
    expect(viewBox()).toEqual(fitted)
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(viewBox()[2]).toBeLessThan(fitted[2])
    await user.click(fit())
    expect(fit()).toHaveAttribute('aria-pressed', 'true')
    expect(viewBox()).toEqual(fitted)
    await user.click(fit())
    expect(fit()).toHaveAttribute('aria-pressed', 'false')
  })

  it('goes back to the middle of the fit after the view was panned by a drag, and when the selection changes', async () => {
    const user = await open()
    pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
    pointer(canvas(), 'pointerup')
    const torso = viewBox()
    pointer(canvas(), 'pointerdown', { x: 300, y: 300, button: 2 })
    pointer(canvas(), 'pointermove', { x: 380, y: 340, button: 2 })
    pointer(canvas(), 'pointerup', { button: 2 })
    expect(viewBox()).not.toEqual(torso)
    // a selection that is in the panned view leaves it as it is, a pan belongs to the view it was made in
    const panned = viewBox()
    const arm = pathOf('arm').getBoundingClientRect()
    expect(arm).toBeTruthy()
    pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
    pointer(canvas(), 'pointerup')
    expect(viewBox()).toEqual(panned)
    await user.click(screen.getByRole('button', { name: 'Fit to screen' }))
    expect(viewBox()[0] + viewBox()[2] / 2).toBeCloseTo(109, 0)   // the middle of everything that is drawn (70..148)
  })
})

describe('Snap to grid', () => {
  const toggle = () => screen.getByRole('button', { name: 'Snap to grid' })
  const savedBox = (b: { entries: Array<{ draft: ModelContent }> }, id: string) => {
    const shape = b.entries[0].draft.shapes.find(x => x.id === id)!
    return boxOf(flatten(build(shape.pts, shape.closed), shape.closed))
  }
  const onLine = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) < 1e-6

  it('is a toggle next to Grid, and is off until it is switched on', async () => {
    await open()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws a faint line every 2 units and a stronger one every 10 at the normal zoom', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Fit to screen' }))
    const step = gridStep(viewBox()[2])
    expect(step).toBe(2)
    const lines = [...canvas().querySelectorAll('line.cmGridLine')]
    const verticals = lines.filter(l => l.getAttribute('x1') === l.getAttribute('x2'))
    const xs = verticals.map(l => Number(l.getAttribute('x1'))).sort((a, b) => a - b)
    expect(xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1] - 2) < 1e-9)).toBe(true)
    for (const l of verticals) expect(l.classList.contains('cmGridLine--major')).toBe(Math.abs(Number(l.getAttribute('x1')) / 10 - Math.round(Number(l.getAttribute('x1')) / 10)) < 1e-9)
    expect(verticals.some(l => l.classList.contains('cmGridLine--major'))).toBe(true)
  })

  it('puts a shape that is moved whole with its top left corner on a line, whatever the pointer did', async () => {
    const { user, backend } = await openWith()
    await pickTorso(user)
    fireEvent.click(toggle())
    const step = gridStep(viewBox()[2])
    const from = pixelOf(100, 90)
    pointer(pathOf('torso'), 'pointerdown', from)
    for (const dx of [7, 23, 41]) pointer(canvas(), 'pointermove', { x: from.x + dx + 0.37, y: from.y + dx * 0.61 + 0.11 })
    pointer(canvas(), 'pointerup')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const b = savedBox(backend, 'torso')
    expect(b.x).not.toBeCloseTo(70, 0)
    expect(onLine(Math.round(b.x * 100) / 100, step)).toBe(true)
    expect(onLine(Math.round(b.y * 100) / 100, step)).toBe(true)
    // the size is what it was
    expect(b.w).toBeCloseTo(60, 0)
    expect(b.h).toBeCloseTo(100, 0)
  })

  it('leaves a shape alone to land anywhere while it is off', async () => {
    const { user, backend } = await openWith()
    await pickTorso(user)
    const step = gridStep(viewBox()[2])
    const from = pixelOf(100, 90)
    pointer(pathOf('torso'), 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x + 23.4, y: from.y + 11.9 })
    pointer(canvas(), 'pointerup')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const b = savedBox(backend, 'torso')
    expect(onLine(Math.round(b.x * 100) / 100, step) && onLine(Math.round(b.y * 100) / 100, step)).toBe(false)
  })

  it('does not pull a dragged point to the grid (that is the Snap button: half units and the mirror line)', async () => {
    const { user, backend } = await openWith()
    pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
    pointer(canvas(), 'pointerup')
    fireEvent.click(toggle())
    fireEvent.click(screen.getByRole('button', { name: 'Snap' }))   // off: so the point is free
    const dot = canvas().querySelector('.cmPoint')!
    const from = pixelOf(70, 40)
    pointer(dot, 'pointerdown', from)
    pointer(canvas(), 'pointermove', { x: from.x - 11.3, y: from.y - 7.7 })
    pointer(canvas(), 'pointerup')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const b = savedBox(backend, 'torso')
    const step = gridStep(viewBox()[2])
    expect(onLine(Math.round(b.x * 100) / 100, step) && onLine(Math.round(b.y * 100) / 100, step)).toBe(false)
  })
})
