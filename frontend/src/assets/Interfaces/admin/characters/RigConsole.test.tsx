import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { holdTile } from '../../../../test/tileDrag'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import CharacterModelsConsole from './CharacterModelsConsole'
import { newShape } from './engine/edit'
import { addRange, addTurn, attachGroup, newRange, reparent, type Edit } from './engine/rigEdit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import * as presetFile from '../plot/presetFile'

vi.mock('../plot/presetFile', async importOriginal => ({ ...(await importOriginal<typeof import('../plot/presetFile')>()), downloadTextFile: vi.fn() }))

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A small rigged figure: Body (neck, chest) with Face hung from the neck's top edge and Arm hung from the chest; a Nod slider turns the Face.
function figure(over: (c: ModelContent) => ModelContent = c => c): ModelContent {
  let c = content('Adult')
  for (const [id, name] of [['gB', 'Body'], ['gF', 'Face'], ['gA', 'Arm']]) c = addGroup(c, newGroup(id, name))
  const parts: Array<[string, string, string, string, string, ReturnType<typeof box>, string]> = [
    ['gB', 'oN', 'Neck part', 'neck', 'Neck', box(92, 64, 16, 26), 'rounded'],
    ['gB', 'oC', 'Chest part', 'chest', 'Chest', box(70, 86, 60, 74), 'rounded'],
    ['gF', 'oS', 'Skull part', 'skull', 'Skull', box(80, 24, 40, 44), 'oval'],
    ['gA', 'oBi', 'Bicep part', 'bicep', 'Bicep', box(124, 90, 14, 50), 'rounded'],
  ]
  for (const [g, o, oname, sid, sname, b, tpl] of parts) {
    c = addObject(c, g, { id: o, name: oname, layer: 'body', shapes: [] })
    c = addShape(c, o, newShape(sid, sname, tpl, b))
  }
  c = must(reparent(c, 'gF', 'gB')); c = must(reparent(c, 'gA', 'gB'))
  c = must(attachGroup(c, 'gF', { shape: 'neck', kind: 'edge', i: 0, t: 0.5, slider: null, rx: 0.5, ry: 0.5 }))
  c = must(attachGroup(c, 'gA', { shape: 'chest', kind: 'inside', i: 0, t: 0, slider: null, rx: 1, ry: 0.1 }))
  c = must(addRange(c, newRange('nod', 'Nod', 'turn', 'gF')))
  c = must(addTurn(c, 'nod', 'gF'))
  c = { ...c, ranges: c.ranges.map(r => ({ ...r, drives: r.drives.map(d => ({ ...d, atMin: -12, atMax: 12 })) })) }
  return over(c)
}

async function open(entries: ModelEntry[] = [draftEntry('a', figure())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  const view = render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  return { backend, user, view }
}

const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement
const dOf = (id: string) => pathOf(id).getAttribute('d')
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const tab = (name: string) => screen.getByRole('tab', { name })
const groupRow = (name: string) => tree().getByRole('button', { name })
const savedRange = (b: { entries: ModelEntry[] }, id = 'nod') => b.entries[0].draft.ranges.find(r => r.id === id)!
const savedGroup = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.groups.find(g => g.id === id)!

function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: init.button ?? 0, clientX: init.x ?? 0, clientY: init.y ?? 0 }))
}
function pixelOf(worldX: number, worldY: number) {
  const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
  return { x: ((worldX - x) / w) * 704, y: ((worldY - y) / h) * 616 }
}
const dotAt = (n: number) => ({ x: Number(screen.getByRole('button', { name: `Point ${n}` }).getAttribute('cx')), y: Number(screen.getByRole('button', { name: `Point ${n}` }).getAttribute('cy')) })

afterEach(() => { vi.useRealTimers(); vi.mocked(presetFile.downloadTextFile).mockClear() })

