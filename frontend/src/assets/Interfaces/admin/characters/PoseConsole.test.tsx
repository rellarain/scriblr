import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { makeTwin } from './engine/pairEdit'
import { addRange, addScale, addTurn, attachGroup, newRange, reparent, type Edit } from './engine/rigEdit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// Body (neck, chest) with the Face hung from the neck's top edge; a Nod slider turns the Face between -12 and 12 degrees. Only the Face can be posed.
function figure(sized = false): ModelContent {
  let c = content('Adult')
  for (const [id, name] of [['gB', 'Body'], ['gF', 'Face']]) c = addGroup(c, newGroup(id, name))
  const parts: Array<[string, string, string, string, string, ReturnType<typeof box>, string]> = [
    ['gB', 'oN', 'Neck part', 'neck', 'Neck', box(92, 64, 16, 26), 'rounded'],
    ['gB', 'oC', 'Chest part', 'chest', 'Chest', box(70, 86, 60, 74), 'rounded'],
    ['gF', 'oS', 'Skull part', 'skull', 'Skull', box(80, 24, 40, 44), 'oval'],
  ]
  for (const [g, o, oname, sid, sname, b, tpl] of parts) {
    c = addObject(c, g, { id: o, name: oname, layer: 'body', shapes: [] })
    c = addShape(c, o, newShape(sid, sname, tpl, b))
  }
  c = must(reparent(c, 'gF', 'gB'))
  c = must(attachGroup(c, 'gF', { shape: 'neck', kind: 'edge', i: 0, t: 0.5, slider: null, rx: 0.5, ry: 0.5 }))
  c = must(addRange(c, newRange('nod', 'Nod', 'turn', 'gF')))
  c = must(addTurn(c, 'nod', 'gF'))
  c = { ...c, ranges: c.ranges.map(r => ({ ...r, drives: r.drives.map(d => ({ ...d, atMin: -12, atMax: 12 })) })) }
  if (sized) {
    c = must(addRange(c, { ...newRange('size', 'Face size', 'scale', 'gF'), min: 50, rest: 100, max: 150 }))
    c = must(addScale(c, 'size', 'group', 'gF'))
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'size' ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: 50, atMax: 150 })) } : r)) }
  }
  return c
}

async function open(c = figure()) {
  const backend = modelsBackend([draftEntry('a', c)] as ModelEntry[])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement
const reset = () => screen.queryByRole('button', { name: 'Reset test values' })
const status = () => within(screen.getByRole('group', { name: 'Pose' })).getByRole('status')
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))

function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: { x?: number; y?: number; alt?: boolean } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, altKey: init.alt ?? false, clientX: init.x ?? 0, clientY: init.y ?? 0 }))
}
function pixelOf(worldX: number, worldY: number) {
  const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
  return { x: ((worldX - x) / w) * 704, y: ((worldY - y) / h) * 616 }
}
// where the point (100, 40), 24 above the Face's pivot at (100, 64), is after the Face turns by this many degrees about that pivot
const swung = (deg: number) => { const a = (deg * Math.PI) / 180; return { x: 100 + 24 * Math.sin(a), y: 64 - 24 * Math.cos(a) } }
const grabSkull = (alt = false) => pointer(pathOf('skull'), 'pointerdown', { ...pixelOf(100, 40), alt })
const dragTo = (deg: number) => { const to = swung(deg); pointer(canvas(), 'pointermove', pixelOf(to.x, to.y)) }

afterEach(() => { vi.useRealTimers() })

