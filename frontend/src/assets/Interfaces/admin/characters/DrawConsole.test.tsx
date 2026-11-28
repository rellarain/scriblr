import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Drawing in the shape editor (slice 9b): the Outline section smooths the selected point or every point and simplifies the outline to fewer points (saying how far it
// strays); the Combine section merges another shape into the selected one, cuts one out of it, or splits it along a line laid on the canvas.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>, extra: Partial<ModelShape> = {}): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, outline: 1, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...extra })
// a: a square 60..100 by 100..140; b: a square 80..120 by 120..160, overlapping it; c: a circle of 24 points away from both
const circle = Array.from({ length: 24 }, (_, k): [number, number] => [150 + 20 * Math.cos((k * Math.PI) / 12), 60 + 20 * Math.sin((k * Math.PI) / 12)])
function model(): ModelContent {
  let c = addGroup(blank('Draw'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
  c = addShape(c, 'o', sharp('b', [[80, 120], [120, 120], [120, 160], [80, 160]]))
  return addShape(c, 'o', { ...sharp('c', circle), pts: circle.map(([x, y]) => ({ x, y, m: 'c' as const })) })
}
async function open() {
  modelsBackend([draftEntry('m', model())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return user
}
const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)
const select = (id: string, wx: number, wy: number) => { pointer(pathOf(id)!, 'pointerdown', pixelOf(wx, wy)); pointer(canvas(), 'pointerup') }
const outline = () => within(screen.getByRole('group', { name: 'Outline' }))
const combine = () => within(screen.getByRole('group', { name: 'Combine' }))
const points = () => within(screen.getByRole('group', { name: 'Points' })).getAllByRole('button').length

describe('the Outline section', () => {
  it('simplifies a circle of 24 points, saying how far it strays, and smooths a point and the whole outline', async () => {
    const user = await open()
    select('c', 150, 60)
    expect(points()).toBe(24)
    const status = outline().getByRole('status')
    expect(status.textContent).toMatch(/^24 points now; \d+ keep the outline within [\d.]+ units?\.$/)
    // down to six points
    const stepper = within(outline().getByRole('group', { name: 'Points to keep' }))
    while (!stepper.getByText(/pts$/).textContent!.startsWith('6 ')) await user.click(stepper.getByRole('button', { name: 'Lower Points to keep' }))
    await user.click(outline().getByRole('button', { name: 'Apply' }))
    expect(points()).toBeLessThanOrEqual(6)

    select('a', 70, 110)
    expect(outline().getByText('4 points: as few as its corners allow.')).toBeInTheDocument()
    expect(outline().getByRole('button', { name: 'Smooth the point' })).toBeDisabled()
    await user.click(outline().getByRole('button', { name: 'Smooth it all' }))
    expect(outline().getByRole('button', { name: 'Smooth it all' })).toBeDisabled()
    expect(pathOf('a')!.getAttribute('d')).toMatch(/C/)
  })
})

describe('the Combine section', () => {
  it('merges the shape clicked into the selected one', async () => {
    const user = await open()
    select('a', 70, 110)
    await user.click(combine().getByRole('button', { name: 'Merge' }))
    expect(combine().getByRole('button', { name: 'Merge' })).toHaveAttribute('aria-pressed', 'true')
    expect(combine().getByRole('status')).toHaveTextContent('Click the shape to merge with this one')
    pointer(pathOf('b')!, 'pointerdown', pixelOf(110, 150)); pointer(canvas(), 'pointerup')
    expect(pathOf('b')).toBeNull()
    expect(points()).toBe(8)
    expect(combine().getByRole('button', { name: 'Merge' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('cuts the shape clicked out of the selected one, and Escape stops picking', async () => {
    const user = await open()
    select('a', 70, 110)
    await user.click(combine().getByRole('button', { name: 'Cut out' }))
    await user.keyboard('{Escape}')
    expect(combine().getByRole('button', { name: 'Cut out' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(combine().getByRole('button', { name: 'Cut out' }))
    pointer(pathOf('b')!, 'pointerdown', pixelOf(110, 150)); pointer(canvas(), 'pointerup')
    // a keeps its outline less the corner b lay over: six points; b stays
    expect(points()).toBe(6)
    expect(pathOf('b')).not.toBeNull()
  })

  it('splits the selected shape along a line laid on the canvas', async () => {
    const user = await open()
    select('a', 70, 110)
    await user.click(combine().getByRole('button', { name: 'Split' }))
    for (const [x, y] of [[50, 110], [110, 110]]) { pointer(canvas(), 'pointerdown', pixelOf(x, y)); pointer(canvas(), 'pointerup', pixelOf(x, y)) }
    expect(canvas().querySelectorAll('[data-taper-point]')).toHaveLength(2)
    // a click on the canvas gives it the focus in a browser; Enter there makes the split
    canvas().focus()
    await user.keyboard('{Enter}')
    expect(canvas().querySelectorAll('path[data-shape]')).toHaveLength(4)
    expect(screen.getAllByText('a shape (piece 2)').length).toBeGreaterThan(0)
  })
})
