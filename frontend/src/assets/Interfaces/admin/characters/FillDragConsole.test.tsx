import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Joints J1 in the shape editor: a drag in a shape's fill moves it (never reshapes it), with every shape connected to it; Ctrl with a box handle resizes about the middle;
// linked points and shared segments are drawn in the alert colour.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const weldTo = (s: string, i: number) => ({ kind: 'point' as const, s, i, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 })
const withBind = (s: ModelShape, i: number, bind: ModelPoint['bind']): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind } : p)) })
// A big square at 60..140 by 40..120; B beside it at 140..180, its left side welded to A's right side (a shared segment); C far off, on its own
function model(): ModelContent {
  let c = addGroup(blank('Fill'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', sharp('a', [[60, 40], [140, 40], [140, 120], [60, 120]]))
  c = addShape(c, 'o', withBind(withBind(sharp('b', [[140, 40], [180, 40], [180, 120], [140, 120]]), 0, weldTo('a', 1)), 3, weldTo('a', 2)))
  return addShape(c, 'o', sharp('c', [[0, 200], [40, 200], [40, 240], [0, 240]]))
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
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x?: number; y?: number; ctrlKey?: boolean } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: at.x ?? 0, clientY: at.y ?? 0, ctrlKey: at.ctrlKey ?? false }))
}
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`)!
const click = (el: Element, at: [number, number]) => { pointer(el, 'pointerdown', pixelOf(...at)); pointer(canvas(), 'pointerup', pixelOf(...at)) }
const numbers = (id: string) => (pathOf(id).getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number)
const xsOf = (id: string) => numbers(id).filter((_, i) => i % 2 === 0)
function drag(el: Element, from: [number, number], to: [number, number], ctrlKey = false) {
  pointer(el, 'pointerdown', pixelOf(...from))
  pointer(canvas(), 'pointermove', { ...pixelOf((from[0] + to[0]) / 2, (from[1] + to[1]) / 2), ctrlKey })
  pointer(canvas(), 'pointermove', { ...pixelOf(...to), ctrlKey })
  pointer(canvas(), 'pointerup', pixelOf(...to))
}

describe('a drag in the fill', () => {
  it('moves the shape even close to its outline, with the shapes connected to it, and not a shape on its own', async () => {
    await open(model())
    click(pathOf('a'), [100, 80])
    // a press 4 units inside A's left side, then 10 right: no point is added, and A, B move together; C stays
    drag(pathOf('a'), [64, 80], [74, 80])
    expect(screen.getByText('4 of 60')).toBeInTheDocument()
    expect(Math.min(...xsOf('a'))).toBeCloseTo(70, 0)
    expect(Math.max(...xsOf('b'))).toBeCloseTo(190, 0)
    expect(Math.min(...xsOf('c'))).toBeCloseTo(0, 1)
  })
})

describe('a resize with Ctrl', () => {
  it('moves both sides about the middle', async () => {
    await open(model())
    click(pathOf('c'), [20, 220])
    const h = canvas().querySelector('[data-handle="e"]')!
    const x = Number(h.getAttribute('x')) + Number(h.getAttribute('width')) / 2, y = Number(h.getAttribute('y')) + Number(h.getAttribute('height')) / 2
    // the right side taken to 50 (the side follows the pointer): the left side goes as far out, to -10
    pointer(h, 'pointerdown', pixelOf(x, y))
    pointer(canvas(), 'pointermove', { ...pixelOf(x + 20, y), ctrlKey: true })
    pointer(canvas(), 'pointermove', { ...pixelOf(50, y), ctrlKey: true })
    pointer(canvas(), 'pointerup', pixelOf(50, y))
    expect(Math.min(...xsOf('c'))).toBeCloseTo(-10, 0)
    expect(Math.max(...xsOf('c'))).toBeCloseTo(50, 0)
  })
})

describe('links', () => {
  it('draw linked points and shared segments in the alert colour', async () => {
    await open(model())
    click(pathOf('a'), [100, 80])
    // A's points 2 and 3 have B welded to them
    const linked = Array.from(canvas().querySelectorAll('.cmPoint--linked')).map(d => d.getAttribute('aria-label'))
    expect(linked).toEqual(['Point 2, linked', 'Point 3, linked'])
    // B's left side runs along A's right side
    expect(canvas().querySelector('[data-shared="b:3"]')).not.toBeNull()
    expect(within(canvas()).queryAllByRole('button', { name: /linked/ })).toHaveLength(2)
  })
})
