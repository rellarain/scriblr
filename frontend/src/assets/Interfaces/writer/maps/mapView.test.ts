import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, cellAt, distanceBetween, fitView, formatDistance, nearestCell, panBy, zoomAt } from './mapView'

describe('the map view', () => {
  it('fits the whole map in the canvas, centred', () => {
    const v = fitView(100, 50, 832, 432)
    expect(v.zoom).toBe(8)
    expect(v.x).toBe(16)
    expect(v.y).toBe(16)
    expect(fitView(10, 10, 200, 100)).toEqual({ zoom: 6.8, x: 66, y: 16 })
  })

  it('never zooms past its limits', () => {
    expect(fitView(1, 1, 2000, 2000).zoom).toBe(MAX_ZOOM)
    expect(fitView(512, 512, 100, 100).zoom).toBe(MIN_ZOOM)
    expect(zoomAt({ zoom: MAX_ZOOM, x: 0, y: 0 }, 2, 5, 5).zoom).toBe(MAX_ZOOM)
    expect(zoomAt({ zoom: MIN_ZOOM, x: 0, y: 0 }, 0.5, 5, 5).zoom).toBe(MIN_ZOOM)
  })

  it('finds the cell under a point and none off the map', () => {
    const view = { zoom: 10, x: 20, y: 30 }
    expect(cellAt(view, 20, 30, 5, 5)).toEqual([0, 0])
    expect(cellAt(view, 29.9, 39.9, 5, 5)).toEqual([0, 0])
    expect(cellAt(view, 30, 30, 5, 5)).toEqual([1, 0])
    expect(cellAt(view, 19, 30, 5, 5)).toBeNull()
    expect(cellAt(view, 70, 30, 5, 5)).toBeNull()
    expect(cellAt(view, 20, 80, 5, 5)).toBeNull()
  })

  it('holds a point past the edge to the nearest cell', () => {
    const view = { zoom: 10, x: 20, y: 30 }
    expect(nearestCell(view, -50, -50, 5, 5)).toEqual([0, 0])
    expect(nearestCell(view, 500, 500, 5, 5)).toEqual([4, 4])
    expect(nearestCell(view, 45, 55, 5, 5)).toEqual([2, 2])
  })

  it('keeps the point under the pointer still while zooming', () => {
    const view = { zoom: 10, x: 20, y: 30 }
    const px = 100, py = 90
    const next = zoomAt(view, 2, px, py)
    expect(next.zoom).toBe(20)
    expect(cellAt(next, px, py, 100, 100)).toEqual(cellAt(view, px, py, 100, 100))
    expect((px - next.x) / next.zoom).toBeCloseTo((px - view.x) / view.zoom)
  })

  it('pans, but keeps some of the map in view', () => {
    const view = { zoom: 10, x: 0, y: 0 }
    expect(panBy(view, 30, -20, 10, 10, 400, 300)).toEqual({ zoom: 10, x: 30, y: -20 })
    expect(panBy(view, 9999, 9999, 10, 10, 400, 300)).toEqual({ zoom: 10, x: 352, y: 252 })
    expect(panBy(view, -9999, -9999, 10, 10, 400, 300)).toEqual({ zoom: 10, x: -52, y: -52 })
  })

  it('measures distance between cells in the map\'s unit', () => {
    expect(distanceBetween([0, 0], [3, 4], 10)).toBe(50)
    expect(distanceBetween([2, 2], [2, 2], 10)).toBe(0)
    expect(formatDistance(12.345, 'miles')).toBe('12.3 miles')
    expect(formatDistance(1234.5, 'paces')).toBe('1235 paces')
    expect(formatDistance(0, 'ft')).toBe('0 ft')
  })
})
