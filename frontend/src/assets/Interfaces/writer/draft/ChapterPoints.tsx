import { useMemo } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { DraftPlotNotes } from '../DraftPlotNotes'
import { buildChildIndex, descendantsOf, nearestOfKind } from '../outlineTree'
import { structureOfBook } from '../outline/outlineModel'
import { pointsByTarget } from '../plotPlacement'
import { orderPlacements } from '../plotTree'
import { PlotOrderToggle, usePlotOrder } from '../plotOrder'
import { chapterPlotpoints } from './draftModel'

// The chapter's placements as footnote cards in the right page's Plotpoints tile (read-only: the
// outline is where they are placed): those on the chapter itself, then those on the
// acts, scenes and moments inside it (a plotpoint placed twice in the chapter has two). A line saying so when there are none.
export function ChapterPoints({ w, chapter }: { w: WriterWorkspace; chapter: OutlineNode }) {
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const momentIds = useMemo(
    () => new Set(descendantsOf(index, chapter.id).filter(n => n.kind === 'moment').map(n => n.id)),
    [index, chapter.id],
  )
  const [plotOrder] = usePlotOrder()
  const points = useMemo(() => {
    const systems = w.activeProject?.settings.timeSystems ?? []
    const byNode = pointsByTarget(w.plotNodes)
    const own = orderPlacements(byNode.get(chapter.id) ?? [], w.outlineNodes, systems, plotOrder)
    const inOutline = chapterPlotpoints(chapter.id, index, new Map([...byNode, [chapter.id, own]]))
    // In story order they stand as the outline has them; by time, across the whole chapter.
    return plotOrder === 'time' ? orderPlacements(inOutline, w.outlineNodes, systems, 'time') : inOutline
  }, [w.plotNodes, w.outlineNodes, w.activeProject, chapter.id, index, plotOrder])

  // Where a placement pinned to a paragraph is: its moment's number in the chapter and the paragraph.
  const momentNumbers = useMemo(() => {
    const book = nearestOfKind(w.outlineNodes, chapter.id, 'book')
    return structureOfBook(index, book?.id ?? chapter.id).numbers.moment
  }, [w.outlineNodes, index, chapter.id])
  const pinnedAt = (placementId: string) => {
    const found = points.find(p => p.placement.id === placementId)?.placement
    if (!found || found.paragraphIndex == null || !momentIds.has(found.targetId)) return null
    return `Moment ${momentNumbers.get(found.targetId) ?? ''}, paragraph ${found.paragraphIndex + 1}`
  }

  if (points.length === 0) return <p className="wrPageMuted">No plotpoints are placed in this chapter yet.</p>
  return (
    <section className="wrRightPoints" aria-label="Plotpoints in this chapter">
      <div className="wrDraftStatsHead"><span>Plotpoints</span><span className="wrOutlineMeta">{points.length}</span><PlotOrderToggle className="wrOrderToggle--paper" /></div>
      <DraftPlotNotes w={w} points={points} momentIds={momentIds} pinnedAt={pinnedAt} />
    </section>
  )
}

export default ChapterPoints
