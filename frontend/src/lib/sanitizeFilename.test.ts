import { describe, expect, it } from 'vitest'
import { sanitizeFilename } from './sanitizeFilename'

describe('sanitizeFilename', () => {
  it('leaves an already-safe name unchanged', () => {
    expect(sanitizeFilename('My Book Title')).toBe('My Book Title')
  })

  it('replaces characters invalid on Windows/macOS/Linux with underscores', () => {
    expect(sanitizeFilename('Chapter: One / Two \\ Three?')).toBe('Chapter_ One _ Two _ Three_')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeFilename('  Padded  ')).toBe('Padded')
  })

  it('falls back to "untitled" for an empty or whitespace-only name', () => {
    expect(sanitizeFilename('')).toBe('untitled')
    expect(sanitizeFilename('   ')).toBe('untitled')
  })
})
