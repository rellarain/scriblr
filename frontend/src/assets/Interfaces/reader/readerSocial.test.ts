import { describe, expect, it } from 'vitest'
import type { PublicReview, ReaderState, Report, Review } from '../../../api/reader'
import { canReread, criteriaAverage, currentChapter, initialsOf, isFreeLevel, levelOf, personName, postedReads, readLabel, sortReviews, visibleReviews } from './readerSocial'

const review = (over: Partial<PublicReview>): PublicReview => ({
  id: 'r', readerId: 'r-sol', name: 'Sol', initials: 'S', score: 8, criteria: {}, comment: '', spoilerEssay: '', reads: 1, at: '2026-10-01T00:00:00Z', edited: false, mine: false, ...over,
})
const read = (n: number, status: 'draft' | 'posted') => ({ n, status, score: 8, criteria: {}, comment: '', spoilerEssay: '', noteIds: [], startedAt: '2026-10-01T00:00:00Z', postedAt: null, editedAt: null })

describe('levels', () => {
  const reader = { levels: { ash: { level: 'alpha', invitedBy: 'Mara Quill', override: false } } } as unknown as ReaderState
  it('reads a book at the invited level, else the final edition', () => {
    expect(levelOf(reader, 'ash')).toBe('alpha')
    expect(levelOf(reader, 'cold-harbor')).toBe('omega')
  })
  it('makes alpha and delta free, and beta and omega paid', () => {
    expect(['alpha', 'delta', 'beta', 'omega'].map(l => isFreeLevel(l as 'alpha'))).toEqual([true, true, false, false])
  })
})

describe('reviews and re-reads', () => {
  const mine = (...reads: ReturnType<typeof read>[]): Review => ({ bookId: 'b', reads })
  it('can start a re-read only once the current read is posted', () => {
    expect(canReread(undefined)).toBe(false)
    expect(canReread(mine(read(1, 'draft')))).toBe(false)
    expect(canReread(mine(read(1, 'posted')))).toBe(true)
    expect(canReread(mine(read(1, 'posted'), read(2, 'draft')))).toBe(false)
  })
  it('counts posted reads and names the tabs', () => {
    expect(postedReads(mine(read(1, 'posted'), read(2, 'draft')))).toBe(1)
    expect([1, 2, 3].map(readLabel)).toEqual(['First read', 'Re-read 2', 'Re-read 3'])
  })
  it('averages criteria to one decimal, or nothing when none is scored', () => {
    expect(criteriaAverage({})).toBeNull()
    expect(criteriaAverage({ Plot: 8, Prose: 9, Pacing: 7 })).toBe(8)
    expect(criteriaAverage({ Plot: 8, Prose: 9 })).toBe(8.5)
  })
})

describe('what is shown', () => {
  const reviews = [review({ id: 'a', score: 6, at: '2026-10-09T00:00:00Z' }), review({ id: 'b', score: 9, readerId: 'r-rue', at: '2026-10-01T00:00:00Z' }), review({ id: 'c', score: 9, readerId: 'r-jun', reads: 3, at: '2026-10-05T00:00:00Z' })]
  it('sorts the top-scored first (re-reads break a tie), or the newest first', () => {
    expect(sortReviews(reviews, 'top').map(r => r.id)).toEqual(['c', 'b', 'a'])
    expect(sortReviews(reviews, 'newest').map(r => r.id)).toEqual(['a', 'c', 'b'])
  })
  it('leaves out a reported review and a blocked reader', () => {
    const reports: Report[] = [{ id: 'x', kind: 'review', targetId: 'a', reason: 'hide', at: '2026-10-10T00:00:00Z' }]
    expect(visibleReviews(reviews, reports, ['r-rue']).map(r => r.id)).toEqual(['c'])
    expect(visibleReviews(reviews, [], []).length).toBe(3)
  })
})

describe('the chapter reached', () => {
  it('is the chapter the reader is in, never past the last', () => {
    expect([0, 49, 50, 99, 100].map(p => currentChapter(p, 4))).toEqual([1, 2, 3, 4, 4])
    expect(currentChapter(40, 0)).toBe(1)
  })
})

describe('people', () => {
  const data = { readers: [{ id: 'r-sol', name: 'Sol Marsh', initials: 'SM', bio: '' }], books: [{ authorId: 'mara-quill', authorName: 'Mara Quill' }] } as never
  it('names me, a reader, an author, or falls back to the id', () => {
    expect([personName(data, 'me'), personName(data, 'r-sol'), personName(data, 'mara-quill'), personName(data, 'zz')]).toEqual(['You', 'Sol Marsh', 'Mara Quill', 'zz'])
    expect(initialsOf('Rue Tanner Jr')).toBe('RT')
  })
})
