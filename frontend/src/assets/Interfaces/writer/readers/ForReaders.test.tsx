import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookExtras, BookExtrasInfo, CharacterDoc, MapDoc } from '../../../../api/types'
import { NO_SHARE, shareOf } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { newMap } from '../../../../designSystem/mockMaps'
import { charactersBackend } from '../../../../test/charactersBackend'
import { mapsBackend } from '../../../../test/mapsBackend'
import CharactersConsole from '../characters/CharactersConsole'
import MapsConsole from '../maps/MapsConsole'
import { setShare, draftOf } from '../maps/mapModel'
import { CharacterCard, MapView } from './WorldViews'
import { RevealSelect } from './ReaderControls'

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })

const INFO: BookExtrasInfo[] = [{
  bookId: 'b1', title: 'My Book',
  chapters: [{ n: 1, chapterId: 'c1', title: 'One' }, { n: 2, chapterId: 'c2', title: 'Two' }],
  warnings: [{ kind: 'character', targetId: 'chr_a', name: 'Ada', revealAt: 2, sceneId: 's1', sceneTitle: 'Arrival', chapter: 1 }],
}]
const ada = (over: Partial<CharacterDoc> = {}): CharacterDoc => ({ ...newCharacter('chr_a', { name: 'Ada' }, 0), ...over })
const reply = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => JSON.stringify(body) })

// The pretend API of the console, with the two routes for readers answered here.
function withExtras(inner: ReturnType<typeof vi.fn>, preview: (chapter: number) => BookExtras) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.includes('/reader-extras')) return reply(INFO)
    if (path.includes('/extras-preview')) { calls.push(path); return reply(preview(Number(new URL(path, 'http://x').searchParams.get('chapter')))) }
    return inner(url, init)
  }))
  return calls
}
const extras = (over: Partial<BookExtras> = {}): BookExtras => ({ bookId: 'b1', reach: 0, maps: [], characters: [], lockedMaps: 0, lockedCharacters: 0, ...over })
const lastPut = (fetch: ReturnType<typeof vi.fn>) => {
  const put = fetch.mock.calls.filter(c => (c[1] as RequestInit | undefined)?.method === 'PUT').at(-1)
  return JSON.parse((put![1] as RequestInit).body as string)
}

describe('the share of a map or a character', () => {
  it('is nothing when the document has none', () => {
    expect(shareOf({})).toBe(NO_SHARE)
    expect(shareOf({ reader: { ...NO_SHARE, published: true } }).published).toBe(true)
  })

  it('is one undo step of the map, or no change when it is the same', () => {
    const draft = draftOf(newMap('map_a', { title: 'W' }, 0))
    expect(setShare(draft, NO_SHARE)).toBeNull()
    const made = setShare(draft, { ...NO_SHARE, published: true, revealAt: 2 })
    expect(made?.draft.reader).toEqual({ published: true, revealAt: 2, reveals: {}, fields: [] })
    expect(made?.edit.kind).toBe('meta')
  })
})