describe('Pose mode', () => {
  it('is a toggle that grabs the figure instead of editing its points', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Skull' }))
    expect(screen.getByRole('button', { name: 'Point 1' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Pose mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Point 1' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Pose' })).toBeInTheDocument()
    expect(status()).toHaveTextContent(/drag a part to turn it/)
    await user.click(toggle)
    expect(screen.queryByRole('group', { name: 'Pose' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Point 1' })).toBeInTheDocument()
  })

  it('turns a group when a part of it is dragged, and the slider follows', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    const before = pathOf('skull').getAttribute('d')
    grabSkull()
    dragTo(10)
    expect(reset()).toHaveTextContent('1 off rest')
    expect(status()).toHaveTextContent('Turning Face: Nod 25°.')            // 10 of 12 degrees is 5/6 of the way to the maximum of 30
    expect(pathOf('skull').getAttribute('d')).not.toBe(before)
    pointer(canvas(), 'pointerup', pixelOf(swung(10).x, swung(10).y))
    expect(status()).toHaveTextContent(/Drag again to keep posing/)
    expect(reset()).toHaveTextContent('1 off rest')                         // a pose stays until it is reset
  })

  it('holds the slider to its range', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    grabSkull()
    dragTo(90)
    expect(status()).toHaveTextContent('Nod 30°')
    dragTo(0)
    dragTo(-90)                                                              // the pointer goes round the other way, step by step
    expect(status()).toHaveTextContent('Nod -30°')
  })

  it('puts everything back when Escape is pressed in the middle of a drag', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    const before = pathOf('skull').getAttribute('d')
    grabSkull()
    dragTo(10)
    expect(reset()).not.toBeNull()
    fireEvent.keyDown(canvas(), { key: 'Escape' })
    expect(reset()).toBeNull()
    expect(pathOf('skull').getAttribute('d')).toBe(before)
    expect(status()).toHaveTextContent('Put back as it was.')
    dragTo(20)                                                               // the drag is over: moving does nothing
    expect(reset()).toBeNull()
  })

  it('says what is missing when a part has nothing that turns it', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    pointer(pathOf('chest'), 'pointerdown', pixelOf(100, 120))
    pointer(canvas(), 'pointermove', pixelOf(110, 120))
    expect(status()).toHaveTextContent(/Nothing turns this part/)
    expect(reset()).toBeNull()
  })

  it('bends the limb toward the pointer with Reach, or with Alt held', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    grabSkull(true)                                                          // Alt
    expect(status()).toHaveTextContent('Reaching with Face.')
    dragTo(8)
    expect(reset()).toHaveTextContent('1 off rest')
    pointer(canvas(), 'pointerup')
    await user.click(screen.getByRole('button', { name: 'Reset pose' }))
    expect(reset()).toBeNull()
    const reachBtn = screen.getByRole('button', { name: /Reach/ })
    await user.click(reachBtn)
    expect(reachBtn).toHaveAttribute('aria-pressed', 'true')
    grabSkull()
    dragTo(-8)
    expect(status()).toHaveTextContent('Reaching with Face.')
    expect(reset()).toHaveTextContent('1 off rest')
  })

  it('draws a square to scale a group by and uses it', async () => {
    const { user } = await open(figure(true))
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    const handle = screen.getByRole('button', { name: 'Scale Face' })
    const before = pathOf('skull').getAttribute('d')
    pointer(handle, 'pointerdown', pixelOf(120, 68))
    pointer(canvas(), 'pointermove', pixelOf(160, 68))
    expect(status()).toHaveTextContent('Scaling Face: Face size 150%.')
    expect(pathOf('skull').getAttribute('d')).not.toBe(before)
    fireEvent.keyDown(canvas(), { key: 'Escape' })
    expect(pathOf('skull').getAttribute('d')).toBe(before)
  })

  it('shows no scale square for a model without a scale slider on a group', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    expect(screen.queryByRole('button', { name: /^Scale / })).toBeNull()
  })

  it('keeps a pose as a preset of kind Pose, without the hidden things', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Show Chest part' }))  // switch the chest off: a pose does not keep that
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    grabSkull()
    dragTo(10)
    pointer(canvas(), 'pointerup')
    await user.click(screen.getByRole('button', { name: 'Save as preset' }))
    expect(status()).toHaveTextContent('Saved as the preset Pose 1.')
    await user.click(screen.getByRole('tab', { name: 'Presets' }))
    expect(screen.getByRole('listitem', { name: 'Preset Pose 1' })).toHaveTextContent('Pose · 1 slider, 0 hidden')
    expect(screen.getByRole('img', { name: 'Pose 1 is on' })).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.presets).toHaveLength(1))
    expect(backend.entries[0].draft.presets![0]).toMatchObject({ name: 'Pose 1', kind: 'Pose', values: { nod: 25 }, hidden: [] })
  })
})

// ---- the two sides of a pair ----

