import type { BookCard, BookDetail, BookText, CatalogBook, ChapterText, ClubView, FeedItem, Holding, Mark, ReactionTotals, ReaderLevel, ReaderProfile, ReaderState, Recommendation } from '../api/reader'

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
    levels: { 'sit-amet': { level: 'delta', invitedBy: 'Lorem Ipsum', override: false } },
    criteriaNames: ['Plot', 'Prose', 'Characters', 'Pacing'],
    reviews: [{ bookId: 'adipiscing', reads: [{ n: 1, status: 'posted', score: 9, criteria: { Plot: 9, Prose: 10 }, comment: 'Lorem ipsum dolor sit amet.', spoilerEssay: '', noteIds: [], startedAt: iso(30), postedAt: iso(20), editedAt: null }] }],
    notes: [{ id: 'n1', bookId: 'lorem-ipsum', quote: 'Ut enim ad minim veniam.', note: 'Remember this.', at: iso(3), kind: 'note', chapter: 3, key: 'c3:p1:s0' }],
    following: ['r-sol'], joinedClubs: ['slow-burners'], reports: [], blocked: [],
    settings: { mode: 'turn', textSize: 18, font: 'serif', spacing: 'roomy', margins: 'narrow', tone: 'day', highContrast: false, focus: false, shareReactions: true, readAloudRate: 1 }, myFlags: [{ key: 'flag-simplify', name: 'Simplify' }], positions: { 'lorem-ipsum': { chapter: 3, paragraph: 0, device: 'This computer', at: iso(1) } },
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

// The Book page's community, for the previews.

export const READERS: ReaderProfile[] = [
  { id: 'r-sol', name: 'Sol Marsh', initials: 'SM', bio: 'Reads on the night bus.' },
  { id: 'r-rue', name: 'Rue Tanner', initials: 'RT', bio: 'Slow burns and long series.' },
  { id: 'r-jun', name: 'Jun Okafor', initials: 'JO', bio: 'Essays before breakfast.' },
]

export function bookCardFixture(bookId: string): BookCard {
  const at = (days: number) => iso(days)
  return {
    bookId, rating: 8.8, ratings: 1208,
    criteria: [{ name: 'Plot', average: 8.5, count: 3 }, { name: 'Prose', average: 9.0, count: 3 }, { name: 'Characters', average: 8.0, count: 3 }, { name: 'Pacing', average: 7.5, count: 3 }],
    reviews: [
      { id: `seed-${bookId}-0`, readerId: 'r-sol', name: 'Sol Marsh', initials: 'SM', score: 9, criteria: { Plot: 9, Prose: 9 }, comment: LOREM[0], spoilerEssay: LOREM[1], reads: 2, at: at(4), edited: false, mine: false },
      { id: `seed-${bookId}-1`, readerId: 'r-rue', name: 'Rue Tanner', initials: 'RT', score: 8, criteria: { Plot: 8, Prose: 9 }, comment: LOREM[2], spoilerEssay: '', reads: 1, at: at(9), edited: false, mine: false },
      { id: `seed-${bookId}-2`, readerId: 'r-jun', name: 'Jun Okafor', initials: 'JO', score: 10, criteria: { Plot: 9, Prose: 10 }, comment: LOREM[1], spoilerEssay: '', reads: 1, at: at(13), edited: false, mine: false },
    ],
  }
}

export function bookDetailFixture(bookId: string): BookDetail {
  const titles = ['The harbor at dawn', 'Two sets of books', 'The ledger of tides', 'A name painted over', 'A first winter', 'Salt on the page', 'What the weir keeps', 'The third lamp', 'The early tide', 'A debt in rope', 'Fog for a week']
  return {
    bookId,
    authorNote: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. The ledgers are invented; the early tides are not.',
    contents: titles.map((title, i) => ({ n: i + 1, title, words: 7272 })),
    glossary: [{ title: 'Weir', meta: 'A low dam that raises the river.', indent: 0 }, { title: 'Ledger', meta: 'The book of what is owed.', indent: 0 }, { title: 'Quay', meta: 'The stone wharf.', indent: 0 }],
    bibliography: ['Lorem Ipsum. A Small History of Tides. Dolor Press, 1998.', 'Sit Amet. Harbors of the North. Consectetur, 2007.'],
    index: ['harbor master 3, 7', 'ledger 1, 3, 9', 'tide 3, 4, 11'],
    appendix: ['A. Tide table', 'B. Map of the quay', 'C. Reading list'],
    planning: {
      outline: [{ title: 'Act 1', meta: '4 chapters', indent: 0 }, { title: 'Chapter 1: The harbor at dawn', meta: '7,272 words', indent: 18 }, { title: 'Chapter 2: Two sets of books', meta: '7,272 words', indent: 18 }],
      plot: [{ title: 'A secret is shared', meta: 'Placed on chapter 3', indent: 0 }, { title: 'The first lie is found', meta: 'Placed on chapter 5', indent: 0 }],
      plotPath: 'Romance › Slow Burn', goalWords: 80000, wordsNow: 47000, chaptersOutlined: 5, chaptersTotal: 11, publishTarget: 'First edition, spring',
      revisions: [{ title: 'Tighten the fog paragraph', meta: 'Chapter 3 · Oct 6 · -42 words, +58 words', indent: 0 }],
    },
    stats: { readingNow: 312, averageMinutes: 320, finishPercent: 71, leaveBars: [26, 22, 19, 15, 12, 9, 7, 5], clubs: 1 },
  }
}

