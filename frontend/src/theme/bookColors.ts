import type { HSL } from './contrast'
import { deriveTokens, type ThemeVars } from './tokens'
import { resolvePalette } from './zoneLooks'
import type { Role, ZoneKey, ZonePalette } from './types'

// Colours for the Writer's levels (project, series, book, arc, chapter) and plot categories.
// One stored number holds a hue AND a tone (it mirrors backend/app/storage/schema.py):
//
//     1..360     saturated        hue = value mod 360
//   -360..0      desaturated      hue = -value
//    361..720    light saturated  hue = value - 360
//   -720..-361   dark saturated   hue = -value - 360
//
// plus neutral stops with no hue of their own: -721 dark gray, 721 white, and three "of the
// parent" stops (a limited slider's ends): -722 dark gray, 722 light gray, 723 light shade.
// The tones are steps from the active time-of-day zone's own theme saturation and lightness, so
// the same code is paler by day and deeper at night -- and "saturated" is exactly what a plain
// hue always was.

export const DEFAULT_BOOK_HUE = 28
// A limited slider (series, arc, chapter, plot subcategory) runs this far either side of its parent's hue.
export const SUBCATEGORY_HUE_WINDOW = 60

export const wrapHue = (hue: number): number => ((Math.round(hue) % 360) + 360) % 360

export type Tone = 'dark' | 'saturated' | 'desaturated' | 'light'
export const TONES: readonly Tone[] = ['dark', 'saturated', 'desaturated', 'light']
export const TONE_NAME: Record<Tone, string> = { dark: 'Dark saturated', saturated: 'Saturated', desaturated: 'Desaturated', light: 'Light saturated' }

export type Neutral = 'darkGray' | 'white' | 'darkGrayOfParent' | 'lightGrayOfParent' | 'lightShadeOfParent'
export const NEUTRAL_CODE: Record<Neutral, number> = {
  darkGray: -721, white: 721, darkGrayOfParent: -722, lightGrayOfParent: 722, lightShadeOfParent: 723,
}
export const NEUTRAL_NAME: Record<Neutral, string> = {
  darkGray: 'Dark gray', white: 'White', darkGrayOfParent: 'Dark gray of the parent', lightGrayOfParent: 'Light gray of the parent', lightShadeOfParent: 'Light shade of the parent',
}
const NEUTRAL_OF_CODE = new Map<number, Neutral>(Object.entries(NEUTRAL_CODE).map(([name, code]) => [code, name as Neutral]))

export const HUE_CODE_MIN = -724
export const HUE_CODE_MAX = 724

export type DecodedHue = { kind: 'hue'; hue: number; tone: Tone } | { kind: 'neutral'; neutral: Neutral }

export function decodeHue(code: number): DecodedHue {
  const c = Math.round(code)
  const neutral = NEUTRAL_OF_CODE.get(c)
  if (neutral) return { kind: 'neutral', neutral }
  if (c >= 1 && c <= 360) return { kind: 'hue', hue: c % 360, tone: 'saturated' }
  if (c >= 361 && c <= 720) return { kind: 'hue', hue: (c - 360) % 360, tone: 'light' }
  if (c <= 0 && c >= -360) return { kind: 'hue', hue: Math.abs(c) % 360, tone: 'desaturated' }
  if (c <= -361 && c >= -720) return { kind: 'hue', hue: (Math.abs(c) - 360) % 360, tone: 'dark' }
  return { kind: 'hue', hue: wrapHue(c), tone: 'saturated' } // anything else: a plain hue
}

// A hue (any number of degrees) in a tone, as the one stored number.
export function encodeHue(hue: number, tone: Tone): number {
  const h = wrapHue(hue)
  const full = h === 0 ? 360 : h // the top of each band stands for 0 degrees (0 itself is desaturated)
  if (tone === 'saturated') return full
  if (tone === 'light') return 360 + full
  if (tone === 'dark') return -(360 + full)
  return -h
}

export const isNeutralHue = (code: number): boolean => decodeHue(code).kind === 'neutral'
// The tone of a code (a neutral has none).
export const toneOf = (code: number): Tone | null => { const d = decodeHue(code); return d.kind === 'hue' ? d.tone : null }
// The hue (0-359) a code stands for; a neutral stands for the hue it was given (its parent's), else red's 0.
export const hueOfCode = (code: number, parentHue = 0): number => {
  const d = decodeHue(code)
  if (d.kind === 'hue') return d.hue
  return d.neutral === 'darkGray' || d.neutral === 'white' ? 0 : wrapHue(parentHue)
}
// A code for a plain hue, kept in the same tone as `like` (saturated when `like` is a neutral or missing).
export const hueInToneOf = (hue: number, like: number | null | undefined): number =>
  encodeHue(hue, (like != null ? toneOf(like) : null) ?? 'saturated')

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

// A colour code held within `width` degrees of a centre hue, keeping its tone. Stops that have a
// hue only through the parent ("of the parent") stay as they are; the free neutrals (dark gray,
// white) cannot sit in a window, so they fall back to `fallback`.
export function clampCodeToWindow(centre: number, code: number, fallback: number, width = SUBCATEGORY_HUE_WINDOW): number {
  const d = decodeHue(code)
  if (d.kind === 'neutral') return d.neutral === 'darkGray' || d.neutral === 'white' ? fallback : code
  return encodeHue(clampHueToWindow(centre, d.hue, width), d.tone)
}

// ---------------------------------------------------------------- tones as colours

// A colour as steps from the zone's theme saturation (S) and lightness (L).
interface ToneParts {
  h: number
  sMul: number | null // saturation = S * sMul
  sAbs: number | null // or a fixed saturation
  lDelta: number | null // lightness = clamp(L + lDelta, lMin, lMax)
  lAbs: number | null // or a fixed lightness
  lMin: number
  lMax: number
}

