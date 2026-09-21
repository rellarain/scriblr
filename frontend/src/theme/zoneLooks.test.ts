import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE } from './defaults'
import { contrastRatio } from './contrast'
import { deriveTokens } from './tokens'
import { DIM_STEP, HOVER_STEP, INK_STRENGTH, MIN_TEXT_GAP, PAPER_LOOKS, SURFACE_OFFSETS, ZONE_LOOKS, fillInk, resolvePalette, zoneInk } from './zoneLooks'
import { ZONE_KEYS, type ZoneKey } from './types'

// The rule: text is at least MIN_TEXT_GAP HSL lightness points from what it sits on.
// (HSL lightness does not depend on hue or saturation, so one pair of numbers
// covers every hue the user can pick.)
const clamp = (n: number) => Math.min(100, Math.max(0, n))
const gap = (a: number, b: number) => Math.abs(a - b)
// A translucent ink over a background: the lightness the text actually shows at.
const over = (ink: number, bg: number, alpha: number) => bg + alpha * (ink - bg)

// The overlays the theme's surfaces can carry (--ov-sink-*: black at 0.16 / 0.25 / 0.35 times --shade-k),
// which darken a surface below its tier.
const SINK = [0, 0.16, 0.25, 0.35]

const inkL = (zone: ZoneKey) => zoneInk(ZONE_LOOKS[zone].mode, 0).l

