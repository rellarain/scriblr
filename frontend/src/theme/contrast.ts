// WCAG relative luminance / contrast ratio for HSL colors.
export interface HSL { h: number; s: number; l: number }

export function hslToRgb({ h, s, l }: HSL): [number, number, number] {
  const S = s / 100
  const L = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

export function relLuminance(color: HSL): number {
  const [r, g, b] = hslToRgb(color).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: HSL, b: HSL): number {
  const la = relLuminance(a)
  const lb = relLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// The two text inks: pure white on dark surfaces (what the app has always
// used) and a near-black tinted with the theme hue on light ones.
export type InkMode = 'light' | 'dark'
export const inkColor = (mode: InkMode, themeHue: number): HSL =>
  mode === 'light' ? { h: 0, s: 0, l: 100 } : { h: themeHue, s: 12, l: 8 }

// Light ink on a dark fill, dark ink on a light one (the same cut-off the
// theme uses for its accent fills).
const LIGHT_INK_MAX_LUMINANCE = 0.3
export const readableInk = (fill: HSL, themeHue = 0): HSL =>
  relLuminance(fill) <= LIGHT_INK_MAX_LUMINANCE ? inkColor('light', themeHue) : inkColor('dark', themeHue)
