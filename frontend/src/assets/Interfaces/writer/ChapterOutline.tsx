import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { OutlineNode, PlotNode } from '../../../api/types'
import type { ChapterMode, WriterWorkspace } from './useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon, GripIcon, PlusIcon } from '../../icons'
import {
  buildChildIndex, inheritedSceneValues, nearestOfKind, rollUpWordCounts, scenesInOrder, sceneChanges, type ChildIndex,
} from './outlineTree'
import { SceneTime } from './SceneTime'
import { PlotpointTile } from './PlotpointTile'
import { formatTime, hasTime, systemForBook } from './timeSystem'
import { useNodeKeys } from '../../../lib/nodeKeys'
import { AutoTextarea, DeleteControl } from './shared'
import { nodeLabel } from './plotTree'
import { useNodeDnd } from './useNodeDnd'
import { fullDate, shortDate, type ChapterMeta } from './chapterDates'
import { mergeDraftText } from './draftText'
import { countWords, formatWords } from './wordCount'

// The chapter as a page of nested cards: acts contain scenes and scenes
// contain moments. It has two modes over the same tree.
//
//  - outline: every card is editable; nodes are reordered and reparented by
//    dragging their grip; each card has a read-only word count in its footer
//    (moments their own, scenes and acts the total of what is inside) and a
//    quiet trash icon at the bottom right that asks to confirm.
//  - draft: every card is read-only, with its description along the top (act
//    title, scene location/time/action, moment synopsis). Only moment cards
//    have a footer, which opens from a word-count bar into the draft text.

interface Labels { act: Map<string, number>; scene: Map<string, number>; moment: Map<string, number> }

function numberNodes(index: ChildIndex, rootId: string): Labels {
  const labels: Labels = { act: new Map(), scene: new Map(), moment: new Map() }
  const counters = { act: 0, scene: 0, moment: 0 }
  const walk = (parentId: string) => {
    for (const n of index.get(parentId) ?? []) {
      // The free draft is not part of the outline: it is never numbered.
      if (n.freeDraft) continue
      if (n.kind === 'act' || n.kind === 'scene' || n.kind === 'moment') labels[n.kind].set(n.id, ++counters[n.kind])
      walk(n.id)
    }
  }
  walk(rootId)
  return labels
}

// A plotpoint being dragged from the chapter's left column onto a card.
export interface PlotDrag {
  dragId: string | null
  setDragId: (id: string | null) => void
}

export interface ChapterDraft {
  bodies: Record<string, string>
  setBody: (momentId: string, body: string) => void
}

