import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogBook, ReaderState } from '../../api/reader'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import RUI from './RUI'
import { __resetReaderForTests } from './reader/readerStore'

const book = (over: Partial<CatalogBook>): CatalogBook => ({
  id: 'cold-harbor', title: 'Cold Harbor', authorId: 'mara-quill', authorName: 'Mara Quill', type: 'novel', genres: ['Literary'], tags: [], tropes: ['Slow burn'],
  flags: [{ key: 'grief', name: 'Grief', detail: '', defaultClass: 'marked' }], wordCount: 80000, rating: 8.8, ratings: 1208, readers: 1402, popularity: 2610, series: null, hue: 28,
  blurb: 'Lorem ipsum.', buyPriceCents: 900, editions: 1, publishedAt: '2026-03-04', source: 'seed', projectId: null, bookId: null, ...over,
})
const BOOKS = [book({}), book({ id: 'thaw', title: 'Thaw', hue: 330, wordCount: 60000 })]

const state = (over: Partial<ReaderState> = {}): ReaderState => ({
  plan: { extraCredits: 0 }, planPriceCents: 600, creditsPerMonth: 1, balance: 1,
  ledger: [{ id: 'l1', at: '2026-10-01T00:00:00Z', kind: 'grant', delta: 1, note: 'Monthly credits for 2026-10', bookId: null, holdingId: null }],
  holdings: [], toRead: [], wishlist: [], progress: {}, activity: {}, flagClasses: {}, notifications: [], ...over,
})

interface Call { method: string; url: string; body: unknown }
let calls: Call[]
let reader: ReaderState

function stubFetch() {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data })
    if (url === '/api/reader' && method === 'GET') return json(reader)
    if (url.startsWith('/api/library/books?')) return json({ total: BOOKS.length, books: BOOKS })
    if (url.startsWith('/api/library/recommendations')) return json([{ book: BOOKS[1], match: 80, why: ['The next book.'] }])
    if (url === '/api/reader/borrow') {
      reader = state({
        balance: 0,
        holdings: [{ id: 'h1', bookId: body.bookId, kind: 'borrowed', status: 'active', startedAt: '2026-10-11T00:00:00Z', dueAt: '2026-11-11T00:00:00Z', endedAt: null, credits: body.credits, opened: false, openedAt: null, lentTo: null, lentUntil: null }],
      })
      return json(reader)
    }
    if (url === '/api/reader/plan') {
      reader = state({ plan: { extraCredits: body.extraCredits }, planPriceCents: 600 + 200 * body.extraCredits, creditsPerMonth: 1 + body.extraCredits })
      return json(reader)
    }
    return json({})
  }))
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><RUI /><Where /></MemoryRouter>)

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  __resetReaderForTests()
  reader = state()
  stubFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('the Reader', () => {
  it('opens at the Nook with an empty stack and the credits in the header', async () => {
    open('/read')
    expect(await screen.findByText(/Your stack is empty/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /1 credit/ })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'Nook consoles' })).toBeTruthy()
  })

  it('opens the Library from the Nook, leaving the Nook as a rail to go back by', async () => {
    const user = userEvent.setup()
    open('/read')
    await user.click(await screen.findByRole('button', { name: /Browse the Library/ }))
    expect(screen.getByTestId('where').textContent).toBe('/read/library')
    expect(await screen.findByRole('toolbar', { name: 'Library consoles' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back to Nook' }))
    expect(screen.getByTestId('where').textContent).toBe('/read')
  })

  it('shows each console as an icon, a tile or the full console, and writes the full one to the URL', async () => {
    const user = userEvent.setup()
    open('/read')
    const bar = await screen.findByRole('toolbar', { name: 'Nook consoles' })
    expect(within(bar).getByRole('button', { name: 'Stack' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(bar).getByRole('button', { name: 'Feed' }).getAttribute('aria-pressed')).toBe('false')

    await user.click(within(bar).getByRole('button', { name: 'Feed' }))
    expect(within(bar).getByRole('button', { name: 'Feed' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(within(screen.getByRole('region', { name: 'Analytics' })).getByRole('button', { name: 'Analytics' }))
    expect(screen.getByTestId('where').textContent).toBe('/read/nook/analytics')
    expect(within(bar).getByRole('button', { name: 'Stack' }).getAttribute('aria-pressed')).toBe('false') // the others shrink to icons
    await user.click(screen.getByRole('button', { name: 'Make Analytics smaller' }))
    expect(screen.getByTestId('where').textContent).toBe('/read')
  })

  it('opens a console named by the URL as the full console', async () => {
    open('/read/library/catalog')
    expect(await screen.findByRole('toolbar', { name: 'Library consoles' })).toBeTruthy()
    expect(await screen.findByLabelText('Search the catalog')).toBeTruthy()
    expect(screen.getByText('Reader rating')).toBeTruthy() // only the full catalog has its filters
  })

  it('borrows a book with a credit from the catalog and shows it in the stack', async () => {
    const user = userEvent.setup()
    open('/read/library')
    const buttons = await screen.findAllByRole('button', { name: /Borrow or buy/ })
    await user.click(buttons[0])
    const dialog = await screen.findByRole('dialog', { name: /Borrow or buy/ })
    await user.click(within(dialog).getByRole('button', { name: /Borrow for 1 month/ }))
    await waitFor(() => expect(calls.some(c => c.url === '/api/reader/borrow' && c.method === 'POST')).toBe(true))
    expect(calls.find(c => c.url === '/api/reader/borrow')?.body).toEqual({ bookId: 'cold-harbor', credits: 1 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('In your stack')).toBeTruthy()
    expect(screen.getByRole('button', { name: /0 credits/ })).toBeTruthy()
  })

  it('shows the plan, and changes the extra credits ($2 each)', async () => {
    const user = userEvent.setup()
    open('/read')
    await user.click(await screen.findByRole('button', { name: /1 credit/ }))
    const dialog = await screen.findByRole('dialog', { name: /plan and credits/i })
    expect(within(dialog).getByText('$6.00 a month')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'More extra credits' }))
    expect(await within(dialog).findByText('$8.00 a month')).toBeTruthy()
    expect(calls.find(c => c.url === '/api/reader/plan')?.body).toEqual({ extraCredits: 1 })
    expect(within(dialog).getByText(/Scriblr \$2\.00 · Author \$3\.00/)).toBeTruthy()
  })

  it('closes a dialog with Escape', async () => {
    const user = userEvent.setup()
    open('/read')
    await user.click(await screen.findByRole('button', { name: /1 credit/ }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a book at its own page, with the Nook and Library as rails', async () => {
    open('/read/book/cold-harbor')
    expect(await screen.findByRole('heading', { name: 'Cold Harbor', level: 3 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Nook' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Library' })).toBeTruthy()
    expect(screen.getByText(/Grief · marked/)).toBeTruthy()
  })

  it('says so when a book is not in the library', async () => {
    open('/read/book/nope')
    expect(await screen.findByText(/not in the library/)).toBeTruthy()
  })
})