describe('the inspector\'s tabs', () => {
  it('has Shape, Rig, Ranges, Forms, Presets, Colour, Proportions and Frames, moved between with the arrow keys', async () => {
    const { user } = await open()
    expect(screen.getAllByRole('tab').map(t => t.textContent?.trim())).toEqual(['Shape', 'Rig', 'Ranges', 'Forms', 'Presets', 'Colour', 'Proportions', 'Frames'])
    expect(tab('Shape')).toHaveAttribute('aria-selected', 'true')
    tab('Shape').focus()
    await user.keyboard('{ArrowRight}')
    expect(tab('Rig')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Rig')).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(tab('Shape')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(tab('Frames')).toHaveAttribute('aria-selected', 'true')
  })
  it('asks for a group when none is selected', async () => {
    const { user } = await open()
    await user.click(tab('Rig'))
    expect(screen.getByText(/Select a group, or an object or shape in one/)).toBeInTheDocument()
  })
})

describe('the Rig tab', () => {
  it('shows the group\'s chain, its level and its anchor', async () => {
    const { user } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Rig'))
    expect(screen.getByLabelText('Chain of groups')).toHaveTextContent('Body › Face')
    expect(screen.getByText(/Level 2 of 9 in the pivot chain/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Parent group' })).toHaveValue('gB')
    expect(screen.getByRole('button', { name: 'Edge spot' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Shape it is fixed to' })).toHaveValue('neck')
    expect(screen.getByRole('button', { name: 'Nod' })).toBeInTheDocument()   // the slider that moves it, in Motion
  })

  it('hangs a group from another and keeps a group from hanging from its own child', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Arm'))
    await user.click(tab('Rig'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Parent group' }), 'gF')
    expect(screen.getByText(/Level 3 of 9 in the pivot chain/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gA').parent).toBe('gF'))
    expect(savedGroup(backend, 'gA').attach).toMatchObject({ shape: 'chest' })      // the chest is in Body, which is still above it
    await user.selectOptions(screen.getByRole('combobox', { name: 'Parent group' }), '')
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gA').parent).toBeNull())
    expect(savedGroup(backend, 'gA').attach).toBeNull()               // with no parent there is nothing to be fixed to
    expect(screen.getByText(/Its anchor was removed: the shape it was fixed to is not in the new parent or above it/)).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Parent group' }), 'gF')
    await user.click(groupRow('Body'))
    const options = within(screen.getByRole('combobox', { name: 'Parent group' })).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['Nothing (the root)'])                      // every other group hangs below it
  })

  it('refuses a tenth level of the chain and says so', async () => {
    let c = figure()
    for (let i = 0; i < 7; i++) { c = addGroup(c, newGroup(`x${i}`, `Level ${i + 3}`)); c = must(reparent(c, `x${i}`, i ? `x${i - 1}` : 'gF')) }   // Body > Face > Level 3..9
    c = addGroup(c, newGroup('top', 'One too many'))
    const { user } = await open([draftEntry('a', c)])
    await user.click(screen.getByRole('button', { name: 'Rig' }))          // a group with no object is only in the Rig view of the tree
    await user.click(groupRow('One too many'))
    await user.click(tab('Rig'))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Parent group' }), 'x6')
    expect(screen.getByText(/That would make a pivot chain 10 groups long; the most is 9/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Parent group' })).toHaveValue('')
  })

  it('changes the kind of anchor and steps along the shape', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Rig'))
    await user.click(screen.getByRole('button', { name: 'Point' }))
    expect(within(screen.getByRole('group', { name: 'Point' })).getByText('1 of 8')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Raise Point' }))
    expect(within(screen.getByRole('group', { name: 'Point' })).getByText('2 of 8')).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach).toMatchObject({ kind: 'point', shape: 'neck', i: 1 }))
    await user.click(screen.getByRole('button', { name: 'None' }))
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach).toBeNull())
  })

  it('offers a sliding anchor only when there is a slider, and then picks it', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Rig'))
    await user.click(screen.getByRole('button', { name: 'Slides' }))
    expect(screen.getByRole('combobox', { name: 'Slider that moves the anchor' })).toHaveValue('nod')
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach).toMatchObject({ kind: 'range', slider: 'nod' }))
  })

  it('picks an anchor by clicking a shape of the parent on the canvas', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Rig'))
    await user.click(screen.getByRole('button', { name: 'Point' }))
    await user.click(screen.getByRole('button', { name: 'Pick on the canvas' }))
    expect(screen.getByRole('button', { name: /Click a shape of the parent/ })).toHaveAttribute('aria-pressed', 'true')
    pointer(pathOf('skull'), 'pointerdown')                                  // not a shape of the parent: nothing happens
    expect(screen.getByRole('button', { name: /Click a shape of the parent/ })).toBeInTheDocument()
    const at = pixelOf(110, 90)                                              // near the neck's lower right
    pointer(pathOf('neck'), 'pointerdown', at)
    expect(screen.getByRole('button', { name: 'Pick on the canvas' })).toHaveAttribute('aria-pressed', 'false')
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach).toMatchObject({ kind: 'point', shape: 'neck' }))
    expect(savedGroup(backend, 'gF').attach!.i).toBeGreaterThan(0)
  })
})

