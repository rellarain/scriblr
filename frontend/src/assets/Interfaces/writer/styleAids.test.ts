import { describe, expect, it } from 'vitest'
import { gradeLabel, longSentences, readingGrade, repeatedWords, syllables, wordKey } from './styleAids'

const LONG = 'The lanterns along the quay were already lit, each lantern swinging on its hook as the wind came up off the water, and somewhere behind the lanterns a dog was barking at nothing.'

describe('long sentences', () => {
  it('finds the sentences over the limit, with where they are and their words', () => {
    const body = `Short one. ${LONG}\n\nAnother short one.`
    const found = longSentences(body, 30)
    expect(found).toHaveLength(1)
    expect(body.slice(found[0].start, found[0].end)).toBe(LONG)
    expect(found[0]).toMatchObject({ paragraph: 0, words: 33 })
    expect(longSentences(body, 40)).toEqual([])
  })
})

describe('repeated words', () => {
  it('marks both uses of a word used again within the gap, a plural and a possessive counting as the word', () => {
    const marks = repeatedWords(LONG, 40).map(r => LONG.slice(r.start, r.end))
    expect(marks).toEqual(['lanterns', 'lantern', 'lanterns'])
    expect(repeatedWords(LONG, 5)).toEqual([])
  })

  it('leaves out small words and short ones', () => {
    expect(repeatedWords('the cat and the dog and the cat', 40).length).toBe(2)
    expect(repeatedWords('He is. He is. Go go go.', 40)).toEqual([])
    expect(wordKey('Lantern’s')).toBe('lantern')
    expect(wordKey('glass')).toBe('glass')
    expect(wordKey('bus')).toBe('bus')
  })
})

describe('reading level', () => {
  it('counts syllables by vowel groups', () => {
    expect([syllables('cat'), syllables('water'), syllables('lantern'), syllables('make'), syllables('readability')]).toEqual([1, 2, 2, 1, 5])
  })

  it('gives a school grade for enough English text, and none for too little', () => {
    const plain = 'The dog ran. The cat sat. The sun was hot. We went home. It was a good day. The boat came in. We got on it.'
    const dense = 'Notwithstanding considerable institutional resistance, the administration systematically implemented comprehensive organisational restructuring initiatives throughout the subsequent fiscal period, fundamentally transforming operational methodologies.'
    expect(readingGrade(plain)).toBeLessThanOrEqual(3)
    expect(readingGrade(dense.repeat(2))).toBeGreaterThan(12)
    expect(readingGrade('Too short to judge.')).toBeNull()
    expect(readingGrade('日本語の文章です。'.repeat(20))).toBeNull()
    expect(gradeLabel(6)).toBe('grade 6')
    expect(gradeLabel(19)).toBe('grade 16+')
  })
})
