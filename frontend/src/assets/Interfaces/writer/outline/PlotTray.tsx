import type { PlotNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { AwarenessLegend } from '../AwarenessEye'
import { PlotpointTile } from '../PlotpointTile'

// The plotpoints still waiting for a place: a column at the left of the Outline page.
// Drag one onto a chapter, act, scene or moment card to place it; drag a placed one
// back here to take it out of the outline again.
export function PlotTray({ w, points, dragId, onDragId }: {
  w: WriterWorkspace
  points: PlotNode[]
  dragId: string | null
  onDragId: (id: string | null) => void
}) {
  return (
    <aside
      className="wrChapterPoints wrPlotTray" aria-label="Unassigned plotpoints"
      onDragOver={e => { if (dragId) e.preventDefault() }}
      onDrop={e => { e.preventDefault(); if (dragId) w.assignPlotpoint(dragId, null); onDragId(null) }}
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
              onDragStart: e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); onDragId(p.id) },
              onDragEnd: () => onDragId(null),
            }}
          />
        ))}
      </div>
      <AwarenessLegend />
    </aside>
  )
}

export default PlotTray
