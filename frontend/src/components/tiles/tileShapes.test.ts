import { describe, expect, it } from 'vitest'
import { GRID_GAP, MIN_COLUMN, ONE_COLUMN_BELOW, columnsFor, isOneColumn } from './tileShapes'

describe('columnsFor', () => {
  it('is one column below 400px of container width and grows with the width', () => {
    expect(isOneColumn(ONE_COLUMN_BELOW - 1)).toBe(true)
    expect(isOneColumn(ONE_COLUMN_BELOW)).toBe(false)
    expect(columnsFor(0)).toBe(1)
    expect(columnsFor(399)).toBe(1)
    expect(columnsFor(400)).toBe(2)
    expect(columnsFor(3 * MIN_COLUMN + 2 * GRID_GAP)).toBe(3)
    expect(columnsFor(4 * MIN_COLUMN + 3 * GRID_GAP)).toBe(4)
    expect(columnsFor(1200)).toBe(8)
  })

  it('never returns less than one column', () => {
    for (const w of [-10, 0, 1, 139, 140]) expect(columnsFor(w)).toBeGreaterThanOrEqual(1)
  })
})
