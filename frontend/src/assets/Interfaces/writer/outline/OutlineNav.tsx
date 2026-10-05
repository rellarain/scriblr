import { useMemo, type CSSProperties, type ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WordCounts } from '../../../../api/draftFetch'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { GripIcon, PlusIcon } from '../../../icons'
import { useNodeKeys } from '../../../../lib/nodeKeys'
import { buildChildIndex } from '../outlineTree'
import { DeleteControl } from '../shared'
import { useNodeDnd } from '../useNodeDnd'
import { formatWords } from '../wordCount'
import HueSlider from '../HueSlider'
import { structureOfBook } from './outlineModel'

// What the contents are narrowed to: an arc (it and its chapters, each open), one chapter, or the whole book (every
// arc and chapter, each chapter open).
export interface OutlineFocus { kind: 'book' | 'arc' | 'chapter'; id: string }

// The book's contents, on the book's cover (the Outline level): its arcs and chapters, in one column. With a
// focus (picked by the tabs at the book's edge) only that arc and its chapters, or that one chapter, show;
// with the book as the focus every chapter unfolds; without one, the whole list shows and only the open chapter unfolds. An open chapter shows its title, colour and
// trash, and under them its acts, scenes and moments. Arcs carry their own title and colour, and a chapter
// button. Arcs and chapters are reordered and moved by dragging their grips (not while focused on their own).
export function OutlineNav({ w, book, counts, chapterBody, focus = null }: {
  w: WriterWorkspace
  book: OutlineNode
  counts: WordCounts
  // What unfolds under an open chapter's row (its acts, scenes and moments).
  chapterBody?: (chapter: OutlineNode) => ReactNode
  focus?: OutlineFocus | null
}) {
  const dnd = useNodeDnd(w, {
    accepts: (dragged, parentId) => {
      const parent = parentId ? w.outlineNodes.find(n => n.id === parentId) : undefined
      if (!parent) return false
      return parent.kind === 'book' ? dragged.kind === 'arc' || dragged.kind === 'chapter' : parent.kind === 'arc' && dragged.kind === 'chapter'
    },
  })
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const { numbers } = useMemo(() => structureOfBook(index, book.id), [index, book.id])
  const words = (id: string) => counts.nodes[id] ?? 0
  const childrenOf = (node: OutlineNode) => (index.get(node.id) ?? []).filter(k => k.kind === 'arc' || k.kind === 'chapter')

  // The new chapter becomes the open one.
  const addChapter = (parentId: string, afterId?: string) => {
    const id = w.addOutlineNode(parentId, 'chapter', {}, afterId)
    w.selectChapter(id)
    return id
  }

  // Keyboard shortcuts (lib/nodeKeys.ts): the book's own arcs and chapters are the top level.
  const keys = useNodeKeys({
    parentOf: id => { const p = nodeById.get(nodeById.get(id)?.parentId ?? ''); return p && p.id !== book.id ? p.id : null },
    siblingsOf: id => childrenOf(nodeById.get(nodeById.get(id)?.parentId ?? '') ?? book).map(n => n.id),
    isEmpty: id => {
      const n = nodeById.get(id)
      return !n || (n.title.trim() === '' && n.synopsis.trim() === '' && (index.get(id) ?? []).length === 0)
    },
    createSibling: id => {
      const n = nodeById.get(id)
      if (!n) return null
      return n.kind === 'chapter' ? addChapter(n.parentId ?? book.id, id) : w.addOutlineNode(n.parentId, 'arc', {}, id)
    },
    // chapter (in an arc) -> a new arc after that arc.
    createParentSibling: id => {
      const parent = nodeById.get(nodeById.get(id)?.parentId ?? '')
      return parent && parent.kind === 'arc' ? w.addOutlineNode(parent.parentId, 'arc', {}, parent.id) : null
    },
    canCreateParentSibling: id => nodeById.get(nodeById.get(id)?.parentId ?? '')?.kind === 'arc',
    createChild: id => (nodeById.get(id)?.kind === 'arc' ? addChapter(id) : null),
    canCreateChild: id => nodeById.get(id)?.kind === 'arc',
    remove: id => w.deleteOutlineNode(id),
  })

  const tint = (node: OutlineNode) => ({ '--wr-node-tint': w.levelTintOf(node) } as CSSProperties)
  const grip = (id: string) => id === focus?.id ? null : (
    <span className="wrGrip wrGrip--light" aria-label="Drag to reorder" title="Drag to reorder" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )
  const hue = (node: OutlineNode, label: string) => (
    <HueSlider
      label={`${label} colour`} className="wrNodeHue wrNodeHue--inline" hue={w.levelHueOf(node)} centre={w.hueCentreOf(node)}
      onChange={next => w.setNodeHue(node.id, next)}
    />
  )
  const stat = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

  function renderNode(node: OutlineNode): ReactNode {
    const common = { 'data-node': node.id, 'data-knode': node.id }

    if (node.kind === 'chapter') {
      const n = numbers.chapter.get(node.id) ?? 0
      // The open chapters: the focused arc's all, the focused chapter, else the one open chapter.
      const active = focus
        ? focus.kind === 'book' || (focus.kind === 'chapter' ? node.id === focus.id : node.parentId === focus.id)
        : node.id === w.activeChapterId
      const inside = (index.get(node.id) ?? []).length
      return (
        <div key={node.id} {...common} className={dnd.cardClass(`wrCtChapter${active ? ' wrCtChapter--active' : ''}`, node.id)} style={tint(node)}>
          <div className="wrCtRow">
            {grip(node.id)}
            <button type="button" className="wrCtPick" aria-current={active ? 'true' : undefined} aria-label={`Open chapter ${n}`} title={node.title.trim() || 'Untitled chapter'} onClick={() => w.selectChapter(node.id)}>
              <span className="wrCtNum">{n}</span>
              <span className="wrCtTitle">{node.title.trim() || 'Untitled chapter'}</span>
              <span className="wrCtWords">{formatWords(words(node.id))}</span>
            </button>
          </div>
          {active && (
            <div className="wrCtDetail">
              <div className="wrCtDetailRow">
                <input
                  className="wrOutlineInput wrOutlineInput--title" placeholder="Chapter title" value={node.title} data-kf="" aria-label={`Chapter ${n} title`}
                  onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
                />
              </div>
              {hue(node, `Chapter ${n}`)}
              <div className="wrCtDetailRow">
                <span className="wrWordCount">{stat((index.get(node.id) ?? []).filter(k => k.kind === 'act').length, 'act')} · {formatWords(words(node.id))}</span>
                <DeleteControl message={`Delete Chapter ${n}${inside ? ' and everything in it' : ''}?`} onConfirm={() => w.deleteOutlineNode(node.id)} />
              </div>
            </div>
          )}
          {active && chapterBody && (
            // Its own keys (the cards'), not the contents'.
            <div className="wrCtBody" onKeyDown={e => e.stopPropagation()}>{chapterBody(node)}</div>
          )}
        </div>
      )
    }

    if (node.kind === 'arc') {
      const n = numbers.arc.get(node.id) ?? 0
      const kids = childrenOf(node)
      return (
        <div key={node.id} {...common} className={dnd.cardClass('wrCtArc', node.id)} style={tint(node)}>
          <div className="wrCtRow wrCtArcHead">
            {grip(node.id)}
            <span className="wrNodeLabel">Arc {n}</span>
            <input
              className="wrOutlineInput wrOutlineInput--title" placeholder="Arc title" value={node.title} data-kf="" aria-label={`Arc ${n} title`}
              onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
            />
          </div>
          {hue(node, `Arc ${n}`)}
          {dnd.children(node.id, kids, renderNode)}
          <div className="wrCtArcFoot">
            <button type="button" className="wrSmallBtn" onClick={() => addChapter(node.id)}><PlusIcon size={13} /> Chapter</button>
            <span className="wrWordCount">{stat(kids.length, 'chapter')} · {formatWords(words(node.id))}</span>
            <DeleteControl
              message={`Delete Arc ${n}${kids.length ? ` and its ${kids.length} ${kids.length === 1 ? 'chapter' : 'chapters'}` : ''}?`}
              onConfirm={() => w.deleteOutlineNode(node.id)}
            />
          </div>
        </div>
      )
    }
    return null
  }

  const focused = focus && focus.kind !== 'book' ? nodeById.get(focus.id) : undefined
  const top = childrenOf(book)
  return (
    <nav className="wrOutlineNav" aria-label="Arcs and chapters contents" onKeyDown={keys.onKeyDown}>
      <div className="wrCtHead">
        <span>Contents</span>
        <span className="wrCtAdd">
          <button type="button" className="wrSmallBtn" onClick={() => w.addOutlineNode(book.id, 'arc')}><PlusIcon size={13} /> Arc</button>
          <button type="button" className="wrSmallBtn" onClick={() => addChapter(book.id)}><PlusIcon size={13} /> Chapter</button>
        </span>
      </div>
      {!focused && top.length === 0 && <p className="wrMuted">Nothing outlined yet. Add an arc or a chapter to begin.</p>}
      {/* The focused arc or chapter alone, without drop zones (it has no siblings to move among). */}
      {focused ? renderNode(focused) : dnd.children(book.id, top, renderNode)}
    </nav>
  )
}

export default OutlineNav
