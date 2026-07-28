import { useState } from 'react'
import type { OutlineNode } from '../../types'
import { getChildren, getRoots } from '../../lib/nodeTree'

interface Props {
  nodes: OutlineNode[]
  selectedChapterId?: string
  onSelect: (chapterId: string) => void
  /** Scrap-entry counts keyed by book/chapter node id, for small badges. */
  scrapCountsByNodeId?: Record<string, number>
  onScrapBadgeClick?: (nodeId: string) => void
}

// Book/arc/chapter navigation shared by Draft and Read mode: only chapter
// rows are selectable, book/arc rows are inert (collapsible) headers for
// context. Stops at chapter -- scenes/moments aren't part of this nav.
function ChapterNav({ nodes, selectedChapterId, onSelect, scrapCountsByNodeId = {}, onScrapBadgeClick }: Props) {
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

          {isChapter ? (
            <button
              type="button"
              className={`chapter-nav__chapter${node.id === selectedChapterId ? ' is-active' : ''}`}
              onClick={() => onSelect(node.id)}
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
              Scrap ({scrapCount})
            </button>
          )}
        </div>
        {!collapsed && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const books = getRoots(nodes)

  return (
    <nav className="chapter-nav">
      {books.map((book) => renderNode(book, 0))}
      {books.length === 0 && <p className="chapter-nav__empty">No structure yet.</p>}
    </nav>
  )
}

export default ChapterNav
