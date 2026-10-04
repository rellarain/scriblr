import { useMemo, useState } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { Placeholder } from '../shared'
import { useWordCounts } from '../useWordCounts'
import BookEditor from './BookEditor'
import DraftStats from './DraftStats'
import OutlineCards from './OutlineCards'
import PlotTray from './PlotTray'
import { unassignedPlotpoints } from './outlineModel'

// The Outline level at Max: the open book. A collapsible book editor on top; below it the
// unassigned plotpoints in a column at the left, and on the page beside it the book's draft
// stats and its arcs, chapters, acts, scenes and moments as editable cards.
function OutlineMax({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  const counts = useWordCounts(w.activeProjectId)
  const [plotDragId, setPlotDragId] = useState<string | null>(null)
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const unassigned = useMemo(
    () => unassignedPlotpoints(w.plotNodes, outlineById, w.plotNodeById),
    [w.plotNodes, outlineById, w.plotNodeById],
  )
  if (!book) return <Placeholder title="Book" body="Select a book on the shelf to open it." />

  return (
    <div className="wrOutlineMax">
      <BookEditor w={w} book={book} bookWords={counts.books[book.id] ?? 0} />
      {w.saveStatus.error && <p className="wrError">{w.saveStatus.error}</p>}
      <div className="wrPage wrPage--chapter wrOutlinePage">
        <PlotTray w={w} points={unassigned} dragId={plotDragId} onDragId={setPlotDragId} />
        <div className="wrPageScroll">
          <DraftStats book={book} chapters={w.activeBookChapters} nodeWords={counts.nodes} settings={w.activeProject?.settings} />
          <OutlineCards w={w} book={book} counts={counts} plotDrag={{ dragId: plotDragId, setDragId: setPlotDragId }} />
        </div>
      </div>
    </div>
  )
}

export default OutlineMax
