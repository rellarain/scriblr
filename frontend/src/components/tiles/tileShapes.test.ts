import { describe, expect, it } from 'vitest'
import { ONE_COLUMN_BELOW, isOneColumn } from './tileShapes'

describe('isOneColumn', () => {
  it('is one column below 400px of container width', () => {
    expect(isOneColumn(ONE_COLUMN_BELOW - 1)).toBe(true)
    expect(isOneColumn(ONE_COLUMN_BELOW)).toBe(false)
    expect(isOneColumn(0)).toBe(true)
  })
})
