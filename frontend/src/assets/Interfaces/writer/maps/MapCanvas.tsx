import { useCallback, useEffect, useRef, useState } from 'react'
import { FitIcon, ZoomInIcon, ZoomOutIcon } from '../../../icons'
import { brushCells, cellIndex, type MapDraft, type Stroke } from './mapModel'
import { drawMap, renderTerrain } from './mapRender'
import { cellAt, fitView, nearestCell, panBy, zoomAt, type MapView } from './mapView'

export type MapTool = 'brush' | 'fill' | 'pick' | 'hand'

export interface MapCanvasProps {
  draft: MapDraft
  // Changes when the cells changed in place (a stroke, an undo): the terrain is drawn again.
  rev: number
  tool: MapTool
  terrain: number
  brushSize: number
  showGrid: boolean
  // Paint: begin a stroke (null when the terrain layer is hidden or locked), end it, fill an area, pick up a terrain.
  onBeginStroke: (terrain: number, size: number) => Stroke | null
  onEndStroke: (stroke: Stroke) => void
  onFill: (x: number, y: number, terrain: number) => void
  onPick: (terrain: number) => void
  // The cell under the pointer (null off the map), for the status line.
  onHover: (cell: [number, number] | null) => void
  // A try to paint where the terrain cannot be painted.
  onBlocked: () => void
}

const FALLBACK_SIZE = { width: 800, height: 520 }

// The map as a canvas: paint with the pointer, wheel to zoom at the pointer, drag with the Hand tool (or the middle or right button) to pan.
export default function MapCanvas(p: MapCanvasProps) {
  const { draft, rev } = p
  const box = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const bitmap = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [view, setView] = useState<MapView>({ zoom: 8, x: 16, y: 16 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [hover, setHover] = useState<[number, number] | null>(null)
  const drag = useRef<{ kind: 'stroke'; stroke: Stroke; last: [number, number] } | { kind: 'pan'; x: number; y: number } | null>(null)
  const latest = useRef(p)
  latest.current = p

  const terrainShown = draft.layers.find(l => l.kind === 'terrain')?.visible ?? true

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

  // A map that is opened (or made another size) is fitted in view.
  const fit = useCallback(() => {
    if (size) setView(fitView(latest.current.draft.width, latest.current.draft.height, size.width, size.height))
  }, [size])
  const fitted = useRef('')
  useEffect(() => {
    const key = `${draft.id}:${draft.width}x${draft.height}`
    if (size && fitted.current !== key) { fitted.current = key; fit() }
  }, [draft.id, draft.width, draft.height, size, fit])

  // The terrain bitmap is made again when the cells or the palette change (and while a stroke paints), not when the view moves.
  const stale = useRef(true)
  useEffect(() => { stale.current = true }, [rev, draft.id, draft.cells, draft.terrains])
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
      if (stale.current || !bitmap.current) { bitmap.current = renderTerrain(d.draft, bitmap.current); stale.current = false }
      const ink = box.current ? getComputedStyle(box.current).color : '#000000'
      drawMap(ctx, {
        width: size.width, height: size.height, dpr: window.devicePixelRatio || 1, view: viewRef.current, draft: d.draft, bitmap: bitmap.current,
        showTerrain: d.draft.layers.find(l => l.kind === 'terrain')?.visible ?? true, showGrid: d.showGrid, ink,
        brush: d.tool === 'brush' && hoverRef.current ? brushCells(d.draft, hoverRef.current[0], hoverRef.current[1], d.brushSize).map(i => [i % d.draft.width, Math.floor(i / d.draft.width)] as [number, number]) : [],
      })
    })
  }, [size])
  useEffect(() => { draw() }, [draw, view, rev, draft, p.showGrid, p.tool, p.brushSize, hover, terrainShown])
  useEffect(() => () => { if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 } }, [])

  // The wheel zooms at the pointer (a listener of its own: React's wheel handler cannot stop the page scrolling).
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView(v => zoomAt(v, e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const point = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { px: e.clientX - r.left, py: e.clientY - r.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!size) return
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
    if (!cell) return
    if (p.tool === 'pick') {
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
    const cell = cellAt(view, px, py, draft.width, draft.height)
    setHover(prev => (prev && cell && prev[0] === cell[0] && prev[1] === cell[1] ? prev : cell))
    p.onHover(cell)
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d?.kind === 'stroke') p.onEndStroke(d.stroke)
  }

  function leave() {
    if (drag.current) return
    setHover(null)
    p.onHover(null)
  }

  const zoomBy = (factor: number) => {
    if (size) setView(v => zoomAt(v, factor, size.width / 2, size.height / 2))
  }

  const cursor = p.tool === 'hand' ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab') : p.tool === 'pick' || p.tool === 'fill' ? 'copy' : 'crosshair'

  return (
    <div className="mapBox" ref={box}>
      <canvas
        ref={canvas} className="mapCanvas" role="img" tabIndex={0}
        aria-label={`${draft.title}, a map ${draft.width} by ${draft.height} cells`}
        width={size ? Math.round(size.width * (window.devicePixelRatio || 1)) : undefined}
        height={size ? Math.round(size.height * (window.devicePixelRatio || 1)) : undefined}
        style={{ width: size?.width, height: size?.height, cursor }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={leave}
        onContextMenu={e => e.preventDefault()}
      />
      <div className="mapZoom" role="group" aria-label="View">
        <button type="button" className="mapIconBtn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.5)}><ZoomInIcon size={18} /></button>
        <button type="button" className="mapIconBtn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.5)}><ZoomOutIcon size={18} /></button>
        <button type="button" className="mapIconBtn" aria-label="Fit the map in view" title="Fit the map in view" onClick={fit}><FitIcon size={18} /></button>
        <span className="mapZoomLevel" aria-live="polite">{Math.round(view.zoom * 100) / 100}×</span>
      </div>
    </div>
  )
}
