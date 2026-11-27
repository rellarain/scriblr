import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { BookFaceIcon, ChevronDownIcon, ChevronRightIcon, GripIcon, PencilIcon, PlusIcon, StampIcon } from '../../icons'
import type { OutlineTemplate } from '../../../lib/outlineTemplates'
import { FromTemplate, SaveTemplate } from './outline/OutlineTemplates'
import { buildChildIndex, chaptersOfBook } from './outlineTree'
import { AutoTextarea, DeleteControl } from './shared'
import { useNodeDnd } from './useNodeDnd'
import { useNodeKeys } from '../../../lib/nodeKeys'
import { useWordCounts } from './useWordCounts'
import { formatWords } from './wordCount'
import { outlineSat, stripeColorCss } from '../../../theme/bookColors'
import { useStoredState } from './storage'
import HueSlider from './HueSlider'
import GoalField from './outline/GoalField'
import { stat, structureOfBook, type BookStructure } from './outline/outlineModel'

// The project outline (the Project level's Outline tab at Max): its series, books, arcs and chapters as nested cards in one column. A series
// holds books, a book its arcs and the chapters outside any arc, an arc its chapters; books outside any series sit at the top. Every card
// edits its title, its summary and its colour (a series is tinted in its own; each card has a stripe of its colour at its left edge); a book
// also its goals, and a chapter has the Write pencil that opens it in the Draft. Books and arcs fold up (remembered per card: a book starts
// folded, an arc open). Cards are reordered and moved by dragging their grip (drops land in the gaps between cards: a book into or out of a
// series, an arc into another book, a chapter into another arc or book). Acts, scenes and moments stay on the book's own Outline.
// A series' trash deletes only the series (its books stay); every other card's trash deletes it and everything inside it.
type Kind = OutlineNode['kind']
// What a list of cards holds under each parent: the top level (null) its series and loose books.
const LISTED: Record<string, Kind[]> = { root: ['series', 'book'], series: ['book'], book: ['arc', 'chapter'], arc: ['chapter'] }
const listedUnder = (parent: OutlineNode | undefined): Kind[] => LISTED[parent ? parent.kind : 'root'] ?? []
// Where an arc or chapter stands: its book's numbering and the book's name ("Book 2").
interface Place { structure: BookStructure | undefined; book: string }

// Folded cards are remembered per node; a book with no entry starts folded, an arc open.
function useProjectOutlineOpen() {
  const [openMap, setOpenMap] = useStoredState<Record<string, boolean>>('scriblr.writer.projectOutlineOpen', {})
  return {
    isOpen: (node: OutlineNode): boolean => openMap[node.id] ?? node.kind !== 'book',
    setOpen: (id: string, open: boolean) => setOpenMap(prev => ({ ...prev, [id]: open })),
  }
}

