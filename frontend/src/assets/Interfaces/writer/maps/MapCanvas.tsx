import { useCallback, useEffect, useRef, useState } from 'react'
import { FitIcon, ZoomInIcon, ZoomOutIcon } from '../../../icons'
import { findItem, hitItem, legendEntries, movedItem, snapPoint, type ItemRef } from './mapItems'
import { brushCells, cellIndex, terrainCounts, type MapDraft, type Stroke } from './mapModel'
import { drawMap, renderTerrain } from './mapRender'
import { cellAt, fitView, nearestCell, panBy, zoomAt, type MapView } from './mapView'

export type MapTool = 'select' | 'brush' | 'fill' | 'pick' | 'symbol' | 'label' | 'hand'

export interface MapCanvasProps {
  draft: MapDraft
  // Changes when the cells changed in place (a stroke, an undo): the terrain is drawn again.
  rev: number
  tool: MapTool
  terrain: number
  brushSize: number
  showGrid: boolean
  // The chosen symbol or label (the pointer's Select tool picks one, and moves it).
  selected: ItemRef | null
  onSelect: (ref: ItemRef | null) => void
  // Paint: begin a stroke (null when the terrain layer is hidden or locked), end it, fill an area, pick up a terrain.
  onBeginStroke: (terrain: number, size: number) => Stroke | null
  onEndStroke: (stroke: Stroke) => void
  onFill: (x: number, y: number, terrain: number) => void
  onPick: (terrain: number) => void
  // Stamp a symbol or put a label at a point (in cells); false when there is no layer to put it on (hidden or locked).
  onPlace: (kind: 'symbol' | 'label', x: number, y: number) => boolean
  // A drag of an item is shown as it goes (a draft with the item moved) and is handed over, before and after, when it ends: one undo step.
  onPreview: (next: MapDraft) => void
  onCommitMove: (before: MapDraft, after: MapDraft) => void
  // Delete or Backspace on the chosen item.
  onDelete: () => void
  // The cell under the pointer (null off the map), for the status line.
  onHover: (cell: [number, number] | null) => void
  // A try to paint or place where nothing can be put (the layer is hidden or locked).
  onBlocked: () => void
}

const FALLBACK_SIZE = { width: 800, height: 520 }

