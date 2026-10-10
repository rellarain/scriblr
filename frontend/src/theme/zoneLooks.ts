import { inkColor, type HSL } from './contrast'
import {
  BLACK, TEXT_TARGET, UI_TARGET, bestInk, fitFill, fitLightness, over, ratioOf, ratioOfRgb, rgbOf,
} from './readable'
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
// The numbers in a look are where each colour STARTS. Readability is by WCAG contrast (readable.ts), not
// by lightness, which is blind to hue: where a hue would leave text under 4.5:1, the colour's lightness is
// moved a little (resolvePalette, below) until it reads, so any hue the user picks stays readable.
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
// hue) on a light one.
export const zoneInk = (mode: ZoneMode, themeHue: number): HSL => inkColor(mode === 'dark' ? 'light' : 'dark', themeHue)

const LIGHT_INK: HSL = { h: 0, s: 0, l: 100 }
const darkInk = (themeHue: number): HSL => inkColor('dark', themeHue)

// The text on an accent, alert or admin-accent fill: whichever ink reads better on it (the fill itself has been fitted for one of
// them, resolvePalette). Its hover / dim shades step AWAY from that text: darker under light text, lighter under dark text (`dir`).
export function fillInk(fill: HSL, themeHue: number): { ink: HSL; dir: 1 | -1 } {
  return bestInk(fill, LIGHT_INK, darkInk(themeHue))
}

// The direction "away from the text" for the theme's own surfaces: darker on a dark
// zone (light text), lighter on a light one.
export const fillDirection = (mode: ZoneMode): 1 | -1 => (mode === 'dark' ? -1 : 1)
export const HOVER_STEP = 12
export const DIM_STEP = 14
export const DIM_SATURATION_DROP = 20

// How strong the muted and faint versions of the ink are (percent of the ink over what it sits on). They are text too, so
// they are held to the same 4.5:1: the fit of the theme's lightness (themeLightness) includes them. Light zones have no
// translucent tier: their ink is already as dark as it can be, so muted and faint are the ink itself.
export const INK_STRENGTH: Record<ZoneMode, { muted: number; faint: number }> = {
  dark: { muted: 90, faint: 84 },
  light: { muted: 100, faint: 100 },
}

// The theme's surfaces, as lightness offsets from its base (theme.scss):
// base, side, deep, deeper, the sidebar's second shade, the two ends of the older raised gradient, and
// the active raised card, then the flat raised surface (cards, tiles). The sidebar's first shade isn't a fixed offset -- see
// SIDEBAR_SHADE_1 below -- so it's checked on its own, not in this list.
export const SURFACE_OFFSETS = [0, -4, -10, -20, -9, -1, -8, 3, -5]

// --surface-sidebar-1's step from --color-theme-l (theme.scss): a light zone's
// already-bright background can afford a deeper recess, but the same subtraction on
// a dark zone's already-low lightness crushes toward pure black, so dark zones step
// up instead, by less than light zones step down.
export const SIDEBAR_SHADE_1: Record<ZoneMode, number> = { light: -17, dark: 6 }

// The overlays a surface can carry (--ov-sink-*: black at 0.16 / 0.25 / 0.35 times --shade-k) darken it below its tier.
export const SINK_ALPHAS = [0, 0.16, 0.25, 0.35]
export const shadeK = (mode: ZoneMode): number => (mode === 'dark' ? 1 : 0.55)

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// The deepest lift overlay (--ov-lift-3: the ink at 22%) a surface carries on hover or press.
export const LIFT_ALPHA = 0.22

// Does the zone's ink (and its muted and faint tiers) read on every surface of a theme at this lightness?
function surfacesRead(hue: number, look: ZoneLook, themeL: number): boolean {
  const ink = rgbOf(zoneInk(look.mode, hue))
  const { muted, faint } = INK_STRENGTH[look.mode]
  const offsets = [...SURFACE_OFFSETS, SIDEBAR_SHADE_1[look.mode]]
  for (const offset of offsets) {
    const surface = rgbOf({ h: hue, s: look.themeS, l: clamp(themeL + offset, 0, 100) })
    for (const sink of SINK_ALPHAS) {
      const bg = over(BLACK, sink * shadeK(look.mode), surface)
      for (const strength of [100, muted, faint]) {
        if (ratioOfRgb(over(ink, strength / 100, bg), bg) < TEXT_TARGET) return false
      }
    }
  }
  // A hovered or pressed surface (the ink lifts it by up to LIFT_ALPHA): measured on the base and the deep surface.
  for (const offset of [0, SURFACE_OFFSETS[2]]) {
    const surface = rgbOf({ h: hue, s: look.themeS, l: clamp(themeL + offset, 0, 100) })
    const bg = over(ink, LIFT_ALPHA, surface)
    for (const strength of [100, muted]) {
      if (ratioOfRgb(over(ink, strength / 100, bg), bg) < TEXT_TARGET) return false
    }
  }
  return true
}

