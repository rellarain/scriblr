import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import CharacterModelsConsole from './CharacterModelsConsole'
import { newShape } from './engine/edit'
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

async function open() {
  modelsBackend([draftEntry('a', figure())])
  const user = userEvent.setup()
  render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  return user
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

  it('fits the new selection when the selection changes', async () => {
    await open()
    pointer(pathOf('torso'), 'pointerdown', pixelOf(100, 90))
    pointer(canvas(), 'pointerup')
    const torso = viewBox()
    pointer(pathOf('arm'), 'pointerdown', pixelOf(141, 90))
    pointer(canvas(), 'pointerup')
    expect(viewBox()).not.toEqual(torso)
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
    pointer(pathOf('arm'), 'pointerdown', pixelOf(141, 90 + 0))
    pointer(canvas(), 'pointerup')
    const arm = viewBox()
    expect(arm[0] + arm[2] / 2).toBeCloseTo(141, 0)
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
  })
})
