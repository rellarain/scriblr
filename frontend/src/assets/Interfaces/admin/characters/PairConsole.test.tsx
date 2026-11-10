import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry, ModelShape } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

// Phase 2b in the console: twins (Make a twin, Break the pair), point links (Weld, Follow, Lock to an edge, the arrow keys on a linked point), the back view
// (an outline of its own, the depth of the view) and the slider that loosens links.
const sharp = (id: string, name: string, pts: Array<[number, number]>): ModelShape => ({ id, name, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })

// A body and, over it, a shirt, in two groups; an arm beside the body in a third.
function outfit(): ModelContent {
  let c = content('Adult')
  for (const [id, name] of [['gBody', 'Upper body'], ['gShirt', 'Clothes'], ['gArm', 'Limb']]) c = addGroup(c, newGroup(id, name))
  const parts: Array<[string, string, string, ModelShape, 'body' | 'clothing']> = [
    ['gBody', 'oBody', 'Torso part', sharp('body', 'Body', [[60, 60], [140, 60], [140, 160], [60, 160]]), 'body'],
    ['gShirt', 'oShirt', 'Cloth part', sharp('shirt', 'Shirt', [[50, 50], [150, 50], [150, 170], [50, 170]]), 'clothing'],
    ['gArm', 'oArm', 'Sleeve part', sharp('arm', 'Arm', [[150, 70], [170, 70], [170, 130], [150, 130]]), 'body'],
  ]
  for (const [g, o, oname, shape, layer] of parts) {
    c = addObject(c, g, { id: o, name: oname, layer, shapes: [] })
    c = addShape(c, o, shape)
  }
  return c
}

async function open(entries: ModelEntry[] = [draftEntry('a', outfit())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const shapeRow = (name: string) => tree().getByRole('button', { name })
const saved = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.shapes.find(s => s.id === id)!
const savedGroup = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.groups.find(g => g.id === id)!
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: { x?: number; y?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: init.x ?? 0, clientY: init.y ?? 0 }))
}
function pixelOf(worldX: number, worldY: number) {
  const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
  return { x: ((worldX - x) / w) * 704, y: ((worldY - y) / h) * 616 }
}

