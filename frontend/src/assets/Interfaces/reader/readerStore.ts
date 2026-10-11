import { useSyncExternalStore } from 'react'
import * as api from '../../../api/reader'
import type { BookCard, BookDetail, CatalogBook, ClubView, FeedItem, FlagClass, ReaderLevel, ReaderProfile, ReaderSettings, ReaderState, Recommendation, ReportKind, ReviewDraft } from '../../../api/reader'

// The Reader's data, shared by every console: the library's books, the reader's account (credits, holdings, wishlist, activity), the Display
// Case's recommendations, what is said about the books the reader has opened (cards and details), the clubs, the feed and the seeded readers.
// Each action answers with the new account, which replaces the old one.

export interface ReaderData {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  reader: ReaderState | null
  books: CatalogBook[]
  recommendations: Recommendation[]
  // By book id: what readers say, and the book's matter and planning.
  cards: Record<string, BookCard>
  details: Record<string, BookDetail>
  clubs: ClubView[]
  feed: FeedItem[]
  readers: ReaderProfile[]
}

const EMPTY: ReaderData = { status: 'idle', error: null, reader: null, books: [], recommendations: [], cards: {}, details: {}, clubs: [], feed: [], readers: [] }
let data: ReaderData = EMPTY
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function set(next: Partial<ReaderData>): void {
  data = { ...data, ...next }
  listeners.forEach(fn => fn())
}

export const subscribeReader = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const getReaderData = (): ReaderData => data

export function loadReader(force = false): Promise<void> {
  if (inflight) return inflight
  if (data.status === 'ready' && !force) return Promise.resolve()
  if (data.status !== 'ready') set({ status: 'loading', error: null })
  inflight = Promise.all([api.getReader(), api.getBooks({ limit: 200 }), api.getRecommendations(6), api.getClubs(), api.getFeed(), api.getReaders()])
    .then(([reader, page, recommendations, clubs, feed, readers]) => set({ status: 'ready', error: null, reader, books: page.books, recommendations, clubs, feed, readers }))
    .catch((e: unknown) => set({ status: 'error', error: e instanceof Error ? e.message : 'The library could not be loaded.' }))
    .finally(() => { inflight = null })
  return inflight
}

// A book's card and details, fetched when its page opens (and again after a review or a report changes them).
export async function loadBook(bookId: string, force = false): Promise<void> {
  if (!force && data.cards[bookId] && data.details[bookId]) return
  const [card, detail] = await Promise.all([api.getBookCard(bookId), api.getBookDetail(bookId)])
  set({ cards: { ...data.cards, [bookId]: card }, details: { ...data.details, [bookId]: detail } })
}

async function act(call: () => Promise<ReaderState>): Promise<ReaderState> {
  const reader = await call()
  set({ reader })
  // The Display Case follows what the reader holds and has read.
  void api.getRecommendations(6).then(recommendations => set({ recommendations })).catch(() => undefined)
  return reader
}

// A social action changes what the community shows: the clubs and the feed, and the cards of the books the reader has opened.
async function social(call: () => Promise<ReaderState>): Promise<ReaderState> {
  const reader = await act(call)
  void Promise.all([api.getClubs(), api.getFeed()]).then(([clubs, feed]) => set({ clubs, feed })).catch(() => undefined)
  Object.keys(data.cards).forEach(id => { void loadBook(id, true).catch(() => undefined) })
  return reader
}

export const readerActions = {
  setPlan: (extra: number) => act(() => api.putPlan(extra)),
  borrow: (bookId: string, credits: number) => act(() => api.postBorrow(bookId, credits)),
  buy: (bookId: string) => act(() => api.postBuy(bookId)),
  open: (holdingId: string) => act(() => api.postOpen(holdingId)),
  giveBack: (holdingId: string) => act(() => api.postReturn(holdingId)),
  extend: (holdingId: string) => act(() => api.postExtend(holdingId)),
  lend: (holdingId: string, to: string, months: number) => act(() => api.postLend(holdingId, to, months)),
  recall: (holdingId: string) => act(() => api.postRecall(holdingId)),
  progress: (bookId: string, pct: number, pages: number, minutes: number, newSession: boolean) => act(() => api.postProgress(bookId, pct, pages, minutes, newSession)),
  toggleWishlist: (bookId: string, on: boolean) => act(() => (on ? api.putWishlist(bookId) : api.deleteWishlist(bookId))),
  toggleToRead: (bookId: string, on: boolean) => act(() => (on ? api.putToRead(bookId) : api.deleteToRead(bookId))),
  setFlagClass: (key: string, flagClass: FlagClass) => act(() => api.putFlagClass(key, flagClass)),
  readNotifications: () => act(() => api.postNotificationsRead()),
  setLevel: (bookId: string, level: ReaderLevel | null) => act(() => api.putLevel(bookId, level)),
  setCriteria: (names: string[]) => act(() => api.putCriteria(names)),
  saveReview: (bookId: string, draft: ReviewDraft) => social(() => api.putReview(bookId, draft)),
  postReview: (bookId: string) => social(() => api.postReview(bookId)),
  startReread: (bookId: string) => social(() => api.postReread(bookId)),
  discardDraft: (bookId: string) => social(() => api.deleteReviewDraft(bookId)),
  addNote: (bookId: string, quote: string, note: string, extra: Omit<api.NoteInput, 'quote' | 'note'> = {}) => act(() => api.postNote(bookId, { quote, note, ...extra })),
  setSettings: (settings: ReaderSettings) => act(() => api.putSettings(settings)),
  addMyFlag: (name: string) => act(() => api.postMyFlag(name)),
  deleteMyFlag: (key: string) => act(() => api.deleteMyFlag(key)),
  recordReading: (bookId: string, update: api.ReadingUpdate) => act(() => api.putReading(bookId, update)),
  deleteNote: (id: string) => act(() => api.deleteNote(id)),
  follow: (whom: string, on: boolean) => social(() => (on ? api.putFollowing(whom) : api.deleteFollowing(whom))),
  joinClub: (id: string, on: boolean) => social(() => (on ? api.putMembership(id) : api.deleteMembership(id))),
  startClub: (name: string, description: string, bookId: string | null, meets: string) => social(() => api.postClub(name, description, bookId, meets)),
  deleteClub: (id: string) => social(() => api.deleteClub(id)),
  post: (clubId: string, text: string, spoiler: boolean, replyTo: string | null) => social(() => api.postClubPost(clubId, text, spoiler, replyTo)),
  deletePost: (id: string) => social(() => api.deletePost(id)),
  report: (kind: ReportKind, targetId: string, reason: string) => social(() => api.postReport(kind, targetId, reason)),
  undoReport: (id: string) => social(() => api.deleteReport(id)),
  block: (readerId: string, on: boolean) => social(() => (on ? api.putBlocked(readerId) : api.deleteBlocked(readerId))),
}

export function useReader(): ReaderData & { actions: typeof readerActions; reload: () => Promise<void>; bookById: (id: string) => CatalogBook | undefined } {
  const snapshot = useSyncExternalStore(subscribeReader, getReaderData, getReaderData)
  return {
    ...snapshot,
    actions: readerActions,
    reload: () => loadReader(true),
    bookById: (id: string) => snapshot.books.find(b => b.id === id),
  }
}

export function __resetReaderForTests(next: Partial<ReaderData> = {}): void {
  inflight = null
  data = { ...EMPTY, ...next }
  listeners.forEach(fn => fn())
}
