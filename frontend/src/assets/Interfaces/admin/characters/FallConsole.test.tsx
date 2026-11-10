import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelEntry, ModelPoint, ModelShape } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

const pt = (x: number, y: number, over: Partial<ModelPoint> = {}): ModelPoint => ({ x, y, m: 's', ...over })
const poly = (id: string, name: string, pts: ModelPoint[]): ModelShape => ({ id, name, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts })

// A head with a scarf hanging from it (a strip: the two top points hold it, the two bottom ones carry a weight) and a slider that bends the head.
function figure(weighted = true): ModelContent {
  let c = blank('Hung')
  c = addGroup(c, newGroup('gH', 'Head', null, []))
  c = addObject(c, 'gH', { id: 'oHead', name: 'Head part', layer: 'body', shapes: [] })
  c = addShape(c, 'oHead', poly('head', 'Head shape', [pt(80, 20), pt(120, 20), pt(120, 60), pt(80, 60)]))
  c = addObject(c, 'gH', { id: 'oScarf', name: 'Scarf part', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oScarf', poly('scarf', 'Scarf shape', [pt(95, 60), pt(105, 60), pt(115, 100, weighted ? { w: 1 } : {}), pt(85, 100, weighted ? { w: 1 } : {})]))
  c = addShape(c, 'oScarf', poly('crease', 'Crease shape', [pt(90, 66), pt(110, 66), pt(110, 72), pt(90, 72)]))
  return { ...c, ranges: [{ id: 'bend', name: 'Bend', scope: null, min: 0, rest: 0, max: 100, unit: '%', show: true, rand: null, drives: [] }] }
}

async function open(c: ModelContent = figure()) {
  const backend = modelsBackend([draftEntry('a', c)])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

type User = ReturnType<typeof userEvent.setup>
const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: User) => user.click(screen.getByRole('button', { name: 'Save' }))
const shape = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.shapes.find(s => s.id === id)!
const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => document.querySelector(`path[data-shape="${id}"]`) as SVGPathElement
const select = (user: User, name: string) => user.click(tree().getByRole('button', { name }))
function pointer(el: Element, type: 'pointerdown' | 'pointerup') { fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })) }
const point = (n: number) => screen.getByRole('button', { name: new RegExp(`^Point ${n}\\b`) })

