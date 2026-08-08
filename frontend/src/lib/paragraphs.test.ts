import { describe, expect, it } from 'vitest'
import { clampParagraphIndex, splitParagraphs } from './paragraphs'

describe('splitParagraphs', () => {
  it('splits on blank lines', () => {
    expect(splitParagraphs('First.\n\nSecond.\n\nThird.')).toEqual(['First.', 'Second.', 'Third.'])
  })

  it('treats a run of whitespace-only blank lines as one separator', () => {
    expect(splitParagraphs('First.\n\n   \n\nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(splitParagraphs('')).toEqual([])
    expect(splitParagraphs('   \n  ')).toEqual([])
  })

  it('returns a single paragraph when there are no blank-line breaks', () => {
    expect(splitParagraphs('Just one paragraph\nwith a line break.')).toEqual(['Just one paragraph\nwith a line break.'])
  })

  it('trims leading/trailing whitespace around the whole body', () => {
    expect(splitParagraphs('\n\n  First.\n\nSecond.  \n\n')).toEqual(['First.', 'Second.'])
  })
})

describe('clampParagraphIndex', () => {
  it('returns null when there are no paragraphs', () => {
    expect(clampParagraphIndex(0, 0)).toBeNull()
  })

  it('clamps a negative index to 0', () => {
    expect(clampParagraphIndex(-1, 3)).toBe(0)
  })

  it('clamps an out-of-range index to the last paragraph', () => {
    expect(clampParagraphIndex(5, 3)).toBe(2)
  })

  it('passes through an in-range index unchanged', () => {
    expect(clampParagraphIndex(1, 3)).toBe(1)
  })
})