describe.each(ZONE_KEYS)('%s look', zone => {
  const look = ZONE_LOOKS[zone]

  it('keeps the saturation order theme < accents < alert, and the admin accent is the accent\'s twin', () => {
    expect(look.themeS).toBeLessThan(look.accentS)
    expect(look.accentS).toBeLessThan(look.alertS)
    const c = resolvePalette(DEFAULT_PALETTE, zone)
    expect([c.accent2.s, c.accent2.l]).toEqual([c.accent.s, c.accent.l])
  })

  it('is dark or light as it says', () => {
    expect(look.themeL < 50).toBe(look.mode === 'dark')
  })

  it('keeps every theme surface 30+ points from the ink, and from its muted and faint versions', () => {
    const shadeK = look.mode === 'dark' ? 1 : 0.55
    const { muted, faint } = INK_STRENGTH[look.mode]
    for (const offset of SURFACE_OFFSETS) {
      for (const sink of SINK) {
        const bg = clamp(look.themeL + offset) * (1 - sink * shadeK)
        expect(gap(inkL(zone), bg)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
        expect(gap(over(inkL(zone), bg, muted / 100), bg)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
        expect(gap(over(inkL(zone), bg, faint / 100), bg)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
      }
    }
  })

  it('picks the better ink for every hue, 30+ points from the fill and from its hover and dim shades', () => {
    for (const [s, l] of [[look.accentS, look.accentL], [look.alertS, look.alertL]]) {
      for (let h = 0; h < 360; h += 5) {
        const fill = { h, s, l }
        const { ink, dir } = fillInk(fill, 330)
        expect(gap(ink.l, l)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
        const other = ink.l > 50 ? { h: 330, s: 12, l: 8 } : { h: 0, s: 0, l: 100 }
        const best = contrastRatio(ink, fill)
        expect(best).toBeGreaterThanOrEqual(contrastRatio(other, fill))
        expect(best).toBeGreaterThanOrEqual(4.2) // the worst case of the better of the two inks
        for (const step of [HOVER_STEP, DIM_STEP]) {
          const shade = { h, s, l: clamp(l + step * dir) }
          expect(gap(ink.l, shade.l)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
          expect(contrastRatio(ink, shade)).toBeGreaterThanOrEqual(best - 0.01) // stepping away never hurts
        }
      }
    }
  })

  it('keeps the Writer page text 30+ points from the page, its cards and its fields', () => {
    const paper = PAPER_LOOKS[look.mode]
    // The steps the page's surfaces are written with: paper-l - n * dir (a field is n = -3).
    for (const n of [0, 1, 2, 3, 5, 6, -3]) {
      const bg = look.paperL - n * paper.dir
      // The page's error text is the alert colour itself.
      for (const text of [paper.ink, paper.ink2, paper.label, paper.muted, paper.placeholder, look.alertL]) {
        expect(gap(text, bg)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
      }
      // Draft mode's numbers and descriptions are the page ink at 60% and 75%.
      for (const alpha of [0.6, 0.75]) expect(gap(over(paper.ink, bg, alpha), bg)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
    }
  })

  it('keeps the reaction bars\' text 30+ points from their fill', () => {
    const paper = PAPER_LOOKS[look.mode]
    expect(gap(paper.like, paper.react)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
    expect(gap(look.alertL, paper.react)).toBeGreaterThanOrEqual(MIN_TEXT_GAP)
  })

  it('shows the page in the same direction as the zone', () => {
    expect(PAPER_LOOKS[look.mode].dir).toBe(look.mode === 'light' ? 1 : -1)
    expect(look.paperL < 50).toBe(look.mode === 'dark')
  })

  it('resolves to the look for any hues', () => {
    const c = resolvePalette({ theme: { h: 10 }, accent: { h: 20 }, alert: { h: 30 }, accent2: { h: 40 } }, zone)
    expect(c.theme).toEqual({ h: 10, s: look.themeS, l: look.themeL })
    expect(c.accent).toEqual({ h: 20, s: look.accentS, l: look.accentL })
    expect(c.alert).toEqual({ h: 30, s: look.alertS, l: look.alertL })
    expect(c.accent2).toEqual({ h: 40, s: look.accentS, l: look.accentL })
  })
})

describe('the four looks', () => {
  it('is dark and light text at night and dusk, light and dark text at day and dawn', () => {
    expect(ZONE_LOOKS.night.mode).toBe('dark')
    expect(ZONE_LOOKS.dusk.mode).toBe('dark')
    expect(ZONE_LOOKS.day.mode).toBe('light')
    expect(ZONE_LOOKS.dawn.mode).toBe('light')
  })

  it('is less saturated at night and dawn than at day and dusk', () => {
    for (const quiet of ['night', 'dawn'] as const) {
      for (const vivid of ['day', 'dusk'] as const) {
        expect(ZONE_LOOKS[quiet].themeS).toBeLessThan(ZONE_LOOKS[vivid].themeS)
        expect(ZONE_LOOKS[quiet].accentS).toBeLessThan(ZONE_LOOKS[vivid].accentS)
        expect(ZONE_LOOKS[quiet].alertS).toBeLessThan(ZONE_LOOKS[vivid].alertS)
      }
    }
  })
})

describe('deriveTokens', () => {
  it('writes the Day look for the default hues', () => {
    const v = deriveTokens(DEFAULT_PALETTE, 'admin', 'day')
    expect(v['--color-theme-h']).toBe('330')
    expect(v['--color-theme-s']).toBe('30%')
    expect(v['--color-theme-l']).toBe('86%')
    expect(v['--color-accent-s']).toBe('80%')
    expect(v['--color-accent-l']).toBe('42%')
    expect(v['--color-alert-s']).toBe('100%')
    expect(v['--color-alert-l']).toBe('46%')
    expect(v['--color-accent2-h']).toBe('260')
    expect(v['--color-accent2-l']).toBe('42%')
    expect(v['--paper-l']).toBe('97%')
    expect(v['--paper-dir']).toBe('1')
  })

  it('uses the zone ink for the theme and picks the text of each fill for that fill', () => {
    const day = deriveTokens(DEFAULT_PALETTE, 'admin', 'day')
    expect(day['--ink']).toBe('hsl(330, 12%, 8%)')
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'night')['--ink']).toBe('hsl(0, 0%, 100%)')
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'night')['--paper-dir']).toBe('-1')
    // the default violet admin accent is dark in the light zones (light text), the orange accent is light (dark text)
    expect(day['--on-accent2']).toBe('hsl(0, 0%, 100%)')
    expect(day['--on-accent']).toBe('hsl(330, 12%, 8%)')
    // a yellow accent at night gets dark text, not the white the zone ink would give
    const yellow = { ...DEFAULT_PALETTE, accent: { h: 60 } }
    expect(deriveTokens(yellow, 'user', 'night')['--on-accent']).toBe('hsl(330, 12%, 8%)')
  })

  it('steps hovers and dims of each fill away from the text on it', () => {
    const day = deriveTokens(DEFAULT_PALETTE, 'admin', 'day')
    expect([day['--accent-dir'], day['--accent2-dir'], day['--accent-away'], day['--accent2-away']]).toEqual(['1', '-1', 'hsl(0, 0%, 100%)', 'hsl(0, 0%, 0%)'])
    expect(deriveTokens({ ...DEFAULT_PALETTE, accent: { h: 60 } }, 'user', 'night')['--accent-dir']).toBe('1')
  })

  it('gives non-admins the accent in place of the admin accent', () => {
    const v = deriveTokens(DEFAULT_PALETTE, 'user', 'dusk')
    expect(v['--color-accent2-h']).toBe(v['--color-accent-h'])
    expect(v['--color-accent2-l']).toBe(v['--color-accent-l'])
  })

  it('takes its hues from the palette and everything else from the zone', () => {
    const pal = { theme: { h: 100 }, accent: { h: 200 }, alert: { h: 300 }, accent2: { h: 50 } }
    const v = deriveTokens(pal, 'admin', 'night')
    expect(v['--color-theme-h']).toBe('100')
    expect(v['--color-accent-h']).toBe('200')
    expect(v['--color-alert-h']).toBe('300')
    expect(v['--color-accent2-h']).toBe('50')
    expect(v['--color-theme-l']).toBe('26%')
    expect(v['--color-alert-s']).toBe('70%')
  })
})
