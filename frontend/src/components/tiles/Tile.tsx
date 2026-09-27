import type { CSSProperties, DragEvent, KeyboardEvent } from 'react'
import { opensConsole, type TileDef } from './tileTypes'
import type { Rect } from './splitTree'

interface TileProps {
  def: TileDef
  rect: Rect
  oneColumn: boolean
  dragging: boolean
  dropTarget: boolean
  // A dragged tile is hovering this tile's edge margin -- dropping here splits off
  // a new column/row beside/below it, rather than swapping (null: not hovering an edge).
  edgeDrop: 'left' | 'right' | 'top' | 'bottom' | null
  onOpen: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}

// One tile, read-only, scaling with its own measured box. Its header opens the
// tile's console (max), when it has one; clicking its body does nothing -- the
// body's own quick actions (a checkbox, an add box) are the only things it responds
// to. The whole tile (not just the header) is the drag handle: dragging it onto
// another tile swaps or edge-splits as usual, and dragging it into the grid's
// shared icon rail (TileGrid.tsx) minimizes it.
function Tile({ def, rect, oneColumn, dragging, dropTarget, edgeDrop, onOpen, onDragStart, onDragOver, onDrop, onDragEnd }: TileProps) {
  const { Icon } = def
  const canOpen = opensConsole(def) || Boolean(def.onOpen)

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if ((e.key === 'Enter' || e.key === ' ') && canOpen) { e.preventDefault(); onOpen() }
  }

  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.w, height: rect.h }
  const classes = [
    'tile', 'tile--mid', dragging ? 'tile--dragging' : '',
    dropTarget ? 'tile--drop' : '', edgeDrop ? `tile--edge-${edgeDrop}` : '',
  ].filter(Boolean).join(' ')
  return (
    <div
      className={classes} role="group" aria-label={def.title} tabIndex={0} data-tile-id={def.id} data-shape="mid" data-fixed="false"
      style={style}
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      onDragOver={onDragOver} onDrop={onDrop} onKeyDown={onKeyDown}
    >
      <div className="tileHead">
        <div className="tileHeadMain">
          <Icon size={16} />
          <button
            type="button" className="tileOpen" disabled={!canOpen} onClick={canOpen ? onOpen : undefined}
            aria-label={canOpen ? `Open ${def.title}` : def.title}
          >
            {def.title}
          </button>
        </div>
      </div>
      <div className="tileBody">{def.render ? def.render({ oneColumn, width: rect.w, height: rect.h }) : <p className="tileSummary">{def.summary}</p>}</div>
    </div>
  )
}

export default Tile
