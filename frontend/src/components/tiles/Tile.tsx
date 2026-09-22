import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent } from 'react'
import { ChevronRightIcon, LayoutMidiIcon } from '../../assets/icons'
import { contentTier, SHAPE_LABEL, type TileShape } from './tileShapes'
import type { Rect } from './splitTree'
import type { TileDef } from './tileTypes'

// Anything inside a tile that does its own thing (a checkbox, an add box, a row that
// opens an item) must not also open the tile.
const OWN_CLICK = 'input, button, a, label, select, textarea, [data-quick]'

interface TileProps {
  def: TileDef
  rect: Rect
  // Short and fixed-height (a link tile, or any tile a divider has squeezed that
  // short): name and a one-line summary only, no body.
  fixed: boolean
  oneColumn: boolean
  // The tile's own size preset (the shape-cycle button's current step), separate
  // from what its measured box actually shows.
  presetShape: TileShape
  dragging: boolean
  dropTarget: boolean
  onOpen: () => void
  onCycleShape: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}

// One tile: read-only, showing what its actual measured size earns. A tile the tree
// has made very short (a link tile, or any other dragged down to a strip) shows just
// its name and summary.
function Tile({ def, rect, fixed, oneColumn, presetShape, dragging, dropTarget, onOpen, onCycleShape, onDragStart, onDragOver, onDrop, onDragEnd }: TileProps) {
  const tier = fixed ? presetShape : contentTier(rect.w, rect.h, oneColumn, def.shapes, def.defaultShape)
  const { Icon } = def

  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(OWN_CLICK)) return
    onOpen()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
  }

  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.w, height: rect.h }
  const classes = ['tile', `tile--${tier}`, fixed ? 'tile--fixed' : '', dragging ? 'tile--dragging' : '', dropTarget ? 'tile--drop' : ''].filter(Boolean).join(' ')
  return (
    <div
      className={classes} role="group" aria-label={def.title} tabIndex={0} data-tile-id={def.id} data-shape={tier} data-fixed={fixed}
      style={style}
      onClick={onClick} onKeyDown={onKeyDown} onDragOver={onDragOver} onDrop={onDrop}
    >
      <div className="tileHead" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <Icon size={16} />
        <button type="button" className="tileOpen" onClick={onOpen} aria-label={def.title}>{def.title}</button>
        {fixed && <span className="tileSummary">{def.summary}</span>}
        {fixed && <ChevronRightIcon size={14} />}
        {def.shapes.length > 1 && (
          <button
            type="button" className="tileShape" onClick={onCycleShape}
            aria-label={`Change size of ${def.title} (now ${SHAPE_LABEL[presetShape].toLowerCase()})`}
            title={`Size: ${SHAPE_LABEL[presetShape]}`}
          >
            <LayoutMidiIcon size={14} />
          </button>
        )}
      </div>
      {!fixed && <div className="tileBody">{def.render ? def.render({ shape: tier, oneColumn, width: rect.w, height: rect.h }) : <p className="tileSummary">{def.summary}</p>}</div>}
    </div>
  )
}

export default Tile
