import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WordCounts } from '../../../../api/draftFetch'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { outlineSat, rangeOf, stripeColorCss } from '../../../../theme/bookColors'
import { GripIcon, PlusIcon } from '../../../icons'
import { useNodeKeys } from '../../../../lib/nodeKeys'
import { buildChildIndex } from '../outlineTree'
import { DeleteControl } from '../shared'
import { useNodeDnd } from '../useNodeDnd'
import { useOutlineOpen } from './useOutlineOpen'
import { formatWords } from '../wordCount'
import HueSlider from '../HueSlider'
import { CardHeader, StatsLine } from './CardHeader'
import { dropPlotpoint, type PlotDrag } from './OutlineCards'
import { pointsByTarget } from '../plotPlacement'
import { stat, structureOfBook } from './outlineModel'

// What the contents are narrowed to: an arc (it and its chapters, each open), one chapter, or the whole book (every
// arc and chapter, each chapter open).
export interface OutlineFocus { kind: 'book' | 'arc' | 'chapter'; id: string }

// The book's contents, on the book's cover (the Outline level): its arcs and chapters, in one column, each one card. A card has one header
// (a grip, the number, the title, and the tools: a Write pencil on a chapter, a fold chevron on both) over a line of its counts. With a focus
// (picked by the tabs at the book's edge) only that arc and its chapters, or that one chapter, show; with the book as the focus every
// chapter is open; without one, the whole list shows and only the open chapter is. An open chapter edits its title in its header and
// unfolds its acts, scenes and moments (the cards of `chapterBody`) with a footer holding + Act, its colour and its trash; a chapter that
// is not open is a compact card, which a click opens (and a plotpoint can be dropped on). An arc edits its title in its header, folds
// its chapters up, and has a footer with + Chapter, its colour and its trash. Arcs and chapters are reordered and moved by dragging their
// grips (not while focused on their own).
//
// Adding an arc or chapter (the keys, the buttons) never moves the focus or makes the new one the open chapter: `onAdded` tells the level
// to show the whole book, so the new card is on view, and only the page tabs focus an arc or chapter.
export function OutlineNav({ w, book, counts, chapterBody, focus = null, plotDrag, onAdded }: {
  w: WriterWorkspace
  book: OutlineNode
  counts: WordCounts
  // What unfolds under an open chapter's header (its acts, scenes and moments).
  chapterBody?: (chapter: OutlineNode) => ReactNode
  focus?: OutlineFocus | null
  // A plotpoint being dragged onto a chapter's card.
  plotDrag?: PlotDrag
  // An arc or chapter was added to the contents.
  onAdded?: () => void
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
  const { numbers, totalsOfChapter } = useMemo(() => structureOfBook(index, book.id), [index, book.id])
  const pointsByNode = useMemo(() => pointsByTarget(w.plotNodes), [w.plotNodes])
  const [plotOverId, setPlotOverId] = useState<string | null>(null)
  const fold = useOutlineOpen()
  const words = (id: string) => counts.nodes[id] ?? 0
  const childrenOf = (node: OutlineNode) => (index.get(node.id) ?? []).filter(k => k.kind === 'arc' || k.kind === 'chapter')

  // A new chapter or arc is added where it goes and nothing is focused (or opened) for it.
  const addChapter = (parentId: string, afterId?: string) => {
    const id = w.addOutlineNode(parentId, 'chapter', {}, afterId)
    onAdded?.()
    return id
  }
  const addArc = (parentId: string | null, afterId?: string) => {
    const id = w.addOutlineNode(parentId, 'arc', {}, afterId)
    onAdded?.()
    return id
  }
  // A new act unfolds the chapter it goes in.
  const addAct = (chapterId: string) => {
    fold.setOpen(chapterId, true)
    return w.addOutlineNode(chapterId, 'act')
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
      return n.kind === 'chapter' ? addChapter(n.parentId ?? book.id, id) : addArc(n.parentId, id)
    },
    // chapter (in an arc) -> a new arc after that arc.
    createParentSibling: id => {
      const parent = nodeById.get(nodeById.get(id)?.parentId ?? '')
      return parent && parent.kind === 'arc' ? addArc(parent.parentId, parent.id) : null
    },
    canCreateParentSibling: id => nodeById.get(nodeById.get(id)?.parentId ?? '')?.kind === 'arc',
    createChild: id => (nodeById.get(id)?.kind === 'arc' ? addChapter(id) : null),
    canCreateChild: id => nodeById.get(id)?.kind === 'arc',
    remove: id => w.deleteOutlineNode(id),
  })

  // The stripe on a card is the level's accent colour lifted brighter than its tint, 7px wide.
  const tint = (node: OutlineNode) => ({ '--wr-node-tint': w.levelTintOf(node), '--wr-node-accent': stripeColorCss(w.levelHueOf(node), outlineSat(node.kind)) } as CSSProperties)
  const grip = (id: string) => id === focus?.id ? null : (
    <span className="wrGrip wrGrip--light" aria-label="Drag to reorder" title="Drag to reorder" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )
  const hue = (node: OutlineNode, label: string) => (
    <HueSlider
      label={`${label} colour`} className="wrNodeHue wrNodeHue--inline" hue={w.levelHueOf(node)} centre={w.hueCentreOf(node)} range={rangeOf(node.kind)}
      onChange={next => w.setNodeHue(node.id, next)}
    />
  )

  // While a plotpoint is being dragged, a chapter's card takes it (places it on the chapter), open or not; a card inside it
  // (an act, a scene, a moment) takes it for itself.
  const plotDrop = (node: OutlineNode) => {
    if (!plotDrag?.dragId) return {}
    return {
      onDragOver: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (plotOverId !== node.id) setPlotOverId(node.id) },
      onDragLeave: () => setPlotOverId(prev => (prev === node.id ? null : prev)),
      onDrop: (e: DragEvent) => {
        e.preventDefault(); e.stopPropagation()
        dropPlotpoint(w, plotDrag, node.id)
        plotDrag.setDragId(null)
        setPlotOverId(null)
      },
    }
  }

  function renderNode(node: OutlineNode): ReactNode {
    const common = { 'data-node': node.id, 'data-knode': node.id }

    if (node.kind === 'chapter') {
      const n = numbers.chapter.get(node.id) ?? 0
      // The open chapters: the focused arc's all, the focused chapter, else the one open chapter.
      const active = focus
        ? focus.kind === 'book' || (focus.kind === 'chapter' ? node.id === focus.id : node.parentId === focus.id)
        : node.id === w.activeChapterId
      // An open chapter can be folded up to its header (remembered per chapter); one that is not open shows only its header.
      const open = active && fold.isOpen(node.id)
      const body = open && chapterBody ? chapterBody(node) : null
      const totals = totalsOfChapter.get(node.id) ?? { act: 0, scene: 0, moment: 0 }
      const placed = pointsByNode.get(node.id)?.length ?? 0
      const inside = (index.get(node.id) ?? []).length
      const select = () => w.selectChapter(node.id)
      return (
        <div
          key={node.id} {...common} aria-current={active ? 'true' : undefined} style={tint(node)} {...plotDrop(node)}
          className={dnd.cardClass(`wrChapterCard wrOutlineCard${active ? ' wrChapterCard--active' : ''}${plotOverId === node.id ? ' wrOutlineCard--plotOver' : ''}`, node.id)}
          // Anywhere on a card that is not open opens it (its buttons and inputs do their own).
          onClick={active ? undefined : e => { if (!(e.target as HTMLElement).closest('button, input, .wrGrip')) select() }}
        >
          <CardHeader
            grip={grip(node.id)} number={n} title={node.title} label={`Chapter ${n} title`} placeholder="Chapter title"
            onTitle={title => w.updateOutlineNode(node.id, { title })}
            pick={active ? undefined : { label: `Open chapter ${n}`, untitled: 'Untitled chapter', onClick: select }}
            write={{ label: `Write chapter ${n}`, onClick: () => w.openChapter(node.id) }}
            toggle={{ kind: 'chapter', open, onClick: active ? () => fold.setOpen(node.id, !open) : select }}
          />
          <StatsLine
            items={[
              stat(totals.act, 'act'), stat(totals.scene, 'scene'), stat(totals.moment, 'moment'),
              // The plotpoints placed on the chapter are boxed in it while it shows its contents, and counted here when it does not.
              ...(!body && placed > 0 ? [stat(placed, 'plotpoint')] : []),
              formatWords(words(node.id)),
            ]}
          />
          {/* Its own keys (the cards'), not the contents'. */}
          {body && <div className="wrCardBody" onKeyDown={e => e.stopPropagation()}>{body}</div>}
          {open && (
            <div className="wrCardFoot wrCardFoot--tools">
              <span className="wrCardFootLeft">
                {body && <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => addAct(node.id)}><PlusIcon size={13} /> Act</button>}
                {hue(node, `Chapter ${n}`)}
              </span>
              <DeleteControl message={`Delete Chapter ${n}${inside ? ' and everything in it' : ''}?`} onConfirm={() => w.deleteOutlineNode(node.id)} />
            </div>
          )}
        </div>
      )
    }

    if (node.kind === 'arc') {
      const n = numbers.arc.get(node.id) ?? 0
      const kids = childrenOf(node)
      // An arc folds its chapters up (remembered per arc).
      const open = fold.isOpen(node.id)
      return (
        <div key={node.id} {...common} className={dnd.cardClass('wrArcCard', node.id)} style={tint(node)}>
          <CardHeader
            grip={grip(node.id)} number={n} title={node.title} label={`Arc ${n} title`} placeholder="Arc title"
            onTitle={title => w.updateOutlineNode(node.id, { title })}
            toggle={{ kind: 'arc', open, onClick: () => fold.setOpen(node.id, !open) }}
          />
          <StatsLine items={[stat(kids.length, 'chapter'), formatWords(words(node.id))]} />
          {open && dnd.children(node.id, kids, renderNode)}
          {open && (
            <div className="wrCardFoot wrCardFoot--tools">
              <span className="wrCardFootLeft">
                <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => addChapter(node.id)}><PlusIcon size={13} /> Chapter</button>
                {hue(node, `Arc ${n}`)}
              </span>
              <DeleteControl
                message={`Delete Arc ${n}${kids.length ? ` and its ${kids.length} ${kids.length === 1 ? 'chapter' : 'chapters'}` : ''}?`}
                onConfirm={() => w.deleteOutlineNode(node.id)}
              />
            </div>
          )}
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
          <button type="button" className="wrSmallBtn" onClick={() => addArc(book.id)}><PlusIcon size={13} /> Arc</button>
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