describe('pairs', () => {
  it('makes a twin of a shape, marks it in the tree and draws it dashed, shown but not edited', async () => {
    const { user, backend } = await open()
    await user.click(shapeRow('Arm'))
    await user.click(screen.getByRole('button', { name: 'Make a twin of Arm' }))
    expect(shapeRow('Arm (twin)')).toBeInTheDocument()
    expect(tree().getByRole('img', { name: 'Arm (twin) is a twin' })).toBeInTheDocument()
    await user.click(shapeRow('Arm (twin)'))
    expect(screen.getByText(/This is the twin of Arm: it mirrors it/)).toBeInTheDocument()
    const twinId = canvas().querySelector('path.cmShape--twin')!.getAttribute('data-shape')!
    expect(pathOf(twinId)).toBeTruthy()
    // a twin has no template and no point list of its own
    expect(screen.queryByRole('group', { name: 'Points' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Put a template on the shape' })).toBeNull()
    await save(user)
    await waitFor(() => expect(saved(backend, twinId)).toMatchObject({ mirrorOf: 'arm', pts: [] }))
  })

  it('mirrors the original: the twin is drawn on the other side of the mirror line', async () => {
    const { user } = await open()
    await user.click(shapeRow('Arm'))
    await user.click(screen.getByRole('button', { name: 'Make a twin of Arm' }))
    const twinId = canvas().querySelector('path.cmShape--twin')!.getAttribute('data-shape')!
    const xs = (id: string) => (pathOf(id).getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0)
    expect(Math.min(...xs(twinId))).toBeCloseTo(200 - 170, 1)
    expect(Math.max(...xs(twinId))).toBeCloseTo(200 - 150, 1)
  })

  it('breaks the pair: the twin becomes a shape of its own with the points it was drawn with', async () => {
    const { user, backend } = await open()
    await user.click(shapeRow('Arm'))
    await user.click(screen.getByRole('button', { name: 'Make a twin of Arm' }))
    await user.click(shapeRow('Arm (twin)'))
    await user.click(screen.getByRole('button', { name: 'Break the pair of Arm (twin)' }))
    expect(canvas().querySelector('path.cmShape--twin')).toBeNull()
    expect(tree().queryByRole('img', { name: /is a twin/ })).toBeNull()
    expect(screen.getByRole('group', { name: 'Points' })).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.shapes.filter(s => s.mirrorOf)).toEqual([]))
    const twin = backend.entries[0].draft.shapes.find(s => s.name === 'Arm (twin)')!
    expect(twin.pts).toHaveLength(4)
    expect(Math.min(...twin.pts.map(p => p.x))).toBeCloseTo(30, 1)
  })

  it('makes a twin of a group from the Rig tab, which then has no pivot or anchor of its own', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Rig' }))
    await user.click(tree().getByRole('button', { name: 'Limb' }))
    await user.click(screen.getByRole('tab', { name: 'Rig' }))
    await user.click(screen.getByRole('button', { name: 'Make a twin of Limb' }))
    await user.click(tree().getByRole('button', { name: 'Limb (twin)' }))
    expect(screen.getByText(/A twin has no pivot or anchor of its own/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Put it in the middle of the group' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Kind of anchor' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Pivot of Limb \(twin\)/ })).not.toHaveAccessibleName(/Drag it/)
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.groups.find(g => g.mirrorOf === 'gArm')).toBeDefined())
    expect(backend.entries[0].draft.objects.find(o => o.mirrorOf === 'oArm')).toBeDefined()
    // the twin of a group can be broken from the same place
    await user.click(screen.getByRole('button', { name: 'Break the pair of Limb (twin)' }))
    expect(screen.queryByText(/A twin has no pivot or anchor/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Put it in the middle of the group' })).toBeInTheDocument()
  })

  it('takes the twin when the original is deleted, and says so', async () => {
    const { user, backend } = await open()
    await user.click(shapeRow('Arm'))
    await user.click(screen.getByRole('button', { name: 'Make a twin of Arm' }))
    await user.click(screen.getByRole('button', { name: 'Delete Arm' }))
    expect(screen.getByText('Its twin went with it.')).toBeInTheDocument()
    expect(tree().queryByRole('button', { name: 'Arm (twin)' })).toBeNull()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.shapes.map(s => s.id)).toEqual(['body', 'shirt']))
  })

  it('says why a pair cannot be made, in a note', async () => {
    const { user } = await open()
    await user.click(shapeRow('Arm'))
    await user.click(screen.getByRole('button', { name: 'Make a twin of Arm' }))
    await user.click(shapeRow('Arm'))
    expect(screen.queryByRole('button', { name: 'Make a twin of Arm' })).toBeNull()      // it has one: the panel says so
    expect(screen.getByText(/Has a twin:/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy Arm (twin)' }))
    expect(screen.getByText(/A twin has no outline of its own to copy/)).toBeInTheDocument()
  })
})

