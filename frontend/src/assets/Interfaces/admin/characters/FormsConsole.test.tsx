import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, ModelPoint } from '../../../../api/types'
import { content, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { addRange, addTurn, newRange, type Edit } from './engine/rigEdit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'
import { openDrawer, pick } from '../../../../test/designerUi'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
const widen = (pts: ModelPoint[]): ModelPoint[] => pts.map(p => ({ ...p, x: 100 + (p.x - 100) * 1.4 }))

// A head with an eye (iris and pupil) and a skull, a body with a shirt, a slider that tilts the head. The eye has one axis of three forms: Standard (the base
// outline), Wide (a wider iris) and Shut (no pupil). Three presets: two outfits (the shirt off, the shirt on) and a pose (tilt the head).
function faced(over: (c: ModelContent) => ModelContent = c => c): ModelContent {
  let c = content('Adult')
  c = addGroup(c, newGroup('gH', 'Head')); c = addGroup(c, newGroup('gB', 'Body'))
  c = addObject(c, 'gH', { id: 'oE', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'oE', newShape('iris', 'Iris', 'oval', box(84, 50, 32, 16)))
  c = addShape(c, 'oE', newShape('pupil', 'Pupil', 'oval', box(94, 53, 12, 10)))
  c = addObject(c, 'gH', { id: 'oS', name: 'Skull', layer: 'body', shapes: [] })
  c = addShape(c, 'oS', newShape('skull', 'Skull shape', 'oval', box(76, 20, 48, 56)))
  c = addObject(c, 'gB', { id: 'oT', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oT', newShape('shirt', 'Shirt part', 'rounded', box(66, 86, 68, 70)))
  c = must(addRange(c, newRange('tilt', 'Tilt', 'turn', 'gH')))
  c = must(addTurn(c, 'tilt', 'gH'))
  const iris = c.shapes.find(s => s.id === 'iris')!
  c = {
    ...c,
    objects: c.objects.map(o => (o.id === 'oE' ? {
      ...o,
      axes: [{
        id: 'aShape', name: 'Eye shape', initial: 'std',
        options: [
          { id: 'std', name: 'Standard', ovr: [] },
          { id: 'wide', name: 'Wide', ovr: [{ shape: 'iris', pts: widen(iris.pts) }] },
          { id: 'shut', name: 'Shut', ovr: [{ shape: 'pupil', pts: [] }] },
        ],
      }],
    } : o)),
    presets: [
      { id: 'pBare', name: 'Bare', kind: 'Outfit', values: {}, hidden: ['oT'] },
      { id: 'pDressed', name: 'Dressed', kind: 'Outfit', values: {}, hidden: [] },
      { id: 'pTurned', name: 'Turned', kind: 'Pose', values: { tilt: 15 }, hidden: [] },
    ],
  }
  return over(c)
}

async function open(entries: ModelEntry[] = [draftEntry('a', faced())]) {
  const backend = modelsBackend(entries)
  const user = userEvent.setup()
  const view = render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  return { backend, user, view }
}

const tree = () => within(screen.getByRole('navigation', { name: 'Model tree' }))
const canvas = () => screen.getByRole('application')
const pathOf = (id: string) => canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement | null
const dOf = (id: string) => pathOf(id)?.getAttribute('d') ?? null
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const tab = (name: string) => screen.getByRole('tab', { name })
const axis = () => within(screen.getByRole('region', { name: 'Axis Eye shape' }))
const card = (name: RegExp | string) => axis().getByRole('button', { name })
// The eye of a card (hide and reveal): a group's is listed while nothing is open, an object's while its group is open, so the parent is opened first when the eye is not there.
async function eyeOf(user: ReturnType<typeof userEvent.setup>, name: string, parent?: string) {
  if (parent && !tree().queryByRole('button', { name: `Show ${name}` })) await pick(user, parent, 'group')
  return tree().getByRole('button', { name: `Show ${name}` })
}
const reset = () => screen.queryByRole('button', { name: 'Reset test values' })
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
const axisOf = (b: { entries: ModelEntry[] }) => draft(b).objects.find(o => o.id === 'oE')!.axes![0]

function pointer(el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: { x?: number; y?: number; button?: number } = {}) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: init.button ?? 0, clientX: init.x ?? 0, clientY: init.y ?? 0 }))
}
function pixelOf(worldX: number, worldY: number) {
  const [x, y, w, h] = canvas().getAttribute('viewBox')!.split(' ').map(Number)
  return { x: ((worldX - x) / w) * 704, y: ((worldY - y) / h) * 616 }
}
const dotAt = (n: number) => ({ x: Number(screen.getByRole('button', { name: `Point ${n}` }).getAttribute('cx')), y: Number(screen.getByRole('button', { name: `Point ${n}` }).getAttribute('cy')) })
async function dragPoint(user: ReturnType<typeof userEvent.setup>, n: number, dx: number) {
  await user.click(screen.getByRole('button', { name: 'Snap' }))             // off: the point lands exactly under the pointer
  await user.click(screen.getByRole('button', { name: 'Mirror editing' }))   // off: no twin point moves with it
  const from = dotAt(n), to = pixelOf(from.x + dx, from.y)
  pointer(screen.getByRole('button', { name: `Point ${n}` }), 'pointerdown', pixelOf(from.x, from.y))
  pointer(canvas(), 'pointermove', to)
  pointer(canvas(), 'pointerup', to)
}

