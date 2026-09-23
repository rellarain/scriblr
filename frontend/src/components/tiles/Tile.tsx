import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { LayoutMaxIcon } from '../../assets/icons'
import type { Rect } from './splitTree'
import { MINI_W } from './tileShapes'
import { opensConsole, type TileDef } from './tileTypes'

// Anything inside a tile that does its own thing (a checkbox, an add box, a row that
// opens an item) must not also open the tile.
const OWN_CLICK = 'input, button, a, label, select, textarea, [data-quick]'

interface TileProps {
  def: TileDef
  rect: Rect
  // Mini: a short, fixed-height strip (name and a one-line summary, no body). Mid:
  // the tile's own `render`, scaling with its measured box.
  fixed: boolean
  oneColumn: boolean
  dragging: boolean
  dropTarget: boolean
  // A dragged tile is hovering this tile's left/right edge margin -- dropping here
  // splits off a new column beside it, rather than swapping (null: not hovering an edge).
  edgeDrop: 'left' | 'right' | null
  onOpen: () => void
  onToggleTier: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}

// One tile, in one of its two read-only states: mini (short, fixed height -- just
// its name and summary) or mid (its own render, scaling with its actual measured
// size). The title toggles between them; the corner button opens the tile's console
// (max), when it has one.
function Tile({ def, rect, fixed, oneColumn, dragging, dropTarget, edgeDrop, onOpen, onToggleTier, onDragStart, onDragOver, onDrop, onDragEnd }: TileProps) {
  const { Icon } = def
  const canOpen = opensConsole(def) || Boolean(def.onOpen)

  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(OWN_CLICK)) return
    onToggleTier()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleTier() }
  }

  // A mini tile's leaf still reports its row's full width (splitTree.ts stacks
  // minis in a column that reads as one column overall) -- but its own card stays
  // one column wide, left-anchored, rather than stretching into a banner.
  const style: CSSProperties = { left: rect.x, top: rect.y, width: fixed ? Math.min(rect.w, MINI_W) : rect.w, height: rect.h }
  const classes = [
    'tile', fixed ? 'tile--mini' : 'tile--mid', dragging ? 'tile--dragging' : '',
    dropTarget ? 'tile--drop' : '', edgeDrop ? `tile--edge-${edgeDrop}` : '',
  ].filter(Boolean).join(' ')
  return (
    <div
      className={classes} role="group" aria-label={def.title} tabIndex={0} data-tile-id={def.id} data-shape={fixed ? 'mini' : 'mid'} data-fixed={fixed}
      style={style}
      onClick={onClick} onKeyDown={onKeyDown} onDragOver={onDragOver} onDrop={onDrop}
    >
      <div className="tileHead" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <Icon size={16} />
        <button type="button" className="tileOpen" onClick={onToggleTier} aria-expanded={!fixed} aria-label={def.title}>{def.title}</button>
        {fixed && <span className="tileSummary">{def.summary}</span>}
        {canOpen && (
          <button type="button" className="tileMax" onClick={onOpen} aria-label={`Open ${def.title}`} title={`Open ${def.title}`}>
            <LayoutMaxIcon size={14} />
          </button>
        )}
      </div>
      {!fixed && <div className="tileBody">{def.render ? def.render({ oneColumn, width: rect.w, height: rect.h }) : <p className="tileSummary">{def.summary}</p>}</div>}
    </div>
  )
}

export default Tile
