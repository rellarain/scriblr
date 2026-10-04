import type { HSL } from './contrast'
import { deriveTokens, type ThemeVars } from './tokens'
import { resolvePalette } from './zoneLooks'
import type { Role, ZoneKey, ZonePalette } from './types'

// Colours for the Writer's levels (project, series, book, arc, chapter) and plot categories.
// One stored number holds a hue AND a brightness (it mirrors backend/app/storage/schema.py):
//
//     1..360     base      hue = value mod 360
//    361..720    lighter   hue = value - 360
//   -720..-361   darker    hue = -value - 360
//
// Every colour has the same saturation -- the active time-of-day zone's own -- and the brightness
// steps from that zone's lightness: darker, base, lighter. So the same code is paler by day and
// deeper at night, and "base" is exactly what a plain hue always was.

export const DEFAULT_BOOK_HUE = 28
// A limited slider (series, arc, chapter, plot subcategory) runs this far either side of its parent's hue.
export const SUBCATEGORY_HUE_WINDOW = 60

export const wrapHue = (hue: number): number => ((Math.round(hue) % 360) + 360) % 360

export type Tone = 'dark' | 'base' | 'light'
export const TONES: readonly Tone[] = ['dark', 'base', 'light']
export const TONE_NAME: Record<Tone, string> = { dark: 'Darker', base: 'Base', light: 'Lighter' }

export const HUE_CODE_MIN = -720
export const HUE_CODE_MAX = 720

export interface DecodedHue { hue: number; tone: Tone }

export function decodeHue(code: number): DecodedHue {
  const c = Math.round(code)
  if (c >= 1 && c <= 360) return { hue: c % 360, tone: 'base' }
  if (c >= 361 && c <= 720) return { hue: (c - 360) % 360, tone: 'light' }
  if (c <= -361 && c >= -720) return { hue: (Math.abs(c) - 360) % 360, tone: 'dark' }
  return { hue: wrapHue(c), tone: 'base' } // 0 and anything else: a plain hue
}

// A hue (any number of degrees) in a tone, as the one stored number.
export function encodeHue(hue: number, tone: Tone): number {
  const h = wrapHue(hue)
  const full = h === 0 ? 360 : h // the top of each band stands for 0 degrees
  if (tone === 'base') return full
  if (tone === 'light') return 360 + full
  return -(360 + full)
}

// The tone of a code.
export const toneOf = (code: number): Tone => decodeHue(code).tone
// The hue (0-359) a code stands for.
export const hueOfCode = (code: number): number => decodeHue(code).hue
// A code for a plain hue, kept in the same tone as `like` (base when `like` is missing).
export const hueInToneOf = (hue: number, like: number | null | undefined): number =>
  encodeHue(hue, like != null ? toneOf(like) : 'base')

// A signed shortest way round the colour wheel from one hue to another (-180..180].
export function hueDelta(from: number, to: number): number {
  const d = ((to - from + 540) % 360) - 180
  return d === -180 ? 180 : d
}

// The window a hue may move in around a centre: [centre - width, centre + width],
// as plain numbers that may fall outside 0..360 (a slider over it just runs
// through the wrap-around; hsl() and wrapHue() read them back).
export function hueWindow(centre: number, width = SUBCATEGORY_HUE_WINDOW): { min: number; max: number } {
  return { min: centre - width, max: centre + width }
}

// Keep a hue within `width` degrees of the centre (either way round the wheel).
export function clampHueToWindow(centre: number, hue: number, width = SUBCATEGORY_HUE_WINDOW): number {
  const d = hueDelta(centre, hue)
  return wrapHue(centre + Math.max(-width, Math.min(width, d)))
}

// A colour code held within `width` degrees of a centre hue, keeping its tone.
export function clampCodeToWindow(centre: number, code: number, width = SUBCATEGORY_HUE_WINDOW): number {
  const d = decodeHue(code)
  return encodeHue(clampHueToWindow(centre, d.hue, width), d.tone)
}

// ---------------------------------------------------------------- tones as colours

