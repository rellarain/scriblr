import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { enableSymmetry } from './engine/symmetry'

// Symmetry in the shape editor (S6): the Symmetry section's toggle starts choosing the axes (presets, the angle of the first, how many), the canvas draws them through the
// shape's middle and takes a click on the side to copy; a point of any copy is then dragged and the others follow; the toggle turns it off and the points stay.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// a square, 60..100 across and 100..140 down, its middle at (80, 120)
function one(): ModelContent {
  let c = addGroup(blank('One'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  return addShape(c, 'o', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
}

async function open() {
  modelsBackend([draftEntry('m', one())])
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
const section = () => within(screen.getByRole('group', { name: 'Symmetry' }))

async function quartered() {
  const user = await open()
  select('a', 70, 110)
  await user.click(section().getByRole('button', { name: 'Symmetry' }))
  await user.click(section().getByRole('button', { name: 'Horizontal' }))
  await user.click(section().getByRole('button', { name: 'Raise Number of axes' }))
  // the side below and to the left of the middle
  const sheet = canvas().querySelector('[data-sym-pick]')!
  pointer(canvas(), 'pointermove', pixelOf(70, 130))
  pointer(sheet, 'pointerdown', pixelOf(70, 130))
  return user
}

describe('choosing the axes', () => {
  it('draws them through the middle of the shape, lights the side under the pointer, and Escape stops', async () => {
    const user = await open()
    select('a', 70, 110)
    const toggle = section().getByRole('button', { name: 'Symmetry' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(section().getByRole('button', { name: 'Vertical' })).toHaveAttribute('aria-pressed', 'true')
    expect(canvas().querySelectorAll('[data-sym-ray]')).toHaveLength(2)
    await user.click(section().getByRole('button', { name: 'Raise Number of axes' }))
    expect(canvas().querySelectorAll('[data-sym-ray]')).toHaveLength(4)
    pointer(canvas(), 'pointermove', pixelOf(90, 130))
    expect(canvas().querySelector('[data-sym-wedge]')).not.toBeNull()
    canvas().focus()
    fireEvent.keyDown(canvas(), { key: 'Escape' })
    expect(canvas().querySelector('[data-sym-ray]')).toBeNull()
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('a symmetric shape', () => {
  it('is made from the side that was clicked, and says its axes', async () => {
    await quartered()
    expect(canvas().querySelector('[data-sym-ray]')).toBeNull()
    expect(section().getByText('2 axes at 0°')).toBeInTheDocument()
    expect(dots()).toHaveLength(8)
    // the axes are drawn as the Symmetry axes layer
    expect(canvas().querySelectorAll('[data-sym-axis]')).toHaveLength(2)
  })

  it('moves every copy with a point dragged in any of them', async () => {
    await quartered()
    const corner = dots().findIndex(d => at(d)[0] === 100 && at(d)[1] === 100)
    const dot = dots()[corner]
    pointer(dot, 'pointerdown', pixelOf(100, 100))
    pointer(canvas(), 'pointermove', pixelOf(105, 96))
    pointer(canvas(), 'pointerup', pixelOf(105, 96))
    const pts = dots().map(at)
    for (const c of [[105, 96], [55, 96], [55, 144], [105, 144]]) expect(pts).toContainEqual(c)
  })

  it('keeps every point when symmetry is turned off', async () => {
    const user = await quartered()
    const before = dots().map(at)
    await user.click(section().getByRole('button', { name: 'Symmetry' }))
    expect(section().getByRole('button', { name: 'Symmetry' })).toHaveAttribute('aria-pressed', 'false')
    expect(dots().map(at)).toEqual(before)
    expect(canvas().querySelector('[data-sym-axis]')).toBeNull()
  })
})

describe('points on the axes are optional (the user, 2026-11-16)', () => {
  const dotAt = (x: number, y: number) => dots().find(d => at(d)[0] === x && at(d)[1] === y)
  it('removes a point on an axis with Delete, and its copy on the same axis goes too', async () => {
    await quartered()
    const bottom = dotAt(80, 140)!
    pointer(bottom, 'pointerdown', pixelOf(80, 140))
    pointer(canvas(), 'pointerup', pixelOf(80, 140))
    canvas().focus()
    fireEvent.keyDown(canvas(), { key: 'Delete' })
    expect(dots()).toHaveLength(6)
    expect(dotAt(80, 140)).toBeUndefined()
    expect(dotAt(80, 100)).toBeUndefined()
    expect(dotAt(60, 120)).toBeDefined()
    expect(screen.queryByText(/axis of a symmetric shape cannot/)).toBeNull()
  })

  it('removes one with Ctrl + click, puts it back with a double-click on the side that crosses the axis, and Undo takes that back', async () => {
    const user = await quartered()
    const side = pixelOf(60, 120)
    fireEvent(dotAt(60, 120)!, new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true, clientX: side.x, clientY: side.y }))
    pointer(canvas(), 'pointerup', side)
    expect(dots()).toHaveLength(6)
    expect(dotAt(60, 120)).toBeUndefined()
    expect(dotAt(100, 120)).toBeUndefined()
    fireEvent.doubleClick(canvas(), { clientX: side.x, clientY: side.y })
    expect(dots()).toHaveLength(8)
    expect(dotAt(60, 120)).toBeDefined()
    expect(dotAt(100, 120)).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(dots()).toHaveLength(6)
  })
})

describe('symmetric shapes connected (shape types T1)', () => {
  it('connects a point of one symmetric shape to a point of another, and its copies follow', async () => {
    const made = (id: string, x: number, y: number) => { const r = enableSymmetry(sharp(id, [[x, y], [x + 40, y], [x + 40, y + 40], [x, y + 40]]), { a: 0, n: 2 }, 1, 60); if (!r.ok) throw new Error(r.reason); return r.shape }
    let c = addGroup(blank('Two'), newGroup('g', 'Group'))
    c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
    c = addShape(addShape(c, 'o', made('a', 60, 100)), 'o', made('b', 120, 60))
    modelsBackend([draftEntry('m', c)])
    render(<DesignerConsole tools="shapes" />)
    await screen.findByRole('region', { name: 'Designer' })
    select('a', 70, 110)
    // the top right corner of a (100, 100) dropped on the bottom left corner of b (120, 100)
    const corner = dots().find(d => at(d)[0] === 100 && at(d)[1] === 100)!
    pointer(corner, 'pointerdown', pixelOf(100, 100))
    pointer(canvas(), 'pointermove', pixelOf(110, 100))
    pointer(canvas(), 'pointermove', pixelOf(120, 100))
    pointer(canvas(), 'pointerup', pixelOf(120, 100))
    const pts = dots().map(at)
    // the corner is on b's corner, and the opposite corners moved with it about a's middle (80, 120)
    for (const p of [[120, 100], [40, 100], [40, 140], [120, 140]]) expect(pts).toContainEqual(p)
    expect(screen.queryByText(/cannot follow/)).toBeNull()
  })
})
