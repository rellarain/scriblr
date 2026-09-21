import { useMemo, useState } from 'react'
import type { OutlineNode, PlotNode } from '../../../api/types'
import { accentColorCss, bookThemeHue, themeColorCss } from '../../../theme/bookColors'
import { useThemeState } from '../../../theme/useTheme'
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, LockIcon } from '../../icons'
import { AwarenessEye } from './AwarenessEye'
import { buildChildIndex, chaptersOfBook } from './outlineTree'
import { pointLook } from './plotCardColors'
import { textOf } from './plotFields'
import { nodeLabel } from './plotTree'
import type { WriterWorkspace } from './useWriterWorkspace'

// The plotline editor's outline: the project's series, books, arcs and chapters as nested
// cards. Only chapters take plotpoints (dragged from the field lists). Book and arc cards
// wear the book's primary colour, chapters a muted shade of its secondary colour. A chapter
// lists this plotline's plotpoints assigned to it in one wrapping row of boxes, each with an
// icon on the right: an x while it is only assigned to the chapter, the awareness eye once it
// is placed on a moment, a lock on an act or scene.
const SHOWN = new Set(['series', 'book', 'arc', 'chapter'])

export function PlotOutlinePanel({ w, plotline, dragId, onDropChapter }: {
  w: WriterWorkspace
  plotline: PlotNode
  dragId: string | null
  onDropChapter: (chapterId: string) => void
}) {
  const { activeZone } = useThemeState()
  const index = useMemo(() => buildChildIndex(w.outlineNodes), [w.outlineNodes])
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [overId, setOverId] = useState<string | null>(null)
  const toggle = (id: string) => setCollapsed(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const points = w.plotNodes.filter(p => p.kind === 'plotpoint' && p.parentId === plotline.id)
  const looks = new Map(points.map(p => [p.id, pointLook(p, w.outlineNodes, outlineById, w.plotNodeById, activeZone)]))

  function chip(p: PlotNode, chapter: OutlineNode) {
    const look = looks.get(p.id)!
    const target = p.assignedMomentId ? outlineById.get(p.assignedMomentId) : undefined
    const text = textOf(p, w.plotNodeById)
    let icon: React.ReactNode
    if (look.level === 'chapter') {
      icon = (
        <button type="button" className="wrPlotChipX" aria-label={`Unassign ${text.title || 'plotpoint'}`} title="Remove from the chapter" onClick={() => w.assignPlotpoint(p.id, null)}>
          <CloseIcon size={13} />
        </button>
      )
    } else if (target?.kind === 'moment' && p.awareness) {
      icon = <AwarenessEye state={p.awareness} size={15} onCycle={() => w.cyclePlotAwareness(p.id)} />
    } else {
      icon = <span className="wrPlotValueLock" title="Placed in the chapter outline. Unassign it there first."><LockIcon size={13} /></span>
    }
    return (
      <span key={p.id} className="wrPlotChip" data-point={p.id} style={look.style}>
        <button
          type="button" className="wrPlotChipTitle" title={`Open ${nodeLabel(chapter)}`}
          onClick={() => { w.openChapter(chapter.id, 'outline'); w.highlightPlotpoint(p.id) }}
        >
          {text.title || 'Untitled'}
        </button>
        {icon}
      </span>
    )
  }

  function chapterCard(chapter: OutlineNode, number: number, hues: { themeHue: number; accentHue: number }) {
    const inChapter = points.filter(p => looks.get(p.id)?.chapterId === chapter.id)
    const over = overId === chapter.id
    return (
      <div
        key={chapter.id} data-chapter={chapter.id}
        className={`wrPlotChapter${over ? ' wrPlotChapter--over' : ''}`}
        style={{ ['--wr-plot-card' as string]: themeColorCss(hues.accentHue) }}
        onDragOver={e => { if (dragId) { e.preventDefault(); setOverId(chapter.id) } }}
        onDragLeave={() => setOverId(prev => (prev === chapter.id ? null : prev))}
        onDrop={e => { e.preventDefault(); setOverId(null); if (dragId) onDropChapter(chapter.id) }}
      >
        <div className="wrPlotCardTitle">{number} · {nodeLabel(chapter)}</div>
        {inChapter.length > 0 && <div className="wrPlotChips">{inChapter.map(p => chip(p, chapter))}</div>}
      </div>
    )
  }

  function card(node: OutlineNode, book: OutlineNode | undefined, chapterNumbers: Map<string, number>): React.ReactNode {
    const kids = (index.get(node.id) ?? []).filter(k => SHOWN.has(k.kind))
    if (node.kind === 'chapter') {
      const themeHue = book ? bookThemeHue(book) : bookThemeHue({})
      return chapterCard(node, chapterNumbers.get(node.id) ?? 0, { themeHue, accentHue: book?.accentHue ?? themeHue })
    }
    const isBook = node.kind === 'book'
    const b = isBook ? node : book
    const themeHue = b ? bookThemeHue(b) : null
    const isOpen = !collapsed.has(node.id)
    const style = themeHue === null ? undefined : { ['--wr-plot-card' as string]: themeColorCss(themeHue), ['--wr-plot-edge' as string]: accentColorCss(b?.accentHue ?? themeHue) }
    const numbers = isBook ? new Map(chaptersOfBook(w.outlineNodes, node.id).map((c, i) => [c.id, i + 1])) : chapterNumbers
    return (
      <div key={node.id} className={`wrPlotCard wrPlotCard--${node.kind}`} style={style}>
        <button type="button" className="wrPlotCardHead" aria-expanded={isOpen} onClick={() => toggle(node.id)}>
          {isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          <span className="wrPlotCardKind">{node.kind}</span>
          <span className="wrPlotCardName">{nodeLabel(node)}</span>
        </button>
        {isOpen && kids.length > 0 && <div className="wrPlotCardKids">{kids.map(k => card(k, b, numbers))}</div>}
      </div>
    )
  }

  const roots = (index.get(null) ?? []).filter(n => SHOWN.has(n.kind))
  return (
    <div className="wrOutlinePanel">
      <div className="wrChildRowsHead">
        <span className="wrLabel">Books and chapters</span>
        <span className="wrOutlineMeta">Drop a plotpoint on a chapter</span>
      </div>
      {roots.length === 0 && <p className="wrMuted">No books yet.</p>}
      <div className="wrPlotOutline">{roots.map(n => card(n, undefined, new Map()))}</div>
    </div>
  )
}

export default PlotOutlinePanel
