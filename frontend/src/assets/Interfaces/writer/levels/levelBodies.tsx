import { useState } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { shelfGroups } from '../outlineTree'
import { DeleteControl } from '../shared'
import { Shelf } from '../Shelf'
import { PlusIcon } from '../../../icons'

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

// What stands beside the Dash while it has the focus: one tile per project (its books on a shelf), stacked,
// with the way to start a new project beneath them.
export function ProjectTiles({ w }: { w: WriterWorkspace }) {
  const [newTitle, setNewTitle] = useState('')
  function createProject() {
    if (!newTitle.trim()) return
    void w.createProject(newTitle.trim())
    setNewTitle('')
  }
  return (
    <div className="wrProjectTiles">
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
          <div key={p.projectId} className="wrProjectTile" data-project={p.projectId}>
            <Shelf
              label={p.title}
              meta={`${bookCount} ${bookCount === 1 ? 'book' : 'books'}`}
              groups={groups}
              activeBookId={open ? w.activeBookId : null}
              selected={open}
              onOpenBook={bookId => void w.openProject(p.projectId, bookId)}
              onOpen={() => void w.openProject(p.projectId)}
              right={<DeleteControl tone="dark" message={`Delete ${p.title}?`} onConfirm={() => void w.deleteProject(p.projectId)} />}
            />
          </div>
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
