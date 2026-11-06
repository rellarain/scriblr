import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapDoc, MapSymbol } from '../../../../api/types'
import { newMap } from '../../../../designSystem/mockMaps'
import { mapsBackend } from '../../../../test/mapsBackend'
import { mapFileName } from './mapFile'
import MapsConsole, { type ScenePlace } from './MapsConsole'

const saved = vi.hoisted(() => vi.fn())
vi.mock('./mapExport', async importOriginal => ({ ...(await importOriginal<typeof import('./mapExport')>()), saveBlob: saved }))

// jsdom has no canvas: the canvas draws nothing here.
beforeEach(() => { saved.mockClear(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })

const symbol = (over: Partial<MapSymbol> = {}): MapSymbol => ({ id: 'sym_1', kind: 'castle', x: 3.5, y: 2.5, size: 2, color: null, layerId: 'symbols', name: '', mapIds: [], ...over })
const world = (over: Partial<MapDoc> = {}): MapDoc => ({ ...newMap('map_a', { title: 'Known World', kind: 'world', width: 8, height: 6, cellSize: 10, unit: 'miles' }, 0), ...over })
const town = (): MapDoc => newMap('map_b', { title: 'Port Veyra', kind: 'town', width: 4, height: 4, parentId: 'map_a' }, 0)

async function open(maps: MapDoc[], scenes: ScenePlace[] = [], onSetLocation = vi.fn()) {
  const backend = mapsBackend(maps)
  render(<MapsConsole projectId="p1" scenes={scenes} onSetLocation={onSetLocation} />)
  await screen.findByRole('heading', { name: 'Maps', level: 2 })
  return { backend, onSetLocation, user: userEvent.setup() }
}
type Backend = ReturnType<typeof mapsBackend>
const save = () => screen.getByRole('button', { name: 'Save' })
const puts = (b: Backend) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: Backend) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as MapDoc

// jsdom has no layout: the 8 x 6 map is fitted at 64 px a cell from (144, 68).
const at = (x: number, y: number, init: MouseEventInit = {}) => ({ clientX: 144 + 64 * x, clientY: 68 + 64 * y, button: 0, ...init })
const pointer = (el: Element, type: 'pointerdown' | 'pointermove' | 'pointerup', init: MouseEventInit) => fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))
// Choose the symbol at a cell with the Select tool.
async function choose(user: ReturnType<typeof userEvent.setup>, canvas: Element, x = 3.5, y = 2.5) {
  await user.click(screen.getByRole('button', { name: 'Select and move' }))
  pointer(canvas, 'pointerdown', at(x, y))
}
const chosen = () => within(screen.getByRole('region', { name: 'Chosen symbol' }))

describe('places on a map', () => {
  it('turns a symbol into a place when it is given a name, and saves the name', async () => {
    const { backend, user } = await open([world({ symbols: [symbol()] })])
    const canvas = await screen.findByRole('img', { name: /Known World/ })
    await choose(user, canvas)
    expect(chosen().getByText(/Give it a name to make it a place/)).toBeInTheDocument()
    await user.type(chosen().getByRole('textbox', { name: 'Name of the place' }), 'Castle Dran')
    await user.tab()
    expect(await screen.findByRole('group', { name: 'Maps from this place' })).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).symbols[0]).toMatchObject({ name: 'Castle Dran', mapIds: [] })
  })

  it('makes a map for a place inside the open map, keeps the open map open, and links it', async () => {
    const { backend, user } = await open([world({ symbols: [symbol({ name: 'Castle Dran' })] })])
    const canvas = await screen.findByRole('img', { name: /Known World/ })
    await choose(user, canvas)
    await user.click(chosen().getByRole('button', { name: 'Make a map for this place' }))
    await waitFor(() => expect(backend.of('POST')).toHaveLength(1))
    const sent = JSON.parse(backend.fetch.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST')![1].body as string)
    expect(sent).toMatchObject({ title: 'Castle Dran', parentId: 'map_a' })
    expect(await screen.findByRole('img', { name: /Known World/ })).toBeInTheDocument()
    expect(await chosen().findByRole('button', { name: 'Open Castle Dran' })).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).symbols[0].mapIds).toHaveLength(1)
  })

  it('links a map that exists, opens it from the place, and stops opening it', async () => {
    const { backend, user } = await open([world({ symbols: [symbol({ name: 'Port' })] }), { ...town(), parentId: null }])
    const canvas = await screen.findByRole('img', { name: /Known World/ })
    await choose(user, canvas)
    await user.selectOptions(chosen().getByRole('combobox', { name: 'Another map to open from here' }), 'map_b')
    await user.click(chosen().getByRole('button', { name: 'Link the map' }))
    expect(chosen().getByRole('button', { name: 'Open Port Veyra' })).toBeInTheDocument()
    await user.click(chosen().getByRole('button', { name: 'Stop opening Port Veyra from here' }))
    expect(chosen().queryByRole('button', { name: 'Open Port Veyra' })).not.toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).symbols[0].mapIds).toEqual([])
  })

  it('opens the first linked map on a double-click on the place, and shows where it is', async () => {
    const { user } = await open([world({ symbols: [symbol({ name: 'Port', mapIds: ['map_b'] })] }), town()])
    const canvas = await screen.findByRole('img', { name: /Known World/ })
    await user.click(screen.getByRole('button', { name: 'Select and move' }))
    expect(screen.queryByRole('navigation', { name: 'Where this map is' })).not.toBeInTheDocument()
    fireEvent.doubleClick(canvas, at(3.5, 2.5))
    expect(await screen.findByRole('img', { name: /Port Veyra/ })).toBeInTheDocument()
    const path = within(screen.getByRole('navigation', { name: 'Where this map is' }))
    expect(path.getByRole('button', { name: 'Known World' })).toBeInTheDocument()
    expect(path.getByText('Port Veyra')).toHaveAttribute('aria-current', 'page')
    await user.click(path.getByRole('button', { name: 'Up to Known World' }))
    expect(await screen.findByRole('img', { name: /Known World/ })).toBeInTheDocument()
  })

  it('lists the scenes that happen at a place', async () => {
    const { user } = await open([world({ symbols: [symbol({ name: 'Port' })] })], [
      { id: 's1', title: 'Arrival', location: 'map_a/sym_1' }, { id: 's2', title: 'Elsewhere', location: 'map_a/other' },
    ])
    await choose(user, await screen.findByRole('img', { name: /Known World/ }))
    expect(chosen().getByText('Arrival')).toBeInTheDocument()
    expect(chosen().queryByText('Elsewhere')).not.toBeInTheDocument()
  })
})

