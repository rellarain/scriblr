import { useLayoutEffect, useRef, useState, type ComponentType, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { IconProps } from '../../icons'
import { GripIcon } from '../../icons'
import Divider from '../../../components/tiles/Divider'
import { GRID_GAP, isOneColumn } from '../../../components/tiles/tileShapes'
import { edgeSideOf, type EdgeSide } from '../../../components/tiles/tileDrag'
import { nextFocus, type Direction } from '../../../components/tiles/tileNav'
import {
  canInsertAt, computeGeometry, flattenOneColumn, getAtPath, minSize, rectAtPath, type Path, type SplitNode,
} from '../../../components/tiles/splitTree'
import { useContainerSize } from '../../../components/tiles/useContainerWidth'
import { useSplitLayout } from '../../../components/tiles/useSplitLayout'
import '../../../components/tiles/tiles.scss'

export interface SplitTile {
  id: string
  title: string
  Icon?: ComponentType<IconProps>
  children: ReactNode
  // Extra classes on the tile and on its body (the level's own look: a surface, a page).
  className?: string
  bodyClassName?: string
}

// The tiles in two columns that alternate down the list (the first, third ... on the left), the rows of a column
// sharing its height evenly: where the Max tiles sit until one is moved.
export function columnsTree(ids: string[]): SplitNode {
  const column = (list: string[]): SplitNode => (list.length === 1 ? { id: list[0] } : { dir: 'col', ratio: 1 / list.length, a: { id: list[0] }, b: column(list.slice(1)) })
  const left = ids.filter((_, i) => i % 2 === 0)
  const right = ids.filter((_, i) => i % 2 === 1)
  return right.length === 0 ? column(left) : { dir: 'row', ratio: 0.5, a: column(left), b: column(right) }
}

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

// The Writer levels' open tiles on a split tree (components/tiles/splitTree.ts): they always fill the area
// exactly, with no gaps. Drag a tile by its title bar onto another to swap places, onto its edge to split off a
// new column or row beside or below it, or onto a divider to wedge it in there; drag a divider (or focus it and
// use the arrow keys) to resize the two tiles it separates. Alt+arrows on a focused title bar swap the tile
// with its neighbour. Where each tile sits is remembered per `gridId` with the other saved settings; a tile
// that opens is grafted onto the tree and one that closes is pruned from it. Under 400px the tiles stack.
export function SplitArea({ gridId, tiles, label, defaultTree }: {
  gridId: string
  tiles: SplitTile[]
  label?: string
  // Where the tiles sit before the user has moved any (otherwise they split the area evenly).
  defaultTree?: SplitNode
}) {
  const layout = useSplitLayout(gridId, tiles.map(t => ({ id: t.id, defaultShape: 'mid' as const })), defaultTree)
  const [scrollRef, size] = useContainerSize<HTMLDivElement>()
  const areaRef = useRef<HTMLDivElement>(null)
  const refocus = useRef<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [overEdge, setOverEdge] = useState<{ id: string; side: EdgeSide } | null>(null)
  const [overDivider, setOverDivider] = useState<string | null>(null)

  const oneColumn = isOneColumn(size.width)
  const renderTree: SplitNode | null = layout.tree && tiles.length > 0 ? (oneColumn ? flattenOneColumn(layout.tree) : layout.tree) : null
  const min = renderTree ? minSize(renderTree) : { w: 0, h: 0 }
  const stageW = Math.max(size.width, min.w)
  const stageH = Math.max(size.height, min.h)
  const stage = { x: 0, y: 0, w: stageW, h: stageH }
  const geometry = renderTree ? computeGeometry(renderTree, stage) : { tiles: [], dividers: [] }
  const rectOf = new Map(geometry.tiles.map(g => [g.id, g.rect]))

  // After a tile is moved with the keyboard, keep the focus on its title bar.
  useLayoutEffect(() => {
    if (!refocus.current) return
    const el = areaRef.current?.querySelector<HTMLElement>(`[data-tile-id="${refocus.current}"] .wrTabTileTitle`)
    refocus.current = null
    el?.focus()
  })

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const handle = e.target as HTMLElement
    if (!handle.classList.contains('wrTabTileTitle')) return
    const dir = ARROWS[e.key]
    if (!dir) return
    e.preventDefault()
    const handles = Array.from(areaRef.current!.querySelectorAll<HTMLElement>('.wrTabTileTitle'))
    const boxes = handles.map(h => { const r = h.closest('[data-tile-id]')!.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })
    const from = handles.indexOf(handle)
    const to = handles[nextFocus(boxes, from, dir)]
    if (!to || to === handle) return
    if (e.altKey) {
      const a = handle.closest<HTMLElement>('[data-tile-id]')!.dataset.tileId!
      const b = to.closest<HTMLElement>('[data-tile-id]')!.dataset.tileId!
      layout.swap(a, b)
      refocus.current = a
    } else to.focus()
  }

  function onDragStart(e: DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const tile = (e.currentTarget as HTMLElement).closest('[data-tile-id]')
    if (tile) e.dataTransfer.setDragImage(tile, 12, 12)
  }
  function endDrag() { setDragId(null); setOverId(null); setOverEdge(null); setOverDivider(null) }
  function edgeSide(e: DragEvent, id: string): EdgeSide | null {
    const rect = rectOf.get(id)
    return rect ? edgeSideOf((e.currentTarget as HTMLElement).getBoundingClientRect(), e.clientX, e.clientY, rect, oneColumn) : null
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
    if (side === 'left' || side === 'right') layout.insertBeside(dragId, id, side)
    else if (side === 'top' || side === 'bottom') layout.insertBelow(dragId, id, side)
    else layout.swap(dragId, id)
    endDrag()
  }
  function onDividerDragOver(e: DragEvent, key: string, path: Path) {
    if (!dragId || !renderTree || !canInsertAt(renderTree, stage, path, false)) return
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
    const stageEl = areaRef.current
    if (!stageEl || !renderTree) return
    const box = stageEl.getBoundingClientRect()
    const branch = rectAtPath(renderTree, stage, path)
    const local = dir === 'row' ? clientX - box.left - branch.x : clientY - box.top - branch.y
    const total = (dir === 'row' ? branch.w : branch.h) - GRID_GAP
    if (total <= 0) return
    layout.resize(path, (local - GRID_GAP / 2) / total)
  }

  if (tiles.length === 0) return null
  return (
    <div className="wrSplit" ref={scrollRef} onKeyDown={onKeyDown}>
      <div ref={areaRef} className="wrSplitStage" role="group" aria-label={label ?? 'Tiles'} style={{ position: 'relative', width: stageW, height: stageH }}>
        {/* In the tiles' own order, so a swap moves a box and never the element (what is typed in it stays). */}
        {tiles.map(t => {
          const rect = rectOf.get(t.id)
          if (!rect) return null
          const edge = overEdge?.id === t.id ? overEdge.side : null
          const classes = ['wrTabTile', 'wrSplitTile', t.className, dragId === t.id ? 'wrSplitTile--dragging' : '', overId === t.id ? 'wrSplitTile--drop' : '', edge ? `wrSplitTile--edge-${edge}` : '']
            .filter(Boolean).join(' ')
          return (
            <section
              key={t.id} className={classes} aria-label={t.title} data-tile-id={t.id}
              style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              onDragOver={e => onDragOver(e, t.id)} onDrop={e => onDrop(e, t.id)}
            >
              <h3
                className="wrTabTileTitle" draggable tabIndex={0} title="Drag to move this tile (Alt+arrows to swap it)"
                onDragStart={e => onDragStart(e, t.id)} onDragEnd={endDrag}
              >
                <GripIcon size={13} />{t.Icon && <t.Icon size={14} />} {t.title}
              </h3>
              <div className={`wrTabTileBody${t.bodyClassName ? ` ${t.bodyClassName}` : ''}`}>{t.children}</div>
            </section>
          )
        })}
        {geometry.dividers.map(d => {
          const branch = renderTree ? getAtPath(renderTree, d.path) : null
          const ratio = branch && 'ratio' in branch ? branch.ratio : 0.5
          const key = d.path.join('.') || 'root'
          return (
            <Divider
              key={key} dir={d.dir} ratio={ratio}
              style={{ position: 'absolute', left: d.rect.x, top: d.rect.y, width: d.rect.w, height: d.rect.h }}
              onDragTo={(x, y) => dragTo(d.path, d.dir, x, y)}
              onResize={r => layout.resize(d.path, r)}
              dropTarget={overDivider === key}
              onDragOver={oneColumn ? undefined : e => onDividerDragOver(e, key, d.path)}
              onDrop={oneColumn ? undefined : e => onDividerDrop(e, d.path)}
            />
          )
        })}
      </div>
    </div>
  )
}

export default SplitArea
