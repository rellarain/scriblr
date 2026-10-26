import type { HSL } from './contrast'
import { DIM_SATURATION_DROP, DIM_STEP, HOVER_STEP, SIDEBAR_SHADE_1, SURFACE_OFFSETS, ZONE_LOOKS, fillInk, resolvePalette } from './zoneLooks'
import type { PaletteKey, ZoneKey, ZonePalette } from './types'

// The generated palette shown above each colour in the theme editor: the shades
// the app really derives from it (mirroring the formulas in theme/theme.scss),
// and an even ladder of tints and shades of the colour.

export interface Swatch { key: string; label: string; color: HSL }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const hslCss = (c: HSL): string => `hsl(${c.h}, ${c.s}%, ${c.l}%)`

const SURFACE_LABELS = ['Base', 'Side', 'Deep', 'Deeper', 'Sidebar 2', 'Raised a', 'Raised b', 'Raised active', 'Raised']

export function derivedShades(pal: ZonePalette, key: PaletteKey, zone: ZoneKey): Swatch[] {
  const colors = resolvePalette(pal, zone)

  if (key === 'theme') {
    const t = colors.theme // every surface is the theme's hue and saturation (theme.scss)
    const shade = (label: string, offset: number): Swatch => ({ key: label, label, color: { h: t.h, s: t.s, l: clamp(t.l + offset, 0, 100) } })
    const shades = SURFACE_OFFSETS.map((offset, i) => shade(SURFACE_LABELS[i], offset))
    // Sidebar 1 isn't a fixed offset -- it steps by mode (SIDEBAR_SHADE_1) -- so it's
    // built separately and reinserted after Deeper, where it always used to sit.
    const sidebar1 = shade('Sidebar 1', SIDEBAR_SHADE_1[ZONE_LOOKS[zone].mode])
    return [...shades.slice(0, 4), sidebar1, ...shades.slice(4)]
  }

  const src = colors[key]
  const { dir } = fillInk(src, pal.theme.h)
  const fill: Swatch = { key: 'Fill', label: 'Fill', color: src }
  if (key === 'alert') return [fill]
  const hover: Swatch = { key: 'Hover', label: 'Hover', color: { ...src, l: clamp(src.l + HOVER_STEP * dir, 0, 100) } }
  if (key === 'accent2') return [fill, hover]
  const dim: Swatch = {
    key: 'Dim', label: 'Dim', color: { h: src.h, s: clamp(src.s - DIM_SATURATION_DROP, 0, 100), l: clamp(src.l + DIM_STEP * dir, 0, 100) },
  }
  return [fill, hover, dim]
}

// Even steps from light to dark at the colour's own hue and saturation.
export const TINT_LIGHTNESS = [90, 80, 70, 60, 50, 40, 30, 20, 10]

// The strip under a role in the account theme panel (display only): ten shades of the role's hue at its zone's saturation, SHADE_STEP
// points of lightness apart, darkest first, with the role's own colour among them (key 'own') in the sixth place (five darker, four
// brighter). Near the top or bottom of the range the run moves to stay between SHADE_MIN and SHADE_MAX, the own colour keeping its exact
// lightness.
export const SHADE_STEP = 6
export const SHADE_MIN = 4
export const SHADE_MAX = 96
export const SHADE_COUNT = 10

export function shadeStrip(pal: ZonePalette, zone: ZoneKey, key: PaletteKey): Swatch[] {
  const src = resolvePalette(pal, zone)[key]
  const room = (from: number, to: number) => Math.max(0, Math.floor((to - from) / SHADE_STEP))
  const wantBelow = Math.min(5, room(SHADE_MIN, src.l))
  const above = Math.min(SHADE_COUNT - 1 - wantBelow, room(src.l, SHADE_MAX))
  const below = SHADE_COUNT - 1 - above
  return Array.from({ length: SHADE_COUNT }, (_, i) => {
    const l = i === below ? src.l : clamp(src.l + (i - below) * SHADE_STEP, 0, 100)
    return { key: i === below ? 'own' : `S${i}`, label: i === below ? 'Own' : `${Math.round(l)}%`, color: { h: src.h, s: src.s, l } }
  })
}

export function tints(pal: ZonePalette, key: PaletteKey, zone: ZoneKey): Swatch[] {
  const src = resolvePalette(pal, zone)[key]
  return TINT_LIGHTNESS.map(l => ({ key: `L${l}`, label: `${l}%`, color: { h: src.h, s: src.s, l } }))
}
