import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import CharacterModelsConsole from './CharacterModelsConsole'
import { hexHsl, slotById } from './engine/colour'
import { newShape } from './engine/edit'
import { makeTwin } from './engine/pairEdit'
import { standardGenres, standardSlots, starterPalette } from './engine/standardColours'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A head with a skull and a neck (Skin) in one object, an eye (a fixed white and an iris from Eye, with an axis of two forms) in another, and a shirt.
function painted(): ModelContent {
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
  return {
    ...c,
    objects: c.objects.map(o => (o.id === 'oE' ? { ...o, axes: [{ id: 'aCol', name: 'Eye colour', initial: 'plain', options: [{ id: 'plain', name: 'Plain', ovr: [] }, { id: 'dark', name: 'Dark', ovr: [] }] }] } : o)),
  }
}

async function open(entries: ModelEntry[] = [draftEntry('a', painted())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<CharacterModelsConsole />)
  await screen.findByRole('heading', { name: 'Character models' })
  return { backend, user }
}

const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement
const styleOf = (id: string) => pathOf(id).getAttribute('style') ?? ''
const fillOf = (id: string) => /--shape-fill:\s*([^;]+)/.exec(styleOf(id))?.[1].trim() ?? null
const lightnessOf = (hex: string) => hexHsl(hex)[2]
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const saved = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.shapes.find(s => s.id === id)!
const paint = () => within(screen.getByRole('region', { name: 'Paint of the selection' }))
const group = (name: string) => within(paint().getByRole('group', { name }))
function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: { x?: number; y?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: init.x ?? 0, clientY: init.y ?? 0 }))
}

async function on(user: ReturnType<typeof userEvent.setup>, shape = 'Skull shape') {
  await user.click(tree().getByRole('button', { name: shape }))
  await user.click(tab('Colour'))
}

afterEach(() => { vi.restoreAllMocks() })

