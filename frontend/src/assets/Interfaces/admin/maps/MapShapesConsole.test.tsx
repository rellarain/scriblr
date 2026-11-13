import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MapLibraryShape, MyMapShape } from '../../../../api/types'
import { mapsBackend } from '../../../../test/mapsBackend'
import { starterShapes } from '../../writer/maps/mapShapeSeed'
import MapsConfigConsole from './MapsConfigConsole'
import { addFromMine, editShape, hasChanges, moveShape, removeShape, shapeFaults, shapeIdOf, toggleLevel } from './mapShapesModel'

// The list draws every starter shape: slow in a full parallel run.
vi.setConfig({ testTimeout: 30000 })

const SEED = starterShapes()
const hill = (over: Partial<MyMapShape> = {}): MyMapShape => ({
  ...SEED.find(s => s.id === 'land:plateau')!, id: 'my_1', name: 'Round hill', projectId: 'p1', projectTitle: 'The Salt Road', savedAt: 'x', ...over,
})

describe('the default shapes, pure', () => {
  it('gives a shape an id of its kind and name, unique in the list', () => {
    expect(shapeIdOf('land', 'Round hill', [])).toBe('land:round_hill')
    expect(shapeIdOf('land', 'Round hill', ['land:round_hill'])).toBe('land:round_hill_2')
    expect(shapeIdOf('marker', '!!!', [])).toBe('marker:shape')
  })

  it('adds a shape of My shapes as a library shape, a name its kind has already getting a number', () => {
    const list = addFromMine(SEED, hill())
    const added = list.at(-1)!
    expect(added).toMatchObject({ id: 'land:round_hill', name: 'Round hill', category: 'land', type: 'biome' })
    expect(added).not.toHaveProperty('projectId')
    expect(added).not.toHaveProperty('savedAt')
    const again = addFromMine(SEED, hill({ name: 'Island' })).at(-1)!
    expect(again).toMatchObject({ id: 'land:island_2', name: 'Island 2' })
  })

  it('moves a shape among the shapes of its kind only, and edits and removes one', () => {
    const lands = SEED.filter(s => s.category === 'land').map(s => s.id)
    const moved = moveShape(SEED, lands[1], -1)
    expect(moved.filter(s => s.category === 'land').map(s => s.id).slice(0, 2)).toEqual([lands[1], lands[0]])
    expect(moveShape(SEED, lands[0], -1)).toBe(SEED)
    // The last land form does not move down into the space objects.
    expect(moveShape(SEED, lands.at(-1)!, 1)).toBe(SEED)
    expect(editShape(SEED, 'land:island', { name: 'x'.repeat(90) }).find(s => s.id === 'land:island')!.name).toHaveLength(60)
    expect(removeShape(SEED, 'land:island').some(s => s.id === 'land:island')).toBe(false)
  })

  it('offers a shape that names no level on every level, and turning one off starts from all of them', () => {
    const every = { levels: [] as MapLibraryShape['levels'] }
    const off = toggleLevel(every, 'galactic')
    expect(off).toHaveLength(8)
    expect(off).not.toContain('galactic')
    expect(toggleLevel({ levels: off }, 'galactic')).toEqual([])
    expect(toggleLevel({ levels: ['local'] }, 'regional')).toEqual(['regional', 'local'])
  })

  it('says what stops the list being published, in the server words, and knows when it has changes', () => {
    expect(shapeFaults(SEED)).toEqual([])
    expect(shapeFaults(editShape(SEED, 'land:lake', { name: 'island' }))).toEqual(['Two shapes of one category are called island.'])
    // The same name in two kinds is fine.
    expect(shapeFaults(editShape(SEED, 'marker:mountain', { name: 'Island' }))).toEqual([])
    expect(hasChanges(SEED, SEED)).toBe(false)
    expect(hasChanges(removeShape(SEED, 'land:lake'), SEED)).toBe(true)
  })
})

