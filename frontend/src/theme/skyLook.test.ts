import { describe, expect, it } from 'vitest'
import { readableLightness, skyLook } from './skyLook'
import { MIN_TEXT_GAP, ZONE_LOOKS, resolvePalette } from './zoneLooks'
import { ZONE_KEYS, type ZonePalette } from './types'

const lightnessOf = (color: string) => Number(color.match(/(\d+(?:\.\d+)?)%\)$/)![1])
const hueOf = (color: string) => Number(color.match(/^hsl\((\d+)/)![1])
const palette = (h: number): ZonePalette => ({ theme: { h }, accent: { h: (h + 40) % 360 }, alert: { h: (h + 120) % 360 }, accent2: { h: (h + 200) % 360 } })
const HUES = Array.from({ length: 36 }, (_, i) => i * 10)

describe('skyLook', () => {
  it.each(ZONE_KEYS)('%s: the time text is 30+ lightness points from the sky at every hue, locked or not', zone => {
    for (const h of HUES) {
      const look = skyLook(zone, palette(h))
      for (const text of [look.text, look.textLocked]) {
        const l = lightnessOf(text)
        expect(Math.abs(l - look.band.min)).toBeGreaterThanOrEqual(MIN_TEXT_GAP - 1e-6)
        expect(Math.abs(l - look.band.max)).toBeGreaterThanOrEqual(MIN_TEXT_GAP - 1e-6)
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
      `linear-gradient(to top, hsl(${p.accent.h}, ${ZONE_LOOKS.dusk.accentS}%, 74%), hsl(${p.alert.h}, ${ZONE_LOOKS.dusk.alertS}%, 24%))`,
    )
  })

  it('leaves the sun, moon and stars at their named shades', () => {
    for (const zone of ZONE_KEYS) {
      const p = palette(90)
      const look = skyLook(zone, p)
      expect(hueOf(look.moonLit)).toBe(p.accent.h)
      expect(lightnessOf(look.moonLit)).toBe(94)
      expect(lightnessOf(look.moonShadow)).toBe(16)
      if (zone !== 'night') expect(lightnessOf(look.sun)).toBe(zone === 'day' ? 95 : 88) // night has a moon, not a sun
      const alert = resolvePalette(p, zone).alert
      expect(look.star).toBe(`hsl(${alert.h}, ${alert.s}%, ${alert.l}%)`)
    }
  })

  it('uses the zone accent for the night text and the lightest accent shade for the day text', () => {
    const p = palette(30)
    expect(lightnessOf(skyLook('night', p).text)).toBe(ZONE_LOOKS.night.accentL)
    expect(lightnessOf(skyLook('day', p).text)).toBe(95)
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
  it('keeps a wanted lightness that is already far enough away', () => {
    expect(readableLightness(95, { min: 42, max: 42 })).toBe(95)
    expect(readableLightness(62, { min: 10, max: 10 })).toBe(62)
  })

  it('moves to the nearest side that has room, on the wanted side first', () => {
    expect(readableLightness(88, { min: 36, max: 61 })).toBeGreaterThanOrEqual(91)
    // Light text has no room over a light sky, so it goes dark.
    expect(readableLightness(88, { min: 66, max: 84 })).toBeLessThanOrEqual(36)
  })
})
