import type { HSL } from './contrast'
import { BLACK, WHITE, mixRgb, over, ratioOfRgb, rgbOf, type RGB } from './readable'

// What is read on a level panel's flat fill (writer.scss `.wrLevel`): white text on the fill itself and on the shades nested inside it
// (each a mix of the fill with black), and the translucent tints of that white used for muted text and labels, a header button's
// wash, the Outline's cover and its arc tab. A fill is dark enough when every one of these reads (4.5:1); bookColors.ts finds the
// lightest fill of a hue that does. White is the one text colour on a level, whatever the hue.

export interface LevelPair { id: string; label: string; ratio: number }

const text = (fg: RGB, bg: RGB) => ratioOfRgb(fg, bg)

export function levelPairs(fill: HSL): LevelPair[] {
  const f = rgbOf(fill)
  const nested: Array<[string, RGB]> = [
    ['fill-1', mixRgb(f, 90, BLACK)], ['fill-2', mixRgb(f, 80, BLACK)], ['fill-3', mixRgb(f, 70, BLACK)], ['fill-4', mixRgb(f, 60, BLACK)],
  ]
  const out: LevelPair[] = [{ id: 'level/title', label: 'Level title on its fill', ratio: text(WHITE, f) }]
  for (const [name, bg] of nested) {
    out.push({ id: `level/text/${name}`, label: `Level text on ${name}`, ratio: text(WHITE, bg) })
    out.push({ id: `level/muted/${name}`, label: `Muted level text (90%) on ${name}`, ratio: text(over(WHITE, 0.9, bg), bg) })
  }
  const [page, card] = [nested[0][1], nested[1][1]]
  out.push({ id: 'level/page-muted', label: 'Outline page muted text (85%) on the page', ratio: text(over(WHITE, 0.85, page), page) })
  out.push({ id: 'level/page-label', label: 'Outline page label (75%) on the page', ratio: text(over(WHITE, 0.75, page), page) })
  out.push({ id: 'level/card-label', label: 'Outline label (75%) on a card', ratio: text(over(WHITE, 0.75, card), card) })
  const wash = over(WHITE, 0.16, f)
  out.push({ id: 'level/header-button', label: 'Header button text on its wash', ratio: text(WHITE, wash) })
  out.push({ id: 'level/header-hover', label: 'Collapsed header text on its hover', ratio: text(WHITE, mixRgb(f, 88, WHITE)) })
  out.push({ id: 'level/cover-field', label: 'Text on a cover wash', ratio: text(WHITE, over(BLACK, 0.28, f)) })
  out.push({ id: 'level/arc-tab', label: 'Arc tab label (92%) on the cover colour', ratio: text(over(WHITE, 0.92, f), f) })
  return out
}

export const worstLevelRatio = (fill: HSL): number => Math.min(...levelPairs(fill).map(p => p.ratio))
