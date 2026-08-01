import { useState } from 'react'
import type { OutlineNode } from '../../types'
import { getChildren, getRoots } from '../../lib/nodeTree'
import TrashIcon from './TrashIcon'

interface Props {
  nodes: OutlineNode[]
  selectedBookId?: string
  selectedChapterId?: string
  onSelectProject: () => void
  onSelectBook: (bookId: string) => void
  onSelectChapter: (chapterId: string) => void
  onAddBook: () => void
  /** Scrap-entry counts keyed by book/chapter node id, for small badges. */
  scrapCountsByNodeId?: Record<string, number>
  onScrapBadgeClick?: (nodeId: string) => void
}

// The app's persistent left sidebar: a project -> book -> arc -> chapter
// drill-down, condensing "higher level" structure. Book and chapter rows are
// selectable; arc rows are inert (collapsible) headers for context. Stops at
// chapter -- act/scene/moment editing happens in the chapter-level workspace,
// not in this nav.
function ChapterNav({
  nodes,
  selectedBookId,
  selectedChapterId,
  onSelectProject,
  onSelectBook,
  onSelectChapter,
  onAddBook,
  scrapCountsByNodeId = {},
  onScrapBadgeClick,
}: Props) {
  // Presence in this set means "expanded" -- an empty set at load means
  // every book/arc starts collapsed/minimized.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleCollapse(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderNode(node: OutlineNode, depth: number) {
    const isBook = node.kind === 'book'
    const isChapter = node.kind === 'chapter'
    const children = isChapter ? [] : getChildren(nodes, node.id)
    const collapsed = !expandedIds.has(node.id)
    const scrapCount = scrapCountsByNodeId[node.id] ?? 0

    return (
      <div key={node.id} className="chapter-nav__branch">
        <div className="chapter-nav__row" style={{ paddingLeft: `${depth * 0.9}rem` }}>
          {children.length > 0 ? (
            <button
              type="button"
              className="chapter-nav__toggle"
              onClick={() => toggleCollapse(node.id)}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="chapter-nav__toggle chapter-nav__toggle--empty" />
          )}

          {isBook && (
            <span
              className="chapter-nav__swatch"
              style={{ background: node.color ?? 'transparent' }}
              aria-hidden="true"
            />
          )}

          {isBook ? (
            <button
              type="button"
              className={`chapter-nav__book${node.id === selectedBookId ? ' is-active' : ''}`}
              style={node.color ? ({ '--book-accent': node.color } as React.CSSProperties) : undefined}
              onClick={() => onSelectBook(node.id)}
            >
              {node.title || 'Untitled'}
            </button>
          ) : isChapter ? (
            <button
              type="button"
              className={`chapter-nav__chapter${node.id === selectedChapterId ? ' is-active' : ''}`}
              onClick={() => onSelectChapter(node.id)}
            >
              {node.title || 'Untitled'}
            </button>
          ) : (
            <span className={`chapter-nav__label chapter-nav__label--${node.kind}`}>
              {node.title || 'Untitled'}
            </span>
          )}

          {scrapCount > 0 && (
            <button
              type="button"
              className="chapter-nav__scrap-badge"
              title="Orphaned draft content"
              onClick={() => onScrapBadgeClick?.(node.id)}
            >
              <TrashIcon /> {scrapCount}
            </button>
          )}
        </div>
        {!collapsed && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const books = getRoots(nodes)
  const isProjectActive = !selectedBookId && !selectedChapterId

  return (
    <nav className="chapter-nav">
      <button
        type="button"
        className={`chapter-nav__project${isProjectActive ? ' is-active' : ''}`}
        onClick={onSelectProject}
      >
        Project
      </button>
      {books.map((book) => renderNode(book, 0))}
      {books.length === 0 && <p className="chapter-nav__empty">No structure yet.</p>}
      <button type="button" className="chapter-nav__add-book" onClick={onAddBook}>
        + Add book
      </button>
    </nav>
  )
}

export default ChapterNav
