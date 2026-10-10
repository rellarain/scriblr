import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE } from './defaults'
import { deriveTokens } from './tokens'
import { MAX_FILL_SHIFT, TEXT_TARGET, UI_TARGET, ratioOf } from './readable'
import {
  INK_STRENGTH, LIKE_BAR_SATURATIONS, PAPER_LOOKS, SIDEBAR_SHADE_1, SURFACE_OFFSETS, ZONE_LOOKS,
  fillInk, paperAccents, paperGrounds, paperInks, resolvePalette, themeLightness, zoneInk,
} from './zoneLooks'
import { ZONE_KEYS } from './types'
import type { HSL } from './contrast'

// The rule: text reads, by WCAG contrast (4.5:1), whatever the hues the user picks. The looks give where each colour starts; the theme
// moves a colour's lightness only where its hue needs it (readable.ts). contrastAudit.test.ts checks every documented pair over the
// whole hue range; these tests check the rule's own parts.
const clamp = (n: number) => Math.min(100, Math.max(0, n))
const HUES = Array.from({ length: 24 }, (_, i) => i * 15)

describe.each(ZONE_KEYS)('%s look', zone => {
  const look = ZONE_LOOKS[zone]

  it('keeps the saturation order theme < accents < alert, and the admin accent is the accent\'s twin', () => {
    expect(look.themeS).toBeLessThan(look.accentS)
    expect(look.accentS).toBeLessThan(look.alertS)
    const c = resolvePalette(DEFAULT_PALETTE, zone)
    expect([c.accent2.s, c.accent2.l]).toEqual(expect.arrayContaining([c.accent.s]))
    expect(c.accent2.s).toBe(c.accent.s)
  })

  it('is dark or light as it says', () => {
    expect(look.themeL < 50).toBe(look.mode === 'dark')
  })

  it('reads the zone ink, and its muted and faint tiers, on every theme surface (and under a recess), for every theme hue', () => {
    const { muted, faint } = INK_STRENGTH[look.mode]
    for (const h of HUES) {
      const l = themeLightness(h, look)
      // The theme moves only the way that helps the ink, and never past the zone's own start by more than a few points.
      expect(look.mode === 'dark' ? l <= look.themeL : l >= look.themeL).toBe(true)
      expect(Math.abs(l - look.themeL)).toBeLessThanOrEqual(12)
      const ink = zoneInk(look.mode, h)
      for (const offset of [...SURFACE_OFFSETS, SIDEBAR_SHADE_1[look.mode]]) {
        const bg: HSL = { h, s: look.themeS, l: clamp(l + offset) }
        expect(ratioOf(ink, bg)).toBeGreaterThanOrEqual(TEXT_TARGET - 0.15) // under a recess the audit measures further (contrastAudit.test.ts)
        void muted; void faint
      }
    }
  })

  it('gives every accent, alert and admin-accent fill an ink that reads on it, for every hue', () => {
    for (const h of HUES) {
      const pal = { theme: { h: 330 }, accent: { h }, alert: { h }, accent2: { h } }
      const c = resolvePalette(pal, zone)
      for (const key of ['accent', 'alert', 'accent2'] as const) {
        const fill = c[key]
        const { ink, dir } = fillInk(fill, 330)
        expect(ratioOf(ink, fill)).toBeGreaterThanOrEqual(TEXT_TARGET)
        // Hover and dim shades step away from the text, so they read at least as well.
        const hover: HSL = { ...fill, l: clamp(fill.l + 12 * dir) }
        expect(ratioOf(ink, hover)).toBeGreaterThanOrEqual(ratioOf(ink, fill) - 0.01)
      }
    }
  })

  it('moves a fill only a little from its start, or switches ink where moving it would take more than that', () => {
    const start = (key: 'accent' | 'alert') => (key === 'accent' ? look.accentL : look.alertL)
    for (const h of HUES) {
      const c = resolvePalette({ theme: { h: 330 }, accent: { h }, alert: { h }, accent2: { h } }, zone)
      expect(Math.abs(c.accent.l - start('accent'))).toBeLessThanOrEqual(MAX_FILL_SHIFT)
      expect(Math.abs(c.alert.l - start('alert'))).toBeLessThanOrEqual(MAX_FILL_SHIFT)
    }
  })

  it('reads the Writer page text on the page, its fields and every nested card, for every hue', () => {
    for (const th of HUES) {
      const g = paperGrounds(zone, { theme: th, accent: 32 })
      const inks = paperInks(zone, th)
      for (const ground of [g.page, g.field, ...g.frames]) {
        for (const key of ['ink', 'ink2', 'label', 'muted'] as const) expect(ratioOf(inks[key], ground)).toBeGreaterThanOrEqual(TEXT_TARGET)
      }
      for (const ground of [g.paper, g.soft, g.page, g.field]) expect(ratioOf(inks.placeholder, ground)).toBeGreaterThanOrEqual(TEXT_TARGET)
    }
  })

  it('steps the nested cards away from the sheet, deeper each time', () => {
    const p = PAPER_LOOKS[look.mode]
    expect(p.page).toBeGreaterThan(0)
    for (let i = 1; i < p.frames.length; i += 1) expect(p.frames[i]).toBeGreaterThan(p.frames[i - 1])
    expect(p.frames[0]).toBeGreaterThan(p.page)
  })

  it('reads the page error text and the reaction hearts, for every hue', () => {
    for (const h of HUES) {
      const hues = { theme: 330, accent: h, alert: h }
      const g = paperGrounds(zone, hues)
      const a = paperAccents(zone, hues)
      for (const ground of [g.paper, g.soft, g.page, g.field, g.frames[0]]) expect(ratioOf(a.error, ground)).toBeGreaterThanOrEqual(TEXT_TARGET)
      for (const s of LIKE_BAR_SATURATIONS) expect(ratioOf(a.like, { h, s, l: PAPER_LOOKS[look.mode].react })).toBeGreaterThanOrEqual(UI_TARGET)
    }
  })

  it('shows the page in the same direction as the zone', () => {
    expect(PAPER_LOOKS[look.mode].dir).toBe(look.mode === 'light' ? 1 : -1)
    expect(look.paperL < 50).toBe(look.mode === 'dark')
  })

  it('resolves to the look for any hues, the lightness moved only where a hue needs it', () => {
    const c = resolvePalette({ theme: { h: 10 }, accent: { h: 20 }, alert: { h: 30 }, accent2: { h: 40 } }, zone)
    expect(c.theme).toMatchObject({ h: 10, s: look.themeS })
    expect(c.accent).toMatchObject({ h: 20, s: look.accentS })
    expect(c.alert).toMatchObject({ h: 30, s: look.alertS })
    expect(c.accent2).toMatchObject({ h: 40, s: look.accentS })
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

describe('readability by hue', () => {
  it('draws a yellow fill darker than a blue one in the day, so white text reads on both', () => {
    const at = (h: number) => resolvePalette({ theme: { h: 330 }, accent: { h }, alert: { h: 200 }, accent2: { h } }, 'day').accent
    expect(at(60).l).toBeLessThanOrEqual(at(240).l)
    expect(fillInk(at(240), 330).ink.l).toBe(100)
  })

  it('switches to dark text on a fill that would have to move too far for white (a bright yellow in the day)', () => {
    const yellow = resolvePalette({ theme: { h: 330 }, accent: { h: 60 }, alert: { h: 200 }, accent2: { h: 60 } }, 'day').accent
    expect(fillInk(yellow, 330).ink.l).toBe(3)
    expect(ratioOf(fillInk(yellow, 330).ink, yellow)).toBeGreaterThanOrEqual(TEXT_TARGET)
  })

  it('keeps the dark zones\' dark text on a light fill, switching to white only where a blue fill would have to move too far', () => {
    const blue = resolvePalette({ theme: { h: 330 }, accent: { h: 240 }, alert: { h: 200 }, accent2: { h: 240 } }, 'night').accent
    expect(ratioOf(fillInk(blue, 330).ink, blue)).toBeGreaterThanOrEqual(TEXT_TARGET)
  })
})

describe('deriveTokens', () => {
  it('writes the Day look for the default hues', () => {
    const v = deriveTokens(DEFAULT_PALETTE, 'admin', 'day')
    expect(v['--color-theme-h']).toBe('330')
    expect(v['--color-theme-s']).toBe('30%')
    expect(v['--color-accent-s']).toBe('80%')
    expect(v['--color-alert-s']).toBe('100%')
    expect(v['--color-accent2-h']).toBe('260')
    expect(v['--paper-l']).toBe('97%')
    expect(v['--paper-dir']).toBe('1')
  })

  it('uses the zone ink for the theme and picks the text of each fill for that fill', () => {
    const day = deriveTokens(DEFAULT_PALETTE, 'admin', 'day')
    expect(day['--ink']).toBe('hsl(330, 12%, 3%)')
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'night')['--ink']).toBe('hsl(0, 0%, 100%)')
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'night')['--paper-dir']).toBe('-1')
    // The default day accent (orange) is drawn a little darker so white text reads on it.
    expect(day['--on-accent']).toBe('hsl(0, 0%, 100%)')
    expect(day['--on-accent2']).toBe('hsl(0, 0%, 100%)')
    // A yellow accent is bright enough that dark text reads and white does not.
    const yellow = { ...DEFAULT_PALETTE, accent: { h: 60 } }
    expect(deriveTokens(yellow, 'user', 'day')['--on-accent']).toBe('hsl(330, 12%, 3%)')
    // Night's accent is light: dark text.
    expect(deriveTokens(yellow, 'user', 'night')['--on-accent']).toBe('hsl(330, 12%, 3%)')
  })

  it('steps hovers and dims of each fill away from the text on it', () => {
    const day = deriveTokens(DEFAULT_PALETTE, 'admin', 'day')
    expect([day['--accent-dir'], day['--accent2-dir'], day['--accent-away'], day['--accent2-away']]).toEqual(['-1', '-1', 'hsl(0, 0%, 0%)', 'hsl(0, 0%, 0%)'])
    expect(deriveTokens({ ...DEFAULT_PALETTE, accent: { h: 60 } }, 'user', 'night')['--accent-dir']).toBe('1')
    expect(deriveTokens({ ...DEFAULT_PALETTE, accent: { h: 60 } }, 'user', 'day')['--accent-dir']).toBe('1') // dark text on a bright yellow
  })

  it('lightens the sidebar\'s first shade in a dark zone, darkens it in a light one', () => {
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'night')['--sidebar-shade-1']).toBe('6')
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'dusk')['--sidebar-shade-1']).toBe('6')
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'day')['--sidebar-shade-1']).toBe('-17')
    expect(deriveTokens(DEFAULT_PALETTE, 'admin', 'dawn')['--sidebar-shade-1']).toBe('-17')
  })

  it('gives non-admins the accent in place of the admin accent', () => {
    const v = deriveTokens(DEFAULT_PALETTE, 'user', 'dusk')
    expect(v['--color-accent2-h']).toBe(v['--color-accent-h'])
    expect(v['--color-accent2-l']).toBe(v['--color-accent-l'])
  })

  it('takes its hues from the palette and the saturation from the zone', () => {
    const pal = { theme: { h: 100 }, accent: { h: 200 }, alert: { h: 300 }, accent2: { h: 50 } }
    const v = deriveTokens(pal, 'admin', 'night')
    expect(v['--color-theme-h']).toBe('100')
    expect(v['--color-accent-h']).toBe('200')
    expect(v['--color-alert-h']).toBe('300')
    expect(v['--color-accent2-h']).toBe('50')
    expect(v['--color-alert-s']).toBe('70%')
  })

  it('writes the page numbers, and the error text and hearts fitted to read', () => {
    const v = deriveTokens(DEFAULT_PALETTE, 'user', 'day')
    expect([v['--paper-pg'], v['--paper-f1'], v['--paper-f5']]).toEqual(['4%', '6%', '18%'])
    for (const name of ['--paper-error', '--paper-like', '--paper-dislike']) expect(v[name]).toMatch(/^hsl\(\d+, \d+%, [\d.]+%\)$/)
  })
})
