import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { addPivot } from './engine/pivots'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Pivots in the shape editor (T3): the new-shape form makes a pivot of circles of different sizes on one point; the Pivot section sizes a circle, turns it within its limits and
// adds a circle; a turned circle swings the shape hung on it; a circle is moved as a whole, with its pivot and its other circles.
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0 })

function model(hang = false): ModelContent {
  let c = addGroup(blank('Pivots'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('body', 60, 40, 40, 60))
  if (!hang) return c
  c = addPivot(c, 'o', 80, 100, { pivot: 'p1', circles: ['c1', 'c2'] })
  c = addShape(c, 'o', box('arm', 74, 100, 12, 60))
  return { ...c, shapes: c.shapes.map(s => (s.id === 'body' ? { ...s, pts: s.pts.map((p, i) => (i === 3 ? { ...p, bind: lock('c1', 0, 0.5) } : p)) } : s.id === 'arm' ? { ...s, pts: s.pts.map((p, i) => (i === 0 ? { ...p, bind: lock('c2', 1, 0.5) } : p)) } : s)) }
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
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const section = () => within(screen.getByRole('group', { name: 'Pivot' }))
const value = (label: string) => within(section().getByRole('group', { name: label })).getByText(/./, { selector: '.cmStepValue' }).textContent
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
// the bounding box of a drawn path, from its numbers (a turn is in the path text: it is drawn through the shape's matrix)
const boxOf = (id: string) => {
  const nums = (pathOf(id).getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

describe('making a pivot', () => {
  it('makes circles of different sizes round one point from the new-shape form, and shows its point', async () => {
    const user = await open(model())
    pointer(canvas(), 'pointerdown', { ...pixelOf(150, 200), button: 2 })
    pointer(canvas(), 'pointerup', { ...pixelOf(150, 200), button: 2 })
    const form = within(screen.getByRole('dialog', { name: 'New shape' }))
    await user.click(form.getByRole('button', { name: 'Pivot' }))
    await user.click(form.getByRole('button', { name: 'Raise Circles' }))
    await user.click(form.getByRole('button', { name: 'Create' }))
    const circles = Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape')!).filter(id => id !== 'body')
    expect(circles).toHaveLength(3)
    const widths = circles.map(id => { const b = boxOf(id); return Math.round(b.x1 - b.x0) }).sort((a, b) => a - b)
    expect(widths).toEqual([24, 36, 48])
    expect(canvas().querySelectorAll('[data-pivot-point]')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'Pivot name' })).toHaveValue('Pivot 1')
    expect(screen.getByRole('img', { name: /is a pivot circle/ })).toBeInTheDocument()
  })

  it('starts a pivot of two circles on a point from the point form', async () => {
    const user = await open(model())
    pointer(pathOf('body'), 'pointerdown', pixelOf(80, 70))
    pointer(canvas(), 'pointerup')
    const corner = Array.from(canvas().querySelectorAll('.cmPoint')).find(d => Number(d.getAttribute('cx')) === 100 && Number(d.getAttribute('cy')) === 100)!
    pointer(corner, 'pointerdown', { ...pixelOf(100, 100), button: 2 })
    pointer(canvas(), 'pointerup', { ...pixelOf(100, 100), button: 2 })
    await user.click(within(screen.getByRole('dialog', { name: 'Point type' })).getByRole('button', { name: 'Pivot here' }))
    const mark = canvas().querySelector('[data-pivot-point] circle')!
    expect([Number(mark.getAttribute('cx')), Number(mark.getAttribute('cy'))]).toEqual([100, 100])
    expect(Array.from(canvas().querySelectorAll('path[data-shape]')).filter(p => p.getAttribute('data-shape') !== 'body')).toHaveLength(2)
  })

  it('adds a circle, and sizes the selected one', async () => {
    const user = await open(model(true))
    await pick(user, 'Pivot 1 circle 1', 'shape')
    expect(value('Size')).toBe('12')
    await user.click(section().getByRole('button', { name: 'Raise Size' }))
    expect(value('Size')).toBe('13')
    await user.click(section().getByRole('button', { name: 'Add a circle' }))
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Pivot 1 circle 3')
  })
})

describe('turning a pivot', () => {
  it('swings the shape hung on the turned circle, within its limits', async () => {
    const user = await open(model(true))
    const before = boxOf('arm')
    await pick(user, 'Pivot 1 circle 2', 'shape')
    await user.keyboard('{Shift>}')
    for (let k = 0; k < 6; k++) await user.click(section().getByRole('button', { name: 'Raise Turn' }))
    await user.keyboard('{/Shift}')
    expect(value('Turn')).toBe('90°')
    const after = boxOf('arm')
    // the arm hung below the pivot now lies to its left, its near end at the pivot
    expect(before.y1).toBeCloseTo(160, 0)
    expect(after.x0).toBeLessThan(30)
    expect(after.x1).toBeCloseTo(80, 0)
    // (the path's numbers include its curve handles, so the box is a little larger than the outline)
    expect(after.y1).toBeLessThan(120)
    // the limits stop it
    await user.keyboard('{Shift>}')
    for (let k = 0; k < 12; k++) await user.click(section().getByRole('button', { name: 'Lower Turns at most' }))
    await user.keyboard('{/Shift}')
    expect(value('Turns at most')).toBe('0°')
    expect(value('Turn')).toBe('0°')
    expect(section().getByRole('button', { name: 'Raise Turn' })).toBeDisabled()
  })

  it('moves a circle as a whole, with its pivot and its other circles', async () => {
    await open(model(true))
    const c1 = boxOf('c1'), point = () => canvas().querySelector('[data-pivot-point] circle')!
    pointer(pathOf('c2'), 'pointerdown', pixelOf(80, 116))
    pointer(canvas(), 'pointermove', pixelOf(100, 116))
    pointer(canvas(), 'pointerup', pixelOf(100, 116))
    const moved = boxOf('c1')
    expect(moved.x0 - c1.x0).toBeCloseTo(20, 0)
    expect(Number(point().getAttribute('cx'))).toBeCloseTo(100, 0)
  })
})
