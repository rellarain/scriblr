import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapShape } from '../../../../api/types'
import { FitIcon, ZoomInIcon, ZoomOutIcon } from '../../../icons'
import { findItem, hitItem, legendEntries, movedItem, placeOf as placeOfItem, snapPoint, withShape, type ItemRef } from './mapItems'
import type { MapDraft } from './mapModel'
import type { JourneyView } from './mapDrawJourneys'
import { drawMap } from './mapRender'
import { resolveBiome, type BiomeIndex } from './mapBiomes'
import { MIN_POINTS, insertPoint, movePoint, nearestOnShape, outVector, removePoint, setHandle, snapVertex, toggleSmooth, translateShape, type Pen } from './mapShapes'
import { cellAt, fitView, measureText, panBy, pathLength, zoomAt, type MapView } from './mapView'
import { moveStop, stopNear } from './mapJourneys'

export type MapTool = 'select' | 'biome' | 'symbol' | 'label' | 'line' | 'region' | 'measure' | 'hand' | 'journey'
type DrawTool = 'line' | 'region' | 'biome'
const drawsShape = (tool: MapTool): tool is DrawTool => tool === 'line' || tool === 'region' || tool === 'biome'

export interface MapCanvasProps {
  draft: MapDraft
  // The biomes the map is drawn with, and the one a new biome area is made in.
  biomes: BiomeIndex
  biome: string
  tool: MapTool
  showGrid: boolean
  // What new lines and regions are drawn with (and whether the points of a new biome area are curves).
  pen: Pen
  // The chosen symbol, label or shape (the Select tool picks one, and moves it).
  selected: ItemRef | null
  onSelect: (ref: ItemRef | null) => void
  // Stamp a symbol or put a label at a point (in cells); false when there is no layer to put it on (hidden or locked).
  onPlace: (kind: 'symbol' | 'label', x: number, y: number) => boolean
  // A line, region or biome area was drawn (its points, in cells); false when there is no layer to put it on.
  onFinishShape: (type: DrawTool, points: Array<[number, number]>) => boolean
  // A drag of an item is shown as it goes (a draft with the item moved) and is handed over, before and after, when it ends: one undo step.
  onPreview: (next: MapDraft) => void
  onCommitMove: (before: MapDraft, after: MapDraft) => void
  // A shape was changed in one step (a point put in, taken away or made smooth).
  onChangeShape: (shape: MapShape) => void
  // Delete or Backspace on the chosen item.
  onDelete: () => void
  // A double-click on a place that opens maps: the first of them is opened.
  onOpenPlace: (mapId: string) => void
  // What the Measure tool says of the path so far (null when it has none).
  onMeasure: (text: string | null) => void
  // The cell under the pointer (null off the map), and the point it is at (in cells), for the status line.
  onHover: (cell: [number, number] | null, at?: [number, number]) => void
  // A try to draw or place where nothing can be put (the layer is hidden or locked).
  onBlocked: () => void
  // The journeys to draw, and a click of the Journey tool: a stop at a cell centre of the chosen journey (false when there is no journey chosen).
  journeys?: JourneyView
  onAddStop?: (x: number, y: number) => boolean
}

const FALLBACK_SIZE = { width: 800, height: 520 }
// How close, in pixels, the pointer has to be to a point or a handle of the chosen shape to take it.
const GRAB_PX = 9

type Drag =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'move'; ref: ItemRef; before: MapDraft; current: MapDraft; dx: number; dy: number }
  | { kind: 'shape'; id: string; before: MapDraft; current: MapDraft; fx: number; fy: number }
  | { kind: 'node'; id: string; i: number; before: MapDraft; current: MapDraft }
  | { kind: 'handle'; id: string; i: number; sign: 1 | -1; before: MapDraft; current: MapDraft }
  | { kind: 'stop'; journeyId: string; stopId: string; before: MapDraft; current: MapDraft }
  | null

const clampTo = (draft: Pick<MapDraft, 'width' | 'height'>, x: number, y: number): [number, number] => [Math.min(draft.width, Math.max(0, x)), Math.min(draft.height, Math.max(0, y))]

