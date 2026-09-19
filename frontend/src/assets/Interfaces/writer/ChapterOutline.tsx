import { useEffect, useMemo, useState } from 'react'
import type { OutlineNode } from '../../../api/types'
import type { ChapterMode, WriterWorkspace } from './useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon, GripIcon, PlusIcon } from '../../icons'
import { buildChildIndex, moveNode, rollUpWordCounts, scenesInOrder, sceneChanges, type ChildIndex } from './outlineTree'
import { AutoTextarea, DeleteControl } from './shared'
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

function ChapterOutline({ w, chapter, mode, draft }: {
  w: WriterWorkspace
  chapter: OutlineNode
  mode: ChapterMode
  draft: ChapterDraft
}) {
  const editable = mode === 'outline'
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

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
    const unique = (key: 'location' | 'time' | 'action') =>
      [...new Set(w.outlineNodes.filter(n => n.kind === 'scene').map(n => n[key] ?? '').filter(Boolean))]
    return { location: unique('location'), time: unique('time'), action: unique('action') }
  }, [w.outlineNodes])

  // Where a drop lands: onto a shallower kind it goes inside (appended);
  // onto its own kind it goes before that sibling. Null = not allowed here.
  function dropMode(targetId: string): 'inside' | 'before' | null {
    if (!dragId) return null
    const target = w.outlineNodes.find(n => n.id === targetId)
    const dragged = w.outlineNodes.find(n => n.id === dragId)
    if (!target || !dragged) return null
    const dropAs = target.kind === dragged.kind ? 'before' : 'inside'
    return moveNode(w.outlineNodes, dragId, targetId, dropAs) ? dropAs : null
  }

  function endDrag() { setDragId(null); setOverId(null) }

  const dropProps = (id: string) => !editable ? {} : {
    onDragOver: (e: React.DragEvent) => {
      if (!dropMode(id)) return // not a valid target: let a parent card claim it
      e.preventDefault()
      e.stopPropagation()
      if (overId !== id) setOverId(id)
    },
    onDrop: (e: React.DragEvent) => {
      const dropAs = dropMode(id)
      if (!dropAs || !dragId) return
      e.preventDefault()
      e.stopPropagation()
      w.moveOutlineNodeTo(dragId, id, dropAs)
      endDrag()
    },
  }

  // Plain render functions (not components): a component defined inside this
  // one would remount its inputs on every keystroke.
  const grip = (id: string) => {
    if (!editable) return null
    return (
      <span
        className="wrGrip wrGrip--light" draggable aria-label="Drag to reorder" title="Drag to reorder"
        onDragStart={e => {
          e.stopPropagation()
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', id)
          const card = (e.currentTarget as HTMLElement).closest('[data-node]')
          if (card) e.dataTransfer.setDragImage(card, 12, 12)
          setDragId(id)
        }}
        onDragEnd={endDrag}
      >
        <GripIcon size={14} />
      </span>
    )
  }

  function cardClass(base: string, id: string) {
    return `${base}${dragId === id ? ' wrOutlineCard--dragging' : ''}${overId === id ? ' wrOutlineCard--over' : ''}${editable ? '' : ' wrOutlineCard--readonly'}`
  }

  const sceneFields = (scene: OutlineNode) => {
    const at = scenes.findIndex(s => s.id === scene.id)
    const changes = sceneChanges(scene, at > 0 ? scenes[at - 1] : undefined)
    const label = { location: 'Location', time: 'Time', action: 'Action' } as const
    const field = (key: 'location' | 'time' | 'action') => editable ? (
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
    return <div className="wrSceneFields">{field('location')}{field('time')}{field('action')}</div>
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
    <div className="wrPage wrPage--outline" {...dropProps(chapter.id)}>
      <div className="wrPageHead">
        <span className="wrPageKicker">Chapter {chapterNumber}</span>
        {editable ? (
          <input
            className="wrPageTitleInput" value={chapter.title} placeholder="Chapter title"
            onChange={e => w.updateOutlineNode(chapter.id, { title: e.target.value })}
          />
        ) : (
          <span className="wrPageTitle">{chapter.title}</span>
        )}
        <span className="wrPageMeta">{formatWords(words(chapter.id))}</span>
      </div>
      {(['location', 'time', 'action'] as const).map(key => (
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
