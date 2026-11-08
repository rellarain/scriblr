import { describe, expect, it } from 'vitest'
import { clampListWidth, LIST_DEFAULT_W, LIST_MAX_W, LIST_MIN_W, listVars } from './listWidth'

describe('the width of the cast list', () => {
  it('is held between 160px and 40% of the console, and never more than 420px', () => {
    expect(clampListWidth(50, 1000)).toBe(LIST_MIN_W)
    expect(clampListWidth(300, 1000)).toBe(300)
    expect(clampListWidth(900, 1000)).toBe(400) // 40% of 1000
    expect(clampListWidth(900, 2000)).toBe(LIST_MAX_W) // 40% of 2000 is 800: the 420px cap
    expect(clampListWidth(250.4, 1000)).toBe(250) // whole pixels
  })

  it('is never under the minimum, however narrow the console', () => {
    expect(clampListWidth(300, 300)).toBe(LIST_MIN_W)
    expect(clampListWidth(300, 0)).toBe(LIST_MIN_W)
    expect(clampListWidth(-5, 1000)).toBe(LIST_MIN_W)
  })

  it('has a default that is within its own limits', () => {
    expect(LIST_DEFAULT_W).toBeGreaterThanOrEqual(LIST_MIN_W)
    expect(LIST_DEFAULT_W).toBeLessThanOrEqual(LIST_MAX_W)
    expect(clampListWidth(LIST_DEFAULT_W, 860)).toBe(LIST_DEFAULT_W)
  })

  it('gives the column its width in CSS with the same limits again, and nothing for the default', () => {
    expect(listVars(null)).toEqual({})
    expect(listVars(300)).toEqual({ '--char-list-w': 'min(max(300px, 160px), 420px, 40%)' })
  })
})