describe('the Paint section', () => {
  it('belongs to a selected shape in the Colour tab', async () => {
    const { user } = await open()
    await user.click(tab('Colour'))
    expect(screen.queryByRole('region', { name: 'Paint of the selection' })).toBeNull()
    await on(user)
    expect(paint().getByRole('heading', { name: 'Paint' })).toBeInTheDocument()
    expect(group('Tone').getByRole('button', { name: 'Base' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('steps the tone lighter or darker, saves it, and draws it', async () => {
    const { user, backend } = await open()
    await on(user)
    const base = lightnessOf(fillOf('skull')!)
    await user.click(group('Tone').getByRole('button', { name: 'Lighter' }))
    expect(lightnessOf(fillOf('skull')!)).toBeGreaterThan(base)
    await user.click(group('Tone').getByRole('button', { name: 'Darker' }))
    expect(lightnessOf(fillOf('skull')!)).toBeLessThan(base)
    await save(user)
    expect(saved(backend, 'skull').tone).toBe(-1)
    expect(saved(backend, 'neck').tone).toBe(0)
  })

  it('makes a shape a tone of its colour, with an amount to step', async () => {
    const { user, backend } = await open()
    await on(user)
    const plain = fillOf('skull')
    await user.click(group('Derived tone').getByRole('button', { name: 'Shadow' }))
    expect(fillOf('skull')).not.toBe(plain)
    expect(lightnessOf(fillOf('skull')!)).toBeLessThan(lightnessOf(plain!))
    await user.click(screen.getByRole('button', { name: 'Raise Derived amount' }))
    await user.click(group('Derived tone').getByRole('button', { name: 'Own colour' }))
    expect(fillOf('skull')).toBe(plain)
    await user.click(group('Derived tone').getByRole('button', { name: 'Highlight' }))
    await user.click(screen.getByRole('button', { name: 'Raise Derived amount' }))
    await save(user)
    expect(saved(backend, 'skull').derive).toEqual({ kind: 'highlight', t: 0.11 })
  })

  it('runs a gradient in a direction to a darker tone or to another slot, and takes it away again', async () => {
    const { user, backend } = await open()
    await on(user)
    expect(canvas().querySelector('radialGradient')).toBeNull()
    await user.click(group('Gradient').getByRole('button', { name: 'Radial' }))
    expect(fillOf('skull')).toMatch(/^url\(#.+\)$/)
    expect(canvas().querySelector('radialGradient')).not.toBeNull()
    await user.click(group('Gradient').getByRole('button', { name: 'Left' }))
    expect(canvas().querySelector('radialGradient')).toBeNull()
    expect(canvas().querySelector('linearGradient')).not.toBeNull()
    await user.click(group('Second colour of the gradient').getByRole('button', { name: 'Hair' }))
    await save(user)
    expect(saved(backend, 'skull').grad).toEqual({ dir: 'left', to: 'k_hair' })
    await user.click(group('Gradient').getByRole('button', { name: 'No gradient' }))
    expect(fillOf('skull')).toMatch(/^#[0-9a-f]{6}$/)
    expect(canvas().querySelector('linearGradient')).toBeNull()
  })

  it('blends a shape with what is under it', async () => {
    const { user, backend } = await open()
    await on(user)
    await user.click(group('Blend mode').getByRole('button', { name: 'Multiply' }))
    expect(styleOf('skull')).toMatch(/mix-blend-mode:\s*multiply/)
    await save(user)
    expect(saved(backend, 'skull').blend).toBe('multiply')
    await user.click(group('Blend mode').getByRole('button', { name: 'Normal' }))
    expect(styleOf('skull')).not.toMatch(/mix-blend-mode/)
  })

  it('keeps a shape inside another, chosen from the list or picked on the canvas', async () => {
    const { user, backend } = await open()
    await on(user)
    expect(pathOf('skull').getAttribute('clip-path')).toBeNull()
    await user.click(group('Clip to').getByRole('button', { name: 'Neck shape' }))
    expect(pathOf('skull').getAttribute('clip-path')).toMatch(/^url\(#.+\)$/)
    expect(canvas().querySelector('clipPath')).not.toBeNull()
    await user.click(group('Clip to').getByRole('button', { name: 'Not clipped' }))
    expect(pathOf('skull').getAttribute('clip-path')).toBeNull()
    await user.click(group('Clip to').getByRole('button', { name: /Pick on the canvas/ }))
    expect(screen.getByText(/Click the shape Skull shape is to be clipped to/)).toBeInTheDocument()
    pointer(pathOf('neck'), 'pointerdown', { x: 100, y: 100 })
    expect(group('Clip to').getByRole('button', { name: 'Neck shape' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Click the shape Skull shape is to be clipped to/)).toBeNull()
    await save(user)
    expect(saved(backend, 'skull').clip).toBe('neck')
  })

  it('lets other shapes cut holes in it, and stops them', async () => {
    const { user, backend } = await open()
    await on(user)
    expect(canvas().querySelector('mask')).toBeNull()
    await user.click(group('Cut by').getByRole('button', { name: 'Neck shape' }))
    expect(canvas().querySelector('mask')).not.toBeNull()
    expect(pathOf('skull').getAttribute('mask')).toMatch(/^url\(#.+\)$/)
    await save(user)
    expect(saved(backend, 'skull').cut).toEqual(['neck'])
    await user.click(group('Cut by').getByRole('button', { name: 'Neck shape' }))
    expect(canvas().querySelector('mask')).toBeNull()
    await user.click(group('Cut by').getByRole('button', { name: /Pick on the canvas/ }))
    pointer(pathOf('neck'), 'pointerdown', { x: 100, y: 100 })
    expect(group('Cut by').getByRole('button', { name: 'Neck shape' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('makes a helper shape: an outline on the canvas, never drawn in the previews', async () => {
    const { user, backend } = await open()
    await on(user)
    const tiles = () => document.querySelectorAll('svg.cmTile path').length
    const before = tiles()
    expect(before).toBeGreaterThan(0)
    await user.click(paint().getByRole('button', { name: 'Helper shape' }))
    expect(pathOf('skull')).toHaveClass('cmShape--helper')
    expect(tiles()).toBe(0)
    expect(tree().getByRole('img', { name: 'Skull shape is a helper shape' })).toBeInTheDocument()
    await save(user)
    expect(saved(backend, 'skull').helper).toBe(true)
    // nothing uses it yet: the Check panel says so
    expect(screen.getByText(/Skull shape is a helper shape, but nothing is clipped to it or cut by it/)).toBeInTheDocument()
  })
})

describe('shading shapes', () => {
  async function addBand(user: ReturnType<typeof userEvent.setup>, kind: string, side: string) {
    await user.click(paint().getByRole('group', { name: 'Kind of the new shading' }).querySelector(`button:nth-child(${['Shadow', 'Mid tone', 'Highlight'].indexOf(kind) + 1})`)!)
    await user.click(within(paint().getByRole('group', { name: 'Edge of the new shading' })).getByRole('button', { name: side }))
    await user.click(paint().getByRole('button', { name: new RegExp(`^Add a ${kind.toLowerCase()} band along the ${side.toLowerCase()} edge`) }))
  }

  it('adds a band along an edge, selects it, and keeps it inside the shapes of its object', async () => {
    const { user, backend } = await open()
    await on(user)
    await addBand(user, 'Highlight', 'Right')
    expect(tree().getByRole('button', { name: 'Highlight right' })).toBeInTheDocument()
    expect(tree().getByRole('img', { name: 'Highlight right is a shading shape' })).toBeInTheDocument()
    const id = [...canvas().querySelectorAll('path[data-shape]')].map(p => p.getAttribute('data-shape')!).find(x => !['skull', 'neck', 'white', 'iris', 'shirt'].includes(x))!
    expect(id).toBeTruthy()
    // painted inside a group that keeps it within the base shapes
    expect(pathOf(id).parentElement?.tagName.toLowerCase()).toBe('g')
    expect(pathOf(id).parentElement?.getAttribute('clip-path')).toMatch(/^url\(#.+\)$/)
    // it is a shading shape now: kind and amount instead of tone and gradient
    expect(paint().getByRole('heading', { name: 'Shading' })).toBeInTheDocument()
    expect(paint().queryByRole('group', { name: 'Tone' })).toBeNull()
    expect(group('Kind of shading').getByRole('button', { name: 'Highlight' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Raise Amount' }))
    await user.click(group('Kind of shading').getByRole('button', { name: 'Shadow' }))
    await save(user)
    expect(saved(backend, id).shade).toEqual({ kind: 'shadow', t: 0.11 })
    expect(saved(backend, id).pts.every(p => p.bind?.kind === 'edge' && p.bind.s === 'skull')).toBe(true)
  })

  it('counts the shading of an object and stops at ten', async () => {
    const { user } = await open()
    await on(user)
    expect(paint().getByText(/0 of 10/)).toBeInTheDocument()
    await addBand(user, 'Shadow', 'Left')
    await user.click(tree().getByRole('button', { name: 'Skull shape' }))
    expect(paint().getByText(/1 of 10/)).toBeInTheDocument()
  })
})

describe('shapes that follow another for their paint', () => {
  it('says where a twin\'s paint comes from instead of letting it be changed', async () => {
    const twinned = makeTwin(painted(), 'shape', 'neck')
    if (!twinned.ok) throw new Error(twinned.reason)
    const { user } = await open([draftEntry('a', twinned.content)])
    await on(user, 'Neck shape (twin)')
    expect(paint().getByText(/Neck shape \(twin\) is painted like Neck shape: change that original instead/)).toBeInTheDocument()
    expect(paint().queryByRole('group', { name: 'Tone' })).toBeNull()
  })
})

describe('forms that change paint', () => {
  it('gives a shape another colour slot and tone in a chosen form, only while that form is chosen', async () => {
    const { user, backend } = await open()
    await user.click(tree().getByRole('button', { name: 'Eye' }))
    await user.click(tab('Forms'))
    const dark = screen.getByRole('button', { name: /^Dark/ })
    await user.click(dark)
    const plainFill = fillOf('iris')
    await user.selectOptions(screen.getByLabelText('Colour slot of Iris in this form'), 'Hair')
    await user.selectOptions(screen.getByLabelText('Tone of Iris in this form'), 'Darker')
    expect(fillOf('iris')).not.toBe(plainFill)
    // the hair slot at its resting gray, a step darker
    expect(lightnessOf(fillOf('iris')!)).toBeCloseTo(slotById(painted(), 'k_hair')!.lRest - 12, 0)
    // another form is chosen: the iris is as it was
    await user.click(screen.getByRole('button', { name: /^Plain/ }))
    expect(fillOf('iris')).toBe(plainFill)
    await save(user)
    const form = backend.entries[0].draft.objects.find(o => o.id === 'oE')!.axes![0].options.find(f => f.id === 'dark')!
    expect(form.looks).toEqual([{ shape: 'iris', slot: 'k_hair', gray: null, tone: -1 }])
    // the shape's own paint is put back
    await user.click(screen.getByRole('button', { name: /^Dark/ }))
    await user.click(screen.getByRole('button', { name: 'Use the paint of Iris' }))
    expect(fillOf('iris')).toBe(plainFill)
  })
})
