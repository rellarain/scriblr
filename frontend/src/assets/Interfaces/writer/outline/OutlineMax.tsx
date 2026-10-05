import { useEffect, useMemo, useState } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { Placeholder } from '../shared'
import { useWordCounts } from '../useWordCounts'
import EdgeTabs from '../EdgeTabs'
import HelpArticles from '../levels/HelpArticles'
import { OUTLINE_HELP_FALLBACK, OUTLINE_HELP_NAMES, useOutlineTabs } from '../levels/outlineTabs'
import BookEditor from './BookEditor'
import BookSettings from './BookSettings'
import DraftStats from './DraftStats'
import OutlineCards from './OutlineCards'
import OutlineNav, { type OutlineFocus } from './OutlineNav'

// The Outline level at Max: the open book, all on its cover, in one column (the page edges and the arcs'
// and chapters' tabs stand at its right, as on the Draft's book): the book editor strip (title,
// counts, the level's tabs) at its top, then the sections the tabs open (settings, help, draft stats) and the
// contents (the arcs and chapters), the open chapter unfolding its acts, scenes and moments as editable cards.
// An arc's tab narrows the cover to that arc and its chapters' outlines; a chapter's tab, to that one chapter's; the focused tab
// again, back to the whole book's.
// The book's pages are the Draft level's. The plotpoints still to place are in the
// Project level's Plotpoints tab: drag one onto a card.
function OutlineMax({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  const counts = useWordCounts(w.activeProjectId)
  const tabs = useOutlineTabs(w, 'max')
  const chapters = w.activeBookChapters
  const activeId = w.activeChapterId
  // A book opens on a chapter: the first, until another is picked.
  const firstId = chapters[0]?.id ?? null
  // The whole book, picked by choosing the focused tab again; like the arc, it ends when another chapter is picked.
  const [allPick, setAllPick] = useState<{ chapterId: string | null } | null>(null)
  const showAll = allPick !== null && allPick.chapterId === activeId
  // The focused arc, with the chapter that was open when it was picked: picking another chapter (here or elsewhere) ends it.
  const [arcPick, setArcPick] = useState<{ arcId: string; chapterId: string | null } | null>(null)
  const arcId = !showAll && arcPick && arcPick.chapterId === activeId && w.outlineNodes.some(n => n.id === arcPick.arcId && n.kind === 'arc') ? arcPick.arcId : null
  const hasActive = useMemo(() => chapters.some(c => c.id === activeId), [chapters, activeId])
  useEffect(() => {
    if (firstId && !hasActive) w.selectChapter(firstId)
    // Only a missing open chapter counts, not the workspace object changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstId, hasActive])
  if (!book) return <Placeholder title="Book" body="Select a book on the shelf to open it." />

  const focus: OutlineFocus | null = showAll ? { kind: 'book', id: book.id } : arcId ? { kind: 'arc', id: arcId } : activeId && hasActive ? { kind: 'chapter', id: activeId } : null
  // An arc's tab focuses the arc, opening its first chapter (so the page the Draft opens on is in it).
  // Choosing the tab already focused goes back to the whole book.
  const pickArc = (id: string) => {
    if (arcId === id) { setAllPick({ chapterId: activeId }); return }
    setAllPick(null)
    const first = w.outlineNodes.filter(n => n.parentId === id && n.kind === 'chapter').sort((a, b) => a.order - b.order)[0]
    if (first) w.selectChapter(first.id)
    setArcPick({ arcId: id, chapterId: first?.id ?? activeId })
  }

  return (
    <div className="wrOutlineMax">
      <aside className="wrBookCover" aria-label="Book cover">
        <BookEditor w={w} book={book} bookWords={counts.books[book.id] ?? 0} tabs={tabs.headerExtras} />
        {w.saveStatus.error && <p className="wrError">{w.saveStatus.error}</p>}
        {/* The book's cover is the whole Outline, in one column: the sections the tabs open, then the contents, the open
            chapter unfolding its acts, scenes and moments. */}
        <div className="wrCoverScroll">
          <div className="wrCoverColumn">
            {tabs.isOpen('settings') && <BookSettings w={w} book={book} bookWords={counts.books[book.id] ?? 0} compact />}
            {tabs.isOpen('help') && <div className="wrBookEdHelp"><HelpArticles names={OUTLINE_HELP_NAMES} fallback={OUTLINE_HELP_FALLBACK} /></div>}
            {tabs.isOpen('details') && <DraftStats book={book} chapters={chapters} nodeWords={counts.nodes} settings={w.activeProject?.settings} />}
            <OutlineNav
              w={w} book={book} counts={counts} focus={focus}
              chapterBody={chapter => tabs.isOpen('outline') && (
                <OutlineCards w={w} book={book} counts={counts} chapterId={chapter.id} plotDrag={{ dragId: w.plotDragId, setDragId: w.setPlotDragId }} />
              )}
            />
          </div>
        </div>
      </aside>
      <EdgeTabs
        w={w} activeChapterId={arcId || showAll ? null : activeId} activeArcId={arcId}
        onChapter={id => {
          setArcPick(null)
          if (id === activeId && !arcId && !showAll) { setAllPick({ chapterId: activeId }); return }
          setAllPick(null)
          w.selectChapter(id)
        }}
        onArc={pickArc}
        onAddChapter={() => { setAllPick(null); w.selectChapter(w.addOutlineNode(book.id, 'chapter')) }}
      />
    </div>
  )
}

export default OutlineMax
