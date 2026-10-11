import { describe, expect, it } from 'vitest'
import type { FlaggedPassage, Mark, Note } from '../../../api/reader'
import { countMarks, flagsAt, nextLevel, notesMarkdown, pageBudget, pageOfParagraph, paginate, parseKey, progressPercent, resumeAt, sentenceKey, strictest } from './pagesLogic'

describe('sentence keys', () => {
  it('round-trips a key and rejects anything else', () => {
    expect(sentenceKey(3, 1, 2)).toBe('c3:p1:s2')
    expect(parseKey('c3:p1:s2')).toEqual({ chapter: 3, paragraph: 1, sentence: 2 })
    expect(parseKey('3:1:2')).toBeNull()
  })
  it('raises a reaction a level at a time and clears it on the fourth click', () => {
    expect([0, 1, 2, 3].map(nextLevel)).toEqual([1, 2, 3, 0])
  })
})

describe('pages', () => {
  it('fits fewer characters on a page as the text grows, and fewer with wide margins', () => {
    expect(pageBudget(17, 'narrow')).toBe(2600)
    expect(pageBudget(34, 'narrow')).toBeLessThan(pageBudget(17, 'narrow'))
    expect(pageBudget(17, 'wide')).toBeLessThan(pageBudget(17, 'narrow'))
  })
  it('cuts whole paragraphs into pages, a long one standing alone', () => {
    const p = (n: number) => 'x'.repeat(n)
    expect(paginate([p(400), p(400), p(400), p(400)], 1000)).toEqual([0, 2])
    expect(paginate([p(2000), p(100)], 1000)).toEqual([0, 1])
    expect(paginate([], 1000)).toEqual([0])
  })
  it('finds the page a paragraph is on', () => {
    expect([0, 1, 2, 3, 4].map(i => pageOfParagraph([0, 2, 4], i))).toEqual([0, 0, 1, 1, 2])
  })
  it('measures how far through the book the reader is', () => {
    expect(progressPercent(1, 10, 0, 10)).toBe(1)
    expect(progressPercent(5, 10, 9, 10)).toBe(50)
    expect(progressPercent(10, 10, 9, 10)).toBe(100)
    expect(progressPercent(1, 0, 0, 0)).toBe(0)
  })
})

describe('flags on a sentence', () => {
  const passages: FlaggedPassage[] = [{ key: 'c1:p0:s0', flagKey: 'grief', name: 'Grief', detail: 'd', defaultClass: 'marked' }]
  const classOf = (key: string, fallback: 'marked' | 'hidden' | 'highlight' | 'spoiler') => (key === 'grief' ? 'hidden' : fallback)
  it('gives the author flag the class the reader chose, and adds the reader\'s own flags', () => {
    const mark: Mark = { like: 0, dislike: 0, flags: ['mine1'] }
    const flags = flagsAt('c1:p0:s0', passages, mark, classOf, [{ key: 'mine1', name: 'Simplify' }])
    expect(flags.map(f => [f.name, f.cls])).toEqual([['Grief', 'hidden'], ['Simplify', 'marked']])
    expect(flagsAt('c1:p0:s1', passages, undefined, classOf, [])).toEqual([])
  })
  it('shows a sentence by its strictest flag', () => {
    const flags = [
      { flagKey: 'a', name: 'A', detail: '', cls: 'marked' as const },
      { flagKey: 'b', name: 'B', detail: '', cls: 'spoiler' as const },
      { flagKey: 'c', name: 'C', detail: '', cls: 'highlight' as const },
    ]
    expect(strictest(flags)?.name).toBe('B')
    expect(strictest([{ flagKey: 'h', name: 'H', detail: '', cls: 'hidden' }, ...flags])?.name).toBe('H')
    expect(strictest([])).toBeUndefined()
  })
})

describe('counting and exporting', () => {
  it('counts the reactions in one chapter only', () => {
    const marks: Record<string, Mark> = {
      'c3:p0:s0': { like: 2, dislike: 0, flags: [] }, 'c3:p0:s1': { like: 0, dislike: 1, flags: ['x'] }, 'c3:p1:s0': { like: 0, dislike: 0, flags: ['x'] }, 'c4:p0:s0': { like: 3, dislike: 0, flags: [] },
    }
    expect(countMarks(marks, 3)).toEqual({ marked: 2, pleasant: 1, unpleasant: 1, flagged: 2 })
  })
  it('exports notes as Markdown in reading order, by chapter', () => {
    const note = (id: string, over: Partial<Note>): Note => ({ id, bookId: 'b', quote: '', note: '', at: '2026-10-01T00:00:00Z', kind: 'note', chapter: null, key: null, ...over })
    const md = notesMarkdown('Cold Harbor', 'Mara Quill', [
      note('b', { chapter: 3, key: 'c3:p4:s0', quote: 'Later line.', kind: 'highlight' }),
      note('a', { chapter: 3, key: 'c3:p1:s0', quote: 'Early line.', note: 'Why?', kind: 'highlight' }),
      note('c', { chapter: 1, key: 'c1:p0:s0', kind: 'bookmark' }),
    ])
    expect(md.indexOf('## Chapter 1')).toBeLessThan(md.indexOf('## Chapter 3'))
    expect(md.indexOf('> Early line.')).toBeLessThan(md.indexOf('> Later line.'))
    expect(md).toContain('- Bookmark')
    expect(md.startsWith('# Cold Harbor\n*Mara Quill*')).toBe(true)
  })
})

describe('resuming', () => {
  it('opens at the saved place, or the first open chapter when it is gone', () => {
    expect(resumeAt({ chapter: 4, paragraph: 2 }, [1, 2, 3, 4])).toEqual({ chapter: 4, paragraph: 2 })
    expect(resumeAt({ chapter: 9, paragraph: 2 }, [1, 2, 3])).toEqual({ chapter: 1, paragraph: 0 })
    expect(resumeAt(undefined, [2, 3])).toEqual({ chapter: 2, paragraph: 0 })
  })
})