const parts = (h: number, over: Partial<ToneParts>): ToneParts => ({ h, sMul: 1, sAbs: null, lDelta: 0, lAbs: null, lMin: 0, lMax: 100, ...over })

export function tonePartsOf(code: number, parentHue = 0): ToneParts {
  const d = decodeHue(code)
  if (d.kind === 'hue') {
    switch (d.tone) {
      case 'dark': return parts(d.hue, { lDelta: -18, lMin: 8 })
      case 'desaturated': return parts(d.hue, { sMul: 0.45 })
      case 'light': return parts(d.hue, { lDelta: 22, lMax: 94 })
      default: return parts(d.hue, {})
    }
  }
  const parent = wrapHue(parentHue)
  switch (d.neutral) {
    case 'darkGray': return parts(0, { sMul: null, sAbs: 0, lDelta: -40, lMin: 8, lMax: 60 })
    case 'white': return parts(0, { sMul: null, sAbs: 0, lDelta: null, lAbs: 94 })
    case 'darkGrayOfParent': return parts(parent, { sMul: null, sAbs: 10, lDelta: -40, lMin: 8, lMax: 60 })
    case 'lightGrayOfParent': return parts(parent, { sMul: null, sAbs: 10, lDelta: 8, lMin: 40, lMax: 86 })
    default: return parts(parent, { lDelta: 22, lMin: 85, lMax: 94 }) // light shade of the parent
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// The colour of a code against a zone's own theme saturation and lightness.
export function toneHsl(code: number, basis: { s: number; l: number }, parentHue = 0): HSL {
  const p = tonePartsOf(code, parentHue)
  return {
    h: p.h,
    s: Math.round(p.sAbs ?? basis.s * (p.sMul ?? 1)),
    l: Math.round(p.lAbs ?? clamp(basis.l + (p.lDelta ?? 0), p.lMin, p.lMax)),
  }
}

// The same colour as CSS, following the active zone through the theme variables.
function toneCss(code: number, family: 'theme' | 'accent', parentHue: number): string {
  const p = tonePartsOf(code, parentHue)
  const sVar = `var(--color-${family}-s)`
  const lVar = `var(--color-${family}-l)`
  const s = p.sAbs !== null ? `${p.sAbs}%` : p.sMul === 1 ? sVar : `calc(${sVar} * ${p.sMul})`
  let l: string
  if (p.lAbs !== null) l = `${p.lAbs}%`
  else if (p.lDelta === 0 && p.lMin === 0 && p.lMax === 100) l = lVar
  else l = `clamp(${p.lMin}%, calc(${lVar} ${(p.lDelta ?? 0) < 0 ? '-' : '+'} ${Math.abs(p.lDelta ?? 0)}%), ${p.lMax}%)`
  return `hsl(${p.h}, ${s}, ${l})`
}

// CSS for the two colour families. (`hue` may itself be a CSS value such as var(--color-theme-h), which
// is the zone's own colour at that hue.) A code with a hue only through its parent needs `parentHue`.
export const themeColorCss = (hue: number | string, parentHue = 0): string =>
  typeof hue === 'number' ? toneCss(hue, 'theme', parentHue) : `hsl(${hue}, var(--color-theme-s), var(--color-theme-l))`
export const accentColorCss = (hue: number | string, parentHue = 0): string =>
  typeof hue === 'number' ? toneCss(hue, 'accent', parentHue) : `hsl(${hue}, var(--color-accent-s), var(--color-accent-l))`

// The zone's own theme saturation and lightness: what a hue slider draws a saturated hue at.
export function zoneBasis(pal: ZonePalette, zone: ZoneKey): { s: number; l: number } {
  const { theme } = resolvePalette(pal, zone)
  return { s: theme.s, l: theme.l }
}

// The colour a book's cover is drawn in for a zone.
export function coverColor(pal: ZonePalette, zone: ZoneKey, code: number, parentHue = 0): HSL {
  return toneHsl(code, zoneBasis(pal, zone), parentHue)
}

// Is the colour light enough that text on it has to be dark?
export function isLightColor(code: number): boolean {
  const d = decodeHue(code)
  if (d.kind === 'hue') return d.tone === 'light'
  return d.neutral === 'white' || d.neutral === 'lightGrayOfParent' || d.neutral === 'lightShadeOfParent'
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

// A book's cover / theme colour: its own, else the nearest to an old hex colour (saturated), else the default.
export function bookThemeHue(book: { themeHue?: number | null; color?: string | null }): number {
  if (book.themeHue != null) return book.themeHue
  const hue = hexToHue(book.color)
  return hue != null ? encodeHue(hue, 'saturated') : DEFAULT_BOOK_HUE
}

// The theme variables for the subtree of a book's editors: the zone's own palette with the book's
// hue swapped in for both the theme and the accent hue (a book has the one colour). Going through
// deriveTokens keeps the zone's look (ink, fills, page); the tone's own saturation and lightness
// are in the colours drawn FROM the code (themeColorCss), not in these shared tokens. A free
// neutral (dark gray, white) has no saturation at all, so it drops the tokens' too.
export function bookScopeVars(pal: ZonePalette, zone: ZoneKey, role: Role, themeHue: number): ThemeVars {
  const d = decodeHue(themeHue)
  const hue = d.kind === 'hue' ? d.hue : 0
  const vars = deriveTokens({ ...pal, theme: { h: hue }, accent: { h: hue } }, role, zone)
  if (d.kind === 'neutral' && (d.neutral === 'darkGray' || d.neutral === 'white')) {
    vars['--color-theme-s'] = '0%'
    vars['--color-accent-s'] = '0%'
    if (role !== 'admin') vars['--color-accent2-s'] = '0%'
  }
  return vars
}