describe('the Weights tool', () => {
  it('steps the weight of a point at each click, round to none, and rings the point', async () => {
    const { backend, user } = await open(figure(false))
    await select(user, 'Scarf shape')
    await user.click(screen.getByRole('button', { name: 'Weights' }))
    expect(screen.getByRole('button', { name: 'Weights' })).toHaveAttribute('aria-pressed', 'true')
    expect(point(3)).toHaveAccessibleName('Point 3, no weight')
    pointer(point(3), 'pointerdown')
    expect(point(3)).toHaveAccessibleName('Point 3, weight 25%')
    expect(document.querySelector('[data-weight="0.25"]')).not.toBeNull()
    for (let i = 0; i < 3; i++) pointer(point(3), 'pointerdown')
    expect(point(3)).toHaveAccessibleName('Point 3, weight 100%')
    await save(user)
    expect(shape(backend, 'scarf').pts[2].w).toBe(1)
    pointer(point(3), 'pointerdown')
    expect(point(3)).toHaveAccessibleName('Point 3, no weight')
    expect(document.querySelector('[data-weight]')).toBeNull()
    await save(user)
    expect(shape(backend, 'scarf').pts[2].w ?? null).toBeNull()
  })

  it('does not drag a point while it is on', async () => {
    const { backend, user } = await open(figure(false))
    await select(user, 'Scarf shape')
    await user.click(screen.getByRole('button', { name: 'Weights' }))
    pointer(point(1), 'pointerdown')
    fireEvent(canvas(), new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300 }))
    pointer(canvas(), 'pointerup')
    await save(user)
    expect(shape(backend, 'scarf').pts[0]).toMatchObject({ x: 95, y: 60 })
  })

  it('steps the selected point with the arrow keys and Enter, and one undo step undoes one change', async () => {
    const { backend, user } = await open(figure(false))
    await select(user, 'Scarf shape')
    await user.click(screen.getByRole('button', { name: 'Weights' }))
    pointer(point(1), 'pointerdown')   // a first click: a quarter
    canvas().focus()
    await user.keyboard('{ArrowUp}')
    expect(point(1)).toHaveAccessibleName('Point 1, weight 50%')
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(point(1)).toHaveAccessibleName('Point 1, weight 50%')
    await user.keyboard('{Enter}')
    expect(point(1)).toHaveAccessibleName('Point 1, weight 75%')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(point(1)).toHaveAccessibleName('Point 1, weight 50%')
    await save(user)
    expect(shape(backend, 'scarf').pts[0].w).toBe(0.5)
  })

  it('leaves the point and its weight alone when the tool is off, and says what it does', async () => {
    const { user } = await open()
    await select(user, 'Scarf shape')
    expect(point(3)).toHaveAccessibleName('Point 3, weight 100%')
    pointer(point(3), 'pointerdown')
    pointer(canvas(), 'pointerup')
    expect(point(3)).toHaveAccessibleName('Point 3, weight 100%')
    await user.click(screen.getByRole('button', { name: 'Weights' }))
    expect(screen.getByText(/Weights: click a point/)).toBeInTheDocument()
  })

  it('has a weight stepper in the Shape tab', async () => {
    const { backend, user } = await open(figure(false))
    await select(user, 'Scarf shape')
    await user.click(screen.getByRole('button', { name: 'Select point 3' }))
    await user.click(screen.getByRole('button', { name: 'Raise Weight of point 3' }))
    await user.click(screen.getByRole('button', { name: 'Raise Weight of point 3' }))
    expect(within(screen.getByRole('group', { name: 'Weight of point 3' })).getByText('50%')).toBeInTheDocument()
    await save(user)
    expect(shape(backend, 'scarf').pts[2].w).toBe(0.5)
  })

  it('stops with Escape', async () => {
    const { user } = await open()
    await select(user, 'Scarf shape')
    await user.click(screen.getByRole('button', { name: 'Weights' }))
    canvas().focus()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Weights' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('a Fall slider', () => {
  async function withFall(c: ModelContent = figure()) {
    const o = await open(c)
    await select(o.user, 'Scarf shape')
    await o.user.click(tab('Ranges'))
    await o.user.click(screen.getByRole('button', { name: /New slider/ }))
    await o.user.click(screen.getByRole('menuitem', { name: /Let the shape fall/ }))
    return o
  }

  it('is refused until the shape has weighted points, and says why', async () => {
    const { user } = await open(figure(false))
    await select(user, 'Scarf shape')
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /New slider/ }))
    const item = screen.getByRole('menuitem', { name: /Let the shape fall/ })
    expect(item).toBeDisabled()
    expect(item).toHaveTextContent('Mark points with the Weights tool first')
  })

  it('makes a slider that lets the shape hang from none to all of the way', async () => {
    const { backend, user } = await withFall()
    expect(screen.getByRole('region', { name: 'Slider Scarf shape fall' })).toBeInTheDocument()
    expect(screen.getByText('Lets Scarf shape hang 0% of the way at the minimum and 100% at the maximum')).toBeInTheDocument()
    await save(user)
    const r = backend.entries[0].draft.ranges.find(x => x.name === 'Scarf shape fall')!
    expect(r).toMatchObject({ min: 0, rest: 0, max: 100, unit: '%' })
    expect(r.drives).toHaveLength(1)
    expect(r.drives[0]).toMatchObject({ kind: 'fall', shape: 'scarf', atMin: 0, atMax: 100 })
  })

  it('moves the weighted points when it is tried, and keeps each side as long as it was', async () => {
    const { user } = await withFall()
    const before = pathOf('scarf').getAttribute('d')
    fireEvent.change(screen.getByRole('slider', { name: 'Try Scarf shape fall' }), { target: { value: '100' } })
    expect(pathOf('scarf').getAttribute('d')).not.toBe(before)
    fireEvent.change(screen.getByRole('slider', { name: 'Try Scarf shape fall' }), { target: { value: '0' } })
    expect(pathOf('scarf').getAttribute('d')).toBe(before)
    void user
  })

  it('shows the side chips and a click on one changes how it hangs and counts as away from rest', async () => {
    const { user } = await withFall()
    fireEvent.change(screen.getByRole('slider', { name: 'Try Scarf shape fall' }), { target: { value: '100' } })
    const down = pathOf('scarf').getAttribute('d')
    const sides = screen.getByRole('group', { name: 'The side things fall to' })
    expect(within(sides).getAllByRole('button').map(b => b.textContent)).toEqual(['Down', 'Left', 'Right', 'Behind'])
    expect(within(sides).getByRole('button', { name: 'Things fall straight down' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(sides).getByRole('button', { name: "Things fall to the picture's left" }))
    expect(pathOf('scarf').getAttribute('d')).not.toBe(down)
    expect(screen.getByRole('button', { name: 'Reset test values' })).toHaveTextContent('2 off rest')
    await user.click(screen.getByRole('button', { name: 'Reset test values' }))
    expect(within(screen.getByRole('group', { name: 'The side things fall to' })).getByRole('button', { name: 'Things fall straight down' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is kept by a preset as the side it was saved with, and applied again', async () => {
    const { backend, user } = await withFall()
    await user.click(screen.getByRole('button', { name: "Things fall to the picture's right" }))
    await user.click(tab('Presets'))
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Windy')
    await user.click(screen.getByRole('button', { name: /Save the current/ }))
    await save(user)
    expect(backend.entries[0].draft.presets?.[0]).toMatchObject({ name: 'Windy', fall: 'right' })
    await user.click(screen.getByRole('button', { name: "Things fall straight down" }))
    await user.click(screen.getByRole('button', { name: /^Apply Windy/ }))
    expect(screen.getByRole('button', { name: "Things fall to the picture's right" })).toHaveAttribute('aria-pressed', 'true')
  })

  it('steps how far it goes at the maximum', async () => {
    const { backend, user } = await withFall()
    const label = 'At the maximum (drive 1 of Scarf shape fall)'
    await user.click(screen.getByRole('button', { name: `Lower ${label}` }))
    await user.click(screen.getByRole('button', { name: `Lower ${label}`, }))
    await save(user)
    expect(backend.entries[0].draft.ranges[1].drives[0].atMax).toBe(98)
  })

  it('lets every weighted shape of the selected object fall with one button', async () => {
    const o = await open()
    await o.user.click(tree().getByRole('button', { name: 'Scarf part' }))
    await o.user.click(tab('Ranges'))
    await o.user.click(screen.getByRole('button', { name: /^All \(/ }))
    await o.user.click(screen.getByRole('button', { name: /Let Scarf part fall/ }))
    await save(o.user)
    expect(o.backend.entries[0].draft.ranges[0].drives.map(d => [d.kind, d.shape])).toEqual([['fall', 'scarf']])
    expect(screen.queryByRole('button', { name: /Let Scarf part fall/ })).toBeNull()
  })
})

describe('a shape that shows with a slider', () => {
  async function faded() {
    const o = await open()
    await select(o.user, 'Crease shape')
    await o.user.click(tab('Colour'))
    await o.user.selectOptions(screen.getByRole('combobox', { name: 'Slider that Crease shape shows with' }), 'bend')
    return o
  }

  it('starts hidden at rest and shown at the largest value, and saves it', async () => {
    const { backend, user } = await faded()
    expect(screen.getByText('Crease shape is hidden at')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Crease shape is shown at' })).getByText('100%')).toBeInTheDocument()
    await save(user)
    expect(shape(backend, 'crease').opBy).toEqual({ slider: 'bend', hidden: 0, shown: 100 })
  })

  it('is faint until the slider reaches it', async () => {
    const { user } = await faded()
    await user.click(tab('Ranges'))
    const opacity = () => Number(pathOf('crease').getAttribute('fill-opacity'))
    expect(opacity()).toBe(0)
    fireEvent.change(screen.getByRole('slider', { name: 'Try Bend' }), { target: { value: '50' } })
    expect(opacity()).toBeCloseTo(0.5)
    fireEvent.change(screen.getByRole('slider', { name: 'Try Bend' }), { target: { value: '100' } })
    expect(opacity()).toBe(1)
  })

  it('moves its two places a step at a time inside the slider', async () => {
    const { backend, user } = await faded()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Raise Crease shape is hidden at' }))
    await user.click(screen.getByRole('button', { name: 'Lower Crease shape is shown at' }))
    await save(user)
    expect(shape(backend, 'crease').opBy).toEqual({ slider: 'bend', hidden: 3, shown: 99 })
  })

  it('is listed under its slider, with a way to the shape', async () => {
    const { user } = await faded()
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    const card = screen.getByRole('region', { name: 'Slider Bend' })
    await user.click(within(card).getByRole('button', { name: 'Crease shape' }))
    await user.click(tab('Shape'))
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Crease shape')
  })

  it('stops with Always shown, and goes when its slider is deleted', async () => {
    const { backend, user } = await faded()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Slider that Crease shape shows with' }), '')
    await save(user)
    expect(shape(backend, 'crease').opBy ?? null).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Slider that Crease shape shows with' }), 'bend')
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: /^All \(/ }))
    await user.click(screen.getByRole('button', { name: 'Delete slider Bend' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await save(user)
    expect(shape(backend, 'crease').opBy ?? null).toBeNull()
  })
})

describe('a bridge', () => {
  // two parts one above the other, in two groups, and the bridge joins their edges
  function arm(): ModelContent {
    let c = blank('Arm')
    c = addGroup(c, newGroup('gU', 'Upper', null, [])); c = addGroup(c, newGroup('gF', 'Fore', 'gU', []))
    c = addObject(c, 'gU', { id: 'oU', name: 'Upper part', layer: 'body', shapes: [] }); c = addShape(c, 'oU', poly('upper', 'Upper shape', [pt(45, 0), pt(55, 0), pt(55, 60), pt(45, 60)]))
    c = addObject(c, 'gF', { id: 'oF', name: 'Fore part', layer: 'body', shapes: [] }); c = addShape(c, 'oF', poly('fore', 'Fore shape', [pt(45, 60), pt(55, 60), pt(55, 120), pt(45, 120)]))
    return c
  }
  const world = (wx: number, wy: number) => {
    const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
    return { clientX: ((wx - x) / w) * 704, clientY: ((wy - y) / h) * 616 }
  }
  const click = (id: string, wx: number, wy: number) => fireEvent(pathOf(id), new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...world(wx, wy) }))

  it('is made by clicking four spots on the edges of two parts', async () => {
    const { backend, user } = await open(arm())
    await select(user, 'Fore shape')
    await user.click(screen.getByRole('button', { name: 'Add a bridge' }))
    expect(screen.getAllByText(/spot 1 of 4/).length).toBeGreaterThan(0)
    click('upper', 45, 48); expect(screen.getAllByText(/spot 2 of 4/).length).toBeGreaterThan(0)
    click('upper', 45, 50)
    expect(screen.getByText(/Click the other part for the second spot/)).toBeInTheDocument()
    click('fore', 45, 72); expect(screen.getAllByText(/spot 3 of 4/).length).toBeGreaterThan(0)
    click('fore', 55, 72); expect(screen.getAllByText(/spot 4 of 4/).length).toBeGreaterThan(0)
    click('fore', 55, 80)
    expect(screen.getByText(/Click an edge of the other part for the last spot/)).toBeInTheDocument()
    click('upper', 55, 48)
    await save(user)
    const bridge = backend.entries[0].draft.shapes.find(s => s.name === 'Bridge')!
    expect(bridge.pts.map(p => p.bind?.s)).toEqual(['upper', 'fore', 'fore', 'upper'])
    expect(bridge.pts.every(p => p.bind?.kind === 'edge' && p.bind.tan === true)).toBe(true)
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oF')!.shapes).toContain(bridge.id)
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Bridge')
  })

  it('stops with Escape', async () => {
    const { user } = await open(arm())
    await select(user, 'Fore shape')
    await user.click(screen.getByRole('button', { name: 'Add a bridge' }))
    canvas().focus()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Add a bridge' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets a point leave along its edge, or not, from the Links list', async () => {
    const { backend, user } = await open(arm())
    await select(user, 'Fore shape')
    await user.click(screen.getByRole('button', { name: 'Add a bridge' }))
    click('upper', 45, 48); click('fore', 45, 72); click('fore', 55, 72); click('upper', 55, 48)
    const flag = () => screen.getByRole('button', { name: 'Point 1 leaves along its edge' })
    expect(flag()).toHaveAttribute('aria-pressed', 'true')
    await user.click(flag())
    expect(flag()).toHaveAttribute('aria-pressed', 'false')
    await save(user)
    const bridge = backend.entries[0].draft.shapes.find(s => s.name === 'Bridge')!
    expect(bridge.pts[0].bind!.tan).toBe(false); expect(bridge.pts[1].bind!.tan).toBe(true)
  })
})