export function clubsFixture(): ClubView[] {
  const club = (id: string, name: string, bookId: string, meets: string, members: string[]) => ({ id, name, description: 'Reads a book in bites and meets to talk it through.', bookId, meets, nextMeetingAt: new Date(Date.now() + 4 * 86_400_000).toISOString(), members, mine: false })
  return [
    { club: club('slow-burners', 'Slow Burners', 'lorem-ipsum', 'Sundays: chapters 3 and 4', ['r-rue', 'r-sol']), joined: true, memberCount: 3, posts: [
      { id: 'p1', clubId: 'slow-burners', authorId: 'r-rue', text: 'Nothing happens for forty pages and I did not want it to stop.', at: iso(3), spoiler: false, replyTo: null },
      { id: 'p2', clubId: 'slow-burners', authorId: 'r-sol', text: 'The painted name comes back in chapter nine.', at: iso(1), spoiler: true, replyTo: null },
    ] },
    { club: club('rope-readers', 'Rope Readers', 'tempor', 'Thursdays: chapters 5 and 6', ['r-sol', 'r-jun']), joined: false, memberCount: 2, posts: [] },
  ]
}

export function feedFixture(): FeedItem[] {
  return [
    { id: 'f1', at: iso(0), kind: 'finished', who: 'Sol Marsh', whoId: 'r-sol', title: 'Sol Marsh finished Tempor incididunt', detail: '4 stars', bookId: 'tempor' },
    { id: 'f2', at: iso(1), kind: 'club', who: 'Slow Burners', whoId: 'slow-burners', title: 'Slow Burners: Sundays: chapters 3 and 4', detail: 'Next meeting soon', bookId: 'lorem-ipsum' },
  ]
}

// The e-reader's text, for the previews: lorem-ipsum chapters of eight paragraphs, a footnote and flagged passages on fixed sentences.

const SENTENCES = [
  'The harbor woke before the town did, and the tide arrived early again.',
  'Rue counted the boats twice, because the ledger would count them only once.',
  'Nobody in the quay office asked why the second set of books was kept in a drawer of salt.',
  'A gull stood on the weir as if it were waiting to be paid.',
  'She wrote the date at the top of the page and then crossed it out.',
  'Fog came in low, took the far wall, and gave it back an hour later.',
]
const TITLES = ['The harbor at dawn', 'Two sets of books', 'The ledger of tides', 'A name painted over', 'A first winter', 'Salt on the page', 'What the weir keeps', 'The third lamp', 'The early tide', 'A debt in rope', 'Fog for a week']

export function bookTextFixture(bookId: string, level: ReaderLevel = 'omega'): BookText {
  const open = level === 'delta' ? 7 : level === 'beta' ? 9 : 11
  return { bookId, level, canRead: true, reason: '', chapters: TITLES.map((title, i) => ({ n: i + 1, title, words: 7272, available: i + 1 <= open, reason: i + 1 <= open ? '' : 'Not published yet at your level.' })) }
}

export function chapterFixture(bookId: string, n: number, level: ReaderLevel = 'omega'): ChapterText {
  const paragraphs = Array.from({ length: 9 }, (_, p) => Array.from({ length: 4 }, (_, s) => SENTENCES[(p + s + n) % SENTENCES.length]).join(' '))
  return {
    bookId, n, title: TITLES[n - 1] ?? `Chapter ${n}`, words: 7272, paragraphs,
    footnotes: [{ id: `fn-${n}`, key: `c${n}:p1:s1`, title: 'The early tide', text: 'In autumn the river weir makes the tide arrive early.' }],
    flags: [
      { key: `c${n}:p2:s0`, flagKey: 'grief', name: 'Lorem', detail: 'Lorem ipsum dolor sit amet.', defaultClass: 'marked' },
      { key: `c${n}:p4:s0`, flagKey: 'ending', name: 'Consectetur', detail: 'Lorem ipsum spoiler.', defaultClass: 'spoiler' },
    ],
    level, draft: level === 'alpha' || level === 'delta', draftNote: level === 'delta' || level === 'alpha' ? 'Work in progress: this chapter is a draft and may change before the first edition.' : '',
  }
}

export const marksFixture = (): Record<string, Mark> => ({
  'c3:p0:s1': { like: 3, dislike: 0, flags: [] },
  'c3:p1:s0': { like: 1, dislike: 0, flags: [] },
  'c3:p3:s2': { like: 0, dislike: 2, flags: [] },
  'c3:p5:s0': { like: 0, dislike: 0, flags: ['flag-simplify'] },
})

export const reactionsFixture = (n: number): ReactionTotals => ({
  chapter: n, readers: 312, pleasant: 148, unpleasant: 41, mine: 3,
  top: [{ key: `c${n}:p1:s2`, pleasant: 22, unpleasant: 1 }, { key: `c${n}:p4:s1`, pleasant: 14, unpleasant: 6 }],
})