describe('point links', () => {
  async function shirtSelected() {
    const ctx = await open()
    await ctx.user.click(shapeRow('Shirt'))
    return ctx
  }

  it('welds the selected point to the point of another shape nearest the click', async () => {
    const { user, backend } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Weld/ }))
    expect(screen.getByText(/Click the shape to link point 1 to/, { selector: 'p.cmStageNote' })).toBeInTheDocument()
    pointer(pathOf('arm'), 'pointerdown', pixelOf(151, 71))                      // not a body: any other shape may be linked to, the arm too
    expect(screen.queryByText(/Click the shape to link point 1 to/, { selector: 'p.cmStageNote' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Unlink point 1' }))
    await user.click(screen.getByRole('button', { name: /^Weld/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(61, 61))
    expect(screen.getByText(/Point 1: welded to point 1 of Body/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Point 1, linked' })).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(saved(backend, 'shirt').pts[0].bind).toMatchObject({ kind: 'point', s: 'body', i: 0, d: [0, 0] }))
    expect(saved(backend, 'shirt').pts[0]).toMatchObject({ x: 60, y: 60 })
  })

  it('follows a point: the point stays where it is, with its offset to adjust in steps', async () => {
    const { user, backend } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Follow/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(61, 61))
    expect(screen.getByText(/Point 1: follows point 1 of Body \(-10, -10 away\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Raise Offset across (point 1)' }))
    expect(screen.getByText(/follows point 1 of Body \(-9, -10 away\)/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(saved(backend, 'shirt').pts[0].bind!.d).toEqual([-9, -10]))
  })

  it('locks the point to the edge of another shape, as far out as it was clicked, with steppers for the distance and the spot', async () => {
    const { user, backend } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Lock to an edge/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(100, 52))
    expect(screen.getByText(/Point 1: locked to the edge from point 1 of Body, -?8 out/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Raise Distance from the edge (point 1)' }))
    await user.click(screen.getByRole('button', { name: 'Raise Spot along the edge (point 1)' }))
    await save(user)
    await waitFor(() => expect(saved(backend, 'shirt').pts[0].bind).toMatchObject({ kind: 'edge', s: 'body', e: 0 }))
    const b = saved(backend, 'shirt').pts[0].bind!
    expect(Math.abs(b.o)).toBeCloseTo(Math.abs(Number(screen.getByText(/Distance from the edge/).closest('.cmStep')?.querySelector('.cmStepValue')?.textContent)), 5)
    expect(b.t).toBeCloseTo(0.52, 2)
  })

  it('does not drag a linked point, and adjusts the link with the arrow keys instead', async () => {
    const { user, backend } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Lock to an edge/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(100, 52))
    const dot = screen.getByRole('button', { name: 'Point 1, linked' })
    const [cx, cy] = [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]
    pointer(dot, 'pointerdown', pixelOf(cx, cy)); pointer(canvas(), 'pointermove', pixelOf(cx + 20, cy + 20)); pointer(canvas(), 'pointerup', pixelOf(cx + 20, cy + 20))
    expect(Number(screen.getByRole('button', { name: 'Point 1, linked' }).getAttribute('cx'))).toBeCloseTo(cx, 3)
    fireEvent.keyDown(canvas(), { key: 'ArrowRight' })                               // along the edge
    fireEvent.keyDown(canvas(), { key: 'ArrowUp', shiftKey: true })                  // outward, five units
    await save(user)
    await waitFor(() => expect(saved(backend, 'shirt').pts[0].bind!.t).toBeCloseTo(0.52, 2))
    expect(Math.abs(saved(backend, 'shirt').pts[0].bind!.o)).not.toBeCloseTo(8, 1)
  })

  it('unlinks a point, which then stays where it is drawn', async () => {
    const { user, backend } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Weld/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(61, 61))
    await user.click(screen.getByRole('button', { name: 'Unlink point 1' }))
    expect(screen.getByText("None of this shape's points is linked.")).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(saved(backend, 'shirt').pts[0].bind ?? null).toBeNull())
    expect(saved(backend, 'shirt').pts[0]).toMatchObject({ x: 60, y: 60 })
  })

  it('stops picking with Escape', async () => {
    const { user } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Weld/ }))
    expect(screen.getByRole('button', { name: /^Weld/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(canvas(), { key: 'Escape' })
    expect(screen.getByRole('button', { name: /^Weld/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('cuts the links to a shape whose points are renumbered, and says so', async () => {
    const { user, backend } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Weld/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(61, 61))
    await user.click(shapeRow('Body'))
    await user.click(screen.getByRole('button', { name: 'Mirror editing' }))        // off: one point is added, not a pair
    await user.click(screen.getByRole('button', { name: 'Add a point after it' }))
    expect(screen.getByText(/The links of Shirt to this shape were cut because its points changed/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').pts).toHaveLength(5))
    expect(saved(backend, 'shirt').pts[0].bind ?? null).toBeNull()
  })

  it('refuses a link to a twin\'s own points, and a circle, in a note', async () => {
    const { user } = await shirtSelected()
    await user.click(screen.getByRole('button', { name: /^Weld/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(61, 61))
    await user.click(shapeRow('Body'))
    await user.click(screen.getByRole('button', { name: /^Weld/ }))
    pointer(pathOf('shirt'), 'pointerdown', pixelOf(51, 51))
    expect(screen.getByText('That would make the links go round in a circle.')).toBeInTheDocument()
  })
})

describe('the back view', () => {
  it('turns the figure round, and keeps its toolbar buttons honest', async () => {
    const { user } = await open()
    const front = screen.getByRole('button', { name: 'Front view' }), back = screen.getByRole('button', { name: 'Back view' })
    expect(front).toHaveAttribute('aria-pressed', 'true')
    const before = pathOf('arm').getAttribute('d')
    await user.click(back)
    expect(back).toHaveAttribute('aria-pressed', 'true')
    expect(pathOf('arm').getAttribute('d')).not.toBe(before)
    await user.click(front)
    expect(pathOf('arm').getAttribute('d')).toBe(before)
  })

  it('gives a shape an outline of its own for the back when its points are edited there, and takes it away again', async () => {
    const { user, backend } = await open()
    await user.click(shapeRow('Body'))
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    expect(screen.getByText(/It shows its front outline from behind/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Snap' }))
    await user.click(screen.getByRole('button', { name: 'Mirror editing' }))
    const dot = screen.getByRole('button', { name: 'Point 1' })
    const [cx, cy] = [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]
    pointer(dot, 'pointerdown', pixelOf(cx, cy)); pointer(canvas(), 'pointermove', pixelOf(cx + 12, cy)); pointer(canvas(), 'pointerup', pixelOf(cx + 12, cy))
    expect(screen.getByText(/It has an outline of its own for the back/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').back).toHaveLength(4))
    expect(saved(backend, 'body').pts.map(p => [p.x, p.y])).toEqual([[60, 60], [140, 60], [140, 160], [60, 160]])     // the front is untouched
    expect(saved(backend, 'body').back!.map(p => p.x)).not.toEqual([60, 140, 140, 60])
    // the front view does not show it
    await user.click(screen.getByRole('button', { name: 'Front view' }))
    expect(screen.getByText(/It has an outline of its own for the back \(switch to the back view to edit it\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    await user.click(screen.getByRole('button', { name: 'Use the front outline again' }))
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').back ?? null).toBeNull())
  })

  it('moves a shape in front of the next one in the view being edited only', async () => {
    const { user, backend } = await open()
    await user.click(shapeRow('Body'))
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    await user.click(screen.getByRole('button', { name: 'Move Body in front in the back view' }))
    await save(user)
    await waitFor(() => expect(saved(backend, 'body').zBack).not.toBeNull())
    expect(saved(backend, 'body').z).toBe(40)                                         // the front is untouched
    await user.click(screen.getByRole('button', { name: 'Front view' }))
    await user.click(screen.getByRole('button', { name: 'Move Body behind in the front view' }))
    expect(screen.getByText('It is at the back already.')).toBeInTheDocument()
  })

  it('records points in the front view: the back view is left for the drawing', async () => {
    const { user } = await open()
    await user.click(shapeRow('Body'))
    await user.click(screen.getByRole('button', { name: 'Back view' }))
    await user.click(screen.getByRole('tab', { name: 'Ranges' }))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    await user.click(screen.getByRole('menuitem', { name: /Move points/ }))
    expect(screen.getByRole('button', { name: 'Front view' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('the looseness slider', () => {
  it('is made for a shape with links, assigned to it, and listed among the choices', async () => {
    const { user, backend } = await open()
    await user.click(shapeRow('Shirt'))
    expect(screen.getByRole('button', { name: /Make a slider/ })).toBeDisabled()          // nothing is linked yet
    await user.click(screen.getByRole('button', { name: /^Lock to an edge/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(100, 52))
    await user.click(screen.getByRole('button', { name: /Make a slider/ }))
    expect(screen.getByRole('combobox', { name: 'Slider that loosens the links' })).toHaveDisplayValue('Shirt fit')
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges.map(r => r.name)).toEqual(['Shirt fit']))
    const range = backend.entries[0].draft.ranges[0]
    expect(range).toMatchObject({ min: 0, rest: 100, max: 200, unit: '%' })
    expect(saved(backend, 'shirt').loose).toBe(range.id)
    // it can be let go again
    await user.selectOptions(screen.getByRole('combobox', { name: 'Slider that loosens the links' }), '')
    await save(user)
    await waitFor(() => expect(saved(backend, 'shirt').loose ?? null).toBeNull())
  })

  it('loosens the drawing: the shirt sits further from the body as the slider goes up', async () => {
    const { user } = await open()
    await user.click(shapeRow('Shirt'))
    await user.click(screen.getByRole('button', { name: /^Lock to an edge/ }))
    pointer(pathOf('body'), 'pointerdown', pixelOf(100, 52))
    await user.click(screen.getByRole('button', { name: /Make a slider/ }))
    await user.click(screen.getByRole('tab', { name: 'Ranges' }))
    await user.click(screen.getByRole('button', { name: 'All (1)' }))
    const top = () => Math.min(...(pathOf('shirt').getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1))
    const rest = top()
    fireEvent.change(screen.getByLabelText('Try Shirt fit'), { target: { value: '200' } })
    expect(top()).toBeLessThan(rest)                                                    // twice as far out: higher on the screen
  })
})
