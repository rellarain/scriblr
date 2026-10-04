import { useMemo } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { DraftPlotNotes } from '../DraftPlotNotes'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { pointsByTarget } from '../outline/outlineModel'
import { orderAssignedPlotpoints } from '../plotTree'
import { chapterPlotpoints } from './draftModel'

// The left page of the open book. The page itself runs under the Dash, Project and Outline tiles;
// beside them it holds the chapter's plotpoints (read-only: the outline is where they are placed).
// What the chapter is (titles, synopsis, stats) is in the chapter tile above.
export function ChapterLeftPage({ w, chapter }: { w: WriterWorkspace; chapter: OutlineNode }) {
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const momentIds = useMemo(
    () => new Set(descendantsOf(index, chapter.id).filter(n => n.kind === 'moment').map(n => n.id)),
    [index, chapter.id],
  )
  // The chapter's own plotpoints, then those on the acts, scenes and moments inside it.
  const points = useMemo(() => {
    const byNode = pointsByTarget(w.plotNodes)
    const own = orderAssignedPlotpoints(byNode.get(chapter.id) ?? [], w.outlineNodes, w.activeProject?.settings.timeSystems ?? [])
    return chapterPlotpoints(chapter.id, index, new Map([...byNode, [chapter.id, own]]))
  }, [w.plotNodes, w.outlineNodes, w.activeProject, chapter.id, index])

  if (points.length === 0) return <div className="wrLeftPage" aria-label="Chapter plotpoints" />
  return (
    <div className="wrLeftPage" aria-label="Chapter plotpoints">
      <section className="wrLeftPoints" aria-label="Plotpoints in this chapter">
        <div className="wrDraftStatsHead"><span>Plotpoints</span><span className="wrOutlineMeta">{points.length}</span></div>
        <DraftPlotNotes w={w} points={points} momentIds={momentIds} />
      </section>
    </div>
  )
}

export default ChapterLeftPage
