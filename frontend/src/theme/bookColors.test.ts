import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOOK_HUE, HUE_CODE_MAX, HUE_CODE_MIN, accentColorCss, bookScopeVars, bookThemeHue, clampCodeToWindow, clampHueToWindow, coverColor,
  fillCap, fillColorCss, fillHsl, hexToHue, hueDelta, hueHsl, hueOfCode, hueWindow, themeColorCss, wrapHue,
} from './bookColors'
import { DEFAULT_PALETTE } from './defaults'
import { deriveTokens } from './tokens'
import { ZONE_LOOKS } from './zoneLooks'
import { readableInk } from './contrast'

describe('hexToHue', () => {
  it('reads the hue of a hex colour', () => {
    expect(hexToHue('#ff0000')).toBe(0)
    expect(hexToHue('#00ff00')).toBe(120)
    expect(hexToHue('#0000ff')).toBe(240)
    expect(hexToHue('3a8fb0')).toBe(197)
    expect(hexToHue('#5a3a1e')).toBe(28)
    expect(hexToHue('#ff00aa')).toBe(320)
  })

  it('has no hue for greys or non-colours', () => {
    expect(hexToHue('#6b6b6b')).toBe(0)
    expect(hexToHue('red')).toBeNull()
    expect(hexToHue(null)).toBeNull()
    expect(hexToHue(undefined)).toBeNull()
  })

  it('matches the backend conversion for every old cover swatch', () => {
    // Same values as backend/tests/test_hues.py (hex_to_hue).
    expect(hexToHue('#3f7a4a')).toBe(131)
  })
})

describe('hue arithmetic', () => {
  it('wraps into 0..359', () => {
    expect(wrapHue(-30)).toBe(330)
    expect(wrapHue(370)).toBe(10)
    expect(wrapHue(360)).toBe(0)
    expect(wrapHue(12.4)).toBe(12)
  })

  it('measures the shortest way round the wheel', () => {
    expect(hueDelta(350, 10)).toBe(20)
    expect(hueDelta(10, 350)).toBe(-20)
    expect(hueDelta(0, 180)).toBe(180)
    expect(hueDelta(90, 90)).toBe(0)
  })

  it('clamps a hue to within 60 degrees of a centre, either way, through 0/360', () => {
    expect(clampHueToWindow(200, 230)).toBe(230)
    expect(clampHueToWindow(200, 300)).toBe(260)
    expect(clampHueToWindow(200, 100)).toBe(140)
    expect(clampHueToWindow(350, 20)).toBe(20)        // 30 away across the wrap: inside
    expect(clampHueToWindow(350, 100)).toBe(50)       // 110 away: clamped to centre + 60
    expect(clampHueToWindow(10, 300)).toBe(310)       // 70 away backwards: clamped to centre - 60
  })

  it('describes the slider window as plain numbers around the centre', () => {
    expect(hueWindow(200)).toEqual({ min: 140, max: 260 })
    expect(hueWindow(20)).toEqual({ min: -40, max: 80 })
    expect(hueWindow(350, 30)).toEqual({ min: 320, max: 380 })
  })
})

describe('bookThemeHue', () => {
  it('prefers the stored hue, then an old hex colour, then the default', () => {
    expect(bookThemeHue({ themeHue: 250, color: '#ff0000' })).toBe(250)
    expect(bookThemeHue({ themeHue: 0, color: '#ff0000' })).toBe(0)
    expect(bookThemeHue({ themeHue: null, color: '#0000ff' })).toBe(240)
    expect(bookThemeHue({ themeHue: null, color: null })).toBe(DEFAULT_BOOK_HUE)
    expect(bookThemeHue({})).toBe(DEFAULT_BOOK_HUE)
  })
})

describe('colour css and cover colour', () => {
  it('draws theme and accent colours from the zone variables', () => {
    expect(themeColorCss(120)).toBe('hsl(120, var(--color-theme-s), var(--color-theme-l))')
    expect(accentColorCss(40)).toBe('hsl(40, var(--color-accent-s), var(--color-accent-l))')
  })

  it('uses the theme saturation and lightness of the zone for a cover', () => {
    const cover = coverColor(DEFAULT_PALETTE, 'day', 200)
    expect(cover).toEqual({ h: 200, s: ZONE_LOOKS.day.themeS, l: ZONE_LOOKS.day.themeL })
    expect(readableInk(cover).l).toBe(3) // a light cover gets dark ink
    const night = coverColor(DEFAULT_PALETTE, 'night', 200)
    expect(night).toEqual({ h: 200, s: ZONE_LOOKS.night.themeS, l: ZONE_LOOKS.night.themeL })
    expect(readableInk(night).l).toBe(100) // a dark cover gets light ink
  })
})

