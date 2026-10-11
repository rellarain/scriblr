import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookCard, BookDetail, CatalogBook, ClubView, ReaderState } from '../../api/reader'
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
  holdings: [], toRead: [], wishlist: [], progress: {}, activity: {}, flagClasses: {}, notifications: [], levels: {}, criteriaNames: ['Plot', 'Prose'], reviews: [], notes: [], following: [], joinedClubs: [], reports: [], blocked: [], ...over,
})

const CARD: BookCard = {
  bookId: 'cold-harbor', rating: 8.8, ratings: 1208,
  criteria: [{ name: 'Plot', average: 8.5, count: 3 }],
  reviews: [
    { id: 'seed-cold-harbor-0', readerId: 'r-sol', name: 'Sol Marsh', initials: 'SM', score: 9, criteria: { Plot: 9 }, comment: 'A quiet, exact book.', spoilerEssay: 'The ledgers were the plot.', reads: 2, at: '2026-10-05T00:00:00Z', edited: false, mine: false },
    { id: 'seed-cold-harbor-1', readerId: 'r-rue', name: 'Rue Tanner', initials: 'RT', score: 7, criteria: {}, comment: 'Slow but worth it.', spoilerEssay: '', reads: 1, at: '2026-10-01T00:00:00Z', edited: false, mine: false },
  ],
}
const DETAIL: BookDetail = {
  bookId: 'cold-harbor', authorNote: 'I wrote this by a harbor.',
  contents: [{ n: 1, title: 'The harbor at dawn', words: 7000 }, { n: 2, title: 'Two sets of books', words: 7000 }],
  glossary: [{ title: 'Weir', meta: 'A low dam.', indent: 0 }], bibliography: ['A source.'], index: ['tide 3'], appendix: ['A. Tide table'],
  planning: { outline: [{ title: 'Act 1', meta: '4 chapters', indent: 0 }], plot: [{ title: 'A secret is shared', meta: 'Placed on chapter 3', indent: 0 }], plotPath: 'Romance', goalWords: 80000, wordsNow: 47000, chaptersOutlined: 5, chaptersTotal: 11, publishTarget: 'Spring', revisions: [{ title: 'Tighten the fog', meta: 'Chapter 3', indent: 0 }] },
  stats: { readingNow: 312, averageMinutes: 320, finishPercent: 71, leaveBars: [20, 18, 15, 12, 10, 8, 6, 4], clubs: 1 },
}
const CLUBS: ClubView[] = [{
  club: { id: 'slow-burners', name: 'Slow Burners', description: 'Quiet novels.', bookId: 'cold-harbor', meets: 'Sundays', nextMeetingAt: '2026-10-18T19:00:00Z', members: ['r-rue'], mine: false },
  joined: false, memberCount: 1,
  posts: [{ id: 'p1', clubId: 'slow-burners', authorId: 'r-rue', text: 'Nothing happens, beautifully.', at: '2026-10-09T00:00:00Z', spoiler: false, replyTo: null }],
}]

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
    if (url === '/api/library/readers') return json([{ id: 'r-rue', name: 'Rue Tanner', initials: 'RT', bio: '' }, { id: 'r-sol', name: 'Sol Marsh', initials: 'SM', bio: '' }])
    if (url.endsWith('/detail')) return json(DETAIL)
    if (url === '/api/reader/books/cold-harbor/card') return json(CARD)
    if (url === '/api/reader/clubs' && method === 'GET') return json(CLUBS)
    if (url === '/api/reader/feed') return json([])
    if (url.startsWith('/api/reader/levels/')) {
      reader = state({ ...reader, levels: body.level ? { [url.split('/').pop() as string]: { level: body.level, invitedBy: null, override: true } } : {} })
      return json(reader)
    }
    if (url === '/api/reader/following/r-sol' && method === 'PUT') { reader = state({ ...reader, following: ['r-sol'] }); return json(reader) }
    if (url === '/api/reader/clubs/slow-burners/membership' && method === 'PUT') { reader = state({ ...reader, joinedClubs: ['slow-burners'] }); CLUBS[0] = { ...CLUBS[0], joined: true, memberCount: 2 }; return json(reader) }
    if (url === '/api/reader/clubs/slow-burners/posts') { CLUBS[0] = { ...CLUBS[0], posts: [...CLUBS[0].posts, { id: 'mine1', clubId: 'slow-burners', authorId: 'me', text: body.text, at: '2026-10-11T00:00:00Z', spoiler: body.spoiler, replyTo: body.replyTo }] }; return json(reader) }
    if (url === '/api/reader/reports' && method === 'POST') { reader = state({ ...reader, reports: [{ id: 'rep1', kind: body.kind, targetId: body.targetId, reason: body.reason, at: '2026-10-11T00:00:00Z' }] }); return json(reader) }
    if (url === '/api/reader/reviews/cold-harbor' && method === 'PUT') {
      const read = { n: 1, status: 'draft' as const, score: body.score, criteria: body.criteria, comment: body.comment, spoilerEssay: body.spoilerEssay, noteIds: body.noteIds, startedAt: '2026-10-11T00:00:00Z', postedAt: null, editedAt: null }
      reader = state({ ...reader, reviews: [{ bookId: 'cold-harbor', reads: [read] }] })
      return json(reader)
    }
    if (url === '/api/reader/reviews/cold-harbor/post') {
      reader = state({ ...reader, reviews: reader.reviews.map(r => ({ ...r, reads: r.reads.map(x => ({ ...x, status: 'posted' as const, postedAt: '2026-10-11T01:00:00Z' })) })) })
      return json(reader)
    }
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
  CLUBS[0] = { ...CLUBS[0], joined: false, memberCount: 1, posts: CLUBS[0].posts.slice(0, 1) }
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

  it('shows the level the author invited the reader to, and a free read for an alpha or delta invitation', async () => {
    reader = state({ levels: { 'cold-harbor': { level: 'delta', invitedBy: 'Mara Quill', override: false } } })
    open('/read/book/cold-harbor')
    expect(await screen.findByText('Reading as Delta')).toBeTruthy()
    expect(screen.getAllByText(/invited by Mara Quill/).length).toBe(2) // the badge and the free chip
    expect(screen.queryByRole('button', { name: /Borrow · 1 credit/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Start reading/ })).toBeTruthy()
  })

  it('gives an alpha reader the read-only planning consoles', async () => {
    reader = state({ levels: { 'cold-harbor': { level: 'alpha', invitedBy: 'Mara Quill', override: false } } })
    open('/read/book/cold-harbor')
    const bar = await screen.findByRole('toolbar', { name: /consoles/ })
    for (const name of ['Outline', 'Plot', 'Plan', 'Revisions']) expect(within(bar).getByRole('button', { name })).toBeTruthy()
  })

  it('has the five book consoles and no planning consoles at the final edition', async () => {
    open('/read/book/cold-harbor')
    const bar = await screen.findByRole('toolbar', { name: /consoles/ })
    for (const name of ['Bookcover', 'Bookface', 'Bookcard', 'Frontmatter', 'Backmatter']) expect(within(bar).getByRole('button', { name })).toBeTruthy()
    expect(within(bar).queryByRole('button', { name: 'Outline' })).toBeNull()
  })

  it('switches the level to try every state, from the full Bookcover', async () => {
    const user = userEvent.setup()
    open('/read/book/cold-harbor/cover')
    const group = await screen.findByRole('group', { name: 'Read this book as' })
    await user.click(within(group).getByRole('button', { name: 'Beta' }))
    await waitFor(() => expect(calls.find(c => c.url === '/api/reader/levels/cold-harbor')?.body).toEqual({ level: 'beta' }))
    expect(await screen.findByText('Reading as Beta')).toBeTruthy()
  })

  it('shows what readers say and hides a review the reader reports', async () => {
    const user = userEvent.setup()
    open('/read/book/cold-harbor/card')
    const list = await screen.findByRole('list', { name: 'Reviews' })
    expect(within(list).getByText('Sol Marsh')).toBeTruthy()
    expect(within(list).getByText('Read 2 times')).toBeTruthy()
    expect(screen.getByText('8.8')).toBeTruthy()
    await user.click(within(list).getByRole('button', { name: /Hide or report the review by Sol Marsh/ }))
    await user.click(within(list).getByRole('button', { name: 'Spoiler' }))
    await waitFor(() => expect(calls.find(c => c.url === '/api/reader/reports')?.body).toEqual({ kind: 'review', targetId: 'seed-cold-harbor-0', reason: 'spoiler' }))
    await waitFor(() => expect(screen.queryByText('Sol Marsh')).toBeNull())
    expect(await screen.findByText(/1 hidden by you/)).toBeTruthy()
  })

  it('keeps a spoiler essay shut until it is tapped, and drops it when spoilers are hidden', async () => {
    const user = userEvent.setup()
    open('/read/book/cold-harbor/card')
    await screen.findByRole('list', { name: 'Reviews' })
    expect(screen.queryByText('The ledgers were the plot.')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Spoiler essay · tap to reveal/ }))
    expect(screen.getByText('The ledgers were the plot.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Hide spoilers' }))
    expect(screen.queryByText('The ledgers were the plot.')).toBeNull()
    expect(screen.queryByRole('button', { name: /Spoiler essay/ })).toBeNull()
  })

  it('follows a reviewer from the Bookcard', async () => {
    const user = userEvent.setup()
    open('/read/book/cold-harbor/card')
    await user.click(await screen.findByRole('button', { name: 'Follow Sol Marsh' }))
    await waitFor(() => expect(calls.some(c => c.url === '/api/reader/following/r-sol' && c.method === 'PUT')).toBe(true))
    expect(await screen.findByRole('button', { name: 'Unfollow Sol Marsh' })).toBeTruthy()
  })

  it('joins a club in Bookface and posts in its thread, with a spoiler marked', async () => {
    const user = userEvent.setup()
    open('/read/book/cold-harbor/face')
    expect(await screen.findByText('312')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Join Slow Burners' }))
    await waitFor(() => expect(calls.some(c => c.url === '/api/reader/clubs/slow-burners/membership' && c.method === 'PUT')).toBe(true))
    await user.click(await screen.findByRole('button', { name: 'Slow Burners' }))
    expect(await screen.findByText('Nothing happens, beautifully.')).toBeTruthy()
    await user.type(screen.getByLabelText('Write a post'), 'Chapter 4 surprised me.')
    await user.click(screen.getByRole('checkbox', { name: 'Contains spoilers' }))
    await user.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(calls.find(c => c.url === '/api/reader/clubs/slow-burners/posts')?.body).toEqual({ text: 'Chapter 4 surprised me.', spoiler: true, replyTo: null }))
    expect(await screen.findByRole('button', { name: /Spoiler post · tap to reveal/ })).toBeTruthy()
  })

  it('autosaves a review draft and posts it from the paper', async () => {
    const user = userEvent.setup()
    open('/read/book/cold-harbor/card')
    await user.click(await screen.findByRole('button', { name: /Open full review/ }))
    const dialog = await screen.findByRole('dialog', { name: /Review · Cold Harbor/ })
    expect(within(dialog).getByRole('tab', { name: 'First read' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: /Start a re-read/ }).hasAttribute('disabled')).toBe(true)
    expect(within(dialog).getByRole('button', { name: /Post review/ }).hasAttribute('disabled')).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: '9' }))
    await user.type(within(dialog).getByPlaceholderText(/What stayed with you/), 'Exact and quiet.')
    await waitFor(() => expect(calls.filter(c => c.url === '/api/reader/reviews/cold-harbor' && c.method === 'PUT').length).toBeGreaterThan(0), { timeout: 3000 })
    await user.click(within(dialog).getByRole('button', { name: /Post review/ }))
    await waitFor(() => expect(calls.some(c => c.url === '/api/reader/reviews/cold-harbor/post')).toBe(true))
    const saved = calls.filter(c => c.url === '/api/reader/reviews/cold-harbor' && c.method === 'PUT').pop()?.body as { score: number; comment: string }
    expect(saved.score).toBe(9)
    expect(saved.comment).toBe('Exact and quiet.')
    expect(await within(dialog).findByText('Posted, public')).toBeTruthy()
  })

  it('shows the edge tabs of a book, with the chapter reached raised', async () => {
    open('/read/book/cold-harbor')
    const tabs = await screen.findByRole('navigation', { name: 'Chapters' })
    expect(within(tabs).getAllByRole('button')).toHaveLength(2)
    expect(within(tabs).getByRole('button', { name: /Chapter 1/ }).getAttribute('aria-current')).toBe('true')
  })

  it('says so when a book is not in the library', async () => {
    open('/read/book/nope')
    expect(await screen.findByText(/not in the library/)).toBeTruthy()
  })
})
