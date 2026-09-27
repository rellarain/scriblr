import type { KeyboardEvent } from 'react'
import { RAIL_TILE } from './tileShapes'
import type { TileDef } from './tileTypes'

// One minimized tile, collapsed to a plain icon-only button in the grid's shared
// rail (TileGrid.tsx) -- no title text, no summary, just the icon and a native
// tooltip. Clicking it restores the tile to mid, in its original tree position;
// its header becomes clickable again (to open its console) from there. Dragging a
// mid tile into this rail is the reverse -- see TileGrid.tsx's onRailDrop.
function RailTile({ def, onToggleTier }: { def: TileDef; onToggleTier: () => void }) {
  const { Icon } = def
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleTier() }
  }
  return (
    <button
      type="button" className="railTile" data-tile-id={def.id} data-shape="mini" data-fixed="true"
      style={{ width: RAIL_TILE, height: RAIL_TILE }}
      title={def.title} aria-label={def.title}
      onClick={onToggleTier} onKeyDown={onKeyDown}
    >
      <Icon size={18} />
    </button>
  )
}

export default RailTile
