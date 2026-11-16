import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Every shape's centre in the shape editor (C1): shown on the selected and the hovered shape, offered to a dragged point (which links there), selected with a click (its
// panel: an anchor there, the points linked to it with their pivot), listed in the tree, and opened by a right-click with Anchor.
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// A is 60..100 across, B 120..160, both 100..140 down: B's centre is at (140, 120).
function two(): ModelContent {
  let c = addGroup(blank('Two'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'oA', name: 'A part', layer: 'body', shapes: [] })
  c = addShape(c, 'oA', sharp('a', [[60, 100], [100, 100], [100, 140], [60, 140]]))
  c = addObject(c, 'g', { id: 'oB', name: 'B part', layer: 'body', shapes: [] })
  return addShape(c, 'oB', sharp('b', [[120, 100], [160, 100], [160, 140], [120, 140]]))
}

async function open() {
  modelsBackend([draftEntry('m', two())])
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
const centreOf = (id: string) => canvas().querySelector(`[data-centre="${id}"]`)
function dragPoint(i: number, wx: number, wy: number, release = true) {
  const dot = dots()[i], [x, y] = at(dot)
  pointer(dot, 'pointerdown', pixelOf(x, y))
  pointer(canvas(), 'pointermove', pixelOf(wx, wy))
  if (release) pointer(canvas(), 'pointerup', pixelOf(wx, wy))
}
const clickCentre = (wx: number, wy: number, button = 0) => { pointer(canvas(), 'pointerdown', { ...pixelOf(wx, wy), button }); pointer(canvas(), 'pointerup', { ...pixelOf(wx, wy), button }) }

describe('a shape\'s centre on the canvas', () => {
  it('shows on the selected shape, and on another shape when the pointer is over it', async () => {
    await open()
    expect(centreOf('a')).toBeNull()
    select('a', 70, 110)
    expect(centreOf('a')).not.toBeNull()
    expect(centreOf('b')).toBeNull()
    pointer(canvas(), 'pointermove', pixelOf(140, 120.5))
    expect(centreOf('b')).toHaveClass('cmCentre--on')
  })

  it('takes a dragged point: it turns the alert colour there, and links to it when dropped', async () => {
    await open()
    select('a', 70, 110)
    dragPoint(1, 140.5, 120.4, false)
    expect(canvas().querySelector('[data-connect="center"]')).not.toBeNull()
    expect(centreOf('b')).toHaveClass('cmCentre--on')
    pointer(canvas(), 'pointerup', pixelOf(140.5, 120.4))
    expect(at(dots()[1])).toEqual([140, 120])
    expect(within(screen.getByRole('group', { name: 'Connections' })).getByText('On the centre of b shape')).toBeInTheDocument()
  })
})

describe('the selected centre', () => {
  it('is chosen with a click: its panel lists the points linked to it, each can be a pivot, and the shape can be anchored there', async () => {
    const user = await open()
    select('a', 70, 110)
    dragPoint(1, 140.5, 120.4)
    // A's point now sits on B's centre, so B is selected first: then the click is on its centre
    select('b', 130, 110)
    clickCentre(140, 120)
    expect(centreOf('b')).toHaveClass('cmCentre--sel')
    const panel = within(screen.getByRole('group', { name: 'Centre' }))
    expect(panel.getByText('Point 2 of a shape')).toBeInTheDocument()
    await user.click(panel.getByRole('button', { name: 'Pivot: point 2 of a shape' }))
    expect(within(screen.getByRole('group', { name: 'Centre' })).getByRole('button', { name: 'Pivot: point 2 of a shape' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(screen.getByRole('group', { name: 'Centre' })).getByRole('button', { name: 'Anchor at the centre' }))
    expect(within(screen.getByRole('group', { name: 'Centre' })).getByRole('button', { name: 'Anchor at the centre' })).toHaveAttribute('aria-pressed', 'true')
    // the tree lists it above the points, selected, with its anchor
    const points = within(screen.getByRole('list', { name: 'Points of b shape' }))
    expect(points.getByRole('button', { name: /Centre/ })).toHaveAttribute('aria-current', 'true')
    expect(points.getByRole('img', { name: 'The centre is an anchor' })).toBeInTheDocument()
  })

  it('is opened by a right-click on the selected shape\'s centre, with Anchor', async () => {
    const user = await open()
    select('b', 130, 110)
    clickCentre(140, 120, 2)
    const form = screen.getByRole('dialog', { name: 'Point type' })
    await user.click(within(form).getByRole('button', { name: 'Anchor' }))
    expect(canvas().querySelector('[data-anchor]')).not.toBeNull()
  })
})
