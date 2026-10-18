import { describe, expect, it } from 'vitest'
import { PLOT_BREAKPOINTS, plotSizeOf, widthBucket } from './useElementWidth'

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

describe('widthBucket', () => {
  it('is the highest breakpoint the width has reached, and 0 below them all', () => {
    const marks = [720, 1040] as const
    expect(widthBucket(300, marks)).toBe(0)
    expect(widthBucket(719.9, marks)).toBe(0)
    expect(widthBucket(720, marks)).toBe(720)
    expect(widthBucket(1039, marks)).toBe(720)
    expect(widthBucket(1040, marks)).toBe(1040)
    expect(widthBucket(5000, marks)).toBe(1040)
  })

  it('does not depend on the order of the breakpoints', () => {
    expect(widthBucket(900, [1040, 720])).toBe(720)
  })

  it('leaves the layout choices as they were', () => {
    for (const w of [300, 719, 720, 1039, 1040, 1500]) {
      expect(plotSizeOf(widthBucket(w, PLOT_BREAKPOINTS))).toBe(plotSizeOf(w))
    }
  })
})
