import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, defaultThemeSettings } from './defaults'
import { SHADE_MAX, SHADE_MIN, SHADE_STEP, TINT_LIGHTNESS, derivedShades, hslCss, shadeStrip, tints } from './palettes'
import { ZONE_LOOKS, resolvePalette } from './zoneLooks'
import { PALETTE_KEYS, ZONE_KEYS } from './types'

describe('derivedShades', () => {
  it('lists the theme surfaces the app derives, from the zone\'s theme lightness', () => {
    const look = ZONE_LOOKS.day
    const shades = derivedShades(DEFAULT_PALETTE, 'theme', 'day')
    expect(shades.map(s => s.label)).toEqual(['Base', 'Side', 'Deep', 'Deeper', 'Sidebar 1', 'Sidebar 2', 'Raised a', 'Raised b', 'Raised active', 'Raised'])
    expect(shades[0].color).toEqual({ h: DEFAULT_PALETTE.theme.h, s: look.themeS, l: look.themeL })
    expect(shades[2].color.l).toBe(look.themeL - 10)
    // sidebar and raised surfaces are the theme's own hue and saturation, not accent-tinted
    expect(shades[4].color).toEqual({ h: DEFAULT_PALETTE.theme.h, s: look.themeS, l: look.themeL - 17 })
    expect(shades.every(s => s.color.h === DEFAULT_PALETTE.theme.h && s.color.s === look.themeS)).toBe(true)
    expect(shades[8].color.l).toBe(look.themeL + 3)
  })

  it('lists fill, hover and dim for the accent, and fill only for the alert', () => {
    const accent = derivedShades(DEFAULT_PALETTE, 'accent', 'day')
    expect(accent.map(s => s.label)).toEqual(['Fill', 'Hover', 'Dim'])
    // Darker: away from the white text the orange accent is forced to at this width
    // (only one ink ever clears Day's fixed accent lightness, regardless of hue).
    expect(accent[1].color.l).toBe(accent[0].color.l - 12)
    expect(accent[2].color.s).toBe(accent[0].color.s - 20)
    expect(accent[2].color.l).toBe(accent[0].color.l - 14)
    expect(derivedShades(DEFAULT_PALETTE, 'alert', 'day').map(s => s.label)).toEqual(['Fill'])
    expect(derivedShades(DEFAULT_PALETTE, 'accent2', 'day').map(s => s.label)).toEqual(['Fill', 'Hover'])
  })

  it('steps hover and dim away from the text the fill gets: darker under light text', () => {
    const violet = derivedShades(DEFAULT_PALETTE, 'accent2', 'day') // light text on the dark violet
    expect(violet[1].color.l).toBe(violet[0].color.l - 12)
    const yellow = derivedShades({ ...DEFAULT_PALETTE, accent: { h: 60 } }, 'accent', 'night') // dark text on the bright yellow
    expect(yellow[1].color.l).toBe(yellow[0].color.l + 12)
    expect(yellow[2].color.l).toBe(yellow[0].color.l + 14)
  })

  it('draws every colour at the zone\'s saturation and lightness, in range', () => {
    for (const zone of ZONE_KEYS) {
      const resolved = resolvePalette(DEFAULT_PALETTE, zone)
      for (const key of PALETTE_KEYS) {
        const shades = derivedShades(DEFAULT_PALETTE, key, zone)
        if (key !== 'theme') expect(shades[0].color).toEqual(resolved[key])
        for (const s of shades) {
          expect(s.color.l).toBeGreaterThanOrEqual(0)
          expect(s.color.l).toBeLessThanOrEqual(100)
        }
      }
    }
  })
})

describe('tints', () => {
  it('is an even ladder from light to dark at the colour\'s own hue and the zone\'s saturation', () => {
    const list = tints(DEFAULT_PALETTE, 'accent', 'day')
    expect(list.map(s => s.color.l)).toEqual(TINT_LIGHTNESS)
    expect(list.every(s => s.color.h === DEFAULT_PALETTE.accent.h && s.color.s === ZONE_LOOKS.day.accentS)).toBe(true)
    expect(hslCss(list[0].color)).toBe(`hsl(${DEFAULT_PALETTE.accent.h}, ${ZONE_LOOKS.day.accentS}%, 90%)`)
    expect(tints(DEFAULT_PALETTE, 'accent', 'night')[0].color.s).toBe(ZONE_LOOKS.night.accentS)
  })
})

describe('shadeStrip', () => {
  const pal = DEFAULT_PALETTE

  it.each(ZONE_KEYS)('%s: ten shades of each role, darkest first, its own colour among them', zone => {
    for (const role of PALETTE_KEYS) {
      const strip = shadeStrip(pal, zone, role)
      const own = resolvePalette(pal, zone)[role]
      expect(strip).toHaveLength(10)
      expect(strip.filter(s => s.key === 'own')).toHaveLength(1)
      const at = strip.findIndex(s => s.key === 'own')
      expect(strip[at].color).toEqual(own)
      // The lightness rises step by step and stays inside the range.
      for (let i = 1; i < strip.length; i += 1) expect(strip[i].color.l - strip[i - 1].color.l).toBeCloseTo(SHADE_STEP, 5)
      expect(strip[0].color.l).toBeGreaterThanOrEqual(SHADE_MIN - 1e-9)
      expect(strip[9].color.l).toBeLessThanOrEqual(SHADE_MAX + 1e-9)
      // The same hue and saturation all the way along.
      expect(strip.every(s => s.color.h === own.h && s.color.s === own.s)).toBe(true)
    }
  })

  it('has five darker and four brighter when there is room, and moves the run when there is not', () => {
    const mid = shadeStrip(pal, 'night', 'accent')
    expect(mid.findIndex(s => s.key === 'own')).toBe(5)
    // Day's theme is very light (86): fewer brighter shades fit, so more are darker.
    const light = shadeStrip(pal, 'day', 'theme')
    expect(light.findIndex(s => s.key === 'own')).toBeGreaterThan(5)
    expect(light[9].color.l).toBeLessThanOrEqual(SHADE_MAX)
  })

  it('labels the shades by lightness, and the role\'s own colour Own', () => {
    const strip = shadeStrip(pal, 'day', 'accent')
    expect(strip.find(s => s.key === 'own')?.label).toBe('Own')
    expect(strip.filter(s => s.key !== 'own').every(s => /^\d+%$/.test(s.label))).toBe(true)
  })
})
