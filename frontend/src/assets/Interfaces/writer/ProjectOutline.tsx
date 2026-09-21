import { useMemo } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { BookFaceIcon, GripIcon, PlusIcon } from '../../icons'
import { buildChildIndex, chaptersOfBook } from './outlineTree'
import { AutoTextarea, DeleteControl } from './shared'
import { useNodeDnd } from './useNodeDnd'
import { useNodeKeys } from '../../../lib/nodeKeys'
import { useWordCounts } from './useWordCounts'
import { formatWords } from './wordCount'
import { DEFAULT_BOOK_HUE, bookThemeHue, themeColorCss } from '../../../theme/bookColors'

// The project outline: its series and books as nested cards in a single column.
// A series groups books (the shelf shows each series as a labelled, darkened
// section); books outside any series sit at the top level. Cards are reordered
// and moved in and out of series by dragging their grip (drops land in the gaps
// between cards). A book's trash icon deletes it and everything inside; a
// series' trash icon deletes only the series, its books stay.
const isItem = (n: OutlineNode) => n.kind === 'series' || n.kind === 'book'

function ProjectOutline({ w }: { w: WriterWorkspace }) {
  const dnd = useNodeDnd(w)
  const counts = useWordCounts(w.activeProjectId)
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const rootItems = (index.get(null) ?? []).filter(isItem)

  // Numbered across the project, in outline order.
  const bookNumber = useMemo(() => new Map(w.books.map((b, i) => [b.id, i + 1])), [w.books])
  const seriesNumber = new Map(rootItems.filter(n => n.kind === 'series').map((s, i) => [s.id, i + 1]))

  const newBook = (parentId: string | null, afterId?: string) =>
    w.addOutlineNode(parentId, 'book', { themeHue: DEFAULT_BOOK_HUE }, afterId)

  // Keyboard shortcuts (lib/nodeKeys.ts): series and loose books form the top-level
  // list; a book inside a series has that series as its parent.
  const keys = useNodeKeys({
    parentOf: id => nodeById.get(id)?.parentId ?? null,
    siblingsOf: id => (index.get(nodeById.get(id)?.parentId ?? null) ?? []).filter(isItem).map(n => n.id),
    isEmpty: id => {
      const n = nodeById.get(id)
      if (!n) return true
      return n.title.trim() === '' && n.synopsis.trim() === '' && (index.get(id) ?? []).length === 0
    },
    createSibling: id => {
      const n = nodeById.get(id)
      if (!n) return null
      return n.kind === 'book' ? newBook(n.parentId, id) : w.addOutlineNode(n.parentId, 'series', {}, id)
    },
    // book (inside a series) -> a new series after that series.
    createParentSibling: id => {
      const parent = nodeById.get(nodeById.get(id)?.parentId ?? '')
      return parent?.kind === 'series' ? w.addOutlineNode(parent.parentId, 'series', {}, parent.id) : null
    },
    canCreateParentSibling: id => nodeById.get(nodeById.get(id)?.parentId ?? '')?.kind === 'series',
    // series -> a new book inside it (Shift+Enter); a book has no child card here.
    createChild: id => (nodeById.get(id)?.kind === 'series' ? newBook(id) : null),
    canCreateChild: id => nodeById.get(id)?.kind === 'series',
    remove: id => (nodeById.get(id)?.kind === 'series' ? w.deleteSeries(id) : w.deleteOutlineNode(id)),
  })

  const grip = (id: string) => (
    <span className="wrGrip" aria-label="Drag to reorder" title="Drag to reorder" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )

  // Plain render functions (not components) so the inputs keep focus.
  const bookCard = (book: OutlineNode) => {
    const n = bookNumber.get(book.id) ?? 0
    const chapters = chaptersOfBook(w.outlineNodes, book.id).length
    return (
      <div
        key={book.id} data-node={book.id} data-knode={book.id}
        className={dnd.cardClass('wrProjBook wrOutlineCard', book.id)}
        style={{ ['--wr-node-color' as string]: themeColorCss(bookThemeHue(book)) }}
      >
        <div className="wrProjTop">
          {grip(book.id)}
          <div className="wrProjTitle">
            <span className="wrProjNumber">Book {n}</span>
            <input
              className="wrProjInput" value={book.title} placeholder="Book title" data-kf="" aria-label={`Book ${n} title`}
              onChange={e => w.updateOutlineNode(book.id, { title: e.target.value })}
            />
          </div>
          <span className="wrProjActions">
            <button type="button" className="wrIconBtn" title="Open book" aria-label={`Open book ${n}`} onClick={() => w.openBook(book.id)}>
              <BookFaceIcon size={15} />
            </button>
            <DeleteControl
              tone="dark" message={`Delete Book ${n}${chapters ? ' and everything in it' : ''}?`}
              onConfirm={() => w.deleteOutlineNode(book.id)}
            />
          </span>
        </div>
        <div className="wrProjStats">
          <span>{chapters} {chapters === 1 ? 'chapter' : 'chapters'}</span>
          <span>{formatWords(counts.books[book.id] ?? 0)}</span>
        </div>
      </div>
    )
  }

  const seriesCard = (series: OutlineNode) => {
    const n = seriesNumber.get(series.id) ?? 0
    const books = (index.get(series.id) ?? []).filter(b => b.kind === 'book')
    return (
      <div key={series.id} data-node={series.id} data-knode={series.id} className={dnd.cardClass('wrProjSeries wrOutlineCard', series.id)}>
        <div className="wrProjTop">
          {grip(series.id)}
          <div className="wrProjTitle">
            <span className="wrProjNumber">Series {n}</span>
            <input
              className="wrProjInput wrProjInput--series" value={series.title} placeholder="Series title" data-kf="" aria-label={`Series ${n} title`}
              onChange={e => w.updateOutlineNode(series.id, { title: e.target.value })}
            />
          </div>
          <span className="wrProjActions">
            <DeleteControl
              tone="dark" message={`Delete Series ${n}?${books.length ? ' Its books stay.' : ''}`}
              onConfirm={() => w.deleteSeries(series.id)}
            />
          </span>
        </div>
        <AutoTextarea
          className="wrProjSummary" placeholder="Series summary" rows={2} value={series.synopsis} keyField
          onChange={text => w.updateOutlineNode(series.id, { synopsis: text })}
        />
        {dnd.children(series.id, books, bookCard)}
        <div className="wrProjFoot">
          <button type="button" className="wrSmallBtn" onClick={() => newBook(series.id)}><PlusIcon size={13} /> Book</button>
        </div>
      </div>
    )
  }

  return (
    <div className="wrProjectOutline">
      <div className="wrProjHead">
        <span className="wrLabel">Outline</span>
        <span className="wrProjHeadActions">
          <button type="button" className="wrSmallBtn" onClick={() => w.addOutlineNode(null, 'series')}><PlusIcon size={13} /> Series</button>
          <button type="button" className="wrSmallBtn" onClick={() => newBook(null)}><PlusIcon size={13} /> Book</button>
        </span>
      </div>
      {rootItems.length === 0 && <p className="wrMuted">No books yet. Add a book or a series to begin.</p>}
      <div className="wrProjStack" onKeyDown={keys.onKeyDown}>
        {dnd.children(null, rootItems, item => (item.kind === 'series' ? seriesCard(item) : bookCard(item)))}
      </div>
    </div>
  )
}

export default ProjectOutline
