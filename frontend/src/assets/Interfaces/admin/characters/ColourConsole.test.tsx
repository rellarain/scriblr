import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { grayHex, hexHsl, hslHex, slotById } from './engine/colour'
import { newShape } from './engine/edit'
import { standardGenres, standardSlots, starterPalette } from './engine/standardColours'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { openDrawer, pick } from '../../../../test/designerUi'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A head group with a skull (Skin), an eye (an iris from Eye and a fixed white; an axis of two forms) and a neck (Skin), a body group with a shirt (Clothing), and the
// standard genres, palette and slots.
function coloured(over: Partial<ModelContent> = {}): ModelContent {
  let c: ModelContent = { ...blank('Adult'), genres: standardGenres(), palette: starterPalette(), slots: standardSlots() }
  c = addGroup(c, newGroup('gH', 'Head')); c = addGroup(c, newGroup('gB', 'Body'))
  c = addObject(c, 'gH', { id: 'oS', name: 'Skull', layer: 'body', shapes: [] })
  c = addShape(c, 'oS', { ...newShape('skull', 'Skull shape', 'oval', box(76, 20, 48, 56)), slot: 'k_skin' })
  c = addShape(c, 'oS', { ...newShape('neck', 'Neck shape', 'rounded', box(92, 74, 16, 16)), slot: 'k_skin' })
  c = addObject(c, 'gH', { id: 'oE', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'oE', { ...newShape('white', 'White', 'oval', box(84, 41, 12, 8)), gray: 100 })
  c = addShape(c, 'oE', { ...newShape('iris', 'Iris', 'oval', box(88, 42, 5, 5)), slot: 'k_eye' })
  c = addObject(c, 'gB', { id: 'oT', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oT', { ...newShape('shirt', 'Shirt part', 'rounded', box(66, 86, 68, 70)), slot: 'k_cloth' })
  const iris = c.shapes.find(s => s.id === 'iris')!
  c = {
    ...c,
    objects: c.objects.map(o => (o.id === 'oE' ? { ...o, axes: [{ id: 'aLid', name: 'Lids', initial: 'open', options: [{ id: 'open', name: 'Open', ovr: [] }, { id: 'wide', name: 'Wide', ovr: [{ shape: 'iris', pts: iris.pts.map(p => ({ ...p, x: 100 + (p.x - 100) * 1.4 })) }] }] }] } : o)),
  }
  return { ...c, ...over }
}

async function open(entries: ModelEntry[] = [draftEntry('a', coloured())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement | null
const fillOf = (id: string) => /--shape-fill:\s*([^;]+)/.exec(pathOf(id)?.getAttribute('style') ?? '')?.[1].trim() ?? null
const opacityOf = (id: string) => Number(pathOf(id)?.getAttribute('fill-opacity'))
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
const reset = () => screen.queryByRole('button', { name: 'Reset test values' })
const region = (name: string) => within(screen.getByRole('region', { name }))
const slider = (label: string) => screen.getByRole('slider', { name: label }) as HTMLInputElement
const change = (label: string, value: number) => fireEvent.change(slider(label), { target: { value: String(value) } })
const model = coloured()
const skin = slotById(model, 'k_skin')!

async function onSkull(user: ReturnType<typeof userEvent.setup>) {
  await pick(user, 'Skull shape')
  await user.click(tab('Colour'))
}

afterEach(() => { vi.restoreAllMocks() })

describe('the model starts gray', () => {
  it('draws every shape in gray: a slot at its resting brightness, a fixed gray as set, a shape with no slot in the neutral gray', async () => {
    await open()
    expect(fillOf('skull')).toBe(grayHex(skin.lRest))
    expect(fillOf('iris')).toBe(grayHex(slotById(model, 'k_eye')!.lRest))
    expect(fillOf('shirt')).toBe(grayHex(slotById(model, 'k_cloth')!.lRest))
    expect(fillOf('white')).toBe('#ffffff')
    expect(reset()).toBeNull()
  })

  it('is what a new model starts as: the six standard slots, three genres and five swatches', async () => {
    const { user } = await open([])
    await user.click(screen.getByRole('button', { name: 'New model' }))
    await user.click(tab('Colour'))
    const slots = region('Slots of the model')
    for (const name of ['Skin', 'Hair', 'Eye', 'Lip', 'Clothing', 'Shoes']) expect(slots.getByRole('listitem', { name: `Slot ${name}` })).toBeInTheDocument()
    expect(region('Genres of the model').getAllByRole('textbox')).toHaveLength(3)
    expect(region('Test palette').getAllByRole('listitem')).toHaveLength(5)
    expect(slots.queryByRole('button', { name: /Add the standard slots/ })).toBeNull()
  })
})

describe('the Colour tab: what a shape is painted from', () => {
  it('shows the slot of the selected shape and paints it from another when one is picked', async () => {
    const { user, backend } = await open()
    await onSkull(user)
    const chips = region('Colour of the selection')
    expect(chips.getByRole('button', { name: 'Skin' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(chips.getByRole('button', { name: 'Clothing' }))
    expect(chips.getByRole('button', { name: 'Clothing' })).toHaveAttribute('aria-pressed', 'true')
    expect(fillOf('skull')).toBe(grayHex(slotById(model, 'k_cloth')!.lRest))
    await save(user)
    expect(draft(backend).shapes.find(s => s.id === 'skull')!.slot).toBe('k_cloth')
    expect(draft(backend).shapes.find(s => s.id === 'neck')!.slot).toBe('k_skin')
  })

  it('paints every shape of an object from a slot at once', async () => {
    const { user, backend } = await open()
    await pick(user, 'Skull')
    await user.click(tab('Colour'))
    await user.click(region('Colour of the selection').getByRole('button', { name: 'Hair' }))
    await save(user)
    expect(draft(backend).shapes.filter(s => s.id === 'skull' || s.id === 'neck').map(s => s.slot)).toEqual(['k_hair', 'k_hair'])
  })

  it('takes a shape off its slot, and gives it a fixed gray with a stepper', async () => {
    const { user, backend } = await open()
    await onSkull(user)
    const chips = region('Colour of the selection')
    await user.click(chips.getByRole('button', { name: 'No slot' }))
    expect(fillOf('skull')).toBe(grayHex(50))
    await user.click(chips.getByRole('button', { name: 'Raise Fixed gray' }))
    expect(fillOf('skull')).toBe(grayHex(55))
    await user.click(chips.getByRole('button', { name: 'Lower Fixed gray' }))
    await user.click(chips.getByRole('button', { name: 'Lower Fixed gray' }))
    expect(fillOf('skull')).toBe(grayHex(45))
    await save(user)
    expect(draft(backend).shapes.find(s => s.id === 'skull')).toMatchObject({ slot: null, gray: 45 })
    await user.click(chips.getByRole('button', { name: 'Neutral gray' }))
    expect(fillOf('skull')).toBe(grayHex(50))
  })

  it('is refused at Publish when a shape names a slot that is gone', async () => {
    const bad = coloured()
    bad.shapes = bad.shapes.map(s => (s.id === 'skull' ? { ...s, slot: 'k_gone' } : s))
    const { user } = await open([draftEntry('a', bad)])
    await openDrawer(user)
    expect(screen.getByRole('button', { name: /Publish/ })).toBeDisabled()
    expect(screen.getByText(/uses a colour slot that does not exist/)).toBeInTheDocument()
  })
})

describe('the test colours', () => {
  it('chooses a default colour for a slot: exactly its hex, and the toolbar counts it as off rest', async () => {
    const { user, backend } = await open()
    await onSkull(user)
    const colours = region('Test colours')
    const first = skin.colours[2]
    await user.click(colours.getByRole('button', { name: `Colour ${first.hex}` }))
    expect(fillOf('skull')).toBe(first.hex)
    expect(fillOf('neck')).toBe(first.hex)               // every shape of the slot
    expect(reset()).toHaveTextContent('1 off rest')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()    // the test character is not part of the model
    expect(backend.calls.some(c => c.startsWith('PUT'))).toBe(false)
    await user.click(colours.getByRole('button', { name: 'Gray' }))
    expect(fillOf('skull')).toBe(grayHex(skin.lRest))
    expect(reset()).toBeNull()
  })

  it('moves the brightness inside the slot\'s range, and shows an opacity slider only when the slot has room for one', async () => {
    const { user } = await open()
    await onSkull(user)
    const colours = region('Test colours')
    expect(screen.queryByRole('slider', { name: 'Brightness of Skin' })).toBeNull()      // nothing chosen yet
    await user.click(colours.getByRole('button', { name: `Colour ${skin.colours[0].hex}` }))
    const bright = slider('Brightness of Skin')
    expect([bright.min, bright.max]).toEqual([String(skin.lMin), String(skin.lMax)])
    change('Brightness of Skin', 30)
    expect(fillOf('skull')).toBe(hslHexOf(skin.colours[0].hex, 30))
    expect(screen.queryByRole('slider', { name: 'Opacity of Skin' })).toBeNull()         // the skin's opacity is one value
    await user.click(colours.getByRole('button', { name: 'Hair' }))
    await user.click(colours.getByRole('button', { name: `Colour ${slotById(model, 'k_hair')!.colours[0].hex}` }))
    const hair = slotById(model, 'k_hair')!
    expect([slider('Opacity of Hair').min, slider('Opacity of Hair').max]).toEqual([String(hair.aMin), String(hair.aMax)])
  })

  it('chooses a swatch of the palette: its hue and saturation at the slot\'s brightness, and every use follows an edit of the swatch', async () => {
    const { user } = await open()
    await onSkull(user)
    await user.click(region('Test colours').getByRole('button', { name: 'Swatch Warm' }))
    const warm = starterPalette()[0]
    expect(fillOf('skull')).toBe(hslHex(warm.h, warm.s, skin.lRest))
    expect(fillOf('neck')).toBe(fillOf('skull'))
    change('Hue of Warm', 200)
    expect(fillOf('skull')).toBe(hslHex(200, warm.s, skin.lRest))
    expect(fillOf('neck')).toBe(hslHex(200, warm.s, skin.lRest))
    change('Saturation of Warm', 10)
    expect(fillOf('skull')).toBe(hslHex(200, 10, skin.lRest))
    expect(reset()).toHaveTextContent('2 off rest')            // the palette is a test copy now, and a colour is chosen
  })

  it('draws only the colours that fit the genre', async () => {
    const { user } = await open()
    await onSkull(user)
    const colours = region('Test colours')
    const count = () => colours.getAllByRole('button', { name: /^Colour #/ }).length
    expect(count()).toBe(skin.colours.length)
    await user.selectOptions(colours.getByRole('combobox', { name: 'Genre the colours are drawn from' }), 'g_fiction')
    expect(count()).toBe(skin.colours.filter(k => k.genres.length === 0).length)
    await user.selectOptions(colours.getByRole('combobox', { name: 'Genre the colours are drawn from' }), 'g_fantasy')
    expect(count()).toBe(skin.colours.length)
  })

  it('puts everything back with Reset test values', async () => {
    const { user } = await open()
    await onSkull(user)
    await user.click(region('Test colours').getByRole('button', { name: `Colour ${skin.colours[0].hex}` }))
    await user.click(region('Test colours').getByRole('button', { name: 'Swatch Warm' }))
    change('Hue of Warm', 200)
    await user.click(reset()!)
    expect(fillOf('skull')).toBe(grayHex(skin.lRest))
    expect(reset()).toBeNull()
  })
})

describe('the test palette', () => {
  it('adds swatches to ten, deletes them but the last, and loses the choices that used a deleted swatch', async () => {
    const { user } = await open()
    await onSkull(user)
    const palette = () => region('Test palette')
    await user.click(region('Test colours').getByRole('button', { name: 'Swatch Warm' }))
    await user.click(palette().getByRole('button', { name: 'Delete swatch Warm' }))
    expect(fillOf('skull')).toBe(grayHex(skin.lRest))
    expect(palette().getAllByRole('listitem')).toHaveLength(4)
    for (let i = 0; i < 6; i++) await user.click(palette().getByRole('button', { name: 'Add a swatch' }))
    expect(palette().getAllByRole('listitem')).toHaveLength(10)
    expect(palette().getByRole('button', { name: 'Add a swatch' })).toBeDisabled()
    for (let i = 0; i < 9; i++) await user.click(palette().getAllByRole('button', { name: /^Delete swatch/ })[0])
    expect(palette().getAllByRole('listitem')).toHaveLength(1)
    expect(palette().getByRole('button', { name: /^Delete swatch/ })).toBeDisabled()
  })

  it('keeps the test palette as the model\'s starter palette on request, and starts over from it', async () => {
    const { user, backend } = await open()
    await onSkull(user)
    const palette = region('Test palette')
    expect(palette.getByRole('button', { name: /Use as the starter palette/ })).toBeDisabled()
    change('Hue of Warm', 111)
    await user.click(palette.getByRole('button', { name: /Start over from the starter palette/ }))
    expect(slider('Hue of Warm').value).toBe('24')
    change('Hue of Warm', 111)
    await user.click(region('Test palette').getByRole('button', { name: /Use as the starter palette/ }))
    expect(slider('Hue of Warm').value).toBe('111')
    expect(reset()).toBeNull()                       // the test palette is the model's again
    await save(user)
    expect(draft(backend).palette![0]).toMatchObject({ id: 'k1', h: 111 })
  })
})

describe('rolling the look', () => {
  it('chooses a colour for every slot and a form on every axis, from the toolbar and from the tab', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Roll the look' }))
    expect(fillOf('skull')).not.toBe(grayHex(skin.lRest))
    expect(fillOf('shirt')).not.toBe(grayHex(slotById(model, 'k_cloth')!.lRest))
    expect(reset()).toBeTruthy()
    await user.click(tab('Colour'))
    const before = fillOf('skull')
    // another roll gives (nearly always) another colour: try until it differs
    for (let i = 0; i < 12 && fillOf('skull') === before; i++) fireEvent.click(region('Test colours').getByRole('button', { name: /Roll colours and forms/ }))
    expect(fillOf('skull')).not.toBe(before)
  })

  it('leaves a locked object as it is, and rolls the rest', async () => {
    const { user } = await open()
    await pick(user, 'Skull shape')
    await user.click(tab('Colour'))
    await user.click(region('Test colours').getByRole('button', { name: `Colour ${skin.colours[0].hex}` }))
    await pick(user, 'Skull', 'object')
    expect(screen.getByRole('button', { name: 'Lock Skull' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Lock Skull' }))
    expect(screen.getByRole('button', { name: 'Lock Skull' })).toHaveAttribute('aria-pressed', 'true')
    expect(reset()).toHaveTextContent('1 off rest')          // a lock is not something off rest
    const shirts = new Set<string | null>()
    for (let i = 0; i < 10; i++) { fireEvent.click(screen.getByRole('button', { name: 'Roll the look' })); expect(fillOf('skull')).toBe(skin.colours[0].hex); shirts.add(fillOf('shirt')) }
    expect(shirts.size).toBeGreaterThan(1)
  })

  it('locks a whole group, and a lock on a group holds its objects\' slots', async () => {
    const { user } = await open()
    await pick(user, 'Head', 'group')
    await user.click(screen.getByRole('button', { name: 'Lock Head' }))
    await user.click(screen.getByRole('button', { name: 'Roll the look' }))
    expect(fillOf('skull')).toBe(grayHex(skin.lRest))        // the head's slots stay as they were (gray)
    expect(fillOf('shirt')).not.toBe(grayHex(slotById(model, 'k_cloth')!.lRest))
  })

  it('draws a colour that fits the genre', async () => {
    const { user } = await open()
    await onSkull(user)
    await user.selectOptions(region('Test colours').getByRole('combobox', { name: 'Genre the colours are drawn from' }), 'g_fiction')
    const natural = new Set(skin.colours.filter(k => k.genres.length === 0).map(k => k.hex))
    for (let i = 0; i < 12; i++) { fireEvent.click(screen.getByRole('button', { name: 'Roll the look' })); expect(natural.has(fillOf('skull') ?? '')).toBe(true) }
  })
})

describe('the selection ring and the other places that draw colour', () => {
  it('rings the selected shape without recolouring it', async () => {
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: 'Roll the look' }))
    const before = fillOf('skull')
    expect(canvas().querySelector('[data-ring]')).toBeNull()
    await pick(user, 'Skull shape')
    expect(canvas().querySelector('[data-ring="skull"]')).not.toBeNull()
    expect(canvas().querySelectorAll('.cmRing')).toHaveLength(2)
    expect(fillOf('skull')).toBe(before)
  })

  it('draws the previews in colour: each tile has colours of its own', async () => {
    const { user } = await open()
    await openDrawer(user)
    const tiles = [...document.querySelectorAll('svg.cmTile')]
    expect(tiles.length).toBeGreaterThan(1)
    const fills = tiles.map(t => [...t.querySelectorAll('path')].map(p => /--shape-fill:\s*([^;]+)/.exec(p.getAttribute('style') ?? '')?.[1]).join())
    expect(fills.every(f => /#[0-9a-f]{6}/.test(f))).toBe(true)
    expect(new Set(fills).size).toBeGreaterThan(1)
  })

  it('draws the pictures of the forms in the test colours', async () => {
    const { user } = await open()
    await pick(user, 'Eye')
    await user.click(tab('Colour'))
    const eye = slotById(model, 'k_eye')!
    await user.click(region('Test colours').getByRole('button', { name: 'Eye' }))
    await user.click(region('Test colours').getByRole('button', { name: `Colour ${eye.colours[3].hex}` }))
    await user.click(tab('Forms'))
    const thumbs = [...document.querySelectorAll('.cmFormShape')]
    expect(thumbs.length).toBeGreaterThan(0)
    const fills = thumbs.map(p => /--shape-fill:\s*([^;]+)/.exec(p.getAttribute('style') ?? '')?.[1])
    expect(fills).toContain(eye.colours[3].hex)
    expect(fills).toContain('#ffffff')               // the white of the eye is a fixed white
  })

  it('multiplies the shape\'s own opacity by the colour\'s', async () => {
    const half = coloured()
    half.shapes = half.shapes.map(s => (s.id === 'skull' ? { ...s, op: 0.5, slot: 'k_hair' } : s))
    await open([draftEntry('a', half)])
    expect(opacityOf('skull')).toBeCloseTo(0.5)
  })
})

describe('the slots of the model', () => {
  async function onColour() {
    const r = await open()
    await onSkull(r.user)
    return r
  }

  it('adds a slot, names it, and lists it among the slots a shape may use', async () => {
    const { user, backend } = await onColour()
    const slots = region('Slots of the model')
    await user.click(slots.getByRole('button', { name: 'Add a slot' }))
    const name = slots.getByRole('textbox', { name: 'Name of slot Colour' })
    await user.clear(name); await user.type(name, 'Scales')
    expect(region('Colour of the selection').getByRole('button', { name: 'Scales' })).toBeInTheDocument()
    await save(user)
    expect(draft(backend).slots!.map(s => s.name)).toContain('Scales')
  })

  it('steps the ranges of a slot, the smallest never passing the resting value', async () => {
    const { user, backend } = await onColour()
    const slots = region('Slots of the model')
    await user.click(slots.getByRole('button', { name: 'Open slot Skin' }))
    const stepper = (label: string) => slots.getByRole('group', { name: label })
    await user.click(within(stepper('Skin brightness smallest')).getByRole('button', { name: 'Raise Skin brightness smallest' }))
    expect(within(stepper('Skin brightness smallest')).getByText('12%')).toBeInTheDocument()
    for (let i = 0; i < 40; i++) fireEvent.click(within(stepper('Skin brightness smallest')).getByRole('button', { name: 'Raise Skin brightness smallest' }))
    expect(within(stepper('Skin brightness smallest')).getByText('60%')).toBeInTheDocument()
    expect(within(stepper('Skin brightness smallest')).getByRole('button', { name: 'Raise Skin brightness smallest' })).toBeDisabled()
    await save(user)
    expect(slotById(draft(backend), 'k_skin')).toMatchObject({ lMin: 60, lRest: 60 })
  })

  it('adds a default colour, edits it with the sliders, tags it with a genre and deletes it', async () => {
    const { user, backend } = await onColour()
    const slots = region('Slots of the model')
    await user.click(slots.getByRole('button', { name: 'Open slot Skin' }))
    const before = skin.colours.length
    await user.click(slots.getByRole('button', { name: 'Add a default colour to Skin' }))
    const added = slots.getAllByRole('button', { name: /^Edit #/ }).at(-1)!
    expect(slots.getAllByRole('button', { name: /^Edit #/ })).toHaveLength(before + 1)
    await user.click(added)
    const editor = within(slots.getByRole('group', { name: /^Edit colour/ }))
    fireEvent.change(editor.getByRole('slider', { name: 'Saturation of the colour' }), { target: { value: '60' } })
    fireEvent.change(editor.getByRole('slider', { name: 'Lightness of the colour' }), { target: { value: '40' } })
    fireEvent.change(editor.getByRole('slider', { name: 'Hue of the colour' }), { target: { value: '120' } })
    await user.click(editor.getByRole('button', { name: 'Fantasy' }))
    await save(user)
    const k = slotById(draft(backend), 'k_skin')!.colours.at(-1)!
    expect(k.genres).toEqual(['g_fantasy'])
    const [h, sat, l] = hexHsl(k.hex)           // each slider keeps the other two: the colour ends up as set, to a rounding
    expect(Math.abs(h - 120)).toBeLessThan(2); expect(Math.abs(sat - 60)).toBeLessThan(2); expect(Math.abs(l - 40)).toBeLessThan(2)
    await user.click(slots.getByRole('button', { name: /^Delete colour/ }))
    expect(slots.getAllByRole('button', { name: /^Edit #/ })).toHaveLength(before)
  })

  it('deletes a slot after a question that says how many shapes go gray', async () => {
    const { user, backend } = await onColour()
    const slots = region('Slots of the model')
    await user.click(slots.getByRole('button', { name: 'Open slot Skin' }))
    await user.click(slots.getByRole('button', { name: 'Delete slot Skin' }))
    expect(slots.getByText('2 shapes will go gray.')).toBeInTheDocument()
    await user.click(slots.getByRole('button', { name: 'Keep it' }))
    expect(slots.getByRole('listitem', { name: 'Slot Skin' })).toBeInTheDocument()
    await user.click(slots.getByRole('button', { name: 'Delete slot Skin' }))
    await user.click(slots.getByRole('button', { name: 'Delete the slot' }))
    expect(slots.queryByRole('listitem', { name: 'Slot Skin' })).toBeNull()
    expect(fillOf('skull')).toBe(grayHex(50))
    await save(user)
    expect(draft(backend).shapes.filter(s => s.id === 'skull' || s.id === 'neck').map(s => s.slot)).toEqual([null, null])
  })

  it('adds the standard slots to a model that has none, keeping the model\'s own', async () => {
    const { user, backend } = await open([draftEntry('a', coloured({ genres: [], palette: [], slots: [{ ...standardSlots()[0], name: 'My skin', colours: [] }] }))])
    await pick(user, 'Skull shape')
    await user.click(tab('Colour'))
    const slots = region('Slots of the model')
    await user.click(slots.getByRole('button', { name: /Add the standard slots/ }))
    await save(user)
    const d = draft(backend)
    expect(d.slots!.map(s => s.id)).toEqual(['k_skin', 'k_hair', 'k_eye', 'k_lip', 'k_cloth', 'k_shoe'])
    expect(d.slots![0].name).toBe('My skin')
    expect(d.genres).toHaveLength(3); expect(d.palette).toHaveLength(5)
    expect(slots.queryByRole('button', { name: /Add the standard slots/ })).toBeNull()
  })
})

describe('the genres of the model', () => {
  it('adds, renames and deletes a genre; a colour that fitted only it then fits every genre', async () => {
    const { user, backend } = await open()
    await user.click(tab('Colour'))
    const genres = region('Genres of the model')
    await user.click(genres.getByRole('button', { name: 'Add a genre' }))
    const name = genres.getByRole('textbox', { name: 'Name of genre Genre' })
    await user.clear(name); await user.type(name, 'Sci-fi')
    expect(within(screen.getByRole('combobox', { name: 'Genre the colours are drawn from' })).getByRole('option', { name: 'Sci-fi' })).toBeInTheDocument()
    await user.click(genres.getByRole('button', { name: 'Delete genre Fantasy' }))
    await save(user)
    const d = draft(backend)
    expect(d.genres!.map(g => g.name)).toEqual(['Fiction', 'Non-fiction', 'Sci-fi'])
    expect(slotById(d, 'k_skin')!.colours.every(k => k.genres.length === 0)).toBe(true)
  })
})

// the colour a default colour becomes when its brightness is set
const hslHexOf = (hex: string, l: number): string => { const [h, sat] = hexHsl(hex); return hslHex(h, sat, l) }
