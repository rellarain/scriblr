import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import UUI from './UUI'
import { mockFetch } from '../../test/mockFetch'

// The Account tile shows the flag settings, which read the reader and the library.
const calls: { url: string; method: string; body: unknown }[] = []
function stubApi() {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
      const reader = { plan: { extraCredits: 0 }, planPriceCents: 600, creditsPerMonth: 1, balance: 1, ledger: [], holdings: [], toRead: [], wishlist: [], progress: {}, activity: {}, flagClasses: {}, notifications: [], levels: {}, criteriaNames: [], reviews: [], notes: [], following: [], joinedClubs: [], reports: [], blocked: [] }
      const book = { id: 'b1', title: 'B', authorId: 'a', authorName: 'A', type: 'novel', genres: [], tags: [], tropes: [], flags: [{ key: 'grief', name: 'Grief', detail: '', defaultClass: 'marked' }], wordCount: 1, rating: 0, ratings: 0, readers: 0, popularity: 0, series: null, hue: 1, blurb: '', buyPriceCents: 100, editions: 1, publishedAt: null, source: 'seed', projectId: null, bookId: null }
      const data = url === '/api/reader' ? reader : url.startsWith('/api/library/books?') ? { total: 1, books: [book] } : url.startsWith('/api/reader/flag-classes/') ? { ...reader, flagClasses: { grief: 'spoiler' } } : []
      return { ok: true, status: 200, json: async () => data }
    }))
}

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
  stubApi()
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement

describe('UUI (the User panel as tiles)', () => {
  it('shows Dashboard, Account and Training as consoles holding their pages as tiles, with Settings and Help as consoles of their own', () => {
    render(<UUI />)
    const top = Array.from(document.querySelectorAll('[data-tile-id]')).map(t => t.getAttribute('data-tile-id')).filter(id => ['dashboard', 'account', 'training', 'settings', 'help'].includes(id!))
    expect(top).toEqual(['dashboard', 'account', 'training', 'settings', 'help'])
    expect(within(tile('dashboard')).getByText('Activity Log')).toBeTruthy()
    expect(within(tile('account')).getByText('Manage your profile details here.')).toBeTruthy()
    expect(within(tile('training')).getByText('Access admin training resources here.')).toBeTruthy()
    // Settings and Help are not tiles of a section: they are the panel's own consoles.
    expect(within(tile('training')).queryByText(/using the Training console/)).toBeNull()
    expect(within(tile('help')).getByText(/using the Training console/)).toBeTruthy()
    expect(within(tile('settings')).getByRole('heading', { name: 'Account' })).toBeTruthy()
  })

  it('has a rail of consoles in the panel header (Settings and Help last), and a rail of tiles in each console tile title bar', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    const consoles = screen.getByRole('toolbar', { name: 'User panel consoles tabs' })
    expect(within(consoles).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Dashboard', 'Account', 'Training', 'Settings', 'Help'])
    const pages = within(tile('training').querySelector('.gtTitle') as HTMLElement).getByRole('toolbar', { name: 'Training tiles tabs' })
    expect(within(pages).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['User Training', 'Reader Training', 'Translator Training', 'Writer Training', 'Admin Training'])
    // A tile has no minimize button; its icon in the rail turns it off and on.
    expect(screen.queryByRole('button', { name: /^Minimize/ })).toBeNull()
    await user.click(within(pages).getByRole('button', { name: 'Reader Training' }))
    expect(tile('readerTraining')).toBeNull()
    await user.click(within(pages).getByRole('button', { name: 'Reader Training' }))
    expect(tile('readerTraining')).toBeTruthy()
    await user.click(within(consoles).getByRole('button', { name: 'Training' }))
    expect(tile('training')).toBeNull()
    expect(within(consoles).getByRole('button', { name: 'Training' }).getAttribute('aria-pressed')).toBe('false')
    await user.click(within(consoles).getByRole('button', { name: 'Training' }))
    expect(tile('training')).toBeTruthy()
  })

  it('classifies each content flag at the user level, in Account > Flags', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    const group = await screen.findByRole('group', { name: 'How to treat Grief' })
    expect(within(group).getByRole('button', { name: 'Marked' }).getAttribute('aria-pressed')).toBe('true') // the author's default
    await user.click(within(group).getByRole('button', { name: 'Spoiler' }))
    expect(calls.find(c => c.url === '/api/reader/flag-classes/grief')?.body).toEqual({ flagClass: 'spoiler' })
  })

  it('has Account settings in the Settings console, with the theme tool embedded inline', () => {
    render(<UUI />)
    const settings = within(tile('settings')).getByRole('region', { name: 'Account settings' })
    expect(within(settings).getByRole('button', { name: /Handedness/ })).toBeTruthy()
    expect(within(settings).getByRole('list', { name: 'Hues' })).toBeTruthy() // the account theme tool: the list of hues, the day bar and the cards
    expect(within(settings).getByRole('region', { name: 'Day colours' })).toBeTruthy()
  })
})
