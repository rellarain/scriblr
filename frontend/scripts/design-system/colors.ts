import { fillHsl } from '../../src/theme/bookColors'
import type { HSL } from '../../src/theme/contrast'
import { DEFAULT_PALETTE } from '../../src/theme/defaults'
import { BLACK, WHITE, mixRgb, rgbOf, type RGB } from '../../src/theme/readable'
import type { ZoneKey, ZonePalette } from '../../src/theme/types'
import {
  DISLIKE_BAR_SATURATIONS, INK_STRENGTH, LIKE_BAR_SATURATIONS, PAPER_LOOKS, SIDEBAR_SHADE_1, SINK_ALPHAS, SURFACE_OFFSETS, ZONE_LOOKS,
  fillDirection, fillInk, pageTone, paperAccents, paperGrounds, paperInks, resolvePalette, shadeK, zoneInk,
} from '../../src/theme/zoneLooks'

// The design system's colour tokens for one zone: the theme's own derived colours (theme/tokens.ts, theme.scss, writer.scss) worked out as
// literal values, so a token file needs no CSS variables. Everything is computed by the same functions the app draws with.

export interface ColorToken { name: string; value: string; usage: string }

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const byte = (c: number) => Math.round(clamp(c * 255, 0, 255)).toString(16).padStart(2, '0')
export const hex = (c: RGB): string => `#${byte(c[0])}${byte(c[1])}${byte(c[2])}`
export const hexOf = (c: HSL): string => hex(rgbOf(c))
const hexAlpha = (c: RGB, alpha: number): string => `${hex(c)}${byte(alpha)}`
const hsl = (h: number, s: number, l: number): HSL => ({ h, s, l })

// The hues the system shows level colours at.
export const SAMPLE_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
const DEFAULT_BOOK_HUE = 28

export const ZONE_THEMES: Array<{ id: ZoneKey; name: string }> = [
  { id: 'day', name: 'Day' }, { id: 'dawn', name: 'Dawn' }, { id: 'dusk', name: 'Dusk' }, { id: 'night', name: 'Night' },
]

