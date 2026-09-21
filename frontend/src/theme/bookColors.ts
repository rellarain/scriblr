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
export const themeColorCss = (hue: number | string): string => `hsl(${hue}, var(--color-theme-s), var(--color-theme-l))`
export const accentColorCss = (hue: number | string): string => `hsl(${hue}, var(--color-accent-s), var(--color-accent-l))`

// The colour a book's cover is drawn in for a zone (theme saturation and lightness).
export function coverColor(pal: ZonePalette, zone: ZoneKey, hue: number): HSL {
  const { theme } = resolvePalette(pal, zone)
  return { h: hue, s: theme.s, l: theme.l }
}

// The theme variables for the subtree of a book's editors: the zone's own
// palette with the book's theme hue (and accent hue, when set) swapped in.
// Going through deriveTokens keeps the zone's look (ink, fills, page).
export function bookScopeVars(pal: ZonePalette, zone: ZoneKey, role: Role, themeHue: number, accentHue: number | null): ThemeVars {
  return deriveTokens(
    { ...pal, theme: { h: themeHue }, accent: { h: accentHue ?? pal.accent.h } },
    role,
    zone,
  )
}
