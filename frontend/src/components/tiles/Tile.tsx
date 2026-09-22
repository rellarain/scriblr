import type { DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { ChevronRightIcon, LayoutMidiIcon } from '../../assets/icons'
import { SHAPE_LABEL, isRowVersion, spanOf, type TileShape } from './tileShapes'
import type { TileDef } from './tileTypes'

// Anything inside a tile that does its own thing (a checkbox, an add box, a row that
// opens an item) must not also open the tile.
const OWN_CLICK = 'input, button, a, label, select, textarea, [data-quick]'

interface TileProps {
  def: TileDef
  shape: TileShape
  columns: number
  dragging: boolean
  dropTarget: boolean
  onOpen: () => void
  onCycleShape: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}

// One tile: read-only, showing what suits its shape. In one column a small or
// landscape tile becomes a row (icon, name, summary); a link tile is always
// just its name and summary.
function Tile({ def, shape, columns, dragging, dropTarget, onOpen, onCycleShape, onDragStart, onDragOver, onDrop, onDragEnd }: TileProps) {
  const oneColumn = columns <= 1
  const row = isRowVersion(shape, oneColumn)
  const link = shape === 'link'
  const span = spanOf(shape, columns)
  const { Icon } = def

  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(OWN_CLICK)) return
    onOpen()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
  }

  const classes = ['tile', `tile--${shape}`, row ? 'tile--row' : '', dragging ? 'tile--dragging' : '', dropTarget ? 'tile--drop' : ''].filter(Boolean).join(' ')
  return (
    <div
      className={classes} role="group" aria-label={def.title} tabIndex={0} data-tile-id={def.id} data-shape={shape}
      style={{ gridColumn: `span ${span.cols}`, gridRow: `span ${span.rows}` }}
      onClick={onClick} onKeyDown={onKeyDown} onDragOver={onDragOver} onDrop={onDrop}
    >
      <div className="tileHead" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <Icon size={16} />
        <button type="button" className="tileOpen" onClick={onOpen} aria-label={def.title}>{def.title}</button>
        {(link || row) && <span className="tileSummary">{def.summary}</span>}
        {link && <ChevronRightIcon size={14} />}
        {def.shapes.length > 1 && (
          <button
            type="button" className="tileShape" onClick={onCycleShape}
            aria-label={`Change shape of ${def.title} (now ${SHAPE_LABEL[shape].toLowerCase()})`}
            title={`Shape: ${SHAPE_LABEL[shape]}`}
          >
            <LayoutMidiIcon size={14} />
          </button>
        )}
      </div>
      {!link && !row && <div className="tileBody">{def.render ? def.render({ shape, oneColumn }) : <p className="tileSummary">{def.summary}</p>}</div>}
    </div>
  )
}

export default Tile
