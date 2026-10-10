import type { HSL } from './contrast'
import { worstLevelRatio } from './levelContrast'
import { TEXT_TARGET, fitLightness, ratioOf } from './readable'
import { deriveTokens, type ThemeVars } from './tokens'
import { PAPER_LOOKS, ZONE_LOOKS, resolvePalette, themeLightness } from './zoneLooks'
import type { Role, ZoneKey, ZonePalette } from './types'

// Colours for the Writer's levels (project, series, book, arc, chapter) and plot categories.
// A colour is stored as one number, a hue in degrees (0..360; 0 and 360 are both red; it mirrors
// backend/app/storage/schema.py). Every colour has the same saturation and lightness -- the active
// time-of-day zone's own -- so the same colour is paler by day and deeper at night. (Earlier versions
// also stored a brightness, darker / base / lighter, in the same number; the backend converts those to
// their hue once on load.)

export const DEFAULT_BOOK_HUE = 28
// A limited slider (series, arc, chapter, plot subcategory) runs this far either side of its parent's hue.
export const SUBCATEGORY_HUE_WINDOW = 60

export const wrapHue = (hue: number): number => ((Math.round(hue) % 360) + 360) % 360

export const HUE_CODE_MIN = 0
export const HUE_CODE_MAX = 360

// The hue (0-359) a stored colour stands for.
export const hueOfCode = (code: number): number => wrapHue(code)

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

// A colour held within `width` degrees of a centre hue.
export const clampCodeToWindow = (centre: number, code: number, width = SUBCATEGORY_HUE_WINDOW): number => clampHueToWindow(centre, code, width)

// ---------------------------------------------------------------- hues as colours

const FILL_SATURATION = 0.62
const FILL_DARKEN = 8
// A panel fill carries white text, so it is held no lighter than this at the very most, whatever the zone's own lightness (a night
// palette can be light); a hue whose colours are brighter than others at the same lightness (yellow, green) is held darker still
// (fillCap), by contrast.
const FILL_MAX_L = 38
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// The lightest a level panel's fill of a hue may be for every white text on it to read (levelContrast.ts). It is worked out at the most
// saturated zone's fill (the brightest the hue gets), so one number holds in every zone.
const capCache = new Map<number, number>()
export function fillCap(hue: number): number {
  const h = wrapHue(hue)
  let cap = capCache.get(h)
  if (cap === undefined) {
    cap = fitLightness(h, ZONE_LOOKS.day.accentS * FILL_SATURATION, FILL_MAX_L, -1, c => worstLevelRatio(c) >= TEXT_TARGET)
    capCache.set(h, cap)
  }
  return cap
}

// The colour of a hue against a zone's own theme saturation and lightness.
export function hueHsl(code: number, basis: { s: number; l: number }): HSL {
  return { h: hueOfCode(code), s: Math.round(basis.s), l: Math.round(basis.l) }
}

// The same colour as CSS, following the active zone through the theme variables.
function hueCss(code: number, family: 'theme' | 'accent', fill = false): string {
  const hue = hueOfCode(code)
  const sVar = `var(--color-${family}-s)`
  const lVar = `var(--color-${family}-l)`
  // A panel fill is the accent's colour a little less loud and a little deeper (the template's flat olive, green, blue).
  if (!fill) return `hsl(${hue}, ${sVar}, ${lVar})`
  return `hsl(${hue}, calc(${sVar} * ${FILL_SATURATION}), clamp(0%, calc(${lVar} - ${FILL_DARKEN}%), ${fillCap(hue)}%))`
}

// CSS for the two colour families. (`hue` may itself be a CSS value such as var(--color-theme-h), which
// is the zone's own colour at that hue.)
export const themeColorCss = (hue: number | string): string =>
  typeof hue === 'number' ? hueCss(hue, 'theme') : `hsl(${hue}, var(--color-theme-s), var(--color-theme-l))`
export const accentColorCss = (hue: number | string): string =>
  typeof hue === 'number' ? hueCss(hue, 'accent') : `hsl(${hue}, var(--color-accent-s), var(--color-accent-l))`

// The same fill as numbers, for a zone's accent saturation and lightness (what fillColorCss draws in CSS; the contrast audit and the
// design system's token file use it).
export function fillHsl(hue: number, accent: { s: number; l: number }): HSL {
  return { h: hueOfCode(hue), s: accent.s * FILL_SATURATION, l: clamp(accent.l - FILL_DARKEN, 0, fillCap(hue)) }
}

// A level panel's flat fill: the colour in the accent family, a little less loud and deeper.
export const fillColorCss = (code: number): string => hueCss(code, 'accent', true)

// The zone's own theme saturation and lightness: what a hue slider draws a base hue at.
export function zoneBasis(pal: ZonePalette, zone: ZoneKey): { s: number; l: number } {
  const { theme } = resolvePalette(pal, zone)
  return { s: theme.s, l: theme.l }
}

// The colours of an edge tab for a level hue in a zone (EdgeTabs.tsx): the hue at the zone's theme saturation with its lightness moved
// only as far as the page's ink needs to read on it (the ink is the theme's, as the tab sits inside its book's scope).
export function tabColors(zone: ZoneKey, hue: number, scopeHue: number): { bg: HSL; ink: HSL } {
  const look = ZONE_LOOKS[zone]
  const ink: HSL = { h: scopeHue, s: 30, l: PAPER_LOOKS[look.mode].ink }
  const l = fitLightness(hueOfCode(hue), look.themeS, themeLightness(hueOfCode(hue), look), look.mode === 'dark' ? -1 : 1, c => ratioOf(ink, c) >= TEXT_TARGET)
  return { bg: { h: hueOfCode(hue), s: look.themeS, l }, ink }
}

// The colour a book's cover is drawn in for a zone.
export function coverColor(pal: ZonePalette, zone: ZoneKey, code: number): HSL {
  return hueHsl(code, zoneBasis(pal, zone))
}

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
  return hue != null ? hue : DEFAULT_BOOK_HUE
}

// The theme variables for the subtree of a book's editors: the zone's own palette with the book's
// hue swapped in for both the theme and the accent hue (a book has the one colour). Going through
// deriveTokens keeps the zone's look (ink, fills, page).
export function bookScopeVars(pal: ZonePalette, zone: ZoneKey, role: Role, themeHue: number): ThemeVars {
  const hue = hueOfCode(themeHue)
  return deriveTokens({ ...pal, theme: { h: hue }, accent: { h: hue } }, role, zone)
}