describe('the pivot on the canvas', () => {
  it('is drawn for the selected group, nudged with the arrow keys, and dragged when no slider is away from rest', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Body'))
    const pivot = () => screen.getByRole('button', { name: /^Pivot of Body/ })
    expect(pivot()).toHaveAccessibleName(/Drag it, or press the arrow keys/)
    const before = savedGroup(backend, 'gB').pivot
    expect(before).toBeNull()
    pivot().focus()
    fireEvent.keyDown(pivot(), { key: 'ArrowRight' })
    fireEvent.keyDown(pivot(), { key: 'ArrowDown', shiftKey: true })
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gB').pivot).not.toBeNull())
    const [x0, y0] = savedGroup(backend, 'gB').pivot!
    const circle = pivot().querySelector('.cmPivotRing') as SVGCircleElement
    const start = pixelOf(Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))), to = pixelOf(x0 + 10, y0 - 12)
    pointer(pivot(), 'pointerdown', start)
    pointer(canvas(), 'pointermove', to)
    pointer(canvas(), 'pointerup', to)
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gB').pivot![0]).toBeCloseTo(x0 + 10, 0))
    expect(savedGroup(backend, 'gB').pivot![1]).toBeCloseTo(y0 - 12, 0)
  })

  it('steps the anchor of an anchored group with the arrow keys: along the edge, to the next point, across the shape', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Face'))
    const pivot = () => screen.getByRole('button', { name: /^Pivot of Face/ })
    pivot().focus()
    fireEvent.keyDown(pivot(), { key: 'ArrowRight' })
    fireEvent.keyDown(pivot(), { key: 'ArrowRight', shiftKey: true })
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach!.t).toBeCloseTo(0.62, 2))     // 0.5 + 0.02 + 0.1
    fireEvent.keyDown(pivot(), { key: 'ArrowLeft' })
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach!.t).toBeCloseTo(0.6, 2))
    await user.click(tab('Rig'))
    await user.click(screen.getByRole('button', { name: 'Point' }))
    fireEvent.keyDown(pivot(), { key: 'ArrowDown' })
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach).toMatchObject({ kind: 'point', i: 1 }))
    fireEvent.keyDown(pivot(), { key: 'ArrowUp' })
    fireEvent.keyDown(pivot(), { key: 'ArrowUp' })
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gF').attach!.i).toBe(7))                     // wraps round to the last of the eight points
    await user.click(groupRow('Arm'))                                                           // an "inside" anchor, at 100% across and 10% down
    const arm = () => screen.getByRole('button', { name: /^Pivot of Arm/ })
    fireEvent.keyDown(arm(), { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(arm(), { key: 'ArrowDown' })
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gA').attach).toMatchObject({ kind: 'inside', rx: 0.9, ry: 0.12 }))
  })

  it('cannot be moved while a slider is away from rest', async () => {
    const { user } = await open()
    await user.click(groupRow('Body'))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'All (1)' }))
    fireEvent.change(screen.getByLabelText('Try Nod'), { target: { value: '10' } })
    expect(screen.getByRole('button', { name: /^Pivot of Body/ }).getAttribute('aria-label')).not.toMatch(/Drag it/)
  })

  it('shows where an anchored group is fixed', async () => {
    const { user } = await open()
    await user.click(groupRow('Face'))
    expect(canvas().querySelector('.cmAnchor')).not.toBeNull()
    await user.click(groupRow('Body'))
    expect(canvas().querySelector('.cmAnchor')).toBeNull()
  })
})