describe('bookScopeVars', () => {
  it('swaps in the theme hue and keeps the zone saturation and lightness', () => {
    const vars = bookScopeVars(DEFAULT_PALETTE, 'day', 'user', 200)
    const base = deriveTokens(DEFAULT_PALETTE, 'user', 'day')
    expect(vars['--color-theme-h']).toBe('200')
    expect(vars['--color-theme-s']).toBe(base['--color-theme-s'])
    expect(vars['--color-theme-l']).toBe(base['--color-theme-l'])
    expect(vars['--color-accent-h']).toBe('200') // a book has the one colour
  })

  it('draws the accent at the zone accent saturation', () => {
    const vars = bookScopeVars(DEFAULT_PALETTE, 'day', 'user', 200)
    expect(vars['--color-accent-s']).toBe(`${ZONE_LOOKS.day.accentS}%`)
    expect(vars['--on-accent']).toBeTruthy()
  })
})


describe('hue colours', () => {
  const day = { s: ZONE_LOOKS.day.themeS, l: ZONE_LOOKS.day.themeL }
  const night = { s: ZONE_LOOKS.night.themeS, l: ZONE_LOOKS.night.themeL }

  it('is a plain hue in degrees: 0..360, where 360 and 0 are both red', () => {
    expect([0, 200, 359, 360, 370, -30].map(hueOfCode)).toEqual([0, 200, 359, 0, 10, 330])
    expect([HUE_CODE_MIN, HUE_CODE_MAX]).toEqual([0, 360])
  })

  it('holds a hue in a window round its parent hue', () => {
    expect(clampCodeToWindow(200, 300)).toBe(260)
    expect(clampCodeToWindow(200, 230)).toBe(230)
    expect(clampCodeToWindow(10, 340)).toBe(340) // across the 0/360 wrap
  })

  it('draws a hue at the zone saturation and lightness, whatever it is', () => {
    expect(hueHsl(200, day)).toEqual({ h: 200, s: day.s, l: day.l })
    expect(hueHsl(360, night)).toEqual({ h: 0, s: night.s, l: night.l })
    expect(themeColorCss(200)).toBe('hsl(200, var(--color-theme-s), var(--color-theme-l))')
    expect(accentColorCss(200)).toBe('hsl(200, var(--color-accent-s), var(--color-accent-l))')
    expect(themeColorCss('var(--color-theme-h)')).toBe('hsl(var(--color-theme-h), var(--color-theme-s), var(--color-theme-l))')
  })

  it('draws a panel fill a little under the accent saturation and a step darker, held dark enough for white text', () => {
    expect(fillColorCss(200)).toBe(`hsl(200, calc(var(--color-accent-s) * 0.62), clamp(0%, calc(var(--color-accent-l) - 8%), ${fillCap(200)}%))`)
    const fill = fillHsl(200, { s: ZONE_LOOKS.day.accentS, l: ZONE_LOOKS.day.accentL })
    expect(fill).toEqual({ h: 200, s: ZONE_LOOKS.day.accentS * 0.62, l: Math.min(ZONE_LOOKS.day.accentL - 8, fillCap(200)) })
    expect(fillHsl(200, { s: 45, l: 62 }).l).toBe(fillCap(200)) // held no lighter than its cap, by contrast (at most 38)
    expect(fillCap(200)).toBeLessThanOrEqual(38)
  })

  it('draws a cover in the hue', () => {
    expect(coverColor(DEFAULT_PALETTE, 'day', 200)).toEqual(hueHsl(200, day))
  })

  it('is the hue for a legacy hex colour, and the default for none', () => {
    expect(bookThemeHue({ color: '#ff0000' })).toBe(0)
    expect(bookThemeHue({ color: '#00ff00' })).toBe(120)
    expect(bookThemeHue({ themeHue: 360, color: '#00ff00' })).toBe(360)
    expect(bookThemeHue({})).toBe(DEFAULT_BOOK_HUE)
  })

  it('tints a book scope with the hue at the zone saturation', () => {
    const vars = bookScopeVars(DEFAULT_PALETTE, 'day', 'user', 200)
    expect(vars['--color-theme-h']).toBe('200')
    expect(vars['--color-theme-s']).toBe(deriveTokens(DEFAULT_PALETTE, 'user', 'day')['--color-theme-s'])
  })
})
