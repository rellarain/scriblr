import { describe, expect, it } from 'vitest'
import { plotSizeOf } from './useElementWidth'

describe('the Plot tool\'s layout by width', () => {
  it('is wide until it is measured, and from 1,040px', () => {
    expect(plotSizeOf(null)).toBe('wide')
    expect(plotSizeOf(1040)).toBe('wide')
    expect(plotSizeOf(1400)).toBe('wide')
  })

  it('is medium from 720px up to 1,040px', () => {
    expect(plotSizeOf(1039)).toBe('medium')
    expect(plotSizeOf(720)).toBe('medium')
  })

  it('is one column under 720px', () => {
    expect(plotSizeOf(719)).toBe('compact')
    expect(plotSizeOf(300)).toBe('compact')
  })
})