describe('the reveal choice', () => {
  it('offers the start and the chapters, and keeps a chapter that is not published yet', () => {
    render(<RevealSelect label="Shown from" value={5} chapters={INFO[0].chapters} onChange={() => {}} />)
    const options = within(screen.getByRole('combobox', { name: 'Shown from' })).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['From the start', 'Chapter 1: One', 'Chapter 2: Two', 'Chapter 5 (not published yet)'])
  })

  it('hands over the chapter number, or null for the start', async () => {
    const onChange = vi.fn()
    render(<RevealSelect label="Shown from" value={null} chapters={INFO[0].chapters} onChange={onChange} />)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Shown from' }), '2')
    expect(onChange).toHaveBeenLastCalledWith(2)
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Shown from' }), '')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})

describe('the views a reader gets', () => {
  const card = { id: 'chr_a', name: 'Ada', portrait: ada().portrait, fields: [{ key: 'role', label: 'Role', value: 'Navigator' }], relationships: [{ targetId: 'chr_b', targetName: 'Bram', label: 'Old friend', description: 'Sailed together.' }] }

  it('shows a character as a card with its public fields and links', async () => {
    const onOpen = vi.fn()
    render(<CharacterCard card={card} onOpen={onOpen} />)
    const article = within(screen.getByRole('article', { name: 'Ada' }))
    expect(article.getByRole('img', { name: 'Ada, portrait' })).toBeInTheDocument()
    expect(article.getByText('Navigator')).toBeInTheDocument()
    expect(article.getByText(/Old friend: Sailed together\./)).toBeInTheDocument()
    await userEvent.setup().click(article.getByRole('button', { name: 'Go to Bram' }))
    expect(onOpen).toHaveBeenCalledWith('chr_b')
  })

  it('says so when a character has nothing public beyond the portrait', () => {
    render(<CharacterCard card={{ ...card, fields: [], relationships: [] }} />)
    expect(screen.getByText('Nothing more is told yet.')).toBeInTheDocument()
  })

  it('says so when there is nothing to draw a map on', async () => {
    render(<MapView doc={newMap('map_a', { title: 'Veyra' }, 0)} />)
    expect(await screen.findByRole('status')).toHaveTextContent('The map could not be drawn here.')
  })
})

describe('the character for readers', () => {
  async function openSection(character = ada(), preview: (chapter: number) => BookExtras = () => extras()) {
    const backend = charactersBackend([character])
    const calls = withExtras(backend.fetch, preview)
    const user = userEvent.setup()
    render(<CharactersConsole projectId="p1" />)
    await screen.findByRole('textbox', { name: 'In a paragraph' })
    await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'For readers' }))
    return { backend, user, calls, section: within(await screen.findByRole('region', { name: 'For readers' })) }
  }

  it('is not shown to readers until it is published, and the fields are only offered then', async () => {
    const { section } = await openSection()
    const publish = section.getByRole('checkbox', { name: 'Show Ada to readers' })
    expect(publish).not.toBeChecked()
    expect(section.queryByRole('combobox', { name: 'Shown to readers from' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'What readers are told' })).not.toBeInTheDocument()
    expect(screen.getByText('Not shown to readers.')).toBeInTheDocument()
  })

  it('publishes with a chapter and public fields, each from a chapter of its own, and saves them with the character', async () => {
    const { backend, user, section } = await openSection()
    await user.click(section.getByRole('checkbox', { name: 'Show Ada to readers' }))
    await user.selectOptions(await section.findByRole('combobox', { name: 'Shown to readers from' }), '2')
    const told = within(await screen.findByRole('region', { name: 'What readers are told' }))
    await user.click(told.getByRole('checkbox', { name: 'Role' }))
    await user.click(told.getByRole('checkbox', { name: 'History' }))
    await user.selectOptions(told.getByRole('combobox', { name: 'History shown from' }), '2')
    await user.click(told.getByRole('checkbox', { name: 'Role' }))  // ticked and unticked: gone
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(backend.of('PUT')).toHaveLength(1))
    expect(lastPut(backend.fetch).reader).toEqual({ published: true, revealAt: 2, reveals: { background: 2 }, fields: ['background'] })
  })

  it('offers the fields of the author\'s own, and forgets the reveal of a field that is taken off', async () => {
    const profile = { ...ada().profile, fields: [{ id: 'f1', label: 'Motto', value: 'Onward' }] }
    const { backend, user } = await openSection(ada({ profile, reader: { published: true, revealAt: null, reveals: { 'field:f1': 2 }, fields: ['field:f1'] } }))
    const told = within(await screen.findByRole('region', { name: 'What readers are told' }))
    expect(told.getByRole('combobox', { name: 'Motto shown from' })).toHaveValue('2')
    await user.click(told.getByRole('checkbox', { name: 'Motto' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(backend.of('PUT')).toHaveLength(1))
    expect(lastPut(backend.fetch).reader).toMatchObject({ reveals: {}, fields: [] })
  })

  it('warns about a scene that comes before the reveal, and previews what a reader has reached', async () => {
    const card = { id: 'chr_a', name: 'Ada', portrait: ada().portrait, fields: [{ key: 'role', label: 'Role', value: 'Navigator' }], relationships: [] }
    const { user, calls } = await openSection(ada({ reader: { published: true, revealAt: 2, reveals: {}, fields: ['role'] } }), chapter => extras({ reach: chapter, characters: chapter >= 2 ? [card] : [] }))
    const warnings = within(await screen.findByRole('list', { name: 'Spoiler warnings' }))
    expect(warnings.getByRole('note')).toHaveTextContent('Ada is shown from chapter 2, but the scene "Arrival" in chapter 1 uses them.')
    expect(await screen.findByText(/Not shown yet at this point of the book/)).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Preview as a reader who has reached' }), '2')
    expect(await screen.findByRole('article', { name: 'Ada' })).toHaveTextContent('Navigator')
    expect(calls.some(c => c.includes('chapter=2'))).toBe(true)
  })

  it('does not break when the chapters cannot be fetched', async () => {
    const backend = charactersBackend([ada()])
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (String(url).includes('/reader-extras') ? { ok: false, status: 500, statusText: 'x', json: async () => ({ detail: 'no' }), text: async () => '{}' } : backend.fetch(url, init))))
    const user = userEvent.setup()
    render(<CharactersConsole projectId="p1" />)
    await screen.findByRole('textbox', { name: 'In a paragraph' })
    await user.click(within(screen.getByRole('toolbar', { name: 'What to work on' })).getByRole('button', { name: 'For readers' }))
    expect(await screen.findByText('The chapters of the book could not be loaded.')).toBeInTheDocument()
  })
})

