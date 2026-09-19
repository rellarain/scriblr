import type { HS, PaletteKey, ZonePalette } from './types'

// Saturation rules, per zone:
//   theme < accent < alert  (each at least SAT_STEP apart)
//   theme < accent2 < alert (accent2 sits between them)
// and one brightness drives lightness: theme = brightness, accent/alert are
// a fixed step lighter each (kept within a visible band, see deriveLightness).
export const SAT_STEP = 5
export const L_STEP = 8

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round = (n: number) => Math.round(Number.isFinite(n) ? n : 0)

// Accent and alert must stay visible against the theme surfaces at every
// brightness, so they follow the brightness (a fixed step lighter each) only
// within a band: never so dark they vanish into a dark theme, never so light
// they wash out on a bright one.
export const ACCENT_L_RANGE = { min: 38, max: 58 }
export const ALERT_L_RANGE = { min: 46, max: 62 }

export function deriveLightness(base: number): { theme: number; accent: number; alert: number; accent2: number } {
  const theme = clamp(base, 0, 100)
  const accent = clamp(theme + L_STEP, ACCENT_L_RANGE.min, ACCENT_L_RANGE.max)
  const alert = clamp(theme + 2 * L_STEP, ALERT_L_RANGE.min, ALERT_L_RANGE.max)
  return { theme, accent, alert, accent2: accent }
}

// The legal saturation range for one color, given the others.
export function legalRange(pal: ZonePalette, key: PaletteKey): { min: number; max: number } {
  switch (key) {
    case 'theme': return { min: 0, max: 100 - 2 * SAT_STEP }
    case 'accent': return { min: pal.theme.s + SAT_STEP, max: 100 - SAT_STEP }
    case 'alert': return { min: pal.accent.s + SAT_STEP, max: 100 }
    case 'accent2': return { min: pal.theme.s + SAT_STEP, max: pal.alert.s - SAT_STEP }
  }
}

function cleanHS(hs: HS): HS {
  return { h: clamp(round(hs.h), 0, 360), s: clamp(round(hs.s), 0, 100) }
}

// Clamp every value into range and enforce the saturation ordering. Idempotent.
export function normalizePalette(pal: ZonePalette): ZonePalette {
  const theme = cleanHS(pal.theme)
  const accent = cleanHS(pal.accent)
  const alert = cleanHS(pal.alert)
  const accent2 = cleanHS(pal.accent2)
  theme.s = Math.min(theme.s, 100 - 2 * SAT_STEP)
  accent.s = clamp(Math.max(accent.s, theme.s + SAT_STEP), 0, 100 - SAT_STEP)
  alert.s = Math.max(alert.s, accent.s + SAT_STEP)
  accent2.s = clamp(accent2.s, theme.s + SAT_STEP, alert.s - SAT_STEP)
  return { brightness: clamp(round(pal.brightness), 0, 100), theme, accent, alert, accent2 }
}

// Set one color's saturation; colors that must stay above it are pushed up.
export function editSaturation(pal: ZonePalette, key: PaletteKey, s: number): ZonePalette {
  const next = { ...pal, [key]: { ...pal[key], s } } as ZonePalette
  const range = legalRange(pal, key)
  next[key] = { ...next[key], s: clamp(round(s), range.min, range.max) }
  return normalizePalette(next)
}

export function editHue(pal: ZonePalette, key: PaletteKey, h: number): ZonePalette {
  return normalizePalette({ ...pal, [key]: { ...pal[key], h } } as ZonePalette)
}

export function editBrightness(pal: ZonePalette, brightness: number): ZonePalette {
  return normalizePalette({ ...pal, brightness })
}
