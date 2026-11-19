import type { DragEvent, KeyboardEvent } from 'react'
import type { PlotNode, PlotPlacement } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { CloseIcon } from '../../icons'
import { AwarenessEye } from './AwarenessEye'
import { textOf, valueHeader } from './plotFields'
import { plotColors, plotColorVars } from './plotColors'
import { PlotValueHead, PlotValuePlace } from './PlotValueHead'

// A plotpoint in the Outline level and in the tray, always in its category and subcategory colours, headed like its value card (PlotValueHead.tsx:
// category › subcategory › cluster at the top right, then the plotline, fieldset and field), then the title and the description.
//   'margin'  in the tray (and the compare view's list): the plotpoint itself, with how many
//             times it is placed (x3); it drags onto a chapter, act, scene or moment, to place it there once more.
//   'placed'  boxed inside the chapter, act, scene or moment it is placed on: one placement of the plotpoint, with its place among
//             them when there are several ("2 of 3"). Its x takes
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
  const head = valueHeader(point, w.plotNodeById)
  const text = textOf(point, w.plotNodeById)
  const colors = plotColors(point, w.plotNodeById, w.projectHue)
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
        <PlotValuePlace head={head} className="wrPointTileTrail" />
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
      <PlotValueHead head={head} />
      <div className="wrPointTileTitle">{text.title || 'Untitled'}</div>
      {text.body.trim() !== '' && <div className="wrPointTileBody">{text.body}</div>}
      {where !== undefined && <div className="wrPointTileWhere">{where}</div>}
    </div>
  )
}

export default PlotpointTile
