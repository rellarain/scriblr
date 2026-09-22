import { describe, expect, it } from 'vitest'
import { GRID_GAP, MIN_COLUMN, ONE_COLUMN_BELOW, columnsFor, contentTier, isOneColumn } from './tileShapes'

const ALL: Array<'link' | 'small' | 'landscape' | 'portrait' | 'large'> = ['link', 'small', 'landscape', 'portrait', 'large']

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

describe('contentTier', () => {
  it('picks link for a very short box, whatever its width', () => {
    expect(contentTier(600, 40, false, ALL, 'small')).toBe('link')
    expect(contentTier(600, 40, false, ['small', 'large'], 'small')).toBe('small')
  })

  it('picks small/landscape/portrait/large by measured width and height', () => {
    expect(contentTier(200, 100, false, ALL, 'small')).toBe('small')
    expect(contentTier(400, 100, false, ALL, 'small')).toBe('landscape')
    expect(contentTier(200, 300, false, ALL, 'small')).toBe('portrait')
    expect(contentTier(400, 300, false, ALL, 'small')).toBe('large')
  })

  it('never reads as wide in one-column mode, however wide the box actually is', () => {
    expect(contentTier(600, 100, true, ALL, 'small')).toBe('small')
    expect(contentTier(600, 300, true, ALL, 'small')).toBe('portrait')
  })

  it('falls back when the tier the size suggests is not one of the tile\'s allowed shapes', () => {
    expect(contentTier(400, 300, false, ['small'], 'small')).toBe('small')
  })
})