describe('the Ranges tab', () => {
  it('lists the sliders of the selection, or all of them', async () => {
    const { user } = await open()
    await user.click(tab('Ranges'))
    expect(screen.getByRole('region', { name: 'Slider Nod' })).toBeInTheDocument()           // nothing selected: every slider
    await user.click(groupRow('Arm'))
    expect(screen.queryByRole('region', { name: 'Slider Nod' })).toBeNull()
    expect(screen.getByText(/No slider has to do with the selection/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All (1)' }))
    expect(screen.getByRole('region', { name: 'Slider Nod' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'This selection' }))
    expect(screen.queryByRole('region', { name: 'Slider Nod' })).toBeNull()
    await user.click(groupRow('Face'))
    expect(screen.getByRole('region', { name: 'Slider Nod' })).toBeInTheDocument()
  })

  it('moves the drawing with the Try it slider, says how many sliders are off rest, and resets them', async () => {
    const { user } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Ranges'))
    const rest = dOf('skull'), neck = dOf('neck')
    expect(screen.queryByText(/off rest/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Try Nod'), { target: { value: '20' } })
    expect(dOf('skull')).not.toBe(rest)
    expect(within(screen.getByRole('region', { name: 'Slider Nod' })).getByText('20°')).toBeInTheDocument()
    expect(dOf('neck')).toBe(neck)                                      // the parent does not move
    expect(screen.getByText(/1 off rest/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset test values' }))
    expect(dOf('skull')).toBe(rest)
    expect(screen.queryByText(/off rest/)).toBeNull()                    // the toolbar badge is gone; the tab's own reset button stays, disabled
    expect(screen.getByRole('button', { name: 'Reset test values' })).toBeDisabled()
  })

  it('steps the minimum, rest and maximum, and what the drive does at each end', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Ranges'))
    const card = within(screen.getByRole('region', { name: 'Slider Nod' }))
    await user.click(card.getByRole('button', { name: 'Raise Maximum of Nod' }))
    expect(within(card.getByRole('group', { name: 'Maximum of Nod' })).getByText('31°')).toBeInTheDocument()
    await user.click(card.getByRole('button', { name: 'Lower Minimum of Nod' }))
    expect(within(card.getByRole('group', { name: 'Minimum of Nod' })).getByText('-31°')).toBeInTheDocument()
    await user.click(card.getByRole('button', { name: 'Raise At the maximum (drive 1 of Nod)' }))
    expect(card.getByText(/Turns Face by -12° at the minimum and \+13° at the maximum/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(savedRange(backend)).toMatchObject({ min: -31, max: 31 }))
    expect(savedRange(backend).drives[0].atMax).toBe(13)
  })

  it('renames a slider, hides it from writers and deletes it after asking', async () => {
    const { user, backend } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Ranges'))
    const name = screen.getByRole('textbox', { name: 'Name of Nod' })
    await user.clear(name)
    await user.type(name, 'Head nod')
    await user.click(screen.getByRole('button', { name: 'Hide Head nod from writers' }))
    await save(user)
    await waitFor(() => expect(savedRange(backend)).toMatchObject({ name: 'Head nod', show: false }))
    await user.click(screen.getByRole('button', { name: 'Delete slider Head nod' }))
    expect(savedRange(backend)).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges).toEqual([]))
  })

  it('makes a slider that turns the selected group, and offers it only with a group selected', async () => {
    const { user, backend } = await open()
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    expect(screen.getByRole('menuitem', { name: /Turn the group/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'New slider' }))           // closes the menu again
    await user.click(groupRow('Arm'))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    await user.click(screen.getByRole('menuitem', { name: 'Turn the group' }))
    const card = within(screen.getByRole('region', { name: 'Slider Arm turn' }))
    expect(card.getByText(/Turns Arm by -20° at the minimum and \+20° at the maximum/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges).toHaveLength(2))
    const made = backend.entries[0].draft.ranges[1]
    expect(made).toMatchObject({ name: 'Arm turn', scope: 'gA', unit: '°' })
    expect(made.drives[0]).toMatchObject({ kind: 'turn', group: 'gA' })
    expect(savedGroup(backend, 'gA').pivot).not.toBeNull()
  })

  it('makes a slider that scales the model when nothing is selected, and scales a shape or a group otherwise', async () => {
    const { user, backend } = await open()
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    await user.click(screen.getByRole('menuitem', { name: 'Scale' }))
    expect(screen.getByRole('region', { name: 'Slider Size' })).toHaveTextContent('Scales the whole model to 80% at the minimum and 120% at the maximum')
    await user.click(tree().getByRole('button', { name: 'Skull' }))
    await user.click(screen.getByRole('button', { name: 'New slider' }))
    await user.click(screen.getByRole('menuitem', { name: 'Scale' }))
    expect(screen.getByRole('region', { name: 'Slider Skull size' })).toHaveTextContent('Scales Skull to 80% at the minimum')
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges.map(r => r.name)).toEqual(['Nod', 'Size', 'Skull size']))
  })

  it('adds a bend to a slider from the selected shape, and adds nothing when no shape is selected', async () => {
    const { user } = await open()
    await user.click(groupRow('Arm'))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'All (1)' }))
    const card = within(screen.getByRole('region', { name: 'Slider Nod' }))
    await user.click(card.getByRole('button', { name: 'Add what it drives' }))
    expect(screen.getByRole('menuitem', { name: /Bend the shape/ })).toBeDisabled()
    await user.click(tree().getByRole('button', { name: 'Bicep' }))                // the menu stays open while another thing is selected
    await user.click(screen.getByRole('menuitem', { name: 'Bend the shape' }))
    expect(card.getByText(/Bends Bicep by -30° at the minimum and \+30° at the maximum/)).toBeInTheDocument()
    await user.click(card.getByRole('button', { name: 'Raise Bend ends at' }))
    await user.click(card.getAllByRole('button', { name: 'Remove this' })[1])
    expect(card.queryByText(/Bends Bicep/)).toBeNull()
  })

  it('sweeps a slider from its minimum to its maximum and back, and stops', async () => {
    const { user } = await open()
    await user.click(groupRow('Face'))
    await user.click(tab('Ranges'))
    vi.useFakeTimers()
    const rest = dOf('skull')
    fireEvent.click(screen.getByRole('button', { name: 'Sweep Nod from its minimum to its maximum' }))
    act(() => { vi.advanceTimersByTime(700) })
    expect(dOf('skull')).not.toBe(rest)
    expect(screen.getByRole('button', { name: 'Stop sweeping Nod' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Stop sweeping Nod' }))
    const stopped = dOf('skull')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(dOf('skull')).toBe(stopped)
    vi.useRealTimers()
    await user.click(screen.getByRole('button', { name: 'Reset test values' }))
    expect(dOf('skull')).toBe(rest)
  })
})

describe('recording points', () => {
  async function startRecording() {
    const ctx = await open()
    await ctx.user.click(tree().getByRole('button', { name: 'Chest' }))
    await ctx.user.click(screen.getByRole('tab', { name: 'Ranges' }))
    await ctx.user.click(screen.getByRole('button', { name: 'New slider' }))
    await ctx.user.click(screen.getByRole('menuitem', { name: /Move points/ }))
    return ctx
  }

  it('records the points dragged at the maximum and moves them with the slider afterwards', async () => {
    const { user, backend } = await startRecording()
    expect(screen.getByText(/Recording the maximum of Chest shape/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Snap' }))               // off: the point lands exactly under the pointer
    const wide = dOf('chest')
    const from = dotAt(3), to = pixelOf(from.x + 9, from.y)
    pointer(screen.getByRole('button', { name: 'Point 3' }), 'pointerdown', pixelOf(from.x, from.y))
    pointer(canvas(), 'pointermove', to)
    pointer(canvas(), 'pointerup', to)
    expect(dOf('chest')).not.toBe(wide)                                          // the copy shows the drag
    await user.click(screen.getByRole('button', { name: 'Set maximum' }))
    expect(screen.queryByText(/Recording the maximum/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Slider Chest shape' })).toHaveTextContent(/Moves \d points? of Chest/)
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges).toHaveLength(2))
    const made = backend.entries[0].draft.ranges[1]
    expect(made.drives[0]).toMatchObject({ kind: 'points', shape: 'chest' })
    expect(made.drives[0].moves.some(m => m.i === 2 && m.dx > 8)).toBe(true)
    expect(backend.entries[0].draft.shapes.find(s => s.id === 'chest')!.pts[2].x).toBeCloseTo(from.x, 0)   // the drawn shape itself did not change
  })

  it('does not record adding a point, and can be cancelled', async () => {
    const { user, backend } = await startRecording()
    const at = pixelOf(100, 86)
    fireEvent(pathOf('chest'), new MouseEvent('dblclick', { bubbles: true, clientX: at.x, clientY: at.y }))
    expect(screen.getByText(/record the points that are there/)).toBeInTheDocument()      // the note (the banner says the same thing in other words)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/Recording the maximum/)).toBeNull()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges).toHaveLength(2))
    expect(backend.entries[0].draft.ranges[1].drives).toEqual([])
    expect(screen.getByText('It drives nothing yet.')).toBeInTheDocument()
  })

  it('refuses to set a maximum when nothing was moved', async () => {
    const { user } = await startRecording()
    await user.click(screen.getByRole('button', { name: 'Set maximum' }))
    expect(screen.getByText('No point was moved.')).toBeInTheDocument()
    expect(screen.getByText(/Recording the maximum/)).toBeInTheDocument()
  })

  it('shows a shape whose points a slider changes, away from rest, without letting its points be dragged', async () => {
    const { user, backend } = await startRecording()
    await user.click(screen.getByRole('button', { name: 'Snap' }))
    const from = dotAt(3), to = pixelOf(from.x + 9, from.y)
    pointer(screen.getByRole('button', { name: 'Point 3' }), 'pointerdown', pixelOf(from.x, from.y))
    pointer(canvas(), 'pointermove', to); pointer(canvas(), 'pointerup', to)
    await user.click(screen.getByRole('button', { name: 'Set maximum' }))    // the slider is now at its maximum, so the shape is away from its drawn points
    expect(screen.getByText(/A slider changes this shape's points and is away from rest/)).toBeInTheDocument()
    const shown = dotAt(3)
    pointer(screen.getByRole('button', { name: 'Point 3' }), 'pointerdown', pixelOf(shown.x, shown.y))
    pointer(canvas(), 'pointermove', pixelOf(shown.x + 20, shown.y)); pointer(canvas(), 'pointerup', pixelOf(shown.x + 20, shown.y))
    expect(dotAt(3).x).toBeCloseTo(shown.x, 3)
    await user.click(screen.getByRole('button', { name: 'Reset test values' }))
    expect(screen.queryByText(/A slider changes this shape's points/)).toBeNull()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.ranges).toHaveLength(2))
  })
})

describe('editing with the groups turned', () => {
  it('draws the points on the shape where the group has put it, and drags them in the shape\'s own space', async () => {
    const { user, backend } = await open()
    await user.click(tree().getByRole('button', { name: 'Skull' }))
    await user.click(tab('Ranges'))
    await user.click(screen.getByRole('button', { name: 'All (1)' }))
    fireEvent.change(screen.getByLabelText('Try Nod'), { target: { value: '20' } })       // the head is turned 12 degrees
    const first = dOf('skull')!.match(/^M([-\d.]+) ([-\d.]+)/)!
    expect(dotAt(1).x).toBeCloseTo(Number(first[1]), 1); expect(dotAt(1).y).toBeCloseTo(Number(first[2]), 1)   // the dot sits on the drawn point
    await user.click(screen.getByRole('button', { name: 'Snap' }))
    await user.click(screen.getByRole('button', { name: 'Mirror editing' }))
    const from = dotAt(2), to = pixelOf(from.x + 6, from.y + 6)
    pointer(screen.getByRole('button', { name: 'Point 2' }), 'pointerdown', pixelOf(from.x, from.y))
    pointer(canvas(), 'pointermove', to); pointer(canvas(), 'pointerup', to)
    expect(dotAt(2).x).toBeCloseTo(from.x + 6, 1); expect(dotAt(2).y).toBeCloseTo(from.y + 6, 1)   // under the pointer, though the head is turned
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.shapes.find(s => s.id === 'skull')!.pts[1].x).not.toBe(120))
  })
})

describe('the tree', () => {
  it('switches to the Rig view: groups under their parent with their level, folded and opened', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Rig' }))
    const rig = within(tree().getByText('Body').closest('.cmRigTree') as HTMLElement)
    expect(rig.getByRole('button', { name: 'Body' })).toBeInTheDocument()
    expect(rig.getByRole('button', { name: 'Face' })).toBeInTheDocument()
    expect(rig.getByRole('button', { name: 'Arm' })).toBeInTheDocument()
    expect(rig.getByTitle('Level 1 of 9 in the pivot chain')).toHaveTextContent('1')
    expect(rig.getAllByTitle('Level 2 of 9 in the pivot chain')).toHaveLength(2)
    await user.click(rig.getByRole('button', { name: 'Fold Body' }))
    expect(rig.queryByRole('button', { name: 'Face' })).toBeNull()
    await user.click(rig.getByRole('button', { name: 'Open Body' }))
    expect(rig.getByRole('button', { name: 'Face' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Layers' }))
    expect(tree().getByRole('button', { name: 'Skull' })).toBeInTheDocument()
  })

  it('indents and outdents a group with Alt + Right and Left on its grip', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Rig' }))
    const armGrip = () => screen.getByRole('button', { name: 'Move Arm to another parent (Alt+Right or Left)' })
    armGrip().focus()
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')                        // Arm now hangs from Face, the group above it
    expect(tree().getAllByTitle('Level 3 of 9 in the pivot chain')).toHaveLength(1)
    armGrip().focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    expect(tree().queryByTitle('Level 3 of 9 in the pivot chain')).toBeNull()
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gA').parent).toBe('gB'))
  })

  it('hangs a group on another by dragging its grip onto it, and unhangs it dropped on the empty space', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Rig' }))
    const rects = (el: Element, left: number, top: number, w: number, h: number) => {
      (el as HTMLElement).getBoundingClientRect = () => ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) })
    }
    const row = (name: string) => tree().getByRole('button', { name, hidden: false }).closest('[data-rig-row]') as HTMLElement
    rects(tree().getByText('Body').closest('.cmRigTree')!, 0, 0, 400, 400)
    rects(row('Body'), 0, 0, 200, 20); rects(row('Face'), 0, 40, 200, 20); rects(row('Arm'), 0, 80, 200, 20)
    const grip = screen.getByRole('button', { name: 'Move Arm to another parent (Alt+Right or Left)' })
    const held = holdTile(grip, { x: 10, y: 90 })
    held.moveTo(50, 50)
    expect(row('Face').className).toContain('cmTreeRow--drop')
    held.drop()
    expect(tree().getAllByTitle('Level 3 of 9 in the pivot chain')).toHaveLength(1)
    // and back to the root
    rects(row('Arm'), 0, 120, 200, 20)
    const again = holdTile(screen.getByRole('button', { name: 'Move Arm to another parent (Alt+Right or Left)' }), { x: 10, y: 130 })
    again.moveTo(300, 300)
    again.drop()
    expect(tree().queryByTitle('Level 3 of 9 in the pivot chain')).toBeNull()
    await save(user)
    await waitFor(() => expect(savedGroup(backend, 'gA').parent).toBeNull())
  })

  it('keeps Escape for a drag: the group stays where it was', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Rig' }))
    const row = (name: string) => tree().getByRole('button', { name }).closest('[data-rig-row]') as HTMLElement
    ;[['Body', 0], ['Face', 40], ['Arm', 80]].forEach(([name, top]) => { (row(name as string) as HTMLElement).getBoundingClientRect = () => ({ left: 0, top: top as number, width: 200, height: 20, right: 200, bottom: (top as number) + 20, x: 0, y: top as number, toJSON: () => ({}) }) })
    const held = holdTile(screen.getByRole('button', { name: 'Move Arm to another parent (Alt+Right or Left)' }), { x: 10, y: 90 })
    held.moveTo(50, 50)
    held.cancel()
    expect(tree().queryByTitle('Level 3 of 9 in the pivot chain')).toBeNull()
  })

  it('draws a shape reordered in the tree in front or behind the other: the order is what is drawn', async () => {
    const c = figure(m => ({ ...m, objects: m.objects.map(o => (o.id === 'oN' ? { ...o, shapes: ['neck', 'chest'] } : o.id === 'oC' ? { ...o, shapes: [] } : o)) }))
    const { user } = await open([draftEntry('a', c)])
    const order = () => Array.from(canvas().querySelectorAll('path[data-shape]')).map(p => p.getAttribute('data-shape')).filter(id => id === 'neck' || id === 'chest')
    expect(order()).toEqual(['neck', 'chest'])
    await user.click(tree().getByRole('button', { name: 'Move Neck up in the draw order' }))
    expect(order()).toEqual(['chest', 'neck'])
  })

  it('reorders by the grip with Alt + Up and Down', async () => {
    const c = figure(m => ({ ...m, objects: m.objects.map(o => (o.id === 'oN' ? { ...o, shapes: ['neck', 'chest'] } : o.id === 'oC' ? { ...o, shapes: [] } : o)) }))
    const { user, backend } = await open([draftEntry('a', c)])
    screen.getByRole('button', { name: 'Move Neck (Alt+Up or Down)' }).focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.objects.find(o => o.id === 'oN')!.shapes).toEqual(['chest', 'neck']))
  })
})

