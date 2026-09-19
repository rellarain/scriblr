import { describe, expect, it } from 'vitest'
import { contrastRatio, inkColor } from './contrast'
import { DEFAULT_PALETTE } from './defaults'
import { ACCENT_L_RANGE, ALERT_L_RANGE, deriveLightness, editSaturation, legalRange, normalizePalette, SAT_STEP } from './paletteRules'
import { contrastBand, deriveTokens, effectiveBrightness, MIN_CONTRAST } from './tokens'
import type { ZonePalette } from './types'

const pal = (over: Partial<ZonePalette> = {}): ZonePalette => ({ ...JSON.parse(JSON.stringify(DEFAULT_PALETTE)), ...over })

describe('contrast', () => {
  it('white on black is 21:1 and identical colors are 1:1', () => {
    expect(contrastRatio({ h: 0, s: 0, l: 100 }, { h: 0, s: 0, l: 0 })).toBeCloseTo(21, 0)
    expect(contrastRatio({ h: 200, s: 40, l: 50 }, { h: 200, s: 40, l: 50 })).toBeCloseTo(1, 5)
  })
})

describe('palette rules', () => {
  const ordered = (p: ZonePalette) =>
    p.theme.s + SAT_STEP <= p.accent.s && p.accent.s + SAT_STEP <= p.alert.s &&
    p.theme.s + SAT_STEP <= p.accent2.s && p.accent2.s + SAT_STEP <= p.alert.s

  it('leaves the default palette unchanged', () => {
    expect(normalizePalette(DEFAULT_PALETTE)).toEqual(DEFAULT_PALETTE)
  })

  it('enforces ordering and is idempotent for random palettes', () => {
    let seed = 42
    const rand = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return Math.floor((seed / 4294967296) * n) }
    for (let i = 0; i < 300; i++) {
      const raw = pal({
        brightness: rand(140) - 20,
        theme: { h: rand(400), s: rand(130) - 10 },
        accent: { h: rand(400), s: rand(130) - 10 },
        alert: { h: rand(400), s: rand(130) - 10 },
        accent2: { h: rand(400), s: rand(130) - 10 },
      })
      const n = normalizePalette(raw)
      expect(ordered(n)).toBe(true)
      expect(n.brightness).toBeGreaterThanOrEqual(0)
      expect(n.brightness).toBeLessThanOrEqual(100)
      for (const k of ['theme', 'accent', 'alert', 'accent2'] as const) {
        expect(n[k].s).toBeGreaterThanOrEqual(0)
        expect(n[k].s).toBeLessThanOrEqual(100)
        expect(n[k].h).toBeGreaterThanOrEqual(0)
        expect(n[k].h).toBeLessThanOrEqual(360)
      }
      expect(normalizePalette(n)).toEqual(n)
    }
  })

  it('pushes higher colors up when theme saturation rises', () => {
    const n = editSaturation(pal(), 'theme', 90)
    expect(n.theme.s).toBe(90)
    expect(n.accent.s).toBe(95)
    expect(n.alert.s).toBe(100)
    expect(ordered(n)).toBe(true)
  })

  it('keeps accent2 between theme and alert and inside its legal range', () => {
    const n = editSaturation(pal(), 'accent2', 100)
    const range = legalRange(pal(), 'accent2')
    expect(n.accent2.s).toBe(range.max)
    expect(editSaturation(pal(), 'accent2', 0).accent2.s).toBe(range.min)
  })

  it('caps theme saturation so accent and alert always fit above it', () => {
    expect(legalRange(pal(), 'theme').max).toBe(100 - 2 * SAT_STEP)
  })
})

describe('deriveLightness', () => {
  it('matches the classic steps at the default brightness', () => {
    expect(deriveLightness(35)).toEqual({ theme: 35, accent: 43, alert: 51, accent2: 43 })
  })

  it('keeps accent and alert inside their visible bands at any brightness', () => {
    for (let b = 0; b <= 100; b++) {
      const l = deriveLightness(b)
      expect(l.theme).toBe(b)
      expect(l.accent).toBeGreaterThanOrEqual(ACCENT_L_RANGE.min)
      expect(l.accent).toBeLessThanOrEqual(ACCENT_L_RANGE.max)
      expect(l.alert).toBeGreaterThanOrEqual(ALERT_L_RANGE.min)
      expect(l.alert).toBeLessThanOrEqual(ALERT_L_RANGE.max)
    }
  })
})