describe('the map panel', () => {
  it('moves a map inside another, but not inside itself or a map within it', async () => {
    const { backend, user } = await open([world(), town()])
    await screen.findByRole('img', { name: /Known World/ })
    const inside = screen.getByRole('combobox', { name: 'Inside which map' })
    expect([...within(inside).getAllByRole('option')].map(o => o.textContent)).toEqual(['No map (a top-level map)'])
    await user.click(within(screen.getByRole('navigation', { name: 'Maps' })).getByRole('button', { name: 'Open Port Veyra' }))
    const below = await screen.findByRole('combobox', { name: 'Inside which map' })
    await user.selectOptions(below, '')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend)).toMatchObject({ id: 'map_b', parentId: null })
  })

  it('sets how far a traveller goes in a day, which the measure tool uses', async () => {
    const { backend, user } = await open([world()])
    const canvas = await screen.findByRole('img', { name: /Known World/ })
    const pace = screen.getByRole('spinbutton', { name: 'How far a traveller goes in a day' })
    await user.clear(pace)
    await user.type(pace, '20')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Measure a distance' }))
    pointer(canvas, 'pointerdown', at(1, 1))
    pointer(canvas, 'pointerdown', at(5, 1))
    expect(await screen.findByText(/40 miles/)).toBeInTheDocument()
    expect(screen.getByText(/2 days/)).toBeInTheDocument()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend).pace).toBe(20)
  })
})

describe('the measure tool', () => {
  it('adds up a path, takes a point back with Backspace and clears with Escape', async () => {
    const { user } = await open([world()])
    const canvas = await screen.findByRole('img', { name: /Known World/ })
    await user.click(screen.getByRole('button', { name: 'Measure a distance' }))
    expect(screen.getByText(/click to start measuring/)).toBeInTheDocument()
    pointer(canvas, 'pointerdown', at(1, 1))
    pointer(canvas, 'pointerdown', at(4, 1))
    expect(await screen.findByText(/30 miles/)).toBeInTheDocument()
    pointer(canvas, 'pointerdown', at(4, 3))
    expect(await screen.findByText(/50 miles/)).toBeInTheDocument()
    fireEvent.keyDown(canvas, { key: 'Backspace' })
    expect(await screen.findByText(/30 miles/)).toBeInTheDocument()
    fireEvent.keyDown(canvas, { key: 'Escape' })
    expect(await screen.findByText(/click to start measuring/)).toBeInTheDocument()
    expect(screen.queryByText(/miles · click to add/)).not.toBeInTheDocument()
  })
})

