import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, ModelPreset } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { hexHsl } from './engine/colour'
import { newShape } from './engine/edit'
import { standardGenres, standardSlots, starterPalette } from './engine/standardColours'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
const SLIT = [{ x: 86, y: 44, m: 's' as const }, { x: 94, y: 44, m: 's' as const }, { x: 94, y: 45, m: 's' as const }, { x: 86, y: 45, m: 's' as const }]

// An Eye (a fixed white, an iris from the Eye slot, a pupil) with two expressions; a style Deep (hides the pupil, draws the iris behind the white, holds the lightness
// of the eye colour at 20) and a variant Elder (a slit eye, the style Deep, a blue eye) beside a variant Young (a dark eye) of the kind Age.
function eyed(over: Partial<ModelContent> = {}): ModelContent {
  let c: ModelContent = { ...blank('Adult'), genres: standardGenres(), palette: starterPalette(), slots: standardSlots() }
  c = addGroup(c, newGroup('gH', 'Head'))
  c = addObject(c, 'gH', {
    id: 'oE', name: 'Eye', layer: 'body', shapes: [],
    axes: [{ id: 'aShape', name: 'Shape', initial: 'round', options: [{ id: 'round', name: 'Round', ovr: [] }, { id: 'slit', name: 'Slit', ovr: [{ shape: 'iris', pts: SLIT }] }] }],
  })
  c = addShape(c, 'oE', { ...newShape('white', 'White', 'oval', box(84, 41, 12, 8)), gray: 100 })
  c = addShape(c, 'oE', { ...newShape('iris', 'Iris', 'oval', box(88, 42, 5, 5)), slot: 'k_eye' })
  c = addShape(c, 'oE', newShape('pupil', 'Pupil', 'oval', box(90, 43, 2, 2)))
  const presets: ModelPreset[] = [
    { id: 'stDeep', name: 'Deep', kind: 'Style', scope: 'oE', values: {}, hidden: ['pupil'], forms: {}, order: ['iris', 'white'], hsl: { k_eye: { h: null, s: null, l: 20 } } },
    { id: 'vElder', name: 'Elder', kind: 'Age', values: {}, hidden: [], forms: { 'oE.aShape': 'slit' }, styles: { oE: 'stDeep' }, picks: { k_eye: 'c_eye_8' } },
    { id: 'vYoung', name: 'Young', kind: 'Age', values: {}, hidden: [], picks: { k_eye: 'c_eye_1' } },
  ]
  return { ...c, presets, ...over }
}

