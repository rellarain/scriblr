import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../settings/settingsStore'
import UUI from './UUI'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})
afterEach(() => { vi.unstubAllGlobals() })

const tile = (id: string) => document.querySelector(`[data-tile-id="${id}"]`) as HTMLElement

describe('UUI (the User panel as tiles)', () => {
  it('shows Dashboard, Account and Training as section tiles listing their pages', () => {
    render(<UUI />)
    expect(['dashboard', 'account', 'training'].map(id => tile(id).getAttribute('data-shape'))).toEqual(['mid', 'mid', 'mid'])
    expect(within(tile('dashboard')).getByText('Activity Log')).toBeTruthy()
    expect(within(tile('account')).getByText('Portfolio')).toBeTruthy()
    expect(within(tile('training')).getByText('Admin Training')).toBeTruthy()
    // Settings and Help are no longer sub-pages or tabs.
    expect(screen.queryByText('Help')).toBeNull()
  })

  it('expands a section into its pages as child tiles, which expand into their editors', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('account')).getByRole('button', { name: 'Open Account' }))
    const account = screen.getByRole('region', { name: 'Account' })
    expect(['profile', 'subscription', 'portfolio'].map(id => within(account).getByRole('group', { name: id[0].toUpperCase() + id.slice(1) }).getAttribute('data-tile-id'))).toEqual(['profile', 'subscription', 'portfolio'])
    await user.click(within(account).getByRole('button', { name: 'Open Profile' }))
    const profile = screen.getByRole('region', { name: 'Profile' })
    expect(within(profile).getByText('Manage your profile details here.', { selector: 'p' })).toBeTruthy()
    expect(within(profile).getByRole('navigation', { name: 'Breadcrumb' }).textContent).toContain('User › Account › Profile')
  })

  it('classifies each content flag at the user level, in Account > Flags', async () => {
    const calls: { url: string; method: string; body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
      const reader = { plan: { extraCredits: 0 }, planPriceCents: 600, creditsPerMonth: 1, balance: 1, ledger: [], holdings: [], toRead: [], wishlist: [], progress: {}, activity: {}, flagClasses: {}, notifications: [], levels: {}, criteriaNames: [], reviews: [], notes: [], following: [], joinedClubs: [], reports: [], blocked: [] }
      const book = { id: 'b1', title: 'B', authorId: 'a', authorName: 'A', type: 'novel', genres: [], tags: [], tropes: [], flags: [{ key: 'grief', name: 'Grief', detail: '', defaultClass: 'marked' }], wordCount: 1, rating: 0, ratings: 0, readers: 0, popularity: 0, series: null, hue: 1, blurb: '', buyPriceCents: 100, editions: 1, publishedAt: null, source: 'seed', projectId: null, bookId: null }
      const data = url === '/api/reader' ? reader : url.startsWith('/api/library/books?') ? { total: 1, books: [book] } : url.startsWith('/api/reader/flag-classes/') ? { ...reader, flagClasses: { grief: 'spoiler' } } : []
      return { ok: true, status: 200, json: async () => data }
    }))
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('account')).getByRole('button', { name: 'Open Account' }))
    await user.click(within(screen.getByRole('region', { name: 'Account' })).getByRole('button', { name: 'Open Flags' }))
    const group = await screen.findByRole('group', { name: 'How to treat Grief' })
    expect(within(group).getByRole('button', { name: 'Marked' }).getAttribute('aria-pressed')).toBe('true') // the author's default
    await user.click(within(group).getByRole('button', { name: 'Spoiler' }))
    expect(calls.find(c => c.url === '/api/reader/flag-classes/grief')?.body).toEqual({ flagClass: 'spoiler' })
  })

  it('has no in-console section-switch strip -- Back and reopen switches sections instead', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('dashboard')).getByRole('button', { name: 'Open Dashboard' }))
    expect(screen.queryByRole('tablist', { name: 'Tiles' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Back to tiles' }))
    await user.click(within(tile('training')).getByRole('button', { name: 'Open Training' }))
    expect(screen.getByRole('region', { name: 'Training' })).toBeTruthy()
  })

  it('puts Account settings at the corner, with the theme tool embedded inline', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('account')).getByRole('button', { name: 'Open Account' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const settings = screen.getByRole('region', { name: 'Settings' })
    expect(within(settings).getByRole('button', { name: /Handedness/ })).toBeTruthy()
    expect(within(settings).getByText('Change theme by time of day')).toBeTruthy()
  })

  it('has Help text for a section at the corner', async () => {
    const user = userEvent.setup()
    render(<UUI />)
    await user.click(within(tile('training')).getByRole('button', { name: 'Open Training' }))
    await user.click(screen.getByRole('button', { name: 'Help' }))
    expect(within(screen.getByRole('region', { name: 'Help' })).getByText(/using the Training console/)).toBeTruthy()
  })
})
