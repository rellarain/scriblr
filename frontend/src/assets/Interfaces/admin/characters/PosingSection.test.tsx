import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { renameMark, toggleAnchor, togglePosable } from './engine/anchors'
import { makeTwin } from './engine/pairEdit'
import { NEW_JOINT } from './engine/pivots'

// Posing in the shape editor (slice 9d): the Overview's Joint limits (every joint, set for the body the model is) and Pose (drag to pose, what holds still, reset, saved
// poses); a twin's posable point poses the twin's own arm.
vi.setConfig({ testTimeout: 30000 })

const outline = (id: string, pts: Array<[number, number]>): ModelShape => ({
  id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })),
})
const link = (kind: ModelBind['kind'], s: string, i: number, e: number, t: number, pivot: Partial<typeof NEW_JOINT> & { name?: string; kind?: 'shoulder' | 'elbow' }): ModelBind =>
  ({ kind, s, i, d: [0, 0], e, t, o: 0, pivot: { ...NEW_JOINT, ...pivot } })
const bind = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })
const edit = (c: ModelContent, id: string, f: (s: ModelShape) => ModelShape): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === id ? f(s) : s)) })
const made = (r: { ok: true; shape: ModelShape } | { ok: false; reason: string }) => { if (!r.ok) throw new Error(r.reason); return r.shape }

// a body anchored in the middle, an arm on the picture's right with a shoulder and an elbow (0 to 145), a posable hand, the arm twinned
function model(): ModelContent {
  let c = addGroup(blank('Posed'), newGroup('torso', 'Torso'))
  c = addObject(c, 'torso', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addShape(c, 'ob', outline('body', [[60, 40], [140, 40], [140, 100], [60, 100]]))
  c = addGroup(c, { ...newGroup('arm', 'Arm'), parent: 'torso' })
  for (const o of ['oa', 'of']) c = addObject(c, 'arm', { id: o, name: o, layer: 'body', shapes: [] })
  c = addShape(c, 'oa', bind(outline('upper', [[124, 100], [130, 100], [136, 100], [136, 160], [130, 160], [124, 160]]), 1, link('edge', 'body', 0, 2, 0.125, { lo: -180, hi: 30, name: 'Shoulder (left)', kind: 'shoulder' })))
  c = addShape(c, 'of', bind(outline('fore', [[124, 160], [130, 160], [136, 160], [136, 200], [124, 200]]), 1, link('point', 'upper', 4, 0, 0, { lo: 0, hi: 145, name: 'Elbow (left)', kind: 'elbow' })))
  c = edit(c, 'body', s => made(toggleAnchor(s, 0)))
  c = edit(c, 'fore', s => { const p = made(togglePosable(s, 3)); return renameMark(p, p.marks!.at(-1)!.id, 'Hand (left)') })
  const twinned = makeTwin(c, 'group', 'arm', p => `${p}R`)
  if (!twinned.ok) throw new Error(twinned.reason)
  return twinned.content
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
const pose = () => within(screen.getByRole('group', { name: 'Pose' }))
const limits = () => within(screen.getByRole('group', { name: 'Joint limits' }))

describe('joint limits', () => {
  it('lists every joint and sets them for the body the model is', async () => {
    const { user } = await open()
    const elbow = within(limits().getByRole('group', { name: 'Elbow (left)' }))
    expect(limits().getByText('Elbow (left) (and its twin)')).toBeInTheDocument()
    expect(within(elbow.getByRole('group', { name: 'To' })).getByText('145°')).toBeInTheDocument()
    await user.click(limits().getByRole('button', { name: 'Women' }))
    expect(limits().getByRole('button', { name: 'Women' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(within(limits().getByRole('group', { name: 'Elbow (left)' })).getByRole('group', { name: 'To' })).getByText('150°')).toBeInTheDocument()
    await user.click(within(within(limits().getByRole('group', { name: 'Elbow (left)' })).getByRole('group', { name: 'To' })).getByRole('button', { name: 'Lower To' }))
    expect(within(within(limits().getByRole('group', { name: 'Elbow (left)' })).getByRole('group', { name: 'To' })).getByText('145°')).toBeInTheDocument()
  })
})

describe('the Pose section', () => {
  it('poses the twin’s arm by its hand, saves the pose, resets it and puts it back', async () => {
    const { user } = await open()
    expect(pose().getByRole('button', { name: 'Reset the pose' })).toBeDisabled()
    expect(pose().getByRole('button', { name: 'Shoulder or hip' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Pose with Hand (right)' })).toBeNull()
    await user.click(pose().getByRole('button', { name: 'Drag to pose' }))
    const ring = screen.getByRole('button', { name: 'Pose with Hand (right)' })
    const from = pixelOf(Number(ring.getAttribute('cx')), Number(ring.getAttribute('cy'))), to = pixelOf(110, 170)
    fireEvent(ring, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: from.x, clientY: from.y }))
    fireEvent(canvas(), new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: to.x, clientY: to.y }))
    fireEvent(canvas(), new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: to.x, clientY: to.y }))
    expect(pose().getByRole('button', { name: 'Reset the pose' })).toBeEnabled()
    // the left hand is where it was drawn
    expect(Number(screen.getByRole('button', { name: 'Pose with Hand (left)' }).getAttribute('cx'))).toBeCloseTo(136, 0)

    await user.type(pose().getByRole('textbox', { name: 'Name of the new pose' }), 'Reach')
    await user.click(pose().getByRole('button', { name: 'Save as a pose' }))
    expect(pose().getByRole('button', { name: 'Put back Reach' })).toBeInTheDocument()
    const posedAt = screen.getByRole('button', { name: 'Pose with Hand (right)' }).getAttribute('cx')
    await user.click(pose().getByRole('button', { name: 'Reset the pose' }))
    expect(pose().getByRole('button', { name: 'Reset the pose' })).toBeDisabled()
    expect(Number(screen.getByRole('button', { name: 'Pose with Hand (right)' }).getAttribute('cx'))).toBeCloseTo(64, 0)
    await user.click(pose().getByRole('button', { name: 'Put back Reach' }))
    expect(screen.getByRole('button', { name: 'Pose with Hand (right)' }).getAttribute('cx')).toBe(posedAt)
    await user.click(pose().getByRole('button', { name: 'Delete the pose Reach' }))
    expect(pose().queryByRole('button', { name: 'Put back Reach' })).toBeNull()
  })
})