describe('the map for readers', () => {
  const world = (over: Partial<MapDoc> = {}): MapDoc => ({ ...newMap('map_a', { title: 'Known World', kind: 'world', width: 8, height: 6 }, 0), ...over })

  async function openPanel(map = world(), preview: (chapter: number) => BookExtras = () => extras()) {
    const backend = mapsBackend([map])
    withExtras(backend.fetch, preview)
    const user = userEvent.setup()
    render(<MapsConsole projectId="p1" />)
    await screen.findByRole('heading', { name: 'Maps', level: 2 })
    return { backend, user, panel: within(await screen.findByRole('region', { name: 'For readers' })) }
  }

  it('publishes the map from a chapter and saves it with the map', async () => {
    const { backend, user, panel } = await openPanel()
    await user.click(panel.getByRole('checkbox', { name: 'Show this map to readers' }))
    await user.selectOptions(await panel.findByRole('combobox', { name: 'Map shown to readers from' }), '2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(backend.of('PUT')).toHaveLength(1))
    expect(lastPut(backend.fetch).reader).toEqual({ published: true, revealAt: 2, reveals: {}, fields: [] })
  })

  it('undoes the switch like any other change to the map', async () => {
    const { user, panel } = await openPanel()
    await user.click(panel.getByRole('checkbox', { name: 'Show this map to readers' }))
    expect(screen.getByRole('checkbox', { name: 'Show this map to readers' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Show this map to readers' })).not.toBeChecked())
  })

  it('warns about a scene before the reveal and previews the map at a chapter', async () => {
    const shared = world({ reader: { published: true, revealAt: 2, reveals: {}, fields: [] } })
    const backend = mapsBackend([shared])
    const info: BookExtrasInfo[] = [{ ...INFO[0], warnings: [{ kind: 'place', targetId: 'map_a/port', name: 'Port Veyra', revealAt: 2, sceneId: 's1', sceneTitle: 'Arrival', chapter: 1 }] }]
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url)
      if (path.includes('/reader-extras')) return reply(info)
      if (path.includes('/extras-preview')) return reply(extras({ maps: path.includes('chapter=2') ? [shared] : [], lockedMaps: path.includes('chapter=2') ? 0 : 1 }))
      return backend.fetch(url, init)
    }))
    const user = userEvent.setup()
    render(<MapsConsole projectId="p1" />)
    const panel = within(await screen.findByRole('region', { name: 'For readers' }))
    expect(await panel.findByRole('note')).toHaveTextContent('Port Veyra is shown from chapter 2, but the scene "Arrival" in chapter 1 uses this place.')
    await user.click(panel.getByRole('button', { name: 'Preview as a reader' }))
    expect(await panel.findByText(/Not shown yet at this point of the book/)).toBeInTheDocument()
    await user.selectOptions(panel.getByRole('combobox', { name: 'Preview as a reader who has reached' }), '2')
    expect(await panel.findByText('The map could not be drawn here.')).toBeInTheDocument()  // a map came back; jsdom has no canvas to draw it on
  })
})
