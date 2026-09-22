import { createContext, useContext, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import Tile from './Tile'
import TileConsole from './TileConsole'
import { columnsFor } from './tileShapes'
import { nextFocus, type Box, type Direction } from './tileNav'
import { opensConsole, type TileDef } from './tileTypes'
import { useContainerWidth } from './useContainerWidth'
import { useTileLayout } from './useTileLayout'
import './tiles.scss'

export interface Crumb { label: string; onClick?: () => void }

export type CornerPanel = 'settings' | 'help'

// What a tile's content can ask of the grid it is in: open a tile of it (and,
// optionally, its Settings or Help panel).
export interface TileHost { open: (id: string, panel?: CornerPanel) => void }
const TileHostContext = createContext<TileHost>({ open: () => {} })
export const useTileHost = (): TileHost => useContext(TileHostContext)

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

// A responsive grid of tiles. It lays itself out by its own width (one column
// below 400px), remembers each tile's shape and the order the user gave them,
// and expands a selected tile into its console over the grid's whole area.
//
//   - Enter or a click opens a tile; Escape (or Back) collapses it; `[` and `]`
//     switch tiles while one is expanded.
//   - Arrow keys move between tiles; Alt+arrows move the focused tile.
//   - A tile's header can be dragged to a new place.
//
// `below` is anything that goes under the tiles (the book face under its link tiles).
//
// By default the grid remembers its own open tile. Pass `open` (and `onOpenChange`)
// to control it from outside instead (the Helper panel's sidebar buttons do).
function TileGrid({ gridId, tiles, crumbs, below, label, open: controlledOpen, onOpenChange }: {
  gridId: string
  tiles: TileDef[]
  crumbs: Crumb[]
  below?: ReactNode
  label?: string
  open?: string | null
  onOpenChange?: (id: string | null) => void
}) {
  const layout = useTileLayout(gridId, tiles)
  const controlled = controlledOpen !== undefined
  const openId = controlled ? (layout.placed.some(p => p.def.id === controlledOpen) ? controlledOpen : null) : layout.openId
  const setOpenId = (id: string | null) => { if (controlled) onOpenChange?.(id); else layout.setOpen(id) }
  const [cornerPanel, setCornerPanel] = useState<CornerPanel | null>(null)
  const [gridRef, width] = useContainerWidth<HTMLDivElement>()
  const areaRef = useRef<HTMLDivElement>(null)
  const columns = columnsFor(width)

  const [from, setFrom] = useState<Box | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const refocus = useRef<string | null>(null)

  // After a tile is moved with the keyboard, keep the focus on it.
  useLayoutEffect(() => {
    if (!refocus.current) return
    const el = areaRef.current?.querySelector<HTMLElement>(`[data-tile-id="${refocus.current}"]`)
    refocus.current = null
    el?.focus()
  })

  const openable = layout.placed.map(p => p.def).filter(opensConsole)
  const openTile = openId ? layout.placed.find(p => p.def.id === openId)?.def : undefined

  function open(def: TileDef) {
    if (def.onOpen) { def.onOpen(); return }
    if (!opensConsole(def)) return
    const area = areaRef.current?.getBoundingClientRect()
    const el = areaRef.current?.querySelector<HTMLElement>(`[data-tile-id="${def.id}"]`)?.getBoundingClientRect()
    setFrom(area && el && el.width > 0 ? { left: el.left - area.left, top: el.top - area.top, width: el.width, height: el.height } : null)
    setCornerPanel(null)
    setOpenId(def.id)
  }
  // Closing hands the focus back to the tile that was open.
  function close() { refocus.current = openId; setFrom(null); setCornerPanel(null); setOpenId(null) }
  function switchTo(id: string) { setFrom(null); setCornerPanel(null); setOpenId(id) }
  // A tile this grid does not have is left to the grid it is nested in (Account's Settings reach the Dashboard tile).
  const parentHost = useContext(TileHostContext)
  const host: TileHost = {
    open: (id, panel) => {
      if (!layout.placed.some(p => p.def.id === id)) { parentHost.open(id, panel); return }
      setFrom(null); setCornerPanel(panel ?? null); setOpenId(id)
    },
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (openTile) return // an expanded console handles its own keys
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tile-id]')
    if (!el || e.target !== el) return
    const dir = ARROWS[e.key]
    if (!dir) return
    e.preventDefault()
    const id = el.dataset.tileId!
    if (e.altKey) {
      layout.shift(id, dir === 'right' || dir === 'down' ? 1 : -1)
      refocus.current = id
      return
    }
    const els = Array.from(areaRef.current!.querySelectorAll<HTMLElement>('[data-tile-id]'))
    const boxes = els.map(t => { const r = t.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })
    els[nextFocus(boxes, els.indexOf(el), dir)]?.focus()
  }

  function onDragStart(e: DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const tile = (e.currentTarget as HTMLElement).closest('.tile')
    if (tile) e.dataTransfer.setDragImage(tile, 12, 12)
  }
  function onDragOver(e: DragEvent, id: string) {
    if (!dragId || dragId === id) return
    e.preventDefault()
    setOverId(id)
  }
  function onDrop(e: DragEvent, id: string) {
    if (!dragId) return
    e.preventDefault()
    layout.move(dragId, id)
    setDragId(null)
    setOverId(null)
  }

  return (
    <TileHostContext.Provider value={host}>
    <div className="tileArea" ref={areaRef} onKeyDown={onKeyDown}>
      <div className="tileScroll">
        <div ref={gridRef} className={columns <= 1 ? 'tileGrid tileGrid--one' : 'tileGrid'} role="group" aria-label={label ?? 'Tiles'} style={{ ['--tile-columns' as string]: columns }}>
          {layout.placed.map(({ def, shape }) => (
            <Tile
              key={def.id} def={def} shape={shape} columns={columns}
              dragging={dragId === def.id} dropTarget={overId === def.id && dragId !== def.id}
              onOpen={() => open(def)} onCycleShape={() => layout.cycle(def.id)}
              onDragStart={e => onDragStart(e, def.id)} onDragOver={e => onDragOver(e, def.id)}
              onDrop={e => onDrop(e, def.id)} onDragEnd={() => { setDragId(null); setOverId(null) }}
            />
          ))}
        </div>
        {below}
      </div>
      {openTile && (
        <TileConsole
          key={openTile.id === openId ? 'console' : openTile.id}
          gridId={gridId} tile={openTile} siblings={openable} crumbs={crumbs} from={from} initialPanel={cornerPanel}
          onSwitch={switchTo} onClose={close}
        />
      )}
    </div>
    </TileHostContext.Provider>
  )
}

export default TileGrid
