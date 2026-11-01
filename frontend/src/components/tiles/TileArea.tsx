import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { IconProps } from '../../assets/icons'
import { GripIcon, ExpandIcon, ShrinkIcon } from '../../assets/icons'
import Divider from './Divider'
import TileTabBar from './TileTabBar'
import { GRID_GAP, isOneColumn } from './tileShapes'
import { nextFocus, type Direction } from './tileNav'
import { applyDrop, planAt, samePlan, type DropPlan } from './tileDrop'
import { markDragEnded, registerArea, type DragStart } from './tileDragBus'
import { tabDropAt } from './tabOrder'
import {
  computeGeometry, flattenOneColumn, getAtPath, minSize, rectAtPath, syncFixed, type Path, type Rect, type SplitNode,
} from './splitTree'
import { useContainerSize } from './useContainerWidth'
import { useSplitLayout } from './useSplitLayout'
import './tiles.scss'

export interface AreaTile {
  id: string
  title: string
  Icon?: ComponentType<IconProps>
  children: ReactNode
  // Controls at the right end of the title bar (a tile's toggles).
  titleExtras?: ReactNode
  // The size of this tile's grip and icon in its title bar, when not the area's.
  iconSize?: number
  // Extra classes on the tile and on its body (the console's own look: a surface, a page).
  className?: string
  bodyClassName?: string
  // The tile starts minimized (until the user has moved it).
  defaultMinimized?: boolean
  // The tile has no icon in this area's rail: the console it belongs to turns it on and off itself (a level's Settings and Help buttons).
  railless?: boolean
  // The title bar has a button that fills the whole area with this tile (and puts it back).
  maximizable?: boolean
}

// The tiles in two columns that alternate down the list (the first, third ... on the left), the rows of a column
// sharing its height evenly: where the tiles sit until one is moved.
export function columnsTree(ids: string[]): SplitNode {
  const column = (list: string[]): SplitNode => (list.length === 1 ? { id: list[0] } : { dir: 'col', ratio: 1 / list.length, a: { id: list[0] }, b: column(list.slice(1)) })
  const left = ids.filter((_, i) => i % 2 === 0)
  const right = ids.filter((_, i) => i % 2 === 1)
  return right.length === 0 ? column(left) : { dir: 'row', ratio: 0.5, a: column(left), b: column(right) }
}

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
const MOVE_THRESHOLD = 4
// A tile restored from the tab bar is dragged at about this size, centred on the pointer.
const BAR_TILE = { w: 280, h: 200 }

interface Session {
  id: string
  source: 'tile' | 'bar'
  plan: DropPlan | null
  // The pointer is over the console's tab bar: letting go minimizes the tile.
  overBar: boolean
  // Where the dragged tile sits, in the grid's coordinates, before the pointer moves it.
  origin: Rect
}

