import { useState } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, chaptersOfBook, descendantsOf, shelfGroups } from '../outlineTree'
import { nodeLabel } from '../plotTree'
import { DeleteControl } from '../shared'
import { Shelf } from '../Shelf'
import { shelfTiles } from '../tiles/shelfTiles'
import { shelvesTiles } from '../tiles/shelvesTiles'
import TileGrid from '../../../../components/tiles/TileGrid'
import { PlusIcon } from '../../../icons'

const kv = (k: string, v: React.ReactNode) => (
  <div className="wrKv"><span>{k}</span><span>{v}</span></div>
)

// The Dash level at Mid: the dashboard's smaller tiles.
const DASH_MID_TILES = ['schedule', 'scratchpad']
export function DashMid({ w }: { w: WriterWorkspace }) {
  return (
    <TileGrid
      gridId="shelves-mid" label="Dashboard tiles (mid)" crumbs={[{ label: 'Dashboard' }]}
      tiles={shelvesTiles(w).filter(t => DASH_MID_TILES.includes(t.id))}
    />
  )
}

// The Project level at Mid: its working tiles.
const PROJECT_MID_TILES = ['schedule', 'plot', 'outline']
export function ProjectMid({ w }: { w: WriterWorkspace }) {
  return (
    <TileGrid
      gridId="shelf-mid" label="Project tiles (mid)" crumbs={[{ label: w.activeProject?.title ?? 'Project' }]}
      tiles={shelfTiles(w).filter(t => PROJECT_MID_TILES.includes(t.id))}
    />
  )
}

// The Project level at Min: the open project's book spines.
export function ProjectMin({ w }: { w: WriterWorkspace }) {
  const groups = shelfGroups(w.outlineNodes)
  return (
    <div className="wrLevelMinBody">
      <Shelf
        label="Books" meta={`${w.books.length} ${w.books.length === 1 ? 'book' : 'books'}`}
        groups={groups} activeBookId={w.activeBookId} onOpenBook={w.openBook}
      />
    </div>
  )
}

// The project shelves (every project and its books), with a way to start a new
// project: what stands beside the Dash while it has the focus.
export function ProjectShelves({ w }: { w: WriterWorkspace }) {
  const [newTitle, setNewTitle] = useState('')
  function createProject() {
    if (!newTitle.trim()) return
    void w.createProject(newTitle.trim())
    setNewTitle('')
  }
  return (
    <div className="wrLevelMinBody wrProjectShelves">
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
        const open = w.activeProjectId === p.projectId
        return (
          <Shelf
            key={p.projectId}
            label={p.title}
            meta={`${bookCount} ${bookCount === 1 ? 'book' : 'books'}`}
            groups={groups}
            activeBookId={open ? w.activeBookId : null}
            selected={open}
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
    </div>
  )
}

// The Outline level at Mid: the open book's facts, and its arcs and chapters as
// navigation rows.
export function OutlineMid({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  if (!book) return <p className="wrMuted">Select a book on the shelf to open it.</p>
  const index = buildChildIndex(w.outlineNodes)
  const bookChapters = w.activeBookChapters
  return (
    <div className="wrOutlineMid">
      {kv('Title', nodeLabel(book))}
      {kv('Chapters', book.chapterCountTarget ? `${bookChapters.length} of ${book.chapterCountTarget} target` : bookChapters.length)}
      {book.wordCountGoal != null && kv('Word goal', book.wordCountGoal.toLocaleString())}
      {book.synopsis && <div className="wrPanelText">{book.synopsis}</div>}
      <div className="wrPanelHead">Outline</div>
      {descendantsOf(index, book.id)
        .filter(n => n.kind === 'arc' || n.kind === 'chapter')
        .map(n => {
          const depth = n.kind === 'chapter' && n.parentId !== book.id ? 1 : 0
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
      {chaptersOfBook(w.outlineNodes, book.id).length === 0 && <div className="wrMuted">No chapters yet.</div>}
    </div>
  )
}
