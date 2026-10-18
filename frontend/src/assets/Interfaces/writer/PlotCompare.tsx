import { useMemo, useState } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon, CloseIcon } from '../../icons'
import { booksOf, chaptersOfBook } from './outlineTree'
import { PlotOutlinePanel } from './PlotOutlinePanel'
import { PlotParents } from './PlotParents'
import { PlotpointTile } from './PlotpointTile'
import { PlotOrderToggle, usePlotOrder } from './plotOrder'
import { orderValues } from './plotFields'
import { plotColors, plotColorVars } from './plotColors'
import { chapterOfAssignment, nodeLabel, plotTrail } from './plotTree'
import { COMPARE_BREAKPOINTS, COMPARE_COLUMNS_FROM, useElementWidth, type PlotSize } from './useElementWidth'
import { useStoredState } from './storage'

// The compare view: the plotpoints of the ticked plotlines in one list, read-only (a card opens its plotline's editor).
//   chips      one per plotline, in its plot colours: click hides or shows its cards, the x unticks it
//   order      the shared toggle (a clock: by the time of each scene; an open book: in story order), unassigned ones first
//   group      "Group by plotline" gives each plotline a header; on a wide tile they stand side by side as columns, on a narrow one
//              as sections that fold
//   chapters   the books-and-chapters panel with every shown plotline's chips: beside the list on a wide tile, a fold-out under it otherwise

const trailOf = (line: PlotNode, byId: Map<string, PlotNode>) => [...plotTrail(line, byId), line].map(nodeLabel).join(' › ')

