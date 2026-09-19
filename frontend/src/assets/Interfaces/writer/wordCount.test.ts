import { describe, expect, it } from 'vitest'
import { countWords, formatWords } from './wordCount'

describe('countWords', () => {
  it('counts whitespace-separated words across lines', () => {
    expect(countWords('The bell had not rung.\n\nShe listened.')).toBe(7)
    expect(countWords('  spaced   out  ')).toBe(2)
  })

  it('counts nothing for empty or blank text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords(' \n\t ')).toBe(0)
  })
})

describe('formatWords', () => {
  it('pluralizes and groups thousands', () => {
    expect(formatWords(1)).toBe('1 word')
    expect(formatWords(0)).toBe('0 words')
    expect(formatWords(1204)).toBe('1,204 words')
  })
})