// The draft text under a moment card. It mounts closed and opens on the next
// frame, so switching from Outline to Draft visibly expands it out of the
// word-count bar; the bar collapses it again.
function DraftFooter({ words, value, onChange, grip }: { words: number; value: string; onChange: (text: string) => void; grip?: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setOpen(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [])
  return (
    // Focusing the text (Tab from the previous moment's draft) opens a closed one.
    <div className={open ? 'wrDraftFoot wrDraftFoot--open' : 'wrDraftFoot'} onFocusCapture={() => setOpen(true)}>
      <div className="wrDraftFootHead">
        {grip}
        <button type="button" className="wrDraftFootBar" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
          <span>{formatWords(words)}</span>
        </button>
      </div>
      <div className="wrDraftFootBody">
        <div className="wrDraftFootInner">
          <AutoTextarea className="wrDraftText" placeholder="Start drafting this moment…" value={value} onChange={onChange} keyField="draft" />
        </div>
      </div>
    </div>
  )
}

function ChapterOutline({ w, chapter, mode, draft, plotDrag, meta, sidebar }: {
  w: WriterWorkspace
  chapter: OutlineNode
  mode: ChapterMode
  draft: ChapterDraft
  plotDrag?: PlotDrag
  meta: ChapterMeta
  // The chapter's plotpoint column: fixed in the page's left margin (Outline mode).
  sidebar?: ReactNode
}) {
  const editable = mode === 'outline'
  // Draft mode: one moment's draft text dropped on another is appended to it.
  const mergeText = (sourceId: string, targetId: string) => {
    const source = draft.bodies[sourceId] ?? ''
    if (!source.trim()) return
    draft.setBody(targetId, mergeDraftText(draft.bodies[targetId] ?? '', source))
    draft.setBody(sourceId, '')
  }
  const dnd = useNodeDnd(w, { onMergeText: editable ? undefined : mergeText })
  const [plotOverId, setPlotOverId] = useState<string | null>(null)

  // Plotpoints assigned to each act / scene / moment (the chapter's own are in the left column).
  const pointsByNode = useMemo(() => {
    const map = new Map<string, PlotNode[]>()
    for (const p of w.plotNodes) {
      if (p.kind !== 'plotpoint' || !p.assignedMomentId || p.assignedMomentId === chapter.id) continue
      map.set(p.assignedMomentId, [...(map.get(p.assignedMomentId) ?? []), p])
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order)
    return map
  }, [w.plotNodes, chapter.id])

  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])

  // Keyboard shortcuts (lib/nodeKeys.ts). The chapter itself is the page's root:
  // it has no siblings here and is never created or removed from its own title.
  const parentNode = (id: string) => {
    const parentId = nodeById.get(id)?.parentId
    return parentId ? nodeById.get(parentId) : undefined
  }
  const keys = useNodeKeys({
    parentOf: id => (id === chapter.id ? null : nodeById.get(id)?.parentId ?? null),
    siblingsOf: id => (id === chapter.id ? [id] : (index.get(nodeById.get(id)?.parentId ?? null) ?? []).filter(n => !n.freeDraft).map(n => n.id)),
    isEmpty: id => {
      const n = nodeById.get(id)
      if (!n || n.id === chapter.id) return false
      if ((index.get(id) ?? []).length > 0 || (pointsByNode.get(id)?.length ?? 0) > 0) return false
      return [n.title, n.synopsis, n.location ?? '', n.action ?? '', draft.bodies[id] ?? ''].every(t => t.trim() === '') && !hasTime(n.timeValue)
    },
    createSibling: id => {
      const n = nodeById.get(id)
      return n && n.id !== chapter.id ? w.addOutlineNode(n.parentId, n.kind, {}, id) : null
    },
    // moment -> a new scene after its scene, scene -> a new act after its act.
    createParentSibling: id => {
      const parent = parentNode(id)
      return parent && parent.id !== chapter.id ? w.addOutlineNode(parent.parentId, parent.kind, {}, parent.id) : null
    },
    canCreateParentSibling: id => {
      const parent = parentNode(id)
      return Boolean(parent) && parent!.id !== chapter.id
    },
    remove: id => w.deleteOutlineNode(id),
  })
  const labels = useMemo(() => numberNodes(index, chapter.id), [index, chapter.id])
  const scenes = useMemo(() => scenesInOrder(w.outlineNodes, chapter.id), [w.outlineNodes, chapter.id])
  const chapterNumber = w.activeBookChapters.findIndex(c => c.id === chapter.id) + 1

  const wordCounts = useMemo(() => {
    const perMoment: Record<string, number> = {}
    for (const [id, body] of Object.entries(draft.bodies)) perMoment[id] = countWords(body)
    return rollUpWordCounts(index, chapter.id, perMoment)
  }, [draft.bodies, index, chapter.id])
  const words = (id: string) => wordCounts.get(id) ?? 0

  // The time system this chapter's book uses for its scenes' Time.
  const timeSystem = useMemo(
    () => systemForBook(w.activeProject?.settings.timeSystems ?? [], nearestOfKind(w.outlineNodes, chapter.id, 'book')),
    [w.activeProject, w.outlineNodes, chapter.id],
  )

  // Plain render functions (not components): a component defined inside this
  // one would remount its inputs on every keystroke.
  const grip = (id: string) => editable && (
    <span className="wrGrip wrGrip--light" aria-label="Drag to reorder" title="Drag to reorder" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )

  // Draft mode: the handle on a moment's footer drags its draft text.
  const draftGrip = (id: string) => (
    <span className="wrGrip wrGrip--light wrGrip--draft" aria-label="Drag this draft" title="Drag this draft onto a moment or between moments" {...dnd.gripProps(id)}>
      <GripIcon size={14} />
    </span>
  )

  const cardClass = (base: string, id: string) =>
    `${dnd.cardClass(base, id)}${editable ? '' : ' wrOutlineCard--readonly'}${plotOverId === id ? ' wrOutlineCard--plotOver' : ''}`

  // Drop handling for a card: while a plotpoint is being dragged from the left
  // column the card takes it (assigns it here); in Draft mode a moment takes
  // another moment's draft text. Outline cards otherwise take no drops (they go
  // in the gaps between cards).
  const dropProps = (id: string) => {
    if (!editable) return nodeById.get(id)?.kind === 'moment' ? dnd.textDropProps(id) : {}
    if (!plotDrag?.dragId) return {}
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (plotOverId !== id) setPlotOverId(id) },
      onDragLeave: () => setPlotOverId(prev => (prev === id ? null : prev)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation()
        if (plotDrag.dragId) w.assignPlotpoint(plotDrag.dragId, id)
        plotDrag.setDragId(null)
        setPlotOverId(null)
      },
    }
  }

  // The plotpoints boxed inside a card. In Outline mode the x unassigns from
  // this card only (the plotpoint stays with the chapter, in the left column).
  const boxed = (nodeId: string) => {
    const list = pointsByNode.get(nodeId)
    if (!list || list.length === 0) return null
    return (
      <div className="wrCardPoints">
        {list.map(p => (
          <PlotpointTile
            key={p.id} w={w} point={p}
            onUnassign={editable ? () => w.assignPlotpoint(p.id, chapter.id) : undefined}
          />
        ))}
      </div>
    )
  }

  // A scene's Location, Time and Action. A field left empty takes the value of
  // the nearest earlier scene in this chapter as its placeholder (never saved),
  // or its own name when nothing precedes. A field with a value that differs
  // from what it inherits is filled with the book's accent colour; empty or
  // unchanged ones sit on the page background. In Draft mode they are chips: the
  // scene's own value, else the inherited one faded, else no chip at all (and no
  // row when there are none).
  const sceneFields = (scene: OutlineNode) => {
    const at = scenes.findIndex(s => s.id === scene.id)
    const inherited = inheritedSceneValues(scenes, at)
    const changes = sceneChanges(scene, inherited)
    const label = { location: 'Location', time: 'Time', action: 'Action' } as const
    const changedTitle = (key: keyof typeof label) => (changes[key] ? `${label[key]} changed from the previous scene` : label[key])
    const chip = (key: keyof typeof label, own: string, inheritedText: string) => {
      const text = own || inheritedText
      if (!text) return null
      return (
        <span
          key={key}
          className={`wrStripChip wrStripChip--${key}${changes[key] ? ' wrStripChip--changed' : ''}${own ? '' : ' wrStripChip--empty'}`}
          title={changes[key] ? changedTitle(key) : undefined}
        >
          {text}
        </span>
      )
    }
    const timeText = formatTime(timeSystem, scene.timeValue)
    const inheritedTimeText = inherited.timeValue ? formatTime(timeSystem, inherited.timeValue) : ''

    if (!editable) {
      const chips = [
        chip('location', scene.location?.trim() ? scene.location : '', inherited.location ?? ''),
        chip('time', timeText, inheritedTimeText),
        chip('action', scene.action?.trim() ? scene.action : '', inherited.action ?? ''),
      ].filter(Boolean)
      return chips.length > 0 ? <div className="wrSceneFields">{chips}</div> : null
    }

    const field = (key: 'location' | 'action') => (
      <input
        className={changes[key] ? `wrSceneField wrSceneField--${key} wrSceneField--changed` : `wrSceneField wrSceneField--${key}`}
        placeholder={inherited[key] ?? label[key]} value={scene[key] ?? ''} data-kf=""
        aria-label={label[key]} title={changedTitle(key)}
        onChange={e => w.updateOutlineNode(scene.id, { [key]: e.target.value })}
      />
    )
    return (
      <div className="wrSceneFields">
        {field('location')}
        <SceneTime
          system={timeSystem} value={scene.timeValue} changed={changes.time} placeholder={inheritedTimeText || label.time}
          onChange={next => w.updateOutlineNode(scene.id, { timeValue: next })}
        />
        {field('action')}
      </div>
    )
  }

  // A node's number: "Moment 2" in Outline mode, a bare "2" in Draft mode.
  const numberLabel = (word: string, n: number | undefined) => (editable ? `${word} ${n}` : String(n))
  const labelClass = editable ? 'wrNodeLabel' : 'wrNodeLabel wrNodeLabel--num'

  // Outline-mode card footer: read-only word count on the left, then the add
  // button; the trash icon is pinned to the bottom right.
  const footer = (node: OutlineNode, add: { label: string; kind: 'moment' | 'scene' } | null, deleteMessage: string) => (
    <div className="wrCardFoot">
      <span className="wrCardFootLeft">
        {add && (
          <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => w.addOutlineNode(node.id, add.kind)}>
            <PlusIcon size={13} /> {add.label}
          </button>
        )}
        <span className="wrWordCount">{formatWords(words(node.id))}</span>
      </span>
      <DeleteControl message={deleteMessage} onConfirm={() => w.deleteOutlineNode(node.id)} />
    </div>
  )

  function renderNode(node: OutlineNode): React.ReactNode {
    const kids = index.get(node.id) ?? []
    const childCount = kids.length

    if (node.kind === 'moment') {
      const n = labels.moment.get(node.id)
      if (editable) {
        // Outline: the grip is centred down the left of the card; the first row is a
        // read-only preview of the synopsis with the moment number at the right,
        // the second row the synopsis input.
        return (
          <div key={node.id} data-node={node.id} data-knode={node.id} className={cardClass('wrMomentCard wrMomentCard--outline wrOutlineCard', node.id)} {...dropProps(node.id)}>
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
              {boxed(node.id)}
              {footer(node, null, `Delete Moment ${n}?`)}
            </div>
          </div>
        )
      }
      return (
        <div key={node.id} data-node={node.id} data-knode={node.id} className={cardClass('wrMomentCard wrOutlineCard', node.id)} {...dropProps(node.id)}>
          <div className="wrMomentRow">
            <span className="wrNodeHandle"><span className={labelClass}>{numberLabel('Moment', n)}</span></span>
            <span className={node.synopsis ? 'wrNodeDescription' : 'wrNodeDescription wrNodeDescription--empty'}>{node.synopsis || 'No synopsis'}</span>
          </div>
          {boxed(node.id)}
          <DraftFooter words={words(node.id)} value={draft.bodies[node.id] ?? ''} onChange={text => draft.setBody(node.id, text)} grip={draftGrip(node.id)} />
        </div>
      )
    }

    if (node.kind === 'scene') {
      const n = labels.scene.get(node.id)
      return (
        <div key={node.id} data-node={node.id} data-knode={node.id} className={cardClass('wrSceneCard wrOutlineCard', node.id)} {...dropProps(node.id)}>
          <div className="wrSceneHead">
            <span className="wrNodeHandle">{grip(node.id)}<span className={labelClass}>{numberLabel('Scene', n)}</span></span>
            {sceneFields(node)}
          </div>
          {boxed(node.id)}
          {dnd.children(node.id, kids, renderNode)}
          {editable && footer(node, { label: 'Moment', kind: 'moment' },
            `Delete Scene ${n}${childCount ? ` and its ${childCount} ${childCount === 1 ? 'moment' : 'moments'}` : ''}?`)}
        </div>
      )
    }

    if (node.kind === 'act') {
      const n = labels.act.get(node.id)
      return (
        <div key={node.id} data-node={node.id} data-knode={node.id} className={cardClass('wrActCard wrOutlineCard', node.id)} {...dropProps(node.id)}>
          <div className="wrActHead">
            <span className="wrNodeHandle">{grip(node.id)}<span className={labelClass}>{numberLabel('Act', n)}</span></span>
            {editable ? (
              <input
                className="wrOutlineInput" placeholder="Act title" value={node.title} data-kf=""
                onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
              />
            ) : (
              <span className={node.title ? 'wrNodeDescription' : 'wrNodeDescription wrNodeDescription--empty'}>{node.title || 'Untitled act'}</span>
            )}
          </div>
          {boxed(node.id)}
          {dnd.children(node.id, kids, renderNode)}
          {editable && footer(node, { label: 'Scene', kind: 'scene' },
            `Delete Act ${n}${childCount ? ' and everything in it' : ''}?`)}
        </div>
      )
    }

    return null
  }

  const children = (index.get(chapter.id) ?? []).filter(n => !n.freeDraft)
  const freeNode = (index.get(chapter.id) ?? []).find(n => n.freeDraft)
  const freeBody = freeNode ? draft.bodies[freeNode.id] ?? '' : ''

  // The free draft is created with the first text typed into it. Its id is kept
  // until the node shows up in the tree, so fast typing cannot create two.
  const freeIdRef = useRef<string | null>(null)
  if (freeNode) freeIdRef.current = freeNode.id
  else if (freeIdRef.current && nodeById.has(freeIdRef.current)) freeIdRef.current = null // it became an ordinary moment
  function typeFree(text: string) {
    const id = freeIdRef.current ?? w.addOutlineNode(chapter.id, 'moment', { freeDraft: true, order: -1 })
    freeIdRef.current = id
    draft.setBody(id, text)
  }
  // Once the free draft has shown up in a chapter with an outline it stays while it is being edited.
  const [freeShown, setFreeShown] = useState(false)
  useEffect(() => { if (freeBody.trim()) setFreeShown(true) }, [freeBody])

  const freeCard = (() => {
    if (!freeNode) return null
    if (editable) {
      if (!freeBody.trim()) return null
      return (
        <div className="wrFreeCard wrFreeCard--readonly" data-testid="free-draft-card">
          <span className="wrNodeLabel">Free draft</span>
          <span className="wrWordCount">{formatWords(words(freeNode.id))}</span>
        </div>
      )
    }
    if (children.length === 0 || (!freeBody.trim() && !freeShown)) return null
    return (
      <div key={freeNode.id} data-node={freeNode.id} className={cardClass('wrMomentCard wrFreeCard wrOutlineCard', freeNode.id)} {...dropProps(freeNode.id)}>
        <div className="wrMomentRow">
          <span className="wrNodeHandle"><span className="wrNodeLabel wrNodeLabel--num">Free draft</span></span>
          <span className="wrNodeDescription wrNodeDescription--empty">Not part of the outline</span>
        </div>
        <DraftFooter words={words(freeNode.id)} value={freeBody} onChange={typeFree} grip={draftGrip(freeNode.id)} />
      </div>
    )
  })()

  return (
    <div className="wrPage wrPage--chapter">
      {editable && sidebar}
      <div className="wrPageScroll" data-knode={chapter.id} onKeyDown={keys.onKeyDown}>
        <div className="wrPageHead">
          {editable ? (
            <input
              className="wrPageTitleInput" value={chapter.title} placeholder="Chapter title" data-kf=""
              onChange={e => w.updateOutlineNode(chapter.id, { title: e.target.value })}
            />
          ) : (
            <span className="wrPageTitle">{nodeLabel(chapter)}</span>
          )}
          <div className="wrPageMetaRow">
            <span className="wrPageKicker">Chapter {chapterNumber}</span>
            <span>{formatWords(words(chapter.id))}</span>
            {meta.created && <span title={fullDate(meta.created)}>Created {shortDate(meta.created)}</span>}
            {meta.edited && <span title={fullDate(meta.edited)}>Edited {shortDate(meta.edited)}</span>}
            {meta.published && <span title={fullDate(meta.published)}>Published {shortDate(meta.published)}</span>}
          </div>
        </div>
        {children.length === 0 && (
          <p className="wrPageMuted">
            {editable
              ? 'Nothing outlined yet. Add an act to begin.'
              : 'Nothing outlined yet. Draft freely below, or switch to Outline to add acts, scenes and moments.'}
          </p>
        )}
        {!editable && children.length === 0 && (
          <div className="wrFreeArea">
            <AutoTextarea className="wrDraftText" placeholder="Draft freely, no outline needed…" rows={6} value={freeBody} onChange={typeFree} />
            <span className="wrWordCount">{formatWords(freeNode ? words(freeNode.id) : 0)}</span>
          </div>
        )}
        {freeCard}
        {dnd.children(chapter.id, children, renderNode)}
        {editable && (
          <div>
            <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => w.addOutlineNode(chapter.id, 'act')}><PlusIcon size={13} /> Act</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChapterOutline
