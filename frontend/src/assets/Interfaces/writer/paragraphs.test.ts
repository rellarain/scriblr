import { describe, expect, it } from 'vitest'
import {
  chapterParagraphs, joinParagraphs, moveParagraph, moveToMoment, paragraphAt, paragraphRanges, putParagraph, splitParagraph, takeParagraph,
} from './paragraphs'
import { splitParagraphs } from './sentences'

const A = 'She had three coins and a letter.'
const B = 'The coins were for the crossing. The letter was not hers.'
const C = 'Out on the dark water a bell rang twice.'
const BODY = `${A}\n\n${B}\n\n\n${C}\n`
const texts = (body: string) => paragraphRanges(body).map(r => body.slice(r.start, r.end))
const at = (momentId: string, paragraph: number, sentence = 0) => ({ momentId, paragraph, sentence })

describe('where the paragraphs are', () => {
  it('counts them as the Preview does', () => {
    for (const body of [BODY, '  one\n \n two  \n\n\n\nthree', '', '\n\n', 'single']) expect(texts(body)).toEqual(splitParagraphs(body))
    expect(paragraphRanges('  Hi.\n\nYo.')).toEqual([{ start: 2, end: 5 }, { start: 7, end: 10 }])
  })

  it('finds the paragraph a caret is in, a caret in a gap belonging to the paragraph before', () => {
    const ranges = paragraphRanges(BODY)
    expect(paragraphAt(ranges, 0)).toBe(0)
    expect(paragraphAt(ranges, A.length + 1)).toBe(0)
    expect(paragraphAt(ranges, BODY.indexOf('The coins'))).toBe(1)
    expect(paragraphAt(ranges, BODY.length)).toBe(2)
    expect(paragraphAt([], 0)).toBe(-1)
  })
})

describe('moving a paragraph up or down', () => {
  it('swaps it with its neighbour and keeps the gaps between them', () => {
    const moved = moveParagraph(BODY, 'm', 1, -1)
    expect(moved?.body).toBe(`${B}\n\n${A}\n\n\n${C}\n`)
    expect(moved?.follow(at('m', 1, 1))).toEqual(at('m', 0, 1))
    expect(moved?.follow(at('m', 0))).toEqual(at('m', 1))
    expect(moved?.follow(at('m', 2))).toEqual(at('m', 2))
    expect(moved?.follow(at('other', 1))).toEqual(at('other', 1))
  })

  it('does nothing at the edge', () => {
    expect(moveParagraph(BODY, 'm', 0, -1)).toBeNull()
    expect(moveParagraph(BODY, 'm', 2, 1)).toBeNull()
  })
})

describe('splitting a paragraph', () => {
  it('splits at the caret between sentences, the later sentences going to the new paragraph', () => {
    const caret = BODY.indexOf('The letter')
    const split = splitParagraph(BODY, 'm', caret)
    expect(split && texts(split.body)).toEqual([A, 'The coins were for the crossing.', 'The letter was not hers.', C])
    expect(split?.paragraph).toBe(2)
    expect(split && split.body.slice(split.caret).startsWith('The letter')).toBe(true)
    expect(split?.follow(at('m', 1, 0))).toEqual(at('m', 1, 0))
    expect(split?.follow(at('m', 1, 1))).toEqual(at('m', 2, 0))
    expect(split?.follow(at('m', 2))).toEqual(at('m', 3))
    expect(split?.follow(at('m', 0))).toEqual(at('m', 0))
  })

  it('keeps a sentence cut in two with the first part', () => {
    const caret = BODY.indexOf('for the crossing')
    const split = splitParagraph(BODY, 'm', caret)
    expect(split && texts(split.body)[1]).toBe('The coins were')
    expect(split?.follow(at('m', 1, 0))).toEqual(at('m', 1, 0))
    expect(split?.follow(at('m', 1, 1))).toEqual(at('m', 2, 1))
  })

  it('does not split at a paragraph edge or between paragraphs', () => {
    expect(splitParagraph(BODY, 'm', 0)).toBeNull()
    expect(splitParagraph(BODY, 'm', A.length)).toBeNull()
    expect(splitParagraph(BODY, 'm', A.length + 1)).toBeNull()
  })
})

describe('joining two paragraphs', () => {
  it('joins a paragraph with the next, its sentences after the first one', () => {
    const joined = joinParagraphs(BODY, 'm', 0)
    expect(joined && texts(joined.body)).toEqual([`${A} ${B}`, C])
    expect(joined && joined.body[joined.caret - 1]).toBe(' ')
    expect(joined?.follow(at('m', 1, 1))).toEqual(at('m', 0, 2))
    expect(joined?.follow(at('m', 2))).toEqual(at('m', 1))
    expect(joined?.follow(at('m', 0))).toEqual(at('m', 0))
    expect(joinParagraphs(BODY, 'm', 2)).toBeNull()
  })

  it('counts one sentence fewer when the first paragraph ends mid-sentence', () => {
    const joined = joinParagraphs('She waited\n\nfor the boat. It came.', 'm', 0)
    expect(joined?.body).toBe('She waited for the boat. It came.')
    expect(joined?.follow(at('m', 1, 1))).toEqual(at('m', 0, 1))
  })
})

describe('moving a paragraph to another moment', () => {
  it('takes it out with one gap, and puts it at the start or the end', () => {
    expect(takeParagraph(BODY, 1)?.body).toBe(`${A}\n\n${C}\n`)
    expect(takeParagraph(BODY, 2)?.body).toBe(`${A}\n\n${B}\n`)
    expect(takeParagraph('Only.', 0)).toEqual({ body: '', text: 'Only.' })
    expect(putParagraph('', 'New.', 'end')).toEqual({ body: 'New.', paragraph: 0 })
    expect(putParagraph('  One.\n\nTwo.  ', 'New.', 'start')).toEqual({ body: 'New.\n\nOne.\n\nTwo.  ', paragraph: 0 })
    expect(putParagraph('One.\n\nTwo.\n', 'New.', 'end')).toEqual({ body: 'One.\n\nTwo.\n\nNew.', paragraph: 2 })
  })

  it('says where everything went', () => {
    const moved = moveToMoment(BODY, 'm1', 1, `${C}`, 'm2', 'start')
    expect(moved && texts(moved.fromBody)).toEqual([A, C])
    expect(moved && texts(moved.toBody)).toEqual([B, C])
    expect(moved?.follow(at('m1', 1, 1))).toEqual(at('m2', 0, 1))
    expect(moved?.follow(at('m1', 2))).toEqual(at('m1', 1))
    expect(moved?.follow(at('m1', 0))).toEqual(at('m1', 0))
    expect(moved?.follow(at('m2', 0))).toEqual(at('m2', 1))
    const atEnd = moveToMoment(BODY, 'm1', 0, C, 'm2', 'end')
    expect(atEnd?.paragraph).toBe(1)
    expect(atEnd?.follow(at('m2', 0))).toEqual(at('m2', 0))
    expect(moveToMoment(BODY, 'm1', 0, C, 'm1', 'end')).toBeNull()
  })
})

describe("counting a chapter's paragraphs", () => {
  it('goes from a chapter-wide paragraph to a moment and back', () => {
    const chapter = chapterParagraphs(['m1', 'm2', 'm3'], { m1: BODY, m2: '', m3: 'X.\n\nY.' })
    expect(chapter.toPlace(4, 1)).toEqual(at('m3', 1, 1))
    expect(chapter.toPlace(9, 0)).toBeNull()
    expect(chapter.toChapter(at('m3', 0))).toBe(3)
    expect(chapter.toChapter(at('nope', 0))).toBeNull()
  })
})
