import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContent, ModelEntry, ModelFieldset } from '../../../../api/types'
import { content as blank, draftEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { pick } from '../../../../test/designerUi'
import DesignerConsole from './DesignerConsole'
import { newShape } from './engine/edit'
import { addGroup, addObject, addShape, newGroup } from './modelContent'

vi.setConfig({ testTimeout: 30000 })

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

// A Head group with a Nose object of one wide plate and a Hair object, and a variant Elder.
function headed(withField = false): ModelContent {
  let c: ModelContent = blank('Adult')
  c = addGroup(c, newGroup('gHead', 'Head'))
  c = addObject(c, 'gHead', { id: 'oNose', name: 'Nose', layer: 'body', shapes: [] })
  c = addShape(c, 'oNose', newShape('plate', 'Plate', 'square', box(60, 20, 80, 40)))
  c = addObject(c, 'gHead', { id: 'oHair', name: 'Hair', layer: 'hair', shapes: [] })
  c = addShape(c, 'oHair', newShape('fringe', 'Fringe', 'square', box(60, 0, 80, 20)))
  // a variant that sets a slider (so it is off until it is applied)
  c = { ...c, presets: [{ id: 'pElder', name: 'Elder', kind: 'Age', values: { rAge: 50 }, hidden: [] }], ranges: [{ id: 'rAge', name: 'Age', scope: null, min: 0, rest: 0, max: 100, unit: '', show: true, rand: null, drives: [] }] }
  if (withField) {
    const set: ModelFieldset = { id: 'fsPlate', name: 'Plate sizes', ownerKind: 'object', owner: 'oNose', feature: 'shape', target: 'plate', i: 0, ranges: ['rWide'] }
    c = {
      ...c, fieldsets: [set],
      ranges: [...c.ranges, { id: 'rWide', name: 'Wide', scope: 'oNose', min: 50, rest: 100, max: 150, unit: '%', show: true, rand: null, drives: [{ kind: 'prop', group: null, target: null, id: null, axis: 'xy', shape: 'plate', moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 50, atMax: 150, mirror: true, feature: 'shape', prop: 'width', i: 0 }] }],
    }
  }
  return c
}

async function open(c: ModelContent = headed(), selectName = 'Plate') {
  const backend = modelsBackend([draftEntry('a', c)])
  const user = userEvent.setup()
  render(<DesignerConsole />)
  await screen.findByRole('region', { name: 'Designer' })
  if (selectName) await pick(user, selectName, 'shape')
  await user.click(screen.getByRole('tab', { name: 'Fields' }))
  return { backend, user }
}

const canvas = () => screen.getByRole('application')
const dOf = (id: string) => (canvas().querySelector(`path[data-shape="${id}"]`) as SVGPathElement).getAttribute('d')
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Save' }))
const draft = (b: { entries: ModelEntry[] }) => b.entries[0].draft
// the slider of the field, not the one the variant sets
const fieldRange = (b: { entries: ModelEntry[] }) => draft(b).ranges.find(r => r.drives.some(d => d.kind === 'prop'))!

afterEach(() => { vi.restoreAllMocks() })

describe('the Fields tab', () => {
  it('offers what the selection can hold fields for: the shape, the point and the edge picked, and the object', async () => {
    await open()
    const make = screen.getByRole('region', { name: 'Make a fieldset' })
    for (const name of ['This shape', 'Point 1', 'Edge 1', 'This object']) expect(within(make).getByRole('button', { name })).toBeInTheDocument()
    expect(within(make).getByRole('combobox', { name: 'Who is offered the fields' })).toHaveDisplayValue('This object: Nose')
  })

  it('has nothing to make fields for until something is selected, and says so', async () => {
    await open(headed(), '')
    expect(screen.getByText(/Select a shape, or open an object/)).toBeInTheDocument()
    expect(screen.getByText('No fieldset yet.')).toBeInTheDocument()
  })

  it('makes a fieldset for the shape and a field in it that changes its width, and the sliders draw it', async () => {
    const { user, backend } = await open()
    await user.click(screen.getByRole('button', { name: 'Add a fieldset for Shape Plate' }))
    const set = screen.getByRole('region', { name: 'Fieldset Shape Plate' })
    expect(within(set).getByText('No field yet.')).toBeInTheDocument()
    await user.selectOptions(within(set).getByRole('combobox', { name: 'Property to add to Shape Plate' }), 'width')
    await user.click(within(set).getByRole('button', { name: 'Add a field to Shape Plate' }))
    const field = within(set).getByRole('group', { name: 'Field Width' })
    expect(within(field).getByRole('combobox', { name: 'Property that Width changes' })).toHaveDisplayValue('Width')
    const before = dOf('plate')
    fireEvent.change(within(field).getByRole('slider', { name: 'Try Width' }), { target: { value: '150' } })
    expect(dOf('plate')).not.toBe(before)
    fireEvent.change(within(field).getByRole('slider', { name: 'Try Width' }), { target: { value: '100' } })
    expect(dOf('plate')).toBe(before)
    await save(user)
    const out = draft(backend)
    expect(out.fieldsets).toHaveLength(1)
    expect(out.fieldsets![0]).toMatchObject({ ownerKind: 'object', owner: 'oNose', feature: 'shape', target: 'plate', name: 'Shape Plate' })
    expect(fieldRange(backend).drives[0]).toMatchObject({ kind: 'prop', feature: 'shape', shape: 'plate', prop: 'width', atMin: 50, atMax: 150 })
    expect(out.fieldsets![0].ranges).toEqual([fieldRange(backend).id])
  })

  it('makes a fieldset for the point or the edge that is picked, and for the whole object', async () => {
    const { user, backend } = await open()
    const make = () => within(screen.getByRole('region', { name: 'Make a fieldset' }))
    await user.click(make().getByRole('button', { name: 'Point 1' }))
    await user.click(screen.getByRole('button', { name: 'Add a fieldset for Point 1 of Plate' }))
    await user.click(make().getByRole('button', { name: 'Edge 1' }))
    await user.click(screen.getByRole('button', { name: 'Add a fieldset for Edge 1 of Plate' }))
    await user.click(make().getByRole('button', { name: 'This object' }))
    await user.click(screen.getByRole('button', { name: 'Add a fieldset for Object Nose' }))
    await save(user)
    expect(draft(backend).fieldsets!.map(f => [f.feature, f.target, f.i])).toEqual([['point', 'plate', 0], ['edge', 'plate', 0], ['object', 'oNose', 0]])
    // an edge has one property, a point two, an object the rest
    const edge = screen.getByRole('region', { name: 'Fieldset Edge 1 of Plate' })
    expect(within(within(edge).getByRole('combobox', { name: 'Property to add to Edge 1 of Plate' })).getAllByRole('option').map(o => o.textContent)).toEqual(['Choose a property', 'Push the edge'])
    const point = screen.getByRole('region', { name: 'Fieldset Point 1 of Plate' })
    expect(within(within(point).getByRole('combobox', { name: 'Property to add to Point 1 of Plate' })).getAllByRole('option').map(o => o.textContent)).toEqual(['Choose a property', 'Position across', 'Position up and down'])
  })

  it('offers the fields to the group, or to a variant, and says a variant\'s are offered while it is on', async () => {
    const { user, backend } = await open()
    const make = screen.getByRole('region', { name: 'Make a fieldset' })
    expect(within(make).getAllByRole('option').map(o => o.textContent)).toEqual(['This object: Nose', 'Its group: Head', 'Variant: Elder'])
    await user.selectOptions(within(make).getByRole('combobox', { name: 'Who is offered the fields' }), 'preset:pElder')
    await user.click(screen.getByRole('button', { name: 'Add a fieldset for Shape Plate' }))
    const set = screen.getByRole('region', { name: 'Fieldset Shape Plate' })
    expect(within(set).getByText(/Offered to variant/)).toBeInTheDocument()
    expect(within(set).getByRole('status')).toHaveTextContent('Offered while Elder is on.')
    // applying the variant turns it on, and its fields are offered
    await user.click(screen.getByRole('tab', { name: 'Presets' }))
    await user.click(screen.getByRole('button', { name: 'Apply Elder' }))
    await user.click(screen.getByRole('tab', { name: 'Fields' }))
    expect(within(screen.getByRole('region', { name: 'Fieldset Shape Plate' })).getByRole('status')).toHaveTextContent('Offered now: Elder is on.')
    await save(user)
    expect(draft(backend).fieldsets![0]).toMatchObject({ ownerKind: 'preset', owner: 'pElder' })
  })

  it('names a fieldset where it is, and keeps the name', async () => {
    const { user, backend } = await open(headed(true))
    const name = screen.getByRole('textbox', { name: 'Name of fieldset Plate sizes' })
    await user.clear(name)
    await user.type(name, 'Plate')
    await save(user)
    expect(draft(backend).fieldsets![0].name).toBe('Plate')
  })

  it('changes the property of a field and the amounts a slider reaches', async () => {
    const { user, backend } = await open(headed(true))
    const set = screen.getByRole('region', { name: 'Fieldset Plate sizes' })
    await user.selectOptions(within(set).getByRole('combobox', { name: 'Property that Wide changes' }), 'rotation')
    let field = within(screen.getByRole('region', { name: 'Fieldset Plate sizes' })).getByRole('group', { name: 'Field Wide' })
    expect(within(field).getByRole('slider', { name: 'Try Wide' })).toHaveAttribute('min', '-30')       // the slider takes the property's span
    await user.click(within(field).getByRole('button', { name: 'Raise Amount at the maximum of Wide' }))
    field = within(screen.getByRole('region', { name: 'Fieldset Plate sizes' })).getByRole('group', { name: 'Field Wide' })
    expect(within(field).getByRole('group', { name: 'Amount at the maximum of Wide' })).toHaveTextContent('31°')
    await save(user)
    expect(fieldRange(backend).drives[0]).toMatchObject({ prop: 'rotation', atMin: -30, atMax: 31 })
  })

  it('shows the field in the Ranges tab and offers it to writers, or not', async () => {
    const { user, backend } = await open(headed(true))
    await user.click(screen.getByRole('button', { name: 'Hide Wide from writers' }))
    await user.click(screen.getByRole('button', { name: 'Show Wide in the Ranges tab' }))
    expect(screen.getByRole('tab', { name: 'Ranges' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Sets width of Plate to 50% at the minimum and 150% at the maximum')).toBeInTheDocument()
    await save(user)
    expect(fieldRange(backend).show).toBe(false)
  })

  it('deletes a field with its slider, and a fieldset with its sliders', async () => {
    const { user, backend } = await open(headed(true))
    await user.click(screen.getByRole('button', { name: 'Delete field Wide' }))
    expect(screen.getByText('No field yet.')).toBeInTheDocument()
    await save(user)
    expect(draft(backend).ranges.map(r => r.id)).toEqual(['rAge']); expect(draft(backend).fieldsets![0].ranges).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Delete fieldset Plate sizes' }))
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    expect(screen.queryByRole('region', { name: 'Fieldset Plate sizes' })).toBeNull()
    await save(user)
    expect(draft(backend).fieldsets).toEqual([])
  })

  it('lists the fieldsets of the selection, and all of them when asked', async () => {
    const { user } = await open(headed(true), 'Fringe')
    expect(screen.getByText(/No fieldset has to do with the selection/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^All \(1\)/ }))
    expect(screen.getByRole('region', { name: 'Fieldset Plate sizes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select Shape Plate on the canvas' }))
    await user.click(screen.getByRole('tab', { name: 'Shape' }))
    expect(screen.getByRole('textbox', { name: 'Shape name' })).toHaveValue('Plate')
  })

  it('refuses a feature that cannot hold fields, with the reason', async () => {
    const c = headed()
    const twinned: ModelContent = { ...c, shapes: [...c.shapes, { ...c.shapes[0], id: 'plate2', name: 'Plate twin', pts: [], mirrorOf: 'plate' }], objects: c.objects.map(o => (o.id === 'oNose' ? { ...o, shapes: [...o.shapes, 'plate2'] } : o)) }
    const { user } = await open(twinned, 'Plate twin')
    await user.click(screen.getByRole('button', { name: 'Add a fieldset for Shape Plate twin' }))
    expect(await screen.findByText(/A twin follows its original: give the fields to the original/)).toBeInTheDocument()
  })
})