// The map as a canvas: paint or stamp with the pointer, pick and move things with the Select tool, wheel to zoom at the pointer, drag with the Hand tool
// (or the middle or right button) to pan. Arrow keys move the chosen item by a cell, Delete removes it, Escape lets go of it.
export default function MapCanvas(p: MapCanvasProps) {
  const { draft, rev } = p
  const box = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const bitmap = useRef<HTMLCanvasElement | null>(null)
  const counts = useRef<number[]>([])
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [view, setView] = useState<MapView>({ zoom: 8, x: 16, y: 16 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [hover, setHover] = useState<[number, number] | null>(null)
  const drag = useRef<
    | { kind: 'stroke'; stroke: Stroke; last: [number, number] }
    | { kind: 'pan'; x: number; y: number }
    | { kind: 'move'; ref: ItemRef; before: MapDraft; current: MapDraft; dx: number; dy: number }
    | null
  >(null)
  const latest = useRef(p)
  latest.current = p

  // The canvas takes the size of its box.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const next = r.width > 0 && r.height > 0 ? { width: Math.round(r.width), height: Math.round(r.height) } : FALLBACK_SIZE
      setSize(prev => (prev && prev.width === next.width && prev.height === next.height ? prev : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A map that is opened (or made another size) is fitted in view, and stays fitted while the canvas changes size (the console settling into its
  // tile) until the view is zoomed or moved by hand.
  const fit = useCallback(() => {
    if (size) setView(fitView(latest.current.draft.width, latest.current.draft.height, size.width, size.height))
  }, [size])
  const fitted = useRef('')
  const byHand = useRef(false)
  useEffect(() => {
    const key = `${draft.id}:${draft.width}x${draft.height}`
    if (!size) return
    if (fitted.current !== key) { fitted.current = key; byHand.current = false; fit() }
    else if (!byHand.current) fit()
  }, [draft.id, draft.width, draft.height, size, fit])

  // The terrain bitmap (and the count of each terrain, for the legend) is made again when the cells, the palette or the look change (and while a
  // stroke paints), not when the view moves.
  const stale = useRef(true)
  useEffect(() => { stale.current = true }, [rev, draft.id, draft.cells, draft.terrains, draft.theme])
  const hoverRef = useRef<[number, number] | null>(null)
  hoverRef.current = hover

  // Draw. (A frame at a time: many pointer moves in one frame draw once.)
  const frame = useRef(0)
  const draw = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = canvas.current
      const d = latest.current
      if (!el || !size) return
      const ctx = el.getContext('2d')
      if (!ctx) return
      if (stale.current || !bitmap.current) {
        bitmap.current = renderTerrain(d.draft, bitmap.current)
        counts.current = d.draft.legend ? terrainCounts(d.draft.cells, d.draft.terrains.length) : []
        stale.current = false
      }
      const ink = box.current ? getComputedStyle(box.current).color : '#000000'
      drawMap(ctx, {
        width: size.width, height: size.height, dpr: window.devicePixelRatio || 1, view: viewRef.current, draft: d.draft, bitmap: bitmap.current,
        showGrid: d.showGrid, ink, selected: d.selected,
        legend: d.draft.legend ? legendEntries(d.draft, counts.current) : null,
        brush: d.tool === 'brush' && hoverRef.current ? brushCells(d.draft, hoverRef.current[0], hoverRef.current[1], d.brushSize).map(i => [i % d.draft.width, Math.floor(i / d.draft.width)] as [number, number]) : [],
      })
    })
  }, [size])
  // (The legend counts terrain, so it is counted when the legend is turned on; the symbols it lists are read at every draw.)
  useEffect(() => { if (draft.legend) stale.current = true }, [draft.legend])
  useEffect(() => { draw() }, [draw, view, rev, draft, p.showGrid, p.tool, p.brushSize, p.selected, hover])
  useEffect(() => () => { if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 } }, [])

  // The wheel zooms at the pointer (a listener of its own: React's wheel handler cannot stop the page scrolling).
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      byHand.current = true
      setView(v => zoomAt(v, e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const point = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { px: e.clientX - r.left, py: e.clientY - r.top }
  }
  // A point of the canvas as a place on the map, in cells (not rounded).
  const placeOf = (px: number, py: number): [number, number] => [(px - view.x) / view.zoom, (py - view.y) / view.zoom]

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!size) return
    e.currentTarget.focus()
    const { px, py } = point(e)
    const panning = p.tool === 'hand' || e.button === 1 || e.button === 2
    if (panning) {
      drag.current = { kind: 'pan', x: px, y: py }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      e.preventDefault()
      return
    }
    if (e.button !== 0) return
    const cell = cellAt(view, px, py, draft.width, draft.height)
    const [fx, fy] = placeOf(px, py)
    if (p.tool === 'select') {
      const hit = hitItem(draft, fx, fy)
      p.onSelect(hit)
      const item = hit ? findItem(draft, hit) : undefined
      if (hit && item) {
        drag.current = { kind: 'move', ref: hit, before: draft, current: draft, dx: fx - item.x, dy: fy - item.y }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      return
    }
    if (!cell) return
    if (p.tool === 'symbol' || p.tool === 'label') {
      const [sx, sy] = snapPoint(fx, fy, e.altKey)
      if (!p.onPlace(p.tool, sx, sy)) p.onBlocked()
    } else if (p.tool === 'pick') {
      p.onPick(draft.cells[cellIndex(draft.width, cell[0], cell[1])])
    } else if (p.tool === 'fill') {
      p.onFill(cell[0], cell[1], p.terrain)
    } else {
      const stroke = p.onBeginStroke(p.terrain, p.brushSize)
      if (!stroke) { p.onBlocked(); return }
      stroke.paint(null, null, cell[0], cell[1])
      drag.current = { kind: 'stroke', stroke, last: cell }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      stale.current = true
      draw()
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!size) return
    const { px, py } = point(e)
    const d = drag.current
    if (d?.kind === 'pan') {
      byHand.current = true
      setView(v => panBy(v, px - d.x, py - d.y, draft.width, draft.height, size.width, size.height))
      d.x = px; d.y = py
      return
    }
    if (d?.kind === 'stroke') {
      const cell = nearestCell(view, px, py, draft.width, draft.height)
      d.stroke.paint(d.last[0], d.last[1], cell[0], cell[1])
      stale.current = true
      d.last = cell
      setHover(cell)
      p.onHover(cell)
      draw()
      return
    }
    if (d?.kind === 'move') {
      const [fx, fy] = placeOf(px, py)
      const [sx, sy] = snapPoint(fx - d.dx, fy - d.dy, e.altKey)
      d.current = movedItem(d.before, d.ref, sx, sy)
      p.onPreview(d.current)
      return
    }
    const cell = cellAt(view, px, py, draft.width, draft.height)
    setHover(prev => (prev && cell && prev[0] === cell[0] && prev[1] === cell[1] ? prev : cell))
    p.onHover(cell)
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d?.kind === 'stroke') p.onEndStroke(d.stroke)
    else if (d?.kind === 'move' && d.current !== d.before) p.onCommitMove(d.before, d.current)
  }

  function leave() {
    if (drag.current) return
    setHover(null)
    p.onHover(null)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const ref = p.selected
    if (!ref) return
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); p.onDelete(); return }
    if (e.key === 'Escape') { p.onSelect(null); return }
    const step = e.shiftKey ? 0.25 : 1
    const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = by[e.key]
    const item = findItem(draft, ref)
    if (move && item) {
      e.preventDefault()
      p.onCommitMove(draft, movedItem(draft, ref, item.x + move[0], item.y + move[1]))
    }
  }

  const zoomBy = (factor: number) => {
    byHand.current = true
    if (size) setView(v => zoomAt(v, factor, size.width / 2, size.height / 2))
  }

  const cursor = p.tool === 'hand' ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab')
    : p.tool === 'select' ? 'default' : p.tool === 'pick' || p.tool === 'fill' ? 'copy' : 'crosshair'

  return (
    <div className="mapBox" ref={box}>
      <canvas
        ref={canvas} className="mapCanvas" role="img" tabIndex={0}
        aria-label={`${draft.title}, a map ${draft.width} by ${draft.height} cells`}
        width={size ? Math.round(size.width * (window.devicePixelRatio || 1)) : undefined}
        height={size ? Math.round(size.height * (window.devicePixelRatio || 1)) : undefined}
        style={{ width: size?.width, height: size?.height, cursor }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={leave}
        onKeyDown={onKeyDown} onContextMenu={e => e.preventDefault()}
      />
      <div className="mapZoom" role="group" aria-label="View">
        <button type="button" className="mapIconBtn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.5)}><ZoomInIcon size={18} /></button>
        <button type="button" className="mapIconBtn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.5)}><ZoomOutIcon size={18} /></button>
        <button type="button" className="mapIconBtn" aria-label="Fit the map in view" title="Fit the map in view" onClick={() => { byHand.current = false; fit() }}><FitIcon size={18} /></button>
        <span className="mapZoomLevel" aria-live="polite">{Math.round(view.zoom * 100) / 100}×</span>
      </div>
    </div>
  )
}
