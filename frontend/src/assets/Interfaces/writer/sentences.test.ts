import { describe, expect, it } from 'vitest'
import { splitParagraphs, splitSentences } from './sentences'

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
