import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useProject } from '../../api/projects'
import { useOutline, useSaveOutline } from '../../api/outline'
import { useScrap } from '../../api/scrap'
import Bookshelf from './Bookshelf'
import ScrapBinPanel from '../../modes/draft/ScrapBinPanel'
import BulletinBoardOverlay from '../../modes/dashboard/BulletinBoardOverlay'
import PlotDrawer from '../../modes/plot/PlotDrawer'
import ConfigurationPanel from '../../modes/workspace/ConfigurationPanel'
import SchedulePanel from '../../modes/workspace/SchedulePanel'
import { addBook, ancestorOfKind } from '../../modes/outline/outlineTree'
import type { OutlineNode } from '../../types'

const COLLAPSED_STORAGE_KEY = 'scriblr:navCollapsed'

type SidebarOverlay = 'plot' | 'dashboard' | 'settings' | null

/** Resolves a scrap entry to its book ancestor -- chapters no longer have
 * their own sidebar row (chapter nav moved into the book face's tab
 * dividers), so every scrap badge is shown at the book level, aggregating
 * across all of that book's chapters. */
function scrapBookKey(
  entry: { lastChapterId: string | null; lastBookId: string | null },
  nodes: OutlineNode[],
  liveIds: Set<string>
): string | null {
  if (entry.lastChapterId && liveIds.has(entry.lastChapterId)) {
    const book = ancestorOfKind(nodes, entry.lastChapterId, 'book')
    if (book) return book.id
  }
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
  const [overlay, setOverlay] = useState<SidebarOverlay>(null)

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
    const key = scrapBookKey(entry, nodes, liveIds)
    if (key) scrapCountsByNodeId[key] = (scrapCountsByNodeId[key] ?? 0) + 1
  }
  const scopeEntries = scrapPanelScope
    ? (scrapRegistry?.entries ?? []).filter((e) => scrapBookKey(e, nodes, liveIds) === scrapPanelScope)
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
        {!collapsed && projectId && (
          <Bookshelf
            projectId={projectId}
            nodes={nodes}
            selectedBookId={bookId}
            onSelectProject={() => navigate(`/project/${projectId}`)}
            onSelectBook={(id) => navigate(`/project/${projectId}/book/${id}`)}
            onAddBook={handleAddBook}
            scrapCountsByNodeId={scrapCountsByNodeId}
            onScrapBadgeClick={setScrapPanelScope}
            onOpenPlot={() => setOverlay('plot')}
            onOpenDashboard={() => setOverlay('dashboard')}
            onOpenSettings={() => setOverlay('settings')}
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
      {overlay === 'plot' && <PlotDrawer onClose={() => setOverlay(null)} />}
      {overlay === 'dashboard' && projectId && (
        <BulletinBoardOverlay projectId={projectId} nodes={nodes} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'settings' && (
        <div className="project-shell__settings-overlay">
          <div className="project-shell__settings-panel">
            <div className="project-shell__settings-header">
              <h3>Settings</h3>
              <button type="button" onClick={() => setOverlay(null)}>
                Close
              </button>
            </div>
            <ConfigurationPanel />
            <SchedulePanel />
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectShell
