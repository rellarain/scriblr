import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Clones in the shape editor (Z4): the Clone button of a shape or an object makes a copy a little right of and below it, listed inside its original's card; dragging the
// clone moves only the clone; dragging its point changes the original (and so every clone); Detach keeps the outline; a clone object is placed by its steppers.
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
// a hand box at 60..100 by 40..80 (big enough that a press in its middle is not on its outline)
function model(): ModelContent {
  let c = addGroup(blank('Clones'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  return addShape(c, 'o', box('hand', 60, 40, 40, 40))
}
async function open(c: ModelContent) {
  modelsBackend([draftEntry('m', c)])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  await screen.findByRole('group', { name: 'Zone Torso' })
  return user
}
const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const click = (el: Element, at: [number, number]) => { pointer(el, 'pointerdown', pixelOf(...at)); pointer(canvas(), 'pointerup', pixelOf(...at)) }
const numbers = (id: string) => (pathOf(id).getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
const xsOf = (id: string) => numbers(id).filter((_, i) => i % 2 === 0)
const ysOf = (id: string) => numbers(id).filter((_, i) => i % 2 === 1)
const ids = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape')!)
const cloneIds = () => ids().filter(id => id !== 'hand')
const dotAt = (x: number, y: number) => Array.from(canvas().querySelectorAll('.cmPoint')).find(d => Math.abs(Number(d.getAttribute('cx')) - x) < 0.5 && Math.abs(Number(d.getAttribute('cy')) - y) < 0.5)
function drag(el: Element, from: [number, number], to: [number, number]) {
  pointer(el, 'pointerdown', pixelOf(...from))
  pointer(canvas(), 'pointermove', pixelOf((from[0] + to[0]) / 2, (from[1] + to[1]) / 2))
  pointer(canvas(), 'pointermove', pixelOf(...to))
  pointer(canvas(), 'pointerup', pixelOf(...to))
}

describe('a clone of a shape', () => {
  it('is made a little right of and below its original and listed inside it', async () => {
    const user = await open(model())
    click(pathOf('hand'), [80, 60])
    await user.click(screen.getByRole('button', { name: 'Clone hand shape' }))
    expect(screen.getByRole('heading', { name: 'Clone of hand shape' })).toBeInTheDocument()
    const [id] = cloneIds()
    expect(Math.min(...xsOf(id))).toBeCloseTo(70, 1)
    expect(Math.min(...ysOf(id))).toBeCloseTo(50, 1)
    const tree = within(screen.getByRole('navigation', { name: 'Model tree' }))
    expect(within(tree.getByRole('list', { name: 'Copies of hand shape' })).getByRole('group', { name: 'Shape hand shape (clone)' })).toBeInTheDocument()
    // a clone has no points, type or connections of its own to set
    expect(screen.queryByRole('group', { name: 'Points' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Type of the shape' })).toBeNull()
  })

  it('moves on its own when dragged, and changes its original when a point is dragged', async () => {
    const user = await open(model())
    click(pathOf('hand'), [80, 60])
    await user.click(screen.getByRole('button', { name: 'Clone hand shape' }))
    const [id] = cloneIds()
    // the clone (70..110) dragged 10 right: the hand stays at 60..100
    drag(pathOf(id), [90, 70], [100, 70])
    expect(Math.min(...xsOf(id))).toBeCloseTo(80, 0)
    expect(Math.min(...xsOf('hand'))).toBeCloseTo(60, 1)
    expect(Math.max(...xsOf('hand'))).toBeCloseTo(100, 1)
    // its right corner (120, 50) dragged 4 out: the hand is 44 wide now, about its own middle
    const corner = dotAt(120, 50)!
    expect(corner).toBeDefined()
    drag(corner, [120, 50], [124, 50])
    expect(Math.min(...xsOf('hand'))).toBeCloseTo(58, 0)
    expect(Math.max(...xsOf('hand'))).toBeCloseTo(102, 0)
    expect(Math.max(...xsOf(id)) - Math.min(...xsOf(id))).toBeCloseTo(44, 0)
  })

  it('is detached, keeping its outline', async () => {
    const user = await open(model())
    click(pathOf('hand'), [80, 60])
    await user.click(screen.getByRole('button', { name: 'Clone hand shape' }))
    const [id] = cloneIds()
    await user.click(screen.getByRole('button', { name: 'Detach hand shape (clone)' }))
    expect(screen.queryByRole('heading', { name: 'Clone of hand shape' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Points' })).toBeInTheDocument()
    expect(Math.min(...xsOf(id))).toBeCloseTo(70, 1)
  })
})

describe('a clone of an object', () => {
  it('clones each of its shapes and is placed by its steppers', async () => {
    const user = await open(model())
    await user.click(screen.getByRole('button', { name: 'Expand Body' }))
    await user.click(screen.getByRole('button', { name: 'Part' }))
    await user.click(screen.getByRole('button', { name: 'Clone Part' }))
    expect(screen.getByRole('heading', { name: 'Clone of Part' })).toBeInTheDocument()
    const [id] = cloneIds()
    expect(Math.min(...xsOf(id))).toBeCloseTo(70, 1)
    await user.click(screen.getByRole('button', { name: 'Raise Across' }))
    expect(Math.min(...xsOf(id))).toBeCloseTo(71, 1)
    await user.click(screen.getByRole('button', { name: 'Flip across' }))
    expect(screen.getByRole('button', { name: 'Flip across' })).toHaveAttribute('aria-pressed', 'true')
    expect(Math.min(...xsOf('hand'))).toBeCloseTo(60, 1)
  })
})
