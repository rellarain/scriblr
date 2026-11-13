import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { STARTER_BIOMES } from '../../writer/maps/mapBiomes'
import { mapsBackend } from '../../../../test/mapsBackend'
import MapBiomesConsole from './MapBiomesConsole'
import { addBiome, biomeFaults, biomeIdOf, editBiome, hasChanges, levelsShown, moveBiome, toggleLevel } from './mapBiomesModel'

// The list draws every starter biome with its level chips: slow in a full parallel run.
vi.setConfig({ testTimeout: 30000 })

describe('the biome list, pure', () => {
  it('adds a biome with an id of its own, moves one, and edits one', () => {
    const list = addBiome(STARTER_BIOMES)
    expect(list.at(-1)).toMatchObject({ id: 'new_biome', name: 'New biome', group: 'land', levels: [], retired: false })
    expect(biomeIdOf('New biome', ['new_biome'])).toBe('new_biome_2')
    expect(biomeIdOf('???', [])).toBe('biome')
    expect(moveBiome(STARTER_BIOMES, 'freshwater', -1).slice(0, 2).map(b => b.id)).toEqual(['freshwater', 'saltwater'])
    expect(moveBiome(STARTER_BIOMES, 'saltwater', -1)).toBe(STARTER_BIOMES)
    expect(editBiome(STARTER_BIOMES, 'forest', { name: 'x'.repeat(60) }).find(b => b.id === 'forest')!.name).toHaveLength(40)
  })

  it('starts a biome\'s own levels from its group\'s, and a level can be turned off', () => {
    const forest = STARTER_BIOMES.find(b => b.id === 'forest')!
    expect(levelsShown(forest)).toEqual(['planetary', 'continental', 'national', 'regional', 'local'])
    expect(toggleLevel(forest, 'planetary')).toEqual(['continental', 'national', 'regional', 'local'])
    expect(toggleLevel({ ...forest, levels: ['local'] }, 'interior')).toEqual(['local', 'interior'])
  })

  it('says what stops the list being published, in the server\'s words', () => {
    expect(biomeFaults(STARTER_BIOMES)).toEqual([])
    const bad = editBiome(editBiome(STARTER_BIOMES, 'desert', { name: '' }), 'swamp', { name: 'forest' })
    expect(biomeFaults(bad)).toEqual(['Biome 3 needs a name.', 'Two biomes are called forest.'])
  })

  it('knows whether the list differs from what is published, leaving the retired ones out', () => {
    expect(hasChanges(STARTER_BIOMES, [...STARTER_BIOMES, { ...STARTER_BIOMES[0], id: 'gone', retired: true }])).toBe(false)
    expect(hasChanges(addBiome(STARTER_BIOMES), STARTER_BIOMES)).toBe(true)
  })
})

describe('Configuration > Maps', () => {
  async function open() {
    const backend = mapsBackend()
    render(<MapBiomesConsole />)
    await screen.findByRole('heading', { name: 'Biomes' })
    return backend
  }
  const list = () => within(screen.getByRole('list', { name: 'Biomes' }))

  it('lists the published biomes, with nothing to publish yet', async () => {
    await open()
    expect(list().getAllByRole('listitem')).toHaveLength(STARTER_BIOMES.length)
    expect(screen.getByText(/Published v1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish v2' })).toBeDisabled()
    expect(list().getByRole('group', { name: 'Levels Forest is offered on' })).toBeInTheDocument()
  })

  it('adds a biome, names and colours it, offers it on a level, saves the draft and publishes it', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(screen.getByRole('button', { name: 'Add a biome' }))
    const name = list().getByRole('textbox', { name: 'Name of New biome' })
    await user.clear(name)
    await user.type(name, 'Salt flats')
    await user.tab()
    fireEvent.change(list().getByLabelText('Colour of Salt flats'), { target: { value: '#efe6d2' } })
    fireEvent.blur(list().getByLabelText('Colour of Salt flats'))
    await user.click(within(list().getByRole('group', { name: 'Levels Salt flats is offered on' })).getByRole('button', { name: 'Planetary' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(backend.biomes.catalog.draft.at(-1)).toMatchObject({ name: 'Salt flats', color: '#efe6d2', levels: ['continental', 'national', 'regional', 'local'] }))
    await user.click(screen.getByRole('button', { name: 'Publish v2' }))
    await waitFor(() => expect(backend.biomes.catalog.published!.version).toBe(2))
    expect(backend.biomes.catalog.published!.biomes.some(b => b.name === 'Salt flats')).toBe(true)
    expect(await screen.findByText(/Published v2/)).toBeInTheDocument()
  })

  it('will not publish two biomes of one name, and says why', async () => {
    const user = userEvent.setup()
    await open()
    const name = list().getByRole('textbox', { name: 'Name of Swamp' })
    await user.clear(name)
    await user.type(name, 'Forest')
    await user.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Two biomes are called Forest.')
    expect(screen.getByRole('button', { name: 'Publish v2' })).toBeDisabled()
  })

  it('removes a biome after asking, and keeps it published as retired', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(list().getByRole('button', { name: 'Remove Taiga' }))
    await user.click(list().getByRole('button', { name: 'Confirm remove' }))
    expect(list().queryByRole('textbox', { name: 'Name of Taiga' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish v2' }))
    await waitFor(() => expect(backend.biomes.catalog.published!.version).toBe(2))
    expect(backend.biomes.catalog.published!.biomes.find(b => b.id === 'taiga')!.retired).toBe(true)
    expect(await screen.findByText(/Retired \(kept for the maps that use them\): Taiga/)).toBeInTheDocument()
  })

  it('puts the list back as it is published, and brings an earlier version back', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(list().getByRole('button', { name: 'Move Freshwater up' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(list().getAllByRole('textbox')[0]).toHaveValue('Saltwater'))
    await user.click(list().getByRole('button', { name: 'Remove Taiga' }))
    await user.click(list().getByRole('button', { name: 'Confirm remove' }))
    await user.click(screen.getByRole('button', { name: 'Publish v2' }))
    await waitFor(() => expect(backend.biomes.catalog.published!.version).toBe(2))
    await user.selectOptions(screen.getByRole('combobox', { name: 'A published version to bring back' }), '1')
    await user.click(screen.getByRole('button', { name: 'Bring this version into the list' }))
    expect(await list().findByRole('textbox', { name: 'Name of Taiga' })).toBeInTheDocument()
  })
})
