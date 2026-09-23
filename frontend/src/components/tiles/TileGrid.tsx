import { createContext, useContext, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import Divider from './Divider'
import Tile from './Tile'
import TileConsole from './TileConsole'
import { isOneColumn } from './tileShapes'
import { nextFocus, type Box, type Direction } from './tileNav'
import { opensConsole, type TileDef } from './tileTypes'
import {
  canInsertAt, canInsertBeside, computeGeometry, flattenOneColumn, getAtPath, minSize, rectAtPath, type Path, type SplitNode,
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
// The width (as a fraction of a tile's own box) of its left/right margins where
// dropping a dragged tile splits off a new column beside it, instead of swapping.
const EDGE_ZONE = 0.25

// A grid of tiles laid out on a split tree (splitTree.ts): it always fills its own
// container exactly (drag a divider and only its two neighbours resize -- no gaps,
// no ragged last row), remembers each tile's place and size per user, and expands a
// selected tile into its console over the grid's whole area.
//
//   - A tile's title toggles it between mini and mid; its corner button opens it into
//     its console (max). Escape (or Back) collapses an open console; `[` and `]`
//     switch tiles while one is expanded.
//   - Arrow keys move between tiles; Alt+arrows swap the focused tile with its neighbour.
//   - A tile's header can be dragged onto another to swap their places.
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
  const oneColumn = isOneColumn(containerSize.width)
  const renderTree: SplitNode | null = layout.tree ? (oneColumn ? flattenOneColumn(layout.tree) : layout.tree) : null

  const min = renderTree ? minSize(renderTree) : { w: 0, h: 0 }
  const stageW = Math.max(containerSize.width, min.w)
  // A grid with something below it (the book face under its link tiles) sizes the
  // stage to its own content instead of stretching to fill the container -- the
  // trailing content takes the rest of the space, as it always has.
  const stageH = below ? min.h : Math.max(containerSize.height, min.h)
  const geometry = renderTree ? computeGeometry(renderTree, { x: 0, y: 0, w: stageW, h: stageH }) : { tiles: [], dividers: [] }
  const byId = new Map(layout.placed.map(p => [p.def.id, p]))

  const [from, setFrom] = useState<Box | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [overDivider, setOverDivider] = useState<string | null>(null)
  const [overEdge, setOverEdge] = useState<{ id: string; side: 'left' | 'right' } | null>(null)
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
  // Whether the pointer sits in a tile's left/right edge margin (and there's room
  // to split off a new column there) rather than its middle (a swap, as usual).
  function edgeSide(e: DragEvent, id: string): 'left' | 'right' | null {
    if (oneColumn) return null
    const g = geometry.tiles.find(t => t.id === id)
    if (!g || !canInsertBeside(g.rect)) return null
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (box.width <= 0) return null
    const frac = (e.clientX - box.left) / box.width
    if (frac <= EDGE_ZONE) return 'left'
    if (frac >= 1 - EDGE_ZONE) return 'right'
    return null
  }
  function onDragOver(e: DragEvent, id: string) {
    if (!dragId || dragId === id) return
    e.preventDefault()
    const side = edgeSide(e, id)
    setOverEdge(side ? { id, side } : null)
    setOverId(side ? null : id)
    setOverDivider(null)
  }
  function onDrop(e: DragEvent, id: string) {
    if (!dragId) return
    e.preventDefault()
    const side = edgeSide(e, id)
    if (side) layout.insertBeside(dragId, id, side)
    else layout.swap(dragId, id)
    endDrag()
  }
  function endDrag() { setDragId(null); setOverId(null); setOverDivider(null); setOverEdge(null) }

  // Hovering a divider (rather than another tile) while dragging offers a different
  // drop: a new column or row wedged in right there, instead of a swap -- only when
  // there's room for the extra side (canInsertAt).
  function onDividerDragOver(e: DragEvent, key: string, path: Path, fixed: boolean) {
    if (!dragId || !renderTree || !canInsertAt(renderTree, { x: 0, y: 0, w: stageW, h: stageH }, path, fixed)) return
    e.preventDefault()
    setOverDivider(key)
    setOverId(null)
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
        <div
          ref={stageRef} className={oneColumn ? 'tileGrid tileGrid--one' : 'tileGrid'} role="group"
          aria-label={label ?? 'Tiles'} style={{ position: 'relative', width: stageW, height: stageH }}
        >
          {geometry.tiles.map(g => {
            const p = byId.get(g.id)
            if (!p) return null
            return (
              <Tile
                key={p.def.id} def={p.def} rect={g.rect} fixed={g.fixed} oneColumn={oneColumn}
                dragging={dragId === p.def.id} dropTarget={overId === p.def.id && dragId !== p.def.id}
                edgeDrop={overEdge?.id === p.def.id ? overEdge.side : null}
                onOpen={() => open(p.def)} onToggleTier={() => layout.toggleTier(p.def.id)}
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
            const draggedFixed = dragId ? geometry.tiles.find(t => t.id === dragId)?.fixed ?? false : false
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
        {below}
      </div>
      {openTile && (
        <TileConsole
          key={openTile.id === openId ? 'console' : openTile.id}
          gridId={gridId} tile={openTile} siblings={openable} crumbs={crumbs} from={from} initialPanel={cornerPanel}
          maximized={maximized} onToggleMaximize={onMaximizeChange ? toggleMaximize : undefined}
          onSwitch={switchTo} onClose={close}
        />
      )}
    </div>
    </TileHostContext.Provider>
  )
}

export default TileGrid
