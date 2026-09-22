import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { buildChildIndex, chaptersOfBook, descendantsOf, shelfGroups, type ShelfGroup } from './outlineTree'
import { BookFaceIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, LibraryIcon, PageIcon, PlusIcon, type IconProps } from '../../icons'
import { DeleteControl } from './shared'
import { nodeLabel } from './plotTree'
import BookScope from './BookScope'
import { bookThemeHue, themeColorCss } from '../../../theme/bookColors'

// The bookshelf look lives here and nowhere else in the Writer interface:
// stacked project shelves when nothing is open, and -- once a project is
// open -- just that project's shelf, followed by one collapsible panel per
// selected level (Project, then Book, then Chapter) that only appears once
// that kind of object is selected.

const SPINE_HEIGHT = 100

// A spine's width reflects the book's length: 5px for every 40,000 words of
// its word-count goal, with a sliver minimum so a book with no goal stays on
// the shelf. Spines narrower than TITLE_MIN_WIDTH have no room for a title.
const SPINE_PX_PER_40K_WORDS = 5
const SPINE_MIN = 8
const TITLE_MIN_WIDTH = 20
export function spineWidth(goal: number | null | undefined): number {
  const width = Math.round(((goal && goal > 0 ? goal : 0) / 40000) * SPINE_PX_PER_40K_WORDS)
  return Math.max(SPINE_MIN, width)
}

function Spine({ book, active, onOpen }: { book: OutlineNode; active: boolean; onOpen: () => void }) {
  const width = spineWidth(book.wordCountGoal)
  return (
    <button
      type="button"
      className={active ? 'wrSpine wrSpine--active' : 'wrSpine'}
      style={{ height: SPINE_HEIGHT, width, backgroundColor: themeColorCss(bookThemeHue(book)) }}
      onClick={onOpen}
      title={nodeLabel(book)}
    >
      {width >= TITLE_MIN_WIDTH && <span>{nodeLabel(book)}</span>}
    </button>
  )
}

