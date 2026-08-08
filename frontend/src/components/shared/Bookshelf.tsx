import { useAnalytics } from '../../api/analytics'
import type { OutlineNode } from '../../types'
import { getBooks } from '../../modes/outline/outlineTree'
import BookSpine from '../../modes/shelf/BookSpine'
import DashboardIcon from './DashboardIcon'
import PlotIcon from './PlotIcon'
import SettingsIcon from './SettingsIcon'
import TrashIcon from './TrashIcon'

interface Props {
  projectId: string
  nodes: OutlineNode[]
  selectedBookId?: string
  onSelectProject: () => void
  onSelectBook: (bookId: string) => void
  onAddBook: () => void
  /** Scrap-entry counts keyed by book node id (chapter-level orphans roll up
   * to their book, since chapters no longer have their own sidebar row). */
  scrapCountsByNodeId?: Record<string, number>
  onScrapBadgeClick?: (bookId: string) => void
  onOpenPlot: () => void
  onOpenDashboard: () => void
  onOpenSettings: () => void
}

// The app's persistent left sidebar, replacing the old project -> book ->
// arc -> chapter drill-down tree: a shelf of book spines. Chapter
// navigation moved into the book face's tab dividers (BookFaceWorkspace),
// so this stops at book depth. Plot/Dashboard/Settings entry points live
// here too (absorbed from the now-removed shelf landing page) so they're
// reachable regardless of which book/chapter is open.
function Bookshelf({
  projectId,
  nodes,
  selectedBookId,
  onSelectProject,
  onSelectBook,
  onAddBook,
  scrapCountsByNodeId = {},
  onScrapBadgeClick,
  onOpenPlot,
  onOpenDashboard,
  onOpenSettings,
}: Props) {
  const { data: analytics } = useAnalytics(projectId)
  const wordCountByBook = new Map((analytics?.perBook ?? []).map((b) => [b.nodeId, b.wordCount]))
  const books = getBooks(nodes)
  const isProjectActive = !selectedBookId

  return (
    <nav className="bookshelf">
      <button
        type="button"
        className={`bookshelf__project${isProjectActive ? ' is-active' : ''}`}
        onClick={onSelectProject}
      >
        Project
      </button>
      <div className="bookshelf__tools">
        <button type="button" onClick={onOpenPlot}>
          <PlotIcon /> Plot
        </button>
        <button type="button" onClick={onOpenDashboard}>
          <DashboardIcon /> Dashboard
        </button>
        <button type="button" onClick={onOpenSettings}>
          <SettingsIcon /> Settings
        </button>
      </div>
      <div className="bookshelf__shelf">
        {books.map((book) => {
          const scrapCount = scrapCountsByNodeId[book.id] ?? 0
          return (
            <div key={book.id} className="bookshelf__slot">
              <BookSpine
                book={book}
                wordCount={wordCountByBook.get(book.id) ?? 0}
                isActive={book.id === selectedBookId}
                onClick={() => onSelectBook(book.id)}
              />
              {scrapCount > 0 && (
                <button
                  type="button"
                  className="bookshelf__scrap-badge"
                  title="Orphaned draft content"
                  onClick={() => onScrapBadgeClick?.(book.id)}
                >
                  <TrashIcon /> {scrapCount}
                </button>
              )}
            </div>
          )
        })}
        {books.length === 0 && <p className="bookshelf__empty">No books yet.</p>}
      </div>
      <button type="button" className="bookshelf__add-book" onClick={onAddBook}>
        + Add book
      </button>
    </nav>
  )
}

export default Bookshelf
