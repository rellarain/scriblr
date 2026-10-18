import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookFeedback, BookListing } from '../../../../api/bookPublishing'
import ReadersPanel from '../ReadersPanel'
import { FootnoteTool } from '../draft/FootnoteTool'
import type { WriterWorkspace } from '../useWriterWorkspace'
import BookPublish from './BookPublish'
import { makeWorkspace, type WorkspaceOverrides } from '../../../../test/makeWorkspace'

const META = { type: 'novel', blurb: '', genres: [], tags: [], tropes: [], flags: [], buyPriceCents: 900, coverHue: null } as BookListing['meta']
const FEEDBACK: BookFeedback = {
  bookId: 'local-p1-b1', listed: true, editions: 1, loans: 2, activeLoans: 1, sales: 1, loanShareCents: 500, saleShareCents: 630, readers: 1, rating: 9, ratings: 1,
  reviews: [{ id: 'mine', readerId: 'me', name: 'You', initials: 'Y', score: 9, criteria: {}, comment: 'Lovely.', spoilerEssay: '', reads: 1, at: '2026-10-11T00:00:00Z', edited: false, mine: true }],
  chapters: [{ n: 1, title: 'One', readers: 1, pleasant: 2, unpleasant: 1, top: [] }], invites: {},
}
const w = makeWorkspace({ activeBook: { id: 'b1' }, activeProjectId: 'p1' })

interface Call { method: string; url: string; body: unknown }
let calls: Call[]
let listing: BookListing

function stubFetch() {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data })
    if (url.endsWith('/listing/meta')) { listing = { ...listing, meta: body }; return json(listing) }
    if (url.endsWith('/listing')) return json(listing)
    if (url.endsWith('/publish')) { listing = { ...listing, listed: true, editions: [...listing.editions, { n: listing.editions.length + 1, publishedAt: '2026-10-11T00:00:00Z', wordCount: 1200, chapters: [{ chapterId: 'c1', n: 1, title: 'One', words: 1200 }] }] }; return json(listing) }
    if (url.endsWith('/unpublish')) { listing = { ...listing, listed: false }; return json(listing) }
    if (url.endsWith('/invites')) { listing = { ...listing, invites: body.invites }; return json(listing) }
    if (url.endsWith('/feedback')) return json(FEEDBACK)
    if (url === '/api/library/readers') return json([{ id: 'r-sol', name: 'Sol Marsh', initials: 'SM', bio: '' }])
    if (url === '/api/author/books') return json([{ projectId: 'p1', bookId: 'b1', title: 'My Book', listed: true, editions: 2, loans: 2, sales: 1, earningsCents: 1130, rating: 9, ratings: 1, reviews: 1 }])
    return json({})
  }))
}

beforeEach(() => { listing = { listed: false, editions: [], meta: META, invites: {} }; stubFetch() })
afterEach(() => { vi.unstubAllGlobals() })

describe('the Book level\'s Publish tab', () => {
  it('says the book is not published, and publishes edition 1 after asking', async () => {
    const user = userEvent.setup()
    render(<BookPublish w={w} />)
    expect(await screen.findByText('Not published')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish book' }))
    const ask = screen.getByRole('alertdialog', { name: 'Publish the book' })
    expect(within(ask).getByText('Publish edition 1?')).toBeTruthy()
    await user.click(within(ask).getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/books/b1/publish') && c.method === 'POST')).toBe(true))
    expect(await screen.findByText(/Yes, for sale and loan/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish book' }).textContent).toContain('Publish edition 2')
  })

  it('takes the book off the library only after the author confirms', async () => {
    const user = userEvent.setup()
    listing = { ...listing, listed: true, editions: [{ n: 1, publishedAt: '2026-10-11T00:00:00Z', wordCount: 10, chapters: [] }] }
    render(<BookPublish w={w} />)
    await user.click(await screen.findByRole('button', { name: 'Unpublish' }))
    expect(calls.some(c => c.url.endsWith('/unpublish'))).toBe(false)
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/unpublish') && c.method === 'POST')).toBe(true))
    expect(await screen.findByText('Unlisted')).toBeTruthy()
  })

  it('saves the details: type, blurb, genres, price and a content flag with its class', async () => {
    const user = userEvent.setup()
    render(<BookPublish w={w} />)
    await user.selectOptions(await screen.findByLabelText('Type'), 'novella')
    await user.type(screen.getByLabelText('Blurb'), 'A harbor.')
    await user.type(screen.getByLabelText('Genres'), 'Literary, Mystery')
    const price = screen.getByLabelText('Buy price')
    await user.clear(price)
    await user.type(price, '7')
    await user.click(screen.getByRole('button', { name: /Add a flag/ }))
    await user.type(screen.getByLabelText('Flag 1 name'), 'Grief')
    await user.selectOptions(screen.getByLabelText('Flag 1 default class'), 'spoiler')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(calls.find(c => c.url.endsWith('/listing/meta'))?.body).toMatchObject({
      type: 'novella', blurb: 'A harbor.', genres: ['Literary', 'Mystery'], buyPriceCents: 700, flags: [{ name: 'Grief', defaultClass: 'spoiler' }],
    }))
  })

  it('invites this reader account and a seeded reader at a level', async () => {
    const user = userEvent.setup()
    render(<BookPublish w={w} />)
    await user.selectOptions(await screen.findByLabelText('Invite You (this reader account)'), 'delta')
    await waitFor(() => expect(calls.find(c => c.url.endsWith('/invites'))?.body).toEqual({ invites: { me: 'delta' } }))
    await user.selectOptions(screen.getByLabelText('Invite Sol Marsh'), 'alpha')
    await waitFor(() => expect(calls.filter(c => c.url.endsWith('/invites')).pop()?.body).toEqual({ invites: { me: 'delta', 'r-sol': 'alpha' } }))
  })

  it('shows loans, sales, the author\'s share, the reviews and the reactions by chapter', async () => {
    render(<BookPublish w={w} />)
    expect(await screen.findByText('2 (1 active)')).toBeTruthy()
    expect(screen.getByText('$5.00')).toBeTruthy() // the share of loans
    expect(screen.getByText('$6.30')).toBeTruthy() // the share of sales
    expect(screen.getByText('$11.30')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Reviews' })).getByText(/Lovely/)).toBeTruthy()
    expect(screen.getByText('2 pleasant · 1 unpleasant')).toBeTruthy()
  })
})

describe('the Dash\'s Readers tab', () => {
  it('lists each published book with its loans, sales and earnings', async () => {
    render(<ReadersPanel />)
    const list = await screen.findByRole('list', { name: 'Published books' })
    expect(within(list).getByText('My Book')).toBeTruthy()
    expect(within(list).getByText(/2 loans · 1 sales · \$11\.30 · 9\.0 of 10 · 1 review/)).toBeTruthy()
  })
})

describe('the Preview\'s Footnote tool', () => {
  const none = { footnotes: [], flags: [] }
  it('adds a footnote on the selected sentence, counted from 0 in the chapter', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<FootnoteTool at={{ paragraph: 2, sentence: 1 }} notes={none} flags={[]} onSave={onSave} />)
    expect(screen.getByText('On paragraph 3, sentence 2')).toBeTruthy()
    await user.type(screen.getByLabelText('Footnote title'), 'The weir')
    await user.type(screen.getByLabelText('Footnote text'), 'A low dam.')
    await user.click(screen.getByRole('button', { name: /Add footnote/ }))
    expect(onSave).toHaveBeenCalledWith({ footnotes: [expect.objectContaining({ paragraph: 2, sentence: 1, title: 'The weir', text: 'A low dam.', published: true })], flags: [] })
  })

  it('needs a sentence first, and flags a passage with one of the book\'s content flags', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const flags = [{ key: 'grief', name: 'Grief', detail: '', defaultClass: 'marked' as const }]
    const { rerender } = render(<FootnoteTool at={null} notes={none} flags={flags} onSave={onSave} />)
    expect(screen.getByText('Click a sentence first')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add footnote/ }).hasAttribute('disabled')).toBe(true)
    rerender(<FootnoteTool at={{ paragraph: 0, sentence: 0 }} notes={none} flags={flags} onSave={onSave} />)
    await user.selectOptions(screen.getByLabelText('Flag this passage'), 'grief')
    expect(onSave).toHaveBeenCalledWith({ footnotes: [], flags: [expect.objectContaining({ paragraph: 0, sentence: 0, flagKey: 'grief' })] })
  })

  it('unpublishes and deletes a footnote', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const notes = { footnotes: [{ id: 'f1', paragraph: 0, sentence: 0, title: 'Note', text: '', published: true }], flags: [] }
    render(<FootnoteTool at={null} notes={notes} flags={[]} onSave={onSave} />)
    await user.click(screen.getByRole('checkbox', { name: 'Published' }))
    expect(onSave).toHaveBeenLastCalledWith({ footnotes: [expect.objectContaining({ id: 'f1', published: false })], flags: [] })
    await user.click(screen.getByRole('button', { name: 'Delete footnote Note' }))
    expect(onSave).toHaveBeenLastCalledWith({ footnotes: [], flags: [] })
  })
})
