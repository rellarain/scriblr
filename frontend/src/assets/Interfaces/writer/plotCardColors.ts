import type { OutlineNode, PlotNode, PlotPlacement } from '../../../api/types'
import { accentColorCss, bookThemeHue, themeColorCss } from '../../../theme/bookColors'
import type { ZoneKey } from '../../../theme/types'
import { awarenessStyle } from './awareness'
import { nearestOfKind } from './outlineTree'
import { chapterOfTarget, levelOfTarget, type TargetLevel } from './plotTree'
import { plotColorVars, plotColors } from './plotColors'

// A plotpoint's colours.
//   the plotpoint itself  its category's colour, with its subcategory's edge (--wr-cat / --wr-sub), however often it is placed: it stays in its
//                         field (and the tray), where a counter says how many times it is placed
//   a placement on a chapter  its book's colour (edge and all)
//   a placement on a moment   the awareness shade of the book's hue (see awareness.ts)
// (The Draft level's footnotes keep the category / subcategory colours: they use plotColorVars.)

export interface BookHues { book: OutlineNode | undefined; themeHue: number }

// A book with no colour of its own shows the project's (`projectHue`).
export function bookHuesOf(chapterId: string, outlineNodes: OutlineNode[], projectHue?: number): BookHues {
  const book = nearestOfKind(outlineNodes, chapterId, 'book')
  const themeHue = book ? bookThemeHue(book, projectHue) : bookThemeHue({}, projectHue)
  return { book, themeHue }
}

// The plotpoint's own card.
export const valueLook = (point: PlotNode, plotById: Map<string, PlotNode>, projectHue?: number): Record<string, string> | undefined =>
  plotColorVars(plotColors(point, plotById, projectHue))

export interface PlacementLook {
  level: TargetLevel
  // The chapter it is placed in (or on something in), when it is anywhere.
  chapterId: string | null
  style: Record<string, string> | undefined
}

// One placement's chip or tile.
export function placementLook(
  placement: PlotPlacement, outlineNodes: OutlineNode[], outlineById: Map<string, OutlineNode>, zone: ZoneKey, projectHue?: number,
): PlacementLook {
  const level = levelOfTarget(placement.targetId, outlineById)
  const chapter = chapterOfTarget(placement.targetId, outlineById)
  if (level === 'none' || !chapter) return { level: 'none', chapterId: null, style: undefined }
  const { themeHue } = bookHuesOf(chapter.id, outlineNodes, projectHue)
  const style: Record<string, string> = {
    '--wr-point-bg': themeColorCss(themeHue), '--wr-point-edge': accentColorCss(themeHue),
    // The book's edge stands in for the plot's stripes.
    '--wr-edge': 'none', '--wr-edge-w': '0px',
  }
  const target = outlineById.get(placement.targetId)
  if (target?.kind === 'moment' && placement.awareness) Object.assign(style, awarenessStyle(zone, themeHue, placement.awareness))
  return { level, chapterId: chapter.id, style }
}
