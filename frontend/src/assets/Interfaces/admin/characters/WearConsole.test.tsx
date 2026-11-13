import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { makeTwin } from './engine/pairEdit'
import { standardGenres, standardSlots, starterPalette } from './engine/standardColours'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { openDrawer, pick } from '../../../../test/designerUi'

// What a garment is worn under (phase 6b): the Rig tab's "Worn under" list, the trimming it gives on the canvas, and the Check line for two garments worn under each other.
vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A shirt and a jacket (clothing) and a torso (body), the jacket in a group of its own.
function worn(under: Record<string, string[]> = {}): ModelContent {
  let c: ModelContent = { ...blank('Adult'), genres: standardGenres(), palette: starterPalette(), slots: standardSlots() }
  c = addGroup(c, newGroup('gT', 'Torso')); c = addGroup(c, newGroup('gJ', 'Outerwear'))
  c = addObject(c, 'gT', { id: 'oBody', name: 'Body', layer: 'body', shapes: [] })
  c = addShape(c, 'oBody', { ...newShape('torso', 'Torso shape', 'rounded', box(60, 20, 80, 100)), slot: 'k_skin' })
  c = addObject(c, 'gT', { id: 'oSh', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oSh', { ...newShape('shirt', 'Shirt shape', 'square', box(50, 20, 100, 80)), slot: 'k_cloth' })
  c = addObject(c, 'gJ', { id: 'oJa', name: 'Jacket', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oJa', { ...newShape('jacket', 'Jacket shape', 'square', box(60, 10, 80, 100)), slot: 'k_cloth' })
  return { ...c, objects: c.objects.map(o => (under[o.id] ? { ...o, under: under[o.id] } : o)) }
}

async function open(entries: ModelEntry[] = [draftEntry('a', worn())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user }
}

const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement | null
const tab = (name: string) => screen.getByRole('tab', { name })
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const section = () => within(screen.getByRole('region', { name: 'Worn under' }))
const saved = (b: { entries: ModelEntry[] }, id: string) => b.entries[0].draft.objects.find(o => o.id === id)!

async function on(user: ReturnType<typeof userEvent.setup>, name = 'Shirt') {
  await pick(user, name, 'object')
  await user.click(tab('Rig'))
}

afterEach(() => { vi.restoreAllMocks() })

describe('the Worn under list', () => {
  it('offers the other clothing, and not the body or the object itself', async () => {
    const { user } = await open()
    await on(user)
    const chips = section().getByRole('group', { name: 'What Shirt is worn under' })
    expect(within(chips).getAllByRole('button').map(b => b.textContent)).toEqual(['Jacket'])
    expect(within(chips).getByRole('button', { name: 'Jacket' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('puts the shirt under the jacket: its shapes are drawn inside a group clipped to the jacket, and Save keeps it', async () => {
    const { user, backend } = await open()
    await on(user)
    expect(pathOf('shirt')!.parentElement?.getAttribute('clip-path') ?? '').not.toMatch(/-w-/)
    await user.click(section().getByRole('button', { name: 'Jacket' }))
    expect(section().getByRole('button', { name: 'Jacket' })).toHaveAttribute('aria-pressed', 'true')
    const wrapper = pathOf('shirt')!.parentElement!
    expect(wrapper.tagName.toLowerCase()).toBe('g')
    expect(wrapper.getAttribute('clip-path')).toMatch(/^url\(#.+-w-oSh\)$/)
    expect(canvas().querySelector('clipPath')).not.toBeNull()
    expect(pathOf('jacket')!.parentElement?.getAttribute('clip-path') ?? '').not.toMatch(/-w-/)
    await save(user)
    expect(saved(backend, 'oSh').under).toEqual(['oJa'])
    // taking it off draws the shirt whole again
    await user.click(section().getByRole('button', { name: 'Jacket' }))
    expect(pathOf('shirt')!.parentElement?.getAttribute('clip-path') ?? '').not.toMatch(/-w-/)
  })

  it('refuses to put the jacket under a shirt that is worn under it, and says why', async () => {
    const { user } = await open([draftEntry('a', worn({ oSh: ['oJa'] }))])
    await on(user, 'Jacket')
    await user.click(section().getByRole('button', { name: 'Shirt' }))
    expect(screen.getByText(/Jacket cannot be worn under Shirt: that is worn under Jacket already/)).toBeInTheDocument()
    expect(section().getByRole('button', { name: 'Shirt' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('says a twin is worn under what its original is, on its own side', async () => {
    const twinned = makeTwin(worn({ oSh: ['oJa'] }), 'object', 'oSh')
    if (!twinned.ok) throw new Error(twinned.reason)
    const { user } = await open([draftEntry('a', twinned.content)])
    await on(user, 'Shirt (twin)')
    expect(section().getByText(/Shirt \(twin\) is a twin: it is worn under what Shirt is worn under \(Jacket\)/)).toBeInTheDocument()
    expect(section().queryByRole('group', { name: /is worn under$/ })).toBeNull()
  })

  it('says in the Checks when two garments are worn under each other', async () => {
    const { user } = await open([draftEntry('a', worn({ oSh: ['oJa'], oJa: ['oSh'] }))])
    await openDrawer(user)
    expect(screen.getByText('Shirt is worn under something that is worn under it: they trim each other.')).toBeInTheDocument()
  })

  it('says what a model that is worn under something that is gone cannot do: it is refused at Publish', async () => {
    const { user } = await open([draftEntry('a', worn({ oSh: ['oGone'] }))])
    await openDrawer(user)
    expect(screen.getByText('Object Shirt is worn under something that does not exist.')).toBeInTheDocument()
  })
})

// How far a garment drapes (phase O6): the Rig tab's Drape stepper, saved with the model.
describe('the Drape stepper', () => {
  const drape = () => within(screen.getByRole('region', { name: 'Drape' }))
  it('steps the drape of the selected object by tenths, Shift by quarters, and saves it', async () => {
    const { backend, user } = await open()
    await on(user, 'Jacket')
    expect(drape().getByText('0%')).toBeInTheDocument()
    expect(drape().getByRole('button', { name: 'Lower Drape' })).toBeDisabled()
    // none of its points carries a weight yet
    expect(drape().getByText(/mark the hem with the Weights tool/)).toBeInTheDocument()
    await user.click(drape().getByRole('button', { name: 'Raise Drape' }))
    expect(drape().getByText('10%')).toBeInTheDocument()
    await user.keyboard('{Shift>}')
    await user.click(drape().getByRole('button', { name: 'Raise Drape' }))
    await user.keyboard('{/Shift}')
    expect(drape().getByText('35%')).toBeInTheDocument()
    await save(user)
    expect(saved(backend, 'oJa').drape).toBe(35)
  })
  it('says a twin drapes as its original does', async () => {
    let c = worn()
    c = { ...c, objects: c.objects.map(o => (o.id === 'oJa' ? { ...o, drape: 60 } : o)) }
    const e = makeTwin(c, 'object', 'oJa', p => `${p}_t1`)
    if (!e.ok) throw new Error(e.reason)
    const { user } = await open([draftEntry('a', e.content)])
    const twin = e.content.objects.find(o => o.mirrorOf === 'oJa')!
    await on(user, twin.name)
    expect(drape().getByText(/drapes as its original does \(60%\)/)).toBeInTheDocument()
    expect(drape().queryByRole('button', { name: 'Raise Drape' })).toBeNull()
  })
})
