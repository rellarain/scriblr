import type { HSL } from './contrast'
import { deriveTokens } from './tokens'
import type { PaletteKey, ZonePalette } from './types'

// The generated palette shown above each colour in the theme editor: the shades
// the app really derives from it (mirroring the formulas in theme/theme.scss),
// and an even ladder of tints and shades of the colour.

export interface Swatch { key: string; label: string; color: HSL }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const pct = (vars: Record<string, string>, name: string) => parseFloat(vars[name])

export const hslCss = (c: HSL): string => `hsl(${c.h}, ${c.s}%, ${c.l}%)`

export function derivedShades(pal: ZonePalette, key: PaletteKey): Swatch[] {
  const vars = deriveTokens(pal, key === 'accent2' ? 'admin' : 'user')
  const themeL = pct(vars, '--color-theme-l')
  const surface = (label: string, h: number, s: number, offset: number): Swatch => (
    { key: label, label, color: { h, s, l: clamp(themeL + offset, 0, 100) } }
  )

  if (key === 'theme') {
    const t = pal.theme // every surface is the theme's hue and saturation (theme.scss)
    return [
      surface('Base', t.h, t.s, 0),
      surface('Side', t.h, t.s, -4),
      surface('Deep', t.h, t.s, -10),
      surface('Deeper', t.h, t.s, -20),
      surface('Sidebar 1', t.h, t.s, -17),
      surface('Sidebar 2', t.h, t.s, -9),
      surface('Raised a', t.h, t.s, -1),
      surface('Raised b', t.h, t.s, -8),
      surface('Raised active', t.h, t.s, 3),
    ]
  }

  const src = pal[key]
  const fillL = pct(vars, `--color-${key}-l`)
  const fill: Swatch = { key: 'Fill', label: 'Fill', color: { h: src.h, s: src.s, l: fillL } }
  if (key === 'alert') return [fill]
  const hover: Swatch = { key: 'Hover', label: 'Hover', color: { h: src.h, s: src.s, l: clamp(fillL + 12, 0, 100) } }
  if (key === 'accent2') return [fill, hover]
  const dim: Swatch = {
    key: 'Dim', label: 'Dim', color: { h: src.h, s: clamp(src.s - 20, 0, 100), l: clamp(fillL - 14, 0, 100) },
  }
  return [fill, hover, dim]
}

// Even steps from light to dark at the colour's own hue and saturation.
export const TINT_LIGHTNESS = [90, 80, 70, 60, 50, 40, 30, 20, 10]

export function tints(pal: ZonePalette, key: PaletteKey): Swatch[] {
  const src = pal[key]
  return TINT_LIGHTNESS.map(l => ({ key: `L${l}`, label: `${l}%`, color: { h: src.h, s: src.s, l } }))
}
