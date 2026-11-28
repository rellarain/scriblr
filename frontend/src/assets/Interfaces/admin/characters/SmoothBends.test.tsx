import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { NEW_JOINT } from './engine/pivots'

// Smooth bends in the shape editor (slice 9d): the Skin weights tool is back; it paints how much a shape follows the group next to it, and its Try the bend turns the pivot
// point between them. A shoulder's pivot point lets the shoulder blade follow the arm.
vi.setConfig({ testTimeout: 30000 })

const outline = (id: string, pts: Array<[number, number]>): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })),
})
const withBind = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })
// a body; an arm (group Arm) from its shoulder (130, 100) with a forearm (group Forearm) from the elbow (130, 160), joined by pivot points that turn at the joints
function model(): ModelContent {
  let c = addGroup(blank('Bends'), newGroup('torso', 'Torso'))
  c = addObject(c, 'torso', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addShape(c, 'ob', outline('body', [[60, 40], [140, 40], [140, 110], [60, 110]]))
  c = addGroup(c, { ...newGroup('arm', 'Arm'), parent: 'torso', pivot: [130, 100] })
  c = addObject(c, 'arm', { id: 'oa', name: 'Upper arm', layer: 'body', shapes: [] })
  c = addShape(c, 'oa', withBind(outline('upper', [[124, 100], [136, 100], [136, 164], [124, 164]]), 1,
    { kind: 'point', s: 'body', i: 2, d: [-4, -10], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT, lo: -180, hi: 30, name: 'Shoulder', kind: 'shoulder', at: [130, 100] } }))
  c = addGroup(c, { ...newGroup('fore', 'Forearm'), parent: 'arm', pivot: [130, 160] })
  c = addObject(c, 'fore', { id: 'of', name: 'Forearm', layer: 'body', shapes: [] })
  return addShape(c, 'of', withBind(outline('fore', [[124, 156], [130, 156], [136, 156], [136, 200], [124, 200]]), 3,
    { kind: 'point', s: 'upper', i: 2, d: [0, 36], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT, lo: 0, hi: 145, name: 'Elbow', kind: 'elbow', at: [130, 160] } }))
}
async function open() {
  const backend = modelsBackend([draftEntry('m', model())])
  const user = userEvent.setup()
  render(<DesignerConsole tools="shapes" />)
  await screen.findByRole('region', { name: 'Designer' })
  return { user, backend }
}
const canvas = () => screen.getByRole('application')
const viewBox = () => canvas().getAttribute('viewBox')!.split(' ').map(Number)
const pixelOf = (wx: number, wy: number) => { const [x, y, w, h] = viewBox(); return { x: ((wx - x) / w) * 704, y: ((wy - y) / h) * 616 } }
function pointer(el: Element, type: 'pointerdown' | 'pointerup', at: { x: number; y: number }) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: at.x, clientY: at.y }))
}
function select(id: string, wx: number, wy: number) {
  pointer(canvas().querySelector(`path[data-shape="${id}"]`)!, 'pointerdown', pixelOf(wx, wy))
  pointer(canvas(), 'pointerup', pixelOf(wx, wy))
}
const dotAt = (x: number, y: number) => Array.from(canvas().querySelectorAll('.cmPoint')).find(d => Math.abs(Number(d.getAttribute('cx')) - x) < 0.5 && Math.abs(Number(d.getAttribute('cy')) - y) < 0.5)!

describe('the Skin weights tool in the shape editor', () => {
  it('paints the forearm’s weights for the arm and tries the bend at the elbow’s pivot point', async () => {
    const { user } = await open()
    select('fore', 130, 180)
    await user.click(screen.getByRole('button', { name: 'Skin weights' }))
    const skin = within(screen.getByRole('group', { name: 'Skin weights' }))
    expect(skin.getByRole('combobox', { name: 'Follows' })).toHaveValue('arm')
    expect(skin.getByRole('status')).toHaveTextContent('No point of fore shape follows Arm yet')
    await user.click(skin.getByRole('button', { name: 'Auto' }))
    expect(skin.getByRole('status')).toHaveTextContent(/^\d+ points? of fore shape follows? Arm/)
    // the bend is the elbow's pivot point
    const bend = within(skin.getByRole('group', { name: 'Try the bend (Elbow)' }))
    expect(bend.getByText('0°')).toBeInTheDocument()
    expect(skin.getByRole('button', { name: 'Back to rest' })).toBeDisabled()
    await user.click(bend.getByRole('button', { name: 'Raise Try the bend (Elbow)' }))
    expect(within(skin.getByRole('group', { name: 'Try the bend (Elbow)' })).getByText('10°')).toBeInTheDocument()
    await user.click(skin.getByRole('button', { name: 'Back to rest' }))
    expect(within(skin.getByRole('group', { name: 'Try the bend (Elbow)' })).getByText('0°')).toBeInTheDocument()
  })
})

describe('the shoulder blade', () => {
  it('follows the arm once its shoulder’s pivot point says so', async () => {
    const { user } = await open()
    select('upper', 130, 130)
    pointer(dotAt(136, 100), 'pointerdown', pixelOf(136, 100))
    pointer(canvas(), 'pointerup', pixelOf(136, 100))
    const section = within(screen.getByRole('group', { name: 'Pivot point' }))
    expect(section.getByRole('combobox', { name: 'Stands for' })).toHaveValue('shoulder')
    const toggle = section.getByRole('button', { name: 'The shoulder blade follows the arm' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(within(screen.getByRole('group', { name: 'Pivot point' })).getByRole('button', { name: 'The shoulder blade follows the arm' })).toHaveAttribute('aria-pressed', 'true')
  })
})