export function zoneColorTokens(zone: ZoneKey, pal: ZonePalette = DEFAULT_PALETTE): ColorToken[] {
  const look = ZONE_LOOKS[zone]
  const colors = resolvePalette(pal, zone)
  const dir = fillDirection(look.mode)
  const inkHsl = zoneInk(look.mode, pal.theme.h)
  const ink = rgbOf(inkHsl)
  const strength = INK_STRENGTH[look.mode]
  const surface = (offset: number) => hsl(colors.theme.h, colors.theme.s, clamp(colors.theme.l + offset))
  const baseBg = rgbOf(surface(0))
  const out: ColorToken[] = []
  const add = (name: string, value: string, usage: string) => out.push({ name, value, usage })

  // ---- theme: surfaces and ink
  add('surface-base', hexOf(surface(0)), 'The app background and the base of every surface: the theme hue at the zone\'s theme saturation and lightness.')
  add('surface-side', hexOf(surface(SURFACE_OFFSETS[1])), 'Sidebars and side panels, 4 points deeper than the base.')
  add('surface-deep', hexOf(surface(SURFACE_OFFSETS[2])), 'Recessed areas, 10 points deeper.')
  add('surface-deeper', hexOf(surface(SURFACE_OFFSETS[3])), 'The deepest surface, 20 points deeper.')
  add('surface-sidebar-1', hexOf(surface(SIDEBAR_SHADE_1[look.mode])), 'The sidebar divider: steps up in a dark zone, down in a light one.')
  add('surface-sidebar-2', hexOf(surface(SURFACE_OFFSETS[4])), 'The sidebar\'s second shade.')
  add('surface-raised-a', hexOf(surface(SURFACE_OFFSETS[5])), 'The lighter end of a raised card\'s gradient.')
  add('surface-raised-b', hexOf(surface(SURFACE_OFFSETS[6])), 'The deeper end of a raised card\'s gradient.')
  add('surface-raised-active', hexOf(surface(SURFACE_OFFSETS[7])), 'A raised card that is selected.')
  add('surface-raised', hexOf(surface(SURFACE_OFFSETS[8])), 'The flat surface of a tile, card or note: 5 points deeper than the base.')
  add('ink', hexOf(inkHsl), `The one text colour of the zone: ${look.mode === 'dark' ? 'white' : 'a near-black tinted with the theme hue'}. Reads at 4.5:1 or more on every surface, for every hue.`)
  add('ink-muted', hexAlpha(ink, strength.muted / 100), `Secondary text: the ink at ${strength.muted}%.`)
  add('ink-faint', hexAlpha(ink, strength.faint / 100), `Placeholder and tertiary text: the ink at ${strength.faint}%.`)
  add('hairline', hexAlpha(ink, 0.12), 'Hairline borders: the ink at 12%.')
  for (const [i, alpha] of SINK_ALPHAS.slice(1).entries()) add(`ov-sink-${i + 1}`, hexAlpha(BLACK, alpha * shadeK(look.mode)), `A recess: black at ${Math.round(alpha * 100)}% (softened by ${shadeK(look.mode)} in this zone) over a surface.`)

  // ---- accent, alert and admin accent (each fitted for the ink that reads on it)
  const fills: Array<[string, HSL, string]> = [['accent', colors.accent, 'Interactive and active things: buttons, the active tab, focus.'], ['alert', colors.alert, 'What needs attention: error messages, alerts.'], ['accent2', colors.accent2, 'The admin accent (admins only; a plain accent for everyone else).']]
  for (const [name, fill, usage] of fills) {
    const { ink: on, dir: d } = fillInk(fill, pal.theme.h)
    add(name, hexOf(fill), `${usage} Lightness is moved a little from the zone's ${name === 'alert' ? look.alertL : look.accentL} only where its hue needs it to read with its text.`)
    if (name !== 'alert') add(`${name}-hover`, hexOf(hsl(fill.h, fill.s, clamp(fill.l + 12 * d))), `The ${name} on hover: 12 points away from its text.`)
    if (name === 'accent') add('accent-dim', hexOf(hsl(fill.h, fill.s - 20, clamp(fill.l + 14 * d))), 'The accent when dimmed (20 points less saturated, 14 points away from its text).')
    add(`on-${name}`, hexOf(on), `Text on the ${name}: ${on.l >= 50 ? 'white' : 'the dark ink'}, whichever reads better.`)
    if (name === 'accent') add('zone-on-accent', hexOf(on), 'The same ink for what sits on the accent inside a level (which sets on-accent to white for its own fill): the unsaved Save button.')
  }

  // ---- the Writer's paper
  const hues = { theme: pal.theme.h, accent: pal.accent.h, alert: pal.alert.h }
  const g = paperGrounds(zone, hues)
  const inks = paperInks(zone, pal.theme.h)
  const accents = paperAccents(zone, hues)
  const p = PAPER_LOOKS[look.mode]
  add('paper', hexOf(g.paper), 'The sheet: the accent hue at 45% saturation (the preview and the Draft page).')
  add('paper-soft', hexOf(g.soft), 'A sheet 2 points toward the text.')
  add('paper-field', hexOf(hsl(pal.accent.h, 45, look.paperL + 3 * p.dir)), 'An input on the sheet: 3 points away from the text.')
  add('paper-line', hexOf(hsl(pal.accent.h, 18, look.paperL - 13 * p.dir)), 'Rules and borders on the sheet.')
  add('page', hexOf(g.page), 'The chapter page (Outline and Draft): the theme hue, 4 points toward the text from the sheet.')
  g.frames.forEach((f, i) => add(`frame-${i + 1}`, hexOf(f), `Nested card ${i + 1} (arc, chapter, act, scene, moment): ${p.frames[i]} points from the sheet, one step deeper than the one it sits in.`))
  add('paper-ink', hexOf(inks.ink), 'Text on the page.')
  add('paper-ink2', hexOf(inks.ink2), 'Secondary text on the page.')
  add('paper-label', hexOf(inks.label), 'Labels and quiet icons on the page.')
  add('paper-muted', hexOf(inks.muted), 'Muted text on the page.')
  add('paper-placeholder', hexOf(inks.placeholder), 'Placeholder text in an input on the page.')
  add('paper-error', hexOf(accents.error), 'The page\'s error text: the alert colour moved only as far as it needs to read on the page.')
  add('paper-like', hexOf(accents.like), 'The like heart: the accent hue, moved to read on its bar.')
  add('paper-dislike', hexOf(accents.dislike), 'The dislike heart: the alert hue, moved to read on its bar.')
  LIKE_BAR_SATURATIONS.forEach((s, i) => add(`like-bar-${i + 1}`, hexOf(hsl(pal.accent.h, s, p.react)), `The like bar at strength ${i + 1}: the accent hue, saturation rising with the reaction.`))
  DISLIKE_BAR_SATURATIONS.forEach((s, i) => add(`dislike-bar-${i + 1}`, hexOf(hsl(pal.alert.h, s, p.react)), `The dislike bar at strength ${i + 1}: the alert hue, saturation rising with the reaction.`))

  // ---- level panels: the flat fill of a hue (white text), and the shades nested inside it
  for (const h of SAMPLE_HUES) {
    add(`level-fill-${h}`, hexOf(fillHsl(h, { s: colors.accent.s, l: colors.accent.l })), `A level panel at hue ${h}°: the accent's saturation less a little, a step deeper, and held dark enough that white text reads.`)
  }
  const book = rgbOf(fillHsl(DEFAULT_BOOK_HUE, { s: colors.accent.s, l: colors.accent.l }))
  ;[90, 80, 70, 60].forEach((pct, i) => add(`level-fill-${i + 1}`, hex(mixRgb(book, pct, BLACK)), `What sits inside a level (shown at the default book hue, ${DEFAULT_BOOK_HUE}°): the fill mixed with ${100 - pct}% black, one step deeper each time, ending in light inputs.`))
  add('level-ink', '#ffffff', 'Text on a level panel: always white.')
  add('level-ink-soft', hexAlpha(WHITE, 0.92), 'The ink of the level at 92%: arc tab labels, the marker on an edited note, a progress bar fill.')
  add('level-wash-lo', hexAlpha(WHITE, 0.1), 'The faintest wash on a level: the ink at 10% (a hovered row, a chapter in the draft list).')
  add('level-wash', hexAlpha(WHITE, 0.16), 'A control on a level: the ink at 16% (header buttons, the level toggle on hover, a tab on hover).')
  add('level-wash-hi', hexAlpha(WHITE, 0.28), 'A control on a level when hovered: the ink at 28%.')
  add('level-line', hexAlpha(WHITE, 0.18), 'A rule on a level: the ink at 18%.')
  add('level-input', hexOf(hsl(pal.theme.h, 28, 96)), 'The light input on a level (the field, the quick search, an inline add): the theme hue, near white.')
  add('level-input-ink', hexOf(hsl(pal.theme.h, 30, 10)), 'Text in a light input on a level.')
  add('level-input-hint', hexOf(hsl(pal.theme.h, 12, 42)), 'Placeholder text in a light input on a level.')
  for (const tone of ['day', 'night'] as const) {
    const t = pageTone(tone, pal.theme.h, pal.accent.h)
    add(`page-${tone}`, hexOf(t.page), `The Preview page in its ${tone} tone: the ${tone === 'day' ? 'Day' : 'Night'} paper in the theme hue, whatever zone the app is in.`)
    add(`page-${tone}-ink`, hexOf(t.ink), `Text on the Preview page, ${tone} tone.`)
    add(`page-${tone}-line`, hexOf(t.line), `Rules on the Preview page, ${tone} tone.`)
    add(`page-${tone}-muted`, hexOf(t.muted), `Quiet text on the Preview page, ${tone} tone.`)
  }
  return out
}
