import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WordCounts } from '../../../../api/draftFetch'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon, GripIcon, PencilIcon, PlusIcon } from '../../../icons'
import { themeColorCss } from '../../../../theme/bookColors'
import { useNodeKeys } from '../../../../lib/nodeKeys'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { DeleteControl } from '../shared'
import { useStoredState } from '../storage'
import { PlotpointTile } from '../PlotpointTile'
import { hasTime, systemForBook } from '../timeSystem'
import { useNodeDnd } from '../useNodeDnd'
import { formatWords } from '../wordCount'
import HueSlider from '../HueSlider'
import { pointsByTarget, structureOfBook } from './outlineModel'
import { SceneFields } from './SceneFields'

// A plotpoint being dragged from the tray (or from another card) onto a card.
export interface PlotDrag {
  dragId: string | null
  setDragId: (id: string | null) => void
}

// What a node may hold one level down.
const CHILD_KIND: Partial<Record<OutlineNode['kind'], OutlineNode['kind']>> = { arc: 'chapter', chapter: 'act', act: 'scene', scene: 'moment' }
// Only these take a plotpoint (see plotFields.assignPoint).
const TAKES_PLOTPOINTS = new Set<OutlineNode['kind']>(['chapter', 'act', 'scene', 'moment'])

const KIND_WORD: Partial<Record<OutlineNode['kind'], string>> = { arc: 'Arc', chapter: 'Chapter', act: 'Act', scene: 'Scene', moment: 'Moment' }

