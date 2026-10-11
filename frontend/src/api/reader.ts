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
export interface ReaderNotification { id: string; at: string; kind: 'due' | 'club' | 'reply' | 'follow' | 'review' | 'info'; title: string; detail: string; read: boolean }

// How far into a book's making a reader is invited: alpha (the plan, read-only), delta (work-in-progress drafts), beta (final-draft chapters as they
// publish) and omega (final editions). Alpha and delta are free; beta pays like omega.
export type ReaderLevel = 'alpha' | 'delta' | 'beta' | 'omega'
export interface LevelInfo { level: ReaderLevel; invitedBy: string | null; override: boolean }

export interface ReviewRead {
  n: number
  status: 'draft' | 'posted'
  score: number | null
  criteria: Record<string, number>
  comment: string
  spoilerEssay: string
  noteIds: string[]
  startedAt: string
  postedAt: string | null
  editedAt: string | null
}
export interface Review { bookId: string; reads: ReviewRead[] }
export interface Note { id: string; bookId: string; quote: string; note: string; at: string }
export type ReportKind = 'review' | 'post'
export interface Report { id: string; kind: ReportKind; targetId: string; reason: string; at: string }

export interface Club { id: string; name: string; description: string; bookId: string | null; meets: string; nextMeetingAt: string | null; members: string[]; mine: boolean }
export interface ClubPost { id: string; clubId: string; authorId: string; text: string; at: string; spoiler: boolean; replyTo: string | null }
export interface ClubView { club: Club; joined: boolean; memberCount: number; posts: ClubPost[] }
export interface ReaderProfile { id: string; name: string; initials: string; bio: string }

export interface PublicReview {
  id: string
  readerId: string
  name: string
  initials: string
  score: number
  criteria: Record<string, number>
  comment: string
  spoilerEssay: string
  reads: number
  at: string
  edited: boolean
  mine: boolean
}
export interface CriterionAverage { name: string; average: number; count: number }
export interface BookCard { bookId: string; rating: number; ratings: number; criteria: CriterionAverage[]; reviews: PublicReview[] }

export interface FeedItem { id: string; at: string; kind: 'finished' | 'reviewed' | 'club' | 'author' | 'followed' | 'mine'; who: string; whoId: string; title: string; detail: string; bookId: string | null }

export interface Chapter { n: number; title: string; words: number }
export interface PlanRow { title: string; meta: string; indent: number }
export interface BookPlanning {
  outline: PlanRow[]
  plot: PlanRow[]
  plotPath: string
  goalWords: number
  wordsNow: number
  chaptersOutlined: number
  chaptersTotal: number
  publishTarget: string
  revisions: PlanRow[]
}
export interface BookStats { readingNow: number; averageMinutes: number; finishPercent: number; leaveBars: number[]; clubs: number }
export interface BookDetail {
  bookId: string
  authorNote: string
  contents: Chapter[]
  glossary: PlanRow[]
  bibliography: string[]
  index: string[]
  appendix: string[]
  planning: BookPlanning
  stats: BookStats
}

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
  levels: Record<string, LevelInfo>
  criteriaNames: string[]
  reviews: Review[]
  notes: Note[]
  following: string[]
  joinedClubs: string[]
  reports: Report[]
  blocked: string[]
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

// ---------------------------------------------------------------------------------------------------------------------- the Book page and the community

export const getBookDetail = (id: string) => api.get<BookDetail>(`/library/books/${encodeURIComponent(id)}/detail`)
export const getReaders = () => api.get<ReaderProfile[]>('/library/readers')
export const getBookCard = (id: string) => api.get<BookCard>(`/reader/books/${encodeURIComponent(id)}/card`)
export const getClubs = () => api.get<ClubView[]>('/reader/clubs')
export const getFeed = () => api.get<FeedItem[]>('/reader/feed')

export const putLevel = (bookId: string, level: ReaderLevel | null) => api.put<ReaderState>(`/reader/levels/${encodeURIComponent(bookId)}`, { level })
export const putCriteria = (names: string[]) => api.put<ReaderState>('/reader/criteria', { names })
export interface ReviewDraft { score: number | null; criteria: Record<string, number>; comment: string; spoilerEssay: string; noteIds: string[] }
export const putReview = (bookId: string, draft: ReviewDraft) => api.put<ReaderState>(`/reader/reviews/${encodeURIComponent(bookId)}`, draft)
export const postReview = (bookId: string) => api.post<ReaderState>(`/reader/reviews/${encodeURIComponent(bookId)}/post`)
export const postReread = (bookId: string) => api.post<ReaderState>(`/reader/reviews/${encodeURIComponent(bookId)}/reread`)
export const deleteReviewDraft = (bookId: string) => api.delete<ReaderState>(`/reader/reviews/${encodeURIComponent(bookId)}/draft`)
export const postNote = (bookId: string, quote: string, note: string) => api.post<ReaderState>('/reader/notes', { bookId, quote, note })
export const deleteNote = (id: string) => api.delete<ReaderState>(`/reader/notes/${encodeURIComponent(id)}`)
export const putFollowing = (whom: string) => api.put<ReaderState>(`/reader/following/${encodeURIComponent(whom)}`, {})
export const deleteFollowing = (whom: string) => api.delete<ReaderState>(`/reader/following/${encodeURIComponent(whom)}`)
export const postClub = (name: string, description: string, bookId: string | null, meets: string) => api.post<ReaderState>('/reader/clubs', { name, description, bookId, meets })
export const deleteClub = (id: string) => api.delete<ReaderState>(`/reader/clubs/${encodeURIComponent(id)}`)
export const putMembership = (id: string) => api.put<ReaderState>(`/reader/clubs/${encodeURIComponent(id)}/membership`, {})
export const deleteMembership = (id: string) => api.delete<ReaderState>(`/reader/clubs/${encodeURIComponent(id)}/membership`)
export const postClubPost = (id: string, text: string, spoiler: boolean, replyTo: string | null) => api.post<ReaderState>(`/reader/clubs/${encodeURIComponent(id)}/posts`, { text, spoiler, replyTo })
export const deletePost = (id: string) => api.delete<ReaderState>(`/reader/posts/${encodeURIComponent(id)}`)
export const postReport = (kind: ReportKind, targetId: string, reason: string) => api.post<ReaderState>('/reader/reports', { kind, targetId, reason })
export const deleteReport = (id: string) => api.delete<ReaderState>(`/reader/reports/${encodeURIComponent(id)}`)
export const putBlocked = (readerId: string) => api.put<ReaderState>(`/reader/blocked/${encodeURIComponent(readerId)}`, {})
export const deleteBlocked = (readerId: string) => api.delete<ReaderState>(`/reader/blocked/${encodeURIComponent(readerId)}`)
