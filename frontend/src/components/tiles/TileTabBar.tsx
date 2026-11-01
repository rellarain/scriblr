import type { ComponentType } from 'react'
import type { IconProps } from '../../assets/icons'
import { dragJustEnded, startBarDrag } from './tileDragBus'

export interface BarTile { id: string; label: string; Icon: ComponentType<IconProps> }

// A console's tab bar: one icon per tile, pressed while the tile is open and not while it is minimized. Press one to open
// or minimize that tile; drag a tile onto the bar to minimize it, or an icon out of it to put the tile back in the layout.
// (The Writer's levels draw their own bar in the level's header with the same attributes, LevelTabs.tsx.)
function TileTabBar({ gridId, tiles, isOpen, onToggle, label = 'Tiles', size = 18 }: {
  gridId: string
  tiles: BarTile[]
  isOpen: (id: string) => boolean
  onToggle: (id: string) => void
  label?: string
  size?: number
}) {
  return (
    <div className="tileTabBar" role="toolbar" aria-label={label} data-tile-bar={gridId}>
      {tiles.map(t => {
        const on = isOpen(t.id)
        return (
          <button
            key={t.id} type="button" data-tab-id={t.id} className={on ? 'tileTabBtn tileTabBtn--on' : 'tileTabBtn'} aria-label={t.label} title={t.label} aria-pressed={on}
            onPointerDown={e => { if (e.button === 0) startBarDrag(gridId, t.id, e) }}
            onClick={() => { if (!dragJustEnded()) onToggle(t.id) }}
          >
            <t.Icon size={size} />
          </button>
        )
      })}
    </div>
  )
}

export default TileTabBar
