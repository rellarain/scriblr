import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDoc, MapDoc, MapPlace, PlotNode, WorldLink } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { newMap } from '../../../../designSystem/mockMaps'
import { charactersBackend } from '../../../../test/charactersBackend'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mapsBackend } from '../../../../test/mapsBackend'
import CharactersConsole from '../characters/CharactersConsole'
import { LinkedSection } from '../LinkedSection'
import MapsConsole from '../maps/MapsConsole'
import { idOf, kindOf, linkedTo, refOf } from './linkStore'
import { requestOpen } from './worldNav'

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })

const node = (id: string, kind: PlotNode['kind'], parentId: string | null, title: string): PlotNode => ({
  id, kind, parentId, order: 0, title, body: '', sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
} as PlotNode)
const PLOT = [node('cat1', 'category', null, 'Magic'), node('line1', 'plotline', 'cat1', 'The heist')]
const ada = (over: Partial<CharacterDoc> = {}): CharacterDoc => ({ ...newCharacter('chr_a', { name: 'Ada' }, 0), ...over })
const bram = (): CharacterDoc => newCharacter('chr_b', { name: 'Bram' }, 1)
const PLACE: MapPlace = { key: 'map_a/port', mapId: 'map_a', placeId: 'port', name: 'Port Veyra', path: 'Known World > Port Veyra', kind: 'town', mapTitle: 'Known World', mapIds: [] }

// The pretend API for links: the links are kept here, and the places are the one above. Everything else goes to the console's own pretend API.
function withLinks(inner: ReturnType<typeof vi.fn>, start: WorldLink[] = []) {
  let links = [...start]
  const calls: string[] = []
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, statusText: 'x', json: async () => body, text: async () => JSON.stringify(body) })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    const method = init?.method ?? 'GET'
    if (path.includes('/world-links')) {
      calls.push(`${method} ${path.replace('/api', '')}`)
      if (method === 'POST') {
        const body = JSON.parse(init!.body as string) as WorldLink
        const [a, b] = [body.a, body.b].sort()
        if (!links.some(l => l.a === a && l.b === b)) links.push({ a, b })
      }
      if (method === 'DELETE') { const q = new URL(path, 'http://x').searchParams; links = links.filter(l => !(l.a === q.get('a') && l.b === q.get('b')) && !(l.a === q.get('b') && l.b === q.get('a'))) }
      return reply(links)
    }
    if (path.includes('/maps/places/all')) return reply([PLACE])
    return inner(url, init)
  }))
  return { calls, get links() { return links } }
}

describe('link refs', () => {
  it('name the kind and the id of an end, and read the same from either end', () => {
    expect(refOf('char', 'c1')).toBe('char:c1')
    expect(kindOf('plot:x')).toBe('plot')
    expect(kindOf('place:map_a/port')).toBe('place')
    expect(idOf('place:map_a/port')).toBe('map_a/port')
    const links = [{ a: 'char:c1', b: 'plot:p1' }, { a: 'char:c2', b: 'char:c1' }]
    expect(linkedTo(links, 'char:c1')).toEqual(['plot:p1', 'char:c2'])
    expect(linkedTo(links, 'plot:p1')).toEqual(['char:c1'])
    expect(linkedTo(links, 'nothing')).toEqual([])
  })
})

