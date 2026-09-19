import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOOK_HUE, accentColorCss, bookScopeVars, bookThemeHue, clampHueToWindow, coverColor, hexToHue, hueDelta, hueWindow,
  themeColorCss, wrapHue,
} from './bookColors'
import { DEFAULT_PALETTE } from './defaults'
import { deriveTokens } from './tokens'
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

  it('uses the theme saturation and lightness for a cover', () => {
    const cover = coverColor(DEFAULT_PALETTE, 200)
    expect(cover.h).toBe(200)
    expect(cover.s).toBe(DEFAULT_PALETTE.theme.s)
    expect(cover.l).toBe(DEFAULT_PALETTE.brightness)
    expect(readableInk(cover).l).toBe(100) // a mid-dark cover gets light ink
  })
})

describe('bookScopeVars', () => {
  it('swaps in the theme hue and keeps the zone saturation and lightness', () => {
    const vars = bookScopeVars(DEFAULT_PALETTE, 'user', 200, null)
    const base = deriveTokens(DEFAULT_PALETTE, 'user')
    expect(vars['--color-theme-h']).toBe('200')
    expect(vars['--color-theme-s']).toBe(base['--color-theme-s'])
    expect(vars['--color-theme-l']).toBe(base['--color-theme-l'])
    expect(vars['--color-accent-h']).toBe(base['--color-accent-h']) // no accent override
  })

  it('swaps in the accent hue when there is one', () => {
    const vars = bookScopeVars(DEFAULT_PALETTE, 'user', 200, 90)
    expect(vars['--color-accent-h']).toBe('90')
    expect(vars['--color-accent-s']).toBe(`${DEFAULT_PALETTE.accent.s}%`)
    expect(vars['--on-accent']).toBeTruthy()
  })
})
