import { useEffect, useMemo, useState } from 'react'
import type { OutlineNode, PlotNode } from '../../../api/types'
import type { ChapterMode, WriterWorkspace } from './useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon, GripIcon, PlusIcon } from '../../icons'
import { buildChildIndex, nearestOfKind, rollUpWordCounts, scenesInOrder, sceneChanges, type ChildIndex } from './outlineTree'
import { SceneTime } from './SceneTime'
import { PlotpointTile } from './PlotpointTile'
import { formatTime, systemForBook } from './timeSystem'
import { AutoTextarea, DeleteControl } from './shared'
import { nodeLabel } from './plotTree'
import { useNodeDnd } from './useNodeDnd'
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
function DraftFooter({ words, value, onChange }: { words: number; value: string; onChange: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setOpen(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [])
  return (
    <div className={open ? 'wrDraftFoot wrDraftFoot--open' : 'wrDraftFoot'}>
      <button type="button" className="wrDraftFootBar" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
        <span>{formatWords(words)}</span>
      </button>
      <div className="wrDraftFootBody">
        <div className="wrDraftFootInner">
          <AutoTextarea className="wrDraftText" placeholder="Start drafting this moment…" value={value} onChange={onChange} />
        </div>
      </div>
    </div>
  )
}

function ChapterOutline({ w, chapter, mode, draft, plotDrag }: {
  w: WriterWorkspace
  chapter: OutlineNode
  mode: ChapterMode
  draft: ChapterDraft
  plotDrag?: PlotDrag
}) {
  const editable = mode === 'outline'
  const dnd = useNodeDnd(w, editable)
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
  const labels = useMemo(() => numberNodes(index, chapter.id), [index, chapter.id])
  const scenes = useMemo(() => scenesInOrder(w.outlineNodes, chapter.id), [w.outlineNodes, chapter.id])
  const chapterNumber = w.activeBookChapters.findIndex(c => c.id === chapter.id) + 1

  const wordCounts = useMemo(() => {
    const perMoment: Record<string, number> = {}
    for (const [id, body] of Object.entries(draft.bodies)) perMoment[id] = countWords(body)
    return rollUpWordCounts(index, chapter.id, perMoment)
  }, [draft.bodies, index, chapter.id])
  const words = (id: string) => wordCounts.get(id) ?? 0

  const options = useMemo(() => {
    const unique = (key: 'location' | 'action') =>
      [...new Set(w.outlineNodes.filter(n => n.kind === 'scene').map(n => n[key] ?? '').filter(Boolean))]
    return { location: unique('location'), action: unique('action') }
  }, [w.outlineNodes])

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

  const cardClass = (base: string, id: string) =>
    `${dnd.cardClass(base, id)}${editable ? '' : ' wrOutlineCard--readonly'}${plotOverId === id ? ' wrOutlineCard--plotOver' : ''}`

  // Drop handling for a card: while a plotpoint is being dragged from the left
  // column the card takes it (assigns it here); otherwise the normal outline
  // drag-and-drop applies.
  const dropProps = (id: string) => {
    if (!editable || !plotDrag?.dragId) return dnd.dropProps(id)
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

  const sceneFields = (scene: OutlineNode) => {
    const at = scenes.findIndex(s => s.id === scene.id)
    const changes = sceneChanges(scene, at > 0 ? scenes[at - 1] : undefined)
    const label = { location: 'Location', time: 'Time', action: 'Action' } as const
    const field = (key: 'location' | 'action') => editable ? (
      <input
        className={changes[key] ? `wrSceneField wrSceneField--${key} wrSceneField--changed` : `wrSceneField wrSceneField--${key}`}
        list={`wr-${key}-options`} placeholder={label[key]} value={scene[key] ?? ''}
        aria-label={label[key]} title={changes[key] ? `${label[key]} changed from the previous scene` : label[key]}
        onChange={e => w.updateOutlineNode(scene.id, { [key]: e.target.value })}
      />
    ) : (
      <span
        className={`wrStripChip wrStripChip--${key}${changes[key] ? ' wrStripChip--changed' : ''}${scene[key] ? '' : ' wrStripChip--empty'}`}
        title={changes[key] ? `${label[key]} changed from the previous scene` : undefined}
      >
        {scene[key] || label[key]}
      </span>
    )
    const timeText = formatTime(timeSystem, scene.timeValue)
    const timeField = editable ? (
      <SceneTime
        system={timeSystem} value={scene.timeValue} changed={changes.time}
        onChange={next => w.updateOutlineNode(scene.id, { timeValue: next })}
      />
    ) : (
      <span
        className={`wrStripChip wrStripChip--time${changes.time ? ' wrStripChip--changed' : ''}${timeText ? '' : ' wrStripChip--empty'}`}
        title={changes.time ? 'Time changed from the previous scene' : undefined}
      >
        {timeText || 'Time'}
      </span>
    )
    return <div className="wrSceneFields">{field('location')}{timeField}{field('action')}</div>
  }

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
      return (
        <div key={node.id} data-node={node.id} className={cardClass('wrMomentCard wrOutlineCard', node.id)} {...dropProps(node.id)}>
          <div className="wrMomentRow">
            <span className="wrNodeHandle">{grip(node.id)}<span className="wrNodeLabel">Moment {n}</span></span>
            {editable ? (
              <input
                className="wrOutlineInput" placeholder="Moment synopsis" value={node.synopsis}
                onChange={e => w.updateOutlineNode(node.id, { synopsis: e.target.value })}
              />
            ) : (
              <span className={node.synopsis ? 'wrNodeDescription' : 'wrNodeDescription wrNodeDescription--empty'}>{node.synopsis || 'No synopsis'}</span>
            )}
          </div>
          {boxed(node.id)}
          {editable
            ? footer(node, null, `Delete Moment ${n}?`)
            : <DraftFooter words={words(node.id)} value={draft.bodies[node.id] ?? ''} onChange={text => draft.setBody(node.id, text)} />}
        </div>
      )
    }

    if (node.kind === 'scene') {
      const n = labels.scene.get(node.id)
      return (
        <div key={node.id} data-node={node.id} className={cardClass('wrSceneCard wrOutlineCard', node.id)} {...dropProps(node.id)}>
          <div className="wrSceneHead">
            <span className="wrNodeHandle">{grip(node.id)}<span className="wrNodeLabel">Scene {n}</span></span>
            {sceneFields(node)}
          </div>
          {boxed(node.id)}
          {kids.map(renderNode)}
          {editable && footer(node, { label: 'Moment', kind: 'moment' },
            `Delete Scene ${n}${childCount ? ` and its ${childCount} ${childCount === 1 ? 'moment' : 'moments'}` : ''}?`)}
        </div>
      )
    }

    if (node.kind === 'act') {
      const n = labels.act.get(node.id)
      return (
        <div key={node.id} data-node={node.id} className={cardClass('wrActCard wrOutlineCard', node.id)} {...dropProps(node.id)}>
          <div className="wrActHead">
            <span className="wrNodeHandle">{grip(node.id)}<span className="wrNodeLabel">Act {n}</span></span>
            {editable ? (
              <input
                className="wrOutlineInput" placeholder="Act title" value={node.title}
                onChange={e => w.updateOutlineNode(node.id, { title: e.target.value })}
              />
            ) : (
              <span className={node.title ? 'wrNodeDescription' : 'wrNodeDescription wrNodeDescription--empty'}>{node.title || 'Untitled act'}</span>
            )}
          </div>
          {boxed(node.id)}
          {kids.map(renderNode)}
          {editable && footer(node, { label: 'Scene', kind: 'scene' },
            `Delete Act ${n}${childCount ? ' and everything in it' : ''}?`)}
        </div>
      )
    }

    return null
  }

  const children = index.get(chapter.id) ?? []

  return (
    <div className="wrPage wrPage--outline" {...dnd.dropProps(chapter.id)}>
      <div className="wrPageHead">
        <span className="wrPageKicker">Chapter {chapterNumber}</span>
        {editable ? (
          <input
            className="wrPageTitleInput" value={chapter.title} placeholder="Chapter title"
            onChange={e => w.updateOutlineNode(chapter.id, { title: e.target.value })}
          />
        ) : (
          <span className="wrPageTitle">{nodeLabel(chapter)}</span>
        )}
        <span className="wrPageMeta">{formatWords(words(chapter.id))}</span>
      </div>
      {(['location', 'action'] as const).map(key => (
        <datalist key={key} id={`wr-${key}-options`}>
          {options[key].map(v => <option key={v} value={v} />)}
        </datalist>
      ))}
      {children.length === 0 && (
        <p className="wrPageMuted">
          {editable ? 'Nothing outlined yet. Add an act to begin.' : 'Nothing outlined yet. Switch to Outline to add acts, scenes and moments.'}
        </p>
      )}
      {children.map(renderNode)}
      {editable && (
        <div>
          <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => w.addOutlineNode(chapter.id, 'act')}><PlusIcon size={13} /> Act</button>
        </div>
      )}
    </div>
  )
}

export default ChapterOutline
