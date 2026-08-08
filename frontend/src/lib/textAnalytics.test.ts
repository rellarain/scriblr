import { describe, expect, it } from 'vitest'
import { analyzeText, countPhraseOccurrences } from './textAnalytics'

describe('analyzeText', () => {
  it('counts words and sentences deterministically', () => {
    const result = analyzeText('The cat sat. It was happy!')
    expect(result.wordCount).toBe(6)
    expect(result.sentenceCount).toBe(2)
  })

  it('computes average and longest sentence length from word counts', () => {
    const result = analyzeText('One two three. Four five.')
    expect(result.avgSentenceLength).toBeCloseTo(2.5)
    expect(result.longestSentence).toBe(3)
  })

  it('returns zeroed stats for empty text without dividing by zero', () => {
    const result = analyzeText('')
    expect(result.wordCount).toBe(0)
    expect(result.sentenceCount).toBe(0)
    expect(result.fleschReadingEase).toBe(0)
    expect(result.fleschKincaidGrade).toBe(0)
  })

  it('excludes stopwords from the top-words list', () => {
    const result = analyzeText('the the the dragon dragon flew')
    expect(result.topWords.some((w) => w.word === 'the')).toBe(false)
    expect(result.topWords[0]).toEqual({ word: 'dragon', count: 2 })
  })
})

describe('countPhraseOccurrences', () => {
  it('counts case-insensitive whole-word matches', () => {
    expect(countPhraseOccurrences('The Dragon roared. A dragon flew.', 'dragon')).toBe(2)
  })

  it('does not match a partial word', () => {
    expect(countPhraseOccurrences('dragonfly dragons', 'dragon')).toBe(0)
  })

  it('matches multi-word phrases', () => {
    expect(countPhraseOccurrences('the ancient sword of kings was lost', 'sword of kings')).toBe(1)
  })

  it('returns 0 for an empty or whitespace-only phrase', () => {
    expect(countPhraseOccurrences('some text', '')).toBe(0)
    expect(countPhraseOccurrences('some text', '   ')).toBe(0)
  })

  it('escapes regex-special characters in the phrase', () => {
    expect(countPhraseOccurrences('the user.name field is required', 'user.name')).toBe(1)
    expect(countPhraseOccurrences('the username field is required', 'user.name')).toBe(0)
  })
})
