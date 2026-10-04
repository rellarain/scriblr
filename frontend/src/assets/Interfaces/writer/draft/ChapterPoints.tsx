import { useMemo } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { DraftPlotNotes } from '../DraftPlotNotes'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { pointsByTarget } from '../outline/outlineModel'
import { orderAssignedPlotpoints } from '../plotTree'
import { PlotOrderToggle, usePlotOrder } from '../plotOrder'
import { chapterPlotpoints } from './draftModel'

// The chapter's plotpoints as footnote cards at the top of the right page (read-only: the
// outline is where they are placed): those assigned to the chapter itself, then those on the
// acts, scenes and moments inside it. Nothing at all when there are none.
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
    const own = orderAssignedPlotpoints(byNode.get(chapter.id) ?? [], w.outlineNodes, systems, plotOrder)
    const inOutline = chapterPlotpoints(chapter.id, index, new Map([...byNode, [chapter.id, own]]))
    // In story order they stand as the outline has them; by time, across the whole chapter.
    return plotOrder === 'time' ? orderAssignedPlotpoints(inOutline, w.outlineNodes, systems, 'time') : inOutline
  }, [w.plotNodes, w.outlineNodes, w.activeProject, chapter.id, index, plotOrder])

  if (points.length === 0) return null
  return (
    <section className="wrRightPoints" aria-label="Plotpoints in this chapter">
      <div className="wrDraftStatsHead"><span>Plotpoints</span><span className="wrOutlineMeta">{points.length}</span><PlotOrderToggle className="wrOrderToggle--paper" /></div>
      <DraftPlotNotes w={w} points={points} momentIds={momentIds} />
    </section>
  )
}

export default ChapterPoints
