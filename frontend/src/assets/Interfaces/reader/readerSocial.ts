import type { ClubPost, PublicReview, ReaderLevel, ReaderState, Report, Review, ReviewRead } from '../../../api/reader'
import type { ReaderData } from './readerStore'

// Pure helpers over the Reader's social data: levels, reviews and their reads, what is hidden, and which chapter a reader has reached.

export const LEVELS: ReaderLevel[] = ['alpha', 'delta', 'beta', 'omega']

export const LEVEL_TEXT: Record<ReaderLevel, { name: string; free: boolean; text: string }> = {
  alpha: { name: 'Alpha', free: true, text: 'the plan, read-only: outline, plot, plan and revisions' },
  delta: { name: 'Delta', free: true, text: 'work-in-progress draft chapters' },
  beta: { name: 'Beta', free: false, text: 'final-draft chapters as they publish' },
  omega: { name: 'Omega', free: false, text: 'the final edition' },
}

// The level a reader reads a book at: the one they were invited to (or switched to), else the final edition.
export const levelOf = (reader: ReaderState, bookId: string): ReaderLevel => reader.levels[bookId]?.level ?? 'omega'

// Alpha and delta are free; beta and omega are borrowed or bought.
export const isFreeLevel = (level: ReaderLevel): boolean => LEVEL_TEXT[level].free

export const reviewOf = (reader: ReaderState, bookId: string): Review | undefined => reader.reviews.find(r => r.bookId === bookId)

export const latestRead = (review: Review | undefined): ReviewRead | undefined => review?.reads[review.reads.length - 1]

export const postedReads = (review: Review | undefined): number => review?.reads.filter(r => r.status === 'posted').length ?? 0

// A re-read can start once the current read's review is posted.
export const canReread = (review: Review | undefined): boolean => latestRead(review)?.status === 'posted'

// The tab for a read: the first read, then "Re-read 2", "Re-read 3".
export const readLabel = (n: number): string => (n === 1 ? 'First read' : `Re-read ${n}`)

// The average of a read's criteria, to one decimal (null when none is scored).
export function criteriaAverage(criteria: Record<string, number>): number | null {
  const values = Object.values(criteria)
  return values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

export const reportOf = (reports: Report[], kind: Report['kind'], id: string): Report | undefined => reports.find(r => r.kind === kind && r.targetId === id)

// Reviews and posts the reader hid or reported, and the readers they blocked, are left out.
export const visibleReviews = (reviews: PublicReview[], reports: Report[], blocked: string[]): PublicReview[] =>
  reviews.filter(r => !reportOf(reports, 'review', r.id) && !blocked.includes(r.readerId))

export const visiblePosts = (posts: ClubPost[], reports: Report[], blocked: string[]): ClubPost[] =>
  posts.filter(p => !reportOf(reports, 'post', p.id) && !blocked.includes(p.authorId))

export type ReviewSort = 'top' | 'newest'
export const sortReviews = (reviews: PublicReview[], sort: ReviewSort): PublicReview[] =>
  [...reviews].sort((a, b) => (sort === 'top' ? b.score - a.score || b.reads - a.reads : b.at.localeCompare(a.at)))

// Five stars out of a score of 10.
export const scoreStars = (score: number): string => '★'.repeat(Math.round(score / 2)) + '☆'.repeat(5 - Math.round(score / 2))

// The chapter a reader has reached (1-based), from how far through the book they are.
export function currentChapter(pct: number, chapters: number): number {
  if (chapters <= 0) return 1
  return Math.min(chapters, Math.floor((Math.max(0, pct) / 100) * chapters) + 1)
}

// A person by id: "me", a seeded reader, or an author (named by one of their books).
export function personName(data: Pick<ReaderData, 'readers' | 'books'>, id: string): string {
  if (id === 'me') return 'You'
  return data.readers.find(r => r.id === id)?.name ?? data.books.find(b => b.authorId === id)?.authorName ?? id
}

export const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