// A project's spines, grouped: each series is a darkened section with its label above
// the books in it; books outside any series stand on the plain shelf.
function Shelf({ label, meta, groups, activeBookId, selected, onOpenBook, onOpen, right }: {
  label: string
  meta: string
  groups: ShelfGroup[]
  activeBookId: string | null
  selected?: boolean
  onOpenBook: (bookId: string) => void
  // Makes the shelf title a link to the project.
  onOpen?: () => void
  right?: ReactNode
}) {
  // The wheel scrolls the row sideways (a mouse wheel only turns vertically). React's onWheel
  // is passive, so this listener is added by hand to be allowed to stop the page scrolling.
  const booksRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = booksRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY))
      if (Math.abs(next - el.scrollLeft) < 1) return // at an end: let the sidebar scroll
      e.preventDefault()
      el.scrollLeft = next
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  return (
    <div className="wrShelf">
      <div className="wrShelfHeader">
        {onOpen
          ? <button type="button" className={selected ? 'wrShelfName wrShelfName--link wrShelfName--selected' : 'wrShelfName wrShelfName--link'} onClick={onOpen}>{label}</button>
          : <span className={selected ? 'wrShelfName wrShelfName--selected' : 'wrShelfName'}>{label}</span>}
        <span className="wrShelfMeta">{meta}</span>
        {right}
      </div>
      <div ref={booksRef} className={activeBookId ? 'wrShelfBooks wrShelfBooks--picked' : 'wrShelfBooks'}>
        {groups.every(g => g.books.length === 0 && g.series === null) && <span className="wrShelfEmpty">No books yet</span>}
        {groups.map((g, i) => {
          const spines = g.books.map(b => (
            <Spine key={b.id} book={b} active={b.id === activeBookId} onOpen={() => onOpenBook(b.id)} />
          ))
          if (!g.series) return <div key={`loose-${i}`} className="wrShelfLoose">{spines}</div>
          return (
            <div key={g.series.id} className="wrShelfSeries" role="group" aria-label={`Series: ${nodeLabel(g.series)}`}>
              <span className="wrShelfSeriesLabel" title={nodeLabel(g.series)}>{g.series.title.trim() || 'Untitled series'}</span>
              <div className="wrShelfSeriesBooks">{spines}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// An ancestor of what is open (the project, the book, the chapter), as a tile: read-only
// facts and navigation rows. Its header folds it; the value is a link when there is a
// console of its own to go to.
function Panel({ Icon, label, value, open, onToggle, onOpen, children }: {
  Icon: ComponentType<IconProps>
  label: string
  value: string
  open: boolean
  onToggle: () => void
  // Jump to this level's own console (shown only when not already there).
  onOpen?: () => void
  children: ReactNode
}) {
  return (
    <section className="wrPanel wrSideTile">
      <div className="wrPanelHeaderRow">
        <button type="button" className="wrPanelHeader" aria-expanded={open} onClick={onToggle}>
          {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          <Icon size={15} />
          <span className="wrPanelLabel">{label}</span>
          {!onOpen && <span className="wrPanelValue">{value}</span>}
        </button>
        {onOpen && <button type="button" className="wrPanelValue wrPanelValue--link" title={`Open ${value}`} onClick={onOpen}>{value}</button>}
      </div>
      {open && <div className="wrPanelBody">{children}</div>}
    </section>
  )
}

const kv = (k: string, v: ReactNode) => (
  <div className="wrKv"><span>{k}</span><span>{v}</span></div>
)

type PanelKey = 'project' | 'book' | 'chapter'

function WuiSidebar({ workspace: w, collapsed = false, canCollapse = false, onToggleCollapsed }: {
  workspace: WriterWorkspace
  // Minimized to a slim rail (only offered while the main screen is narrow, and to open it again).
  collapsed?: boolean
  canCollapse?: boolean
  onToggleCollapsed?: () => void
}) {
  const [newTitle, setNewTitle] = useState('')
  // Only the current (deepest) panel is open; a click on a header opens that
  // one instead. Selecting something new resets this to "the current one".
  const [manualOpen, setManualOpen] = useState<PanelKey | 'none' | null>(null)
  useEffect(() => { setManualOpen(null) }, [w.activeProjectId, w.activeBookId, w.activeChapterId])

  function createProject() {
    if (!newTitle.trim()) return
    void w.createProject(newTitle.trim())
    setNewTitle('')
  }

  // The slim rail: just the button that brings the sidebar back.
  if (collapsed) {
    return (
      <aside className="wrSidebar wrSidebar--collapsed" aria-label="Sidebar (minimized)">
        <button type="button" className="wrSideToggle" onClick={onToggleCollapsed} aria-label="Show sidebar" title="Show sidebar">
          <ChevronRightIcon size={16} />
        </button>
      </aside>
    )
  }
  const toggle_ = canCollapse && onToggleCollapsed ? (
    <button type="button" className="wrSideToggle wrSideToggle--minimize" onClick={onToggleCollapsed} aria-label="Minimize sidebar" title="Minimize sidebar">
      <ChevronLeftIcon size={16} />
    </button>
  ) : null

  if (!w.hasOpenProject) {
    return (
      <aside className="wrSidebar" aria-label="Project shelves">
        {toggle_}
        {w.projectsStatus === 'loading' && <p className="wrMuted">Loading projects…</p>}
        {w.projectsStatus === 'error' && (
          <p className="wrMuted">
            {w.projectsError ?? 'Failed to load projects.'}{' '}
            <button type="button" className="wrSmallBtn" onClick={() => void w.loadProjects()}>Retry</button>
          </p>
        )}
        {w.projects.map(p => {
          const groups = shelfGroups(w.projectOutlines[p.projectId] ?? [])
          const bookCount = groups.reduce((n, g) => n + g.books.length, 0)
          return (
            <Shelf
              key={p.projectId}
              label={p.title}
              meta={`${bookCount} ${bookCount === 1 ? 'book' : 'books'}`}
              groups={groups}
              activeBookId={null}
              onOpenBook={bookId => void w.openProject(p.projectId, bookId)}
              onOpen={() => void w.openProject(p.projectId)}
              right={<DeleteControl tone="dark" message={`Delete ${p.title}?`} onConfirm={() => void w.deleteProject(p.projectId)} />}
            />
          )
        })}
        {w.projectsStatus === 'idle' && w.projects.length === 0 && <p className="wrMuted">No projects yet. Create one below.</p>}
        <div className="wrNewProject">
          <input
            value={newTitle} placeholder="New project title…"
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createProject() }}
          />
          <button type="button" className="wrSmallBtn" disabled={!newTitle.trim()} onClick={createProject}>
            <PlusIcon size={14} /> New project
          </button>
        </div>
      </aside>
    )
  }

  const project = w.activeProject!
  const index = buildChildIndex(w.outlineNodes)
  const groups = shelfGroups(w.outlineNodes)
  const chapterCount = w.books.reduce((n, b) => n + chaptersOfBook(w.outlineNodes, b.id).length, 0)
  const deepest: PanelKey = w.activeChapter ? 'chapter' : w.activeBook ? 'book' : 'project'
  const isOpen = (key: PanelKey) => (manualOpen ? manualOpen === key : deepest === key)
  const toggle = (key: PanelKey) => setManualOpen(isOpen(key) ? 'none' : key)

  const bookChapters = w.activeBook ? w.activeBookChapters : []
  const chapterNumber = w.activeChapter ? bookChapters.findIndex(c => c.id === w.activeChapter!.id) + 1 : 0
  // The free draft is not part of the outline.
  const chapterTree = w.activeChapter ? descendantsOf(index, w.activeChapter.id).filter(n => !n.freeDraft) : []
  const moments = chapterTree.filter(n => n.kind === 'moment').length
  let actNo = 0
  let sceneNo = 0
  let momentNo = 0

  return (
    <aside className="wrSidebar" aria-label="Project navigation">
      {toggle_}
      <button type="button" className="wrBackLink" onClick={w.backToShelves}>
        <ChevronLeftIcon size={14} /> All shelves
      </button>

      <Shelf
        label={project.title}
        meta={`${w.books.length} ${w.books.length === 1 ? 'book' : 'books'}`}
        groups={groups}
        activeBookId={w.activeBookId}
        selected
        onOpenBook={w.openBook}
        onOpen={w.activeConsole !== 'shelf' ? w.showProject : undefined}
      />

      <Panel
        Icon={LibraryIcon} label="Project" value={project.title} open={isOpen('project')} onToggle={() => toggle('project')}
        onOpen={w.activeConsole !== 'shelf' ? w.showProject : undefined}
      >
        {kv('Books', w.books.length)}
        {kv('Chapters', chapterCount)}
        {kv('Plot categories', w.plotNodes.filter(n => n.kind === 'category').length)}
        <div className="wrPanelHead">Outline</div>
        {w.books.length === 0 && <div className="wrMuted">No books yet.</div>}
        {groups.map((g, i) => (
          <div key={g.series?.id ?? `loose-${i}`}>
            {g.series && (
              <div className="wrOutlineRow wrOutlineRow--static">
                <span>{g.series.title.trim() || 'Untitled series'}</span><span className="wrOutlineMeta">series</span>
              </div>
            )}
            {g.books.map(b => (
              <button key={b.id} type="button" className="wrOutlineRow" style={{ paddingLeft: g.series ? 18 : 6 }} onClick={() => w.openBook(b.id)}>
                <span>{nodeLabel(b)}</span>
                <span className="wrOutlineMeta">{chaptersOfBook(w.outlineNodes, b.id).length} chapters</span>
              </button>
            ))}
          </div>
        ))}
      </Panel>

      <BookScope book={w.activeBook} flow>
      {w.activeBook && (
        <Panel
          Icon={BookFaceIcon} label="Book" value={nodeLabel(w.activeBook)} open={isOpen('book')} onToggle={() => toggle('book')}
          onOpen={w.activeConsole !== 'book' || w.activeChapterId ? () => w.openBook(w.activeBook!.id) : undefined}
        >
          {kv('Title', nodeLabel(w.activeBook))}
          {kv('Chapters', w.activeBook.chapterCountTarget ? `${bookChapters.length} of ${w.activeBook.chapterCountTarget} target` : bookChapters.length)}
          {w.activeBook.wordCountGoal != null && kv('Word goal', w.activeBook.wordCountGoal.toLocaleString())}
          {w.activeBook.synopsis && <div className="wrPanelText">{w.activeBook.synopsis}</div>}
          <div className="wrPanelHead">Outline</div>
          {descendantsOf(index, w.activeBook.id)
            .filter(n => n.kind === 'arc' || n.kind === 'chapter')
            .map(n => {
              const depth = n.kind === 'chapter' && n.parentId !== w.activeBook!.id ? 1 : 0
              return n.kind === 'arc' ? (
                <div key={n.id} className="wrOutlineRow wrOutlineRow--static" style={{ paddingLeft: 6 }}>
                  <span>{nodeLabel(n)}</span><span className="wrOutlineMeta">arc</span>
                </div>
              ) : (
                <button
                  key={n.id} type="button" style={{ paddingLeft: 6 + depth * 12 }}
                  className={n.id === w.activeChapterId ? 'wrOutlineRow wrOutlineRow--active' : 'wrOutlineRow'}
                  onClick={() => w.openChapter(n.id)}
                >
                  <span>{bookChapters.findIndex(c => c.id === n.id) + 1} · {nodeLabel(n)}</span>
                </button>
              )
            })}
        </Panel>
      )}

      {w.activeChapter && (
        <Panel Icon={PageIcon} label="Chapter" value={`${chapterNumber} · ${nodeLabel(w.activeChapter)}`} open={isOpen('chapter')} onToggle={() => toggle('chapter')}>
          {kv('Chapter', chapterNumber)}
          {kv('Moments', moments)}
          <div className="wrPanelHead">Outline</div>
          {chapterTree.length === 0 && <div className="wrMuted">Nothing outlined yet.</div>}
          {chapterTree.map(n => {
            let label = ''
            let depth = 0
            let meta = ''
            if (n.kind === 'act') { actNo += 1; label = `Act ${actNo}`; depth = 0 }
            else if (n.kind === 'scene') { sceneNo += 1; label = `Scene ${sceneNo}`; depth = n.parentId === w.activeChapter!.id ? 0 : 1; meta = n.location ?? '' }
            else { momentNo += 1; label = `Moment ${momentNo}`; depth = 2 }
            return (
              <div key={n.id} className="wrOutlineRow wrOutlineRow--static" style={{ paddingLeft: 6 + depth * 12 }}>
                <span>{label}</span>{meta && <span className="wrOutlineMeta">{meta}</span>}
              </div>
            )
          })}
        </Panel>
      )}
      </BookScope>
    </aside>
  )
}

export default WuiSidebar
