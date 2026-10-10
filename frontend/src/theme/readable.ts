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
