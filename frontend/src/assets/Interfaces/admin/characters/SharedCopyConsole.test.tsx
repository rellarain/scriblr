import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { enableSymmetry } from './engine/symmetry'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Shared segments on symmetric shapes in the shape editor (the user, 2026-11-15: "shared segments on symmetric shapes are shared on both segments"): the copy of a shared
// segment across the axis is drawn in the alert colour too, a drag on it moves the edge, a double-click adds a point to both halves of both shapes, and its panel shows the
// connection of the copy that is shared.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const symmetric = (s: ModelShape): ModelShape => {
  const r = enableSymmetry(s, { a: 90, n: 1 }, 0, 60)
  if (!r.ok) throw new Error(r.reason)
  return r.shape
}
const at = (s: ModelShape, x: number, y: number) => s.pts.findIndex(p => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6)
const weldTo = (s: string, i: number): ModelPoint['bind'] => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0 })
// a chest at 60..140 by 40..100 and a belly as wide under it (100..160): the belly's top left corner and top middle welded to the chest's, so the left half of the belly's top
// is shared with the left half of the chest's bottom, and its right half is a copy across the axis
function model(): ModelContent {
  const chest = symmetric(sharp('chest', [[60, 40], [140, 40], [140, 100], [60, 100]]))
  const b = symmetric(sharp('belly', [[60, 100], [140, 100], [140, 160], [60, 160]]))
  const belly = { ...b, pts: b.pts.map((p, k) => (k === at(b, 60, 100) ? { ...p, bind: weldTo('chest', at(chest, 60, 100)) } : k === at(b, 100, 100) ? { ...p, bind: weldTo('chest', at(chest, 100, 100)) } : p)) }
  let c = addGroup(blank('Shared'), newGroup('g', 'Body'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  c = addShape(c, 'o', chest)
  return addShape(c, 'o', belly)
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
const ysOf = (id: string) => numbers(id).filter((_, i) => i % 2 === 1)
const sharedOf = (id: string) => canvas().querySelectorAll(`[data-shared^="${id}:"]`)

describe('a shared segment on a symmetric shape', () => {
  it('is drawn shared on both halves', async () => {
    await open(model())
    expect(sharedOf('belly')).toHaveLength(2)
    expect(canvas().querySelectorAll('[data-shared-copy]')).toHaveLength(1)
  })

  it('moves its edge from the copy, as from the half that is shared', async () => {
    await open(model())
    click(pathOf('belly'), [100, 130])
    // a press on the right half of the belly's top, then 10 down: the edge moves along the line of symmetry, and no point is added
    pointer(pathOf('belly'), 'pointerdown', pixelOf(120, 100))
    pointer(canvas(), 'pointermove', pixelOf(120, 105))
    pointer(canvas(), 'pointermove', pixelOf(120, 110))
    pointer(canvas(), 'pointerup', pixelOf(120, 110))
    expect(screen.getByText('6 of 60')).toBeInTheDocument()
    expect(Math.max(...ysOf('chest'))).toBeCloseTo(110, 0)
    expect(Math.min(...ysOf('belly'))).toBeCloseTo(110, 0)
    expect(sharedOf('belly')).toHaveLength(2)
  })

  it('takes a double-click on the copy as a point on both halves of both shapes, still shared', async () => {
    await open(model())
    click(pathOf('belly'), [100, 130])
    const spot = pixelOf(120, 100)
    fireEvent.doubleClick(canvas(), { clientX: spot.x, clientY: spot.y })
    expect(screen.getByText('8 of 60')).toBeInTheDocument()
    expect(sharedOf('belly')).toHaveLength(4)
    expect(Math.max(...ysOf('chest'))).toBeCloseTo(100, 0)
  })

  it('shows the connection of the half that is shared in the panel of the copy', async () => {
    await open(model())
    click(pathOf('belly'), [100, 130])
    click(pathOf('belly'), [120, 100])
    const panel = within(screen.getByRole('group', { name: 'Connections' }))
    expect(panel.getByText(/^Shared with chest shape \(a copy of segment \d+\)$/)).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Disconnect the segment shared with chest shape' })).toBeInTheDocument()
  })
})