describe('the links of a character', () => {
  async function openStory(links: WorldLink[] = []) {
    const backend = charactersBackend([ada(), bram()])
    const api = withLinks(backend.fetch, links)
    const onOpenPlot = vi.fn()
    const user = userEvent.setup()
    render(<CharactersConsole projectId="p1" plotNodes={PLOT} onOpenPlot={onOpenPlot} />)
    await screen.findByRole('img', { name: /close-up/ })
    await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'Story' }))
    return { api, user, onOpenPlot, group: within(await screen.findByRole('group', { name: 'Linked to' })) }
  }

  it('lists what it is linked to, whichever end made the link, and opens a plot node', async () => {
    const { user, onOpenPlot, group } = await openStory([{ a: 'char:chr_a', b: 'plot:line1' }, { a: 'char:chr_a', b: `place:${PLACE.key}` }])
    expect(await group.findByRole('button', { name: 'Open Magic › The heist' })).toBeInTheDocument()
    expect(group.getByRole('button', { name: 'Open Known World > Port Veyra' })).toBeInTheDocument()
    await user.click(group.getByRole('button', { name: 'Open Magic › The heist' }))
    expect(onOpenPlot).toHaveBeenCalledWith('line1')
  })

  it('offers plot nodes and places (not characters) and links to the one picked', async () => {
    const { api, user, group } = await openStory()
    const pick = await group.findByRole('combobox', { name: 'Link to' })
    const groups = within(pick).getAllByRole('group').map(g => g.getAttribute('label'))
    expect(groups).toEqual(['Plot nodes', 'Places'])
    await user.selectOptions(pick, `plot:line1`)
    expect(await group.findByRole('button', { name: 'Open Magic › The heist' })).toBeInTheDocument()
    expect(api.calls).toContain('POST /projects/p1/world-links')
    expect(api.links).toEqual([{ a: 'char:chr_a', b: 'plot:line1' }])
    expect(within(group.getByRole('combobox', { name: 'Link to' })).queryByRole('option', { name: 'Magic › The heist' })).not.toBeInTheDocument()
  })

  it('takes a link away', async () => {
    const { api, user, group } = await openStory([{ a: 'char:chr_a', b: 'plot:line1' }])
    await user.click(await group.findByRole('button', { name: 'Remove the link to Magic › The heist' }))
    await waitFor(() => expect(group.queryByRole('button', { name: 'Open Magic › The heist' })).not.toBeInTheDocument())
    expect(api.links).toEqual([])
  })

  it('says so when the link could not be saved', async () => {
    const backend = charactersBackend([ada()])
    withLinks(backend.fetch)
    const inner = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<unknown>
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'POST' && String(url).includes('world-links') ? { ok: false, status: 422, statusText: 'x', json: async () => ({ detail: 'no' }), text: async () => '{}' } : inner(url, init))))
    const user = userEvent.setup()
    render(<CharactersConsole projectId="p1" plotNodes={PLOT} />)
    await screen.findByRole('img', { name: /close-up/ })
    await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'Story' }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Link to' }), 'plot:line1')
    expect(await screen.findByText('That link could not be saved.')).toBeInTheDocument()
  })

  it('opens the character that a link from another console asked for', async () => {
    const backend = charactersBackend([ada(), bram()])
    withLinks(backend.fetch)
    requestOpen('char', 'chr_b')
    render(<CharactersConsole projectId="p1" />)
    expect(await screen.findByRole('img', { name: /Bram, close-up/ })).toBeInTheDocument()
  })
})

describe('the links of a place', () => {
  const world = (): MapDoc => {
    const doc = newMap('map_a', { title: 'Known World', kind: 'world', width: 8, height: 6 }, 0)
    const layer = doc.layers.find(l => l.kind === 'symbols')!.id
    return { ...doc, symbols: [{ id: 'port', layerId: layer, kind: 'town', x: 3, y: 3, size: 2, color: null, name: 'Port Veyra', mapIds: [] }] }
  }

  it('opens the map and chooses the place that a link from another console asked for, and lists its links', async () => {
    const backend = mapsBackend([world()])
    withLinks(backend.fetch, [{ a: 'char:chr_a', b: 'place:map_a/port' }])
    // The characters are not on this page: the link's other end is only named when it is known, so the place's own list stays empty until the cast loads.
    requestOpen('place', 'map_a/port')
    render(<MapsConsole projectId="p1" plotNodes={PLOT} />)
    expect(await screen.findByRole('textbox', { name: 'Name of the place' })).toHaveValue('Port Veyra')
    const group = within(await screen.findByRole('group', { name: 'Linked to' }))
    expect(group.getByRole('combobox', { name: 'Link to' })).toBeInTheDocument()
  })
})

describe('the links of a plot node', () => {
  it('lists characters and places under the plot links, and links a character from the plot', async () => {
    const backend = charactersBackend([ada()])
    const api = withLinks(backend.fetch, [{ a: `place:${PLACE.key}`, b: 'plot:line1' }])
    const focusPlotNode = vi.fn()
    const w = makeWorkspace({ activeProjectId: 'p1', plotNodes: PLOT, plotNodeById: new Map(PLOT.map(n => [n.id, n])), focusPlotNode, projectHue: 200 })
    const user = userEvent.setup()
    render(<LinkedSection w={w} node={PLOT[1]} />)
    const group = within(await screen.findByRole('group', { name: 'Characters, places, items and scenes' }))
    expect(await group.findByRole('button', { name: 'Open Known World > Port Veyra' })).toBeInTheDocument()
    await user.selectOptions(group.getByRole('combobox', { name: 'Link to' }), 'char:chr_a')
    await waitFor(() => expect(api.links).toContainEqual({ a: 'char:chr_a', b: 'plot:line1' }))
    expect(within(group.getByRole('combobox', { name: 'Link to' })).queryByRole('option', { name: 'Ada' })).not.toBeInTheDocument()
  })
})
