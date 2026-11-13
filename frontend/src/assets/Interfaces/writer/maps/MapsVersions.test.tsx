import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, MapDoc, OutlineNode } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { newMap } from '../../../../designSystem/mockMaps'
import { mapsBackend } from '../../../../test/mapsBackend'
import MapsConsole from './MapsConsole'

// jsdom has no canvas: the canvas draws nothing here (drawing is covered by the pure tests).
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title: string): OutlineNode => ({
  id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
})
const OUTLINE = [node('b1', 'book', null, 0, 'Book'), node('c1', 'chapter', 'b1', 0, 'Arrival'), node('c2', 'chapter', 'b1', 1, 'The flood'), node('c3', 'chapter', 'b1', 2, 'After')]
const world = (over: Partial<MapDoc> = {}): MapDoc => ({ ...newMap('map_a', { title: 'Known World', level: 'planetary', width: 8, height: 6, cellSize: 10, unit: 'miles' }, 0), ...over })
const ada: CharacterDoc = newCharacter('chr_a', { name: 'Ada' }, 0)

async function open(maps: MapDoc[] = [world()]) {
  const backend = mapsBackend(maps)
  const cast = [ada]
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (
    String(url).endsWith('/characters/all') ? { ok: true, status: 200, statusText: 'OK', json: async () => cast, text: async () => JSON.stringify(cast) } : backend.fetch(url, init)
  )))
  render(<MapsConsole projectId="p1" outline={OUTLINE} />)
  await screen.findByRole('heading', { name: 'Maps', level: 2 })
  return backend
}
const save = () => screen.getByRole('button', { name: 'Save' })
const puts = (b: ReturnType<typeof mapsBackend>) => b.fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT')
const lastPut = (b: ReturnType<typeof mapsBackend>) => JSON.parse((puts(b).at(-1)![1] as RequestInit).body as string) as MapDoc
const at = (x: number, y: number) => ({ clientX: 144 + 64 * x, clientY: 68 + 64 * y, button: 0 })
const pointer = (el: Element, type: 'pointerdown' | 'pointerup', init: MouseEventInit) => fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))

