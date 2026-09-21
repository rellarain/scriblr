import type { DragEvent } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { CloseIcon } from '../../icons'
import { AwarenessEye } from './AwarenessEye'
import { fieldNameOf, textOf } from './plotFields'
import { nodeLabel } from './plotTree'
import { plotColors, plotColorVars } from './plotColors'

// A plotpoint on the chapter page, always in its category and subcategory colours.
//   'margin'  in the left margin: assigned to the chapter, not yet placed. Shows category >
//             subcategory, the plotline and field, the title and the description. Its x sends
//             it back to the plot editor's field list; it drags onto an act, scene or moment.
//   'placed'  boxed inside the act, scene or moment it is placed on. Shows the plotline and
//             field, the title and the description. Its x returns it to the margin (Outline
//             mode); on a moment it also carries the awareness eye.
export function PlotpointTile({ w, point, variant, onUnassign, drag, dragging, onMoment }: {
  w: WriterWorkspace
  point: PlotNode
  variant: 'margin' | 'placed'
  onUnassign?: () => void
  drag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void }
  dragging?: boolean
  // Placed on a moment: the eye shows.
  onMoment?: boolean
}) {
  const plotline = point.parentId ? w.plotNodeById.get(point.parentId) : undefined
  const parent = plotline?.parentId ? w.plotNodeById.get(plotline.parentId) : undefined
  const category = parent?.kind === 'subcategory' ? (parent.parentId ? w.plotNodeById.get(parent.parentId) : undefined) : parent
  const subcategory = parent?.kind === 'subcategory' ? parent : undefined
  const trail = [category, subcategory].filter((n): n is PlotNode => Boolean(n)).map(nodeLabel).join(' › ')
  const text = textOf(point, w.plotNodeById)
  const field = fieldNameOf(point, w.plotNodeById)
  const colors = plotColors(point, w.plotNodeById)
  const highlighted = w.highlightedPointId === point.id

  return (
    <div
      className={`wrPointTile${dragging ? ' wrPointTile--dragging' : ''}${drag ? ' wrPointTile--draggable' : ''}${highlighted ? ' wrPointTile--highlight' : ''}`}
      data-point={point.id} style={plotColorVars(colors)}
      draggable={Boolean(drag)}
      onDragStart={drag?.onDragStart} onDragEnd={drag?.onDragEnd}
    >
      <div className="wrPointTileTop">
        {variant === 'margin' && <span className="wrPointTileTrail" title={trail}>{trail}</span>}
        <span className="wrPointTileTools">
          {onMoment && point.awareness && <AwarenessEye state={point.awareness} onCycle={() => w.cyclePlotAwareness(point.id)} size={15} />}
          {onUnassign && (
            <button
              type="button" className="wrPointTileX" aria-label={`Unassign ${text.title || 'plotpoint'}`}
              title={variant === 'margin' ? 'Return to the plot editor' : 'Return to the chapter margin'} onClick={onUnassign}
            >
              <CloseIcon size={12} />
            </button>
          )}
        </span>
      </div>
      <div className="wrPointTileLine">
        {plotline ? nodeLabel(plotline) : ''}{field && <span className="wrPointTileField"> · {field}</span>}
      </div>
      <div className="wrPointTileTitle">{text.title || 'Untitled'}</div>
      {text.body.trim() !== '' && <div className="wrPointTileLine wrPointTileBody">{text.body}</div>}
    </div>
  )
}

export default PlotpointTile
