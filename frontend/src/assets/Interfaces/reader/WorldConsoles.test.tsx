import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogBook } from '../../../api/reader'
import type { BookExtras, MapDoc } from '../../../api/types'
import { newCharacter } from '../../../designSystem/mockCharacters'
import { newMap } from '../../../designSystem/mockMaps'
import type { ReaderCtx } from './readerContext'
import { CastConsole, MapsConsole } from './WorldConsoles'

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })

const book = { id: 'local-p-b1', title: 'My Book' } as CatalogBook
const ctx = (updatedAt: string | null = null) => ({ data: { reader: { progress: { [book.id]: { updatedAt } } } } }) as unknown as ReaderCtx
const map = (id: string, title: string, over: Partial<MapDoc> = {}): MapDoc => ({ ...newMap(id, { title, width: 6, height: 6 }, 0), ...over })
const extras = (over: Partial<BookExtras> = {}): BookExtras => ({ bookId: book.id, reach: 1, maps: [], characters: [], lockedMaps: 0, lockedCharacters: 0, ...over })
const card = (id: string, name: string, over = {}) => ({ id, name, look: newCharacter(id, { name }, 0).look, fields: [], relationships: [], ...over })

// The book's extras are served as given, or the request fails.
function serve(body: BookExtras | 'fail') {
  const fn = vi.fn(async (_url: string, _init?: RequestInit): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown>; text: () => Promise<string> }> => (
    body === 'fail'
      ? { ok: false, status: 500, statusText: 'x', json: async () => ({ detail: 'no' }), text: async () => '{}' }
      : { ok: true, status: 200, statusText: 'OK', json: async () => body, text: async () => JSON.stringify(body) }
  ))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('the Maps console of a book', () => {
  it('asks for the extras of the book and shows the published map with its named places', async () => {
    const symbol = { id: 's1', layerId: 'l', kind: 'town', x: 1, y: 1, size: 2, color: null, name: 'Port Veyra', mapIds: ['m2'] }
    const fn = serve(extras({ maps: [map('m1', 'Veyra', { symbols: [symbol] })] }))
    render(<MapsConsole ctx={ctx()} book={book} />)
    const places = within(await screen.findByRole('list', { name: 'Places on this map' }))
    expect(fn).toHaveBeenCalledWith(`/api/reader/books/${book.id}/extras`, expect.anything())
    expect(places.getByText('Port Veyra')).toBeInTheDocument()
    expect(places.getByText('has a map of its own')).toBeInTheDocument()
    expect(screen.getByText('Veyra')).toBeInTheDocument()
  })

  it('lists the maps, and opens the one picked', async () => {
    serve(extras({ maps: [map('m1', 'Veyra'), map('m2', 'The Inn', { parentId: 'm1', kind: 'interior' })] }))
    const user = userEvent.setup()
    render(<MapsConsole ctx={ctx()} book={book} />)
    const group = within(await screen.findByRole('group', { name: 'Maps' }))
    expect(group.getAllByRole('button').map(b => b.textContent)).toEqual(['Veyra', 'The Inn'])
    expect(group.getByRole('button', { name: 'Veyra' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(group.getByRole('button', { name: 'The Inn' }))
    expect(group.getByRole('button', { name: 'The Inn' })).toHaveAttribute('aria-pressed', 'true')
    expect(group.getByRole('button', { name: 'Veyra' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('only counts what is still to be revealed, never names it', async () => {
    serve(extras({ lockedMaps: 2 }))
    render(<MapsConsole ctx={ctx()} book={book} />)
    expect(await screen.findByText('Nothing is drawn yet. Keep reading.')).toBeInTheDocument()
    expect(screen.getByText('2 more maps to discover as you read.')).toBeInTheDocument()
  })

  it('says so when the author published no map, and when it could not be loaded', async () => {
    serve(extras())
    const first = render(<MapsConsole ctx={ctx()} book={book} />)
    expect(await screen.findByText('The author has not published a map for this book.')).toBeInTheDocument()
    first.unmount()
    serve('fail')
    render(<MapsConsole ctx={ctx()} book={book} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The maps could not be loaded.')
  })

  it('asks again when the reader has moved on in the book', async () => {
    const fn = serve(extras({ lockedMaps: 1 }))
    const view = render(<MapsConsole ctx={ctx('t1')} book={book} />)
    await screen.findByText('One more map to discover as you read.')
    expect(fn).toHaveBeenCalledTimes(1)
    view.rerender(<MapsConsole ctx={ctx('t2')} book={book} />)
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2))
  })
})

describe('the Cast console of a book', () => {
  it('shows a card for each published character, with the fields that are public', async () => {
    serve(extras({ characters: [card('a', 'Ada', { fields: [{ key: 'role', label: 'Role', value: 'Navigator' }] }), card('b', 'Bram')] }))
    render(<CastConsole ctx={ctx()} book={book} />)
    expect(await screen.findByRole('article', { name: 'Ada' })).toHaveTextContent('Navigator')
    expect(screen.getByRole('article', { name: 'Bram' })).toHaveTextContent('Nothing more is told yet.')
  })

  it('counts the characters still to meet', async () => {
    serve(extras({ lockedCharacters: 1 }))
    render(<CastConsole ctx={ctx()} book={book} />)
    expect(await screen.findByText('Nobody to meet yet. Keep reading.')).toBeInTheDocument()
    expect(screen.getByText('One more character to discover as you read.')).toBeInTheDocument()
  })

  it('says so when the author published no character, and when it could not be loaded', async () => {
    serve(extras())
    const first = render(<CastConsole ctx={ctx()} book={book} />)
    expect(await screen.findByText('The author has not published any characters for this book.')).toBeInTheDocument()
    first.unmount()
    serve('fail')
    render(<CastConsole ctx={ctx()} book={book} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The cast could not be loaded.')
  })
})
