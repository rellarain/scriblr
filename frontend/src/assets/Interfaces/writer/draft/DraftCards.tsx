import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons'
import { useNodeKeys } from '../../../../lib/nodeKeys'
import { buildChildIndex, nearestOfKind, rollUpWordCounts } from '../outlineTree'
import { structureOfBook } from '../outline/outlineModel'
import { AutoTextarea } from '../shared'
import { useStoredState } from '../storage'
import { systemForBook } from '../timeSystem'
import { countWords, formatWords } from '../wordCount'
import { SceneChips } from './SceneChips'

export interface ChapterDraft {
  bodies: Record<string, string>
  setBody: (momentId: string, body: string) => void
}

// The chapter's draft as the right page of the open book: its acts, scenes and moments as
// read-only cards (the outline is edited in the Outline level), each moment's card wrapping an
// auto-growing text input with its live word count. Acts and scenes fold up; which are folded
// is remembered. A chapter with no outline is one free draft; a free draft that has text
// stays beside an outline as a card of its own.
export function DraftCards({ w, chapter, draft }: { w: WriterWorkspace; chapter: OutlineNode; draft: ChapterDraft }) {
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const nodeById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const book = useMemo(() => nearestOfKind(w.outlineNodes, chapter.id, 'book'), [w.outlineNodes, chapter.id])
  const { numbers, scenesOfChapter } = useMemo(() => structureOfBook(index, book?.id ?? chapter.id), [index, book, chapter.id])
  const scenes = scenesOfChapter.get(chapter.id) ?? []
  const system = useMemo(() => systemForBook(w.activeProject?.settings.timeSystems ?? [], book), [w.activeProject, book])
  const [openMap, setOpenMap] = useStoredState<Record<string, boolean>>('scriblr.writer.draftOpen', {})
  const isOpen = (id: string) => openMap[id] ?? true

  const wordCounts = useMemo(() => {
    const perMoment: Record<string, number> = {}
    for (const [id, body] of Object.entries(draft.bodies)) perMoment[id] = countWords(body)
    return rollUpWordCounts(index, chapter.id, perMoment)
  }, [draft.bodies, index, chapter.id])
  const words = (id: string) => wordCounts.get(id) ?? 0

  // Tab walks the moments' text (the outline cards have nothing to type into here).
  const keys = useNodeKeys({
    parentOf: id => { const p = nodeById.get(nodeById.get(id)?.parentId ?? ''); return p && p.id !== chapter.id ? p.id : null },
    siblingsOf: id => (index.get(nodeById.get(id)?.parentId ?? null) ?? []).filter(n => !n.freeDraft).map(n => n.id),
    isEmpty: () => false,
    createSibling: () => null,
    remove: () => {},
  })

  const children = (index.get(chapter.id) ?? []).filter(n => !n.freeDraft)
  const freeNode = (index.get(chapter.id) ?? []).find(n => n.freeDraft)
  const freeBody = freeNode ? draft.bodies[freeNode.id] ?? '' : ''

  // The free draft is created with the first text typed into it. Its id is kept until the node
  // shows up in the tree, so fast typing cannot create two.
  const freeIdRef = useRef<string | null>(null)
  if (freeNode) freeIdRef.current = freeNode.id
  else if (freeIdRef.current && nodeById.has(freeIdRef.current)) freeIdRef.current = null // it became an ordinary moment
  function typeFree(text: string) {
    const id = freeIdRef.current ?? w.addOutlineNode(chapter.id, 'moment', { freeDraft: true, order: -1 })
    freeIdRef.current = id
    draft.setBody(id, text)
  }
  // Once the free draft has shown up beside an outline it stays while it is being edited.
  const [freeShown, setFreeShown] = useState(false)
  useEffect(() => { if (freeBody.trim()) setFreeShown(true) }, [freeBody])

  const toggle = (node: OutlineNode, label: string) => {
    const open = isOpen(node.id)
    return (
      <button
        type="button" className="wrNodeToggle" aria-expanded={open} aria-label={`${open ? 'Fold' : 'Unfold'} ${label}`}
        onClick={() => setOpenMap(prev => ({ ...prev, [node.id]: !open }))}
      >
        {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
      </button>
    )
  }

  // Plain render functions (not components): a component defined in here would remount its text inputs on every keystroke.
  function renderNode(node: OutlineNode): ReactNode {
    const kids = (index.get(node.id) ?? []).filter(k => !k.freeDraft)
    const common = { 'data-node': node.id, 'data-knode': node.id }

    if (node.kind === 'moment') {
      const n = numbers.moment.get(node.id)
      return (
        <div key={node.id} {...common} className="wrMomentCard wrOutlineCard wrOutlineCard--readonly">
          <div className="wrMomentRow">
            <span className="wrNodeHandle"><span className="wrNodeLabel wrNodeLabel--num">{n}</span></span>
            <span className={node.synopsis ? 'wrNodeDescription' : 'wrNodeDescription wrNodeDescription--empty'}>{node.synopsis || 'No synopsis'}</span>
          </div>
          <AutoTextarea
            className="wrDraftText" placeholder="Start drafting this moment…" aria-label={`Moment ${n} draft`}
            value={draft.bodies[node.id] ?? ''} onChange={text => draft.setBody(node.id, text)} keyField="draft"
          />
          <span className="wrWordCount">{formatWords(words(node.id))}</span>
        </div>
      )
    }

    if (node.kind === 'scene') {
      const n = numbers.scene.get(node.id)
      const open = isOpen(node.id)
      return (
        <div key={node.id} {...common} className="wrSceneCard wrOutlineCard wrOutlineCard--readonly">
          <div className="wrSceneHead">
            <span className="wrNodeHandle">{toggle(node, `Scene ${n}`)}<span className="wrNodeLabel wrNodeLabel--num">{n}</span></span>
            <SceneChips scene={node} scenes={scenes} system={system} />
            {!open && <span className="wrWordCount wrFoldedCount">{formatWords(words(node.id))}</span>}
          </div>
          {open && <div className="wrChildren wrDraftChildren">{kids.map(renderNode)}</div>}
        </div>
      )
    }

    if (node.kind === 'act') {
      const n = numbers.act.get(node.id)
      const open = isOpen(node.id)
      return (
        <div key={node.id} {...common} className="wrActCard wrOutlineCard wrOutlineCard--readonly">
          <div className="wrActHead">
            <span className="wrNodeHandle">{toggle(node, `Act ${n}`)}<span className="wrNodeLabel wrNodeLabel--num">{n}</span></span>
            <span className={node.title ? 'wrNodeDescription' : 'wrNodeDescription wrNodeDescription--empty'}>{node.title || 'Untitled act'}</span>
            {!open && <span className="wrWordCount wrFoldedCount">{formatWords(words(node.id))}</span>}
          </div>
          {open && <div className="wrChildren wrDraftChildren">{kids.map(renderNode)}</div>}
        </div>
      )
    }
    return null
  }

  const freeCard = freeNode && children.length > 0 && (freeBody.trim() || freeShown) ? (
    <div key={freeNode.id} data-node={freeNode.id} className="wrMomentCard wrFreeCard wrOutlineCard wrOutlineCard--readonly">
      <div className="wrMomentRow">
        <span className="wrNodeHandle"><span className="wrNodeLabel wrNodeLabel--num">Free draft</span></span>
        <span className="wrNodeDescription wrNodeDescription--empty">Not part of the outline</span>
      </div>
      <AutoTextarea className="wrDraftText" placeholder="Free draft…" aria-label="Free draft" value={freeBody} onChange={typeFree} keyField="draft" />
      <span className="wrWordCount">{formatWords(words(freeNode.id))}</span>
    </div>
  ) : null

  return (
    <div className="wrDraftCards" onKeyDown={keys.onKeyDown} data-knode={chapter.id}>
      {children.length === 0 && (
        <>
          <p className="wrPageMuted">Nothing outlined yet. Draft freely below, or add acts, scenes and moments in the Outline.</p>
          <div className="wrFreeArea">
            <AutoTextarea className="wrDraftText" placeholder="Draft freely, no outline needed…" rows={6} value={freeBody} onChange={typeFree} />
            <span className="wrWordCount">{formatWords(freeNode ? words(freeNode.id) : 0)}</span>
          </div>
        </>
      )}
      {freeCard}
      <div className="wrChildren wrDraftChildren">{children.map(renderNode)}</div>
    </div>
  )
}

export default DraftCards
