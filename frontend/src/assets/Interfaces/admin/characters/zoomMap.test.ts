import { describe, expect, it } from 'vitest'
import { ZOOM_MAX, ZOOM_MIN, clampZoom, sliderToZoom, wheelZoom, zoomText, zoomToSlider } from './zoomMap'

describe('the zoom slider', () => {
  it('maps a zoom to the slider and back along a log scale', () => {
    expect(zoomToSlider(ZOOM_MIN)).toBeCloseTo(0, 6)
    expect(zoomToSlider(ZOOM_MAX)).toBeCloseTo(1, 6)
    for (const z of [0.25, 0.5, 1, 2, 4, 8]) expect(sliderToZoom(zoomToSlider(z))).toBeCloseTo(z, 6)
    expect(zoomToSlider(1)).toBeCloseTo(0.4, 1)
  })
  it('clamps what is out of range or not a number', () => {
    expect(clampZoom(100)).toBe(ZOOM_MAX)
    expect(clampZoom(0.001)).toBe(ZOOM_MIN)
    expect(clampZoom(NaN)).toBe(1)
    expect(sliderToZoom(5)).toBe(ZOOM_MAX)
    expect(sliderToZoom(-5)).toBe(ZOOM_MIN)
  })
  it('zooms in when the wheel scrolls down over it and out when it scrolls up', () => {
    expect(wheelZoom(1, 100)).toBeGreaterThan(1)
    expect(wheelZoom(1, -100)).toBeLessThan(1)
    expect(wheelZoom(1, 0)).toBe(1)
    expect(wheelZoom(ZOOM_MAX, 100)).toBe(ZOOM_MAX)
    expect(wheelZoom(ZOOM_MIN, -100)).toBe(ZOOM_MIN)
    expect(wheelZoom(1, 300)).toBeGreaterThan(wheelZoom(1, 100))
  })
  it('writes a zoom as a percent', () => {
    expect(zoomText(1)).toBe('100%')
    expect(zoomText(2.5)).toBe('250%')
  })
})