// The lightness a theme of this hue is drawn at: the zone's own, moved the least that lets the ink read on every one of its
// surfaces (darker on a dark zone, lighter on a light one).
const themeCache = new Map<string, number>()
export function themeLightness(hue: number, look: ZoneLook): number {
  const key = `${look.mode}/${look.themeS}/${look.themeL}/${hue}`
  let l = themeCache.get(key)
  if (l === undefined) {
    l = fitLightness(hue, look.themeS, look.themeL, look.mode === 'dark' ? -1 : 1, c => surfacesRead(hue, look, c.l))
    themeCache.set(key, l)
  }
  return l
}

// The Writer's page. Its shades are written as `paper-l - N% * dir`, so they
// step toward the text colour: darker on a light sheet (dir 1), lighter on a
// dark one (dir -1). Fields go the other way (`paper-l + N% * dir`).
export interface PaperLook {
  dir: 1 | -1
  // The page's text inks, as lightness (hue and saturation: the theme's, desaturated; see theme.scss).
  ink: number
  ink2: number
  label: number
  muted: number
  placeholder: number
  // How far the Writer's page, and then each nested card on it (frame 1..5), steps from the sheet, in points: deep enough to see,
  // shallow enough that the inks still read on it.
  page: number
  frames: [number, number, number, number, number]
  // Reaction bar fills (lightness).
  react: number
}

export const PAPER_LOOKS: Record<ZoneMode, PaperLook> = {
  light: { dir: 1, ink: 10, ink2: 18, label: 24, muted: 28, placeholder: 32, page: 4, frames: [6, 9, 12, 15, 18], react: 91 },
  dark: { dir: -1, ink: 100, ink2: 96, label: 93, muted: 91, placeholder: 88, page: 4, frames: [5, 8, 10, 12, 14], react: 21 },
}

export interface PaperHues { theme: number; accent: number; alert: number }
// The page grounds: the sheet (`--paper`, `--paper-soft`), the Writer's chapter page and its fields and nested cards, which are the theme's hue.
export interface PaperGrounds { paper: HSL; soft: HSL; page: HSL; field: HSL; frames: HSL[] }

// The paper's grounds (theme.scss `--paper`, `--paper-soft`; writer.scss `.wrPage--chapter`: `--wr-page`, `--paper-field`, `--wr-frame-1..5`).
export function paperGrounds(zone: ZoneKey, hues: Pick<PaperHues, 'theme' | 'accent'>): PaperGrounds {
  const look = ZONE_LOOKS[zone]
  const p = PAPER_LOOKS[look.mode]
  const at = (h: number, s: number, step: number): HSL => ({ h, s, l: look.paperL - step * p.dir })
  return {
    paper: at(hues.accent, 45, 0),
    soft: at(hues.accent, 30, 2),
    page: at(hues.theme, look.themeS, p.page),
    field: at(hues.theme, look.themeS, -3),
    frames: p.frames.map(n => at(hues.theme, look.themeS, n)),
  }
}

// The inks of the page, as colours (theme.scss `--paper-ink`..`--paper-placeholder`).
export function paperInks(zone: ZoneKey, themeHue: number): Record<'ink' | 'ink2' | 'label' | 'muted' | 'placeholder', HSL> {
  const p = PAPER_LOOKS[ZONE_LOOKS[zone].mode]
  return {
    ink: { h: themeHue, s: 12, l: p.ink }, ink2: { h: themeHue, s: 10, l: p.ink2 }, label: { h: themeHue, s: 8, l: p.label },
    muted: { h: themeHue, s: 8, l: p.muted }, placeholder: { h: themeHue, s: 6, l: p.placeholder },
  }
}

