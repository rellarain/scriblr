import type { HSL } from './contrast'
import { TEXT_TARGET, fitLightness, mixRgb, ratioOfRgb, rgbOf, type RGB } from './readable'
import { resolvePalette } from './zoneLooks'
import type { ZoneKey, ZonePalette } from './types'

// The colours of the header's sky toggle in each zone, built from the zone's
// fixed look and the user's four hues. The named shades are the design: dawn and
// dusk skies are gradients, the day sky is the accent colour, the night sky the
// darkest theme shade. Only the time and date text is adjusted: it is the accent hue, moved from the lightness the zone wants until it
// reads (4.5:1, readable.ts) against every colour of the sky behind it.

export interface SkyLook {
  sky: string
  // The lightest and darkest the sky gets across the band the time and date sit in.
  band: { min: number; max: number }
  // The sky's colours across that band (the text is fitted against each).
  backgrounds: RGB[]
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
const DUSK_SKY = { bottom: 54, top: 20 }
const LOCKED_SHIFT = 8
// The most the dusk sky is darkened (points) to make its text readable.
const DUSK_DARKEN_MAX = 24

const hsl = (h: number, s: number, l: number) => `hsl(${h}, ${s}%, ${l}%)`
const ceil1 = (n: number) => Math.ceil(n * 10 - 1e-9) / 10
const floor1 = (n: number) => Math.floor(n * 10 + 1e-9) / 10

// The lightness the text should have: the wanted one when it reads on the whole band of sky, else the nearest lightness on its own side
// (the lighter side for light text) that does; the other side when its own has no room.
export function readableLightness(hue: number, saturation: number, wanted: number, backgrounds: RGB[]): number {
  const reads = (c: { h: number; s: number; l: number }) => backgrounds.every(b => ratioOfRgb(rgbOf(c), b) >= TEXT_TARGET)
  const meanLum = backgrounds.reduce((n, b) => n + luminance(b), 0) / backgrounds.length
  const dir: 1 | -1 = luminance(rgbOf({ h: hue, s: saturation, l: wanted })) >= meanLum ? 1 : -1
  const own = fitLightness(hue, saturation, wanted, dir, reads)
  if (reads({ h: hue, s: saturation, l: own })) return own
  const other = fitLightness(hue, saturation, wanted, dir === 1 ? -1 : 1, reads)
  return reads({ h: hue, s: saturation, l: other }) ? other : own
}

const luminance = (c: RGB) => ratioOfRgb(c, [0, 0, 0]) // (L + 0.05) / 0.05, monotonic in the luminance

// The same text a little nearer the sky (for a locked zone), never so near that it stops reading.
function shiftedToward(hue: number, saturation: number, text: number, backgrounds: RGB[]): number {
  const reads = (c: { h: number; s: number; l: number }) => backgrounds.every(b => ratioOfRgb(rgbOf(c), b) >= TEXT_TARGET)
  const meanLum = backgrounds.reduce((n, b) => n + luminance(b), 0) / backgrounds.length
  const dir: 1 | -1 = luminance(rgbOf({ h: hue, s: saturation, l: text })) >= meanLum ? 1 : -1
  const start = Math.max(0, Math.min(100, text - dir * LOCKED_SHIFT))
  return fitLightness(hue, saturation, start, dir, reads)
}

// The sky's colours down the text's rows: the two stops of a gradient mixed (as CSS does, in sRGB), or the one colour.
function skyBackgrounds(top: HSL, bottom: HSL): RGB[] {
  const t = rgbOf(top)
  const b = rgbOf(bottom)
  return [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = TEXT_TOP + (TEXT_BOTTOM - TEXT_TOP) * f
    return mixRgb(b, (y / SKY_HEIGHT) * 100, t)
  })
}

// Is there a text colour (the accent hue) that reads on all of these?
function textReadsOn(accent: { h: number; s: number }, wanted: number, backgrounds: RGB[]): boolean {
  const l = readableLightness(accent.h, accent.s, wanted, backgrounds)
  return backgrounds.every(bg => ratioOfRgb(rgbOf({ h: accent.h, s: accent.s, l }), bg) >= TEXT_TARGET)
}