describe('deriveTokens', () => {
  it('reproduces today\'s default colors exactly', () => {
    const v = deriveTokens(DEFAULT_PALETTE, 'admin')
    expect(v['--color-theme-h']).toBe('330')
    expect(v['--color-theme-s']).toBe('30%')
    expect(v['--color-theme-l']).toBe('35%')
    expect(v['--color-accent-h']).toBe('32')
    expect(v['--color-accent-s']).toBe('95%')
    expect(v['--color-accent-l']).toBe('43%')
    expect(v['--color-alert-h']).toBe('200')
    expect(v['--color-alert-s']).toBe('100%')
    expect(v['--color-alert-l']).toBe('51%')
    expect(v['--ink']).toBe('hsl(0, 0%, 100%)')
    expect(v['--on-accent']).toBe('hsl(0, 0%, 100%)')
    expect(v['--paper-l']).toBe('97%')
  })

  it('flags the one intentional difference: the default alert fill gets dark text', () => {
    expect(deriveTokens(DEFAULT_PALETTE, 'user')['--on-alert']).not.toBe('hsl(0, 0%, 100%)')
  })

  it('dark fills get light text, light fills get dark text', () => {
    // A bright zone: the violet accent 2 is a dark-ish fill on a light theme.
    const bright = deriveTokens(pal({ brightness: 92, accent2: { h: 260, s: 60 } }), 'admin')
    expect(bright['--on-accent2']).toBe('hsl(0, 0%, 100%)')
    // A very light accent gets dark text.
    const pale = deriveTokens(pal({ brightness: 35, accent: { h: 60, s: 95 } }), 'admin')
    expect(pale['--on-accent']).not.toBe('hsl(0, 0%, 100%)')
  })

  it('non-admins get accent2 = accent', () => {
    const v = deriveTokens(DEFAULT_PALETTE, 'user')
    expect(v['--color-accent2-h']).toBe(v['--color-accent-h'])
    expect(v['--color-accent2-l']).toBe(v['--color-accent-l'])
  })

  it('a dead-band brightness snaps to a readable side', () => {
    const band = contrastBand(DEFAULT_PALETTE)
    expect(band.maxLight).toBeLessThan(band.minDark)
    const mid = Math.round((band.maxLight + band.minDark) / 2)
    const low = effectiveBrightness(pal({ brightness: mid - 1 }))
    const high = effectiveBrightness(pal({ brightness: mid + 1 }))
    expect(low.mode).toBe('light')
    expect(high.mode).toBe('dark')
  })

  it('keeps every theme tier readable across the whole brightness range', () => {
    for (const h of [0, 60, 120, 180, 240, 300, 330]) {
      for (const s of [0, 40, 90]) {
        for (let b = 0; b <= 100; b += 5) {
          const p = normalizePalette(pal({ brightness: b, theme: { h, s }, accent: { h: 32, s: 95 }, alert: { h: 200, s: 100 } }))
          const { mode, brightness } = effectiveBrightness(p)
          const ink = inkColor(mode, h)
          const base = { h, s: p.theme.s, l: brightness }
          expect(contrastRatio(ink, base)).toBeGreaterThanOrEqual(MIN_CONTRAST)
          const darkest = { h, s: p.theme.s, l: Math.max(0, brightness - 20) }
          const lightest = { h, s: p.theme.s, l: Math.min(100, brightness + 3) } // the raised-active surface
          expect(contrastRatio(ink, darkest)).toBeGreaterThanOrEqual(MIN_CONTRAST)
          expect(contrastRatio(ink, lightest)).toBeGreaterThanOrEqual(MIN_CONTRAST)
        }
      }
    }
  })

  it('accent/alert fills stay at least 3:1 with their own ink', () => {
    for (let b = 0; b <= 100; b += 5) {
      const p = pal({ brightness: b })
      const v = deriveTokens(p, 'admin')
      const num = (key: string) => parseFloat(v[key])
      const parse = (css: string) => { const m = /hsl\((\d+), (\d+)%, (\d+)%\)/.exec(css)!; return { h: +m[1], s: +m[2], l: +m[3] } }
      for (const k of ['accent', 'alert', 'accent2'] as const) {
        const fill = { h: num(`--color-${k}-h`), s: num(`--color-${k}-s`), l: num(`--color-${k}-l`) }
        expect(contrastRatio(parse(v[`--on-${k}`]), fill)).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