describe('the old locations', () => {
  const scenes: ScenePlace[] = [
    { id: 's1', title: 'One', location: 'The Inn' }, { id: 's2', title: 'Two', location: 'The Inn' },
    { id: 's3', title: 'Three', location: 'The Quay' }, { id: 's4', title: 'Four', location: 'map_a/sym_1' }, { id: 's5', title: 'Five', location: '' },
  ]

  it('is not shown when no scene has old text', async () => {
    await open([world()], [{ id: 's4', title: 'Four', location: 'map_a/sym_1' }])
    await screen.findByRole('img', { name: /Known World/ })
    expect(screen.queryByRole('region', { name: 'Old locations' })).not.toBeInTheDocument()
  })

  it('makes places of the checked texts on the open map and points their scenes at them', async () => {
    const { backend, onSetLocation, user } = await open([world()], scenes)
    await screen.findByRole('img', { name: /Known World/ })
    const panel = within(screen.getByRole('region', { name: 'Old locations' }))
    expect(panel.getByText('The Inn')).toBeInTheDocument()
    expect(panel.getByText('2 scenes')).toBeInTheDocument()
    expect(panel.getByText('1 scene')).toBeInTheDocument()
    await user.click(panel.getByRole('checkbox', { name: /The Quay/ }))
    await user.click(panel.getByRole('button', { name: 'Make places of the checked texts' }))
    await waitFor(() => expect(onSetLocation).toHaveBeenCalledTimes(2))
    expect(onSetLocation.mock.calls.map(c => c[0]).sort()).toEqual(['s1', 's2'])
    expect(onSetLocation.mock.calls[0][1]).toMatch(/^map_a\/./)
    expect(puts(backend)).toHaveLength(1)
    expect(lastPut(backend).symbols.map(s => s.name)).toEqual(['The Inn'])
  })

  it('drops the texts that are left, after a confirmation, and leaves places alone', async () => {
    const { onSetLocation, user } = await open([world()], scenes)
    await screen.findByRole('img', { name: /Known World/ })
    const panel = within(screen.getByRole('region', { name: 'Old locations' }))
    await user.click(panel.getByRole('button', { name: 'Drop the old texts' }))
    expect(onSetLocation).not.toHaveBeenCalled()
    await user.click(panel.getByRole('button', { name: 'Cancel drop' }))
    expect(onSetLocation).not.toHaveBeenCalled()
    await user.click(panel.getByRole('button', { name: 'Drop the old texts' }))
    await user.click(panel.getByRole('button', { name: 'Confirm drop' }))
    expect(onSetLocation.mock.calls.map(c => c[0]).sort()).toEqual(['s1', 's2', 's3'])
    expect(onSetLocation.mock.calls.every(c => c[1] === '')).toBe(true)
  })
})

describe('the image', () => {
  it('has a size and the layers to leave out, and says so when the image cannot be made', async () => {
    const { user } = await open([world()])
    await screen.findByRole('img', { name: /Known World/ })
    const panel = within(screen.getByRole('region', { name: 'Export' }))
    expect(panel.getByText(/132 × 100 pixels/)).toBeInTheDocument()
    await user.click(panel.getByRole('button', { name: '2×' }))
    expect(panel.getByText(/260 × 196 pixels/)).toBeInTheDocument()
    await user.click(panel.getByRole('checkbox', { name: 'Labels' }))
    await user.click(panel.getByRole('button', { name: 'Save the map as an image' }))
    expect(await panel.findByRole('alert')).toHaveTextContent('could not be made')
  })
})

describe('map files', () => {
  it('exports a map and the maps inside it as a file', async () => {
    const { user } = await open([world({ symbols: [symbol({ name: 'Port', mapIds: ['map_b'] })] }), town()])
    await screen.findByRole('img', { name: /Known World/ })
    await user.click(within(screen.getByRole('navigation', { name: 'Maps' })).getByRole('button', { name: 'Export Known World to a file' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    const [blob, name] = saved.mock.calls[0] as [Blob, string]
    expect(name).toBe(mapFileName('Known World'))
    const file = JSON.parse(await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob) }))
    expect(file).toMatchObject({ format: 'scriblr-maps', rootId: 'map_a' })
    expect(file.maps.map((m: MapDoc) => m.id).sort()).toEqual(['map_a', 'map_b'])
  })

  it('reads a file, asks about a map the project already has, and brings the maps in', async () => {
    const { backend, user } = await open([world()])
    await screen.findByRole('img', { name: /Known World/ })
    const text = JSON.stringify({ format: 'scriblr-maps', version: 1, exportedAt: '', rootId: 'map_a', maps: [world({ title: 'Known World (old)' }), { ...town(), id: 'map_z' }] })
    const list = within(screen.getByRole('navigation', { name: 'Maps' }))
    await user.upload(screen.getByLabelText('Map file'), new File([text], 'x.scriblr-map.json', { type: 'application/json' }))
    const form = within(await screen.findByRole('form', { name: 'Import maps' }))
    expect(form.getByRole('combobox', { name: /Known World \(old\), which the project has already/ })).toHaveValue('both')
    await user.click(form.getByRole('button', { name: 'Import the maps' }))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Import maps' })).not.toBeInTheDocument())
    expect(backend.of('POST')).toHaveLength(2)
    await waitFor(() => expect(list.getAllByRole('button', { name: /^Open / })).toHaveLength(3))
  })

  it('says so when the file is not a map file', async () => {
    const { user } = await open([world()])
    await screen.findByRole('img', { name: /Known World/ })
    await user.upload(screen.getByLabelText('Map file'), new File(['{"nope": 1}'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not a Scriblr map file')
    expect(screen.queryByRole('form', { name: 'Import maps' })).not.toBeInTheDocument()
  })
})
