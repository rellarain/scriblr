import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { standardGenres, standardSlots, starterPalette } from './engine/standardColours'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { pick } from '../../../../test/designerUi'

// Corner roundness and fill patterns (phase D4), in the Colour tab's Paint section, the Forms tab and the tree. The engine side is in engine/patterns.test.ts.
vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A shirt with a square base and two stripes (ordinary shapes), with an axis of two forms to round the base in.
function shirted(round = 0): ModelContent {
  let c: ModelContent = { ...blank('Adult'), genres: standardGenres(), palette: starterPalette(), slots: standardSlots() }
  c = addGroup(c, newGroup('gB', 'Body'))
  c = addObject(c, 'gB', { id: 'oS', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oS', { ...newShape('base', 'Base', 'square', box(60, 20, 80, 80)), slot: 'k_cloth', round })
  c = addShape(c, 'oS', { ...newShape('stripe1', 'Stripe 1', 'square', box(50, 30, 100, 10)), slot: 'k_cloth', tone: -1 })
  c = addShape(c, 'oS', { ...newShape('stripe2', 'Stripe 2', 'square', box(50, 60, 100, 10)), slot: 'k_cloth', tone: -1 })
  return { ...c, objects: c.objects.map(o => (o.id === 'oS' ? { ...o, axes: [{ id: 'aCut', name: 'Cut', initial: 'plain', options: [{ id: 'plain', name: 'Plain', ovr: [] }, { id: 'soft', name: 'Soft', ovr: [] }] }] } : o)) }
}

async function open(entries: ModelEntry[] = [draftEntry('a', shirted())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement | null
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const saved = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.shapes.find(s => s.id === id)!
const paint = () => within(screen.getByRole('region', { name: 'Paint of the selection' }))
const group = (name: string) => within(paint().getByRole('group', { name }))
const clipOf = (id: string) => pathOf(id)?.getAttribute('clip-path') ?? null

async function on(user: ReturnType<typeof userEvent.setup>, shape = 'Base') {
  await pick(user, shape)
  await user.click(tab('Colour'))
}

async function makePattern(user: ReturnType<typeof userEvent.setup>, marks = ['Stripe 1', 'Stripe 2'], name = 'Stripes') {
  for (const m of marks) await user.click(group('Marks of the new fill pattern').getByRole('button', { name: m }))
  if (name) await user.type(paint().getByRole('textbox', { name: 'Name of the new fill pattern' }), name)
  await user.click(paint().getByRole('button', { name: /^Make a fill pattern on Base/ }))
}

afterEach(() => { vi.restoreAllMocks() })

describe('corner roundness', () => {
  it('starts sharp, steps up by one or (with Shift) by five, draws the corners rounded, and saves the radius', async () => {
    const { user, backend } = await open()
    await on(user)
    const stepper = group('Corner roundness')
    expect(stepper.getByText('Sharp')).toBeInTheDocument()
    expect(stepper.getByRole('button', { name: 'Lower Corner roundness' })).toBeDisabled()
    expect(pathOf('base')!.getAttribute('d')).not.toMatch(/C/)
    await user.click(stepper.getByRole('button', { name: 'Raise Corner roundness' }))
    expect(stepper.getByText('1')).toBeInTheDocument()
    expect(pathOf('base')!.getAttribute('d')).toMatch(/C/)
    await user.keyboard('{Shift>}')
    await user.click(stepper.getByRole('button', { name: 'Raise Corner roundness' }))
    await user.keyboard('{/Shift}')
    expect(stepper.getByText('6')).toBeInTheDocument()
    await save(user)
    expect(saved(backend, 'base').round).toBe(6)
    expect(saved(backend, 'stripe1').round).toBe(0)
    // the points are as drawn: rounding changes what is drawn, not the outline
    expect(saved(backend, 'base').pts).toHaveLength(4)
  })

  it('stops at the most the model allows, and steps back down to sharp', async () => {
    const { user } = await open([draftEntry('a', shirted(20))])
    await on(user)
    const stepper = group('Corner roundness')
    expect(stepper.getByText('20')).toBeInTheDocument()
    expect(stepper.getByRole('button', { name: 'Raise Corner roundness' })).toBeDisabled()
    await user.click(stepper.getByRole('button', { name: 'Lower Corner roundness' }))
    expect(stepper.getByText('19')).toBeInTheDocument()
  })

  it('lets a form give a shape another radius, only while that form is chosen', async () => {
    const { user, backend } = await open()
    await pick(user, 'Shirt')
    await user.click(tab('Forms'))
    await user.click(screen.getByRole('button', { name: /^Soft/ }))
    expect(pathOf('base')!.getAttribute('d')).not.toMatch(/C/)
    await user.selectOptions(screen.getByLabelText('Corners of Base in this form'), 'Rounded')
    expect(pathOf('base')!.getAttribute('d')).toMatch(/C/)
    // the plain form is as it was
    await user.click(screen.getByRole('button', { name: /^Plain/ }))
    expect(pathOf('base')!.getAttribute('d')).not.toMatch(/C/)
    await save(user)
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oS')!.axes![0].options.find(f => f.id === 'soft')!.looks).toEqual([{ shape: 'base', slot: null, gray: null, tone: null, round: 8 }])
    // the shape's own radius is put back
    await user.click(screen.getByRole('button', { name: /^Soft/ }))
    await user.selectOptions(screen.getByLabelText('Corners of Base in this form'), 'Same as the shape')
    await save(user)
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oS')!.axes![0].options.find(f => f.id === 'soft')!.looks ?? []).toEqual([])
  })
})

describe('fill patterns', () => {
  it('says what to do before there is anything to choose, and keeps the button off until marks are chosen', async () => {
    const { user } = await open()
    await on(user)
    expect(paint().getByRole('heading', { name: 'Fill patterns' })).toBeInTheDocument()
    expect(paint().getByRole('button', { name: /^Make a fill pattern on Base/ })).toBeDisabled()
    await user.click(group('Marks of the new fill pattern').getByRole('button', { name: 'Stripe 1' }))
    expect(paint().getByRole('button', { name: /^Make a fill pattern on Base/ })).toBeEnabled()
    expect(within(group('Marks of the new fill pattern').getByRole('button', { name: 'Stripe 1' }).parentElement!).queryByRole('button', { name: 'Base' })).toBeNull()   // the base is no mark of itself
  })

  it('keeps the marks inside the base: they are clipped to it, and the base is not', async () => {
    const { user, backend } = await open()
    await on(user)
    expect(clipOf('stripe1')).toBeNull()
    await makePattern(user)
    expect(paint().getByRole('group', { name: 'Fill pattern Stripes' })).toBeInTheDocument()
    expect(clipOf('stripe1')).toMatch(/^url\(#.+\)$/)
    expect(clipOf('stripe2')).toMatch(/^url\(#.+\)$/)
    expect(clipOf('base')).toBeNull()
    await save(user)
    expect(backend.entries[0].draft.patterns).toEqual([expect.objectContaining({ name: 'Stripes', base: 'base', marks: ['stripe1', 'stripe2'] })])
    // the marks are over the base in the object
    expect(backend.entries[0].draft.objects.find(o => o.id === 'oS')!.shapes).toEqual(['base', 'stripe1', 'stripe2'])
  })

  it('is switched off and on with the eye, which takes every mark with it', async () => {
    const { user } = await open()
    await on(user)
    await makePattern(user)
    expect(pathOf('stripe1')).not.toBeNull()
    await user.click(paint().getByRole('button', { name: 'Switch off Stripes' }))
    expect(pathOf('stripe1')).toBeNull(); expect(pathOf('stripe2')).toBeNull(); expect(pathOf('base')).not.toBeNull()
    await user.click(paint().getByRole('button', { name: 'Switch on Stripes' }))
    expect(pathOf('stripe1')).not.toBeNull()
  })

  it('takes a mark out and puts it back, keeping at least one, and renames the pattern', async () => {
    const { user, backend } = await open()
    await on(user)
    await makePattern(user)
    const marks = () => within(paint().getByRole('group', { name: 'Fill pattern Stripes' })).getByRole('group', { name: 'Marks of Stripes' })
    await user.click(within(marks()).getByRole('button', { name: 'Stripe 2' }))
    expect(clipOf('stripe2')).toBeNull(); expect(clipOf('stripe1')).not.toBeNull()
    expect(within(marks()).getByRole('button', { name: 'Stripe 2' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(marks()).getByRole('button', { name: 'Stripe 1' })).toBeDisabled()                    // the last mark stays
    await user.click(within(marks()).getByRole('button', { name: 'Stripe 2' }))
    expect(clipOf('stripe2')).not.toBeNull()
    const name = paint().getByRole('textbox', { name: 'Name of the fill pattern Stripes' })
    await user.clear(name); await user.type(name, 'Bands')
    await save(user)
    expect(backend.entries[0].draft.patterns![0].name).toBe('Bands')
  })

  it('shows on a mark that it is one, in the panel and the tree, and the pattern is changed from its base', async () => {
    const { user } = await open()
    await on(user)
    await makePattern(user)
    await pick(user, 'Stripe 1')
    expect(paint().getByText(/Stripe 1 is a mark of the fill pattern Stripes: it is kept inside Base/)).toBeInTheDocument()
    expect(tree().getByRole('img', { name: 'Stripe 1 is a mark of the fill pattern Stripes' })).toBeInTheDocument()
    expect(paint().queryByRole('group', { name: 'Fill pattern Stripes' })).toBeNull()
    // a mark is not the base of another pattern: marks kept inside marks would clip to each other in a circle
    expect(paint().queryByRole('button', { name: /^Make a fill pattern on/ })).toBeNull()
    await pick(user, 'Stripe 2')
    await user.click(tab('Colour'))
    expect(paint().queryByRole('group', { name: 'Marks of the new fill pattern' })).toBeNull()
    // every other shape of the object is a mark already, so the base has nothing left to choose
    await pick(user, 'Base')
    expect(paint().queryByRole('group', { name: 'Marks of the new fill pattern' })).toBeNull()
  })

  it('deletes the pattern and leaves its marks as ordinary shapes', async () => {
    const { user, backend } = await open()
    await on(user)
    await makePattern(user)
    await user.click(paint().getByRole('button', { name: 'Delete the fill pattern Stripes' }))
    expect(paint().queryByRole('group', { name: 'Fill pattern Stripes' })).toBeNull()
    expect(pathOf('stripe1')).not.toBeNull(); expect(clipOf('stripe1')).toBeNull()
    await save(user)
    expect(backend.entries[0].draft.patterns).toEqual([])
    expect(backend.entries[0].draft.shapes.map(s => s.id)).toEqual(['base', 'stripe1', 'stripe2'])
  })
})

describe('the canvas outline', () => {
  const css = readFileSync(path.resolve(__dirname, 'characterModels.scss'), 'utf-8')
  const rule = (selector: string) => new RegExp(`^${selector.replace(/[.\-]/g, '\\$&')} \\{[^\\n]*\\}`, 'm').exec(css)?.[0] ?? ''

  it('draws a shape with no outline of its own, and the selection as a ring in the accent colour', async () => {
    expect(rule('.cmShape')).toMatch(/stroke: none/)
    expect(css).toMatch(/&--under \{ stroke: var\(--on-accent\)/)
    expect(css).toMatch(/&--over \{ stroke: var\(--accent\)/)
    expect(css).not.toMatch(/cmCanvas--bare/)
    const { user } = await open()
    expect(canvas().querySelectorAll('.cmRing')).toHaveLength(0)
    await pick(user, 'Base')
    expect(canvas().querySelectorAll('.cmRing')).toHaveLength(2)
    expect(canvas().querySelector('[data-ring="base"]')).not.toBeNull()
  })
})
