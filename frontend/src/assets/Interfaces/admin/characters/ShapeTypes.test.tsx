import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Shape types in the shape editor (T1): a right-click on the grid opens the new-shape form there, Create makes the chosen type and shape where it was opened; shadows and lights are
// black and white, see-through, drawn above the rest and kept inside it, and a light and a shadow may not overlap; a shape whose every point follows another is a stretch shape.
vi.setConfig({ testTimeout: 30000 })

const square = (id: string, x: number, y: number, w: number, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + w], [x, y + w]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })), ...extra,
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })

function model(shapes: ModelShape[]): ModelContent {
  let c = addGroup(blank('Types'), newGroup('g', 'Group'))
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
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const rightClickGrid = (wx: number, wy: number) => { pointer(canvas(), 'pointerdown', { ...pixelOf(wx, wy), button: 2 }); pointer(canvas(), 'pointerup', { ...pixelOf(wx, wy), button: 2 }) }
const form = () => within(screen.getByRole('dialog', { name: 'New shape' }))
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement | null
const painted = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape'))
const centreOf = (el: Element) => {
  const nums = (el.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

describe('the new-shape form', () => {
  it('opens where the grid is right-clicked, and Create puts the chosen shape there', async () => {
    const user = await open(model([square('body', 60, 60, 40)]))
    rightClickGrid(150, 220)
    await user.click(form().getByRole('button', { name: 'Square' }))
    await user.click(form().getByRole('button', { name: 'Create' }))
    expect(screen.queryByRole('dialog', { name: 'New shape' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Square')
    const made = painted().find(id => id !== 'body')!
    const [cx, cy] = centreOf(pathOf(made)!)
    expect(cx).toBeCloseTo(150, 0)
    expect(cy).toBeCloseTo(220, 0)
  })

  it('opens from the tree for that object', async () => {
    const user = await open(model([square('body', 60, 60, 40)]))
    await pick(user, 'Part', 'object')
    await user.click(screen.getByRole('button', { name: 'Add a shape to Part' }))
    await user.click(form().getByRole('button', { name: 'Create' }))
    expect(painted()).toHaveLength(2)
  })
})

describe('shadows and lights', () => {
  it('are made black or white and see-through, without an outline, above the rest and kept inside it', async () => {
    const user = await open(model([square('body', 60, 60, 60)]))
    rightClickGrid(90, 90)
    await user.click(form().getByRole('button', { name: 'Shadow' }))
    await user.click(form().getByRole('button', { name: 'Circle' }))
    await user.click(form().getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Shadow')
    const id = painted().find(x => x !== 'body')!
    const path = pathOf(id)!
    expect(path.style.getPropertyValue('--shape-fill')).toBe('#000000')
    expect(path.getAttribute('fill-opacity')).toBe('0.3')
    expect(canvas().querySelector(`path[data-line="${id}"]`)).toBeNull()
    // kept inside the shapes below
    expect(path.parentElement?.getAttribute('clip-path')).toMatch(/^url\(#/)
    // the panel: the type, and no outline in its look
    expect(within(screen.getByRole('group', { name: 'Type of the shape' })).getByRole('button', { name: 'Shadow' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: 'Look of the shape' })).queryByRole('button', { name: 'Outline' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Shadow is a shadow' })).toBeInTheDocument()
  })

  it('come above the base shapes of objects drawn later', async () => {
    let c = model([square('glow', 70, 70, 10, { kind: 'light', op: 0.25 }), square('body', 60, 60, 40)])
    c = addObject(c, 'g', { id: 'o2', name: 'Later', layer: 'body', shapes: [] })
    c = addShape(c, 'o2', square('top', 65, 65, 30))
    await open(c)
    expect(painted()).toEqual(['body', 'top', 'glow'])
  })

  it('change type in the panel: a light starts see-through with no outline, a base shape is opaque and outlined again', async () => {
    const user = await open(model([square('under', 40, 40, 100), square('body', 60, 60, 40, { outline: 0.75 })]))
    await pick(user, 'body shape', 'shape')
    const type = within(screen.getByRole('group', { name: 'Type of the shape' }))
    await user.click(type.getByRole('button', { name: 'Light' }))
    expect(pathOf('body')!.style.getPropertyValue('--shape-fill')).toBe('#ffffff')
    expect(pathOf('body')!.getAttribute('fill-opacity')).toBe('0.25')
    await user.click(type.getByRole('button', { name: 'Base' }))
    expect(pathOf('body')!.getAttribute('fill-opacity')).toBe('1')
    expect(canvas().querySelector('path[data-line="body"]')).not.toBeNull()
  })

  it('may not overlap: a light made over a shadow is refused, and the note says why', async () => {
    const user = await open(model([square('body', 0, 0, 200), square('dark', 80, 80, 40, { kind: 'shadow', op: 0.3 })]))
    rightClickGrid(100, 100)
    await user.click(form().getByRole('button', { name: 'Light' }))
    await user.click(form().getByRole('button', { name: 'Create' }))
    expect(painted()).toEqual(['body', 'dark'])
    expect(screen.getByText(/A light and a shadow may not overlap: Light would overlap dark shape/)).toBeInTheDocument()
    // away from the shadow it is made
    rightClickGrid(30, 30)
    await user.click(form().getByRole('button', { name: 'Create' }))
    expect(painted()).toHaveLength(3)
  })
})

describe('a light dragged onto a shadow', () => {
  it('stops where it was, and the note says why', async () => {
    await open(model([square('body', 0, 0, 100), square('dark', 60, 60, 30, { kind: 'shadow', op: 0.3 }), square('glow', 5, 5, 20, { kind: 'light', op: 0.25 })]))
    const before = centreOf(pathOf('glow')!)
    pointer(pathOf('glow')!, 'pointerdown', pixelOf(15, 15))
    pointer(canvas(), 'pointermove', pixelOf(75, 75))
    pointer(canvas(), 'pointerup', pixelOf(75, 75))
    expect(centreOf(pathOf('glow')!)).toEqual(before)
    expect(screen.getByText(/may not overlap/)).toBeInTheDocument()
    // a drag that keeps clear of the shadow moves it
    pointer(pathOf('glow')!, 'pointerdown', pixelOf(15, 15))
    pointer(canvas(), 'pointermove', pixelOf(15, 45))
    pointer(canvas(), 'pointerup', pixelOf(15, 45))
    expect(centreOf(pathOf('glow')!)[1]).toBeGreaterThan(before[1] + 20)
  })
})

describe('stretch shapes', () => {
  it('a shape whose every point follows another shape is one, and the panel and the tree say so', async () => {
    const a = square('a', 60, 60, 40)
    const b = square('b', 60, 60, 40, { pts: a.pts.map((p, i) => ({ ...p, bind: weld('a', i) })) })
    const user = await open(model([a, b]))
    await pick(user, 'b shape', 'shape')
    expect(screen.getByText('Stretch: every point follows a shape')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'b shape is a stretch shape' })).toBeInTheDocument()
  })

  it('a shape made as one says how many of its points still follow nothing', async () => {
    const a = square('a', 60, 60, 40)
    const b = square('b', 60, 60, 40, { kind: 'stretch', pts: a.pts.map((p, i) => (i < 1 ? { ...p, bind: weld('a', i) } : p)) })
    const user = await open(model([a, b]))
    await pick(user, 'b shape', 'shape')
    expect(screen.getByText('Stretch: 3 points follow nothing yet')).toBeInTheDocument()
  })
})
