// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TAPER_MAX_SPINE, resample, taperOutline, type SpinePoint } from './taper'

const line = (n: number): SpinePoint[] => Array.from({ length: n }, (_, i) => [10 + i * 10, 50])

describe('a tapered ribbon along a spine', () => {
  it('resamples a long spine to at most twelve points, evenly, keeping its ends', () => {
    const r = resample(line(40))
    expect(r).toHaveLength(TAPER_MAX_SPINE)
    expect(r[0]).toEqual([10, 50]); expect(r[r.length - 1]).toEqual([400, 50])
    const gaps = r.slice(1).map((p, i) => p[0] - r[i][0])
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6)
    expect(resample(line(5))).toEqual(line(5))
  })

  it('swells from the ends to the middle, centred on the spine, coming to a point at each end', () => {
    const pts = taperOutline(line(5), { w0: 0, wm: 8, w1: 0, side: 0, pointed: true })!
    expect(pts).toHaveLength(8)
    expect(pts[0]).toMatchObject({ x: 10, y: 50, m: 's' })
    expect(pts[4]).toMatchObject({ x: 50, y: 50, m: 's' })
    // the middle of the spine (x 30) is 8 wide: 4 each side
    const atMiddle = pts.filter(p => p.x === 30).map(p => p.y).sort((a, b) => a - b)
    expect(atMiddle).toEqual([46, 54])
  })

  it('keeps two points at each end when they are not pointed, and lies to one side when asked', () => {
    const pts = taperOutline(line(3), { w0: 4, wm: 4, w1: 4, side: 1, pointed: false })!
    expect(pts).toHaveLength(6)
    // all of the width on one side: one side runs along the spine itself
    expect(pts.slice(3).every(p => p.y === 50)).toBe(true)
    expect(pts.slice(0, 3).every(p => Math.abs(p.y - 50) === 4)).toBe(true)
  })

  it('makes a ribbon of a straight spine of two points, and nothing of fewer', () => {
    expect(taperOutline([[0, 0], [20, 0]], { w0: 0, wm: 2, w1: 0, side: 0, pointed: true })).toHaveLength(4)
    expect(taperOutline([[0, 0]])).toBeNull()
    expect(taperOutline([[0, 0], [0, 0]])).toBeNull()
  })

  it('is finite and closed for any spine and widths', () => {
    const spine: SpinePoint[] = [[0, 0], [5, 20], [-3, 40], [10, 60], [10, 60.0000001], [30, 70]]
    for (const spec of [{ w0: -5, wm: 1e6, w1: Number.NaN, side: 7, pointed: false }, { w0: 3, wm: 0, w1: 3, side: -1, pointed: true }]) {
      const pts = taperOutline(spine, spec)!
      expect(pts.length).toBeGreaterThanOrEqual(3)
      expect(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
    }
  })
})
