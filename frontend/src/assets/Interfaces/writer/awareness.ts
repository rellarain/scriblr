import type { Awareness } from '../../../api/types'
import { contrastRatio, inkColor } from '../../../theme/contrast'
import { MIN_TEXT_GAP, ZONE_LOOKS, fillInk } from '../../../theme/zoneLooks'
import type { ZoneKey } from '../../../theme/types'

// What a writer knows about a plotpoint placed on a moment: whether the
// audience and the characters know of it. Clicking the eye steps through the
// four states in AWARENESS_ORDER; a plotpoint starts front-stage.
export const AWARENESS_ORDER: Awareness[] = ['front', 'back', 'mid', 'off']
export const DEFAULT_AWARENESS: Awareness = 'front'

export const AWARENESS_LABEL: Record<Awareness, string> = {
  front: 'Front-stage', back: 'Back-stage', mid: 'Mid-stage', off: 'Off-stage',
}
export const AWARENESS_KNOWN: Record<Awareness, string> = {
  front: 'Known to the audience and the characters',
  back: 'Known to the audience, unknown to the characters',
  mid: 'Known to the characters, unknown to the audience',
  off: 'Unknown to the audience and the characters',
}
export const awarenessTitle = (state: Awareness) => `${AWARENESS_LABEL[state]}: ${AWARENESS_KNOWN[state].toLowerCase()}. Click to change.`

export function awarenessNext(state: Awareness | null | undefined): Awareness {
  const at = AWARENESS_ORDER.indexOf(state ?? DEFAULT_AWARENESS)
  return AWARENESS_ORDER[(at + 1) % AWARENESS_ORDER.length]
}

// A plotpoint's shade in the plot editor, from its book's hue. The strengths are
// the zone's own: saturated is the accent's saturation, desaturated the theme's;
// bright and dark are the accent's lightness plus and minus AWARENESS_SHIFT (a
// dark shade stays light enough for either ink to keep its 30-point gap, so a
// hue is never stuck with the worse one). The text is chosen for the fill (fillInk).
//   front  saturated,   bright     back  saturated,   dark
//   mid    desaturated, bright     off   desaturated, dark
export const AWARENESS_SHIFT = 12

const SATURATED: Record<Awareness, boolean> = { front: true, back: true, mid: false, off: false }
const BRIGHT: Record<Awareness, boolean> = { front: true, back: false, mid: true, off: false }

export function awarenessShade(zone: ZoneKey, hue: number, state: Awareness) {
  const look = ZONE_LOOKS[zone]
  const fill = {
    h: hue,
    s: SATURATED[state] ? look.accentS : look.themeS,
    l: BRIGHT[state] ? look.accentL + AWARENESS_SHIFT : Math.max(look.accentL - AWARENESS_SHIFT, inkColor('dark', hue).l + MIN_TEXT_GAP),
  }
  const { ink } = fillInk(fill, hue)
  return { fill, ink, contrast: contrastRatio(ink, fill) }
}

const css = (c: { h: number; s: number; l: number }) => `hsl(${c.h}, ${c.s}%, ${c.l}%)`

// Inline style for a plotpoint in the plot editor that is placed on a moment.
export function awarenessStyle(zone: ZoneKey, hue: number, state: Awareness): Record<string, string> {
  const { fill, ink } = awarenessShade(zone, hue, state)
  return { '--wr-point-bg': css(fill), '--wr-point-ink': css(ink) }
}