// The tiles of one console on a split tree (splitTree.ts): they always fill the area exactly, with no gaps. Every tile has
// the same title bar -- grip, icon and name, its own controls, then Maximize where a tile asks for it. A tile has no
// Minimize button: it is turned off and on by its icon in the area's rail, the bar of tile tabs. The title bar is the handle: drag a tile by it and the others slide aside to open a highlighted gap where it would land. The
// tile under the pointer is cut into a 3x3 grid (tileDrop.ts): the middle swaps, the edges put the tile beside or
// above/below, a corner makes a new row or column across the whole grid. Drop it on the console's tab bar to minimize
// it (the bar shows one icon per tile; press one to bring the tile back, or drag it out into the layout). Drag a divider
// (or focus it and use the arrow keys) to resize the two tiles it separates. Where each tile sits, and which are minimized,
// is remembered per `gridId` with the other saved settings. Under 400px the tiles stack.
export function TileArea({ gridId, tiles, label, defaultTree, onFocusTile, iconSize, minimized, onMinimizedChange, maximized, onMaximizedChange, onReorderTabs, bar = false, barHost }: {
  gridId: string
  tiles: AreaTile[]
  label?: string
  // Told which tile the pointer or keyboard focus last went into (the level's Undo and Redo act on that tile).
  onFocusTile?: (id: string) => void
  // Where the tiles sit before the user has moved any (otherwise they split the area evenly).
  defaultTree?: SplitNode
  // The size of the grip and the tile's icon in a title bar (13 and 14 until a console wants them larger).
  iconSize?: number
  // The tiles that are minimized, when the console decides that itself (the Writer's tabs); `onMinimizedChange` hears the user's changes.
  minimized?: readonly string[]
  onMinimizedChange?: (id: string, minimized: boolean) => void
  // The tile that fills the whole area, when the console decides that itself (the Reader's full console); null for none.
  maximized?: string | null
  onMaximizedChange?: (id: string | null) => void
  // The user dragged a tab-bar icon to sit before another (null: last). Without it the area keeps the order itself (for its own bar).
  onReorderTabs?: (id: string, beforeId: string | null) => void
  // Draws the tab bar above the tiles (a console whose header has none of its own).
  bar?: boolean
  // Where the bar goes when it is not above the tiles: the slot in the title bar of the console tile that holds this area (null until drawn).
  barHost?: HTMLElement | null
}) {
  const layout = useSplitLayout(gridId, tiles.map(t => ({ id: t.id, defaultShape: t.defaultMinimized ? 'mini' as const : 'mid' as const })), { defaultTree, minimized, onMinimizedChange, maximized, onMaximizedChange })
  const [scrollRef, size] = useContainerSize<HTMLDivElement>()
  const stageRef = useRef<HTMLDivElement>(null)
  const refocus = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  const oneColumn = isOneColumn(size.width)
  const maxId = layout.maximizedId
  const stored: SplitNode | null = tiles.length > 0 ? (maxId ? { id: maxId } : layout.tree) : null
  const flat = (t: SplitNode) => (oneColumn ? flattenOneColumn(t) : t)
  const baseTree = stored ? flat(stored) : null
  const min = baseTree ? minSize(baseTree) : { w: 0, h: 0 }
  const stage: Rect = { x: 0, y: 0, w: Math.max(size.width, min.w), h: Math.max(size.height, min.h) }
  const baseGeometry = baseTree ? computeGeometry(baseTree, stage) : { tiles: [], dividers: [] }

  // While a tile is dragged, the tree it would make: laid out in place of the real one so the others slide aside.
  let previewTree = baseTree
  if (stored && session) {
    const open = session.source === 'bar' ? syncFixed(stored, new Set([...layout.minimized].filter(x => x !== session.id))) : stored
    if (session.overBar) previewTree = flat(syncFixed(stored, new Set([...layout.minimized, session.id])))
    else if (session.plan) previewTree = flat(applyDrop(open, session.id, session.plan))
    else previewTree = flat(open)
  }
  const geometry = previewTree ? computeGeometry(previewTree, stage) : { tiles: [], dividers: [] }
  const rectOf = new Map(geometry.tiles.map(g => [g.id, g.rect]))
  const gap = session && !session.overBar ? rectOf.get(session.id) ?? null : null

  // What the pointer handlers read, kept fresh each render (they are set up once per drag).
  const live = useRef({ baseGeometry, baseTree, stage, oneColumn, layout, gridId })
  live.current = { baseGeometry, baseTree, stage, oneColumn, layout, gridId }
  const pointer = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const cancelDrag = useRef<(() => void) | null>(null)

  // The dragged tile follows the pointer by a transform (no re-render per move); a render keeps it there.
  function placeLifted(s: Session | null) {
    const p = pointer.current
    if (!s || !p) return
    const el = stageRef.current?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(s.id)}"]`)
    if (el) el.style.transform = `translate(${p.x - p.startX}px, ${p.y - p.startY}px)`
  }
  useLayoutEffect(() => { placeLifted(session) })

  // After a tile is moved, keep the focus on its title bar.
  useLayoutEffect(() => {
    if (!refocus.current) return
    const el = stageRef.current?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(refocus.current)}"] .gtTitle`)
    refocus.current = null
    el?.focus()
  })

  function beginDrag(id: string, source: 'tile' | 'bar', e: DragStart) {
    if (live.current.layout.maximizedId || cancelDrag.current) return
    const start = { x: e.clientX, y: e.clientY }
    let started = false
    let current: Session | null = null
    const bodyUserSelect = document.body.style.userSelect

    function localPoint(clientX: number, clientY: number) {
      const box = stageRef.current!.getBoundingClientRect()
      return { x: clientX - box.left, y: clientY - box.top }
    }
    function overBar(clientX: number, clientY: number) {
      const el = document.querySelector<HTMLElement>(`[data-tile-bar="${CSS.escape(live.current.gridId)}"]`)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    }
    function barEl() { return document.querySelector<HTMLElement>(`[data-tile-bar="${CSS.escape(live.current.gridId)}"]`) }
    function setBarDrop(on: boolean) { barEl()?.classList.toggle('tileTabBar--drop', on) }
    // An icon dragged along the bar: a mark on the icon it would go beside shows where it lands.
    let reorder: { beforeId: string | null } | null = null
    function setReorder(clientX: number, clientY: number, over: boolean) {
      const bar = barEl()
      bar?.querySelectorAll('.tileTabBtn--before, .tileTabBtn--after, .wrTabBtn--before, .wrTabBtn--after').forEach(b => b.classList.remove('tileTabBtn--before', 'tileTabBtn--after', 'wrTabBtn--before', 'wrTabBtn--after'))
      reorder = null
      if (!bar || !over || source !== 'bar') return
      const buttons = Array.from(bar.querySelectorAll<HTMLElement>('[data-tab-id]'))
      const hit = tabDropAt(buttons.map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.tabId!, left: r.left, top: r.top, right: r.right, bottom: r.bottom } }), clientX, clientY)
      if (!hit || hit.markId === id) return
      reorder = { beforeId: hit.beforeId }
      const mark = buttons.find(b => b.dataset.tabId === hit.markId)
      mark?.classList.add(mark.classList.contains('wrTabBtn') ? `wrTabBtn--${hit.side}` : `tileTabBtn--${hit.side}`)
    }
    function update(next: Session) {
      if (current && current.overBar === next.overBar && samePlan(current.plan, next.plan)) return
      current = next
      setBarDrop(next.overBar)
      setSession(next)
    }
    function move(ev: globalThis.PointerEvent) {
      if (!started) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < MOVE_THRESHOLD) return
        started = true
        document.body.style.userSelect = 'none'
        const p = localPoint(ev.clientX, ev.clientY)
        const base = live.current.baseGeometry.tiles.find(t => t.id === id)?.rect
        const origin = source === 'tile' && base ? base : { x: p.x - BAR_TILE.w / 2, y: p.y - BAR_TILE.h / 2, w: BAR_TILE.w, h: BAR_TILE.h }
        pointer.current = { x: ev.clientX, y: ev.clientY, startX: source === 'tile' ? start.x : ev.clientX, startY: source === 'tile' ? start.y : ev.clientY }
        current = { id, source, plan: null, overBar: false, origin }
        setSession(current)
      }
      pointer.current = { ...pointer.current!, x: ev.clientX, y: ev.clientY }
      placeLifted(current)
      const inBar = overBar(ev.clientX, ev.clientY)
      setReorder(ev.clientX, ev.clientY, inBar)
      const p = localPoint(ev.clientX, ev.clientY)
      const { baseTree, stage, oneColumn, baseGeometry } = live.current
      const plan = inBar || !baseTree ? null : planAt(baseGeometry, p.x, p.y, { tree: baseTree, stage, draggedId: id, oneColumn })
      update({ ...current!, plan, overBar: inBar && source === 'tile' })
    }
    function finish(commit: boolean) {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey)
      cancelDrag.current = null
      document.body.style.userSelect = bodyUserSelect
      setBarDrop(false)
      const moved = reorder
      setReorder(0, 0, false)
      if (!started) return
      markDragEnded()
      const s = current
      pointer.current = null
      stageRef.current?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(id)}"]`)?.style.removeProperty('transform')
      setSession(null)
      if (!commit || !s) return
      if (moved) { (onReorderRef.current ?? live.current.layout.reorderTabs)(id, moved.beforeId); return }
      if (s.overBar) live.current.layout.setMinimized(id, true)
      else if (s.plan) live.current.layout.apply(id, s.plan)
    }
    function up() { finish(true) }
    function cancel() { finish(false) }
    function onKey(ev: globalThis.KeyboardEvent) { if (ev.key === 'Escape') finish(false) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey)
    cancelDrag.current = () => finish(false)
  }

  const beginRef = useRef(beginDrag)
  beginRef.current = beginDrag
  const onReorderRef = useRef(onReorderTabs)
  onReorderRef.current = onReorderTabs
  useEffect(() => {
    const off = registerArea(gridId, (id, e) => beginRef.current(id, 'bar', e))
    return () => { off(); cancelDrag.current?.() }
  }, [gridId])

  function onTitleDown(e: PointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [data-no-drag]')) return
    beginDrag(id, 'tile', e)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const handle = e.target as HTMLElement
    if (!handle.classList.contains('gtTitle')) return
    const dir = ARROWS[e.key]
    if (!dir || e.altKey) return
    e.preventDefault()
    const handles = Array.from(stageRef.current!.querySelectorAll<HTMLElement>('.gtTitle'))
    const boxes = handles.map(h => { const r = h.closest('[data-tile-id]')!.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })
    const to = handles[nextFocus(boxes, handles.indexOf(handle), dir)]
    if (to && to !== handle) to.focus()
  }

  function dragTo(path: Path, dir: 'row' | 'col', clientX: number, clientY: number) {
    const stageEl = stageRef.current
    if (!stageEl || !baseTree) return
    const box = stageEl.getBoundingClientRect()
    const branch = rectAtPath(baseTree, stage, path)
    const local = dir === 'row' ? clientX - box.left - branch.x : clientY - box.top - branch.y
    const total = (dir === 'row' ? branch.w : branch.h) - GRID_GAP
    if (total <= 0) return
    layout.resize(path, (local - GRID_GAP / 2) / total)
  }

  const isOpen = (id: string) => !layout.minimized.has(id)
  function toggle(id: string) {
    layout.setMinimized(id, isOpen(id))
    if (maxId === id) layout.setMaximized(null)
  }

  if (tiles.length === 0) return null
  const area = (
    <div className="gtScroll wrSplit" ref={scrollRef} onKeyDown={onKeyDown}>
      <div ref={stageRef} className="gtStage wrSplitStage" role="group" aria-label={label ?? 'Tiles'} style={{ position: 'relative', width: stage.w, height: stage.h }}>
        {/* In the tiles' own order, so a move shifts a box and never the element (what is typed in it stays). */}
        {tiles.map(t => {
          const lifted = session?.id === t.id
          const rect = lifted ? session.origin : rectOf.get(t.id)
          if (!rect) return null
          const classes = ['gtTile', 'wrTabTile', 'wrSplitTile', t.className, lifted ? 'gtTile--lifted' : ''].filter(Boolean).join(' ')
          const sz = t.iconSize ?? iconSize
          return (
            <section
              key={t.id} className={classes} aria-label={t.title} data-tile-id={t.id}
              style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              onPointerDownCapture={onFocusTile ? () => onFocusTile(t.id) : undefined} onFocusCapture={onFocusTile ? () => onFocusTile(t.id) : undefined}
            >
              <h3 className="gtTitle wrTabTileTitle" tabIndex={0} title="Drag to move this tile" onPointerDown={e => onTitleDown(e, t.id)}>
                <span className="gtTitleMain wrTabTileTitleMain">
                  <GripIcon size={sz ?? 13} />{t.Icon && <t.Icon size={sz ?? 14} />} {t.title}
                </span>
                {t.titleExtras && <span className="gtTitleExtras wrTabTileTitleExtras">{t.titleExtras}</span>}
                <span className="gtTitleBtns">
                  {t.maximizable && (
                    <button type="button" className="gtTitleBtn" aria-label={maxId === t.id ? `Restore ${t.title}` : `Maximize ${t.title}`} title={maxId === t.id ? 'Restore' : 'Maximize'} onClick={() => layout.setMaximized(maxId === t.id ? null : t.id)}>
                      {maxId === t.id ? <ShrinkIcon size={sz ?? 14} /> : <ExpandIcon size={sz ?? 14} />}
                    </button>
                  )}
                </span>
              </h3>
              <div className={`gtBody wrTabTileBody${t.bodyClassName ? ` ${t.bodyClassName}` : ''}`}>{t.children}</div>
            </section>
          )
        })}
        {gap && <div className="gtGap" aria-hidden style={{ left: gap.x, top: gap.y, width: gap.w, height: gap.h }} />}
        {geometry.dividers.map(d => {
          const branch = previewTree ? getAtPath(previewTree, d.path) : null
          const ratio = branch && 'ratio' in branch ? branch.ratio : 0.5
          const key = d.path.join('.') || 'root'
          return (
            <Divider
              key={key} dir={d.dir} ratio={ratio}
              style={{ position: 'absolute', left: d.rect.x, top: d.rect.y, width: d.rect.w, height: d.rect.h, pointerEvents: session ? 'none' : undefined }}
              onDragTo={(x, y) => dragTo(d.path, d.dir, x, y)}
              onResize={r => layout.resize(d.path, r)}
            />
          )
        })}
      </div>
    </div>
  )
  if (!bar) return area
  const rail = (
    <TileTabBar
      gridId={gridId} label={label ? `${label} tabs` : 'Tile tabs'} isOpen={isOpen} onToggle={toggle} size={barHost === undefined ? iconSize ?? 18 : 18}
      tiles={layout.tabOrder.map(id => tiles.find(t => t.id === id)).filter((t): t is AreaTile => Boolean(t && t.Icon && !t.railless)).map(t => ({ id: t.id, label: t.title, Icon: t.Icon! }))}
    />
  )
  // In the title bar of the console tile that holds the area: the rail goes there (nowhere until the bar has drawn its slot).
  if (barHost !== undefined) return <>{barHost && createPortal(rail, barHost)}{area}</>
  return <div className="gtArea">{rail}{area}</div>
}

export default TileArea
