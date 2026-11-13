import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { layerToggle, pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Phase O3: the head-units layer (hidden until asked for; it reads the head bone) and the Taper tool (a line laid on the canvas becomes a ribbon, or an open line is turned into one).
vi.setConfig({ testTimeout: 30000 })

const sharp = (id: string, name: string, pts: Array<[number, number]>, closed = true): ModelShape => ({ id, name, closed, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })

// A head (crown y 0 to chin y 40) on a body down to the soles (y 300), a head bone from the chin to the crown, and an open line on the body.
function figure(head = true): ModelContent {
  let c = blank('Figure')
  c = addGroup(c, newGroup('gBody', 'Body'))
  c = addGroup(c, newGroup('gHead', 'Head', 'gBody'))
  c = addGroup(c, newGroup('gCrown', 'Crown', 'gHead'))
  c = addObject(c, 'gHead', { id: 'oHead', name: 'Head part', layer: 'body', shapes: [] }); c = addShape(c, 'oHead', sharp('head', 'Head shape', [[85, 0], [115, 0], [115, 40], [85, 40]]))
  c = addObject(c, 'gBody', { id: 'oBody', name: 'Body part', layer: 'body', shapes: [] }); c = addShape(c, 'oBody', sharp('body', 'Body shape', [[70, 40], [130, 40], [130, 300], [70, 300]]))
  // the open line curves (curve points), so its path is more than its three points
  c = addShape(c, 'oBody', { ...sharp('line', 'Line shape', [[80, 100], [100, 90], [120, 100]], false), pts: [[80, 100], [100, 90], [120, 100]].map(([x, y]) => ({ x, y, m: 'c' as const })) })
  c = { ...c, groups: c.groups.map(g => ({ ...g, pivot: g.id === 'gBody' ? [100, 300] as [number, number] : g.id === 'gHead' ? [100, 40] as [number, number] : [100, 0] as [number, number] })) }
  return head ? { ...c, bones: [{ id: 'bHead', name: 'Head', start: 'gHead', end: { kind: 'group', id: 'gCrown', i: 0 } }], headBone: 'bHead' } : c
}

async function open(head = true) {
  const backend = modelsBackend([draftEntry('a', figure(head))])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}
const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { clientX: ((wx - x) / w) * 704, clientY: ((wy - y) / h) * 616 } }
const press = (wx: number, wy: number) => {
  fireEvent(canvas(), new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...pixelOf(wx, wy) }))
  fireEvent(canvas(), new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }))
}
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
const taperBar = () => within(screen.getByRole('group', { name: 'Taper' }))

describe('the head units', () => {
  it('are hidden until asked for; shown, a line every head from the crown and the landmarks of a figure 7.5 heads tall', async () => {
    const { user } = await open()
    expect(layerToggle('Head units')).toHaveAttribute('aria-pressed', 'false')
    expect(canvas().querySelector('[data-layer="heads"]')).toBeNull()
    await user.click(layerToggle('Head units'))
    expect(layerToggle('Head units')).toHaveAttribute('aria-pressed', 'true')
    const layer = canvas().querySelector('[data-layer="heads"]')!
    expect(layer.querySelectorAll('[data-head]')).toHaveLength(9)
    expect(layer.querySelector('[data-mark="Chin"]')!.getAttribute('y1')).toBe('40')
    expect(layer.querySelector('[data-heads]')!.getAttribute('data-heads')).toBe('7.5')
    expect(layer.textContent).toContain('7.5 heads')
  })

  it('say how to make a head bone when the model has none', async () => {
    const { user } = await open(false)
    expect(layerToggle('Head units').getAttribute('title')).toMatch(/no head bone yet/)
    await user.click(layerToggle('Head units'))
    expect(canvas().querySelector('[data-layer="heads"]')).toBeNull()
  })
})

describe('the Taper tool', () => {
  it('lays a line with clicks on the canvas and makes a ribbon along it in the selected object', async () => {
    const { backend, user } = await open()
    await pick(user, 'Body part', 'object')
    await user.click(screen.getByRole('button', { name: 'Taper' }))
    expect(taperBar().getByRole('status')).toHaveTextContent(/It goes into Body part/)
    press(80, 200); press(100, 200); press(120, 200)
    expect(canvas().querySelectorAll('[data-taper-point]')).toHaveLength(3)
    expect(canvas().querySelector('[data-taper-preview]')).not.toBeNull()
    // the middle is 4 wide to begin with; two steps make it 5, and the ends come to a point
    await user.click(taperBar().getByRole('button', { name: 'Raise Middle width' }))
    await user.click(taperBar().getByRole('button', { name: 'Raise Middle width' }))
    fireEvent.keyDown(canvas(), { key: 'Enter' })
    expect(canvas().querySelector('[data-taper-preview]')).toBeNull()
    await save(user)
    const c = draft(backend)
    const ribbon = c.shapes.find(s => s.name === 'Ribbon')!
    expect(ribbon.closed).toBe(true)
    expect(c.objects.find(o => o.id === 'oBody')!.shapes).toContain(ribbon.id)
    expect(ribbon.pts).toHaveLength(4)
    expect(ribbon.pts[0]).toMatchObject({ x: 80, y: 200, m: 's' })
    expect(ribbon.pts[2]).toMatchObject({ x: 120, y: 200, m: 's' })
    expect(Math.abs(ribbon.pts[1].y - ribbon.pts[3].y)).toBeCloseTo(5, 6)
  })

  it('takes back a point with Backspace and starts the line over with Escape, then turns off', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Taper' }))
    press(80, 200); press(100, 210)
    fireEvent.keyDown(canvas(), { key: 'Backspace' })
    expect(canvas().querySelectorAll('[data-taper-point]')).toHaveLength(1)
    press(110, 220)
    fireEvent.keyDown(canvas(), { key: 'Escape' })
    expect(canvas().querySelectorAll('[data-taper-point]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Taper' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(canvas(), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Taper' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('turns the selected open line into a ribbon along its own path', async () => {
    const { backend, user } = await open()
    await pick(user, 'Line shape', 'shape')
    await user.click(screen.getByRole('button', { name: 'Taper' }))
    await user.click(taperBar().getByRole('button', { name: 'Taper this line' }))
    await save(user)
    const line = draft(backend).shapes.find(s => s.id === 'line')!
    expect(line.closed).toBe(true)
    // the curve resampled to 12 points: the two sharp ends and ten points down each side
    expect(line.pts).toHaveLength(22)
    expect(line.pts[0]).toMatchObject({ x: 80, y: 100, m: 's' })
    expect(line.pts[11]).toMatchObject({ x: 120, y: 100, m: 's' })
    // a closed shape cannot be tapered again
    expect(taperBar().getByRole('button', { name: 'Taper this line' })).toBeDisabled()
  })
})