describe('Configuration > Maps > Shapes', () => {
  async function open(mine: MyMapShape[] = []) {
    const backend = mapsBackend()
    for (const s of mine) backend.shapes.myRoute('POST', [], { shape: s, projectId: s.projectId, projectTitle: s.projectTitle })
    window.localStorage.setItem('scriblr.config.maps.tab', JSON.stringify('shapes'))
    render(<MapsConfigConsole />)
    await screen.findByRole('heading', { name: 'Shapes' })
    return backend
  }
  const list = () => within(screen.getByRole('list', { name: 'Shapes' }))

  it('has a tab for the biomes and one for the shapes, moved between with the arrow keys', async () => {
    const user = userEvent.setup()
    mapsBackend()
    render(<MapsConfigConsole />)
    expect(await screen.findByRole('heading', { name: 'Biomes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Biomes' })).toHaveAttribute('aria-selected', 'true')
    screen.getByRole('tab', { name: 'Biomes' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('heading', { name: 'Shapes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Shapes' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'mbx-tab-shapes')
  })

  it('lists the published shapes by kind, with nothing to publish yet', async () => {
    const user = userEvent.setup()
    await open()
    expect(list().getAllByRole('listitem')).toHaveLength(SEED.length)
    expect(screen.getByText(/Published v1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish v2' })).toBeDisabled()
    const kinds = within(screen.getByRole('group', { name: 'Kinds of shape' }))
    await user.click(kinds.getByRole('button', { name: /^Space objects/ }))
    expect(list().getAllByRole('listitem')).toHaveLength(SEED.filter(s => s.category === 'space').length)
    expect(within(list().getByRole('group', { name: 'Levels Star is offered on' })).getByRole('button', { name: 'Galactic' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(list().getByRole('group', { name: 'Levels Star is offered on' })).getByRole('button', { name: 'Local' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/My shapes is empty/)).toBeInTheDocument()
  })

  it('adds a shape from My shapes, names it, offers it on fewer levels, saves the draft and publishes it', async () => {
    const user = userEvent.setup()
    const backend = await open([hill()])
    const adding = within(screen.getByRole('group', { name: 'Add from My shapes' }))
    expect(within(adding.getByRole('combobox', { name: 'A shape of My shapes to add' })).getByRole('group', { name: 'The Salt Road' })).toBeInTheDocument()
    await user.selectOptions(adding.getByRole('combobox', { name: 'A shape of My shapes to add' }), 'Round hill')
    await user.click(adding.getByRole('button', { name: 'Add it to the shapes' }))
    const name = await list().findByRole('textbox', { name: 'Name of Round hill' })
    await user.clear(name)
    await user.type(name, 'Tor')
    await user.tab()
    await user.click(within(list().getByRole('group', { name: 'Levels Tor is offered on' })).getByRole('button', { name: 'Planetary' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(backend.shapes.catalog.draft.at(-1)).toMatchObject({ id: 'land:round_hill', name: 'Tor', category: 'land' }))
    expect(backend.shapes.catalog.draft.at(-1)!.levels).not.toContain('planetary')
    await user.click(screen.getByRole('button', { name: 'Publish v2' }))
    await waitFor(() => expect(backend.shapes.catalog.published!.version).toBe(2))
    expect(backend.shapes.catalog.published!.shapes.some(s => s.name === 'Tor')).toBe(true)
    expect(await screen.findByText(/Published v2/)).toBeInTheDocument()
  })

  it('will not publish two shapes of one name in a kind, and says why', async () => {
    const user = userEvent.setup()
    await open()
    const name = list().getByRole('textbox', { name: 'Name of Lake' })
    await user.clear(name)
    await user.type(name, 'Island')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Two shapes of one category are called Island.')
    expect(screen.getByRole('button', { name: 'Publish v2' })).toBeDisabled()
  })

  it('moves a shape to another kind, removes one after asking, and brings an earlier version back', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.selectOptions(list().getByRole('combobox', { name: 'Kind of Ridge' }), 'marker')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(backend.shapes.catalog.draft.find(s => s.id === 'land:ridge')!.category).toBe('marker'))
    await user.click(list().getByRole('button', { name: 'Remove Lake' }))
    await user.click(list().getByRole('button', { name: 'Confirm remove' }))
    expect(list().queryByRole('textbox', { name: 'Name of Lake' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish v2' }))
    await waitFor(() => expect(backend.shapes.catalog.published!.version).toBe(2))
    expect(backend.shapes.catalog.published!.shapes.some(s => s.id === 'land:lake')).toBe(false)
    await user.selectOptions(screen.getByRole('combobox', { name: 'A published version of the shapes to bring back' }), '1')
    await user.click(screen.getByRole('button', { name: 'Bring this version into the list' }))
    expect(await list().findByRole('textbox', { name: 'Name of Lake' })).toBeInTheDocument()
  })
})
