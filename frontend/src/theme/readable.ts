import { hslToRgb, type HSL } from './contrast'

// Readability by contrast. WCAG 2.1 AA asks for a 4.5:1 contrast ratio for text, and 3:1 for large text, icons and the edges of
// controls. HSL lightness is blind to hue (a yellow and a blue at the same lightness differ several times over in brightness),
// so the theme does not trust lightness numbers: wherever a colour has text on it (or is text), its lightness is moved, a half
// point at a time, until the contrast holds for the hue actually in use. Everything here is pure arithmetic on colours.

export type RGB = [number, number, number]

// What the theme fits to: a hair over AA, so rounding a colour for CSS never drops it under.
export const TEXT_TARGET = 4.6
export const UI_TARGET = 3.2

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

export const rgbOf = (c: HSL): RGB => hslToRgb(c)
export const luminanceOf = (c: RGB): number => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2])

export function ratioOfRgb(a: RGB, b: RGB): number {
  const la = luminanceOf(a)
  const lb = luminanceOf(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
export const ratioOf = (a: HSL, b: HSL): number => ratioOfRgb(rgbOf(a), rgbOf(b))

// `fg` at `alpha` over `bg`: what a translucent colour looks like on its ground.
export const over = (fg: RGB, alpha: number, bg: RGB): RGB => [0, 1, 2].map(i => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB
// color-mix(in srgb, a pct%, b).
export const mixRgb = (a: RGB, pct: number, b: RGB): RGB => over(a, pct / 100, b)

export const BLACK: RGB = [0, 0, 0]
export const WHITE: RGB = [1, 1, 1]

const STEP = 0.5

// Moves a colour's lightness from `from` in `dir` (1 lighter, -1 darker), half a point at a time, until `ok` holds; the
// lightness it stops at (the last one tried, at 0 or 100, when nothing works).
export function fitLightness(hue: number, saturation: number, from: number, dir: 1 | -1, ok: (c: HSL) => boolean): number {
  let l = clamp(from, 0, 100)
  for (let i = 0; i < 220; i += 1) {
    if (ok({ h: hue, s: saturation, l })) return l
    const next = clamp(l + dir * STEP, 0, 100)
    if (next === l) return l
    l = next
  }
  return l
}

// The most a fill may be moved to keep its preferred ink (points); past that the other ink is used where it already reads.
export const MAX_FILL_SHIFT = 10

export interface FittedFill { fill: HSL; ink: HSL; dir: 1 | -1 }

// A fill with text on it: the lightness (nearly) as wanted, with the ink that reads on it. `light` and `dark` are the two inks; the
// preferred one is kept where its fill needs moving only a few points; otherwise the other ink is used if it already reads, or
// whichever needs the smaller move. `dir` is the way hover and dim shades step: away from the text.
export function fitFill(fill: HSL, light: HSL, dark: HSL, prefer: 'light' | 'dark'): FittedFill {
  const need = (ink: HSL, dir: 1 | -1) => fitLightness(fill.h, fill.s, fill.l, dir, c => ratioOf(ink, c) >= TEXT_TARGET)
  const withLight = need(light, -1) // light text wants a darker fill
  const withDark = need(dark, 1) // dark text wants a lighter fill
  const shiftLight = Math.abs(withLight - fill.l)
  const shiftDark = Math.abs(withDark - fill.l)
  const useLight = prefer === 'light'
    ? shiftLight <= MAX_FILL_SHIFT || shiftLight <= shiftDark
    : !(shiftDark <= MAX_FILL_SHIFT || shiftDark <= shiftLight)
  return useLight
    ? { fill: { ...fill, l: withLight }, ink: light, dir: -1 }
    : { fill: { ...fill, l: withDark }, ink: dark, dir: 1 }
}

// The ink for an already-fitted fill: whichever reads better.
export function bestInk(fill: HSL, light: HSL, dark: HSL): { ink: HSL; dir: 1 | -1 } {
  return ratioOf(light, fill) >= ratioOf(dark, fill) ? { ink: light, dir: -1 } : { ink: dark, dir: 1 }
}

// ---------------------------------------------------------------- OKLCH (CSS's `oklch()`: lightness that looks the same in every hue)

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

// The hue angle (degrees) of a colour in OKLCH: what `oklch(from <colour> l c h)` keeps.
export function oklchHueOf(rgb: RGB): number {
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
}

const oklchRaw = (lightness: number, chroma: number, hue: number): RGB => {
  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLinear) as RGB
}
const inGamut = (c: RGB) => c.every(v => v >= -0.0005 && v <= 1.0005)

// `oklch(lightness chroma hue)` as sRGB: a colour outside the gamut loses chroma until it fits (as a browser maps it).
export function oklchToRgb(lightness: number, chroma: number, hue: number): RGB {
  let lo = 0
  let hi = chroma
  if (inGamut(oklchRaw(lightness, hi, hue))) lo = hi
  else for (let i = 0; i < 24; i += 1) { const mid = (lo + hi) / 2; if (inGamut(oklchRaw(lightness, mid, hue))) lo = mid; else hi = mid }
  return oklchRaw(lightness, lo, hue).map(v => clamp(v, 0, 1)) as RGB
}
