import { resolvePalette, MIN_TEXT_GAP } from './zoneLooks'
import type { ZoneKey, ZonePalette } from './types'

// The colours of the header's sky toggle in each zone, built from the zone's
// fixed look and the user's four hues. The named shades are the design: dawn and
// dusk skies are gradients, the day sky is the accent colour, the night sky the
// darkest theme shade. Only the time and date text is adjusted, so it always
// stays MIN_TEXT_GAP lightness points away from the sky behind it.

export interface SkyLook {
  sky: string
  // The lightest and darkest the sky gets across the band the time and date sit in.
  band: { min: number; max: number }
  sun: string
  // At night the moon wears the accent hue, richly saturated; beside the sun (dawn, dusk) it is a muted tint.
  moonLit: string
  moonShadow: string
  moonLitTwilight: string
  moonShadowTwilight: string
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
const SUN = 'hsl(0, 0%, 100%)'
// At night the moon is the accent hue, more saturated than the zone's own accent.
const NIGHT_MOON = { s: 90, lit: 90, shadow: 22 }
const TWILIGHT_MOON = { s: 12, lit: 78, shadow: 30 }
const NIGHT_SKY = 10
const DAWN_SKY = { top: 58, bottom: 92 }
// Narrower than dawn's -- at MIN_TEXT_GAP=45 no single lightness can sit 45+
// points from both ends of a band this wide (the old {bottom:74,top:24} spanned
// too far either way); keeping the top dark and compressing the range toward it
// leaves the text-reading band's brighter (bottom) end at most 55, so full white
// text (100) always clears 45 from every point in it.
const DUSK_SKY = { bottom: 54, top: 20 }
const LOCKED_SHIFT = 8

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`
const ceil1 = (n: number) => Math.ceil(n * 10 - 1e-9) / 10
const floor1 = (n: number) => Math.floor(n * 10 + 1e-9) / 10

// The lightness the text should have: the wanted one when it is 45+ points from
// the whole band, else the nearest lightness on its own side that is (or the other
// side when its own has no room left). If neither side has room (both `above` and
// `below` fall outside 0-100 -- possible for a wide enough band), lands on
// whichever of 0/100 clears the band by the most, rather than an out-of-range value.
export function readableLightness(wanted: number, band: { min: number; max: number }): number {
  const above = band.max + MIN_TEXT_GAP
  const below = band.min - MIN_TEXT_GAP
  if (wanted >= above || wanted <= below) return wanted
  const lighter = wanted >= (band.min + band.max) / 2
  if (lighter && above <= 100) return ceil1(above)
  if (!lighter && below >= 0) return floor1(below)
  if (above <= 100) return ceil1(above)
  if (below >= 0) return floor1(below)
  return band.min >= 100 - band.max ? 0 : 100
}

// The same text a little nearer the sky (for a locked zone), never closer than
// MIN_TEXT_GAP. Left alone when neither side has room at all (readableLightness's
// own best-effort value is already as close as it can safely get).
function shiftedToward(text: number, band: { min: number; max: number }): number {
  const above = band.max + MIN_TEXT_GAP
  const below = band.min - MIN_TEXT_GAP
  if (above > 100 && below < 0) return text
  return text >= above ? Math.max(ceil1(above), text - LOCKED_SHIFT) : Math.min(floor1(below), text + LOCKED_SHIFT)
}

export function skyLook(zone: ZoneKey, palette: ZonePalette): SkyLook {
  const pal = resolvePalette(palette, zone)
  const { theme, accent, alert } = pal
  const accentAt = (l: number) => hsl(accent.h, accent.s, l)

  let sky: string
  let top: number
  let bottom: number
  let wantedText: number
  let cloud: { fill: string; front: number; back: number }
  switch (zone) {
    case 'dawn':
      top = DAWN_SKY.top
      bottom = DAWN_SKY.bottom
      sky = `linear-gradient(to top, ${hsl(theme.h, theme.s, bottom)}, ${hsl(theme.h, theme.s, top)})`
      wantedText = LIGHT
      cloud = { fill: hsl(theme.h, theme.s, 97), front: 0.55, back: 0.3 }
      break
    case 'day':
      top = bottom = accent.l
      sky = hsl(accent.h, accent.s, accent.l)
      wantedText = LIGHTEST
      cloud = { fill: accentAt(82), front: 0.6, back: 0.32 }
      break
    case 'dusk':
      top = DUSK_SKY.top
      bottom = DUSK_SKY.bottom
      sky = `linear-gradient(to top, ${hsl(accent.h, accent.s, bottom)}, ${hsl(alert.h, alert.s, top)})`
      wantedText = LIGHT
      cloud = { fill: accentAt(78), front: 0.4, back: 0.22 }
      break
    default:
      top = bottom = NIGHT_SKY
      sky = hsl(theme.h, theme.s, NIGHT_SKY)
      wantedText = accent.l
      cloud = { fill: hsl(theme.h, theme.s, 34), front: 0.5, back: 0.3 }
  }

  const at = (y: number) => top + ((bottom - top) * y) / SKY_HEIGHT
  const band = { min: Math.min(at(TEXT_TOP), at(TEXT_BOTTOM)), max: Math.max(at(TEXT_TOP), at(TEXT_BOTTOM)) }
  const text = readableLightness(wantedText, band)

  return {
    sky,
    band,
    sun: SUN,
    moonLit: hsl(accent.h, NIGHT_MOON.s, NIGHT_MOON.lit),
    moonShadow: hsl(accent.h, NIGHT_MOON.s, NIGHT_MOON.shadow),
    moonLitTwilight: hsl(accent.h, TWILIGHT_MOON.s, TWILIGHT_MOON.lit),
    moonShadowTwilight: hsl(accent.h, TWILIGHT_MOON.s, TWILIGHT_MOON.shadow),
    star: hsl(alert.h, alert.s, alert.l),
    text: accentAt(text),
    textLocked: accentAt(shiftedToward(text, band)),
    cloudFront: { fill: cloud.fill, opacity: cloud.front },
    cloudBack: { fill: cloud.fill, opacity: cloud.back },
  }
}
