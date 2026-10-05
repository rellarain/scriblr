import { useMemo, type CSSProperties } from 'react'
import type { OutlineNode } from '../../../api/types'
import { PlusIcon } from '../../icons'
import { bookThemeHue, fillColorCss } from '../../../theme/bookColors'
import { buildChildIndex } from './outlineTree'
import { nodeLabel } from './plotTree'
import type { WriterWorkspace } from './useWriterWorkspace'

// How many page edges show behind the tabs (more with more arcs): each arc group's tabs jut out of one of them in turn, the first from the second edge.
const MIN_LEAVES = 10
// How far each page edge steps out from the one before (px; the stylesheet's .wrEdgeLeaves uses the same).
const LEAF_STEP = 4

interface Cluster { arc: OutlineNode | null; chapters: OutlineNode[] }

// The open book's arcs and chapters, grouped as the tabs are: a cluster per arc, and the
// chapters that sit straight under the book together in one without an arc.
export function tabClusters(nodes: OutlineNode[], bookId: string): Cluster[] {
  const index = buildChildIndex(nodes)
  const clusters: Cluster[] = []
  for (const child of index.get(bookId) ?? []) {
    if (child.kind === 'arc') {
      clusters.push({ arc: child, chapters: (index.get(child.id) ?? []).filter(n => n.kind === 'chapter') })
    } else if (child.kind === 'chapter') {
      const last = clusters[clusters.length - 1]
      if (last && last.arc === null) last.chapters.push(child)
      else clusters.push({ arc: null, chapters: [child] })
    }
  }
  return clusters
}

// The tabs on the right edge of the Outline and Draft pages while a book is open: one
// cluster per arc, a tab for the arc and one for each of its chapters (their text runs
// vertically, as on a real tabbed book), the arc's and chapters' own colours the accents.
// Behind the page the edges of the pages beneath show, full height; each arc's cluster juts out
// of a different one of them. The open chapter's tab is raised. Clicking a tab jumps there.
export function EdgeTabs({ w, activeChapterId, onChapter, onArc, onAddChapter }: {
  w: WriterWorkspace
  activeChapterId: string | null
  onChapter: (chapterId: string) => void
  onArc: (arcId: string) => void
  onAddChapter?: () => void
}) {
  const book = w.activeBook
  const clusters = useMemo(() => (book ? tabClusters(w.outlineNodes, book.id) : []), [w.outlineNodes, book])
  if (!book) return null
  const numberOf = new Map(w.activeBookChapters.map((c, i) => [c.id, i + 1]))
  const tint = (node: OutlineNode) => ({ '--wr-tab-tint': w.levelTintOf(node) } as CSSProperties)
  let arcNumber = 0
  const leaves = Math.max(MIN_LEAVES, clusters.length)
  // The rail is the stack of page edges and 15px beyond it (wider only if the last group's tabs need it).
  const furthest = Math.min(leaves, clusters.length + 1)
  const railWidth = Math.max(leaves * LEAF_STEP + 4 + 15, furthest * LEAF_STEP + 4 + 38)

  return (
    <div className="wrEdgeRail" style={{ '--leaves': leaves, '--rail-w': `${railWidth}px`, '--wr-cover': fillColorCss(bookThemeHue(book)) } as CSSProperties}>
      {/* The pages behind the open one, their edges stepping out behind the tabs. */}
      <div className="wrEdgeLeaves" aria-hidden="true">
        {Array.from({ length: leaves }, (_, i) => <i key={i} style={{ '--leaf': i + 1 } as CSSProperties} />)}
      </div>
      <nav className="wrEdgeTabs" aria-label="Arcs and chapters">
        {clusters.map((cluster, clusterIndex) => {
          const arc = cluster.arc
          const n = arc ? ++arcNumber : 0
          return (
            <div key={arc?.id ?? cluster.chapters[0]?.id} className="wrEdgeCluster" style={{ '--leaf': (clusterIndex % (leaves - 1)) + 2 } as CSSProperties}>
              {arc && (
                <button
                  type="button" className="wrEdgeArc" style={tint(arc)}
                  aria-label={`Arc ${n}: ${nodeLabel(arc)}`} title={`Arc ${n} · ${nodeLabel(arc)}`} onClick={() => onArc(arc.id)}
                >
                  A{n}
                </button>
              )}
              {cluster.chapters.map(c => (
                <button
                  key={c.id} type="button" style={tint(c)}
                  className={c.id === activeChapterId ? 'wrEdgeTab wrEdgeTab--active' : 'wrEdgeTab'}
                  aria-label={`Chapter ${numberOf.get(c.id)}: ${nodeLabel(c)}`} title={`${numberOf.get(c.id)} · ${nodeLabel(c)}`}
                  aria-pressed={c.id === activeChapterId} onClick={() => onChapter(c.id)}
                >
                  {numberOf.get(c.id)}
                </button>
              ))}
            </div>
          )
        })}
        {onAddChapter && (
          <button type="button" className="wrEdgeTab wrEdgeTab--add" aria-label="Add chapter" title="Add chapter" onClick={onAddChapter}>
            <PlusIcon size={15} />
          </button>
        )}
      </nav>
    </div>
  )
}

export default EdgeTabs
