import { describe, expect, it } from 'vitest'
import { GRID_GAP, MIN_COLUMN, ONE_COLUMN_BELOW, TILE_SHAPES, columnsFor, heightOfRows, isOneColumn, isRowVersion, spanOf } from './tileShapes'

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

describe('spanOf', () => {
  it('lays each shape out in the wide grid', () => {
    expect(spanOf('link', 4)).toEqual({ cols: 1, rows: 1 })
    expect(spanOf('small', 4)).toEqual({ cols: 1, rows: 3 })
    expect(spanOf('landscape', 4)).toEqual({ cols: 2, rows: 3 })
    expect(spanOf('portrait', 4)).toEqual({ cols: 1, rows: 5 })
    expect(spanOf('large', 4)).toEqual({ cols: 2, rows: 5 })
  })

  it('never spans more columns than the grid has', () => {
    for (const shape of TILE_SHAPES) expect(spanOf(shape, 2).cols).toBeLessThanOrEqual(2)
    expect(spanOf('landscape', 1).cols).toBe(1)
  })

  it('makes one column of rows: link 1, small and landscape 2, portrait and large keep their height', () => {
    expect(spanOf('link', 1)).toEqual({ cols: 1, rows: 1 })
    expect(spanOf('small', 1)).toEqual({ cols: 1, rows: 2 })
    expect(spanOf('landscape', 1)).toEqual({ cols: 1, rows: 2 })
    expect(spanOf('portrait', 1)).toEqual({ cols: 1, rows: 5 })
    expect(spanOf('large', 1)).toEqual({ cols: 1, rows: 5 })
  })
})

describe('isRowVersion', () => {
  it('applies to small and landscape tiles in one column only', () => {
    expect(isRowVersion('small', true)).toBe(true)
    expect(isRowVersion('landscape', true)).toBe(true)
    expect(isRowVersion('portrait', true)).toBe(false)
    expect(isRowVersion('link', true)).toBe(false)
    expect(isRowVersion('small', false)).toBe(false)
  })
})

describe('heightOfRows', () => {
  it('counts the gaps between rows', () => {
    expect(heightOfRows(1)).toBe(46)
    expect(heightOfRows(3)).toBe(3 * 46 + 2 * 8)
  })
})
