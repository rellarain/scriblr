import type { DragEvent } from 'react'
import type { PlotNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { CloseIcon } from '../../icons'
import { nodeLabel } from './plotTree'
import { nodeColorStyle, plotColors } from './plotColors'

// A plotpoint on the chapter page, in the chapter's left column and boxed
// inside the act / scene / moment it is assigned to:
//   category and subcategory  small, subtle, top right
//   plotline title            a new line, slightly larger and brighter
//   plotpoint title           a new line, larger and brighter still
//   description               same size and color as the plotline title
// `onUnassign` adds an x (Outline mode); `drag` makes the tile draggable.
export function PlotpointTile({ w, point, onUnassign, drag, dragging }: {
  w: WriterWorkspace
  point: PlotNode
  onUnassign?: () => void
  drag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void }
  dragging?: boolean
}) {
  const plotline = point.parentId ? w.plotNodeById.get(point.parentId) : undefined
  const parent = plotline?.parentId ? w.plotNodeById.get(plotline.parentId) : undefined
  const category = parent?.kind === 'subcategory' ? (parent.parentId ? w.plotNodeById.get(parent.parentId) : undefined) : parent
  const subcategory = parent?.kind === 'subcategory' ? parent : undefined
  const trail = [category, subcategory].filter((n): n is PlotNode => Boolean(n)).map(nodeLabel).join(' › ')
  const colors = plotColors(point, w.plotNodeById)

  return (
    <div
      className={`wrPointTile${dragging ? ' wrPointTile--dragging' : ''}${drag ? ' wrPointTile--draggable' : ''}`}
      data-point={point.id} style={nodeColorStyle(colors.primary)}
      draggable={Boolean(drag)}
      onDragStart={drag?.onDragStart} onDragEnd={drag?.onDragEnd}
    >
      <div className="wrPointTileTop">
        <span className="wrPointTileTrail" title={trail}>
          {category && colors.category && <span className="wrColorDot" style={{ backgroundColor: colors.category }} />}
          {category && nodeLabel(category)}
          {subcategory && colors.subcategory && (
            <>
              <span className="wrPointTileSep"> › </span>
              <span className="wrColorDot" style={{ backgroundColor: colors.subcategory }} />
              {nodeLabel(subcategory)}
            </>
          )}
        </span>
        {onUnassign && (
          <button
            type="button" className="wrPointTileX" aria-label={`Unassign ${point.title || 'plotpoint'}`}
            title="Unassign from this card" onClick={onUnassign}
          >
            <CloseIcon size={12} />
          </button>
        )}
      </div>
      {plotline && <div className="wrPointTileLine">{nodeLabel(plotline)}</div>}
      <div className="wrPointTileTitle">{point.title || 'Untitled'}</div>
      {point.body.trim() !== '' && <div className="wrPointTileLine wrPointTileBody">{point.body}</div>}
    </div>
  )
}

export default PlotpointTile
