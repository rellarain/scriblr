import { contrastRatio, inkColor, relLuminance, type HSL, type InkMode } from './contrast'
import { deriveLightness } from './paletteRules'
import type { Role, ZonePalette } from './types'

// Turns a zone's palette into the CSS custom properties the app is styled
// with, keeping text readable at any brightness.
//
// Contrast rule:
//  1. The theme family (the theme color's own tiers plus the sidebar and card
//     tiers derived from it) has ONE ink, light (white) or dark. It is chosen
//     from the brightness, and the brightness is then clamped to the nearest
//     value where every tier has at least MIN_CONTRAST against that ink.
//     Brightness between the two limits is a "dead band" that snaps to
//     whichever side is nearer.
//  2. Accent / alert / accent2 fills choose their own ink: light text on a
//     dark fill, dark text on a light one (see fillInk); if the chosen ink is
//     under NATIVE_CONTRAST the other is used, and if neither reads the fill
//     lightness is nudged (at most NUDGE_MAX points).
export const MIN_CONTRAST = 4.5
export const NATIVE_CONTRAST = 3.0
const NUDGE_MAX = 6

// Surfaces derived from the theme lightness (offset in lightness points), all in the
// theme's own hue and saturation: its base, side, deep and deeper tiers, the
// sidebar shades and the raised card shades (see theme.scss).
const TIERS: number[] = [0, -4, -10, -20, -17, -9, -1, -8, 3]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function tierColor(offset: number, pal: ZonePalette, l: number): HSL {
  return { h: pal.theme.h, s: pal.theme.s, l: clamp(l + offset, 0, 100) }
}

function worstContrast(mode: InkMode, pal: ZonePalette, l: number): number {
  const ink = inkColor(mode, pal.theme.h)
  return Math.min(...TIERS.map(t => contrastRatio(ink, tierColor(t, pal, l))))
}

// The brightness limits for the two ink modes: the highest base lightness
// that still reads with light ink, and the lowest that reads with dark ink.
export function contrastBand(pal: ZonePalette): { maxLight: number; minDark: number } {
  let maxLight = 0
  for (let l = 100; l >= 0; l--) {
    if (worstContrast('light', pal, l) >= MIN_CONTRAST) { maxLight = l; break }
  }
  let minDark = 100
  for (let l = 0; l <= 100; l++) {
    if (worstContrast('dark', pal, l) >= MIN_CONTRAST) { minDark = l; break }
  }
  return { maxLight, minDark }
}

export function effectiveBrightness(pal: ZonePalette): { mode: InkMode; brightness: number } {
  const { maxLight, minDark } = contrastBand(pal)
  const b = clamp(pal.brightness, 0, 100)
  if (b <= (maxLight + minDark) / 2) return { mode: 'light', brightness: Math.min(b, maxLight) }
  return { mode: 'dark', brightness: Math.max(b, minDark) }
}

// A fill this dark (relative luminance) gets light text; lighter fills get dark
// text. Set above the point where the two inks are equally readable, so
// mid-tones keep the light text the app has always used on them.
const LIGHT_TEXT_MAX_LUMINANCE = 0.3

// Ink and (possibly nudged) lightness for a saturated fill: light text on a
// dark fill, dark text on a light one, unless that ink would be under
// NATIVE_CONTRAST (then the other, and if neither reads, the fill is nudged).
function fillInk(hs: { h: number; s: number }, l: number, themeHue: number): { ink: HSL; l: number } {
  const light = inkColor('light', themeHue)
  const dark = inkColor('dark', themeHue)
  const fill = (lightness: number): HSL => ({ h: hs.h, s: hs.s, l: lightness })
  const preferred = relLuminance(fill(l)) <= LIGHT_TEXT_MAX_LUMINANCE ? light : dark
  const other = preferred === light ? dark : light
  let ink = preferred
  if (contrastRatio(preferred, fill(l)) < NATIVE_CONTRAST && contrastRatio(other, fill(l)) > contrastRatio(preferred, fill(l))) {
    ink = other
  }
  let lightness = l
  const inkIsLight = ink.l > 50
  for (let i = 0; i < NUDGE_MAX && contrastRatio(ink, fill(lightness)) < NATIVE_CONTRAST; i++) {
    lightness = clamp(lightness + (inkIsLight ? -1 : 1), 0, 100)
  }
  return { ink, l: lightness }
}

const hsl = (c: HSL) => `hsl(${c.h}, ${c.s}%, ${c.l}%)`

// Paper (the Writer's page surface): light, dimming only at low brightness.
export function paperLightness(brightness: number): number {
  return brightness >= 35 ? 97 : Math.round(84 + (clamp(brightness, 0, 35) / 35) * 13)
}

export type ThemeVars = Record<string, string>

export function deriveTokens(pal: ZonePalette, role: Role): ThemeVars {
  const { mode, brightness } = effectiveBrightness(pal)
  const lightness = deriveLightness(brightness)
  const themeInk = inkColor(mode, pal.theme.h)

  const accent = fillInk(pal.accent, lightness.accent, pal.theme.h)
  const alert = fillInk(pal.alert, lightness.alert, pal.theme.h)
  const accent2Source = role === 'admin' ? pal.accent2 : pal.accent
  const accent2 = role === 'admin' ? fillInk(pal.accent2, lightness.accent2, pal.theme.h) : accent

  return {
    '--color-theme-h': String(pal.theme.h),
    '--color-theme-s': `${pal.theme.s}%`,
    '--color-theme-l': `${lightness.theme}%`,
    '--color-accent-h': String(pal.accent.h),
    '--color-accent-s': `${pal.accent.s}%`,
    '--color-accent-l': `${accent.l}%`,
    '--color-alert-h': String(pal.alert.h),
    '--color-alert-s': `${pal.alert.s}%`,
    '--color-alert-l': `${alert.l}%`,
    '--color-accent2-h': String(accent2Source.h),
    '--color-accent2-s': `${accent2Source.s}%`,
    '--color-accent2-l': `${accent2.l}%`,
    '--ink': hsl(themeInk),
    '--on-accent': hsl(accent.ink),
    '--on-alert': hsl(alert.ink),
    '--on-accent2': hsl(accent2.ink),
    // Black recess overlays soften on light themes.
    '--shade-k': mode === 'light' ? '1' : '0.55',
    '--paper-l': `${paperLightness(brightness)}%`,
  }
}