// The map as a canvas: draw biome areas, lines and regions, stamp symbols and place text with the pointer, pick and move things with the Select tool (a chosen
// shape shows its points and handles to drag; double-click a point to curve or straighten it, a line to put a point in; double-click a place to open its
// map), wheel to zoom at the pointer, drag with the Hand tool (or the middle or right button) to pan. The Measure tool adds up the pieces of a path (and says
// how long it takes at the map's day's travel). Arrow keys move the chosen item (or point) by a cell, Delete removes it, Escape lets go of it.
export default function MapCanvas(p: MapCanvasProps) {
  const { draft } = p
  const box = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [view, setView] = useState<MapView>({ zoom: 8, x: 16, y: 16 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [hover, setHover] = useState<[number, number] | null>(null)
  // The chosen point of the chosen shape, and the line or region that is being drawn (its clicked points and where the pointer is).
  const [node, setNode] = useState<number | null>(null)
  const [pending, setPending] = useState<Array<[number, number]>>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  // The Measure tool's path, and where the pointer is on it.
  const [measure, setMeasure] = useState<Array<[number, number]>>([])
  const [measureCursor, setMeasureCursor] = useState<[number, number] | null>(null)
  const drag = useRef<Drag>(null)
  const latest = useRef(p)
  latest.current = p
  const nodeRef = useRef(node)
  nodeRef.current = node
  const pendingRef = useRef({ points: pending, cursor })
  pendingRef.current = { points: pending, cursor }
  const measureRef = useRef({ points: measure, cursor: measureCursor })
  measureRef.current = { points: measure, cursor: measureCursor }

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

  // Another thing chosen, another tool, or another map: the chosen point and the line that was being drawn are let go.
  const selectedId = p.selected?.kind === 'shape' ? p.selected.id : null
  useEffect(() => { setNode(null) }, [selectedId, draft.id])
  useEffect(() => { setPending([]); setCursor(null); setMeasure([]); setMeasureCursor(null) }, [p.tool, draft.id])

  // What the Measure tool says: the length of the path and the pointer's piece on to it, and how long that takes.
  const measured = measure.length > 0 ? measureText(pathLength(measureCursor ? [...measure, measureCursor] : measure), draft.cellSize, draft.unit, draft.pace) : null
  const onMeasure = p.onMeasure
  useEffect(() => { onMeasure(p.tool === 'measure' ? measured : null) }, [measured, p.tool, onMeasure])

  // Draw. (A frame at a time: many pointer moves in one frame draw once. The frame reads the size as it is when it runs: a frame asked for before the
  // canvas had its size would otherwise draw nothing, and keep the later ask from drawing.)
  const frame = useRef(0)
  const sizeRef = useRef(size)
  sizeRef.current = size
  const draw = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = canvas.current
      const d = latest.current
      const size = sizeRef.current
      if (!el || !size) return
      const ctx = el.getContext('2d')
      if (!ctx) return
      const ink = box.current ? getComputedStyle(box.current).color : '#000000'
      const pendingType = drawsShape(d.tool) ? d.tool : null
      drawMap(ctx, {
        width: size.width, height: size.height, dpr: window.devicePixelRatio || 1, view: viewRef.current, draft: d.draft, biomes: d.biomes,
        showGrid: d.showGrid, ink, selected: d.selected, selectedNode: nodeRef.current, journeys: d.journeys,
        measure: d.tool === 'measure' && measureRef.current.points.length > 0 ? { points: measureRef.current.points, cursor: measureRef.current.cursor, text: measureText(pathLength(measureRef.current.cursor ? [...measureRef.current.points, measureRef.current.cursor] : measureRef.current.points), d.draft.cellSize, d.draft.unit, d.draft.pace) } : null,
        pending: pendingType && pendingRef.current.points.length > 0
          ? { type: pendingType, points: pendingRef.current.points, cursor: pendingRef.current.cursor, pen: d.pen, color: resolveBiome(d.biomes, d.biome).color }
          : null,
        legend: d.draft.legend ? legendEntries(d.draft, d.biomes) : null,
      })
    })
  }, [])
  useEffect(() => { draw() }, [draw, size, view, draft, p.biomes, p.biome, p.showGrid, p.tool, p.selected, p.pen, p.journeys, hover, node, pending, cursor, measure, measureCursor])
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

  const point = (e: { clientX: number; clientY: number; currentTarget: EventTarget }) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { px: e.clientX - r.left, py: e.clientY - r.top }
  }
  // A point of the canvas as a place on the map, in cells (not rounded).
  const placeOf = (px: number, py: number): [number, number] => [(px - view.x) / view.zoom, (py - view.y) / view.zoom]
  const screenOf = (x: number, y: number): [number, number] => [view.x + x * view.zoom, view.y + y * view.zoom]
  // A point of a shape as drawn: snapped to the grid (corners and cell centres) unless Alt is held, and held to the map.
  const shapePoint = (fx: number, fy: number, free: boolean): [number, number] => {
    const [x, y] = free ? [fx, fy] : snapVertex(fx, fy)
    return clampTo(draft, x, y)
  }

  const chosenShape = (): MapShape | null => {
    const ref = latest.current.selected
    return ref?.kind === 'shape' ? latest.current.draft.shapes.find(s => s.id === ref.id) ?? null : null
  }

  // The point or handle of the chosen shape under a canvas point, if any.
  function grabbed(shape: MapShape, px: number, py: number): { kind: 'node'; i: number } | { kind: 'handle'; i: number; sign: 1 | -1 } | null {
    const closed = shape.type !== 'line'
    for (let i = 0; i < shape.points.length; i += 1) {
      const [sx, sy] = screenOf(shape.points[i].x, shape.points[i].y)
      if (Math.abs(px - sx) <= GRAB_PX && Math.abs(py - sy) <= GRAB_PX) return { kind: 'node', i }
    }
    for (let i = 0; i < shape.points.length; i += 1) {
      const pt = shape.points[i]
      if (!pt.smooth) continue
      const [vx, vy] = outVector(shape.points, i, closed)
      for (const sign of [1, -1] as const) {
        const [hx, hy] = screenOf(pt.x + sign * vx, pt.y + sign * vy)
        if (Math.hypot(px - hx, py - hy) <= GRAB_PX) return { kind: 'handle', i, sign }
      }
    }
    return null
  }

  function finishDrawing() {
    const type: DrawTool = p.tool === 'region' || p.tool === 'biome' ? p.tool : 'line'
    const points = pending
    setPending([]); setCursor(null)
    if (points.length >= MIN_POINTS[type] && !p.onFinishShape(type, points)) p.onBlocked()
  }

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
      const shape = chosenShape()
      const grab = shape ? grabbed(shape, px, py) : null
      if (shape && grab?.kind === 'node') {
        setNode(grab.i)
        drag.current = { kind: 'node', id: shape.id, i: grab.i, before: draft, current: draft }
        e.currentTarget.setPointerCapture?.(e.pointerId)
        return
      }
      if (shape && grab?.kind === 'handle') {
        setNode(grab.i)
        drag.current = { kind: 'handle', id: shape.id, i: grab.i, sign: grab.sign, before: draft, current: draft }
        e.currentTarget.setPointerCapture?.(e.pointerId)
        return
      }
      const hit = hitItem(draft, fx, fy)
      p.onSelect(hit)
      if (hit?.kind === 'shape') {
        setNode(null)
        drag.current = { kind: 'shape', id: hit.id, before: draft, current: draft, fx, fy }
        e.currentTarget.setPointerCapture?.(e.pointerId)
        return
      }
      const item = hit ? findItem(draft, hit) : undefined
      if (hit && item && 'x' in item) {
        drag.current = { kind: 'move', ref: hit, before: draft, current: draft, dx: fx - item.x, dy: fy - item.y }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      return
    }
    if (p.tool === 'measure') {
      if (!cell) return
      const at = snapPoint(fx, fy, e.altKey)
      const last = measure[measure.length - 1]
      if (!last || Math.hypot(last[0] - at[0], last[1] - at[1]) > 1e-6) setMeasure(list => [...list, at])
      return
    }
    if (drawsShape(p.tool)) {
      if (!cell) return
      const at = shapePoint(fx, fy, e.altKey)
      const last = pending[pending.length - 1]
      // (A double-click is two presses in one place: the second is not another point.)
      if (!last || Math.hypot(last[0] - at[0], last[1] - at[1]) > 1e-6) setPending(list => [...list, at])
      return
    }
    if (!cell) return
    if (p.tool === 'journey') {
      // A stop of the chosen journey is taken and dragged; anywhere else a click makes a new stop.
      const jv = p.journeys
      const chosen = jv?.list.find(j => j.id === jv.selectedId)
      const near = jv && jv.showPaths ? stopNear(chosen, fx, fy, GRAB_PX / view.zoom) : null
      if (chosen && near) {
        drag.current = { kind: 'stop', journeyId: chosen.id, stopId: near.id, before: draft, current: draft }
        e.currentTarget.setPointerCapture?.(e.pointerId)
        return
      }
      if (!p.onAddStop?.(cell[0] + 0.5, cell[1] + 0.5)) p.onBlocked()
      return
    }
    if (p.tool === 'symbol' || p.tool === 'label') {
      const [sx, sy] = snapPoint(fx, fy, e.altKey)
      if (!p.onPlace(p.tool, sx, sy)) p.onBlocked()
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
    if (d?.kind === 'move') {
      const [fx, fy] = placeOf(px, py)
      const [sx, sy] = snapPoint(fx - d.dx, fy - d.dy, e.altKey)
      d.current = movedItem(d.before, d.ref, sx, sy)
      p.onPreview(d.current)
      return
    }
    if (d?.kind === 'stop') {
      const [fx, fy] = placeOf(px, py)
      const [sx, sy] = clampTo(draft, e.altKey ? fx : Math.round(fx * 2) / 2, e.altKey ? fy : Math.round(fy * 2) / 2)
      d.current = moveStop(d.before, d.journeyId, d.stopId, sx, sy)?.draft ?? d.before
      p.onPreview(d.current)
      return
    }
    if (d && (d.kind === 'shape' || d.kind === 'node' || d.kind === 'handle')) {
      const shape = d.before.shapes.find(s => s.id === d.id)
      if (!shape) return
      const [fx, fy] = placeOf(px, py)
      let next: MapShape
      if (d.kind === 'node') {
        const [sx, sy] = shapePoint(fx, fy, e.altKey)
        next = movePoint(shape, d.i, sx, sy)
      } else if (d.kind === 'handle') {
        const pt = shape.points[d.i]
        // Dragging the far end of a handle is dragging the near end from the other side.
        next = setHandle(shape, d.i, d.sign === 1 ? fx : 2 * pt.x - fx, d.sign === 1 ? fy : 2 * pt.y - fy)
      } else {
        const snap = (n: number) => (e.altKey ? n : Math.round(n * 2) / 2)
        next = translateShape(shape, snap(fx - d.fx), snap(fy - d.fy), draft.width, draft.height)
      }
      d.current = withShape(d.before, next)
      p.onPreview(d.current)
      return
    }
    const cell = cellAt(view, px, py, draft.width, draft.height)
    setHover(prev => (prev && cell && prev[0] === cell[0] && prev[1] === cell[1] ? prev : cell))
    p.onHover(cell, cell ? placeOf(px, py) : undefined)
    if (p.tool === 'measure' && measure.length > 0) {
      const [fx, fy] = placeOf(px, py)
      setMeasureCursor(snapPoint(fx, fy, e.altKey))
    }
    if (drawsShape(p.tool) && pending.length > 0) {
      const [fx, fy] = placeOf(px, py)
      setCursor(shapePoint(fx, fy, e.altKey))
    }
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d && d.kind !== 'pan' && d.current !== d.before) p.onCommitMove(d.before, d.current)
  }

  function leave() {
    if (drag.current) return
    setHover(null)
    p.onHover(null)
  }

  // Double-click: finishes a shape being drawn; with the Select tool, on a point of the chosen shape it curves or straightens it, on its outline it puts a
  // point in, and anywhere else on a place that opens maps (a named symbol or area) it opens the first of them.
  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (drawsShape(p.tool)) { finishDrawing(); return }
    if (p.tool !== 'select') return
    const { px, py } = point(e)
    const [fx, fy] = placeOf(px, py)
    const shape = chosenShape()
    if (shape) {
      const grab = grabbed(shape, px, py)
      if (grab?.kind === 'node') { p.onChangeShape(toggleSmooth(shape, grab.i)); setNode(grab.i); return }
      const near = nearestOnShape(shape, fx, fy)
      if (near && near.dist * view.zoom <= GRAB_PX + (shape.type === 'line' ? (shape.width * view.zoom) / 2 : 0)) {
        const more = insertPoint(shape, near.seg, near.t)
        if (more) { p.onChangeShape(more); setNode(near.seg + 1) }
        return
      }
    }
    const here = hitItem(draft, fx, fy)
    const place = here ? placeOfItem(draft, here) : null
    if (place && place.name && place.mapIds.length > 0) p.onOpenPlace(place.mapIds[0])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (p.tool === 'measure') {
      if (e.key === 'Escape') { setMeasure([]); setMeasureCursor(null) }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setMeasure(list => list.slice(0, -1)) }
      return
    }
    if (drawsShape(p.tool)) {
      if (e.key === 'Enter') { e.preventDefault(); finishDrawing() }
      else if (e.key === 'Escape') { setPending([]); setCursor(null) }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); setPending(list => list.slice(0, -1)) }
      return
    }
    const ref = p.selected
    if (!ref) return
    const shape = chosenShape()
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      // With a point chosen, it is the point that goes (the shape keeps its fewest); otherwise the whole thing.
      if (shape && node !== null) {
        const less = removePoint(shape, node)
        if (less) { p.onChangeShape(less); setNode(null) }
        return
      }
      p.onDelete()
      return
    }
    if (e.key === 'Escape') { if (node !== null) setNode(null); else p.onSelect(null); return }
    const step = e.shiftKey ? 0.25 : 1
    const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = by[e.key]
    if (!move) return
    if (shape) {
      e.preventDefault()
      if (node !== null) {
        const pt = shape.points[node]
        const [nx, ny] = clampTo(draft, pt.x + move[0], pt.y + move[1])
        p.onCommitMove(draft, withShape(draft, movePoint(shape, node, nx, ny)))
      } else {
        p.onCommitMove(draft, withShape(draft, translateShape(shape, move[0], move[1], draft.width, draft.height)))
      }
      return
    }
    const item = findItem(draft, ref)
    if (item && 'x' in item) {
      e.preventDefault()
      p.onCommitMove(draft, movedItem(draft, ref, item.x + move[0], item.y + move[1]))
    }
  }

  const zoomBy = (factor: number) => {
    byHand.current = true
    if (size) setView(v => zoomAt(v, factor, size.width / 2, size.height / 2))
  }

  const cursorStyle = p.tool === 'hand' ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab') : p.tool === 'select' ? 'default' : 'crosshair'

  return (
    <div className="mapBox" ref={box}>
      <canvas
        ref={canvas} className="mapCanvas" role="img" tabIndex={0}
        aria-label={`${draft.title}, a map ${draft.width} by ${draft.height} cells`}
        width={size ? Math.round(size.width * (window.devicePixelRatio || 1)) : undefined}
        height={size ? Math.round(size.height * (window.devicePixelRatio || 1)) : undefined}
        style={{ width: size?.width, height: size?.height, cursor: cursorStyle }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={leave}
        onDoubleClick={onDoubleClick} onKeyDown={onKeyDown} onContextMenu={e => e.preventDefault()}
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