const sharpShape = (id: string, pts: Array<[number, number]>): ModelContent['shapes'][number] => ({ id, name: `${id} shape`, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
// A torso and an arm (with its twin on the other side) and a slider that raises the arm; `together` has the slider turn both arms (a model made before a pose belonged to one side).
function armed(together: boolean): ModelContent {
  let c: ModelContent = {
    ...content('Armed'),
    shapes: [sharpShape('chest', [[70, 86], [130, 86], [130, 160], [70, 160]]), sharpShape('arm', [[124, 90], [138, 90], [138, 140], [124, 140]])],
    objects: [{ id: 'oChest', name: 'Chest part', layer: 'body', shapes: ['chest'] }, { id: 'oArm', name: 'Arm part', layer: 'body', shapes: ['arm'] }],
    groups: [newGroup('torso', 'Torso', null, ['oChest']), newGroup('gArm', 'Arm', 'torso', ['oArm'])],
  }
  c = must(attachGroup(c, 'gArm', { shape: 'chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 }))
  c = must(addRange(c, { ...newRange('raise', 'Arm raise', 'turn', 'gArm'), min: 0, max: 90, rest: 0 }))
  c = must(addTurn(c, 'raise', 'gArm'))
  c = { ...c, ranges: c.ranges.map(r => ({ ...r, drives: r.drives.map(d => ({ ...d, atMin: 0, atMax: -80, mirror: together })) })) }
  let n = 0
  return must(makeTwin(c, 'group', 'gArm', p => `${p}_t${++n}`))
}
const twinPath = () => canvas().querySelector('path[data-shape^="s_t"]') as SVGPathElement
const armPath = () => canvas().querySelector('path[data-shape="arm"]') as SVGPathElement
// a point on the arm (the original is on the right of the figure) and on its twin on the left
const onArm = () => pixelOf(131, 120)
const onTwin = () => pixelOf(69, 120)

describe('Pose mode with a pair', () => {
  it('turns only the arm that is grabbed: a Turn slider moves its own side', async () => {
    const { user } = await open(armed(false))
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    const twinBefore = twinPath().getAttribute('d'), armBefore = armPath().getAttribute('d')
    pointer(armPath(), 'pointerdown', onArm())
    pointer(canvas(), 'pointermove', pixelOf(150, 100))
    expect(armPath().getAttribute('d')).not.toBe(armBefore)
    expect(twinPath().getAttribute('d')).toBe(twinBefore)
    expect(status()).toHaveTextContent(/Turning Arm/)
  })

  it('gives the other arm a slider of its own the moment it is grabbed, and turns it', async () => {
    const { user, backend } = await open(armed(false))
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    const twinBefore = twinPath().getAttribute('d'), armBefore = armPath().getAttribute('d')
    pointer(twinPath(), 'pointerdown', onTwin())
    expect(status()).toHaveTextContent(/A slider for this side was added/)
    pointer(canvas(), 'pointermove', pixelOf(50, 100))
    pointer(canvas(), 'pointerup')
    expect(twinPath().getAttribute('d')).not.toBe(twinBefore)
    expect(armPath().getAttribute('d')).toBe(armBefore)
    expect(reset()).toHaveTextContent('1 off rest')
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges).toHaveLength(2))
    expect(backend.entries[0].draft.ranges.map(r => r.name)).toEqual(['Arm raise', 'Arm raise (other side)'])
  })

  it('makes that slider only once, and an undo puts it away', async () => {
    const { user } = await open(armed(false))
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    for (let i = 0; i < 2; i++) {
      pointer(twinPath(), 'pointerdown', onTwin())
      pointer(canvas(), 'pointermove', pixelOf(50, 100))
      pointer(canvas(), 'pointerup')
    }
    await user.click(screen.getByRole('tab', { name: 'Ranges' }))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    expect(screen.getAllByRole('region', { name: /^Slider / })).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getAllByRole('region', { name: /^Slider / })).toHaveLength(1)
  })

  it('turns both arms with the one slider when the pair is posed together, whichever is grabbed', async () => {
    const { user } = await open(armed(true))
    await user.click(screen.getByRole('button', { name: 'Pose mode' }))
    const twinBefore = twinPath().getAttribute('d'), armBefore = armPath().getAttribute('d')
    pointer(twinPath(), 'pointerdown', onTwin())
    pointer(canvas(), 'pointermove', pixelOf(50, 100))
    pointer(canvas(), 'pointerup')
    expect(twinPath().getAttribute('d')).not.toBe(twinBefore)
    expect(armPath().getAttribute('d')).not.toBe(armBefore)
    expect(status()).not.toHaveTextContent(/slider for this side/)
  })

  it('offers One side each for a model whose Turn sliders still move both sides, and does it', async () => {
    const { user, backend } = await open(armed(true))
    await user.click(screen.getByRole('tab', { name: 'Ranges' }))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    await user.click(screen.getByRole('button', { name: 'Make the 1 turning slider that moves both sides move only its own side' }))
    expect(screen.queryByRole('button', { name: /move only (its|their) own side/ })).toBeNull()
    expect(screen.getByText(/Moves only its own side: the twin keeps still/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges[0].drives[0].mirror).toBe(false))
  })

  it('does not offer One side each when every slider already moves its own side', async () => {
    const { user } = await open(armed(false))
    await user.click(screen.getByRole('tab', { name: 'Ranges' }))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    expect(screen.queryByRole('button', { name: /move only (its|their) own side/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pose the other side of Arm raise apart' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pose both sides of Arm raise together' })).toBeInTheDocument()
  })
})