export function skyLook(zone: ZoneKey, palette: ZonePalette): SkyLook {
  const pal = resolvePalette(palette, zone)
  const { theme, accent, alert } = pal
  const accentAt = (l: number) => hsl(accent.h, accent.s, l)

  let sky: string
  let top: number
  let bottom: number
  let wantedText: number
  // The hue and saturation of the sky's top and bottom stops (the same when the sky is one colour).
  let topHue: number
  let topSat: number
  let bottomHue: number
  let bottomSat: number
  let cloud: { fill: string; front: number; back: number }
  switch (zone) {
    case 'dawn':
      top = DAWN_SKY.top
      bottom = DAWN_SKY.bottom
      sky = `linear-gradient(to top, ${hsl(theme.h, theme.s, bottom)}, ${hsl(theme.h, theme.s, top)})`
      wantedText = LIGHT
      topHue = bottomHue = theme.h
      topSat = bottomSat = theme.s
      cloud = { fill: hsl(theme.h, theme.s, 97), front: 0.55, back: 0.3 }
      break
    case 'day':
      top = bottom = accent.l
      sky = hsl(accent.h, accent.s, accent.l)
      wantedText = LIGHTEST
      topHue = bottomHue = accent.h
      topSat = bottomSat = accent.s
      cloud = { fill: accentAt(82), front: 0.6, back: 0.32 }
      break
    case 'dusk':
      top = DUSK_SKY.top
      bottom = DUSK_SKY.bottom
      wantedText = LIGHT
      topHue = alert.h
      topSat = alert.s
      bottomHue = accent.h
      bottomSat = accent.s
      // A bright accent (a yellow, a green) at the bottom of the sky leaves no text colour that reads on all of it: the sky is held
      // darker until one does (the stops move together, so the gradient keeps its shape).
      while (bottom > DUSK_SKY.bottom - DUSK_DARKEN_MAX && !textReadsOn(accent, wantedText, skyBackgrounds({ h: topHue, s: topSat, l: top }, { h: bottomHue, s: bottomSat, l: bottom }))) {
        bottom -= 1
        top = Math.max(top - 0.5, 8)
      }
      sky = `linear-gradient(to top, ${hsl(accent.h, accent.s, bottom)}, ${hsl(alert.h, alert.s, top)})`
      cloud = { fill: accentAt(78), front: 0.4, back: 0.22 }
      break
    default:
      top = bottom = NIGHT_SKY
      sky = hsl(theme.h, theme.s, NIGHT_SKY)
      wantedText = accent.l
      topHue = bottomHue = theme.h
      topSat = bottomSat = theme.s
      cloud = { fill: hsl(theme.h, theme.s, 34), front: 0.5, back: 0.3 }
  }

  const at = (y: number) => top + ((bottom - top) * y) / SKY_HEIGHT
  const band = { min: Math.min(at(TEXT_TOP), at(TEXT_BOTTOM)), max: Math.max(at(TEXT_TOP), at(TEXT_BOTTOM)) }
  const backgrounds = skyBackgrounds({ h: topHue, s: topSat, l: top }, { h: bottomHue, s: bottomSat, l: bottom })
  const text = readableLightness(accent.h, accent.s, wantedText, backgrounds)

  return {
    sky,
    band,
    backgrounds,
    sun: SUN,
    moonLit: hsl(accent.h, NIGHT_MOON.s, NIGHT_MOON.lit),
    moonShadow: hsl(accent.h, NIGHT_MOON.s, NIGHT_MOON.shadow),
    moonLitTwilight: hsl(accent.h, TWILIGHT_MOON.s, TWILIGHT_MOON.lit),
    moonShadowTwilight: hsl(accent.h, TWILIGHT_MOON.s, TWILIGHT_MOON.shadow),
    star: hsl(alert.h, alert.s, alert.l),
    text: accentAt(text),
    textLocked: accentAt(shiftedToward(accent.h, accent.s, text, backgrounds)),
    cloudFront: { fill: cloud.fill, opacity: cloud.front },
    cloudBack: { fill: cloud.fill, opacity: cloud.back },
  }
}