async function open(c: ModelContent = eyed()) {
  const backend = modelsBackend([draftEntry('a', c)])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement | null
const fillOf = (id: string) => /--shape-fill:\s*([^;]+)/.exec(pathOf(id)?.getAttribute('style') ?? '')?.[1].trim() ?? null
const drawn = () => [...canvas().querySelectorAll('path[data-shape]')].map(p => p.getAttribute('data-shape'))
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
const presetOf = (b: { entries: ModelEntry[] }, name: string) => draft(b).presets!.find(p => p.name === name)!
const apply = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(screen.getByRole('button', { name: `Apply ${name}` }))
const lightness = (id: string) => hexHsl(fillOf(id)!)[2]

afterEach(() => { vi.restoreAllMocks() })

describe('a variant is a bundle of choices', () => {
  it('turns on its style, picks its colour and sets its expression, and the canvas shows all three', async () => {
    const { user } = await open()
    await user.click(tab('Presets'))
    await apply(user, 'Elder')
    expect(screen.getByRole('img', { name: 'Elder is on' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Deep is on' })).toBeInTheDocument()         // the style it turned on
    expect(pathOf('pupil')).toBeNull()                                                   // which the style hides
    expect(drawn().filter(id => id === 'iris' || id === 'white')).toEqual(['iris', 'white'])   // and draws in its own order
    expect(lightness('iris')).toBeCloseTo(20, 0)                                         // the blue eye, with the lightness the style holds
  })

  it('puts the style and the colour back when another variant of its kind is applied', async () => {
    const { user } = await open()
    await user.click(tab('Presets'))
    await apply(user, 'Elder')
    await apply(user, 'Young')
    expect(screen.queryByRole('img', { name: 'Deep is on' })).toBeNull()
    expect(pathOf('pupil')).not.toBeNull()
    expect(lightness('iris')).toBeGreaterThan(5)
    expect(lightness('iris')).toBeLessThan(15)                                           // the dark eye, free of the lock
  })

  it('keeps the expressions, styles and colours of the look when asked, and only those', async () => {
    const { user, backend } = await open()
    await user.click(tab('Presets'))
    await apply(user, 'Elder')
    const keeps = within(screen.getByRole('group', { name: 'Also keep in the preset' }))
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Plain look')
    await user.click(screen.getByRole('button', { name: 'Save the current as a preset' }))
    for (const name of ['Expressions', 'Styles', 'Colours']) {
      expect(keeps.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
      await user.click(keeps.getByRole('button', { name }))
      expect(keeps.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Full look')
    await user.click(screen.getByRole('button', { name: 'Save the current as a preset' }))
    await save(user)
    const plain = presetOf(backend, 'Plain look'), full = presetOf(backend, 'Full look')
    expect(plain.forms ?? {}).toEqual({}); expect(plain.styles ?? {}).toEqual({}); expect(plain.picks ?? {}).toEqual({})
    expect(full.forms).toEqual({ 'oE.aShape': 'slit' })
    expect(full.styles).toEqual({ oE: 'stDeep' })
    expect(full.picks).toEqual({ k_eye: 'c_eye_8' })
    // the row says what it keeps
    expect(screen.getByRole('listitem', { name: 'Preset Full look' })).toHaveTextContent('1 expression, 1 style, 1 colour')
  })

  it('keeps the whole look as a variant from the card of the model', async () => {
    const { user, backend } = await open()
    await user.click(tab('Presets'))
    await apply(user, 'Elder')
    await user.click(screen.getByRole('button', { name: 'Save the current look as a variant' }))
    await save(user)
    const made = draft(backend).presets!.find(p => p.name.startsWith('Variant'))!
    expect(made).toMatchObject({ forms: { 'oE.aShape': 'slit' }, styles: { oE: 'stDeep' }, picks: { k_eye: 'c_eye_8' } })
  })
})

describe('the parts of a colour an object holds', () => {
  async function onEyeColour(user: ReturnType<typeof userEvent.setup>) {
    await pick(user, 'Eye', 'object')
    await user.click(tab('Colour'))
    await user.click(within(screen.getByRole('group', { name: 'Slot to colour' })).getByRole('button', { name: 'Eye' }))
  }

  it('is locked at its value now, moved with a slider, and freed again', async () => {
    const { user, backend } = await open()
    await onEyeColour(user)
    await user.click(screen.getByRole('button', { name: 'Colour #2f4a7a' }))
    const before = lightness('iris')
    const lock = screen.getByRole('button', { name: 'Lock lightness of Eye on Eye' })
    expect(lock).toHaveAttribute('aria-pressed', 'false')
    await user.click(lock)
    expect(lock).toHaveAttribute('aria-pressed', 'true')
    const slider = screen.getByRole('slider', { name: 'Locked lightness of Eye on Eye' })
    expect(Number((slider as HTMLInputElement).value)).toBe(Math.round(before))
    fireEvent.change(slider, { target: { value: '33' } })
    expect(lightness('iris')).toBeCloseTo(33, 0)
    await save(user)
    expect(draft(backend).objects.find(o => o.id === 'oE')!.hsl).toEqual({ k_eye: { h: null, s: null, l: 33 } })
    await user.click(screen.getByRole('button', { name: 'Lock lightness of Eye on Eye' }))
    await save(user)
    expect(draft(backend).objects.find(o => o.id === 'oE')!.hsl).toEqual({})
  })

  it('keeps the shapes of the object as they are when another colour or swatch is chosen, and puts the brightness slider away', async () => {
    const { user } = await open()
    await onEyeColour(user)
    await user.click(screen.getByRole('button', { name: 'Colour #2f4a7a' }))
    await user.click(screen.getByRole('button', { name: 'Lock lightness of Eye on Eye' }))
    const held = lightness('iris')
    expect(screen.getByRole('slider', { name: 'Brightness of Eye' })).toBeDisabled()
    expect(screen.getByText(/Eye holds the lightness of Eye/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Colour #b08d57' }))
    expect(lightness('iris')).toBeCloseTo(held, 0)
    await user.click(screen.getByRole('button', { name: 'Swatch Gold' }))
    expect(lightness('iris')).toBeCloseTo(held, 0)
    await user.click(screen.getByRole('button', { name: 'Lock hue of Eye on Eye' }))
    const hue = hexHsl(fillOf('iris')!)[0]
    await user.click(screen.getByRole('button', { name: 'Swatch Moss' }))
    expect(hexHsl(fillOf('iris')!)[0]).toBeCloseTo(hue, 0)                            // the swatch's own hue is ignored
  })

  it('leaves a slot with no colour chosen gray', async () => {
    const { user } = await open()
    await onEyeColour(user)
    await user.click(screen.getByRole('button', { name: 'Lock hue of Eye on Eye' }))
    expect(hexHsl(fillOf('iris')!)[1]).toBe(0)
  })

  it('is the original\'s for a twin, which says so', async () => {
    const c = eyed()
    const { user } = await open({ ...c, objects: [...c.objects, { id: 'oE2', name: 'Eye twin', layer: 'body', shapes: [], mirrorOf: 'oE' }], groups: c.groups.map(g => ({ ...g, objects: [...g.objects, 'oE2'] })) })
    await pick(user, 'Eye twin', 'object')
    await user.click(tab('Colour'))
    expect(screen.getByRole('region', { name: 'Colour locks of the object' })).toHaveTextContent('is a twin')
    expect(screen.queryByRole('button', { name: /^Lock .* on Eye twin$/ })).toBeNull()
  })
})

describe('a style\'s colour locks and its shapes', () => {
  it('shows the locks a style holds, frees one and locks another', async () => {
    const { user, backend } = await open()
    await user.click(tab('Presets'))
    await user.click(screen.getByRole('button', { name: 'Colour locks of Deep' }))
    const locks = within(screen.getByRole('group', { name: 'Colour locks of Eye on style Deep' }))
    expect(locks.getByRole('button', { name: 'Lock lightness of Eye on style Deep' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(locks.getByRole('button', { name: 'Lock lightness of Eye on style Deep' }))
    await user.click(locks.getByRole('button', { name: 'Lock saturation of Eye on style Deep' }))
    fireEvent.change(locks.getByRole('slider', { name: 'Locked saturation of Eye on style Deep' }), { target: { value: '15' } })
    await save(user)
    expect(presetOf(backend, 'Deep').hsl).toEqual({ k_eye: { h: null, s: 15, l: null } })
  })

  it('lists the shapes of the open object front first, moves one, switches one off, and puts the order back', async () => {
    const { user } = await open()
    await pick(user, 'Eye', 'object')
    await user.click(tab('Presets'))
    const shapes = within(screen.getByRole('region', { name: 'Shapes of Eye' }))
    expect(shapes.getAllByRole('listitem').map(li => li.getAttribute('aria-label'))).toEqual(['Shape Pupil', 'Shape Iris', 'Shape White'])
    expect(drawn()).toEqual(['white', 'iris', 'pupil'])
    await user.click(shapes.getByRole('button', { name: 'Move Pupil back' }))
    expect(drawn()).toEqual(['white', 'pupil', 'iris'])
    expect(shapes.getAllByRole('listitem').map(li => li.getAttribute('aria-label'))).toEqual(['Shape Iris', 'Shape Pupil', 'Shape White'])
    expect(shapes.getByRole('button', { name: 'Move Iris forward' })).toBeDisabled()       // in front already
    await user.click(shapes.getByRole('button', { name: 'Hide shape Iris' }))
    expect(pathOf('iris')).toBeNull()
    expect(shapes.getByRole('button', { name: 'Show shape Iris' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(shapes.getByRole('button', { name: 'Show shape Iris' }))
    await user.click(shapes.getByRole('button', { name: /Back in the tree/ }))
    expect(drawn()).toEqual(['white', 'iris', 'pupil'])
    expect(shapes.queryByRole('button', { name: /Back in the tree/ })).toBeNull()
  })

  it('is kept by saving the look as a style of the object, and then drawn when the style is applied', async () => {
    const { user, backend } = await open(eyed({ presets: [] }))
    await pick(user, 'Eye', 'object')
    await user.click(tab('Presets'))
    const shapes = within(screen.getByRole('region', { name: 'Shapes of Eye' }))
    await user.click(shapes.getByRole('button', { name: 'Move Pupil back' }))
    await user.click(shapes.getByRole('button', { name: 'Hide shape White' }))
    await user.click(tab('Forms'))
    await user.type(screen.getByRole('textbox', { name: 'Style name for Eye' }), 'Mine')
    await user.click(screen.getByRole('button', { name: 'Save the current look as a style' }))
    await save(user)
    await user.click(tab('Presets'))
    const style = draft(backend).presets![0]
    expect(style).toMatchObject({ scope: 'oE', hidden: ['white'], order: ['white', 'pupil', 'iris'] })
    // put the test look back, then apply the style
    const again = within(screen.getByRole('region', { name: 'Shapes of Eye' }))              // the tab was drawn again
    await user.click(again.getByRole('button', { name: /Back in the tree/ }))
    await user.click(again.getByRole('button', { name: 'Show shape White' }))
    expect(drawn()).toEqual(['white', 'iris', 'pupil'])
    await apply(user, style.name)
    expect(drawn()).toEqual(['pupil', 'iris'])                                           // white is off, and the pupil is behind the iris
  })

  it('says a twin object is drawn like its original', async () => {
    const twinned: ModelContent = eyed({})
    const { user } = await open({ ...twinned, objects: [...twinned.objects, { id: 'oE2', name: 'Eye twin', layer: 'body', shapes: [], mirrorOf: 'oE' }], groups: twinned.groups.map(g => ({ ...g, objects: [...g.objects, 'oE2'] })) })
    await pick(user, 'Eye twin', 'object')
    await user.click(tab('Presets'))
    expect(screen.getByRole('region', { name: 'Shapes of Eye twin' })).toHaveTextContent('is a twin')
  })
})
