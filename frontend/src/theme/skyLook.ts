import { resolvePalette, MIN_TEXT_GAP } from './zoneLooks'
import type { ZoneKey, ZonePalette } from './types'

// The colours of the header's sky toggle in each zone, built from the zone's
// fixed look and the user's four hues. The named shades are the design: dawn and
// dusk skies are gradients, the day sky is the accent colour, the night sky the
// darkest theme shade. Only the time and date text is adjusted, so it stays
// MIN_TEXT_GAP lightness points away from the sky behind it.

export interface SkyLook {
  sky: string
  // The lightest and darkest the sky gets across the band the time and date sit in.
  band: { min: number; max: number }
  sun: string
  moonLit: string
  moonShadow: string
  star: string
  text: string
  textLocked: string
  // Clouds are one flat colour, faded as a whole so overlapping humps don't darken.
  cloudFront: { fill: string; opacity: number }
  cloudBack: { fill: string; opacity: number }
}

const SKY_HEIGHT = 30
const TEXT_TOP = 7
const TEXT_BOTTOM = 23

const LIGHTEST = 95
const LIGHT = 88
const MOON_LIT = 94
const MOON_SHADOW = 16
const NIGHT_SKY = 10
const DAWN_SKY = { top: 58, bottom: 92 }
const DUSK_SKY = { bottom: 74, top: 24 }
const LOCKED_SHIFT = 8

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`
const ceil1 = (n: number) => Math.ceil(n * 10 - 1e-9) / 10
const floor1 = (n: number) => Math.floor(n * 10 + 1e-9) / 10

// The lightness the text should have: the wanted one when it is 30+ points from
// the whole band, else the nearest lightness on its own side that is (or the other
// side when its own has no room left).
export function readableLightness(wanted: number, band: { min: number; max: number }): number {
  const above = band.max + MIN_TEXT_GAP
  const below = band.min - MIN_TEXT_GAP
  if (wanted >= above || wanted <= below) return wanted
  const lighter = wanted >= (band.min + band.max) / 2
  if (lighter && above <= 100) return ceil1(above)
  if (!lighter && below >= 0) return floor1(below)
  return above <= 100 ? ceil1(above) : floor1(below)
}

// The same text a little nearer the sky (for a locked zone), never closer than 30.
function shiftedToward(text: number, band: { min: number; max: number }): number {
  const above = band.max + MIN_TEXT_GAP
  const below = band.min - MIN_TEXT_GAP
  return text >= above ? Math.max(ceil1(above), text - LOCKED_SHIFT) : Math.min(floor1(below), text + LOCKED_SHIFT)
}

export function skyLook(zone: ZoneKey, palette: ZonePalette): SkyLook {
  const pal = resolvePalette(palette, zone)
  const { theme, accent, alert } = pal
  const accentAt = (l: number) => hsl(accent.h, accent.s, l)

  let sky: string
  let top: number
  let bottom: number
  let sun: string
  let wantedText: number
  let cloud: { fill: string; front: number; back: number }
  switch (zone) {
    case 'dawn':
      top = DAWN_SKY.top
      bottom = DAWN_SKY.bottom
      sky = `linear-gradient(to top, ${hsl(theme.h, theme.s, bottom)}, ${hsl(theme.h, theme.s, top)})`
      sun = accentAt(LIGHT)
      wantedText = LIGHT
      cloud = { fill: hsl(theme.h, theme.s, 97), front: 0.55, back: 0.3 }
      break
    case 'day':
      top = bottom = accent.l
      sky = hsl(accent.h, accent.s, accent.l)
      sun = accentAt(LIGHTEST)
      wantedText = LIGHTEST
      cloud = { fill: accentAt(82), front: 0.6, back: 0.32 }
      break
    case 'dusk':
      top = DUSK_SKY.top
      bottom = DUSK_SKY.bottom
      sky = `linear-gradient(to top, ${hsl(accent.h, accent.s, bottom)}, ${hsl(alert.h, alert.s, top)})`
      sun = accentAt(LIGHT)
      wantedText = LIGHT
      cloud = { fill: accentAt(78), front: 0.4, back: 0.22 }
      break
    default:
      top = bottom = NIGHT_SKY
      sky = hsl(theme.h, theme.s, NIGHT_SKY)
      sun = accentAt(LIGHTEST)
      wantedText = accent.l
      cloud = { fill: hsl(theme.h, theme.s, 34), front: 0.5, back: 0.3 }
  }

  const at = (y: number) => top + ((bottom - top) * y) / SKY_HEIGHT
  const band = { min: Math.min(at(TEXT_TOP), at(TEXT_BOTTOM)), max: Math.max(at(TEXT_TOP), at(TEXT_BOTTOM)) }
  const text = readableLightness(wantedText, band)

  return {
    sky,
    band,
    sun,
    moonLit: accentAt(MOON_LIT),
    moonShadow: accentAt(MOON_SHADOW),
    star: hsl(alert.h, alert.s, alert.l),
    text: accentAt(text),
    textLocked: accentAt(shiftedToward(text, band)),
    cloudFront: { fill: cloud.fill, opacity: cloud.front },
    cloudBack: { fill: cloud.fill, opacity: cloud.back },
  }
}
