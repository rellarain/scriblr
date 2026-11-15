import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { enableSymmetry } from './engine/symmetry'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Lines of symmetry in the shape editor (Z5): a selected symmetric shape shows a handle at each end of its line and one on its outline; dragging an end lengthens the
// shape along the line (with the symmetric shapes linked to it on the same line), dragging the side handle widens it evenly; each drag is one undo step.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const symmetric = (s: ModelShape): ModelShape => {
  const r = enableSymmetry(s, { a: 90, n: 1 }, 0, 60)
  if (!r.ok) throw new Error(r.reason)
  return r.shape
}
const at = (s: ModelShape, x: number, y: number) => s.pts.findIndex(p => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6)
const weldTo = (s: string, i: number): ModelPoint['bind'] => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
// a chest at 60..140 by 40..100 with a belly hung under it (70..130 by 100..160), its top end welded to the chest's bottom end: one line down x = 100, from 40 to 160;
// a plain square far off
function model(): ModelContent {
  const chest = symmetric(sharp('chest', [[60, 40], [140, 40], [140, 100], [60, 100]]))
  const b = symmetric(sharp('belly', [[70, 100], [130, 100], [130, 160], [70, 160]]))
  const belly = { ...b, pts: b.pts.map((p, k) => (k === at(b, 100, 100) ? { ...p, bind: weldTo('chest', at(chest, 100, 100)) } : p)) }
  let c = addGroup(blank('Lines'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', chest)
  c = addShape(c, 'o', belly)
  return addShape(c, 'o', sharp('plain', [[0, 200], [40, 200], [40, 240], [0, 240]]))
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
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', p: { x: number; y: number }) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: p.x, clientY: p.y }))
}
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const click = (el: Element, w: [number, number]) => { pointer(el, 'pointerdown', pixelOf(...w)); pointer(canvas(), 'pointerup', pixelOf(...w)) }
const numbers = (id: string) => (pathOf(id).getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
const xsOf = (id: string) => numbers(id).filter((_, i) => i % 2 === 0)
const ysOf = (id: string) => numbers(id).filter((_, i) => i % 2 === 1)
const spot = (el: Element): [number, number] => (el.tagName === 'circle'
  ? [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]
  : [Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2, Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2])
function drag(el: Element, to: [number, number]) {
  const from = spot(el)
  pointer(el, 'pointerdown', pixelOf(...from))
  pointer(canvas(), 'pointermove', pixelOf((from[0] + to[0]) / 2, (from[1] + to[1]) / 2))
  pointer(canvas(), 'pointermove', pixelOf(...to))
  pointer(canvas(), 'pointerup', pixelOf(...to))
}
const ends = () => screen.getAllByRole('button', { name: /^Lengthen along the line from its (first|second) end$/ })
const bottomEnd = () => ends().reduce((a, b) => (spot(b)[1] > spot(a)[1] ? b : a))

describe('the handles of a line of symmetry', () => {
  it('show on a selected symmetric shape, at the ends of the line it shares, and not on a plain shape', async () => {
    await open(model())
    click(pathOf('chest'), [100, 70])
    expect(ends()).toHaveLength(2)
    expect(ends().map(e => spot(e)[1]).sort((a, b) => a - b)).toEqual([40, 160])
    expect(screen.getByRole('button', { name: 'Widen across the line' })).toBeInTheDocument()
    expect(canvas().querySelector('[data-line-span]')).not.toBeNull()
    click(pathOf('plain'), [20, 220])
    expect(screen.queryAllByRole('button', { name: /^Lengthen along the line/ })).toHaveLength(0)
  })
})

describe('dragging an end of the line', () => {
  it('lengthens every shape on the line about the far end, each keeping its share, as one undo step', async () => {
    const user = await open(model())
    click(pathOf('chest'), [100, 70])
    // the bottom end from 160 to 220: the line half as long again, about its top at 40
    drag(bottomEnd(), [100, 220])
    expect(Math.min(...ysOf('chest'))).toBeCloseTo(40, 0)
    expect(Math.max(...ysOf('chest'))).toBeCloseTo(130, 0)
    expect(Math.min(...ysOf('belly'))).toBeCloseTo(130, 0)
    expect(Math.max(...ysOf('belly'))).toBeCloseTo(220, 0)
    expect(Math.min(...xsOf('chest'))).toBeCloseTo(60, 0)
    expect(Math.max(...xsOf('chest'))).toBeCloseTo(140, 0)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(Math.max(...ysOf('chest'))).toBeCloseTo(100, 0)
    expect(Math.max(...ysOf('belly'))).toBeCloseTo(160, 0)
  })
})

describe('the width handle', () => {
  it('widens the shape evenly on both sides of its line, and only that shape', async () => {
    await open(model())
    click(pathOf('chest'), [100, 70])
    const side = screen.getByRole('button', { name: 'Widen across the line' }), [sx, sy] = spot(side)
    // 40 from the line to 50 from it
    drag(side, [sx + Math.sign(sx - 100) * 10, sy])
    expect(Math.min(...xsOf('chest'))).toBeCloseTo(50, 0)
    expect(Math.max(...xsOf('chest'))).toBeCloseTo(150, 0)
    expect(Math.min(...xsOf('belly'))).toBeCloseTo(70, 0)
    expect(Math.max(...xsOf('belly'))).toBeCloseTo(130, 0)
  })
})
