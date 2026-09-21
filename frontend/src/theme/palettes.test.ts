import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, defaultThemeSettings } from './defaults'
import { TINT_LIGHTNESS, derivedShades, hslCss, tints } from './palettes'
import { copyPalette, enableZone } from './zones'
import { ZONE_LOOKS, resolvePalette } from './zoneLooks'
import { PALETTE_KEYS, ZONE_KEYS } from './types'

describe('derivedShades', () => {
  it('lists the theme surfaces the app derives, from the zone\'s theme lightness', () => {
    const look = ZONE_LOOKS.day
    const shades = derivedShades(DEFAULT_PALETTE, 'theme', 'day')
    expect(shades.map(s => s.label)).toEqual(['Base', 'Side', 'Deep', 'Deeper', 'Sidebar 1', 'Sidebar 2', 'Raised a', 'Raised b', 'Raised active'])
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
    expect(accent[1].color.l).toBe(accent[0].color.l + 12) // lighter: away from the dark text the orange accent gets
    expect(accent[2].color.s).toBe(accent[0].color.s - 20)
    expect(accent[2].color.l).toBe(accent[0].color.l + 14)
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

describe('copyPalette', () => {
  const settings = () => {
    let s = defaultThemeSettings()
    s = enableZone(s, 'dusk')
    s = enableZone(s, 'night')
    s = { ...s, zones: { ...s.zones, dusk: { ...s.zones.dusk, palette: { ...s.zones.dusk.palette, accent: { h: 200 } } } } }
    return s
  }

  it('gives a zone another zone\'s hues, from any zone', () => {
    const s = settings()
    const next = copyPalette(s, 'dusk', 'night')
    expect(next.zones.night.palette).toEqual(s.zones.dusk.palette)
    expect(next.zones.night.palette).not.toBe(s.zones.dusk.palette) // a deep copy
    expect(next.zones.night.startMinute).toBe(s.zones.night.startMinute) // the start time stays
    expect(copyPalette(s, 'dusk', 'day').zones.day.palette.accent.h).toBe(200) // Day can be copied into too
  })

  it('ignores the same zone and zones that are turned off', () => {
    const s = settings()
    expect(copyPalette(s, 'day', 'day')).toBe(s)
    expect(copyPalette(s, 'dawn', 'day')).toBe(s)
    expect(copyPalette(s, 'day', 'dawn')).toBe(s)
  })
})
