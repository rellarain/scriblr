import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Pivot points in the shape editor (joints J2): the point form of a linked point has a Pivot toggle; a pivot point is drawn on the canvas (an alert ring, an accent fill) and the
// selected point's Pivot point section turns the object beyond it within its limits; a link inside one object is not a pivot; an old model's pivot circles are converted once.
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0 })
const bindAt = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })

// a body (60..100 across, 40..100 down) and an arm whose top left is welded to the body's bottom right (100, 100); in two objects, or in one
function model(oneObject = false): ModelContent {
  let c = addGroup(blank('Pivots'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addObject(c, 'g', { id: 'oa', name: 'Arm', layer: 'body', shapes: [] })
  c = addShape(c, 'ob', box('body', 60, 40, 40, 60))
  return addShape(c, oneObject ? 'ob' : 'oa', bindAt(box('arm', 100, 100, 20, 60), 0, weld('body', 2)))
}
// the same, made before pivot points: the body and the arm hung on two circles of a pivot at (100, 100)
function old(): ModelContent {
  let c = addGroup(blank('Old'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addObject(c, 'g', { id: 'oa', name: 'Arm', layer: 'body', shapes: [] })
  const ring = (id: string, r: number): ModelShape => ({ ...box(id, 100 - r, 100 - r, 2 * r, 2 * r), kind: 'pivot', pivot: { at: 'p1', turn: 0, lo: -180, hi: 180 } })
  c = addShape(c, 'ob', bindAt(box('body', 60, 40, 40, 60), 2, lock('c1', 0, 0.5)))
  c = addShape(c, 'ob', ring('c1', 6))
  c = addShape(c, 'oa', bindAt(box('arm', 100, 100, 20, 60), 0, lock('c2', 0, 0.5)))
  c = addShape(c, 'oa', ring('c2', 9))
  return { ...c, pivots: [{ id: 'p1', name: 'Shoulder', x: 100, y: 100 }] }
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
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: at.button ?? 0, clientX: at.x ?? 0, clientY: at.y ?? 0 }))
}
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)
const dotAt = (x: number, y: number) => Array.from(canvas().querySelectorAll('.cmPoint')).find(d => Math.abs(Number(d.getAttribute('cx')) - x) < 0.5 && Math.abs(Number(d.getAttribute('cy')) - y) < 0.5)!
const boxOf = (id: string) => {
  const nums = (pathOf(id)!.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}
async function pointForm(user: ReturnType<typeof userEvent.setup>, shapeId: string, inside: [number, number], at: [number, number]) {
  pointer(pathOf(shapeId)!, 'pointerdown', pixelOf(...inside))
  pointer(canvas(), 'pointerup', pixelOf(...inside))
  const dot = dotAt(...at)
  pointer(dot, 'pointerdown', { ...pixelOf(...at), button: 2 })
  pointer(canvas(), 'pointerup', { ...pixelOf(...at), button: 2 })
  return within(screen.getByRole('dialog', { name: 'Point type' }))
}

describe('a pivot point', () => {
  it('is a linked point toggled from its point form, drawn on the canvas, and turned in its section', async () => {
    const user = await open(model())
    const form = await pointForm(user, 'arm', [110, 130], [100, 100])
    expect(form.getByRole('button', { name: 'Pivot' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(form.getByRole('button', { name: 'Pivot' }))
    const mark = canvas().querySelector('[data-pivot-point="arm:0"] circle')!
    expect([Number(mark.getAttribute('cx')), Number(mark.getAttribute('cy'))]).toEqual([100, 100])
    // the point is still selected: its Pivot point section turns the arm about it, the body holds still
    const section = within(screen.getByRole('group', { name: 'Pivot point' }))
    await user.click(within(section.getByRole('group', { name: 'Turn' })).getByRole('button', { name: 'Raise Turn' }))
    expect(within(section.getByRole('group', { name: 'Turn' })).getByText('5°')).toBeInTheDocument()
    expect(boxOf('arm').x0).toBeLessThan(100)
    expect(boxOf('body')).toEqual({ x0: 60, x1: 100, y0: 40, y1: 100 })
  })

  it('joins two objects: a link inside one object is not made one', async () => {
    const user = await open(model(true))
    const form = await pointForm(user, 'arm', [110, 130], [100, 100])
    await user.click(form.getByRole('button', { name: 'Pivot' }))
    expect(screen.getByText(/A pivot point joins two objects/)).toBeInTheDocument()
    expect(canvas().querySelector('[data-pivot-point]')).toBeNull()
  })
})

describe('an old model with pivot circles', () => {
  it('has its circles turned into a pivot point when the shape editor opens it', async () => {
    await open(old())
    expect(pathOf('c1')).toBeNull()
    expect(pathOf('c2')).toBeNull()
    expect(canvas().querySelector('[data-pivot-point="arm:0"]')).not.toBeNull()
  })
})
