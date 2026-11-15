import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { NEW_JOINT } from './engine/pivots'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Anchors and Pose mode in the shape editor (shape types T4; joints J3): the point form pins a point (or a spot inside a shape) with an anchor; an anchored point and an anchored
// shape cannot be moved; with a group or an object selected a drag on an object poses it (reaching at the pivot point between it and the anchor, or with no anchor the figure
// hanging from what is held) and a click selects; Reset pose puts it back.
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0 })

// a body (object Body) and an arm (object Arm) hung below it: the arm's top middle (80, 100) is locked onto the body's bottom and made a pivot point; the body may carry an
// anchor on its top left corner
function model(anchored = false): ModelContent {
  let c = addGroup(blank('Posing'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addObject(c, 'g', { id: 'oa', name: 'Arm', layer: 'body', shapes: [] })
  const body = box('body', 60, 40, 40, 60)
  c = addShape(c, 'ob', { ...body, marks: anchored ? [{ id: 'k1', kind: 'anchor' as const, x: 60, y: 40, i: 0, name: '' }] : [] })
  const arm: ModelShape = { ...box('arm', 0, 0, 0, 0), pts: [[74, 100], [80, 100], [86, 100], [86, 160], [80, 160], [74, 160]].map(([x, y]) => ({ x, y, m: 's' as const })) }
  return addShape(c, 'oa', { ...arm, pts: arm.pts.map((p, i) => (i === 1 ? { ...p, bind: { ...lock('body', 2, 0.5), pivot: { ...NEW_JOINT } } } : p)) })
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
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const boxOf = (id: string) => {
  const nums = (pathOf(id).getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}
function dragOn(el: Element, from: [number, number], to: [number, number]) {
  pointer(el, 'pointerdown', pixelOf(...from))
  pointer(canvas(), 'pointermove', pixelOf((from[0] + to[0]) / 2, (from[1] + to[1]) / 2))
  pointer(canvas(), 'pointermove', pixelOf(...to))
  pointer(canvas(), 'pointerup', pixelOf(...to))
}
const click = (el: Element, at: [number, number]) => { pointer(el, 'pointerdown', pixelOf(...at)); pointer(canvas(), 'pointerup', pixelOf(...at)) }
const rightClick = (el: Element, at: [number, number]) => { pointer(el, 'pointerdown', { ...pixelOf(...at), button: 2 }); pointer(canvas(), 'pointerup', { ...pixelOf(...at), button: 2 }) }
const dots = () => Array.from(canvas().querySelectorAll('.cmPoint'))
const dotAt = (x: number, y: number) => dots().find(d => Number(d.getAttribute('cx')) === x && Number(d.getAttribute('cy')) === y)!
const anchors = () => canvas().querySelectorAll('[data-anchor]')
// Pose mode is on while a group (or an object) is selected: its card in the tree
const poseGroup = (user: ReturnType<typeof userEvent.setup>) => user.click(within(screen.getByRole('navigation', { name: 'Model tree' })).getByRole('button', { name: 'Group' }))

describe('anchors', () => {
  it('pin a point from the point form, are listed with a name, and come off again', async () => {
    const user = await open(model())
    click(pathOf('body'), [80, 60])
    rightClick(dotAt(100, 40), [100, 40])
    const form = within(screen.getByRole('dialog', { name: 'Point type' }))
    expect(form.getByRole('button', { name: 'Anchor' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(form.getByRole('button', { name: 'Anchor' }))
    expect(anchors()).toHaveLength(1)
    const list = within(screen.getByRole('group', { name: 'Anchors' }))
    await user.type(list.getByRole('textbox', { name: 'Name of anchor 1' }), 'Hip')
    expect(canvas().querySelector('[data-anchor] title')!.textContent).toBe('Hip')
    rightClick(dotAt(100, 40), [100, 40])
    await user.click(within(screen.getByRole('dialog', { name: 'Point type' })).getByRole('button', { name: 'Anchor' }))
    expect(anchors()).toHaveLength(0)
    expect(screen.queryByRole('group', { name: 'Anchors' })).toBeNull()
  })

  it('go inside a shape from a right-click away from its points, and are deleted from the list', async () => {
    const user = await open(model())
    click(pathOf('body'), [80, 60])
    rightClick(pathOf('body'), [80, 60])
    const form = within(screen.getByRole('dialog', { name: 'Point type' }))
    expect(form.queryByRole('group', { name: 'Curve of the point' })).toBeNull()
    await user.click(form.getByRole('button', { name: 'Anchor' }))
    const mark = canvas().querySelector('[data-anchor]')!
    expect(Number(mark.getAttribute('x')) + Number(mark.getAttribute('width')) / 2).toBeCloseTo(80, 0)
    await user.click(within(screen.getByRole('group', { name: 'Anchors' })).getByRole('button', { name: 'Delete anchor 1' }))
    expect(anchors()).toHaveLength(0)
  })

  it('hold their point and their shape where they are', async () => {
    await open(model(true))
    click(pathOf('body'), [80, 60])
    dragOn(dotAt(60, 40), [60, 40], [40, 30])
    expect(screen.getByText(/An anchored point cannot be moved/)).toBeInTheDocument()
    expect(dotAt(60, 40)).toBeDefined()
    dragOn(pathOf('body'), [80, 60], [90, 70])
    expect(screen.getByText(/An anchored shape cannot be moved/)).toBeInTheDocument()
    expect(boxOf('body').x0).toBeCloseTo(60, 0)
  })
})

describe('Pose mode', () => {
  it('turns an object at its pivot point when its group is selected, and Reset pose puts it back', async () => {
    const user = await open(model(true))
    await poseGroup(user)
    expect(screen.queryByRole('button', { name: 'Reset pose' })).toBeNull()
    // the arm hangs below the pivot: dragged a quarter round, it lies to the left
    dragOn(pathOf('arm'), [80, 150], [30, 100])
    expect(boxOf('arm').x0).toBeLessThan(40)
    expect(boxOf('body').x0).toBeCloseTo(60, 0)
    await user.click(screen.getByRole('button', { name: 'Reset pose' }))
    expect(boxOf('arm').y1).toBeGreaterThan(150)
    expect(screen.queryByRole('button', { name: 'Reset pose' })).toBeNull()
  })

  it('poses an object when it is selected', async () => {
    const user = await open(model(true))
    const tree = within(screen.getByRole('navigation', { name: 'Model tree' }))
    await user.click(tree.getByRole('button', { name: 'Expand Group' }))
    await user.click(tree.getByRole('button', { name: 'Arm' }))
    dragOn(pathOf('arm'), [80, 150], [30, 100])
    expect(boxOf('arm').x0).toBeLessThan(40)
    expect(screen.getByRole('button', { name: 'Reset pose' })).toBeInTheDocument()
  })

  it('is off with the model selected: a drag on a figure does not pose it', async () => {
    await open(model(true))
    dragOn(pathOf('arm'), [80, 150], [30, 100])
    // (the drag edits instead: nothing is posed)
    expect(screen.queryByRole('button', { name: 'Reset pose' })).toBeNull()
  })

  it('selects a shape that is clicked without moving', async () => {
    const user = await open(model(true))
    await poseGroup(user)
    click(pathOf('arm'), [80, 150])
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('arm shape')
  })

  it('with no anchor lets the figure hang from what is held', async () => {
    const user = await open(model())
    await poseGroup(user)
    const arm = boxOf('arm')
    dragOn(pathOf('arm'), [80, 150], [90, 150])
    // the arm followed the pointer; the body swung down below the pivot
    expect(boxOf('arm').x0 - arm.x0).toBeCloseTo(10, 0)
    expect(boxOf('body').y0).toBeGreaterThan(90)
    expect(screen.getByRole('button', { name: 'Reset pose' })).toBeInTheDocument()
  })

  it('turns the figure about the anchor of its anchored shape', async () => {
    const user = await open(model(true))
    await poseGroup(user)
    // the anchored body is the figure's root: with its one anchor (its top left corner) it turns about it
    dragOn(pathOf('body'), [95, 50], [95, 90])
    expect(boxOf('body').x0).not.toBeCloseTo(60, 0)
    expect(Number(canvas().querySelector('[data-anchor]')!.getAttribute('x')) + 3.5 * (viewBox()[2] / 704)).toBeCloseTo(60, 0)
  })
})
