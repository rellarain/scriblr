import type { OutlineNode, PlotNode } from '../../../api/types'
import { accentColorCss, bookThemeHue, themeColorCss } from '../../../theme/bookColors'
import type { ZoneKey } from '../../../theme/types'
import { awarenessStyle } from './awareness'
import { nearestOfKind } from './outlineTree'
import { assignedLevel, chapterOfAssignment, type AssignedLevel } from './plotTree'
import { plotColorVars, plotColors } from './plotColors'

// A plotpoint's colours in the plot editor.
//   unassigned            its category's colour, with its subcategory's edge (--wr-cat / --wr-sub)
//   assigned to a chapter its book's primary colour, with the book's secondary as the edge
//   placed on a moment    the awareness shade of the book's hue (see awareness.ts)
// (The chapter page keeps the category / subcategory colours: it uses plotColorVars.)

export interface BookHues { book: OutlineNode | undefined; themeHue: number; accentHue: number }

export function bookHuesOf(chapterId: string, outlineNodes: OutlineNode[]): BookHues {
  const book = nearestOfKind(outlineNodes, chapterId, 'book')
  const themeHue = book ? bookThemeHue(book) : bookThemeHue({})
  return { book, themeHue, accentHue: book?.accentHue ?? themeHue }
}

export interface PointLook {
  level: AssignedLevel
  // The chapter it is assigned to (or placed in), when it is.
  chapterId: string | null
  style: Record<string, string> | undefined
}

export function pointLook(
  point: PlotNode, outlineNodes: OutlineNode[], outlineById: Map<string, OutlineNode>, plotById: Map<string, PlotNode>, zone: ZoneKey,
): PointLook {
  const level = assignedLevel(point, outlineById)
  const chapter = chapterOfAssignment(point, outlineById)
  if (level === 'none' || !chapter) return { level: 'none', chapterId: null, style: plotColorVars(plotColors(point, plotById)) }
  const { themeHue, accentHue } = bookHuesOf(chapter.id, outlineNodes)
  const style: Record<string, string> = {
    '--wr-point-bg': themeColorCss(themeHue), '--wr-point-edge': accentColorCss(accentHue),
  }
  const target = point.assignedMomentId ? outlineById.get(point.assignedMomentId) : undefined
  if (target?.kind === 'moment' && point.awareness) Object.assign(style, awarenessStyle(zone, themeHue, point.awareness))
  return { level, chapterId: chapter.id, style }
}
