import { useSyncExternalStore } from 'react'
import * as api from '../../../api/reader'
import type { CatalogBook, FlagClass, ReaderState, Recommendation } from '../../../api/reader'

// The Reader's data, shared by every console: the library's books, the reader's account (credits, holdings, wishlist, activity) and the
// Display Case's recommendations. Each action answers with the new account, which replaces the old one.

export interface ReaderData {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  reader: ReaderState | null
  books: CatalogBook[]
  recommendations: Recommendation[]
}

const EMPTY: ReaderData = { status: 'idle', error: null, reader: null, books: [], recommendations: [] }
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
  inflight = Promise.all([api.getReader(), api.getBooks({ limit: 200 }), api.getRecommendations(6)])
    .then(([reader, page, recommendations]) => set({ status: 'ready', error: null, reader, books: page.books, recommendations }))
    .catch((e: unknown) => set({ status: 'error', error: e instanceof Error ? e.message : 'The library could not be loaded.' }))
    .finally(() => { inflight = null })
  return inflight
}

async function act(call: () => Promise<ReaderState>): Promise<ReaderState> {
  const reader = await call()
  set({ reader })
  // The Display Case follows what the reader holds and has read.
  void api.getRecommendations(6).then(recommendations => set({ recommendations })).catch(() => undefined)
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
