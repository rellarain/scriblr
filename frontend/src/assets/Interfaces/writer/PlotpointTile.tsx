import type { DragEvent, KeyboardEvent } from 'react'
import type { PlotNode, PlotPlacement } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { CloseIcon } from '../../icons'
import { AwarenessEye } from './AwarenessEye'
import { fieldNameOf, textOf } from './plotFields'
import { nodeLabel, plotTrail } from './plotTree'
import { plotColors, plotColorVars } from './plotColors'

// A plotpoint in the Outline level and in the tray, always in its category and subcategory colours.
//   'margin'  in the tray (and the compare view's list): the plotpoint itself. Shows category >
//             subcategory, the plotline and field, the title and the description, and how many
//             times it is placed (x3); it drags onto a chapter, act, scene or moment, to place it there once more.
//   'placed'  boxed inside the chapter, act, scene or moment it is placed on: one placement of the plotpoint, with its place among
//             them when there are several ("2 of 3"). Shows the plotline and field, the title and the description. Its x takes
//             this placement away (the plotpoint stays in the tray); on a moment it also carries the awareness eye of
//             this placement; it drags to another node, which moves it.
export function PlotpointTile({ w, point, placement, variant, onUnassign, unassignTitle, drag, dragging, onOpen, where, count, position }: {
  w: WriterWorkspace
  point: PlotNode
  // The placement a 'placed' tile stands for.
  placement?: PlotPlacement
  variant: 'margin' | 'placed'
  onUnassign?: () => void
  // The x's tooltip, when it is not the variant's usual one.
  unassignTitle?: string
  drag?: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void }
  dragging?: boolean
  // How many times the plotpoint is placed (the counter on a tile of the plotpoint itself).
  count?: number
  // A placement's place among its plotpoint's placements in story order (shown when there are several).
  position?: { n: number; of: number }
  // Makes the whole tile a button (the compare view's jump to the plotline's editor), and a line saying where it is placed.
  onOpen?: () => void
  where?: string
}) {
  const plotline = point.parentId ? w.plotNodeById.get(point.parentId) : undefined
  const trail = (plotline ? plotTrail(plotline, w.plotNodeById) : []).map(nodeLabel).join(' › ')
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
      {...(onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } } } : {})}
    >
      <div className="wrPointTileTop">
        {variant === 'margin' && <span className="wrPointTileTrail" title={trail}>{trail}</span>}
        <span className="wrPointTileTools">
          {count !== undefined && count > 0 && (
            <span className="wrCount" title={`Placed ${count === 1 ? 'once' : `${count} times`}`} aria-label={`Placed ${count === 1 ? 'once' : `${count} times`}`}>×{count}</span>
          )}
          {position && position.of > 1 && <span className="wrCount" title={`Place ${position.n} of ${position.of}`}>{position.n} of {position.of}</span>}
          {placement?.awareness && <AwarenessEye state={placement.awareness} onCycle={() => w.cyclePlotAwareness(point.id, placement.id)} size={15} />}
          {onUnassign && (
            <button
              type="button" className="wrPointTileX" aria-label={`Unassign ${text.title || 'plotpoint'}`}
              title={unassignTitle ?? 'Take this placement away'} onClick={onUnassign}
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
      {where !== undefined && <div className="wrPointTileWhere">{where}</div>}
    </div>
  )
}

export default PlotpointTile