describe('versions of a map', () => {
  async function makeVersion(user: ReturnType<typeof userEvent.setup>) {
    const backend = await open()
    await screen.findByRole('img', { name: /Known World/ })
    await user.click(screen.getByRole('button', { name: 'Make a version of Known World' }))
    const form = within(await screen.findByRole('form', { name: 'New version' }))
    await user.type(form.getByRole('textbox', { name: 'Title of the new version' }), 'After the flood')
    await user.selectOptions(form.getByRole('combobox', { name: 'The version is true from' }), 'c2')
    await user.click(form.getByRole('button', { name: 'Make the version' }))
    return backend
  }

  it('makes a version from the list, lists it under the map with where it is true from, and opens it', async () => {
    const user = userEvent.setup()
    const backend = await makeVersion(user)
    await screen.findByRole('img', { name: /After the flood/ })
    expect(backend.of('POST')).toContain('POST /projects/p1/maps/map_a/versions')
    const list = within(screen.getByRole('navigation', { name: 'Maps' }))
    expect(list.getAllByRole('button', { name: /^Open / }).map(b => b.textContent)).toEqual(['Known WorldPlanetary', 'After the floodfrom The flood'])
    expect(screen.queryByRole('form', { name: 'New version' })).not.toBeInTheDocument()
    // A version has no "Inside" field: it says where in the story it is true from.
    expect(screen.queryByRole('combobox', { name: 'Inside which map' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'This version is true from' })).toHaveValue('c2')
  })

  it('changes where a version is true from, as an edit to save', async () => {
    const user = userEvent.setup()
    const backend = await makeVersion(user)
    await screen.findByRole('img', { name: /After the flood/ })
    await user.selectOptions(screen.getByRole('combobox', { name: 'This version is true from' }), 'c3')
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    expect(lastPut(backend)).toMatchObject({ title: 'After the flood', appliesFrom: 'c3' })
  })

  it('shows the map and its versions as chips, and opens the version that is true at a point', async () => {
    const user = userEvent.setup()
    await makeVersion(user)
    await screen.findByRole('img', { name: /After the flood/ })
    const bar = within(screen.getByRole('group', { name: 'Versions of this map' }))
    expect(bar.getAllByRole('button').map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Known World', 'false'], ['After the flood', 'true']])
    await user.click(bar.getByRole('button', { name: 'Known World' }))
    await screen.findByRole('img', { name: /Known World/ })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Show the map as it is at' }), 'c3')
    expect(await screen.findByRole('img', { name: /After the flood/ })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Show the map as it is at' }), 'c1')
    expect(await screen.findByRole('img', { name: /Known World/ })).toBeInTheDocument()
  })

  it('deletes a version without touching the map, and has no bar when there is only the map', async () => {
    const user = userEvent.setup()
    const backend = await makeVersion(user)
    await screen.findByRole('img', { name: /After the flood/ })
    await user.click(screen.getByRole('button', { name: 'Delete After the flood' }))
    await user.click(within(screen.getByRole('group', { name: 'Delete After the flood?' })).getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(backend.maps.has('map_a')).toBe(true))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Versions of this map' })).not.toBeInTheDocument())
    expect([...backend.maps.values()].map(m => m.title)).toEqual(['Known World'])
  })

  it('does not offer a version as a map to put a place\'s map or another map inside', async () => {
    const user = userEvent.setup()
    await makeVersion(user)
    await screen.findByRole('img', { name: /After the flood/ })
    await user.click(within(screen.getByRole('navigation', { name: 'Maps' })).getByRole('button', { name: 'Open Known World' }))
    await screen.findByRole('img', { name: /Known World/ })
    const inside = screen.getByRole('combobox', { name: 'Inside which map' })
    expect(within(inside).queryByRole('option', { name: 'After the flood' })).not.toBeInTheDocument()
  })
})

describe('journeys', () => {
  async function follow(user: ReturnType<typeof userEvent.setup>) {
    const backend = await open()
    const canvas = await screen.findByRole('img', { name: /Known World/ })
    const panel = within(screen.getByRole('region', { name: 'Journeys' }))
    await user.selectOptions(await panel.findByRole('combobox', { name: 'Follow a character' }), 'chr_a')
    return { backend, canvas, panel, user }
  }

  it('follows a character, puts stops down with the Journey tool from a point of the story, and saves them', async () => {
    const { backend, canvas, panel, user } = await follow(userEvent.setup())
    expect(within(panel.getByRole('list', { name: 'Journeys on this map' })).getByRole('button', { name: /Ada/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add a stop to a journey' })).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(panel.getByRole('combobox', { name: 'New stops are from' }), 'c1')
    pointer(canvas, 'pointerdown', at(3.2, 2.1))
    pointer(canvas, 'pointerup', at(3.2, 2.1))
    await user.selectOptions(panel.getByRole('combobox', { name: 'New stops are from' }), 'c3')
    pointer(canvas, 'pointerdown', at(5.6, 4.4))
    pointer(canvas, 'pointerup', at(5.6, 4.4))
    expect(await panel.findByRole('combobox', { name: 'Stop 2 is from' })).toHaveValue('c3')
    await user.type(panel.getByRole('textbox', { name: 'Note on stop 1' }), 'Lands')
    await user.tab()
    await user.click(save())
    await waitFor(() => expect(puts(backend)).toHaveLength(1))
    const journey = lastPut(backend).journeys![0]
    expect(journey.characterId).toBe('chr_a')
    expect(journey.stops.map(s => [s.x, s.y, s.at, s.note])).toEqual([[3.5, 2.5, 'c1', 'Lands'], [5.5, 4.5, 'c3', '']])
  })

  it('moves a stop to another point and puts the stops back in the order of the story', async () => {
    const { canvas, panel, user } = await follow(userEvent.setup())
    await user.selectOptions(panel.getByRole('combobox', { name: 'New stops are from' }), 'c2')
    pointer(canvas, 'pointerdown', at(1.5, 1.5))
    pointer(canvas, 'pointerup', at(1.5, 1.5))
    await user.selectOptions(panel.getByRole('combobox', { name: 'New stops are from' }), 'c3')
    pointer(canvas, 'pointerdown', at(4.5, 3.5))
    pointer(canvas, 'pointerup', at(4.5, 3.5))
    await user.selectOptions(await panel.findByRole('combobox', { name: 'Stop 1 is from' }), 'c3')
    expect(panel.getByRole('combobox', { name: 'Stop 1 is from' })).toHaveValue('c3')
    await user.selectOptions(panel.getByRole('combobox', { name: 'Stop 2 is from' }), 'c1')
    expect(panel.getByRole('combobox', { name: 'Stop 1 is from' })).toHaveValue('c1')
  })

  it('removes a stop, and a whole journey after asking', async () => {
    const { canvas, panel, user } = await follow(userEvent.setup())
    pointer(canvas, 'pointerdown', at(3.2, 2.1))
    pointer(canvas, 'pointerup', at(3.2, 2.1))
    await user.click(await panel.findByRole('button', { name: 'Remove stop 1' }))
    expect(panel.queryByRole('combobox', { name: 'Stop 1 is from' })).not.toBeInTheDocument()
    await user.click(panel.getByRole('button', { name: 'Remove the journey of Ada' }))
    await user.click(within(panel.getByRole('group', { name: 'Remove the journey?' })).getByRole('button', { name: 'Confirm remove the journey' }))
    expect(panel.queryByRole('group', { name: 'Journey of Ada' })).not.toBeInTheDocument()
    expect(panel.getByRole('combobox', { name: 'Follow a character' })).toBeInTheDocument()
  })

  it('takes a character once, and offers the points of the story to see where everyone is', async () => {
    const { panel } = await follow(userEvent.setup())
    expect(panel.queryByRole('combobox', { name: 'Follow a character' })).not.toBeInTheDocument()
    const where = panel.getByRole('combobox', { name: 'Where everyone is at' })
    expect(within(where).getAllByRole('option').map(o => o.textContent)).toEqual(['No point chosen', 'Book > Arrival', 'Book > The flood', 'Book > After'])
    expect(panel.getByText('Journeys are for you: readers never see them.')).toBeInTheDocument()
  })

  it('says to make a character when there is none to follow', async () => {
    const backend = mapsBackend([world()])
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (String(url).endsWith('/characters/all') ? { ok: true, status: 200, statusText: 'OK', json: async () => [], text: async () => '[]' } : backend.fetch(url, init))))
    render(<MapsConsole projectId="p1" outline={OUTLINE} />)
    const panel = within(await screen.findByRole('region', { name: 'Journeys' }))
    expect(await panel.findByText('Make a character in the Characters tab to follow one.')).toBeInTheDocument()
  })
})