export function PlotCompare({ w, lines, size, onOpen, onOpenNode, openParents, onToggleParent, onDeselect }: {
  w: WriterWorkspace
  lines: PlotNode[]
  size: PlotSize
  // A card was chosen: open its plotline's editor (and point at the plotpoint).
  onOpen: (plotlineId: string, pointId: string) => void
  onDeselect: (plotlineId: string) => void
  // A parent chip's title was chosen in a group header: open that category, subcategory or cluster's editor.
  onOpenNode: (nodeId: string) => void
  // The levels whose parent chips are left open (shared with the editors) and the click that opens or closes one.
  openParents: Set<string>
  onToggleParent: (kind: PlotNode['kind']) => void
}) {
  const [plotOrder] = usePlotOrder()
  const [grouped, setGrouped] = useStoredState<boolean>('scriblr.writer.plotCompareGrouped', false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [rootRef, width] = useElementWidth<HTMLDivElement>(COMPARE_BREAKPOINTS)
  const columns = grouped && (width === null || width >= COMPARE_COLUMNS_FROM)

  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  // "2 · Storm": a chapter's number within its book, and its title.
  const chapterNumber = useMemo(() => {
    const map = new Map<string, number>()
    for (const book of booksOf(w.outlineNodes)) chaptersOfBook(w.outlineNodes, book.id).forEach((c, i) => map.set(c.id, i + 1))
    return map
  }, [w.outlineNodes])

  const shown = lines.filter(l => !hidden.has(l.id))
  const shownKey = shown.map(l => l.id).join('|')
  const ordered = useMemo(
    () => { const ids = new Set(shownKey.split('|')); return orderValues(
      w.plotNodes.filter(p => p.kind === 'plotpoint' && p.parentId !== null && ids.has(p.parentId)),
      w.outlineNodes, w.activeProject?.settings.timeSystems ?? [], plotOrder,
    ) },
    [w.plotNodes, w.outlineNodes, w.activeProject, plotOrder, shownKey],
  )

  const whereOf = (p: PlotNode): string => {
    const chapter = chapterOfAssignment(p, outlineById)
    return chapter ? `${chapterNumber.get(chapter.id) ?? ''} · ${nodeLabel(chapter)}` : 'Not placed yet'
  }
  const card = (p: PlotNode) => (
    <PlotpointTile key={p.id} w={w} point={p} variant="margin" where={whereOf(p)} onOpen={() => p.parentId && onOpen(p.parentId, p.id)} />
  )
  const toggleIn = (set: Set<string>, id: string) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next }

  const list = !grouped
    ? <div className="wrCompareList">{ordered.length === 0 ? <p className="wrMuted">No plotpoints in the shown plotlines yet.</p> : ordered.map(card)}</div>
    : (
      <div className={columns ? 'wrCompareGroups wrCompareGroups--columns' : 'wrCompareGroups'}>
        {shown.map(line => {
          const mine = ordered.filter(p => p.parentId === line.id)
          const open = columns || !folded.has(line.id)
          return (
            <section key={line.id} className="wrCompareGroup" style={plotColorVars(plotColors(line, w.plotNodeById))} aria-label={trailOf(line, w.plotNodeById)}>
              {columns
                ? <h4 className="wrCompareGroupHead"><span>{trailOf(line, w.plotNodeById)}</span><span className="wrOutlineMeta">{mine.length}</span></h4>
                : (
                  <button type="button" className="wrCompareGroupHead wrCompareGroupHead--fold" aria-expanded={open} onClick={() => setFolded(prev => toggleIn(prev, line.id))}>
                    {open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                    <span>{trailOf(line, w.plotNodeById)}</span><span className="wrOutlineMeta">{mine.length}</span>
                  </button>
                )}
              {open && <PlotParents node={line} byId={w.plotNodeById} open={openParents} onToggle={onToggleParent} onOpen={onOpenNode} />}
              {open && <div className="wrCompareGroupBody">{mine.length === 0 ? <p className="wrMuted">No plotpoints yet.</p> : mine.map(card)}</div>}
            </section>
          )
        })}
      </div>
    )

  const panel = <PlotOutlinePanel w={w} plotlines={shown} dragId={null} onDropChapter={() => {}} readOnly />

  return (
    <div className={`wrCompare wrCompare--${size}`} ref={rootRef}>
      <div className="wrCompareChips" role="group" aria-label="Plotlines being compared">
        {lines.map(line => {
          const off = hidden.has(line.id)
          return (
            <span key={line.id} className={off ? 'wrCompareChip wrCompareChip--off' : 'wrCompareChip'} style={plotColorVars(plotColors(line, w.plotNodeById))}>
              <button
                type="button" className="wrCompareChipName" aria-pressed={!off} title={off ? 'Show its plotpoints' : 'Hide its plotpoints'}
                onClick={() => setHidden(prev => toggleIn(prev, line.id))}
              >
                {trailOf(line, w.plotNodeById)}
              </button>
              <button type="button" className="wrCompareChipX" aria-label={`Deselect ${nodeLabel(line)}`} title="Take it out of the comparison" onClick={() => onDeselect(line.id)}>
                <CloseIcon size={12} />
              </button>
            </span>
          )
        })}
      </div>
      <div className="wrCompareControls">
        <PlotOrderToggle />
        <label className="wrShowAssigned">
          <input type="checkbox" role="switch" checked={grouped} onChange={e => setGrouped(e.target.checked)} />
          <span>Group by plotline</span>
        </label>
        <span className="wrOutlineMeta">{ordered.length} {ordered.length === 1 ? 'plotpoint' : 'plotpoints'}</span>
      </div>
      {size === 'wide'
        ? <div className="wrCompareBody">{list}<div className="wrCompareChapters">{panel}</div></div>
        : (
          <>
            {list}
            <div className="wrCompareFold">
              <button type="button" className="wrCompareGroupHead wrCompareGroupHead--fold" aria-expanded={chaptersOpen} onClick={() => setChaptersOpen(o => !o)}>
                {chaptersOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}<span>Chapters</span>
              </button>
              {chaptersOpen && panel}
            </div>
          </>
        )}
    </div>
  )
}

export default PlotCompare
