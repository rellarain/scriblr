import type { CatalogBook, Holding, ReaderState, Recommendation } from '../api/reader'

// The Reader's pretend library for the design system's previews: lorem ipsum titles and blurbs, a stack of owned, borrowed and lent books, and a
// year of reading for the activity calendar (relative to today, so the calendar always has a recent week).

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla.',
]

const book = (id: string, title: string, authorId: string, authorName: string, over: Partial<CatalogBook> = {}): CatalogBook => ({
  id, title, authorId, authorName, type: 'novel', genres: ['Literary'], tags: [], tropes: ['Slow burn'], flags: [], wordCount: 80000, rating: 8.4, ratings: 600, readers: 600, popularity: 1200,
  series: null, hue: 28, blurb: LOREM[id.length % LOREM.length], buyPriceCents: 900, editions: 1, publishedAt: '2026-03-04', source: 'seed', projectId: null, bookId: null, ...over,
})

export const READER_BOOKS: CatalogBook[] = [
  book('lorem-ipsum', 'Lorem ipsum dolor', 'a1', 'Lorem Ipsum', { hue: 28, wordCount: 80000, rating: 8.8, ratings: 1208, readers: 1402, popularity: 2610, flags: [{ key: 'grief', name: 'Lorem', detail: 'Lorem ipsum dolor sit amet.', defaultClass: 'marked' }, { key: 'ending', name: 'Consectetur', detail: 'Lorem ipsum spoiler.', defaultClass: 'spoiler' }] }),
  book('sit-amet', 'Sit amet', 'a1', 'Lorem Ipsum', { hue: 330, wordCount: 60000, series: { id: 'ser', title: 'Dolor series', order: 1 } }),
  book('consectetur', 'Consectetur', 'a1', 'Lorem Ipsum', { hue: 10, wordCount: 120000, rating: 9.2, series: { id: 'ser', title: 'Dolor series', order: 2 } }),
  book('adipiscing', 'Adipiscing elit', 'a2', 'Sed Eiusmod', { hue: 210, type: 'essays', genres: ['Essays'], wordCount: 42000, rating: 9.4, tropes: [] }),
  book('tempor', 'Tempor incididunt', 'a3', 'Ut Labore', { hue: 270, wordCount: 96000, genres: ['Mystery'], tropes: ['Locked room'] }),
  book('magna', 'Magna aliqua', 'a4', 'Quis Nostrud', { hue: 150, type: 'magazine', genres: ['Science'], wordCount: 18000, tropes: [] }),
  book('veniam', 'Ut enim ad minim', 'a2', 'Sed Eiusmod', { hue: 12, wordCount: 88000, genres: ['Mystery'], tropes: ['Found family'] }),
  book('exercitation', 'Exercitation ullamco', 'a5', 'Duis Aute', { hue: 35, type: 'article', genres: ['History'], wordCount: 6000, tropes: [] }),
  book('laboris', 'Laboris nisi', 'a3', 'Ut Labore', { hue: 160, wordCount: 105000, rating: 8.0 }),
  book('aliquip', 'Aliquip ex ea', 'a5', 'Duis Aute', { hue: 300, type: 'novella', genres: ['Fantasy'], wordCount: 34000, tropes: ['Chosen one'] }),
]

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
const day = (daysAgo: number) => iso(daysAgo).slice(0, 10)

function activity(): ReaderState['activity'] {
  const out: ReaderState['activity'] = {}
  for (let d = 0; d < 365; d += 1) {
    const r = Math.abs(Math.sin(d * 12.9898 + 78.233)) % 1
    const season = 0.55 + 0.25 * Math.sin(d / 23)
    if (r < season * 0.8 || d < 6) {
      const pages = Math.round(8 + (Math.abs(Math.sin(d * 4.1414)) % 1) * 60)
      out[day(d)] = { pages, minutes: Math.round(pages * 1.6), sessions: 1 + (d % 3 === 0 ? 1 : 0) }
    }
  }
  return out
}

const holding = (id: string, bookId: string, over: Partial<Holding>): Holding => ({
  id, bookId, kind: 'owned', status: 'active', startedAt: iso(40), dueAt: null, endedAt: null, credits: 0, opened: true, openedAt: iso(39), lentTo: null, lentUntil: null, ...over,
})

export function readerFixture(): ReaderState {
  return {
    plan: { extraCredits: 3 }, planPriceCents: 1200, creditsPerMonth: 4, balance: 5,
    ledger: [
      { id: 'l5', at: iso(1), kind: 'borrow', delta: -2, note: 'Borrowed 2 months', bookId: 'sit-amet', holdingId: 'h2' },
      { id: 'l4', at: iso(9), kind: 'refund', delta: 1, note: 'Returned in 9 days with 30% read: credits returned', bookId: 'tempor', holdingId: 'h9' },
      { id: 'l3', at: iso(20), kind: 'borrow', delta: -1, note: 'Borrowed 1 month', bookId: 'tempor', holdingId: 'h9' },
      { id: 'l2', at: iso(32), kind: 'grant', delta: 4, note: 'Monthly credits for last month', bookId: null, holdingId: null },
      { id: 'l1', at: iso(2), kind: 'grant', delta: 4, note: 'Monthly credits for this month', bookId: null, holdingId: null },
    ],
    holdings: [
      holding('h1', 'lorem-ipsum', { kind: 'owned' }),
      holding('h2', 'sit-amet', { kind: 'borrowed', credits: 2, startedAt: iso(1), dueAt: new Date(Date.now() + 59 * 86_400_000).toISOString(), opened: true }),
      holding('h3', 'adipiscing', { kind: 'owned', lentTo: 'Lorem', lentUntil: new Date(Date.now() + 20 * 86_400_000).toISOString() }),
      holding('h4', 'magna', { kind: 'borrowed', credits: 1, startedAt: iso(26), dueAt: new Date(Date.now() + 4 * 86_400_000).toISOString() }),
    ],
    toRead: ['aliquip'], wishlist: ['consectetur'],
    progress: {
      'lorem-ipsum': { pct: 62, pages: 250, updatedAt: iso(1), finishedAt: null },
      'sit-amet': { pct: 40, pages: 140, updatedAt: iso(1), finishedAt: null },
      adipiscing: { pct: 100, pages: 180, updatedAt: iso(20), finishedAt: iso(20) },
      magna: { pct: 85, pages: 60, updatedAt: iso(2), finishedAt: null },
    },
    activity: activity(), flagClasses: {},
    notifications: [{ id: 'due-h4', at: iso(0), kind: 'due', title: 'A borrowed book is due soon', detail: 'magna', read: false }],
  }
}

export function recommendationsFixture(): Recommendation[] {
  const pick = (id: string, match: number, why: string[]): Recommendation => ({ book: READER_BOOKS.find(b => b.id === id)!, match, why })
  return [
    pick('consectetur', 93, ['The next book of Dolor series, which you are reading.', 'Shares the tropes Slow burn with what you read.']),
    pick('veniam', 81, ['More by Sed Eiusmod, whose book you read.', 'Readers rate it 8.4 of 10.']),
    pick('aliquip', 72, ['It is on your to-read list.']),
  ]
}