describe('the mirror line', () => {
  it('moves one step at a time, is drawn on the canvas and is saved', async () => {
    const { user, backend } = await open()
    const line = () => canvas().querySelector('.cmMirrorLine')!.getAttribute('x1')
    expect(line()).toBe('100')
    await user.click(screen.getByRole('button', { name: 'Raise Mirror line' }))
    await user.click(screen.getByRole('button', { name: 'Raise Mirror line' }))
    expect(line()).toBe('102')
    await user.click(screen.getByRole('button', { name: 'Lower Mirror line' }))
    expect(screen.getByText('x 101')).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(backend.entries[0].draft.axis).toBe(101))
  })
})

describe('the previews and the checks', () => {
  it('draw the sliders at the ends of their ranges in the stress previews', async () => {
    const { user } = await open()
    const strip = screen.getByRole('region', { name: 'Previews' })
    const tile = () => within(strip).getByRole('img', { name: 'Preview 1' }).innerHTML
    await user.click(within(strip).getByRole('button', { name: 'Smallest' }))
    const small = tile()
    await user.click(within(strip).getByRole('button', { name: 'Largest' }))
    expect(tile()).not.toBe(small)
  })

  it('say what looks wrong in the rig', async () => {
    const c = figure(m => ({ ...m, ranges: [...m.ranges, newRange('idle', 'Idle slider', 'turn')] }))
    await open([draftEntry('a', c)])
    const checks = within(screen.getByRole('region', { name: 'Checks' }))
    expect(checks.getByText('Rig check:')).toBeInTheDocument()
    expect(checks.getByText('Slider Idle slider drives nothing yet.')).toBeInTheDocument()
  })

  it('warn about a pivot chain that is deeper than 6 levels', async () => {
    let c = figure()
    for (let i = 0; i < 5; i++) { c = addGroup(c, newGroup(`x${i}`, `Deep ${i}`)); c = must(reparent(c, `x${i}`, i ? `x${i - 1}` : 'gF')) }
    await open([draftEntry('a', c)])
    expect(within(screen.getByRole('region', { name: 'Checks' })).getByText(/Deep 4 is 7 levels deep: the warning starts above 6/)).toBeInTheDocument()
  })
})