afterEach(() => { vi.useRealTimers() })

describe('the eye in the tree', () => {
  it('switches an object off and on, only for looking', async () => {
    const { user } = await open()
    expect(pathOf('shirt')).not.toBeNull()
    expect(await eyeOf(user, 'Shirt', 'Body')).toHaveAttribute('aria-pressed', 'true')
    expect(reset()).toBeNull()
    await user.click(await eyeOf(user, 'Shirt', 'Body'))
    expect(await eyeOf(user, 'Shirt', 'Body')).toHaveAttribute('aria-pressed', 'false')
    expect(pathOf('shirt')).toBeNull()
    expect(pathOf('skull')).not.toBeNull()
    expect(reset()).toHaveTextContent('1 off rest')
    await user.click(await eyeOf(user, 'Shirt', 'Body'))
    expect(pathOf('shirt')).not.toBeNull()
    expect(reset()).toBeNull()
  })

  it('switches a group off with everything in it', async () => {
    const { user } = await open()
    await user.click(await eyeOf(user, 'Head'))
    expect(['iris', 'pupil', 'skull'].map(pathOf)).toEqual([null, null, null])
    expect(pathOf('shirt')).not.toBeNull()
    await user.click(reset()!)
    expect(['iris', 'pupil', 'skull'].every(id => pathOf(id))).toBe(true)
    expect(await eyeOf(user, 'Head')).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not save what is switched off, and a hidden shape cannot be edited', async () => {
    const { user, backend } = await open()
    await user.click(await eyeOf(user, 'Shirt', 'Body'))
    await pick(user, 'Shirt part')
    expect(screen.getByText(/switched off with the eye/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()       // switching things off is not a change to the model
    expect(backend.calls.some(c => c.startsWith('PUT'))).toBe(false)
  })
})

describe('the Forms tab', () => {
  async function onEye() {
    const r = await open()
    await pick(r.user, 'Eye')
    await r.user.click(tab('Forms'))
    return r
  }

  it('is the tab of an object, and of the shapes in it: not of the model or a group', async () => {
    const { user } = await open()
    expect(screen.queryByRole('tab', { name: 'Forms' })).toBeNull()
    await pick(user, 'Head', 'group')
    expect(screen.queryByRole('tab', { name: 'Forms' })).toBeNull()
    await pick(user, 'Eye', 'object')
    await user.click(tab('Forms'))
    expect(screen.getByRole('heading', { name: 'Forms of Eye' })).toBeInTheDocument()
  })

  it('lists the axis and its forms, the default marked, the shown one pressed', async () => {
    await onEye()
    expect(screen.getByRole('region', { name: 'Axis Eye shape' })).toBeInTheDocument()
    expect(card(/^Standard/)).toHaveTextContent('Standard · default')
    expect(card(/^Standard/)).toHaveAttribute('aria-pressed', 'true')
    expect(card(/^Wide/)).toHaveAttribute('aria-pressed', 'false')
    expect(card(/^Shut/)).toHaveAttribute('aria-pressed', 'false')
    expect(axis().getAllByRole('button').filter(b => b.querySelector('svg.cmFormThumb')).length).toBe(3)
  })

  it('draws the chosen form on the canvas and counts it as off rest, until reset', async () => {
    const { user } = await onEye()
    const base = dOf('iris')
    await user.click(card(/^Wide/))
    expect(card(/^Wide/)).toHaveAttribute('aria-pressed', 'true')
    expect(card(/^Standard/)).toHaveAttribute('aria-pressed', 'false')
    expect(dOf('iris')).not.toBe(base)
    expect(dOf('pupil')).not.toBeNull()
    expect(reset()).toHaveTextContent('1 off rest')
    await user.click(reset()!)
    expect(card(/^Standard/)).toHaveAttribute('aria-pressed', 'true')
    expect(dOf('iris')).toBe(base)
  })

  it('chooses a form with the keyboard', async () => {
    const { user } = await onEye()
    card(/^Shut/).focus()
    await user.keyboard('{Enter}')
    expect(card(/^Shut/)).toHaveAttribute('aria-pressed', 'true')
    expect(pathOf('pupil')).toBeNull()                                         // the form hides the pupil
    expect(pathOf('iris')).not.toBeNull()
  })

  it('lists what the chosen form does to each shape, and hides or restores one', async () => {
    const { user, backend } = await onEye()
    await user.click(card(/^Wide/))
    const list = screen.getByRole('list', { name: 'What Wide does to each shape' })
    expect(within(list).getByText('Iris').parentElement).toHaveTextContent('own outline')
    expect(within(list).getByText('Pupil').parentElement).toHaveTextContent('base outline')
    await user.click(screen.getByRole('button', { name: 'Hide Pupil in this form' }))
    expect(within(list).getByText('Pupil').parentElement).toHaveTextContent('hidden in this form')
    expect(pathOf('pupil')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Use the base outline for Pupil' }))
    expect(pathOf('pupil')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Use the base outline for Iris' }))
    expect(within(list).getByText('Iris').parentElement).toHaveTextContent('base outline')
    await save(user)
    await waitFor(() => expect(axisOf(backend).options[1].ovr).toEqual([]))
  })

  it('edits the chosen form, leaving the base outline alone', async () => {
    const { user, backend } = await onEye()
    const base = JSON.stringify(draft(backend).shapes.find(s => s.id === 'iris')!.pts)
    const wideX = axisOf(backend).options[1].ovr[0].pts[1].x
    await user.click(card(/^Wide/))
    await pick(user, 'Iris')
    expect(screen.getAllByText(/Editing (the )?form Wide of Eye shape/).length).toBeGreaterThan(0)
    await user.click(tab('Forms'))
    expect(screen.getByText(/Editing form Wide of Eye shape/)).toBeInTheDocument()
    await dragPoint(user, 2, 9)
    await save(user)
    await waitFor(() => expect(axisOf(backend).options[1].ovr[0].pts[1].x).toBeCloseTo(wideX + 9, 0))
    expect(JSON.stringify(draft(backend).shapes.find(s => s.id === 'iris')!.pts)).toBe(base)
    expect(axisOf(backend).options[0].ovr).toEqual([])
  })

  it('gives a shape the form does not change an outline of its own on its first edit there', async () => {
    const { user, backend } = await onEye()
    const base = JSON.stringify(draft(backend).shapes.find(s => s.id === 'pupil')!.pts)
    await user.click(card(/^Wide/))
    await pick(user, 'Pupil')
    await dragPoint(user, 2, 4)
    await save(user)
    await waitFor(() => expect(axisOf(backend).options[1].ovr.map(v => v.shape).sort()).toEqual(['iris', 'pupil']))
    expect(JSON.stringify(draft(backend).shapes.find(s => s.id === 'pupil')!.pts)).toBe(base)
  })

  it('edits the base outline when the default form is shown', async () => {
    const { user, backend } = await onEye()
    await pick(user, 'Iris')
    const before = JSON.stringify(draft(backend).shapes.find(s => s.id === 'iris')!.pts)
    await dragPoint(user, 2, 6)
    await save(user)
    await waitFor(() => expect(JSON.stringify(draft(backend).shapes.find(s => s.id === 'iris')!.pts)).not.toBe(before))
    expect(axisOf(backend).options.map(f => f.ovr.length)).toEqual([0, 1, 1])
  })

  it('says a shape is hidden in the form and does not edit it', async () => {
    const { user } = await onEye()
    await user.click(card(/^Shut/))
    await pick(user, 'Pupil')
    expect(screen.getByText(/Pupil is hidden in the form Shut/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Point 1' })).toBeNull()
  })

  it('adds a form that starts as a copy of what is drawn, and shows it', async () => {
    const { user, backend } = await onEye()
    await user.click(card(/^Wide/))
    await user.click(screen.getByRole('button', { name: 'Add a form from the current one' }))
    expect(card(/^Form 4/)).toHaveAttribute('aria-pressed', 'true')
    await save(user)
    await waitFor(() => expect(axisOf(backend).options).toHaveLength(4))
    expect(axisOf(backend).options[3].ovr.map(v => v.shape)).toEqual(['iris'])      // only what differs from the base
    expect(axisOf(backend).options[3].ovr[0].pts).toEqual(axisOf(backend).options[1].ovr[0].pts)
  })

  it('renames a form, makes it the default and moves it', async () => {
    const { user, backend } = await onEye()
    await user.click(card(/^Wide/))
    const name = screen.getByRole('textbox', { name: 'Name of form Wide' })
    await user.clear(name)
    await user.type(name, 'Broad')
    expect(card(/^Broad/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Make default' }))
    expect(card(/^Broad/)).toHaveTextContent('Broad · default')
    expect(screen.getByRole('button', { name: 'Make default' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move form Broad earlier' }))
    await save(user)
    await waitFor(() => expect(axisOf(backend).options.map(f => f.name)).toEqual(['Broad', 'Standard', 'Shut']))
    expect(axisOf(backend).initial).toBe('wide')
  })

  it('deletes a form after asking, and never the last one', async () => {
    const { user, backend } = await onEye()
    await user.click(card(/^Wide/))
    await user.click(axis().getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(card(/^Wide/)).toBeInTheDocument()
    await user.click(axis().getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete the form' }))
    expect(screen.queryByRole('button', { name: /^Wide/ })).toBeNull()
    await user.click(card(/^Shut/))
    await user.click(axis().getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete the form' }))
    expect(axis().getByRole('button', { name: 'Delete' })).toBeDisabled()      // one form left
    await save(user)
    await waitFor(() => expect(axisOf(backend).options.map(f => f.id)).toEqual(['std']))
  })

  it('adds an axis (shown at once) and deletes one after asking', async () => {
    const { user, backend } = await onEye()
    await user.click(screen.getByRole('button', { name: 'Add an axis' }))
    const second = within(screen.getByRole('region', { name: 'Axis Axis 2' }))
    expect(second.getByRole('button', { name: /^Standard/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(second.getByRole('button', { name: 'Delete axis Axis 2' }))
    await user.click(screen.getByRole('button', { name: 'Delete the axis' }))
    expect(screen.queryByRole('region', { name: 'Axis Axis 2' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add an axis' }))
    await save(user)
    await waitFor(() => expect(draft(backend).objects.find(o => o.id === 'oE')!.axes).toHaveLength(2))
    expect(draft(backend).objects.find(o => o.id === 'oE')!.axes![1].options).toHaveLength(1)
  })

  it('is undone with the rest', async () => {
    const { user, backend } = await onEye()
    await user.click(screen.getByRole('button', { name: 'Add an axis' }))
    expect(screen.getByRole('region', { name: 'Axis Axis 2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByRole('region', { name: 'Axis Axis 2' })).toBeNull()
    await save(user)
    await waitFor(() => expect(backend.calls.some(c => c.startsWith('PUT'))).toBe(true))
    expect(draft(backend).objects.find(o => o.id === 'oE')!.axes).toHaveLength(1)
  })

  it('tells a twin where its forms are', async () => {
    const { user } = await open([draftEntry('a', faced(c => ({ ...c, objects: [...c.objects, { id: 'oE2', name: 'Eye twin', layer: 'body', shapes: [], mirrorOf: 'oE' }], groups: c.groups.map(g => (g.id === 'gH' ? { ...g, objects: [...g.objects, 'oE2'] } : g)) })))])
    await pick(user, 'Eye twin')
    await user.click(tab('Forms'))
    expect(screen.getByText(/is the twin of Eye/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to Eye' }))
    expect(screen.getByRole('heading', { name: 'Forms of Eye' })).toBeInTheDocument()
  })
})

describe('the Presets tab', () => {
  async function onPresets() {
    const r = await open()
    await r.user.click(tab('Presets'))
    return r
  }
  const row = (name: string) => within(screen.getByRole('listitem', { name: `Preset ${name}` }))

  it('lists the presets with their kind, and filters by kind', async () => {
    const { user } = await onPresets()
    expect(screen.getAllByRole('listitem', { name: /^Preset / }).map(li => li.getAttribute('aria-label'))).toEqual(['Preset Bare', 'Preset Dressed', 'Preset Turned'])
    expect(screen.getByRole('listitem', { name: 'Preset Bare' })).toHaveTextContent('Outfit · 0 sliders, 1 hidden')
    expect(screen.getByRole('listitem', { name: 'Preset Turned' })).toHaveTextContent('Pose · 1 slider, 0 hidden')
    await user.click(screen.getByRole('button', { name: 'Pose' }))
    expect(screen.getAllByRole('listitem', { name: /^Preset / }).map(li => li.getAttribute('aria-label'))).toEqual(['Preset Turned'])
    await user.click(screen.getByRole('button', { name: /^All/ }))
    expect(screen.getAllByRole('listitem', { name: /^Preset / })).toHaveLength(3)
  })

  it('applies a preset, marks it on, and lets the next of its kind replace it', async () => {
    const { user } = await onPresets()
    expect(screen.queryByRole('img', { name: 'Bare is on' })).toBeNull()
    expect(screen.getByRole('img', { name: 'Dressed is on' })).toBeInTheDocument()       // nothing is hidden: the outfit with nothing hidden is on
    await user.click(screen.getByRole('button', { name: 'Apply Bare' }))
    expect(await eyeOf(user, 'Shirt', 'Body')).toHaveAttribute('aria-pressed', 'false')
    expect(pathOf('shirt')).toBeNull()
    expect(screen.getByRole('img', { name: 'Bare is on' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Dressed is on' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Apply Turned' }))
    expect(await eyeOf(user, 'Shirt', 'Body')).toHaveAttribute('aria-pressed', 'false')                          // a pose leaves the outfit alone
    expect(reset()).toHaveTextContent('2 off rest')
    await user.click(screen.getByRole('button', { name: 'Apply Dressed' }))
    expect(await eyeOf(user, 'Shirt', 'Body')).toHaveAttribute('aria-pressed', 'true')
    expect(pathOf('shirt')).not.toBeNull()
    expect(reset()).toHaveTextContent('1 off rest')
    expect(screen.getByRole('img', { name: 'Turned is on' })).toBeInTheDocument()
  })

  it('saves the current sliders and hidden things as a preset, with a name and a kind', async () => {
    const { user, backend } = await onPresets()
    await user.click(await eyeOf(user, 'Skull', 'Head'))
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'No skull')
    const kind = screen.getByRole('combobox', { name: 'Preset kind' })
    await user.clear(kind)
    await user.type(kind, 'Outfit')
    await user.click(screen.getByRole('button', { name: 'Save the current as a preset' }))
    expect(screen.getByRole('listitem', { name: 'Preset No skull' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'No skull is on' })).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(draft(backend).presets).toHaveLength(4))
    expect(draft(backend).presets!.at(-1)).toMatchObject({ name: 'No skull', kind: 'Outfit', values: {}, hidden: ['oS'] })
  })

  it('updates a preset from the current look, renames it and deletes it after asking', async () => {
    const { user, backend } = await onPresets()
    await user.click(await eyeOf(user, 'Shirt', 'Body'))
    await user.click(screen.getByRole('button', { name: 'Update Dressed from the current' }))
    const name = screen.getByRole('textbox', { name: 'Name of preset Dressed' })
    await user.clear(name)
    await user.type(name, 'Cold')
    await user.click(screen.getByRole('button', { name: 'Delete preset Bare' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.getByRole('listitem', { name: 'Preset Bare' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete preset Bare' }))
    await user.click(screen.getByRole('button', { name: 'Delete the preset' }))
    expect(screen.queryByRole('listitem', { name: 'Preset Bare' })).toBeNull()
    await save(user)
    await waitFor(() => expect(draft(backend).presets!.map(p => p.name)).toEqual(['Cold', 'Turned']))
    expect(draft(backend).presets![0].hidden).toEqual(['oT'])
    expect(row('Cold')).toBeTruthy()
  })

  it('does not keep the chosen forms', async () => {
    const { user, backend } = await open()
    await pick(user, 'Eye')
    await user.click(tab('Forms'))
    await user.click(card(/^Wide/))
    await user.click(tab('Presets'))
    await user.type(screen.getByRole('textbox', { name: 'Preset name' }), 'Look')
    await user.click(screen.getByRole('button', { name: 'Save the current as a preset' }))
    await save(user)
    await waitFor(() => expect(draft(backend).presets).toHaveLength(4))
    expect(JSON.stringify(draft(backend).presets!.at(-1))).not.toContain('wide')
    await user.click(screen.getByRole('button', { name: 'Apply Bare' }))
    await user.click(tab('Forms'))
    expect(card(/^Wide/)).toHaveAttribute('aria-pressed', 'true')                         // applying a preset leaves the forms alone
  })
})

describe('the checks about forms', () => {
  it('lists each form by view, and notes a form with another number of points', async () => {
    const { user } = await open([draftEntry('a', faced(c => ({
      ...c,
      objects: c.objects.map(o => (o.id === 'oE' ? { ...o, axes: o.axes!.map(a => ({ ...a, options: a.options.map(f => (f.id === 'wide' ? { ...f, ovr: [{ shape: 'iris', pts: c.shapes.find(s => s.id === 'iris')!.pts.slice(0, 3) }] } : f)) })) } : o)),
    })))])
    await openDrawer(user)
    const grid = within(screen.getByRole('table', { name: 'Forms by views' }))
    const rows = grid.getAllByRole('row').slice(1).map(r => r.textContent)
    expect(rows).toEqual(['EyeEye shapeStandard (default)base outlinebase outline', 'EyeEye shapeWide1 own outlinederived from the front', 'EyeEye shapeShut1 shape hiddenderived from the front'])
    expect(screen.getByText(/Wide \(Eye shape of Eye\) changes Iris with 3 points where the base has 4/)).toBeInTheDocument()
  })

  it('shows no grid for a model without forms', async () => {
    const { user } = await open([draftEntry('a', content('Plain'))])
    await openDrawer(user)
    expect(screen.queryByRole('table', { name: 'Forms by views' })).toBeNull()
  })
})