function ProjectOutline({ w }: { w: WriterWorkspace }) {
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const dnd = useNodeDnd(w, {
    accepts: (dragged, parentId) => listedUnder(parentId ? nodeById.get(parentId) : undefined).includes(dragged.kind),
  })
  const counts = useWordCounts(w.activeProjectId)
  const fold = useProjectOutlineOpen()
  // The book whose shape is being saved as a template (its card shows the save panel).
  const [saving, setSaving] = useState<string | null>(null)
  const kidsOf = (parent: OutlineNode | undefined) => (index.get(parent ? parent.id : null) ?? []).filter(n => listedUnder(parent).includes(n.kind))
  const rootItems = kidsOf(undefined)

  // Series and books are numbered across the project; arcs and chapters across their book.
  const bookNumber = useMemo(() => new Map(w.books.map((b, i) => [b.id, i + 1])), [w.books])
  const seriesNumber = new Map(rootItems.filter(n => n.kind === 'series').map((s, i) => [s.id, i + 1]))
  const structures = useMemo(() => new Map(w.books.map(b => [b.id, structureOfBook(index, b.id)])), [w.books, index])
  const bookOf = (node: OutlineNode): OutlineNode | undefined => {
    let n: OutlineNode | undefined = node
    for (let guard = 0; n && n.kind !== 'book' && guard < 8; guard += 1) n = n.parentId ? nodeById.get(n.parentId) : undefined
    return n?.kind === 'book' ? n : undefined
  }

  // A new node goes where it belongs; one added inside a folded book or arc unfolds it, so the new card is on view.
  const add = (parentId: string | null, kind: Kind, afterId?: string) => {
    if (parentId) fold.setOpen(parentId, true)
    return w.addOutlineNode(parentId, kind, {}, afterId)
  }
  // A new book from a template goes last in its series (or at the top level) and opens, so its shape is on view.
  const addFromTemplate = (parentId: string | null, template: OutlineTemplate) => {
    if (parentId) fold.setOpen(parentId, true)
    const id = w.addFromTemplate(parentId, template)
    fold.setOpen(id, true)
    return id
  }

  // Keyboard shortcuts (lib/nodeKeys.ts): series and loose books form the top-level list, then each card's own list under it.
  const parentOf = (id: string) => { const p = nodeById.get(id)?.parentId; return p ? nodeById.get(p) : undefined }
  // Ctrl+Enter: a new sibling of the parent (a book in a series -> a series after it; an arc or a loose chapter -> a book after its book; a
  // chapter in an arc -> an arc after it).
  const parentSibling = (id: string): { parent: OutlineNode; kind: Kind } | null => {
    const parent = parentOf(id)
    return parent && parent.kind !== 'chapter' ? { parent, kind: parent.kind } : null
  }
  const keys = useNodeKeys({
    parentOf: id => parentOf(id)?.id ?? null,
    siblingsOf: id => kidsOf(parentOf(id)).map(n => n.id),
    isEmpty: id => {
      const n = nodeById.get(id)
      return !n || (n.title.trim() === '' && n.synopsis.trim() === '' && (index.get(id) ?? []).length === 0)
    },
    createSibling: id => {
      const n = nodeById.get(id)
      return n ? add(n.parentId, n.kind, id) : null
    },
    createParentSibling: id => {
      const up = parentSibling(id)
      return up ? add(up.parent.parentId, up.kind, up.parent.id) : null
    },
    canCreateParentSibling: id => parentSibling(id) !== null,
    // A series takes a new book (Shift+Enter), a book a new chapter, an arc a new chapter; a chapter has no child card here.
    createChild: id => {
      const n = nodeById.get(id)
      if (!n || n.kind === 'chapter') return null
      return add(id, n.kind === 'series' ? 'book' : 'chapter')
    },
    canCreateChild: id => { const kind = nodeById.get(id)?.kind; return kind === 'series' || kind === 'book' || kind === 'arc' },
    remove: id => (nodeById.get(id)?.kind === 'series' ? w.deleteSeries(id) : w.deleteOutlineNode(id)),
  })

  // The card's colour: a stripe at its left edge (in its tier), and a series' tint behind it all.
  const colours = (node: OutlineNode) => ({
    '--wr-node-color': stripeColorCss(w.levelHueOf(node), outlineSat(node.kind)),
    ...(node.kind === 'series' ? { '--wr-node-tint': w.levelTintOf(node) } : {}),
  } as CSSProperties)
  const grip = (id: string) => (
    <span className="wrGrip" aria-label="Drag to reorder" title="Drag to reorder" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )
  const foldButton = (node: OutlineNode, name: string, open: boolean) => (
    <button
      type="button" className="wrIconBtn" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
      title={`${open ? 'Collapse' : 'Expand'} the ${node.kind}`} onClick={() => fold.setOpen(node.id, !open)}
    >
      {open ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}
    </button>
  )
  const addButton = (parentId: string, kind: Kind, label: string) => (
    <button type="button" className="wrSmallBtn" onClick={() => add(parentId, kind)}><PlusIcon size={13} /> {label}</button>
  )
  const hue = (node: OutlineNode, name: string) => <HueSlider label={`${name} colour`} className="wrNodeHue wrProjHue" {...w.hueSliderOf(node)} />
  const summary = (node: OutlineNode, name: string, placeholder: string) => (
    <AutoTextarea
      className="wrProjSummary" placeholder={placeholder} aria-label={`${name} summary`} rows={1} value={node.synopsis} keyField
      onChange={text => w.updateOutlineNode(node.id, { synopsis: text })}
    />
  )
  const stats = (items: string[]) => <div className="wrProjStats">{items.map(item => <span key={item}>{item}</span>)}</div>

  // One card's frame: its top (the number over the title, between the grip and its tools) and what follows. `name` is what the card shows
  // ("Chapter 1"), `label` what its controls are called (an arc's and a chapter's name their book: "Book 2, Chapter 1", as every book has a
  // Chapter 1). Plain render functions, not components, so the inputs keep focus.
  function frame(node: OutlineNode, name: string, label: string, placeholder: string, tools: ReactNode, body: ReactNode) {
    return (
      <div key={node.id} data-node={node.id} data-knode={node.id} className={dnd.cardClass(`wrProjCard wrProj${node.kind[0].toUpperCase()}${node.kind.slice(1)} wrOutlineCard`, node.id)} style={colours(node)}>
        <div className="wrProjTop">
          {grip(node.id)}
          <div className="wrProjTitle">
            <span className="wrProjNumber">{name}</span>
            <input
              className={node.kind === 'series' ? 'wrProjInput wrProjInput--series' : 'wrProjInput'} value={node.title} placeholder={placeholder} data-kf=""
              aria-label={`${label} title`} onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
            />
          </div>
          <span className="wrProjActions">{tools}</span>
        </div>
        {body}
      </div>
    )
  }

  function chapterCard(chapter: OutlineNode, { structure, book }: Place) {
    const n = structure?.numbers.chapter.get(chapter.id) ?? 0
    const name = `Chapter ${n}`
    const label = `${book}, ${name}`
    const totals = structure?.totalsOfChapter.get(chapter.id) ?? { act: 0, scene: 0, moment: 0 }
    const inside = (index.get(chapter.id) ?? []).length
    return frame(chapter, name, label, 'Chapter title', (
      <>
        <button type="button" className="wrIconBtn" title="Write" aria-label={`Write ${book.toLowerCase()}, chapter ${n}`} onClick={() => w.openChapter(chapter.id)}>
          <PencilIcon size={15} />
        </button>
        <DeleteControl tone="dark" message={`Delete ${name}${inside ? ' and everything in it' : ''}?`} onConfirm={() => w.deleteOutlineNode(chapter.id)} />
      </>
    ), (
      <>
        {summary(chapter, label, 'Chapter summary')}
        <div className="wrProjFoot wrProjFoot--tools">
          {hue(chapter, label)}
          {stats([stat(totals.act, 'act'), stat(totals.scene, 'scene'), stat(totals.moment, 'moment'), formatWords(counts.nodes[chapter.id] ?? 0)])}
        </div>
      </>
    ))
  }

  function arcCard(arc: OutlineNode, place: Place) {
    const n = place.structure?.numbers.arc.get(arc.id) ?? 0
    const name = `Arc ${n}`
    const label = `${place.book}, ${name}`
    const chapters = kidsOf(arc)
    const open = fold.isOpen(arc)
    return frame(arc, name, label, 'Arc title', (
      <>
        {foldButton(arc, `${place.book.toLowerCase()}, arc ${n}`, open)}
        <DeleteControl
          tone="dark" message={`Delete ${name}${chapters.length ? ` and its ${stat(chapters.length, 'chapter')}` : ''}?`}
          onConfirm={() => w.deleteOutlineNode(arc.id)}
        />
      </>
    ), (
      <>
        {stats([stat(chapters.length, 'chapter'), formatWords(counts.nodes[arc.id] ?? 0)])}
        {open && (
          <>
            {summary(arc, label, 'Arc summary')}
            {hue(arc, label)}
            {dnd.children(arc.id, chapters, c => chapterCard(c, place))}
            <div className="wrProjFoot">{addButton(arc.id, 'chapter', 'Chapter')}</div>
          </>
        )}
      </>
    ))
  }

  function bookCard(book: OutlineNode) {
    const n = bookNumber.get(book.id) ?? 0
    const name = `Book ${n}`
    const place: Place = { structure: structures.get(book.id), book: name }
    const chapters = chaptersOfBook(w.outlineNodes, book.id).length
    const words = counts.books[book.id] ?? 0
    const open = fold.isOpen(book)
    return frame(book, name, name, 'Book title', (
      <>
        <button type="button" className="wrIconBtn" title="Open book" aria-label={`Open book ${n}`} onClick={() => w.openBook(book.id)}>
          <BookFaceIcon size={15} />
        </button>
        {foldButton(book, `book ${n}`, open)}
        <button
          type="button" className="wrIconBtn" title="Save as a template" aria-label={`Save book ${n} as a template`} aria-expanded={saving === book.id}
          onClick={() => setSaving(s => (s === book.id ? null : book.id))}
        >
          <StampIcon size={15} />
        </button>
        <DeleteControl tone="dark" message={`Delete ${name}${chapters ? ' and everything in it' : ''}?`} onConfirm={() => w.deleteOutlineNode(book.id)} />
      </>
    ), (
      <>
        {saving === book.id && <SaveTemplate w={w} rootId={book.id} kind="book" label={name} onClose={() => setSaving(null)} />}
        {stats([stat(chapters, 'chapter'), formatWords(words)])}
        {open && (
          <>
            {summary(book, name, 'Book summary')}
            {hue(book, name)}
            <div className="wrProjGoals">
              <GoalField label="Chapter target" current={chapters} goal={book.chapterCountTarget} onChange={v => w.updateOutlineNode(book.id, { chapterCountTarget: v })} />
              <GoalField label="Word goal" current={words} goal={book.wordCountGoal} onChange={v => w.updateOutlineNode(book.id, { wordCountGoal: v })} />
            </div>
            {dnd.children(book.id, kidsOf(book), k => (k.kind === 'arc' ? arcCard(k, place) : chapterCard(k, place)))}
            <div className="wrProjFoot">{addButton(book.id, 'arc', 'Arc')}{addButton(book.id, 'chapter', 'Chapter')}</div>
          </>
        )}
      </>
    ))
  }

  function seriesCard(series: OutlineNode) {
    const n = seriesNumber.get(series.id) ?? 0
    const name = `Series ${n}`
    const books = kidsOf(series)
    return frame(series, name, name, 'Series title', (
      <DeleteControl tone="dark" message={`Delete ${name}?${books.length ? ' Its books stay.' : ''}`} onConfirm={() => w.deleteSeries(series.id)} />
    ), (
      <>
        {summary(series, name, 'Series summary')}
        {hue(series, name)}
        {dnd.children(series.id, books, bookCard)}
        <div className="wrProjFoot">
          {addButton(series.id, 'book', 'Book')}
          <FromTemplate kind="book" onPick={t => addFromTemplate(series.id, t)} onEmpty={() => add(series.id, 'book')} />
        </div>
      </>
    ))
  }

  // A chapter or arc of a book is rendered inside its book's card; a card found on its own (never, in a well-formed tree) is numbered by its book.
  const render = (node: OutlineNode): ReactNode => {
    if (node.kind === 'series') return seriesCard(node)
    if (node.kind === 'book') return bookCard(node)
    const book = bookOf(node)
    const place: Place = { structure: book && structures.get(book.id), book: book ? `Book ${bookNumber.get(book.id) ?? 0}` : 'Book' }
    return node.kind === 'arc' ? arcCard(node, place) : chapterCard(node, place)
  }

  return (
    <div className="wrProjectOutline">
      <div className="wrProjHead">
        <span className="wrLabel">Outline</span>
        <span className="wrProjHeadActions">
          <button type="button" className="wrSmallBtn" onClick={() => add(null, 'series')}><PlusIcon size={13} /> Series</button>
          <button type="button" className="wrSmallBtn" onClick={() => add(null, 'book')}><PlusIcon size={13} /> Book</button>
          <FromTemplate kind="book" onPick={t => addFromTemplate(null, t)} onEmpty={() => add(null, 'book')} />
        </span>
      </div>
      {rootItems.length === 0 && <p className="wrMuted">No books yet. Add a book or a series to begin.</p>}
      <div className="wrProjStack" onKeyDown={keys.onKeyDown}>
        {dnd.children(null, rootItems, render)}
      </div>
    </div>
  )
}

export default ProjectOutline
