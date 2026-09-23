import { contrastRatio, inkColor, type HSL } from './contrast'
import type { PaletteKey, ZoneKey, ZonePalette } from './types'

// Each time zone has a fixed LOOK: whether the background is dark or light, and
// how saturated and how light every colour is. The user only chooses the four
// hues (theme, accent, alert, admin accent); everything else comes from here.
//
//   night  dark background, light text, muted colours
//   dusk   dark background, light text, vivid colours
//   day    light background, dark text, vivid colours
//   dawn   light background, dark text, muted colours
//
// Rules, kept by zoneLooks.test.ts:
//  - saturation order: theme < accents < alert, in every zone (the admin accent
//    is the accent's twin, so only its hue tells them apart);
//  - text is always at least MIN_TEXT_GAP lightness points away from what it
//    sits on -- a hard floor, never relaxed even when the closer-reading ink
//    would otherwise be picked (fillInk, below).
export type ZoneMode = 'dark' | 'light'

export interface ZoneLook {
  mode: ZoneMode
  summary: string
  themeS: number
  themeL: number
  accentS: number
  accentL: number
  alertS: number
  alertL: number
  // The Writer's page (paper) sits at this lightness before its own steps.
  paperL: number
}

export const MIN_TEXT_GAP = 45

const MUTED = { themeS: 15, accentS: 45, alertS: 70 }
const VIVID = { themeS: 30, accentS: 80, alertS: 100 }
const DARK_FILLS = { accentL: 62, alertL: 66 }
const LIGHT_FILLS = { accentL: 42, alertL: 46 }

export const ZONE_LOOKS: Record<ZoneKey, ZoneLook> = {
  night: { mode: 'dark', summary: 'Dark background, light text, muted colours', ...MUTED, themeL: 26, ...DARK_FILLS, paperL: 12 },
  dusk: { mode: 'dark', summary: 'Dark background, light text, vivid colours', ...VIVID, themeL: 34, ...DARK_FILLS, paperL: 18 },
  day: { mode: 'light', summary: 'Light background, dark text, vivid colours', ...VIVID, themeL: 86, ...LIGHT_FILLS, paperL: 97 },
  dawn: { mode: 'light', summary: 'Light background, dark text, muted colours', ...MUTED, themeL: 80, ...LIGHT_FILLS, paperL: 97 },
}

// The zone's one text colour: light on a dark zone, dark (tinted with the theme
// hue) on a light one. It is also the text on every accent, alert and admin fill.
export const zoneInk = (mode: ZoneMode, themeHue: number): HSL => inkColor(mode === 'dark' ? 'light' : 'dark', themeHue)

// The text on an accent, alert or admin-accent fill is chosen per fill: whichever
// ink is at least MIN_TEXT_GAP points away, since only one of the two usually
// clears that at this width; contrast only breaks the tie on the rarer fill where
// both do. (HSL lightness ignores how bright a hue looks, so a yellow and a blue
// at the same lightness want different text.) Its hover / dim / variant shades
// step AWAY from that text: darker under light text, lighter under dark text (`dir`).
export function fillInk(fill: HSL, themeHue: number): { ink: HSL; dir: 1 | -1 } {
  const light = inkColor('light', themeHue)
  const dark = inkColor('dark', themeHue)
  const ok = (ink: HSL) => Math.abs(ink.l - fill.l) >= MIN_TEXT_GAP
  const pick = ok(light) && ok(dark)
    ? (contrastRatio(light, fill) > contrastRatio(dark, fill) ? light : dark)
    : ok(light) ? light : ok(dark) ? dark
    : (Math.abs(light.l - fill.l) >= Math.abs(dark.l - fill.l) ? light : dark)
  return { ink: pick, dir: pick === light ? -1 : 1 }
}

// The direction "away from the text" for the theme's own surfaces: darker on a
// dark zone (light text), lighter on a light one.
export const fillDirection = (mode: ZoneMode): 1 | -1 => (mode === 'dark' ? -1 : 1)
export const HOVER_STEP = 12
export const DIM_STEP = 14
export const DIM_SATURATION_DROP = 20

// How strong the muted and faint versions of the ink are (percent of the ink over
// what it sits on) -- kept just strong enough that the blend itself still clears
// MIN_TEXT_GAP at the tightest surface (a dark zone's Sidebar-1 with no shadow
// overlay yet). Light zones have no room for a translucent tier at all: their
// deepest, most heavily shadowed surface leaves under a point of margin for the
// raw ink itself, so any real transparency would drop the blend below the floor --
// muted and faint render at full strength there, same as the ink itself.
export const INK_STRENGTH: Record<ZoneMode, { muted: number; faint: number }> = {
  dark: { muted: 75, faint: 75 },
  light: { muted: 100, faint: 100 },
}

// The theme's surfaces, as lightness offsets from its base (theme.scss):
// base, side, deep, deeper, the sidebar's second shade, the two raised cards, and
// the active raised card. The sidebar's first shade isn't a fixed offset -- see
// SIDEBAR_SHADE_1 below -- so it's checked on its own, not in this list.
export const SURFACE_OFFSETS = [0, -4, -10, -20, -9, -1, -8, 3]

// --surface-sidebar-1's step from --color-theme-l (theme.scss): a light zone's
// already-bright background can afford a deeper recess, but the same subtraction on
// a dark zone's already-low lightness crushes toward pure black, so dark zones step
// up instead, by less than light zones step down.
export const SIDEBAR_SHADE_1: Record<ZoneMode, number> = { light: -17, dark: 6 }

// The Writer's page. Its shades are written as `paper-l - N% * dir`, so they
// step toward the text colour: darker on a light sheet (dir 1), lighter on a
// dark one (dir -1). Fields go the other way (`paper-l + N% * dir`).
export interface PaperLook {
  dir: 1 | -1
  ink: number
  ink2: number
  label: number
  muted: number
  placeholder: number
  // Reaction bar fills, and the ink of a "like" bar.
  react: number
  like: number
}

export const PAPER_LOOKS: Record<ZoneMode, PaperLook> = {
  light: { dir: 1, ink: 17, ink2: 28, label: 38, muted: 42, placeholder: 46, react: 91, like: 38 },
  dark: { dir: -1, ink: 92, ink2: 84, label: 74, muted: 70, placeholder: 69, react: 21, like: 72 },
}

// The page's inline error text is the alert colour itself, stepped further from
// the paper by this many points (same direction as every other paper shade,
// `- N% * paper.dir` in theme.scss's --paper-error) -- alertL alone doesn't clear
// MIN_TEXT_GAP from the paper's own deepest surface at this width, and alertL is
// shared by too much else (buttons, badges) to move on its own.
export const PAPER_ERROR_SHIFT = 4

// A palette's hues with the zone's saturation and lightness filled in.
export type ResolvedPalette = Record<PaletteKey, HSL>

export function resolvePalette(pal: ZonePalette, zone: ZoneKey): ResolvedPalette {
  const look = ZONE_LOOKS[zone]
  return {
    theme: { h: pal.theme.h, s: look.themeS, l: look.themeL },
    accent: { h: pal.accent.h, s: look.accentS, l: look.accentL },
    alert: { h: pal.alert.h, s: look.alertS, l: look.alertL },
    accent2: { h: pal.accent2.h, s: look.accentS, l: look.accentL },
  }
}
