import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, defaultThemeSettings } from './defaults'
import { TINT_LIGHTNESS, derivedShades, hslCss, tints } from './palettes'
import { copyPalette } from './zones'
import { enableZone } from './zones'
import { deriveTokens } from './tokens'

describe('derivedShades', () => {
  it('lists the theme surfaces the app derives, from the theme lightness', () => {
    const shades = derivedShades(DEFAULT_PALETTE, 'theme')
    expect(shades.map(s => s.label)).toEqual(['Base', 'Side', 'Deep', 'Deeper', 'Sidebar 1', 'Sidebar 2', 'Raised a', 'Raised b', 'Raised active'])
    const base = deriveTokens(DEFAULT_PALETTE, 'user')
    const baseL = parseFloat(base['--color-theme-l'])
    expect(shades[0].color).toEqual({ h: DEFAULT_PALETTE.theme.h, s: DEFAULT_PALETTE.theme.s, l: baseL })
    expect(shades[2].color.l).toBe(baseL - 10)
    // sidebar and raised surfaces are the theme's own hue and saturation, not accent-tinted
    expect(shades[4].color).toEqual({ h: DEFAULT_PALETTE.theme.h, s: DEFAULT_PALETTE.theme.s, l: baseL - 17 })
    expect(shades.every(s => s.color.h === DEFAULT_PALETTE.theme.h && s.color.s === DEFAULT_PALETTE.theme.s)).toBe(true)
    expect(shades[8].color.l).toBe(baseL + 3)
  })

  it('lists fill, hover and dim for the accent, and fill only for the alert', () => {
    const accent = derivedShades(DEFAULT_PALETTE, 'accent')
    expect(accent.map(s => s.label)).toEqual(['Fill', 'Hover', 'Dim'])
    expect(accent[1].color.l).toBe(accent[0].color.l + 12)
    expect(accent[2].color.s).toBe(accent[0].color.s - 20)
    expect(accent[2].color.l).toBe(accent[0].color.l - 14)
    expect(derivedShades(DEFAULT_PALETTE, 'alert').map(s => s.label)).toEqual(['Fill'])
    expect(derivedShades(DEFAULT_PALETTE, 'accent2').map(s => s.label)).toEqual(['Fill', 'Hover'])
  })

  it('keeps every lightness in range on extreme brightness', () => {
    for (const brightness of [0, 100]) {
      for (const key of ['theme', 'accent', 'alert', 'accent2'] as const) {
        for (const s of derivedShades({ ...DEFAULT_PALETTE, brightness }, key)) {
          expect(s.color.l).toBeGreaterThanOrEqual(0)
          expect(s.color.l).toBeLessThanOrEqual(100)
        }
      }
    }
  })
})

describe('tints', () => {
  it('is an even ladder from light to dark at the colour\'s own hue and saturation', () => {
    const list = tints(DEFAULT_PALETTE, 'accent')
    expect(list.map(s => s.color.l)).toEqual(TINT_LIGHTNESS)
    expect(list.every(s => s.color.h === DEFAULT_PALETTE.accent.h && s.color.s === DEFAULT_PALETTE.accent.s)).toBe(true)
    expect(hslCss(list[0].color)).toBe(`hsl(${DEFAULT_PALETTE.accent.h}, ${DEFAULT_PALETTE.accent.s}%, 90%)`)
  })
})

describe('copyPalette', () => {
  const settings = () => {
    let s = defaultThemeSettings()
    s = enableZone(s, 'dusk')
    s = enableZone(s, 'night')
    s = { ...s, zones: { ...s.zones, dusk: { ...s.zones.dusk, palette: { ...s.zones.dusk.palette, brightness: 60, accent: { h: 200, s: 70 } } } } }
    return s
  }

  it('gives a zone another zone\'s whole palette, from any zone', () => {
    const s = settings()
    const next = copyPalette(s, 'dusk', 'night')
    expect(next.zones.night.palette).toEqual(s.zones.dusk.palette)
    expect(next.zones.night.palette).not.toBe(s.zones.dusk.palette) // a deep copy
    expect(next.zones.night.startMinute).toBe(s.zones.night.startMinute) // the start time stays
    expect(copyPalette(s, 'dusk', 'day').zones.day.palette.brightness).toBe(60) // Day can be copied into too
  })

  it('ignores the same zone and zones that are turned off', () => {
    const s = settings()
    expect(copyPalette(s, 'day', 'day')).toBe(s)
    expect(copyPalette(s, 'dawn', 'day')).toBe(s)
    expect(copyPalette(s, 'day', 'dawn')).toBe(s)
  })
})
