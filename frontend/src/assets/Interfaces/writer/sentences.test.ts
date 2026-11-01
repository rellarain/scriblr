import { describe, expect, it } from 'vitest'
import { sentenceRanges, splitParagraphs, splitSentences } from './sentences'

describe('splitParagraphs', () => {
  it('splits on blank lines and trims', () => {
    expect(splitParagraphs('One.\n\n  Two.  \n\n\nThree.')).toEqual(['One.', 'Two.', 'Three.'])
    expect(splitParagraphs('   ')).toEqual([])
  })
})

describe('splitSentences', () => {
  it('splits on terminal punctuation and keeps the pieces whole', () => {
    const text = 'The bell had not rung. She listened! Was it breathing? "Yes," she said.'
    const parts = splitSentences(text)
    expect(parts).toHaveLength(4)
    expect(parts.join('')).toBe(text)
  })

  it('keeps a trailing fragment without punctuation', () => {
    expect(splitSentences('One. Two')).toEqual(['One. ', 'Two'])
  })
})

describe('sentenceRanges', () => {
  const body = '  First one. Second one!\n\n\nThird.   Fourth'

  it('gives each sentence its characters in the text, without the space after it', () => {
    const ranges = sentenceRanges(body)
    expect(ranges.map(r => body.slice(r.start, r.end))).toEqual(['First one.', 'Second one!', 'Third.', 'Fourth'])
    expect(ranges.map(r => [r.paragraph, r.sentence])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
  })

  it('counts paragraphs as splitParagraphs does, and is empty for no text', () => {
    expect(sentenceRanges('A.\n \nB.').map(r => r.paragraph)).toEqual([0, 1])
    expect(sentenceRanges('  \n\n ')).toEqual([])
  })
})
