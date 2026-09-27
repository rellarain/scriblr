import { createContext, useContext, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import Divider from './Divider'
import RailTile from './RailTile'
import Tile from './Tile'
import TileConsole from './TileConsole'
import { GRID_GAP, RAIL_TILE, isOneColumn } from './tileShapes'
import { nextFocus, type Box, type Direction } from './tileNav'
import { opensConsole, type TileDef } from './tileTypes'
import {
  canInsertAt, canInsertBeside, canInsertBelow, computeGeometry, fixedLeafIds, flattenOneColumn, getAtPath,
  minSize, rectAtPath, type Path, type SplitNode,
} from './splitTree'
import { useContainerSize } from './useContainerWidth'
import { useSplitLayout } from './useSplitLayout'
import './tiles.scss'

export interface Crumb { label: string; onClick?: () => void }

export type CornerPanel = 'settings' | 'help'

// What a tile's content can ask of the grid it is in: open a tile of it (and,
// optionally, its Settings or Help panel).
export interface TileHost { open: (id: string, panel?: CornerPanel) => void }
const TileHostContext = createContext<TileHost>({ open: () => {} })
export const useTileHost = (): TileHost => useContext(TileHostContext)

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
const boxOf = (r: { x: number; y: number; w: number; h: number }): Box => ({ left: r.x, top: r.y, width: r.w, height: r.h })
// The width (as a fraction of a tile's own box, on its own axis) of its edge
// margins where dropping a dragged tile splits off a new column/row beside/below
// it, instead of swapping.
const EDGE_ZONE = 0.25

// A grid of tiles laid out on a split tree (splitTree.ts): it always fills its own
// container exactly (drag a divider and only its two neighbours resize -- no gaps,
// no ragged last row), remembers each tile's place and size per user, and expands a
// selected tile into its console over the grid's whole area.
//
//   - A tile's header opens it into its console (max), when it has one; clicking
//     its body does nothing. Escape (or Back) collapses an open console.
//   - Arrow keys move between tiles; Alt+arrows swap the focused tile with its neighbour.
//   - The whole tile (not just its header) is a drag handle: dragging it onto
//     another tile swaps their places, or onto that tile's edge margin splits off a
//     new column/row beside/below it instead. Dragging it into the grid's shared
//     icon rail (RailTile.tsx) minimizes it; clicking a rail icon restores it.
//   - A divider between two tiles can be dragged or keyboard-nudged.
//
// `below` is anything that goes under the tiles (the book face under its link tiles).
//
// By default the grid remembers its own open tile. Pass `open` (and `onOpenChange`)
// to control it from outside instead (the Helper panel's sidebar buttons do).
// `onMaximizeChange`, only wired up in the Writer so far, is told when an expanded
// console is maximized or restored (so the caller can hide its own sidebar).
function TileGrid({ gridId, tiles, crumbs, below, label, open: controlledOpen, onOpenChange, onMaximizeChange }: {
  gridId: string
  tiles: TileDef[]
  crumbs: Crumb[]
  below?: ReactNode
  label?: string
  open?: string | null
  onOpenChange?: (id: string | null) => void
  onMaximizeChange?: (on: boolean) => void
}) {
  const layout = useSplitLayout(gridId, tiles)
  const controlled = controlledOpen !== undefined
  const openId = controlled ? (layout.placed.some(p => p.def.id === controlledOpen) ? controlledOpen : null) : layout.openId
  const setOpenId = (id: string | null) => { if (controlled) onOpenChange?.(id); else layout.setOpen(id) }
  const [cornerPanel, setCornerPanel] = useState<CornerPanel | null>(null)
  const [scrollRef, containerSize] = useContainerSize<HTMLDivElement>()
  const stageRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  // Minimized tiles collapse into one shared icon rail down the grid's left edge,
  // in a stable order independent of which branch each one actually lives under --
  // outside the resizable stage entirely, so it reserves its own fixed width before
  // the one-column check below (flattening doesn't change which leaves are fixed or
  // their pre-order, so this is safe to read off the tree before deciding to flatten it).
  const railIds = layout.tree ? fixedLeafIds(layout.tree) : []
  // While a tile is being dragged and nothing is minimized yet, the ghost rail
  // placeholder below still needs its own room -- reserve the same space for it
  // so the stage's tiles shrink out of its way instead of it overlapping them.
  const railReserve = railIds.length > 0 || dragId ? RAIL_TILE + GRID_GAP : 0
  const oneColumn = isOneColumn(containerSize.width - railReserve)
  const renderTree: SplitNode | null = layout.tree ? (oneColumn ? flattenOneColumn(layout.tree) : layout.tree) : null

  const min = renderTree ? minSize(renderTree) : { w: 0, h: 0 }
  const stageW = Math.max(containerSize.width - railReserve, min.w)
  // A grid with something below it (the book face under its link tiles) sizes the
  // stage to its own content instead of stretching to fill the container -- the
  // trailing content takes the rest of the space, as it always has.
  const stageH = below ? min.h : Math.max(containerSize.height, min.h)
  const geometry = renderTree ? computeGeometry(renderTree, { x: 0, y: 0, w: stageW, h: stageH }) : { tiles: [], dividers: [] }
  const byId = new Map(layout.placed.map(p => [p.def.id, p]))

  const [from, setFrom] = useState<Box | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [overDivider, setOverDivider] = useState<string | null>(null)
  const [overEdge, setOverEdge] = useState<{ id: string; side: 'left' | 'right' | 'top' | 'bottom' } | null>(null)
  const [overRail, setOverRail] = useState(false)
  const refocus = useRef<string | null>(null)

  // After a tile is moved with the keyboard, keep the focus on it.
  useLayoutEffect(() => {
    if (!refocus.current) return
    const el = areaRef.current?.querySelector<HTMLElement>(`[data-tile-id="${refocus.current}"]`)
    refocus.current = null
    el?.focus()
  })

  const openTile = openId ? layout.placed.find(p => p.def.id === openId)?.def : undefined

  function open(def: TileDef) {
    if (def.onOpen) { def.onOpen(); return }
    if (!opensConsole(def)) return
    const g = geometry.tiles.find(t => t.id === def.id)
    setFrom(g && g.rect.w > 0 ? boxOf(g.rect) : null)
    setCornerPanel(null)
    setOpenId(def.id)
  }
  // Closing hands the focus back to the tile that was open, and clears a maximize
  // (the sidebar it hid, if any, comes back with it).
  function close() {
    refocus.current = openId
    setFrom(null)
    setCornerPanel(null)
    setOpenId(null)
    if (layout.maximized) { layout.setMaximized(false); onMaximizeChange?.(false) }
  }
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
    const els = Array.from(areaRef.current!.querySelectorAll<HTMLElement>('[data-tile-id]'))
    const boxes = els.map(t => { const r = t.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })
    if (e.altKey) {
      const targetEl = els[nextFocus(boxes, els.indexOf(el), dir)]
      const targetId = targetEl?.dataset.tileId
      if (targetId && targetId !== id) { layout.swap(id, targetId); refocus.current = id }
      return
    }
    els[nextFocus(boxes, els.indexOf(el), dir)]?.focus()
  }

  function onDragStart(e: DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const tile = (e.currentTarget as HTMLElement).closest('.tile')
    if (tile) e.dataTransfer.setDragImage(tile, 12, 12)
  }
  // Whether the pointer sits in one of a tile's four edge margins (and there's room
  // to split off a new column/row there) rather than its middle (a swap, as usual).
  // Each axis qualifies independently against its own box length (EDGE_ZONE); when
  // both would qualify at once (near a corner), whichever the pointer sits
  // physically closer to, in real pixels, wins -- comparing raw px (not the two
  // axes' fractions against each other) is what keeps this right for a tile far
  // wider than it is tall, or the reverse.
  function edgeSide(e: DragEvent, id: string): 'left' | 'right' | 'top' | 'bottom' | null {
    const g = geometry.tiles.find(t => t.id === id)
    if (!g) return null
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return null
    const distL = e.clientX - box.left
    const distR = box.left + box.width - e.clientX
    const distT = e.clientY - box.top
    const distB = box.top + box.height - e.clientY
    const hDist = Math.min(distL, distR)
    const vDist = Math.min(distT, distB)
    const hOk = !oneColumn && canInsertBeside(g.rect) && hDist <= EDGE_ZONE * box.width
    const vOk = canInsertBelow(g.rect) && vDist <= EDGE_ZONE * box.height
    if (!hOk && !vOk) return null
    if (hOk && (!vOk || hDist <= vDist)) return distL < distR ? 'left' : 'right'
    return distT < distB ? 'top' : 'bottom'
  }
  function onDragOver(e: DragEvent, id: string) {
    if (!dragId || dragId === id) return
    e.preventDefault()
    const side = edgeSide(e, id)
    setOverEdge(side ? { id, side } : null)
    setOverId(side ? null : id)
    setOverDivider(null)
    setOverRail(false)
  }
  function onDrop(e: DragEvent, id: string) {
    if (!dragId) return
    e.preventDefault()
    const side = edgeSide(e, id)
    if (side === 'left' || side === 'right') layout.insertBeside(dragId, id, side)
    else if (side === 'top' || side === 'bottom') layout.insertBelow(dragId, id, side)
    else layout.swap(dragId, id)
    endDrag()
  }
  function endDrag() { setDragId(null); setOverId(null); setOverDivider(null); setOverEdge(null); setOverRail(false) }

  // Dragging a tile into the grid's shared icon rail minimizes it -- only mid
  // tiles are ever drag sources (rail icons are click-only), so this never needs
  // to guard against a tile that's already minimized.
  function onRailDragOver(e: DragEvent) {
    if (!dragId) return
    e.preventDefault()
    setOverRail(true)
    setOverId(null)
    setOverEdge(null)
    setOverDivider(null)
  }
  function onRailDrop(e: DragEvent) {
    if (!dragId) return
    e.preventDefault()
    layout.toggleTier(dragId)
    endDrag()
  }

  // Hovering a divider (rather than another tile) while dragging offers a different
  // drop: a new column or row wedged in right there, instead of a swap -- only when
  // there's room for the extra side (canInsertAt).
  function onDividerDragOver(e: DragEvent, key: string, path: Path, fixed: boolean) {
    if (!dragId || !renderTree || !canInsertAt(renderTree, { x: 0, y: 0, w: stageW, h: stageH }, path, fixed)) return
    e.preventDefault()
    setOverDivider(key)
    setOverId(null)
    setOverRail(false)
  }
  function onDividerDrop(e: DragEvent, path: Path) {
    if (!dragId) return
    e.preventDefault()
    layout.insertAt(dragId, path)
    endDrag()
  }

  function dragTo(path: Path, dir: 'row' | 'col', clientX: number, clientY: number) {
    const stageEl = stageRef.current
    if (!stageEl || !renderTree) return
    const stageBox = stageEl.getBoundingClientRect()
    const branch = rectAtPath(renderTree, { x: 0, y: 0, w: stageW, h: stageH }, path)
    const local = dir === 'row' ? clientX - stageBox.left - branch.x : clientY - stageBox.top - branch.y
    const total = (dir === 'row' ? branch.w : branch.h) - 8
    if (total <= 0) return
    layout.resize(path, (local - 4) / total)
  }

  const maximized = layout.maximized
  const toggleMaximize = () => {
    const on = !maximized
    layout.setMaximized(on)
    onMaximizeChange?.(on)
  }

  return (
    <TileHostContext.Provider value={host}>
    <div className="tileArea" ref={areaRef} onKeyDown={onKeyDown}>
      <div ref={scrollRef} className="tileScroll">
        <div className="tileMain">
          {railIds.length > 0 ? (
            <div
              className={overRail ? 'tileRail tileRail--drop' : 'tileRail'} role="group" aria-label="Minimized tiles"
              onDragOver={onRailDragOver} onDrop={onRailDrop}
            >
              {railIds.map(id => {
                const p = byId.get(id)
                return p ? <RailTile key={id} def={p.def} onToggleTier={() => layout.toggleTier(id)} /> : null
              })}
            </div>
          ) : dragId ? (
            <div
              className={overRail ? 'tileRailGhost tileRailGhost--drop' : 'tileRailGhost'} role="group" aria-label="Minimized tiles"
              onDragOver={onRailDragOver} onDrop={onRailDrop}
            />
          ) : null}
          <div
            ref={stageRef} className={oneColumn ? 'tileGrid tileGrid--one' : 'tileGrid'} role="group"
            aria-label={label ?? 'Tiles'} style={{ position: 'relative', width: stageW, height: stageH }}
          >
            {geometry.tiles.map(g => {
              const p = byId.get(g.id)
              if (!p) return null
              return (
                <Tile
                  key={p.def.id} def={p.def} rect={g.rect} oneColumn={oneColumn}
                  dragging={dragId === p.def.id} dropTarget={overId === p.def.id && dragId !== p.def.id}
                  edgeDrop={overEdge?.id === p.def.id ? overEdge.side : null}
                  onOpen={() => open(p.def)}
                  onDragStart={e => onDragStart(e, p.def.id)} onDragOver={e => onDragOver(e, p.def.id)}
                  onDrop={e => onDrop(e, p.def.id)} onDragEnd={endDrag}
                />
              )
            })}
            {geometry.dividers.map(d => {
              const branch = renderTree ? getAtPath(renderTree, d.path) : null
              const ratio = branch && 'ratio' in branch ? branch.ratio : 0.5
              const key = d.path.join('.') || 'root'
              // A one-column stage has no room to wedge in a new side -- only offer
              // this drop once the grid is actually split into more than one column.
              const draggedFixed = dragId ? byId.get(dragId)?.shape === 'mini' : false
              return (
                <Divider
                  key={key} dir={d.dir} ratio={ratio}
                  style={{ position: 'absolute', left: d.rect.x, top: d.rect.y, width: d.rect.w, height: d.rect.h }}
                  onDragTo={(x, y) => dragTo(d.path, d.dir, x, y)}
                  onResize={r => layout.resize(d.path, r)}
                  dropTarget={overDivider === key}
                  onDragOver={oneColumn ? undefined : e => onDividerDragOver(e, key, d.path, draggedFixed)}
                  onDrop={oneColumn ? undefined : e => onDividerDrop(e, d.path)}
                />
              )
            })}
          </div>
        </div>
        {below}
      </div>
      {openTile && (
        <TileConsole
          key={openTile.id === openId ? 'console' : openTile.id}
          gridId={gridId} tile={openTile} crumbs={crumbs} from={from} initialPanel={cornerPanel}
          maximized={maximized} onToggleMaximize={onMaximizeChange ? toggleMaximize : undefined}
          onClose={close}
        />
      )}
    </div>
    </TileHostContext.Provider>
  )
}

export default TileGrid
