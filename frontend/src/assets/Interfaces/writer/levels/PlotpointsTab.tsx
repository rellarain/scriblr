import { useMemo } from 'react'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { AwarenessLegend } from '../AwarenessEye'
import { PlotpointTile } from '../PlotpointTile'
import { trayPlotpoints } from '../outline/outlineModel'
import { PlotOrderToggle, usePlotOrder } from '../plotOrder'
import { plotColorVars, plotColors } from '../plotColors'
import { textOf } from '../plotFields'
import { allPlacements, placedCount } from '../plotPlacement'
import { levelOfTarget, nodeLabel, orderPlacements } from '../plotTree'
import { useStoredState } from '../storage'

// The Project level's Plotpoints tab: the tray of every plotpoint, as tiles to drag onto a chapter, act, scene or moment card in the
// Outline (a plotpoint can be placed as many times as it likes; each tile says how many times, and a plotpoint stays in the tray); drop a
// placement's tile back here to take that placement away. A switch narrows the tray to the plotpoints still to place. Under it
// come the placements already in the open book, by the time of their scenes or in story order.
export function PlotTray({ w }: { w: WriterWorkspace }) {
  const outlineById = useMemo(() => new Map(w.outlineNodes.map(n => [n.id, n])), [w.outlineNodes])
  const [stillToPlace, setStillToPlace] = useStoredState('scriblr.writer.trayStillToPlace', false)
  const points = useMemo(() => trayPlotpoints(w.plotNodes, outlineById, w.plotNodeById, stillToPlace), [w.plotNodes, outlineById, w.plotNodeById, stillToPlace])
  const dragId = w.plotDragId
  const dragPlacementId = w.plotDragPlacementId
  return (
    <aside
      className="wrPlotTray" aria-label="Plotpoints"
      onDragOver={e => { if (dragId && dragPlacementId) e.preventDefault() }}
      onDrop={e => { e.preventDefault(); if (dragId && dragPlacementId) w.unplacePlotpoint(dragId, dragPlacementId); w.setPlotDragId(null) }}
    >
      <div className="wrChapterPointsHead">
        <span>Plotpoints</span><span className="wrOutlineMeta">{points.length}</span>
      </div>
      <label className="wrShowAssigned">
        <input type="checkbox" role="switch" checked={stillToPlace} onChange={e => setStillToPlace(e.target.checked)} />
        <span>Still to place</span>
      </label>
      <div className="wrChapterPointsList">
        {points.length === 0 && <p className="wrMuted">{stillToPlace ? 'Every plotpoint has a place. Add more in the Plot.' : 'No plotpoints yet. Add some in the Plot.'}</p>}
        {points.map(p => (
          <PlotpointTile
            key={p.id} w={w} point={p} variant="margin" dragging={dragId === p.id && !dragPlacementId} count={placedCount(p, outlineById)}
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

// The placements already in the open book, by the time of their scenes or in story order.
export function PlacedList({ w }: { w: WriterWorkspace }) {
  const [order] = usePlotOrder()
  const book = w.activeBook
  const placed = useMemo(() => {
    if (!book) return []
    const byId = new Map(w.outlineNodes.map(n => [n.id, n]))
    const inBook = new Set([book.id, ...descendantsOf(buildChildIndex(w.outlineNodes), book.id).map(n => n.id)])
    const mine = allPlacements(w.plotNodes).filter(e => inBook.has(e.placement.targetId) && levelOfTarget(e.placement.targetId, byId) !== 'none')
    return orderPlacements(mine, w.outlineNodes, w.activeProject?.settings.timeSystems ?? [], order)
  }, [book, w.outlineNodes, w.plotNodes, w.activeProject, order])
  if (!book) return null
  const target = (id: string | null) => w.outlineNodes.find(n => n.id === id)
  return (
    <div className="wrPlacedList">
      <div className="wrPanelHead">Placed in {nodeLabel(book)}<span className="wrOutlineMeta">{placed.length}</span></div>
      <PlotOrderToggle />
      {placed.length === 0 && <div className="wrMuted">None placed yet.</div>}
      {placed.map(({ point: p, placement }) => (
        <div key={placement.id} className="wrMidPoint" data-placed={p.id} style={plotColorVars(plotColors(p, w.plotNodeById))} title={textOf(p, w.plotNodeById).body || undefined}>
          {textOf(p, w.plotNodeById).title}
          <span className="wrMidPointAt">{nodeLabel(target(placement.targetId) ?? book)}</span>
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
