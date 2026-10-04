import type { HSL } from './contrast'
import { deriveTokens, type ThemeVars } from './tokens'
import { resolvePalette } from './zoneLooks'
import type { Role, ZoneKey, ZonePalette } from './types'

// Colours for books and plot categories. A hue is all that is stored; the
// saturation and lightness come from the active time-of-day zone's look:
//   theme colours (book cover, categories)   -> the zone's theme saturation and lightness
//   accent colours (book accent, subcategories) -> the zone's accent saturation and lightness

export const DEFAULT_BOOK_HUE = 28
// A subcategory's hue stays this close (either way) to its category's hue.
export const SUBCATEGORY_HUE_WINDOW = 60

export const wrapHue = (hue: number): number => ((Math.round(hue) % 360) + 360) % 360

// The full-range colour sliders (project, book) end with four neutral swatches, stored
// in the same number as a hue: 361 brown, 362 black, 363 gray, 364 white. Unlike a hue a
// swatch has its own fixed saturation and lightness, so it is not zone-dependent.
export interface HueSwatch { value: number; name: string; color: HSL }
export const HUE_SWATCHES: readonly HueSwatch[] = [
  { value: 361, name: 'Brown', color: { h: 28, s: 45, l: 32 } },
  { value: 362, name: 'Black', color: { h: 0, s: 0, l: 10 } },
  { value: 363, name: 'Gray', color: { h: 0, s: 0, l: 48 } },
  { value: 364, name: 'White', color: { h: 0, s: 0, l: 94 } },
]
export const isSwatchHue = (hue: number): boolean => hue >= 361 && hue <= 364
export const swatchOf = (hue: number): HueSwatch | undefined => HUE_SWATCHES.find(s => s.value === hue)
// A slider's value as a stored level colour: a swatch stays itself, anything else wraps round the wheel.
export const normalizeHue = (hue: number): number => (isSwatchHue(Math.round(hue)) ? Math.round(hue) : wrapHue(hue))
const hslCss = (c: HSL): string => `hsl(${c.h}, ${c.s}%, ${c.l}%)`

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

// The signed shortest way round the colour wheel from one hue to another (-180..180].
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

// A book's cover / theme hue: its own, else the nearest to an old hex colour, else the default.
export function bookThemeHue(book: { themeHue?: number | null; color?: string | null }): number {
  return book.themeHue ?? hexToHue(book.color) ?? DEFAULT_BOOK_HUE
}

// CSS for the two colour families, following the active zone through the theme variables.
// (`hue` may itself be a CSS value such as var(--color-theme-h).)
export const themeColorCss = (hue: number | string): string =>
  typeof hue === 'number' && swatchOf(hue) ? hslCss(swatchOf(hue)!.color) : `hsl(${hue}, var(--color-theme-s), var(--color-theme-l))`
export const accentColorCss = (hue: number | string): string =>
  typeof hue === 'number' && swatchOf(hue) ? hslCss(swatchOf(hue)!.color) : `hsl(${hue}, var(--color-accent-s), var(--color-accent-l))`

// The colour a book's cover is drawn in for a zone (theme saturation and lightness).
export function coverColor(pal: ZonePalette, zone: ZoneKey, hue: number): HSL {
  const swatch = swatchOf(hue)
  if (swatch) return swatch.color
  const { theme } = resolvePalette(pal, zone)
  return { h: hue, s: theme.s, l: theme.l }
}

// The theme variables for the subtree of a book's editors: the zone's own
// palette with the book's theme hue (and accent hue, when set) swapped in.
// Going through deriveTokens keeps the zone's look (ink, fills, page).
export function bookScopeVars(pal: ZonePalette, zone: ZoneKey, role: Role, themeHue: number, accentHue: number | null): ThemeVars {
  // A neutral swatch tints with its nominal hue, then drops the saturation of a gray, black or white
  // (the lightness stays the zone's own, so text keeps its contrast).
  const nominal = (hue: number) => swatchOf(hue)?.color.h ?? hue
  const vars = deriveTokens(
    { ...pal, theme: { h: nominal(themeHue) }, accent: { h: accentHue != null ? nominal(accentHue) : pal.accent.h } },
    role,
    zone,
  )
  const neutral = (hue: number | null) => hue != null && isSwatchHue(hue) && swatchOf(hue)!.color.s === 0
  if (neutral(themeHue)) vars['--color-theme-s'] = '0%'
  if (neutral(accentHue)) {
    vars['--color-accent-s'] = '0%'
    if (role !== 'admin') vars['--color-accent2-s'] = '0%'
  }
  return vars
}
