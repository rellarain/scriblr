import { useEffect, useMemo } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import EdgeTabs from '../EdgeTabs'
import { Placeholder } from '../shared'
import { useWordCounts } from '../useWordCounts'
import HelpArticles from '../levels/HelpArticles'
import { OUTLINE_HELP_FALLBACK, OUTLINE_HELP_NAMES, useOutlineTabs } from '../levels/outlineTabs'
import BookEditor from './BookEditor'
import DraftStats from './DraftStats'
import OutlineCards from './OutlineCards'
import OutlineNav from './OutlineNav'

// The Outline level at Max: the open book, laid out as a book. The cover is the left pane: the book editor
// strip (title, counts, the level's tabs) at its top, its draft stats, and the contents (the arcs and
// chapters to move around in). The page beside it is the open chapter's acts, scenes and moments as
// editable cards, with the arcs' and chapters' tabs on the page edge. The plotpoints still to place are
// in the Project level's Plotpoints tab: drag one onto a card. Each tab opens or closes its part.
function OutlineMax({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  const counts = useWordCounts(w.activeProjectId)
  const tabs = useOutlineTabs(w, 'max')
  const chapters = w.activeBookChapters
  const activeId = w.activeChapterId
  // A book opens on a chapter: the first, until another is picked.
  const firstId = chapters[0]?.id ?? null
  const hasActive = useMemo(() => chapters.some(c => c.id === activeId), [chapters, activeId])
  useEffect(() => {
    if (firstId && !hasActive) w.selectChapter(firstId)
    // Only a missing open chapter counts, not the workspace object changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstId, hasActive])
  if (!book) return <Placeholder title="Book" body="Select a book on the shelf to open it." />

  // An arc's tab opens its first chapter.
  const firstChapterOf = (arcId: string) => w.outlineNodes
    .filter(n => n.parentId === arcId && n.kind === 'chapter').sort((a, b) => a.order - b.order)[0]

  return (
    <div className="wrOutlineMax">
      <aside className="wrBookCover" aria-label="Book cover">
        <BookEditor
          w={w} book={book} bookWords={counts.books[book.id] ?? 0} tabs={tabs.headerExtras}
          settingsOpen={tabs.isOpen('settings')} helpOpen={tabs.isOpen('help')}
          help={<HelpArticles names={OUTLINE_HELP_NAMES} fallback={OUTLINE_HELP_FALLBACK} />}
        />
        {w.saveStatus.error && <p className="wrError">{w.saveStatus.error}</p>}
        <div className="wrCoverScroll">
          {tabs.isOpen('details') && <DraftStats book={book} chapters={chapters} nodeWords={counts.nodes} settings={w.activeProject?.settings} />}
          <OutlineNav w={w} book={book} counts={counts} />
        </div>
      </aside>
      <div className="wrOutlineBody">
        <div className="wrPage wrPage--chapter wrOutlinePage">
          <div className="wrPageScroll">
            {tabs.isOpen('outline') && (
              <OutlineCards w={w} book={book} counts={counts} chapterId={activeId} plotDrag={{ dragId: w.plotDragId, setDragId: w.setPlotDragId }} />
            )}
          </div>
        </div>
        <EdgeTabs
          w={w} activeChapterId={activeId}
          onChapter={id => w.selectChapter(id)}
          onArc={arcId => { const first = firstChapterOf(arcId); if (first) w.selectChapter(first.id) }}
          onAddChapter={() => { w.selectChapter(w.addOutlineNode(book.id, 'chapter')) }}
        />
      </div>
    </div>
  )
}

export default OutlineMax
