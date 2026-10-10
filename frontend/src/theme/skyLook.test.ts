import { describe, expect, it } from 'vitest'
import { readableLightness, skyLook } from './skyLook'
import { TEXT_TARGET, ratioOfRgb, rgbOf } from './readable'
import { ZONE_LOOKS, resolvePalette } from './zoneLooks'
import { ZONE_KEYS, type ZonePalette } from './types'

const lightnessOf = (color: string) => Number(color.match(/(\d+(?:\.\d+)?)%\)$/)![1])
const hueOf = (color: string) => Number(color.match(/^hsl\((\d+)/)![1])
const palette = (h: number): ZonePalette => ({ theme: { h }, accent: { h: (h + 40) % 360 }, alert: { h: (h + 120) % 360 }, accent2: { h: (h + 200) % 360 } })
const HUES = Array.from({ length: 36 }, (_, i) => i * 10)

describe('skyLook', () => {
  const colorOf = (color: string) => {
    const [h, s, l] = color.slice(4, -1).split(',').map(part => parseFloat(part))
    return rgbOf({ h, s, l })
  }

  it.each(ZONE_KEYS)('%s: the time text reads (4.5:1) on every colour of the sky at every hue, locked or not', zone => {
    for (const h of HUES) {
      const look = skyLook(zone, palette(h))
      for (const text of [look.text, look.textLocked]) {
        for (const bg of look.backgrounds) expect(ratioOfRgb(colorOf(text), bg)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('locked text sits between the text and the sky, never on the far side of either', () => {
    for (const zone of ZONE_KEYS) {
      const look = skyLook(zone, palette(200))
      const text = lightnessOf(look.text)
      const locked = lightnessOf(look.textLocked)
      const sky = (look.band.min + look.band.max) / 2
      expect(Math.abs(locked - sky)).toBeLessThanOrEqual(Math.abs(text - sky) + 1e-6)
    }
  })

  it('paints each sky as specified', () => {
    const p = palette(200)
    const day = skyLook('day', p)
    expect(day.sky).toBe(`hsl(${p.accent.h}, ${ZONE_LOOKS.day.accentS}%, ${ZONE_LOOKS.day.accentL}%)`)
    const night = skyLook('night', p)
    expect(night.sky).toBe(`hsl(${p.theme.h}, ${ZONE_LOOKS.night.themeS}%, 10%)`)
    expect(skyLook('dawn', p).sky).toMatch(/^linear-gradient\(to top, hsl\(200, 15%, 92%\), hsl\(200, 15%, 58%\)\)$/)
    expect(skyLook('dusk', p).sky).toBe(
      `linear-gradient(to top, hsl(${p.accent.h}, ${ZONE_LOOKS.dusk.accentS}%, 54%), hsl(${p.alert.h}, ${ZONE_LOOKS.dusk.alertS}%, 20%))`,
    )
  })

  it('keeps the sun white, the night moon accent-coloured and saturated, and the twilight moon muted', () => {
    const satOf = (color: string) => Number(color.match(/,\s*(\d+)%,/)![1])
    for (const zone of ZONE_KEYS) {
      const p = palette(90)
      const look = skyLook(zone, p)
      expect(look.sun).toBe('hsl(0, 0%, 100%)')
      // Night moon: the accent hue, more saturated than the zone's own accent, light against dark.
      expect(hueOf(look.moonLit)).toBe(p.accent.h)
      expect(hueOf(look.moonShadow)).toBe(p.accent.h)
      expect(satOf(look.moonLit)).toBeGreaterThan(ZONE_LOOKS.night.accentS)
      expect(lightnessOf(look.moonLit)).toBeGreaterThan(lightnessOf(look.moonShadow))
      // Beside the sun the moon is dimmer than it and low in saturation.
      expect(lightnessOf(look.moonLitTwilight)).toBeLessThan(90)
      expect(lightnessOf(look.moonShadowTwilight)).toBeGreaterThan(10)
      expect(satOf(look.moonLitTwilight)).toBeLessThanOrEqual(20)
      expect(satOf(look.moonLitTwilight)).toBeLessThan(satOf(look.moonLit))
      const alert = resolvePalette(p, zone).alert
      expect(look.star).toBe(`hsl(${alert.h}, ${alert.s}%, ${alert.l}%)`)
    }
  })

  it('uses the zone accent for the night text and the lightest accent shade for the day text where white reads', () => {
    const p = palette(30)
    expect(lightnessOf(skyLook('night', p).text)).toBe(ZONE_LOOKS.night.accentL)
    // Day: the lightest accent shade, or dark where white would not read on the accent (a yellow, a green).
    expect(lightnessOf(skyLook('day', palette(200)).text)).toBeGreaterThanOrEqual(95)
  })

  it('fades clouds as a whole, dimmer at the back', () => {
    for (const zone of ZONE_KEYS) {
      const look = skyLook(zone, palette(10))
      expect(look.cloudBack.opacity).toBeLessThan(look.cloudFront.opacity)
      expect(look.cloudFront.fill).toBe(look.cloudBack.fill)
    }
  })
})

describe('readableLightness', () => {
  const sky = (h: number, l: number) => rgbOf({ h, s: 40, l })

  it('keeps a wanted lightness that already reads', () => {
    expect(readableLightness(200, 40, 95, [sky(200, 20)])).toBe(95)
  })

  it('moves toward the wanted side until the text reads, and to the other side when that side has no room', () => {
    const mid = readableLightness(200, 40, 80, [sky(200, 28), sky(200, 38)])
    expect(mid).toBeGreaterThan(80)
    // Light text has no room over a light sky, so it goes dark.
    expect(readableLightness(200, 40, 88, [sky(200, 84)])).toBeLessThan(40)
    for (const l of [mid]) expect(ratioOfRgb(rgbOf({ h: 200, s: 40, l }), sky(200, 38))).toBeGreaterThanOrEqual(TEXT_TARGET)
  })
})
