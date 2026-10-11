import { api } from './client'
import type { PublicReview, ReaderLevel, SentenceTotal } from './reader'

// Publishing a book to the Reader's library, and what the author sees of it (backend: api/book_publishing.py). Money is simulated.

export type BookTypeName = 'novel' | 'novella' | 'essays' | 'magazine' | 'article'
export type FlagClassName = 'hidden' | 'marked' | 'highlight' | 'spoiler'
export type InviteLevel = Exclude<ReaderLevel, 'omega'>

export interface BookFlagMeta { key: string; name: string; detail: string; defaultClass: FlagClassName }
export interface BookMeta {
  type: BookTypeName
  blurb: string
  genres: string[]
  tags: string[]
  tropes: string[]
  flags: BookFlagMeta[]
  buyPriceCents: number
  coverHue: number | null
}
export interface BookEdition { n: number; publishedAt: string; wordCount: number; chapters: { chapterId: string; n: number; title: string; words: number }[] }
export interface BookListing { listed: boolean; editions: BookEdition[]; meta: BookMeta; invites: Record<string, InviteLevel> }

export interface AuthorFootnote { id: string; paragraph: number; sentence: number; title: string; text: string; published: boolean }
export interface AuthorFlagPassage { id: string; paragraph: number; sentence: number; flagKey: string }
export interface ChapterAuthorNotes { footnotes: AuthorFootnote[]; flags: AuthorFlagPassage[] }

export interface ChapterFeedback { n: number; title: string; readers: number; pleasant: number; unpleasant: number; top: SentenceTotal[] }
export interface BookFeedback {
  bookId: string
  listed: boolean
  editions: number
  loans: number
  activeLoans: number
  sales: number
  loanShareCents: number
  saleShareCents: number
  readers: number
  rating: number
  ratings: number
  reviews: PublicReview[]
  chapters: ChapterFeedback[]
  invites: Record<string, ReaderLevel>
}
export interface BookSummary { projectId: string; bookId: string; title: string; listed: boolean; editions: number; loans: number; sales: number; earningsCents: number; rating: number; ratings: number; reviews: number }

const book = (projectId: string, bookId: string) => `/projects/${encodeURIComponent(projectId)}/books/${encodeURIComponent(bookId)}`

export const getListing = (projectId: string, bookId: string) => api.get<BookListing>(`${book(projectId, bookId)}/listing`)
export const putMeta = (projectId: string, bookId: string, meta: BookMeta) => api.put<BookListing>(`${book(projectId, bookId)}/listing/meta`, meta)
export const publishBook = (projectId: string, bookId: string) => api.post<BookListing>(`${book(projectId, bookId)}/publish`)
export const unpublishBook = (projectId: string, bookId: string) => api.post<BookListing>(`${book(projectId, bookId)}/unpublish`)
export const putInvites = (projectId: string, bookId: string, invites: Record<string, InviteLevel>) => api.put<BookListing>(`${book(projectId, bookId)}/invites`, { invites })
export const getFeedback = (projectId: string, bookId: string) => api.get<BookFeedback>(`${book(projectId, bookId)}/feedback`)
export const getPublishedBooks = () => api.get<BookSummary[]>('/author/books')

const chapter = (projectId: string, chapterId: string) => `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/author-notes`
export const getAuthorNotes = (projectId: string, chapterId: string) => api.get<ChapterAuthorNotes>(chapter(projectId, chapterId))
export const putAuthorNotes = (projectId: string, chapterId: string, notes: ChapterAuthorNotes) => api.put<ChapterAuthorNotes>(chapter(projectId, chapterId), notes)
