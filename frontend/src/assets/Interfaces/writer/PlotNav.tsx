import { useMemo, useState } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ChevronRightIcon, PlusIcon } from '../../icons'
import { plotColors, plotColorVars } from './plotColors'
import { nodeLabel, plotlinesUnder, selectionState, sortByTitle } from './plotTree'

// The Plot tool's contents: categories > subcategories > clusters > plotlines, alphabetized, each with a checkbox. A plotline's
// checkbox ticks that plotline; a group's ticks (or unticks) every plotline under it and shows "some" when only part of it is
// ticked. Two or more ticked plotlines open the compare view (PlotCompare.tsx); "Compare (n)" brings it back after browsing.

export function plotlineCount(node: PlotNode, children: Map<string | null, PlotNode[]>): number {
  return plotlinesUnder(node, children).length
}

export function PlotNav({ w, onOpenNode, onCompare }: {
  w: WriterWorkspace
  // A row's name was chosen (its editor opens): the contents bar closes its drawer.
  onOpenNode?: () => void
  onCompare?: () => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const children = w.plotChildrenByParentId
  const selected = useMemo(() => new Set(w.plotSelection), [w.plotSelection])
  const ticked = w.plotSelection.filter(id => w.plotNodeById.get(id)?.kind === 'plotline').length

  // Everything is open by default; the chevron collapses a branch.
  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  // Each level of nesting is indented 14px, so a plotline reads as belonging to what it sits directly under.
  function rows(parentId: string | null, depth: number): React.ReactNode[] {
    return sortByTitle((children.get(parentId) ?? []).filter(n => n.kind !== 'plotpoint'))
      .flatMap(node => {
        const kids = (children.get(node.id) ?? []).filter(c => c.kind !== 'plotpoint')
        const hasKids = kids.length > 0
        const open = !collapsed.has(node.id)
        const isLine = node.kind === 'plotline'
        const lines = plotlinesUnder(node, children)
        const state = selectionState(node, children, selected)
        return [
          <div
            key={node.id}
            className={`wrNavRow wrNavRow--${node.kind}${node.id === w.focusedPlotNodeId ? ' wrNavRow--active' : ''}`}
            style={{ ...plotColorVars(plotColors(node, w.plotNodeById)), marginLeft: depth * 14 }}
          >
            <button
              type="button" className="wrNavChevron" aria-label={open ? 'Collapse' : 'Expand'}
              style={{ visibility: hasKids ? 'visible' : 'hidden', transform: open ? 'rotate(90deg)' : undefined }}
              onClick={() => toggle(node.id)}
            >
              <ChevronRightIcon size={12} />
            </button>
            <input
              type="checkbox" className="wrNavCheck" aria-label={`Select ${nodeLabel(node)}`}
              checked={state === 'all'} disabled={lines.length === 0}
              ref={el => { if (el) el.indeterminate = state === 'some' }}
              onChange={() => w.togglePlotSelection(lines.map(l => l.id), state !== 'all')}
            />
            <button type="button" className="wrNavLabel" onClick={() => { w.focusPlotNode(node.id); onOpenNode?.() }}>{nodeLabel(node)}</button>
            {!isLine && <span className="wrNavCount">{lines.length}</span>}
          </div>,
          ...(open ? rows(node.id, depth + 1) : []),
        ]
      })
  }

  return (
    <div className="wrPlotNav">
      <div className="wrPlotNavHead">
        <span>Categories</span>
        <button type="button" className="wrSmallBtn" onClick={() => { w.focusPlotNode(w.addPlotNode(null, 'category')); onOpenNode?.() }}>
          <PlusIcon size={13} /> Category
        </button>
      </div>
      {ticked > 0 && (
        <div className="wrPlotNavPicked">
          {ticked >= 2 && onCompare
            ? <button type="button" className="wrSmallBtn wrSmallBtn--accent" onClick={onCompare}>Compare ({ticked})</button>
            : <span className="wrOutlineMeta">{ticked} selected</span>}
          <button type="button" className="wrNavClear" onClick={() => w.setPlotSelection([])}>Clear</button>
        </div>
      )}
      <div className="wrPlotNavRows">
        {w.plotNodes.length === 0 && <p className="wrMuted">No categories yet.</p>}
        {rows(null, 0)}
      </div>
    </div>
  )
}
