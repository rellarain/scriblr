import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useProject } from '../../api/projects'
import { useOutline, useSaveOutline } from '../../api/outline'
import { useScrap } from '../../api/scrap'
import ChapterNav from './ChapterNav'
import ScrapBinPanel from '../../modes/draft/ScrapBinPanel'
import { addBook, ancestorOfKind } from '../../modes/outline/outlineTree'

const COLLAPSED_STORAGE_KEY = 'scriblr:navCollapsed'

/** Resolves a scrap entry to whichever of its last-known ancestors still
 * exists in the live tree (chapter first, then book), or null if neither
 * survives -- used both for sidebar badge counts and for scoping the scrap
 * bin panel to whichever badge was clicked. */
function scrapGroupKey(
  entry: { lastChapterId: string | null; lastBookId: string | null },
  liveIds: Set<string>
): string | null {
  if (entry.lastChapterId && liveIds.has(entry.lastChapterId)) return entry.lastChapterId
  if (entry.lastBookId && liveIds.has(entry.lastBookId)) return entry.lastBookId
  return null
}

function ProjectShell() {
  const { projectId, bookId, chapterId } = useParams<{
    projectId: string
    bookId?: string
    chapterId?: string
  }>()
  const navigate = useNavigate()
  const { data, isLoading, error } = useProject(projectId)
  const { data: outline } = useOutline(projectId)
  const { data: scrapRegistry } = useScrap(projectId)
  const saveOutline = useSaveOutline(projectId ?? '')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_STORAGE_KEY) !== '0')
  const [scrapPanelScope, setScrapPanelScope] = useState<string | null>(null)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  const nodes = outline?.nodes ?? []
  const liveIds = new Set(nodes.map((n) => n.id))
  const scrapCountsByNodeId: Record<string, number> = {}
  for (const entry of scrapRegistry?.entries ?? []) {
    const key = scrapGroupKey(entry, liveIds)
    if (key) scrapCountsByNodeId[key] = (scrapCountsByNodeId[key] ?? 0) + 1
  }
  const scopeEntries = scrapPanelScope
    ? (scrapRegistry?.entries ?? []).filter((e) => scrapGroupKey(e, liveIds) === scrapPanelScope)
    : []

  function handleAddBook() {
    if (!outline || !projectId) return
    const next = addBook(outline.nodes, '')
    const newBook = next[next.length - 1]
    saveOutline.mutate({ schemaVersion: outline.schemaVersion, nodes: next })
    navigate(`/project/${projectId}/book/${newBook.id}`)
  }

  return (
    <div className={`project-shell${collapsed ? ' project-shell--collapsed' : ''}`}>
      <aside className="project-shell__sidebar">
        <button
          type="button"
          className="project-shell__collapse-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? '»' : '«'}
        </button>
        <NavLink to="/" className="project-shell__back" title="Back to projects">
          {collapsed ? '←' : '← Projects'}
        </NavLink>
        {!collapsed && (
          <h2 className="project-shell__title">
            {isLoading ? 'Loading…' : data?.index.title ?? 'Untitled'}
          </h2>
        )}
        {!collapsed && (
          <ChapterNav
            nodes={nodes}
            selectedBookId={bookId}
            selectedChapterId={chapterId}
            onSelectProject={() => navigate(`/project/${projectId}`)}
            onSelectBook={(id) => navigate(`/project/${projectId}/book/${id}`)}
            onSelectChapter={(id) => {
              const parentBookId = bookId ?? ancestorOfKind(nodes, id, 'book')?.id
              if (!parentBookId) return
              navigate(`/project/${projectId}/book/${parentBookId}/chapter/${id}`)
            }}
            onAddBook={handleAddBook}
            scrapCountsByNodeId={scrapCountsByNodeId}
            onScrapBadgeClick={setScrapPanelScope}
          />
        )}
        {!collapsed &&
          data?.warnings.map((warning) => (
            <p key={warning} className="project-shell__warning">
              ⚠ {warning}
            </p>
          ))}
      </aside>
      <main className="project-shell__content">
        {error ? <p className="project-shell__error">Failed to load project.</p> : <Outlet />}
      </main>
      {scrapPanelScope && projectId && (
        <div className="project-shell__scrap-overlay">
          <ScrapBinPanel
            projectId={projectId}
            entries={scopeEntries}
            nodes={nodes}
            onClose={() => setScrapPanelScope(null)}
          />
        </div>
      )}
    </div>
  )
}

export default ProjectShell
