import { useMemo } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { GripIcon, ListIcon, PencilIcon, PlusIcon } from '../../icons'
import { formatWords } from './wordCount'
import { buildChildIndex, descendantsOf } from './outlineTree'
import { DeleteControl } from './shared'
import { useNodeDnd } from './useNodeDnd'
import { useNodeKeys } from '../../../lib/nodeKeys'

// The book's outline as nested cards in a single column: arcs contain
// chapters, and chapters can also sit directly under the book. Cards are
// reordered and moved between arcs by dragging their grip; each has a quiet
// trash icon (with confirmation) at the bottom right.
function BookOutline({ w, book, chapterWords }: { w: WriterWorkspace; book: OutlineNode; chapterWords: Record<string, number> }) {
  const dnd = useNodeDnd(w)
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const kids = index.get(book.id) ?? []
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])

  // Keyboard shortcuts (lib/nodeKeys.ts). The book's direct arcs and chapters
  // form the top-level list; a chapter inside an arc has that arc as its parent.
  const parentNode = (id: string) => {
    const parentId = nodeById.get(id)?.parentId
    const parent = parentId ? nodeById.get(parentId) : undefined
    return parent && parent.id !== book.id ? parent : undefined
  }
  const keys = useNodeKeys({
    parentOf: id => parentNode(id)?.id ?? null,
    siblingsOf: id => (index.get(nodeById.get(id)?.parentId ?? null) ?? []).filter(n => n.kind === 'arc' || n.kind === 'chapter').map(n => n.id),
    isEmpty: id => {
      const n = nodeById.get(id)
      if (!n) return true
      return n.title.trim() === '' && (index.get(id) ?? []).length === 0 && !w.plotNodes.some(p => p.assignedMomentId === id)
    },
    createSibling: id => {
      const n = nodeById.get(id)
      return n ? w.addOutlineNode(n.parentId, n.kind, {}, id) : null
    },
    // chapter (inside an arc) -> a new arc after that arc.
    createParentSibling: id => {
      const arc = parentNode(id)
      return arc && arc.kind === 'arc' ? w.addOutlineNode(arc.parentId, 'arc', {}, arc.id) : null
    },
    canCreateParentSibling: id => parentNode(id)?.kind === 'arc',
    // arc -> a new chapter inside it (Shift+Enter); a chapter has no child here.
    createChild: id => (nodeById.get(id)?.kind === 'arc' ? w.addOutlineNode(id, 'chapter') : null),
    canCreateChild: id => nodeById.get(id)?.kind === 'arc',
    remove: id => w.deleteOutlineNode(id),
  })

  // Chapters are numbered across the whole book, in outline order.
  const chapterNumber = useMemo(
    () => new Map(w.activeBookChapters.map((c, i) => [c.id, i + 1])),
    [w.activeBookChapters],
  )
  const arcNumber = new Map(kids.filter(n => n.kind === 'arc').map((a, i) => [a.id, i + 1]))

  const grip = (id: string) => (
    <span className="wrGrip wrGrip--cover" aria-label="Drag to reorder" title="Drag to reorder" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )

  // Plain render functions (not components) so the title inputs keep focus.
  const chapterCard = (c: OutlineNode) => {
    const n = chapterNumber.get(c.id) ?? 0
    const inside = descendantsOf(index, c.id)
    const count = (kind: string) => inside.filter(x => x.kind === kind && !x.freeDraft).length
    const stat = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
    return (
      <div key={c.id} data-node={c.id} data-knode={c.id} className={dnd.cardClass('wrBookChapter wrOutlineCard', c.id)}>
        <div className="wrBookChapterTop">
          {grip(c.id)}
          <div className="wrBookChapterTitle">
            <span className="wrBookNumber">Chapter {n}</span>
            <input
              className="wrBookInput wrBookInput--chapter" value={c.title} placeholder="Chapter title" data-kf="" aria-label={`Chapter ${n} title`}
              onChange={e => w.updateOutlineNode(c.id, { title: e.target.value })}
            />
          </div>
          <span className="wrBookActions">
            <button type="button" className="wrIconBtn" title="Outline" aria-label={`Outline chapter ${n}`} onClick={() => w.openChapter(c.id, 'outline')}>
              <ListIcon size={15} />
            </button>
            <button type="button" className="wrIconBtn" title="Write" aria-label={`Write chapter ${n}`} onClick={() => w.openChapter(c.id, 'draft')}>
              <PencilIcon size={15} />
            </button>
            <DeleteControl
              tone="dark" message={`Delete Chapter ${n}${inside.length ? ' and everything in it' : ''}?`}
              onConfirm={() => w.deleteOutlineNode(c.id)}
            />
          </span>
        </div>
        <div className="wrBookChapterStats">
          <span>{stat(count('act'), 'act')}</span>
          <span>{stat(count('scene'), 'scene')}</span>
          <span>{stat(count('moment'), 'moment')}</span>
          <span>{formatWords(chapterWords[c.id] ?? 0)}</span>
        </div>
      </div>
    )
  }

  const arcCard = (a: OutlineNode) => {
    const n = arcNumber.get(a.id) ?? 0
    const chapters = index.get(a.id) ?? []
    return (
      <div key={a.id} data-node={a.id} data-knode={a.id} className={dnd.cardClass('wrBookArc wrOutlineCard', a.id)}>
        <div className="wrBookChapterTop">
          {grip(a.id)}
          <div className="wrBookChapterTitle">
            <span className="wrBookNumber">Arc {n}</span>
            <input
              className="wrBookInput wrBookInput--arc" value={a.title} placeholder="Arc title" data-kf="" aria-label={`Arc ${n} title`}
              onChange={e => w.updateOutlineNode(a.id, { title: e.target.value })}
            />
          </div>
        </div>
        {dnd.children(a.id, chapters, chapterCard)}
        <div className="wrBookArcFoot">
          <button type="button" className="wrSmallBtn" onClick={() => w.addOutlineNode(a.id, 'chapter')}>
            <PlusIcon size={13} /> Chapter
          </button>
          <DeleteControl
            tone="dark"
            message={`Delete Arc ${n}${chapters.length ? ` and its ${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}` : ''}?`}
            onConfirm={() => w.deleteOutlineNode(a.id)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="wrCoverChapters">
      <div className="wrCoverChaptersHead">
        <span>Outline</span>
        <span className="wrCoverHeadActions">
          <button type="button" className="wrSmallBtn" onClick={() => w.addOutlineNode(book.id, 'arc')}>
            <PlusIcon size={13} /> Arc
          </button>
          <button type="button" className="wrSmallBtn" onClick={() => w.addOutlineNode(book.id, 'chapter')}>
            <PlusIcon size={13} /> Chapter
          </button>
        </span>
      </div>
      {kids.length === 0 && <p className="wrCoverMuted">Nothing outlined yet. Add an arc or a chapter to begin.</p>}
      <div className="wrBookStack" onKeyDown={keys.onKeyDown}>
        {dnd.children(book.id, kids.filter(k => k.kind === 'arc' || k.kind === 'chapter'),
          k => (k.kind === 'arc' ? arcCard(k) : chapterCard(k)))}
      </div>
    </div>
  )
}

export default BookOutline
