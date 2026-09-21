import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'
import { DEFAULT_PALETTE } from './defaults'
import { editHue, normalizePalette } from './paletteRules'
import type { ZonePalette } from './types'

describe('contrast', () => {
  it('white on black is 21:1 and identical colors are 1:1', () => {
    expect(contrastRatio({ h: 0, s: 0, l: 100 }, { h: 0, s: 0, l: 0 })).toBeCloseTo(21, 0)
    expect(contrastRatio({ h: 200, s: 40, l: 50 }, { h: 200, s: 40, l: 50 })).toBeCloseTo(1, 5)
  })
})

describe('palette rules', () => {
  it('leaves the default hues unchanged', () => {
    expect(normalizePalette(DEFAULT_PALETTE)).toEqual(DEFAULT_PALETTE)
  })

  it('keeps only whole hues in 0..360, and is idempotent', () => {
    let seed = 42
    const rand = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return Math.floor((seed / 4294967296) * n) }
    for (let i = 0; i < 200; i++) {
      const raw = {
        theme: { h: rand(500) - 60 }, accent: { h: rand(500) - 60 }, alert: { h: rand(500) - 60 }, accent2: { h: rand(500) - 60 },
      }
      const n = normalizePalette(raw)
      for (const k of ['theme', 'accent', 'alert', 'accent2'] as const) {
        expect(Number.isInteger(n[k].h)).toBe(true)
        expect(n[k].h).toBeGreaterThanOrEqual(0)
        expect(n[k].h).toBeLessThanOrEqual(360)
      }
      expect(normalizePalette(n)).toEqual(n)
    }
  })

  it('drops the saturation and brightness that older versions saved', () => {
    const old = {
      brightness: 35,
      theme: { h: 330, s: 30 }, accent: { h: 32, s: 95 }, alert: { h: 200, s: 100 }, accent2: { h: 260, s: 60 },
    } as unknown as ZonePalette
    expect(normalizePalette(old)).toEqual(DEFAULT_PALETTE)
  })

  it('changes just the one hue', () => {
    const next = editHue(DEFAULT_PALETTE, 'accent', 90)
    expect(next.accent.h).toBe(90)
    expect(next.theme).toEqual(DEFAULT_PALETTE.theme)
    expect(editHue(DEFAULT_PALETTE, 'alert', 999).alert.h).toBe(360)
  })
})
