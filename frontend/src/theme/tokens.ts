import type { HSL } from './contrast'
import { fillDirection, fillInk, INK_STRENGTH, PAPER_LOOKS, SIDEBAR_SHADE_1, ZONE_LOOKS, pageTone, paperAccents, resolvePalette, zoneInk } from './zoneLooks'
import type { Role, ZoneKey, ZonePalette } from './types'

// Turns a zone's hues into the CSS custom properties the app is styled with.
// Saturation comes from the zone's fixed look (zoneLooks.ts) and lightness starts there too, moved only
// where a hue needs it for its text to read (WCAG 4.5:1; resolvePalette, readable.ts). The
// theme has ONE ink (white on a dark zone, near-black on a light one); the text
// on each accent, alert and admin-accent fill is chosen for that fill (fillInk).
// contrastAudit.ts checks every documented pair, for every hue.

const hsl = (c: HSL) => `hsl(${c.h}, ${c.s}%, ${c.l}%)`

export type ThemeVars = Record<string, string>

export function deriveTokens(pal: ZonePalette, role: Role, zone: ZoneKey): ThemeVars {
  const look = ZONE_LOOKS[zone]
  const paper = PAPER_LOOKS[look.mode]
  const colors = resolvePalette(pal, zone)
  const ink = zoneInk(look.mode, pal.theme.h)
  // Non-admins see the admin accent as the plain accent.
  const accent2 = role === 'admin' ? colors.accent2 : colors.accent
  const dir = fillDirection(look.mode)
  const onAccent = fillInk(colors.accent, pal.theme.h)
  const onAlert = fillInk(colors.alert, pal.theme.h)
  const onAccent2 = role === 'admin' ? fillInk(colors.accent2, pal.theme.h) : onAccent
  const accents = paperAccents(zone, { theme: pal.theme.h, accent: pal.accent.h, alert: pal.alert.h })
  const away = (d: 1 | -1) => (d > 0 ? 'hsl(0, 0%, 100%)' : 'hsl(0, 0%, 0%)')

  return {
    '--color-theme-h': String(colors.theme.h),
    '--color-theme-s': `${colors.theme.s}%`,
    '--color-theme-l': `${colors.theme.l}%`,
    '--color-accent-h': String(colors.accent.h),
    '--color-accent-s': `${colors.accent.s}%`,
    '--color-accent-l': `${colors.accent.l}%`,
    '--color-alert-h': String(colors.alert.h),
    '--color-alert-s': `${colors.alert.s}%`,
    '--color-alert-l': `${colors.alert.l}%`,
    '--color-accent2-h': String(accent2.h),
    '--color-accent2-s': `${accent2.s}%`,
    '--color-accent2-l': `${accent2.l}%`,
    '--ink': hsl(ink),
    '--ink-muted-a': `${INK_STRENGTH[look.mode].muted}%`,
    '--ink-faint-a': `${INK_STRENGTH[look.mode].faint}%`,
    '--on-accent': hsl(onAccent.ink),
    '--on-alert': hsl(onAlert.ink),
    '--on-accent2': hsl(onAccent2.ink),
    // Which way each fill's hover / dim shades step (away from its text), and the
    // colour of a wash that lifts it away (white under dark text, black under light).
    '--accent-dir': String(onAccent.dir),
    '--alert-dir': String(onAlert.dir),
    '--accent2-dir': String(onAccent2.dir),
    '--accent-away': away(onAccent.dir),
    '--alert-away': away(onAlert.dir),
    '--accent2-away': away(onAccent2.dir),
    // The same for the theme's own surfaces (and text coloured like a fill, on them).
    '--fill-dir': String(dir),
    '--away': away(dir),
    // Black recess overlays soften on light themes.
    '--shade-k': look.mode === 'dark' ? '1' : '0.55',
    // The sidebar divider's (and AUI's) own surface -- see SIDEBAR_SHADE_1.
    '--sidebar-shade-1': String(SIDEBAR_SHADE_1[look.mode]),
    // The Writer's page.
    '--paper-l': `${look.paperL}%`,
    '--paper-dir': String(paper.dir),
    '--paper-ink-l': `${paper.ink}%`,
    '--paper-ink2-l': `${paper.ink2}%`,
    '--paper-label-l': `${paper.label}%`,
    '--paper-muted-l': `${paper.muted}%`,
    '--paper-placeholder-l': `${paper.placeholder}%`,
    '--paper-react-l': `${paper.react}%`,
    // The nested cards' steps from the page (frame 1..5), the page's error text and the two hearts, each fitted to read.
    '--paper-pg': `${paper.page}%`,
    '--paper-f1': `${paper.frames[0]}%`,
    '--paper-f2': `${paper.frames[1]}%`,
    '--paper-f3': `${paper.frames[2]}%`,
    '--paper-f4': `${paper.frames[3]}%`,
    '--paper-f5': `${paper.frames[4]}%`,
    '--paper-error': hsl(accents.error),
    '--paper-like': hsl(accents.like),
    '--paper-dislike': hsl(accents.dislike),
    // The Preview page's day and night tones (writer.scss .wrPage--day, .wrPage--night), themed.
    ...pageTokens('day', pal),
    ...pageTokens('night', pal),
  }
}

function pageTokens(tone: 'day' | 'night', pal: ZonePalette): ThemeVars {
  const t = pageTone(tone, pal.theme.h, pal.accent.h)
  return {
    [`--page-${tone}`]: hsl(t.page),
    [`--page-${tone}-ink`]: hsl(t.ink),
    [`--page-${tone}-line`]: hsl(t.line),
    [`--page-${tone}-muted`]: hsl(t.muted),
  }
}
