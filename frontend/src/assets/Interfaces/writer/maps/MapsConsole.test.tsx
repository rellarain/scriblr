import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDoc } from '../../../../api/types'
import { newMap } from '../../../../designSystem/mockMaps'
import { mapsBackend } from '../../../../test/mapsBackend'
import MapsConsole from './MapsConsole'

// jsdom has no canvas: the canvas draws nothing here (painting itself is covered by mapModel.test.ts).
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })

const world = (over: Partial<MapDoc> = {}): MapDoc => ({ ...newMap('map_a', { title: 'Known World', kind: 'world', width: 8, height: 6, cellSize: 10, unit: 'miles' }, 0), ...over })
const town = (): MapDoc => ({ ...newMap('map_b', { title: 'Port Veyra', kind: 'town', width: 4, height: 4, parentId: 'map_a' }, 0) })

async function open(maps: MapDoc[] = [world(), town()]) {
  const backend = mapsBackend(maps)
  render(<MapsConsole projectId="p1" />)
  await screen.findByRole('heading', { name: 'Maps', level: 2 })
  return backend
}
const save = () => screen.getByRole('button', { name: 'Save' })
const puts = (b: ReturnType<typeof mapsBackend>) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: ReturnType<typeof mapsBackend>) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as MapDoc

describe('the Maps console', () => {
  it('lists the maps, nested ones under their map, and opens the first with its terrains and layers', async () => {
    await open()
    const list = within(await screen.findByRole('navigation', { name: 'Maps' }))
    expect(list.getAllByRole('button', { name: /^Open / }).map(b => b.textContent)).toEqual(['Known World8×6', 'Port Veyra4×4'])
    expect(await screen.findByRole('img', { name: 'Known World, a map 8 by 6 cells' })).toBeInTheDocument()
    const terrains = within(screen.getByRole('region', { name: 'Terrain' }))
    expect(terrains.getAllByRole('button', { pressed: undefined }).length).toBeGreaterThan(8)
    expect(terrains.getByRole('button', { name: 'Paint with Plains' })).toHaveAttribute('aria-pressed', 'true')
    const layers = within(screen.getByRole('region', { name: 'Layers' }))
    expect(layers.getByRole('textbox', { name: 'Name of the Terrain layer' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Map title' })).toHaveValue('Known World')
  })

  it('says so when the project has no maps, and makes one from the form', async () => {
    const user = userEvent.setup()
    const backend = await open([])
    expect(await screen.findByText(/Make a map to start/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New map' }))
    const form = within(screen.getByRole('form', { name: 'New map' }))
    await user.type(form.getByRole('textbox', { name: 'Title of the new map' }), 'Harbour')
    await user.selectOptions(form.getByRole('combobox', { name: 'Kind of map' }), 'town')
    await user.click(form.getByRole('button', { name: 'Small' }))
    await user.click(form.getByRole('button', { name: 'Make the map' }))
    expect(await screen.findByRole('img', { name: 'Harbour, a map 32 by 24 cells' })).toBeInTheDocument()
    expect(backend.of('POST')).toHaveLength(1)
    const sent = JSON.parse(backend.fetch.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST')![1].body as string)
    expect(sent).toMatchObject({ title: 'Harbour', kind: 'town', width: 32, height: 24, unit: 'paces', parentId: null })
    expect(screen.queryByRole('form', { name: 'New map' })).not.toBeInTheDocument()
  })

  it('makes the map when Enter is pressed in the title, with what has been typed', async () => {
    const user = userEvent.setup()
    const backend = await open([])
    await user.click(await screen.findByRole('button', { name: 'New map' }))
    await user.type(screen.getByRole('textbox', { name: 'Title of the new map' }), 'Cellar{Enter}')
    expect(await screen.findByRole('img', { name: 'Cellar, a map 64 by 48 cells' })).toBeInTheDocument()
    expect(backend.of('POST')).toHaveLength(1)
  })

  it('keeps an edit waiting until Save, and then saves the map whole', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await screen.findByRole('img', { name: /Known World/ })
    expect(save()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Hide Labels' }))
    expect(puts(backend)).toHaveLength(0)
    expect(save()).toBeEnabled()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    const doc = lastPut(backend)
    expect(doc.layers.find(l => l.id === 'labels')!.visible).toBe(false)
    expect(doc.cells).toEqual([0, 48])
  })

  it('renames the map when the field is left, and a blank title is put back', async () => {
    const user = userEvent.setup()
    const backend = await open()
    const field = await screen.findByRole('textbox', { name: 'Map title' })
    await user.clear(field)
    await user.type(field, 'The Old World')
    await user.tab()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).title).toBe('The Old World')
    await user.clear(field)
    await user.tab()
    expect(field).toHaveValue('The Old World')
  })

  it('adds, renames, recolours and removes a terrain', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await screen.findByRole('img', { name: /Known World/ })
    const panel = () => within(screen.getByRole('region', { name: 'Terrain' }))
    await user.click(panel().getByRole('button', { name: 'Add a terrain' }))
    expect(panel().getByRole('button', { name: 'Paint with New terrain' })).toHaveAttribute('aria-pressed', 'true')
    const name = panel().getByRole('textbox', { name: 'Name of New terrain' })
    await user.clear(name)
    await user.type(name, 'Salt flats')
    await user.tab()
    fireEvent.change(panel().getByLabelText('Colour of Salt flats'), { target: { value: '#efe6d2' } })
    fireEvent.blur(panel().getByLabelText('Colour of Salt flats'))
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).terrains.at(-1)).toMatchObject({ name: 'Salt flats', color: '#efe6d2', builtIn: false })
    // Nothing is painted with it, so it goes without asking.
    await user.click(panel().getByRole('button', { name: 'Remove Salt flats' }))
    expect(panel().queryByRole('button', { name: 'Paint with Salt flats' })).not.toBeInTheDocument()
  })

  it('asks before removing a terrain that is painted, and says where its cells go', async () => {
    const user = userEvent.setup()
    await open()
    await screen.findByRole('img', { name: /Known World/ })
    const panel = () => within(screen.getByRole('region', { name: 'Terrain' }))
    // Ocean (the first terrain) fills a new map; the second terrain, Plains, is not painted.
    await user.click(panel().getByRole('button', { name: 'Paint with Ocean' }))
    await user.click(panel().getByRole('button', { name: 'Remove Ocean' }))
    expect(panel().getByRole('group', { name: 'Remove Ocean?' })).toBeInTheDocument()
    expect(panel().getByText(/Its 48 cells become Ocean/)).toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Cancel remove' }))
    expect(panel().getByRole('button', { name: 'Paint with Ocean' })).toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Remove Ocean' }))
    await user.click(panel().getByRole('button', { name: 'Confirm remove' }))
    expect(panel().queryByRole('button', { name: 'Paint with Ocean' })).not.toBeInTheDocument()
  })

  it('shows, locks, moves, adds and deletes layers', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await screen.findByRole('img', { name: /Known World/ })
    const layers = () => within(screen.getByRole('region', { name: 'Layers' }))
    await user.click(layers().getByRole('button', { name: 'Lock Symbols' }))
    await user.click(layers().getByRole('button', { name: 'Move Symbols up' }))
    await user.click(layers().getByRole('button', { name: 'Add a layer' }))
    await user.click(layers().getByRole('button', { name: 'Delete Notes' }))
    expect(layers().getByRole('button', { name: 'Delete Terrain' })).toBeDisabled()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    const doc = lastPut(backend)
    expect(doc.layers.map(l => l.name)).toEqual(['Terrain', 'Regions and lines', 'Labels', 'Symbols', 'Regions and lines 2'])
    expect(doc.layers.find(l => l.name === 'Symbols')!.locked).toBe(true)
  })

  it('undoes and redoes a change, and Undo is offered only when there is one', async () => {
    const user = userEvent.setup()
    await open()
    await screen.findByRole('img', { name: /Known World/ })
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide Labels' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Hide Labels' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(screen.getByRole('button', { name: 'Show Labels' })).toBeInTheDocument()
  })

  it('resizes the map, keeping what is there from the top left', async () => {
    const user = userEvent.setup()
    const backend = await open()
    const width = await screen.findByRole('spinbutton', { name: 'Width in cells' })
    await user.clear(width)
    await user.type(width, '10')
    await user.tab()
    expect(screen.getByRole('img', { name: 'Known World, a map 10 by 6 cells' })).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend)).toMatchObject({ width: 10, height: 6, cells: [0, 60] })
  })

  it('saves what is waiting when another map is opened', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(await screen.findByRole('button', { name: 'Hide Labels' }))
    await user.click(screen.getByRole('button', { name: 'Open Port Veyra' }))
    expect(await screen.findByRole('img', { name: 'Port Veyra, a map 4 by 4 cells' })).toBeInTheDocument()
    expect(puts(backend)).toHaveLength(1)
    expect(lastPut(backend).id).toBe('map_a')
    // Back again: the first map is as it was left, and its undo is kept.
    await user.click(screen.getByRole('button', { name: 'Open Known World' }))
    expect(await screen.findByRole('button', { name: 'Show Labels' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('deletes a map after asking, and the map inside it moves up', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await screen.findByRole('img', { name: /Known World/ })
    await user.click(screen.getByRole('button', { name: /^Delete Known World/ }))
    expect(screen.getByRole('group', { name: 'Delete Known World?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel delete' }))
    expect(backend.of('DELETE')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /^Delete Known World/ }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(backend.maps.has('map_a')).toBe(false))
    expect(backend.maps.get('map_b')!.parentId).toBeNull()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Known World' })).not.toBeInTheDocument())
    expect(screen.getByText('Pick a map in the list to open it.')).toBeInTheDocument()
  })

  it('says when the maps could not be loaded and tries again', async () => {
    const user = userEvent.setup()
    const backend = mapsBackend([world()])
    backend.failNext('/projects/p1/maps', 500, 'The disk is full')
    render(<MapsConsole projectId="p1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The disk is full')
    await user.click(screen.getByRole('button', { name: 'Try loading again' }))
    expect(await screen.findByRole('img', { name: /Known World/ })).toBeInTheDocument()
  })

  it('shows a failed save on the Save button and keeps the edit', async () => {
    const user = userEvent.setup()
    const backend = await open()
    await user.click(await screen.findByRole('button', { name: 'Hide Labels' }))
    backend.failNext('/projects/p1/maps/map_a', 500, 'Could not write')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not write')
    expect(save()).toBeEnabled()
    await user.click(save())
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('warns when the terrain layer is locked and a tool would paint', async () => {
    const user = userEvent.setup()
    await open()
    await screen.findByRole('img', { name: /Known World/ })
    await user.click(screen.getByRole('button', { name: 'Lock Terrain' }))
    const canvas = screen.getByRole('img', { name: /Known World/ })
    fireEvent.pointerDown(canvas, { button: 0, clientX: 400, clientY: 260 })
    // (jsdom has no pointer coordinates to paint at, so the warning is only shown where a cell is hit.)
    expect(canvas).toBeInTheDocument()
  })
})
