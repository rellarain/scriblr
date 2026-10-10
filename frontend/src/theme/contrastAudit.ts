import { tabColors, fillCap, fillHsl } from './bookColors'
import type { HSL } from './contrast'
import { levelPairs } from './levelContrast'
import {
  BLACK, TEXT_TARGET, WHITE, over, ratioOf, ratioOfRgb, rgbOf, type RGB,
} from './readable'
import {
  DISLIKE_BAR_SATURATIONS, INK_STRENGTH, LIKE_BAR_SATURATIONS, PAPER_LOOKS, SIDEBAR_SHADE_1, SINK_ALPHAS, SURFACE_OFFSETS, ZONE_LOOKS,
  fillInk, paperAccents, paperGrounds, paperInks, resolvePalette, shadeK, zoneInk,
} from './zoneLooks'
import type { ZoneKey, ZonePalette } from './types'

// Is every piece of text, and every icon and control edge, readable in every zone? The audit lists the pairs the design system
// documents (what sits on what, in the colours the theme derives), computes the WCAG contrast ratio of each, and holds it to the
// threshold of its kind: 4.5:1 for text, 3:1 for large text, icons and control edges. It works from the same functions the theme
// draws with (resolvePalette, paperGrounds, fillHsl, ...), following theme.scss and writer.scss line for line, and it is run over
// every hue a user can pick (a 30-degree grid of the palette hues, every 5 degrees of a level colour). contrastAudit.test.ts keeps
// the theme honest; the design system's Contrast page is generated from it.

export type PairKind = 'text' | 'large' | 'ui'
export const MIN_RATIO: Record<PairKind, number> = { text: 4.5, large: 3, ui: 3 }

export interface Pair {
  id: string
  group: string
  label: string
  kind: PairKind
  ratio: number
}

export interface AuditHues { theme: number; accent: number; alert: number }
export const DEFAULT_HUES: AuditHues = { theme: 330, accent: 32, alert: 200 }

const hsl = (h: number, s: number, l: number): HSL => ({ h, s, l })
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// ---------------------------------------------------------------- the pairs that depend on the palette

