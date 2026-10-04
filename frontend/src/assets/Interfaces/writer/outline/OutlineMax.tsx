import { useMemo, useRef, useState } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import EdgeTabs from '../EdgeTabs'
import { Placeholder } from '../shared'
import HelpArticles from '../levels/HelpArticles'
import { OUTLINE_HELP_FALLBACK, OUTLINE_HELP_NAMES, useOutlineTabs } from '../levels/outlineTabs'
import { useWordCounts } from '../useWordCounts'
import BookEditor from './BookEditor'
import DraftStats from './DraftStats'
import OutlineCards from './OutlineCards'
import PlotTray from './PlotTray'
import { unassignedPlotpoints } from './outlineModel'

// The Outline level at Max: the open book. The book editor strip on top is the level's header, with
// its tabs; below it the unassigned plotpoints in a column at the left, and on the page beside it the
// book's draft stats and its arcs, chapters, acts, scenes and moments as editable cards. Each tab opens
// or closes its part (Settings and Help open under the strip). The arcs' and chapters' tabs sit on the
// right edge and jump to their card.
function OutlineMax({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  const counts = useWordCounts(w.activeProjectId)
  const [plotDragId, setPlotDragId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabs = useOutlineTabs(w, 'max')
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const unassigned = useMemo(
    () => unassignedPlotpoints(w.plotNodes, outlineById, w.plotNodeById),
    [w.plotNodes, outlineById, w.plotNodeById],
  )
  if (!book) return <Placeholder title="Book" body="Select a book on the shelf to open it." />

  // Bring an arc's card to the top of the page (a chapter's is brought there by the cards themselves, once it is the open one).
  const showArc = (arcId: string) => {
    const el = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-node]') ?? []).find(n => n.dataset.node === arcId)
    el?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className="wrOutlineMax">
      <BookEditor
        w={w} book={book} bookWords={counts.books[book.id] ?? 0} tabs={tabs.headerExtras}
        settingsOpen={tabs.isOpen('settings')} helpOpen={tabs.isOpen('help')}
        help={<HelpArticles names={OUTLINE_HELP_NAMES} fallback={OUTLINE_HELP_FALLBACK} />}
      />
      {w.saveStatus.error && <p className="wrError">{w.saveStatus.error}</p>}
      <div className="wrOutlineBody">
        <div className="wrPage wrPage--chapter wrOutlinePage">
          {tabs.isOpen('unassigned') && <PlotTray w={w} points={unassigned} dragId={plotDragId} onDragId={setPlotDragId} />}
          <div className="wrPageScroll" ref={scrollRef}>
            {tabs.isOpen('details') && <DraftStats book={book} chapters={w.activeBookChapters} nodeWords={counts.nodes} settings={w.activeProject?.settings} />}
            {tabs.isOpen('outline') && <OutlineCards w={w} book={book} counts={counts} plotDrag={{ dragId: plotDragId, setDragId: setPlotDragId }} />}
          </div>
        </div>
        <EdgeTabs
          w={w} activeChapterId={w.activeChapterId}
          onChapter={id => w.selectChapter(id)} onArc={showArc}
          onAddChapter={() => w.addOutlineNode(book.id, 'chapter')}
        />
      </div>
    </div>
  )
}

export default OutlineMax