describe('model files', () => {
  it('exports the open model and all of them', async () => {
    const { user } = await open([draftEntry('a', figure()), draftEntry('b', content('Second'))])
    await user.click(screen.getByRole('button', { name: 'Export the model to a file' }))
    const [name, body] = vi.mocked(presetFile.downloadTextFile).mock.calls[0]
    expect(name).toBe('scriblr-character-model-adult.json')
    expect(JSON.parse(body).models[0].ranges[0].id).toBe('nod')
    await user.click(screen.getByRole('button', { name: /Export all/ }))
    const [all, allBody] = vi.mocked(presetFile.downloadTextFile).mock.calls[1]
    expect(all).toBe('scriblr-character-models.json')
    expect(JSON.parse(allBody).models).toHaveLength(2)
  })

  it('imports models as unpublished drafts, says what it skipped, and opens the first', async () => {
    const { user, backend } = await open([draftEntry('a', figure())])
    const source = JSON.stringify({ scriblrCharacterModels: 1, models: [{ name: 'Adult', shapes: [], groups: [] }, { shapes: [] }, { name: 'Elder', ranges: [{ id: 'r', name: 'Age', drives: [] }] }] })
    await user.upload(screen.getByLabelText('Import character models from a file'), new File([source], 'models.json', { type: 'application/json' }))
    expect(await screen.findByText('Imported 2 models as drafts. They stay unpublished until you publish them.')).toBeInTheDocument()
    expect(screen.getByText('Adult (copy) · Elder')).toBeInTheDocument()
    expect(screen.getByText('Skipped: The model at position 2 has no name.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Model name' })).toHaveValue('Adult (copy)')
    await waitFor(() => expect(backend.entries.map(e => e.draft.name)).toEqual(['Adult', 'Adult (copy)', 'Elder']))
    expect(backend.entries.every(e => e.published === null)).toBe(true)
  })

  it('reports a file that is not a model file', async () => {
    const { user, backend } = await open([draftEntry('a', figure())])
    await user.upload(screen.getByLabelText('Import character models from a file'), new File(['{"hello": 1}'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This is not a Scriblr character model file.')
    expect(backend.entries).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
