import { api } from './client'

// The Reader's library and account (backend: storage/reader_schema.py, api/library.py, api/reader.py). Money and lending are simulated.

export type BookType = 'novel' | 'novella' | 'essays' | 'magazine' | 'article'
export type FlagClass = 'hidden' | 'marked' | 'highlight' | 'spoiler'

export interface AuthorFlag { key: string; name: string; detail: string; defaultClass: FlagClass }
export interface SeriesRef { id: string; title: string; order: number }

export interface CatalogBook {
  id: string
  title: string
  authorId: string
  authorName: string
  type: BookType
  genres: string[]
  tags: string[]
  tropes: string[]
  flags: AuthorFlag[]
  wordCount: number
  rating: number
  ratings: number
  readers: number
  popularity: number
  series: SeriesRef | null
  hue: number
  blurb: string
  buyPriceCents: number
  editions: number
  publishedAt: string | null
  source: 'seed' | 'local'
  projectId: string | null
  bookId: string | null
}

export interface BookPage { total: number; books: CatalogBook[] }
export interface Author { id: string; name: string; bio: string; books: number; readers: number }
export interface AuthorDetail { author: Author; books: CatalogBook[] }
export interface Recommendation { book: CatalogBook; match: number; why: string[] }

export interface Plan { extraCredits: number }
export interface LedgerEntry { id: string; at: string; kind: 'grant' | 'borrow' | 'extend' | 'refund'; delta: number; note: string; bookId: string | null; holdingId: string | null }
export interface Holding {
  id: string
  bookId: string
  kind: 'owned' | 'borrowed'
  status: 'active' | 'returned' | 'cancelled'
  startedAt: string
  dueAt: string | null
  endedAt: string | null
  credits: number
  opened: boolean
  openedAt: string | null
  lentTo: string | null
  lentUntil: string | null
}
export interface ReadingPosition { pct: number; pages: number; updatedAt: string | null; finishedAt: string | null }
export interface ActivityDay { pages: number; minutes: number; sessions: number }
export interface ReaderNotification { id: string; at: string; kind: 'due' | 'club' | 'reply' | 'info'; title: string; detail: string; read: boolean }

export interface ReaderState {
  plan: Plan
  planPriceCents: number
  creditsPerMonth: number
  balance: number
  ledger: LedgerEntry[]
  holdings: Holding[]
  toRead: string[]
  wishlist: string[]
  progress: Record<string, ReadingPosition>
  activity: Record<string, ActivityDay>
  flagClasses: Record<string, FlagClass>
  notifications: ReaderNotification[]
}

export interface BookQuery {
  q?: string
  type?: string[]
  genre?: string[]
  author?: string[]
  trope?: string[]
  tag?: string[]
  hideFlag?: string[]
  minRating?: number
  minWords?: number
  maxWords?: number
  minReaders?: number
  sort?: 'popularity' | 'rating' | 'words' | 'newest' | 'title'
  limit?: number
  offset?: number
}

function queryString(query: BookQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue
    if (Array.isArray(value)) value.forEach(v => params.append(key, v))
    else params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const getBooks = (query: BookQuery = {}) => api.get<BookPage>(`/library/books${queryString({ limit: 200, ...query })}`)
export const getBook = (id: string) => api.get<CatalogBook>(`/library/books/${encodeURIComponent(id)}`)
export const getAuthors = () => api.get<Author[]>('/library/authors')
export const getAuthor = (id: string) => api.get<AuthorDetail>(`/library/authors/${encodeURIComponent(id)}`)
export const getRecommendations = (limit = 6) => api.get<Recommendation[]>(`/library/recommendations?limit=${limit}`)

export const getReader = () => api.get<ReaderState>('/reader')
export const putPlan = (extraCredits: number) => api.put<ReaderState>('/reader/plan', { extraCredits })
export const postBorrow = (bookId: string, credits: number) => api.post<ReaderState>('/reader/borrow', { bookId, credits })
export const postBuy = (bookId: string) => api.post<ReaderState>('/reader/buy', { bookId })
export const postOpen = (holdingId: string) => api.post<ReaderState>(`/reader/holdings/${encodeURIComponent(holdingId)}/open`)
export const postReturn = (holdingId: string) => api.post<ReaderState>(`/reader/holdings/${encodeURIComponent(holdingId)}/return`)
export const postExtend = (holdingId: string) => api.post<ReaderState>(`/reader/holdings/${encodeURIComponent(holdingId)}/extend`)
export const postLend = (holdingId: string, to: string, months: number) => api.post<ReaderState>(`/reader/holdings/${encodeURIComponent(holdingId)}/lend`, { to, months })
export const postRecall = (holdingId: string) => api.post<ReaderState>(`/reader/holdings/${encodeURIComponent(holdingId)}/recall`)
export const postProgress = (bookId: string, pct: number, pages: number, minutes: number, newSession: boolean) =>
  api.post<ReaderState>('/reader/progress', { bookId, pct, pages, minutes, newSession })
export const putWishlist = (bookId: string) => api.put<ReaderState>(`/reader/wishlist/${encodeURIComponent(bookId)}`, {})
export const deleteWishlist = (bookId: string) => api.delete<ReaderState>(`/reader/wishlist/${encodeURIComponent(bookId)}`)
export const putToRead = (bookId: string) => api.put<ReaderState>(`/reader/to-read/${encodeURIComponent(bookId)}`, {})
export const deleteToRead = (bookId: string) => api.delete<ReaderState>(`/reader/to-read/${encodeURIComponent(bookId)}`)
export const putFlagClass = (key: string, flagClass: FlagClass) => api.put<ReaderState>(`/reader/flag-classes/${encodeURIComponent(key)}`, { flagClass })
export const postNotificationsRead = () => api.post<ReaderState>('/reader/notifications/read')