// The open book as nested, editable cards: arcs hold chapters, chapters hold acts, acts
// hold scenes, scenes hold moments (chapters may also sit straight under the book).
// Cards are reordered and moved by dragging their grip; plotpoints dragged from the tray
// land in a chapter, act, scene or moment card and are boxed inside it; every card has a
// word count (the draft's) and a quiet trash icon that asks to confirm.
//
// Arcs and chapters carry their own colour slider, and chapters open and close: a
// chapter starts closed unless it is the open one.
export function OutlineCards({ w, book, counts, plotDrag }: {
  w: WriterWorkspace
  book: OutlineNode
  counts: WordCounts
  plotDrag: PlotDrag
}) {
  // Each card takes what the editor shows under it: the book arcs and chapters, an arc its chapters, a chapter its acts ...
  const dnd = useNodeDnd(w, {
    accepts: (dragged, parentId) => {
      const parent = parentId ? w.outlineNodes.find(n => n.id === parentId) : undefined
      if (!parent) return false
      return parent.kind === 'book' ? dragged.kind === 'arc' || dragged.kind === 'chapter' : CHILD_KIND[parent.kind] === dragged.kind
    },
  })
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const { numbers, scenesOfChapter, chapterOf } = useMemo(() => structureOfBook(index, book.id), [index, book.id])
  const pointsByNode = useMemo(() => pointsByTarget(w.plotNodes), [w.plotNodes])
  const [plotOverId, setPlotOverId] = useState<string | null>(null)
  const [openMap, setOpenMap] = useStoredState<Record<string, boolean>>('scriblr.writer.outlineOpen', {})
  const isOpen = (n: OutlineNode) => openMap[n.id] ?? (n.kind === 'chapter' ? n.id === w.activeChapterId : true)
  const setOpen = (id: string, open: boolean) => setOpenMap(prev => ({ ...prev, [id]: open }))
  // Picking a chapter (from its edge tab, or coming back from its draft) opens its card and brings it into view.
  const rootRef = useRef<HTMLDivElement>(null)
  const activeId = w.activeChapterId
  useEffect(() => {
    if (!activeId || !nodeById.has(activeId)) return
    setOpenMap(prev => (prev[activeId] === true ? prev : { ...prev, [activeId]: true }))
    const frame = requestAnimationFrame(() => {
      const card = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-node]') ?? []).find(n => n.dataset.node === activeId)
      card?.scrollIntoView?.({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
    // Only a different chapter being picked counts: not the outline changing under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])
  const system = useMemo(() => systemForBook(w.activeProject?.settings.timeSystems ?? [], book), [w.activeProject, book])
  const words = (id: string) => counts.nodes[id] ?? 0

  // ---- keyboard shortcuts (lib/nodeKeys.ts): the book's own arcs and chapters are the top level ----
  const parentNode = (id: string) => {
    const parent = nodeById.get(nodeById.get(id)?.parentId ?? '')
    return parent && parent.id !== book.id ? parent : undefined
  }
  const addChild = (parentId: string, kind: OutlineNode['kind']) => {
    setOpen(parentId, true)
    return w.addOutlineNode(parentId, kind)
  }
  const keys = useNodeKeys({
    parentOf: id => parentNode(id)?.id ?? null,
    siblingsOf: id => (index.get(nodeById.get(id)?.parentId ?? null) ?? []).filter(n => !n.freeDraft).map(n => n.id),
    isEmpty: id => {
      const n = nodeById.get(id)
      if (!n) return true
      if ((index.get(id) ?? []).length > 0 || (pointsByNode.get(id)?.length ?? 0) > 0) return false
      return [n.title, n.synopsis, n.location ?? '', n.action ?? ''].every(t => t.trim() === '') && !hasTime(n.timeValue)
    },
    createSibling: id => {
      const n = nodeById.get(id)
      return n ? w.addOutlineNode(n.parentId, n.kind, {}, id) : null
    },
    // moment -> a new scene after its scene, scene -> a new act, act -> a new chapter, chapter in an arc -> a new arc.
    createParentSibling: id => {
      const parent = parentNode(id)
      return parent ? w.addOutlineNode(parent.parentId, parent.kind, {}, parent.id) : null
    },
    canCreateParentSibling: id => Boolean(parentNode(id)),
    createChild: id => {
      const child = CHILD_KIND[nodeById.get(id)?.kind ?? 'moment']
      return child ? addChild(id, child) : null
    },
    canCreateChild: id => Boolean(CHILD_KIND[nodeById.get(id)?.kind ?? 'moment']),
    remove: id => w.deleteOutlineNode(id),
  })

  // ---- plain render functions (not components): a component defined in here would remount its inputs on every keystroke ----
  const grip = (id: string) => (
    <span className="wrGrip wrGrip--light" aria-label="Drag to reorder" title="Drag to reorder" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )

  const cardClass = (base: string, id: string) =>
    `${dnd.cardClass(base, id)}${plotOverId === id ? ' wrOutlineCard--plotOver' : ''}`

  // While a plotpoint is being dragged, a chapter, act, scene or moment card takes it (assigns it here).
  const dropProps = (node: OutlineNode) => {
    if (!plotDrag.dragId || !TAKES_PLOTPOINTS.has(node.kind)) return {}
    return {
      onDragOver: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); if (plotOverId !== node.id) setPlotOverId(node.id) },
      onDragLeave: () => setPlotOverId(prev => (prev === node.id ? null : prev)),
      onDrop: (e: DragEvent) => {
        e.preventDefault(); e.stopPropagation()
        if (plotDrag.dragId) w.assignPlotpoint(plotDrag.dragId, node.id)
        plotDrag.setDragId(null)
        setPlotOverId(null)
      },
    }
  }

  // The plotpoints boxed inside a card; the x sends one back to the tray.
  const boxed = (node: OutlineNode) => {
    const list = pointsByNode.get(node.id)
    if (!list || list.length === 0) return null
    return (
      <div className="wrCardPoints">
        {list.map(p => (
          <PlotpointTile
            key={p.id} w={w} point={p} variant="placed" onMoment={node.kind === 'moment'} dragging={plotDrag.dragId === p.id}
            unassignTitle="Return to the unassigned plotpoints" onUnassign={() => w.assignPlotpoint(p.id, null)}
            drag={{
              onDragStart: e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); plotDrag.setDragId(p.id) },
              onDragEnd: () => plotDrag.setDragId(null),
            }}
          />
        ))}
      </div>
    )
  }

  const tint = (node: OutlineNode) => ({ '--wr-node-tint': themeColorCss(w.levelHueOf(node)) } as CSSProperties)

  const chevron = (node: OutlineNode, open: boolean, label: string) => (
    <button
      type="button" className="wrNodeToggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      onClick={() => setOpen(node.id, !open)}
    >
      {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
    </button>
  )

  const hue = (node: OutlineNode, label: string) => (
    <HueSlider
      label={`${label} colour`} className="wrNodeHue wrNodeHue--inline" hue={w.levelHueOf(node)} centre={w.hueCentreOf(node)}
      onChange={next => w.setNodeHue(node.id, next)}
    />
  )

  const addButton = (parent: OutlineNode, kind: OutlineNode['kind']) => (
    <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => addChild(parent.id, kind)}>
      <PlusIcon size={13} /> {KIND_WORD[kind]}
    </button>
  )

  // A card's footer: an add button for what it holds, its word count, and the trash at the right.
  const footer = (node: OutlineNode, add: OutlineNode['kind'] | null, deleteMessage: string) => (
    <div className="wrCardFoot">
      <span className="wrCardFootLeft">
        {add && addButton(node, add)}
        <span className="wrWordCount">{formatWords(words(node.id))}</span>
      </span>
      <DeleteControl message={deleteMessage} onConfirm={() => w.deleteOutlineNode(node.id)} />
    </div>
  )

  const stat = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  const countOf = (id: string, kind: OutlineNode['kind']) => descendantsOf(index, id).filter(x => x.kind === kind && !x.freeDraft).length

  const childrenOf = (node: OutlineNode) => (index.get(node.id) ?? []).filter(k => !k.freeDraft)

  function renderNode(node: OutlineNode): ReactNode {
    const kids = childrenOf(node)
    const inside = descendantsOf(index, node.id)
    const common = { 'data-node': node.id, 'data-knode': node.id }

    if (node.kind === 'moment') {
      const n = numbers.moment.get(node.id)
      // The grip is centred down the left of the card; the first row previews the synopsis with the number at the right,
      // the second is the synopsis input.
      return (
        <div key={node.id} {...common} className={cardClass('wrMomentCard wrMomentCard--outline wrOutlineCard', node.id)} {...dropProps(node)}>
          {grip(node.id)}
          <div className="wrMomentCol">
            <div className="wrMomentTop">
              <span className="wrMomentPreview">{node.synopsis}</span>
              <span className="wrNodeLabel wrNodeLabel--moment">Moment {n}</span>
            </div>
            <input
              className="wrOutlineInput" placeholder="Moment synopsis" value={node.synopsis} data-kf=""
              onChange={e => w.updateOutlineNode(node.id, { synopsis: e.target.value })}
            />
            {boxed(node)}
            {footer(node, null, `Delete Moment ${n}?`)}
          </div>
        </div>
      )
    }

    if (node.kind === 'scene') {
      const n = numbers.scene.get(node.id)
      const scenes = scenesOfChapter.get(chapterOf.get(node.id) ?? '') ?? []
      const open = isOpen(node)
      return (
        <div key={node.id} {...common} className={cardClass('wrSceneCard wrOutlineCard', node.id)} {...dropProps(node)}>
          <div className="wrSceneHead">
            <span className="wrNodeHandle">{grip(node.id)}{chevron(node, open, `Scene ${n}`)}<span className="wrNodeLabel">Scene {n}</span></span>
            <SceneFields w={w} scene={node} scenes={scenes} system={system} />
          </div>
          {boxed(node)}
          {open && dnd.children(node.id, kids, renderNode)}
          {open
            ? footer(node, 'moment', `Delete Scene ${n}${kids.length ? ` and its ${kids.length} ${kids.length === 1 ? 'moment' : 'moments'}` : ''}?`)
            : <div className="wrCardFoot"><span className="wrWordCount">{stat(kids.length, 'moment')} · {formatWords(words(node.id))}</span></div>}
        </div>
      )
    }

    if (node.kind === 'act') {
      const n = numbers.act.get(node.id)
      const open = isOpen(node)
      return (
        <div key={node.id} {...common} className={cardClass('wrActCard wrOutlineCard', node.id)} {...dropProps(node)}>
          <div className="wrActHead">
            <span className="wrNodeHandle">{grip(node.id)}{chevron(node, open, `Act ${n}`)}<span className="wrNodeLabel">Act {n}</span></span>
            <input
              className="wrOutlineInput" placeholder="Act title" value={node.title} data-kf=""
              onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
            />
          </div>
          {boxed(node)}
          {open && dnd.children(node.id, kids, renderNode)}
          {open
            ? footer(node, 'scene', `Delete Act ${n}${inside.length ? ' and everything in it' : ''}?`)
            : <div className="wrCardFoot"><span className="wrWordCount">{stat(kids.length, 'scene')} · {formatWords(words(node.id))}</span></div>}
        </div>
      )
    }

    if (node.kind === 'chapter') {
      const n = numbers.chapter.get(node.id) ?? 0
      const open = isOpen(node)
      const free = (index.get(node.id) ?? []).find(k => k.freeDraft)
      return (
        <div key={node.id} {...common} className={cardClass('wrChapterCard wrOutlineCard', node.id)} style={tint(node)} {...dropProps(node)}>
          <div className="wrNodeHead">
            <span className="wrNodeHandle">{grip(node.id)}{chevron(node, open, `Chapter ${n}`)}<span className="wrNodeLabel">Chapter {n}</span></span>
            <input
              className="wrOutlineInput wrOutlineInput--title" placeholder="Chapter title" value={node.title} data-kf="" aria-label={`Chapter ${n} title`}
              onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
            />
            {hue(node, `Chapter ${n}`)}
            <button type="button" className="wrIconBtn wrIconBtn--light" title="Write" aria-label={`Write chapter ${n}`} onClick={() => w.openChapter(node.id)}>
              <PencilIcon size={15} />
            </button>
          </div>
          <div className="wrNodeStats">
            <span>{stat(countOf(node.id, 'act'), 'act')}</span>
            <span>{stat(countOf(node.id, 'scene'), 'scene')}</span>
            <span>{stat(countOf(node.id, 'moment'), 'moment')}</span>
            <span>{formatWords(words(node.id))}</span>
          </div>
          {boxed(node)}
          {open && free && words(free.id) > 0 && (
            <div className="wrFreeCard wrFreeCard--readonly" data-testid="free-draft-card">
              <span className="wrNodeLabel">Free draft</span>
              <span className="wrWordCount">{formatWords(words(free.id))}</span>
            </div>
          )}
          {open && dnd.children(node.id, kids, renderNode)}
          {open && (
            <div className="wrCardFoot">
              <span className="wrCardFootLeft">{addButton(node, 'act')}</span>
              <DeleteControl message={`Delete Chapter ${n}${inside.length ? ' and everything in it' : ''}?`} onConfirm={() => w.deleteOutlineNode(node.id)} />
            </div>
          )}
        </div>
      )
    }

    if (node.kind === 'arc') {
      const n = numbers.arc.get(node.id) ?? 0
      const open = isOpen(node)
      return (
        <div key={node.id} {...common} className={cardClass('wrArcCard wrOutlineCard', node.id)} style={tint(node)}>
          <div className="wrNodeHead">
            <span className="wrNodeHandle">{grip(node.id)}{chevron(node, open, `Arc ${n}`)}<span className="wrNodeLabel">Arc {n}</span></span>
            <input
              className="wrOutlineInput wrOutlineInput--title" placeholder="Arc title" value={node.title} data-kf="" aria-label={`Arc ${n} title`}
              onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
            />
            {hue(node, `Arc ${n}`)}
          </div>
          {open && dnd.children(node.id, kids, renderNode)}
          <div className="wrCardFoot">
            <span className="wrCardFootLeft">
              {open && addButton(node, 'chapter')}
              <span className="wrWordCount">{stat(kids.length, 'chapter')} · {formatWords(words(node.id))}</span>
            </span>
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

  const top = childrenOf(book).filter(k => k.kind === 'arc' || k.kind === 'chapter')
  return (
    <div className="wrOutlineCards" ref={rootRef} onKeyDown={keys.onKeyDown}>
      <div className="wrOutlineCardsHead">
        <span>Outline</span>
        <span className="wrOutlineCardsAdd">
          <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => w.addOutlineNode(book.id, 'arc')}><PlusIcon size={13} /> Arc</button>
          <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => { setOpen(w.addOutlineNode(book.id, 'chapter'), true) }}><PlusIcon size={13} /> Chapter</button>
        </span>
      </div>
      {top.length === 0 && <p className="wrPageMuted">Nothing outlined yet. Add an arc or a chapter to begin.</p>}
      {dnd.children(book.id, top, renderNode)}
    </div>
  )
}

export default OutlineCards
