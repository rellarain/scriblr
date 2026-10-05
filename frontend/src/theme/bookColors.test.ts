import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOOK_HUE, TONES, TONE_NAME, accentColorCss, bookScopeVars, bookThemeHue, clampCodeToWindow, clampHueToWindow, coverColor, decodeHue,
  encodeHue, fillColorCss, hexToHue, hueDelta, hueInToneOf, hueOfCode, hueWindow, isLightColor, themeColorCss, toneHsl, toneOf, wrapHue,
  type Tone,
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


describe('hue codes', () => {
  it('holds a hue and a brightness in one number', () => {
    expect([1, 200, 359, 360].map(c => decodeHue(c))).toEqual([
      { hue: 1, tone: 'base' }, { hue: 200, tone: 'base' }, { hue: 359, tone: 'base' }, { hue: 0, tone: 'base' },
    ])
    expect(decodeHue(361)).toEqual({ hue: 1, tone: 'light' })
    expect(decodeHue(560)).toEqual({ hue: 200, tone: 'light' })
    expect(decodeHue(720)).toEqual({ hue: 0, tone: 'light' })
    expect(decodeHue(-361)).toEqual({ hue: 1, tone: 'dark' })
    expect(decodeHue(-560)).toEqual({ hue: 200, tone: 'dark' })
    expect(decodeHue(-720)).toEqual({ hue: 0, tone: 'dark' })
  })

  it('reads a code outside the bands (0, or one left from an older scheme) as a plain hue', () => {
    expect(decodeHue(0)).toEqual({ hue: 0, tone: 'base' })
    expect(decodeHue(-120)).toEqual({ hue: 240, tone: 'base' })
    expect(decodeHue(725)).toEqual({ hue: 5, tone: 'base' })
  })

  it('has three brightnesses: darker, base, lighter', () => {
    expect(TONES).toEqual(['dark', 'base', 'light'])
    expect(TONE_NAME).toEqual({ dark: 'Darker', base: 'Base', light: 'Lighter' })
  })

  it('encodes every hue in every tone so that it decodes back', () => {
    for (const tone of TONES) {
      for (let hue = 0; hue < 360; hue += 1) {
        const code = encodeHue(hue, tone)
        expect(code).toBeGreaterThanOrEqual(-720)
        expect(code).toBeLessThanOrEqual(720)
        expect(decodeHue(code)).toEqual({ hue, tone })
      }
    }
  })

  it('wraps a hue before it encodes it', () => {
    expect(encodeHue(370, 'base')).toBe(10)
    expect(encodeHue(-10, 'light')).toBe(710)
    expect(encodeHue(0, 'base')).toBe(360) // red is 360: 0 is not a hue code
  })

  it("keeps a hue's tone when only the hue changes", () => {
    expect(hueInToneOf(100, encodeHue(20, 'dark'))).toBe(encodeHue(100, 'dark'))
    expect(hueInToneOf(100, null)).toBe(100)
    expect(toneOf(encodeHue(5, 'light'))).toBe('light')
    expect(hueOfCode(encodeHue(40, 'dark'))).toBe(40)
  })

  it('holds a code in a window round its parent hue, keeping the tone', () => {
    expect(clampCodeToWindow(200, encodeHue(300, 'dark'))).toBe(encodeHue(260, 'dark'))
    expect(clampCodeToWindow(200, encodeHue(230, 'light'))).toBe(encodeHue(230, 'light'))
    expect(clampCodeToWindow(10, encodeHue(340, 'base'))).toBe(encodeHue(340, 'base')) // across the 0/360 wrap
  })
})

describe('tones as colours', () => {
  // The day zone's own theme saturation and lightness
  const day = { s: ZONE_LOOKS.day.themeS, l: ZONE_LOOKS.day.themeL }
  const night = { s: ZONE_LOOKS.night.themeS, l: ZONE_LOOKS.night.themeL }

  it('draws a base hue exactly as a plain hue always was', () => {
    expect(toneHsl(200, day)).toEqual({ h: 200, s: day.s, l: day.l })
    expect(themeColorCss(200)).toBe('hsl(200, var(--color-theme-s), var(--color-theme-l))')
    expect(accentColorCss(200)).toBe('hsl(200, var(--color-accent-s), var(--color-accent-l))')
    expect(themeColorCss('var(--color-theme-h)')).toBe('hsl(var(--color-theme-h), var(--color-theme-s), var(--color-theme-l))')
  })

  it('has one saturation for every brightness: only the lightness steps from the zone', () => {
    const at = (tone: Tone, basis = day) => toneHsl(encodeHue(200, tone), basis)
    expect(at('dark').l).toBeLessThan(at('base').l)
    expect(at('light').l).toBeGreaterThan(at('base').l)
    expect([at('dark').s, at('base').s, at('light').s]).toEqual([day.s, day.s, day.s])
    // At night the whole set is darker, but never black.
    expect(at('base', night).l).toBeLessThan(at('base').l)
    expect(at('dark', night).l).toBeGreaterThanOrEqual(8)
    expect(at('light').l).toBeLessThanOrEqual(94)
  })

  it('writes the tones as CSS that follows the zone variables, all at the zone saturation', () => {
    expect(themeColorCss(encodeHue(200, 'dark'))).toBe('hsl(200, var(--color-theme-s), clamp(8%, calc(var(--color-theme-l) - 18%), 100%))')
    expect(themeColorCss(encodeHue(200, 'base'))).toBe('hsl(200, var(--color-theme-s), var(--color-theme-l))')
    expect(accentColorCss(encodeHue(200, 'light'))).toBe('hsl(200, var(--color-accent-s), clamp(0%, calc(var(--color-accent-l) + 22%), 94%))')
  })

  it('draws a panel fill at one saturation (a little under the accent) and a step darker, in every brightness', () => {
    expect(fillColorCss(200)).toBe('hsl(200, calc(var(--color-accent-s) * 0.62), clamp(0%, calc(var(--color-accent-l) - 8%), 38%))')
    for (const tone of TONES) expect(fillColorCss(encodeHue(200, tone))).toContain('calc(var(--color-accent-s) * 0.62)')
  })

  it('draws a cover in the code colour', () => {
    expect(coverColor(DEFAULT_PALETTE, 'day', encodeHue(200, 'light'))).toEqual(toneHsl(encodeHue(200, 'light'), day))
  })

  it('knows which colours are light enough to need dark text', () => {
    expect([encodeHue(10, 'light'), 200, encodeHue(10, 'dark')].map(isLightColor)).toEqual([true, false, false])
  })

  it('is a base hue for a legacy hex colour, and the default for none', () => {
    expect(bookThemeHue({ color: '#ff0000' })).toBe(360) // red is 360, not 0
    expect(bookThemeHue({ color: '#00ff00' })).toBe(120)
    expect(bookThemeHue({ themeHue: -500, color: '#00ff00' })).toBe(-500)
    expect(bookThemeHue({})).toBe(DEFAULT_BOOK_HUE)
  })

  it('tints a book scope with the hue, at the zone saturation whatever the brightness', () => {
    const vars = (code: number) => bookScopeVars(DEFAULT_PALETTE, 'day', 'user', code)
    const zoneS = deriveTokens(DEFAULT_PALETTE, 'user', 'day')['--color-theme-s']
    expect(vars(encodeHue(200, 'dark'))['--color-theme-h']).toBe('200')
    for (const tone of TONES) expect(vars(encodeHue(200, tone))['--color-theme-s']).toBe(zoneS)
  })
})
