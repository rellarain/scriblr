import { useMemo } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { AwarenessLegend } from '../AwarenessEye'
import { PlotpointTile } from '../PlotpointTile'
import { unassignedPlotpoints } from '../outline/outlineModel'
import { PlotOrderToggle, usePlotOrder } from '../plotOrder'
import { plotColorVars, plotColors } from '../plotColors'
import { textOf } from '../plotFields'
import { assignedLevel, nodeLabel, orderAssignedPlotpoints } from '../plotTree'

// The Project level's Plotpoints tab: the plotpoints still waiting for a place, as tiles to drag onto a
// chapter, act, scene or moment card in the Outline (drop one back here to take it out of the outline
// again), and under them the plotpoints already placed in the open book, by the time of their scenes
// or in story order.
export function PlotTray({ w }: { w: WriterWorkspace }) {
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const points = useMemo(() => unassignedPlotpoints(w.plotNodes, outlineById, w.plotNodeById), [w.plotNodes, outlineById, w.plotNodeById])
  const dragId = w.plotDragId
  return (
    <aside
      className="wrPlotTray" aria-label="Unassigned plotpoints"
      onDragOver={e => { if (dragId) e.preventDefault() }}
      onDrop={e => { e.preventDefault(); if (dragId) w.assignPlotpoint(dragId, null); w.setPlotDragId(null) }}
    >
      <div className="wrChapterPointsHead">
        <span>Unassigned plotpoints</span><span className="wrOutlineMeta">{points.length}</span>
      </div>
      <div className="wrChapterPointsList">
        {points.length === 0 && <p className="wrMuted">Every plotpoint has a place. Add more in the Plot.</p>}
        {points.map(p => (
          <PlotpointTile
            key={p.id} w={w} point={p} variant="margin" dragging={dragId === p.id}
            drag={{
              onDragStart: e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); w.setPlotDragId(p.id) },
              onDragEnd: () => w.setPlotDragId(null),
            }}
          />
        ))}
      </div>
      <AwarenessLegend />
    </aside>
  )
}

// The plotpoints already placed in the open book, by the time of their scenes or in story order.
export function PlacedList({ w }: { w: WriterWorkspace }) {
  const [order] = usePlotOrder()
  const book = w.activeBook
  const placed = useMemo(() => {
    if (!book) return []
    const byId = new Map(w.outlineNodes.map(n => [n.id, n]))
    const inBook = new Set([book.id, ...descendantsOf(buildChildIndex(w.outlineNodes), book.id).map(n => n.id)])
    const mine = w.plotNodes.filter(p => p.kind === 'plotpoint' && p.assignedMomentId && inBook.has(p.assignedMomentId) && assignedLevel(p, byId) !== 'none')
    return orderAssignedPlotpoints(mine, w.outlineNodes, w.activeProject?.settings.timeSystems ?? [], order)
  }, [book, w.outlineNodes, w.plotNodes, w.activeProject, order])
  if (!book) return null
  const target = (id: string | null) => w.outlineNodes.find(n => n.id === id)
  return (
    <div className="wrPlacedList">
      <div className="wrPanelHead">Placed in {nodeLabel(book)}<span className="wrOutlineMeta">{placed.length}</span></div>
      <PlotOrderToggle />
      {placed.length === 0 && <div className="wrMuted">None placed yet.</div>}
      {placed.map(p => (
        <div key={p.id} className="wrMidPoint" data-placed={p.id} style={plotColorVars(plotColors(p, w.plotNodeById))} title={textOf(p, w.plotNodeById).body || undefined}>
          {textOf(p, w.plotNodeById).title}
          <span className="wrMidPointAt">{nodeLabel(target(p.assignedMomentId) ?? book)}</span>
        </div>
      ))}
    </div>
  )
}

export function PlotpointsTab({ w }: { w: WriterWorkspace }) {
  return (
    <div className="wrPlotpointsTab">
      <PlotTray w={w} />
      <PlacedList w={w} />
    </div>
  )
}

export default PlotpointsTab