// The reaction bars' fills at their three strengths: the accent's hue for a like, the alert's for a dislike.
export const LIKE_BAR_SATURATIONS = [30, 62, 96]
export const DISLIKE_BAR_SATURATIONS = [26, 58, 92]

export interface PaperAccents { error: HSL; like: HSL; dislike: HSL }

// The three coloured marks on the page, each moved only as far as it needs to read: the page's error text (4.5:1 on the sheet, its soft
// shade, the chapter page, a field and the first card) and the like and dislike hearts (3:1 on their three fills, as icons).
export function paperAccents(zone: ZoneKey, hues: PaperHues): PaperAccents {
  const look = ZONE_LOOKS[zone]
  const p = PAPER_LOOKS[look.mode]
  const g = paperGrounds(zone, hues)
  const dir: 1 | -1 = p.dir === 1 ? -1 : 1 // away from the page: darker on a light sheet
  const errorGrounds = [g.paper, g.soft, g.page, g.field, g.frames[0]]
  const errorL = fitLightness(hues.alert, look.alertS, look.alertL, dir, c => errorGrounds.every(b => ratioOf(c, b) >= TEXT_TARGET))
  const likeBars = LIKE_BAR_SATURATIONS.map(s => ({ h: hues.accent, s, l: p.react }))
  const likeL = fitLightness(hues.accent, 72, look.accentL, dir, c => likeBars.every(b => ratioOf(c, b) >= UI_TARGET))
  const dislikeBars = DISLIKE_BAR_SATURATIONS.map(s => ({ h: hues.alert, s, l: p.react }))
  const dislikeL = fitLightness(hues.alert, look.alertS, look.alertL, dir, c => dislikeBars.every(b => ratioOf(c, b) >= UI_TARGET))
  return {
    error: { h: hues.alert, s: look.alertS, l: errorL },
    like: { h: hues.accent, s: 72, l: likeL },
    dislike: { h: hues.alert, s: look.alertS, l: dislikeL },
  }
}

// A palette's hues with the zone's saturation and lightness filled in -- the lightness moved, where the hue needs it, until text reads
// on it: the theme's so the ink reads on every surface; each fill's so one of the two inks reads on it (fillInk picks it).
export type ResolvedPalette = Record<PaletteKey, HSL>

const paletteCache = new Map<string, ResolvedPalette>()
export function resolvePalette(pal: ZonePalette, zone: ZoneKey): ResolvedPalette {
  const key = `${zone}/${pal.theme.h}/${pal.accent.h}/${pal.alert.h}/${pal.accent2.h}`
  const cached = paletteCache.get(key)
  if (cached) return cached
  const look = ZONE_LOOKS[zone]
  const prefer = look.mode === 'dark' ? 'dark' : 'light'
  const dark = darkInk(pal.theme.h)
  const fill = (h: number, s: number, l: number) => fitFill({ h, s, l }, LIGHT_INK, dark, prefer).fill
  const resolved: ResolvedPalette = {
    theme: { h: pal.theme.h, s: look.themeS, l: themeLightness(pal.theme.h, look) },
    accent: fill(pal.accent.h, look.accentS, look.accentL),
    alert: fill(pal.alert.h, look.alertS, look.alertL),
    accent2: fill(pal.accent2.h, look.accentS, look.accentL),
  }
  paletteCache.set(key, resolved)
  return resolved
}


// The Preview page's own tone (the reader's day or night choice, writer.scss `.wrPage--day` and `--night`): the page, its text, its rules and
// its quiet text, themed like the paper of the Day or the Night zone whatever zone the app is in. They are the same pairs the audit
// measures for those zones (the chapter page, `paperInks`), so they read for every hue.
export function pageTone(tone: 'day' | 'night', theme: number, accent: number): Record<'page' | 'ink' | 'line' | 'muted', HSL> {
  const zone: ZoneKey = tone
  const look = ZONE_LOOKS[zone]
  const p = PAPER_LOOKS[look.mode]
  const inks = paperInks(zone, theme)
  return {
    page: paperGrounds(zone, { theme, accent }).page,
    ink: inks.ink,
    line: { h: theme, s: look.themeS, l: look.paperL - 18 * p.dir },
    muted: inks.muted,
  }
}
