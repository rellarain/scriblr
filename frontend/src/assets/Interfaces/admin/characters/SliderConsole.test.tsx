import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addPivot } from './engine/pivots'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Sliders and posable points in the shape editor (shape types T5): the point form makes a point locked onto a segment a slider, whose two stops are dragged on the outline
// while its shape is edited and which slides between them; in Pose mode a slider is dragged along and a posable point is dragged to reach, and Reset pose puts them back.
vi.setConfig({ testTimeout: 30000 })

const box = (id: string, x: number, y: number, w: number, h: number): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null,
  pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => ({ x: px, y: py, m: 's' as const })),
})
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0 })
function rail(slide = false): ModelContent {
  let c = addGroup(blank('Sliders'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('rail', 40, 60, 100, 100))
  // its bottom left corner is locked onto the rail's top edge (drawn there, below the rest of the bead)
  const bead = box('bead', 80, 20, 20, 20)
  return addShape(c, 'o', { ...bead, pts: bead.pts.map((p, i) => (i === 3 ? { ...p, bind: { ...lock('rail', 0, 0.5), slide: slide ? { lo: 0, hi: 1, at: null } : null } } : p)) })
}
function figure(): ModelContent {
  let c = addGroup(blank('Posing'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', box('body', 60, 40, 40, 60))
  c = addPivot(c, 'o', 80, 100, { pivot: 'p1', circles: ['c1', 'c2'] })
  c = addShape(c, 'o', box('arm', 74, 100, 12, 60))
  return {
    ...c,
    shapes: c.shapes.map(s => (s.id === 'body'
      ? { ...s, pts: s.pts.map((p, i) => (i === 3 ? { ...p, bind: lock('c1', 0, 0.5) } : p)), marks: [{ id: 'k1', kind: 'anchor' as const, x: 60, y: 40, i: 0, name: '' }] }
      : s.id === 'arm' ? { ...s, pts: s.pts.map((p, i) => (i === 0 ? { ...p, bind: lock('c2', 1, 0.5) } : p)) } : s)),
  }
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
function dragOn(el: Element, from: [number, number], to: [number, number]) {
  pointer(el, 'pointerdown', pixelOf(...from))
  pointer(canvas(), 'pointermove', pixelOf((from[0] + to[0]) / 2, (from[1] + to[1]) / 2))
  pointer(canvas(), 'pointermove', pixelOf(...to))
  pointer(canvas(), 'pointerup', pixelOf(...to))
}
const click = (el: Element, at: [number, number]) => { pointer(el, 'pointerdown', pixelOf(...at)); pointer(canvas(), 'pointerup', pixelOf(...at)) }
const rightClick = (el: Element, at: [number, number]) => { pointer(el, 'pointerdown', { ...pixelOf(...at), button: 2 }); pointer(canvas(), 'pointerup', { ...pixelOf(...at), button: 2 }) }
const dotAt = (x: number, y: number) => Array.from(canvas().querySelectorAll('.cmPoint')).find(d => Math.abs(Number(d.getAttribute('cx')) - x) < 0.5 && Math.abs(Number(d.getAttribute('cy')) - y) < 0.5)!
const centreOf = (el: Element) => { const x = Number(el.getAttribute('x')), w = Number(el.getAttribute('width')); return { x: x + w / 2, y: Number(el.getAttribute('y')) + w / 2 } }
// where the bead's locked corner is drawn: its lowest point
const beadCorner = () => {
  const nums = (pathOf('bead').getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
  let best: [number, number] = [0, -Infinity]
  for (let i = 0; i + 1 < nums.length; i += 2) if (nums[i + 1] > best[1]) best = [nums[i], nums[i + 1]]
  return best
}

describe('a slider', () => {
  it('is made from the point form of a point locked onto a segment, with its two stops shown', async () => {
    const user = await open(rail())
    click(pathOf('bead'), [90, 35])
    rightClick(dotAt(90, 60), [90, 60])
    const form = within(screen.getByRole('dialog', { name: 'Point type' }))
    await user.click(form.getByRole('button', { name: 'Slider' }))
    const stops = canvas().querySelectorAll('[data-stop]')
    expect(stops).toHaveLength(2)
    expect(centreOf(stops[0]).x).toBeCloseTo(40, 0)
    expect(centreOf(stops[0]).y).toBeCloseTo(60, 0)
    expect(centreOf(stops[1]).x).toBeCloseTo(140, 0)
    rightClick(dotAt(90, 60), [90, 60])
    expect(within(screen.getByRole('dialog', { name: 'Point type' })).getByRole('button', { name: 'Slider' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('slides between its stops, which are dragged along the outline', async () => {
    await open(rail(true))
    click(pathOf('bead'), [90, 35])
    // the second stop dragged in to 120 across: a drag of the point past it stops there
    const second = canvas().querySelectorAll('[data-stop]')[1]
    dragOn(second, [140, 60], [120, 58])
    expect(centreOf(canvas().querySelectorAll('[data-stop]')[1]).x).toBeCloseTo(120, 0)
    dragOn(dotAt(90, 60), [90, 60], [135, 60])
    expect(beadCorner()[0]).toBeCloseTo(120, 0)
  })

  it('slides in Pose mode, and Reset pose puts it back', async () => {
    const user = await open(rail(true))
    // Pose mode is on while a group is selected
    expect(canvas().querySelector('[data-slider]')).toBeNull()
    await user.click(within(screen.getByRole('navigation', { name: 'Model tree' })).getByRole('button', { name: 'Group' }))
    const handle = canvas().querySelector('[data-slider]')!
    dragOn(handle, [90, 60], [130, 62])
    expect(beadCorner()[0]).toBeCloseTo(130, 0)
    await user.click(screen.getByRole('button', { name: 'Reset pose' }))
    expect(beadCorner()[0]).toBeCloseTo(90, 0)
  })
})

describe('a posable point', () => {
  it('is made from the point form and listed, and in Pose mode it reaches', async () => {
    const user = await open(figure())
    click(pathOf('arm'), [80, 130])
    rightClick(dotAt(86, 160), [86, 160])
    await user.click(within(screen.getByRole('dialog', { name: 'Point type' })).getByRole('button', { name: 'Posable' }))
    expect(within(screen.getByRole('group', { name: 'Posable points' })).getByRole('textbox', { name: 'Name of posable point 1' })).toBeInTheDocument()
    // the group selected: the posable point is grabbed and reaches to the left
    click(canvas(), [200, 300])
    expect(screen.queryByRole('button', { name: 'Pose with the posable point' })).toBeNull()
    await user.click(within(screen.getByRole('navigation', { name: 'Model tree' })).getByRole('button', { name: 'Group' }))
    const mark = screen.getByRole('button', { name: 'Pose with the posable point' })
    dragOn(mark, [86, 160], [20, 106])
    const moved = screen.getByRole('button', { name: 'Pose with the posable point' })
    expect(Number(moved.getAttribute('cx'))).toBeLessThan(40)
    expect(screen.getByRole('button', { name: 'Reset pose' })).toBeInTheDocument()
  })
})
