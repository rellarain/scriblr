import { describe, expect, it } from 'vitest'
import { gridStep, isMajor, majorStep, snapTo } from './gridSnap'

describe('the grid', () => {
  it('has a line every 2 units at the normal zoom, then 1 and 0.5 as the view closes in', () => {
    expect(gridStep(232)).toBe(2)
    expect(gridStep(194)).toBe(2)
    expect(gridStep(120)).toBe(1)
    expect(gridStep(60)).toBe(1)
    expect(gridStep(40)).toBe(0.5)
    expect(gridStep(10)).toBe(0.5)
  })
  it('spreads its lines when the view is so wide that they would crowd, and never has more than 160 across', () => {
    for (const w of [320, 321, 500, 777, 930, 1600, 3200, 8000]) {
      const step = gridStep(w)
      expect(w / step, `${w}`).toBeLessThanOrEqual(160)
    }
    expect(gridStep(777)).toBe(5)
    expect(gridStep(930)).toBe(10)
  })
  it('copes with a view of no width', () => {
    for (const w of [0, -5, Number.NaN, Infinity]) expect(Number.isFinite(gridStep(w))).toBe(true)
  })
  it('has a stronger line every 10 units, or every 50 once the lines are 10 apart or more', () => {
    expect(majorStep(2)).toBe(10)
    expect(majorStep(5)).toBe(10)
    expect(majorStep(10)).toBe(50)
    expect([0, 10, 20, -30, 100].every(v => isMajor(v, 2))).toBe(true)
    expect([2, 4, 8, 12, 0.5, 35].some(v => isMajor(v, 2))).toBe(false)
    expect(isMajor(50, 10)).toBe(true)
    expect(isMajor(30, 10)).toBe(false)
  })
})

describe('snapping to the grid', () => {
  it('lands on the nearest line', () => {
    expect(snapTo(70.9, 2)).toBe(70)
    expect(snapTo(71.1, 2)).toBe(72)
    expect(snapTo(-3.2, 2)).toBe(-4)
    expect(snapTo(0.3, 0.5)).toBe(0.5)
    expect(snapTo(12.37, 5)).toBe(10)
  })
  it('gives clean numbers', () => {
    expect(snapTo(0.30000000000000004, 0.1)).toBe(0.3)
    expect(snapTo(1.2000000000000002, 0.2)).toBe(1.2)
  })
  it('leaves a value that is not a number, and a step that is no step, as they are', () => {
    expect(Number.isNaN(snapTo(Number.NaN, 2))).toBe(true)
    expect(snapTo(7.3, 0)).toBe(7.3)
    expect(snapTo(7.3, -2)).toBe(7.3)
  })
})
