import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { enableSymmetry } from './engine/symmetry'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Mirrors in the shape editor (Z3): the Mirror button of a shape or an object makes a copy across a line (a connected symmetric shape's axis, else the model's centre
// line), listed inside its original's card; dragging the mirror's point moves the original's; the line can be changed; Detach keeps the outline.
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
// a hand box at 60..80 (the centre line is x = 100); with a chest, a symmetric shape the breast is welded to
function model(withChest = false): ModelContent {
  let c = addGroup(blank('Mirrors'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('hand', 60, 40, 20, 20))
  if (withChest) {
    const made = enableSymmetry(box('chest', 120, 100, 40, 60), { a: 90, n: 1 }, 0, 60)
    if (!made.ok) throw new Error(made.reason)
    c = addShape(c, 'o', made.shape)
    const corner = made.shape.pts.findIndex(p => p.x === 160 && p.y === 100)
    const b = box('breast', 160, 100, 10, 10)
    c = addShape(c, 'o', { ...b, pts: b.pts.map((p, i) => (i === 0 ? { ...p, bind: { kind: 'point' as const, s: 'chest', i: corner, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } } : p)) })
  }
  return c
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
const xsOf = (id: string) => ((pathOf(id).getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)).filter((_, i) => i % 2 === 0)
const twinId = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape')!).find(id => !['hand', 'chest', 'breast'].includes(id))!
const dotAt = (x: number, y: number) => Array.from(canvas().querySelectorAll('.cmPoint')).find(d => Math.abs(Number(d.getAttribute('cx')) - x) < 0.5 && Math.abs(Number(d.getAttribute('cy')) - y) < 0.5)

describe('a mirror of a shape', () => {
  it('is made across the centre line, listed inside its original, and edits its original', async () => {
    const user = await open(model())
    click(pathOf('hand'), [70, 50])
    await user.click(screen.getByRole('button', { name: 'Mirror hand shape' }))
    // the mirror is selected, across x = 100
    expect(screen.getByRole('heading', { name: 'Mirror of hand shape' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Mirror line' })).toHaveDisplayValue("The model's centre line")
    const id = twinId()
    expect(Math.min(...xsOf(id))).toBeCloseTo(120, 1)
    expect(Math.max(...xsOf(id))).toBeCloseTo(140, 1)
    const tree = within(screen.getByRole('navigation', { name: 'Model tree' }))
    expect(within(tree.getByRole('list', { name: 'Copies of hand shape' })).getByRole('group', { name: 'Shape hand shape (twin)' })).toBeInTheDocument()
    expect(canvas().querySelector('[data-mirror-axis]')).not.toBeNull()
    // its outer corner dragged out: the hand's outer corner goes the other way
    const corner = dotAt(140, 40)!
    pointer(corner, 'pointerdown', pixelOf(140, 40))
    pointer(canvas(), 'pointermove', pixelOf(144, 36))
    pointer(canvas(), 'pointermove', pixelOf(150, 30))
    pointer(canvas(), 'pointerup', pixelOf(150, 30))
    expect(Math.min(...xsOf('hand'))).toBeCloseTo(50, 0)
    expect(Math.max(...xsOf(id))).toBeCloseTo(150, 0)
  })

  it('is detached, keeping its outline', async () => {
    const user = await open(model())
    click(pathOf('hand'), [70, 50])
    await user.click(screen.getByRole('button', { name: 'Mirror hand shape' }))
    const id = twinId()
    await user.click(screen.getByRole('button', { name: 'Detach hand shape (twin)' }))
    expect(screen.queryByRole('combobox', { name: 'Mirror line' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Points' })).toBeInTheDocument()
    expect(Math.min(...xsOf(id))).toBeCloseTo(120, 1)
    // the hand no longer moves it
    click(pathOf('hand'), [70, 50])
    expect(screen.getByRole('button', { name: 'Mirror hand shape' })).not.toBeDisabled()
  })

  it('takes the axis of a symmetric shape it is connected to, and another line when chosen', async () => {
    const user = await open(model(true))
    click(pathOf('breast'), [165, 105])
    await user.click(screen.getByRole('button', { name: 'Mirror breast shape' }))
    const line = screen.getByRole('combobox', { name: 'Mirror line' })
    expect(line).toHaveDisplayValue('chest shape, axis 1')
    // across the chest's axis x = 140: the breast at 160..170 is mirrored to 110..120
    const id = twinId()
    expect(Math.min(...xsOf(id))).toBeCloseTo(110, 1)
    await user.selectOptions(line, "The model's centre line")
    expect(Math.min(...xsOf(id))).toBeCloseTo(30, 1)
  })
})

describe('a mirror of an object', () => {
  it('mirrors each of its shapes', async () => {
    const user = await open(model())
    await user.click(screen.getByRole('button', { name: 'Expand Body' }))
    await user.click(screen.getByRole('button', { name: 'Part' }))
    await user.click(screen.getByRole('button', { name: 'Mirror Part' }))
    expect(screen.getByRole('heading', { name: 'Mirror of Part' })).toBeInTheDocument()
    expect(Math.min(...xsOf(twinId()))).toBeCloseTo(120, 1)
  })
})