// How far each tone's lightness steps from the zone's own, and the limits it stays within.
const TONE_STEP: Record<Tone, { delta: number; min: number; max: number }> = {
  dark: { delta: -18, min: 8, max: 100 },
  base: { delta: 0, min: 0, max: 100 },
  light: { delta: 22, min: 0, max: 94 },
}

const FILL_SATURATION = 0.62
const FILL_DARKEN = 8
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// The colour of a code against a zone's own theme saturation and lightness.
export function toneHsl(code: number, basis: { s: number; l: number }): HSL {
  const { hue, tone } = decodeHue(code)
  const step = TONE_STEP[tone]
  return { h: hue, s: Math.round(basis.s), l: Math.round(clamp(basis.l + step.delta, step.min, step.max)) }
}

// The same colour as CSS, following the active zone through the theme variables.
function toneCss(code: number, family: 'theme' | 'accent', fill = false): string {
  const { hue, tone } = decodeHue(code)
  const step = TONE_STEP[tone]
  const sVar = `var(--color-${family}-s)`
  const lVar = `var(--color-${family}-l)`
  // A panel fill is the accent's colour a little less loud and a little deeper (the template's flat olive, green, blue).
  const s = fill ? `calc(${sVar} * ${FILL_SATURATION})` : sVar
  const delta = step.delta - (fill ? FILL_DARKEN : 0)
  const min = Math.max(0, step.min - (fill ? FILL_DARKEN : 0))
  const l = delta === 0 && min === 0 && step.max === 100
    ? lVar
    : `clamp(${min}%, calc(${lVar} ${delta < 0 ? '-' : '+'} ${Math.abs(delta)}%), ${step.max}%)`
  return `hsl(${hue}, ${s}, ${l})`
}

// CSS for the two colour families. (`hue` may itself be a CSS value such as var(--color-theme-h), which
// is the zone's own colour at that hue.)
export const themeColorCss = (hue: number | string): string =>
  typeof hue === 'number' ? toneCss(hue, 'theme') : `hsl(${hue}, var(--color-theme-s), var(--color-theme-l))`
export const accentColorCss = (hue: number | string): string =>
  typeof hue === 'number' ? toneCss(hue, 'accent') : `hsl(${hue}, var(--color-accent-s), var(--color-accent-l))`

// A level panel's flat fill: the colour in the accent family, a little less loud and deeper.
export const fillColorCss = (code: number): string => toneCss(code, 'accent', true)

// The zone's own theme saturation and lightness: what a hue slider draws a base hue at.
export function zoneBasis(pal: ZonePalette, zone: ZoneKey): { s: number; l: number } {
  const { theme } = resolvePalette(pal, zone)
  return { s: theme.s, l: theme.l }
}

// The colour a book's cover is drawn in for a zone.
export function coverColor(pal: ZonePalette, zone: ZoneKey, code: number): HSL {
  return toneHsl(code, zoneBasis(pal, zone))
}

// Is the colour light enough that text on it has to be dark?
export const isLightColor = (code: number): boolean => decodeHue(code).tone === 'light'

// ---------------------------------------------------------------- legacy hex colours

// Hue (0-359) of a #rrggbb colour, or null for anything else.
export function hexToHue(hex: string | null | undefined): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return null
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return wrapHue(h * 60)
}

// A book's cover / theme colour: its own, else the nearest to an old hex colour (base), else the default.
export function bookThemeHue(book: { themeHue?: number | null; color?: string | null }): number {
  if (book.themeHue != null) return book.themeHue
  const hue = hexToHue(book.color)
  return hue != null ? encodeHue(hue, 'base') : DEFAULT_BOOK_HUE
}

// The theme variables for the subtree of a book's editors: the zone's own palette with the book's
// hue swapped in for both the theme and the accent hue (a book has the one colour). Going through
// deriveTokens keeps the zone's look (ink, fills, page); the tone's own lightness is in the colours
// drawn FROM the code (themeColorCss), not in these shared tokens.
export function bookScopeVars(pal: ZonePalette, zone: ZoneKey, role: Role, themeHue: number): ThemeVars {
  const hue = hueOfCode(themeHue)
  return deriveTokens({ ...pal, theme: { h: hue }, accent: { h: hue } }, role, zone)
}
