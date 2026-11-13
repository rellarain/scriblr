import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, ModelPoint, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { pick } from '../../../../test/designerUi'

vi.setConfig({ testTimeout: 30000 })

const pt = (x: number, y: number, over: Partial<ModelPoint> = {}): ModelPoint => ({ x, y, m: 's', ...over })
const poly = (id: string, name: string, pts: ModelPoint[], over: Partial<ModelShape> = {}): ModelShape => ({ id, name, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts, ...over })
// the rows of an arm, shoulder to wrist (the elbow at y 100), down the left side and back up the right
const ROWS = [20, 60, 90, 100, 110, 140, 180]
const armPts = (): ModelPoint[] => [...ROWS.map(y => pt(90, y)), ...[...ROWS].reverse().map(y => pt(110, y))]

// An upper arm whose one shape runs down to the wrist, and a forearm hung from it at the elbow, bent by a slider; a sleeve shape in the upper arm's group.
function figure(over: Partial<ModelShape> = {}): ModelContent {
  let c = blank('Skinned')
  c = addGroup(c, { ...newGroup('gUp', 'Upper arm', null, []), pivot: [100, 20] })
  c = addGroup(c, { ...newGroup('gFore', 'Forearm', 'gUp', []), pivot: [100, 100] })
  c = addObject(c, 'gUp', { id: 'oArm', name: 'Arm part', layer: 'body', shapes: [] })
  c = addShape(c, 'oArm', poly('arm', 'Arm shape', armPts(), over))
  c = addObject(c, 'gUp', { id: 'oSleeve', name: 'Sleeve part', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oSleeve', poly('sleeve', 'Sleeve shape', [pt(88, 150), pt(112, 150), pt(112, 182), pt(88, 182)]))
  c = addObject(c, 'gFore', { id: 'oHand', name: 'Hand part', layer: 'body', shapes: [] })
  c = addShape(c, 'oHand', poly('hand', 'Hand shape', [pt(92, 182), pt(108, 182), pt(108, 196), pt(92, 196)]))
  return { ...c, ranges: [{ id: 'elbow', name: 'Elbow', scope: null, min: -150, rest: 0, max: 150, unit: '°', show: true, rand: null, drives: [{ kind: 'turn', group: 'gFore', target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: -150, atMax: 150, mirror: true }] }] }
}

async function open(c: ModelContent = figure()) {
  const backend = modelsBackend([draftEntry('a', c)])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}
type User = ReturnType<typeof userEvent.setup>
const save = (user: User) => user.click(screen.getByRole('button', { name: 'Save' }))
const shape = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.shapes.find(s => s.id === id)!
const canvas = () => screen.getByRole('application')
const point = (n: number) => screen.getByRole('button', { name: new RegExp(`^Point ${n}\\b`) })
const press = (el: Element, type: 'pointerdown' | 'pointerup' | 'pointermove', at: { clientX?: number; clientY?: number; shiftKey?: boolean } = {}) => fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...at }))
const click = (el: Element, shiftKey = false) => { press(el, 'pointerdown', { shiftKey }); press(canvas(), 'pointerup') }
const skinTool = () => screen.getByRole('button', { name: 'Skin weights' })
const panel = () => screen.getByRole('group', { name: 'Skin weights' })
// where a point of the selected shape is on the screen (the canvas is drawn at its fallback size in tests, from its left top corner)
function screenOf(n: number): { clientX: number; clientY: number } {
  const c = point(n), [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
  return { clientX: ((Number(c.getAttribute('cx')) - x) / w) * 704, clientY: ((Number(c.getAttribute('cy')) - y) / h) * 616 }
}

describe('the Skin tool', () => {
  it('starts on the group hung at the nearest joint and steps a point a tenth at each click', async () => {
    const { backend, user } = await open()
    await pick(user, 'Arm shape')
    await user.click(skinTool())
    expect(skinTool()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Follows' })).toHaveValue('gFore')
    expect(point(4)).toHaveAccessibleName('Point 4, skin weight 0%')
    click(point(4)); click(point(4)); click(point(4))
    expect(point(4)).toHaveAccessibleName('Point 4, skin weight 30%')
    expect(document.querySelector('[data-skin="0.3"]')).not.toBeNull()
    click(point(4), true)
    expect(point(4)).toHaveAccessibleName('Point 4, skin weight 20%')
    await save(user)
    expect(shape(backend, 'arm').skin).toEqual([{ g: 'gFore', w: armPts().map((_, i) => (i === 3 ? 0.2 : 0)) }])
  })

  it('makes weights across the joint with Auto, and a bend can be tried while they are painted', async () => {
    const { backend, user } = await open()
    await pick(user, 'Arm shape')
    await user.click(skinTool())
    await user.click(screen.getByRole('button', { name: 'Auto' }))
    await save(user)
    const w = shape(backend, 'arm').skin![0].w
    expect(w[0]).toBe(0); expect(w[3]).toBe(0.5); expect(w[6]).toBe(1)
    const before = document.querySelector('path[data-shape="arm"]')!.getAttribute('d')
    await user.click(screen.getByRole('button', { name: 'Raise Try the bend (Elbow)' }))
    expect(screen.getByRole('group', { name: 'Try the bend (Elbow)' })).toHaveTextContent('10°')
    expect(document.querySelector('path[data-shape="arm"]')!.getAttribute('d')).not.toBe(before)
    // the shape is posed, so its points are shown and not dragged, but the weights can still be painted
    click(point(3))
    expect(point(3)).toHaveAccessibleName('Point 3, skin weight 10%')
    await user.click(screen.getByRole('button', { name: 'Back to rest' }))
    expect(screen.getByRole('group', { name: 'Try the bend (Elbow)' })).toHaveTextContent('0°')
  })

  it('paints the points near the pointer to the strength when dragged', async () => {
    const { backend, user } = await open()
    await pick(user, 'Arm shape')
    await user.click(skinTool())
    await user.click(screen.getByRole('button', { name: 'Lower Strength' }))   // 90%
    const from = screenOf(7)
    press(point(7), 'pointerdown', from)
    press(canvas(), 'pointermove', { clientX: from.clientX + 6, clientY: from.clientY })
    press(canvas(), 'pointerup')
    await save(user)
    const w = shape(backend, 'arm').skin![0].w
    expect(w[6]).toBe(0.9)
    expect(w.filter(v => v > 0).length).toBeLessThan(5)
  })

  it('smooths, clears and copies from the shape under it', async () => {
    const { backend, user } = await open()
    await pick(user, 'Arm shape')
    await user.click(skinTool())
    await user.click(screen.getByRole('button', { name: 'Auto' }))
    await user.click(screen.getByRole('button', { name: 'Smooth' }))
    await save(user)
    expect(shape(backend, 'arm').skin![0].w[2]).toBeGreaterThan(0)
    // the sleeve takes the arm's weights where it lies over it
    await pick(user, 'Sleeve shape')
    expect(screen.getByRole('combobox', { name: 'Follows' })).toHaveValue('gFore')
    await user.click(screen.getByRole('button', { name: 'Copy from a shape' }))
    press(document.querySelector('path[data-shape="arm"]')!, 'pointerdown')
    await save(user)
    expect(shape(backend, 'sleeve').skin![0].g).toBe('gFore')
    expect(shape(backend, 'sleeve').skin![0].w[2]).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await save(user)
    expect(shape(backend, 'sleeve').skin).toEqual([])
  })

  it('says why a twin cannot be painted', async () => {
    let c = figure()
    c = addObject(c, 'gUp', { id: 'oArm2', name: 'Arm twin part', layer: 'body', shapes: [], mirrorOf: 'oArm' })
    c = addShape(c, 'oArm2', poly('arm2', 'Arm twin', [], { mirrorOf: 'arm' }))
    await open(c).then(async ({ user }) => {
      await pick(user, 'Arm twin')
      await user.click(skinTool())
      expect(panel()).toHaveTextContent('This is a twin: it is skinned as its original is. Paint the original.')
      expect(screen.queryByRole('button', { name: 'Auto' })).toBeNull()
    })
  })

  it('keeps the weights with their points when a point is taken away', async () => {
    const skin = [{ g: 'gFore', w: armPts().map(p => (p.y >= 110 ? 1 : p.y === 100 ? 0.5 : 0)) }]
    const { backend, user } = await open(figure({ skin }))
    await pick(user, 'Arm shape')
    click(point(2))   // a click without a drag steps its handles; select it, then delete it
    canvas().focus()
    await user.keyboard('{Delete}')
    await save(user)
    // mirror editing is on, so the point that mirrors it on the right side goes too
    const s = shape(backend, 'arm')
    expect(s.pts.length).toBe(12)
    expect(s.skin![0].w).toEqual(skin[0].w.filter((_, i) => i !== 1 && i !== 12))
  })
})