// The theme-derived pairs for one zone and one set of hues.
export function paletteRatios(zone: ZoneKey, hues: AuditHues = DEFAULT_HUES): Pair[] {
  const look = ZONE_LOOKS[zone]
  const palette: ZonePalette = { theme: { h: hues.theme }, accent: { h: hues.accent }, alert: { h: hues.alert }, accent2: { h: hues.accent } }
  const colors = resolvePalette(palette, zone)
  const ink = rgbOf(zoneInk(look.mode, hues.theme))
  const strength = INK_STRENGTH[look.mode]
  const out: Pair[] = []
  const add = (id: string, group: string, label: string, kind: PairKind, fg: RGB, bg: RGB) => out.push({ id, group, label, kind, ratio: ratioOfRgb(fg, bg) })

  // ---- text on the theme's surfaces (and under the darkest recess overlay a surface can carry)
  const sinkDeepest = SINK_ALPHAS[SINK_ALPHAS.length - 1] * shadeK(look.mode)
  const surfaces: Array<[string, number]> = [
    ['base', 0], ['side', SURFACE_OFFSETS[1]], ['deep', SURFACE_OFFSETS[2]], ['deeper', SURFACE_OFFSETS[3]], ['sidebar-1', SIDEBAR_SHADE_1[look.mode]],
    ['sidebar-2', SURFACE_OFFSETS[4]], ['raised-a', SURFACE_OFFSETS[5]], ['raised-b', SURFACE_OFFSETS[6]], ['raised-active', SURFACE_OFFSETS[7]],
  ]
  for (const [name, offset] of surfaces) {
    const surface = rgbOf(hsl(hues.theme, colors.theme.s, clamp(colors.theme.l + offset, 0, 100)))
    for (const [suffix, bg] of [['', surface], [' under a recess', over(BLACK, sinkDeepest, surface)]] as Array<[string, RGB]>) {
      add(`ink/${name}${suffix ? '/sunk' : ''}`, 'Theme surfaces', `Ink on surface-${name}${suffix}`, 'text', ink, bg)
      add(`ink-muted/${name}${suffix ? '/sunk' : ''}`, 'Theme surfaces', `Muted ink on surface-${name}${suffix}`, 'text', over(ink, strength.muted / 100, bg), bg)
      add(`ink-faint/${name}${suffix ? '/sunk' : ''}`, 'Theme surfaces', `Faint ink on surface-${name}${suffix}`, 'text', over(ink, strength.faint / 100, bg), bg)
    }
  }

  // ---- text on the accent, alert and admin-accent fills (and their hover / dim shades)
  const onAccent = fillInk(colors.accent, hues.theme)
  const shade = (c: HSL, step: number, dir: 1 | -1, s = c.s) => rgbOf(hsl(c.h, s, clamp(c.l + step * dir, 0, 100)))
  add('on-accent/accent', 'Fills', 'Text on the accent', 'text', rgbOf(onAccent.ink), rgbOf(colors.accent))
  add('on-accent/hover', 'Fills', 'Text on the accent, hovered', 'text', rgbOf(onAccent.ink), shade(colors.accent, 12, onAccent.dir))
  add('on-accent/dim', 'Fills', 'Text on the dimmed accent', 'text', rgbOf(onAccent.ink), shade(colors.accent, 14, onAccent.dir, colors.accent.s - 20))
  const onAlert = fillInk(colors.alert, hues.theme)
  add('on-alert/alert', 'Fills', 'Text on the alert', 'text', rgbOf(onAlert.ink), rgbOf(colors.alert))
  const onAccent2 = fillInk(colors.accent2, hues.theme)
  add('on-accent2/accent2', 'Fills', 'Text on the admin accent', 'text', rgbOf(onAccent2.ink), rgbOf(colors.accent2))
  add('on-accent2/hover', 'Fills', 'Text on the admin accent, hovered', 'text', rgbOf(onAccent2.ink), shade(colors.accent2, 12, onAccent2.dir))
  // The Writer's inline alert (.wrError, .wrPageError): the alert colour as the ground, the zone's on-alert ink for text and outline.
  add('alert-box', 'Fills', 'Alert message text on the alert', 'text', rgbOf(onAlert.ink), rgbOf(colors.alert))

  // ---- the Writer's paper
  const grounds = paperGrounds(zone, hues)
  const inks = paperInks(zone, hues.theme)
  const pg: Array<[string, HSL]> = [['paper', grounds.paper], ['paper-soft', grounds.soft], ['page', grounds.page], ['field', grounds.field], ...grounds.frames.map((f, i): [string, HSL] => [`frame-${i + 1}`, f])]
  const inkRgb = rgbOf(inks.ink)
  for (const [gname, ground] of pg) {
    const bg = rgbOf(ground)
    for (const key of ['ink', 'ink2', 'label', 'muted', 'placeholder'] as const) {
      // A placeholder shows only in an input (the field), or on the sheet.
      if (key === 'placeholder' && !['field', 'paper', 'paper-soft', 'page'].includes(gname)) continue
      add(`paper-${key}/${gname}`, 'Paper', `Paper ${key} on ${gname}`, 'text', rgbOf(inks[key]), bg)
    }
    // The page's own muted text (--wr-page-muted): the ink at 88%.
    add(`paper-ink-88/${gname}`, 'Paper', `Page muted text (ink at 88%) on ${gname}`, 'text', over(inkRgb, 0.88, bg), bg)
  }
  const accents = paperAccents(zone, hues)
  for (const [gname, ground] of pg.filter(([n]) => ['paper', 'paper-soft', 'page', 'field', 'frame-1'].includes(n))) {
    add(`paper-error/${gname}`, 'Paper', `Page error text on ${gname}`, 'text', rgbOf(accents.error), rgbOf(ground))
  }

  // ---- reaction bars (icons, 3:1): the like heart on its three fills, the dislike heart on the alert's three
  const react = PAPER_LOOKS[look.mode].react
  for (const s of LIKE_BAR_SATURATIONS) add(`like/${s}`, 'Reactions', `Like heart on its fill (S ${s})`, 'ui', rgbOf(accents.like), rgbOf(hsl(hues.accent, s, react)))
  for (const s of DISLIKE_BAR_SATURATIONS) add(`dislike/${s}`, 'Reactions', `Dislike heart on its fill (S ${s})`, 'ui', rgbOf(accents.dislike), rgbOf(hsl(hues.alert, s, react)))

  // ---- edge tabs: the tab's ink on the page edge, and on a level's colour (here the theme's own hue) as its background
  const leaf = grounds.frames.length ? rgbOf(hsl(hues.theme, look.themeS, look.paperL - 4 * PAPER_LOOKS[look.mode].dir)) : WHITE
  const tab = tabColors(zone, hues.theme, hues.theme)
  add('tab-ink/leaf', 'Edge tabs', 'Edge tab text on the page edge', 'text', rgbOf(tab.ink), leaf)
  add('tab-ink/active', 'Edge tabs', 'Edge tab text on its accent', 'text', rgbOf(tab.ink), rgbOf(tab.bg))
  return out
}

