import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons'
import { useNodeKeys } from '../../../../lib/nodeKeys'
import { buildChildIndex, descendantsOf, nearestOfKind, rollUpWordCounts } from '../outlineTree'
import { structureOfBook } from '../outline/outlineModel'
import { AutoTextarea } from '../shared'
import { useStoredState } from '../storage'
import { systemForBook } from '../timeSystem'
import { countWords, formatWords } from '../wordCount'
import { nodeLabel } from '../plotTree'
import { textOf } from '../plotFields'
import { placementsOf } from '../plotPlacement'
import { gradeLabel, readingGrade } from '../styleAids'
import { SceneChips } from './SceneChips'
import { MomentDraft, type ChapterDestination, type MomentPin, type MomentTools } from './MomentDraft'
import { useParagraphTools } from './useParagraphTools'
import { useStyleAids } from './useStyleAids'

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
  const [aids] = useStyleAids()
  const paragraphTools = useParagraphTools(w, chapter.id, draft)

  // Where a paragraph can be moved: the moments of each chapter of the book (this chapter first), named as the Draft names them.
  const destinations = useMemo<ChapterDestination[]>(() => {
    const chapters = book ? descendantsOf(index, book.id).filter(n => n.kind === 'chapter') : [chapter]
    const ordered = [chapter, ...chapters.filter(c => c.id !== chapter.id)]
    const sceneOf = (m: OutlineNode) => nearestOfKind(w.outlineNodes, m.id, 'scene')
    return ordered.map(c => {
      const number = numbers.chapter.get(c.id)
      return {
        id: c.id,
        label: number ? `Chapter ${number} · ${nodeLabel(c)}` : nodeLabel(c),
        moments: descendantsOf(index, c.id).filter(m => m.kind === 'moment' && !m.freeDraft).map(m => {
          const scene = sceneOf(m)
          const where = `Moment ${numbers.moment.get(m.id) ?? ''}`
          return {
            id: m.id,
            label: scene ? `Scene ${numbers.scene.get(scene.id) ?? ''} · ${where}` : where,
            detail: m.title.trim() || m.synopsis.trim() || 'No synopsis',
          }
        }),
      }
    })
  }, [index, book, chapter, numbers, w.outlineNodes])

  // Each moment's own placements, for the pins.
  const pinsByMoment = useMemo(() => {
    const map = new Map<string, MomentPin[]>()
    for (const point of w.plotNodes) {
      if (point.kind !== 'plotpoint') continue
      for (const placement of placementsOf(point)) {
        const list = map.get(placement.targetId) ?? []
        list.push({ pointId: point.id, placementId: placement.id, title: textOf(point, w.plotNodeById).title, paragraph: placement.paragraphIndex ?? null })
        map.set(placement.targetId, list)
      }
    }
    return map
  }, [w.plotNodes, w.plotNodeById])

  const toolsFor = (momentId: string): MomentTools => ({
    move: (paragraph, by) => paragraphTools.move(momentId, paragraph, by),
    split: offset => paragraphTools.split(momentId, offset),
    join: paragraph => paragraphTools.join(momentId, paragraph),
    moveTo: (paragraph, toChapter, toMoment, where) => paragraphTools.moveTo(momentId, paragraph, toChapter, toMoment, where),
    busy: paragraphTools.busy,
  })
  const momentDraft = (momentId: string, label: string, placeholder: string, value: string, onChange: (text: string) => void) => (
    <MomentDraft
      momentId={momentId} label={label} placeholder={placeholder} value={value} onChange={onChange} aids={aids} keyField="draft"
      tools={toolsFor(momentId)} destinations={destinations} chapterId={chapter.id}
      pins={pinsByMoment.get(momentId) ?? []} onPin={w.pinPlotpointParagraph}
    />
  )
  const grade = (momentId: string) => {
    if (!aids.read) return null
    const g = readingGrade(draft.bodies[momentId] ?? '')
    return g === null ? null : <span className="wrReadingLevel">Reading level: {gradeLabel(g)}</span>
  }

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
            {grade(node.id)}
          </div>
          {momentDraft(node.id, `Moment ${n} draft`, 'Start drafting this moment…', draft.bodies[node.id] ?? '', text => draft.setBody(node.id, text))}
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
            <SceneChips scene={node} scenes={scenes} system={system} projectId={w.activeProjectId} />
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
        {grade(freeNode.id)}
      </div>
      {momentDraft(freeNode.id, 'Free draft', 'Free draft…', freeBody, typeFree)}
      <span className="wrWordCount">{formatWords(words(freeNode.id))}</span>
    </div>
  ) : null

  return (
    <div className="wrDraftCards" onKeyDown={keys.onKeyDown} data-knode={chapter.id}>
      {paragraphTools.error && <p className="wrPageError" role="alert">{paragraphTools.error}</p>}
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
