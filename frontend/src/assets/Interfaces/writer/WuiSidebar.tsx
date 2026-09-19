import { useEffect, useState, type ReactNode } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { booksOf, buildChildIndex, chaptersOfBook, descendantsOf } from './outlineTree'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../../icons'
import { DeleteControl } from './shared'

// The bookshelf look lives here and nowhere else in the Writer interface:
// stacked project shelves when nothing is open, and -- once a project is
// open -- just that project's shelf, followed by one collapsible panel per
// selected level (Project, then Book, then Chapter) that only appears once
// that kind of object is selected.

const SPINE_HEIGHTS = [100, 84, 94, 88]

function Spine({ book, index, active, onOpen }: { book: OutlineNode; index: number; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={active ? 'wrSpine wrSpine--active' : 'wrSpine'}
      style={{ height: SPINE_HEIGHTS[index % SPINE_HEIGHTS.length], ...(book.color ? { backgroundColor: book.color } : {}) }}
      onClick={onOpen}
      title={book.title}
    >
      <span>{book.title}</span>
    </button>
  )
}

function Shelf({ label, meta, books, activeBookId, selected, onOpenBook, onOpen, right }: {
  label: string
  meta: string
  books: OutlineNode[]
  activeBookId: string | null
  selected?: boolean
  onOpenBook: (bookId: string) => void
  // Makes the shelf title a link to the project.
  onOpen?: () => void
  right?: ReactNode
}) {
  return (
    <div className="wrShelf">
      <div className="wrShelfHeader">
        {onOpen
          ? <button type="button" className={selected ? 'wrShelfName wrShelfName--link wrShelfName--selected' : 'wrShelfName wrShelfName--link'} onClick={onOpen}>{label}</button>
          : <span className={selected ? 'wrShelfName wrShelfName--selected' : 'wrShelfName'}>{label}</span>}
        <span className="wrShelfMeta">{meta}</span>
        {right}
      </div>
      <div className="wrShelfBooks">
        {books.length === 0 && <span className="wrShelfEmpty">No books yet</span>}
        {books.map((b, i) => (
          <Spine key={b.id} book={b} index={i} active={b.id === activeBookId} onOpen={() => onOpenBook(b.id)} />
        ))}
      </div>
      <div className="wrShelfBoard" />
    </div>
  )
}

function Panel({ label, value, open, onToggle, onOpen, children }: {
  label: string
  value: string
  open: boolean
  onToggle: () => void
  // Jump to this level's own console (shown only when not already there).
  onOpen?: () => void
  children: ReactNode
}) {
  return (
    <section className="wrPanel">
      <div className="wrPanelHeaderRow">
        <button type="button" className="wrPanelHeader" aria-expanded={open} onClick={onToggle}>
          {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
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

function WuiSidebar({ workspace: w }: { workspace: WriterWorkspace }) {
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

  if (!w.hasOpenProject) {
    return (
      <aside className="wrSidebar" aria-label="Project shelves">
        {w.projectsStatus === 'loading' && <p className="wrMuted">Loading projects…</p>}
        {w.projectsStatus === 'error' && (
          <p className="wrMuted">
            {w.projectsError ?? 'Failed to load projects.'}{' '}
            <button type="button" className="wrSmallBtn" onClick={() => void w.loadProjects()}>Retry</button>
          </p>
        )}
        {w.projects.map(p => {
          const books = booksOf(w.projectOutlines[p.projectId] ?? [])
          return (
            <Shelf
              key={p.projectId}
              label={p.title}
              meta={`${books.length} ${books.length === 1 ? 'book' : 'books'}`}
              books={books}
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
  const chapterCount = w.books.reduce((n, b) => n + chaptersOfBook(w.outlineNodes, b.id).length, 0)
  const deepest: PanelKey = w.activeChapter ? 'chapter' : w.activeBook ? 'book' : 'project'
  const isOpen = (key: PanelKey) => (manualOpen ? manualOpen === key : deepest === key)
  const toggle = (key: PanelKey) => setManualOpen(isOpen(key) ? 'none' : key)

  const bookChapters = w.activeBook ? w.activeBookChapters : []
  const chapterNumber = w.activeChapter ? bookChapters.findIndex(c => c.id === w.activeChapter!.id) + 1 : 0
  const chapterTree = w.activeChapter ? descendantsOf(index, w.activeChapter.id) : []
  const moments = chapterTree.filter(n => n.kind === 'moment').length
  let actNo = 0
  let sceneNo = 0
  let momentNo = 0

  return (
    <aside className="wrSidebar" aria-label="Project navigation">
      <button type="button" className="wrBackLink" onClick={w.backToShelves}>
        <ChevronLeftIcon size={14} /> All shelves
      </button>

      <Shelf
        label={project.title}
        meta={`${w.books.length} ${w.books.length === 1 ? 'book' : 'books'}`}
        books={w.books}
        activeBookId={w.activeBookId}
        selected
        onOpenBook={w.openBook}
        onOpen={w.activeConsole !== 'shelf' ? w.showProject : undefined}
      />

      <Panel
        label="Project" value={project.title} open={isOpen('project')} onToggle={() => toggle('project')}
        onOpen={w.activeConsole !== 'shelf' ? w.showProject : undefined}
      >
        {kv('Books', w.books.length)}
        {kv('Chapters', chapterCount)}
        {kv('Plot categories', w.plotNodes.filter(n => n.kind === 'category').length)}
        <div className="wrPanelHead">Outline</div>
        {w.books.length === 0 && <div className="wrMuted">No books yet.</div>}
        {w.books.map(b => (
          <button key={b.id} type="button" className="wrOutlineRow" onClick={() => w.openBook(b.id)}>
            <span>{b.title}</span>
            <span className="wrOutlineMeta">{chaptersOfBook(w.outlineNodes, b.id).length} chapters</span>
          </button>
        ))}
      </Panel>

      {w.activeBook && (
        <Panel
          label="Book" value={w.activeBook.title} open={isOpen('book')} onToggle={() => toggle('book')}
          onOpen={w.activeConsole !== 'book' || w.activeChapterId ? () => w.openBook(w.activeBook!.id) : undefined}
        >
          {kv('Title', w.activeBook.title)}
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
                  <span>{n.title}</span><span className="wrOutlineMeta">arc</span>
                </div>
              ) : (
                <button
                  key={n.id} type="button" style={{ paddingLeft: 6 + depth * 12 }}
                  className={n.id === w.activeChapterId ? 'wrOutlineRow wrOutlineRow--active' : 'wrOutlineRow'}
                  onClick={() => w.openChapter(n.id)}
                >
                  <span>{bookChapters.findIndex(c => c.id === n.id) + 1} · {n.title}</span>
                </button>
              )
            })}
        </Panel>
      )}

      {w.activeChapter && (
        <Panel label="Chapter" value={`${chapterNumber} · ${w.activeChapter.title}`} open={isOpen('chapter')} onToggle={() => toggle('chapter')}>
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
    </aside>
  )
}

export default WuiSidebar