// ---------------------------------------------------------------- the pairs that depend on a level's colour

// One level's panel: the text on its fill and on the shades nested inside it, in a zone, for a hue.
export function levelRatios(zone: ZoneKey, hue: number): Pair[] {
  const look = ZONE_LOOKS[zone]
  const fill = fillHsl(hue, { s: look.accentS, l: look.accentL })
  return levelPairs(fill).map(p => ({ id: p.id, group: 'Level panels', label: p.label, kind: 'text' as const, ratio: p.ratio }))
}

// The edge tab of a level colour in a zone (the tab's background is fitted for the ink: bookColors.tabColors).
export function tabRatio(zone: ZoneKey, hue: number, scopeHue: number): number {
  const t = tabColors(zone, hue, scopeHue)
  return ratioOf(t.ink, t.bg)
}

// ---------------------------------------------------------------- the whole audit

export const ZONES: ZoneKey[] = ['dawn', 'day', 'dusk', 'night']

export interface AuditRow extends Pair { zone: ZoneKey; min: number; pass: boolean; worst: number; worstAt?: string }

const HUE_STEP = 30
const LEVEL_HUE_STEP = 5

// Every documented pair in every zone: its ratio at the default hues, and its worst ratio across hues (every palette hue on a
// 30-degree grid; every level hue in 5-degree steps), since a user may choose any hue.
export function audit(): AuditRow[] {
  const rows: AuditRow[] = []
  for (const zone of ZONES) {
    const base = new Map(paletteRatios(zone).map(p => [p.id, p]))
    const worst = new Map<string, { ratio: number; at: string }>()
    for (let t = 0; t < 360; t += HUE_STEP) {
      for (let a = 0; a < 360; a += HUE_STEP) {
        for (let al = 0; al < 360; al += HUE_STEP) {
          for (const p of paletteRatios(zone, { theme: t, accent: a, alert: al })) {
            const w = worst.get(p.id)
            if (!w || p.ratio < w.ratio) worst.set(p.id, { ratio: p.ratio, at: `theme ${t}, accent ${a}, alert ${al}` })
          }
        }
      }
    }
    for (const [id, p] of base) {
      const w = worst.get(id)!
      const min = MIN_RATIO[p.kind]
      rows.push({ ...p, zone, min, pass: w.ratio >= min, worst: w.ratio, worstAt: w.at })
    }
    const levelBase = new Map(levelRatios(zone, DEFAULT_HUES.accent).map(p => [p.id, p]))
    const levelWorst = new Map<string, { ratio: number; at: string }>()
    let tabWorst = { ratio: Infinity, at: '' }
    for (let h = 0; h < 360; h += LEVEL_HUE_STEP) {
      for (const p of levelRatios(zone, h)) {
        const w = levelWorst.get(p.id)
        if (!w || p.ratio < w.ratio) levelWorst.set(p.id, { ratio: p.ratio, at: `hue ${h}` })
      }
      for (let scope = 0; scope < 360; scope += HUE_STEP) {
        const r = tabRatio(zone, h, scope)
        if (r < tabWorst.ratio) tabWorst = { ratio: r, at: `tab hue ${h}, scope hue ${scope}` }
      }
    }
    for (const [id, p] of levelBase) {
      const w = levelWorst.get(id)!
      const min = MIN_RATIO[p.kind]
      rows.push({ ...p, zone, min, pass: w.ratio >= min, worst: w.ratio, worstAt: w.at })
    }
    rows.push({
      id: 'tab-ink/level', group: 'Edge tabs', label: 'Edge tab text on any level colour', kind: 'text', ratio: tabRatio(zone, DEFAULT_HUES.accent, DEFAULT_HUES.theme),
      zone, min: MIN_RATIO.text, pass: tabWorst.ratio >= MIN_RATIO.text, worst: tabWorst.ratio, worstAt: tabWorst.at,
    })
  }
  return rows
}

export { TEXT_TARGET, fillCap }
