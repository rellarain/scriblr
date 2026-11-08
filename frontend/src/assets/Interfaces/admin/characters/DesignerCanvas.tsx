import { useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { addPoint, deletePoint, moveHandle, movePoint, moveShape, nudgePoint } from './engine/edit'
import { autoHandles, build, nearestEdge, type Box } from './engine/geometry'
import { shapePath, shapesBox } from './engine/svgText'
import { activeShape, shapesOf, type EditMode, type Selection } from './designerState'

// The designer's canvas: the model's shapes in an SVG, with the selected shape's points, curve handles and mirror line. Left button: select a shape,
// drag a point or a handle (point editor) or the whole shape (move shape). Right button: a click on the grid unselects everything, a click on a shape
// moves through point editor, move shape, unselected; a drag pans. Arrow keys move the selected point (Shift: bigger steps), Delete removes it.
// Nothing here changes the content itself: it reports gestures, and the page applies them (and keeps the undo stack).

export const FIGURE: Box = { x: 0, y: 0, w: 200, h: 400 }
const ASPECT = 8 / 7
const FALLBACK = { w: 704, h: 616 }   // the canvas's pixel size when the browser cannot say (tests)

export interface CanvasProps {
  content: ModelContent
  sel: Selection
  mode: EditMode
  selPoint: number
  mirror: boolean
  snap: boolean
  grid: boolean
  zoom: number
  // Fit the whole figure (true) or the selection (false).
  fitAll: boolean
  onSelect: (sel: Selection) => void
  onSelectPoint: (i: number) => void
  // A drag is about to change the content: remember it for undo once.
  onGesture: () => void
  // The shape's new form while it is dragged (no undo entry of its own).
  onShape: (id: string, next: ModelShape) => void
  // Discrete edits: they remember the content themselves.
  onEditShape: (id: string, next: ModelShape, selectPoint?: number) => void
  onRightClick: (target: { kind: 'grid' } | { kind: 'shape'; id: string }) => void
  // Which mode the caller's keys set (the canvas itself only reports).
  onEscape: () => void
}

type Drag =
  | { kind: 'point'; shapeId: string; index: number }
  | { kind: 'handle'; shapeId: string; index: number; which: 'hi' | 'ho' }
  | { kind: 'move'; shapeId: string; last: [number, number] }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number; target: { kind: 'grid' } | { kind: 'shape'; id: string }; moved: boolean }

export function DesignerCanvas(p: CanvasProps) {
  const { content, sel, mode, selPoint, mirror, snap, grid, zoom, fitAll } = p
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const focus = shapesOf(content, sel)
  const focusIds = new Set(focus.map(s => s.id))
  const none = sel.kind === 'none'
  const box = fitAll || none ? FIGURE : shapesBox(focus) ?? FIGURE
  let w = Math.max(box.w * 1.7, 24), h = Math.max(box.h * 1.7, 21)
  if (w / h < ASPECT) w = h * ASPECT
  else h = w / ASPECT
  w /= zoom; h /= zoom
  const vb = { x: box.x + box.w / 2 + pan.x - w / 2, y: box.y + box.h / 2 + pan.y - h / 2, w, h }
  const u = vb.w / 640   // one screen pixel in model units, roughly

  const shape = activeShape(content, sel)
  const ordered = [...content.shapes].filter(s => s.pts.length >= 3).sort((a, b) => a.z - b.z)

  function rect() {
    const r = svgRef.current?.getBoundingClientRect()
    return { left: r?.left ?? 0, top: r?.top ?? 0, w: r?.width || FALLBACK.w, h: r?.height || FALLBACK.h }
  }
  function toWorld(e: { clientX: number; clientY: number }): [number, number] {
    const r = rect()
    return [vb.x + ((e.clientX - r.left) / r.w) * vb.w, vb.y + ((e.clientY - r.top) / r.h) * vb.h]
  }
  const capture = (e: ReactPointerEvent) => { try { svgRef.current?.setPointerCapture(e.pointerId) } catch { /* not every environment has it */ } }
  const options = { mirror, snap }

  function onDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: { kind: 'grid' }, moved: false }
      capture(e)
    }
  }
  function onShapeDown(e: ReactPointerEvent, s: ModelShape) {
    e.stopPropagation()
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: { kind: 'shape', id: s.id }, moved: false }
      capture(e)
      return
    }
    if (e.button !== 0) return
    const already = sel.kind === 'shape' && sel.id === s.id
    if (!already) p.onSelect({ kind: 'shape', id: s.id })
    if (mode === 'move' && already) {
      p.onGesture()
      dragRef.current = { kind: 'move', shapeId: s.id, last: toWorld(e) }
      capture(e)
    }
  }
  function onPointDown(e: ReactPointerEvent, i: number) {
    e.stopPropagation()
    if (!shape || e.button !== 0) return
    p.onSelectPoint(i)
    p.onGesture()
    dragRef.current = { kind: 'point', shapeId: shape.id, index: i }
    capture(e)
  }
  function onHandleDown(e: ReactPointerEvent, which: 'hi' | 'ho') {
    e.stopPropagation()
    if (!shape || e.button !== 0) return
    p.onGesture()
    dragRef.current = { kind: 'handle', shapeId: shape.id, index: selPoint, which }
    capture(e)
  }
  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'pan') {
      const r = rect(), dx = e.clientX - d.startX, dy = e.clientY - d.startY
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (d.moved) setPan({ x: d.panX - (dx / r.w) * vb.w, y: d.panY - (dy / r.h) * vb.h })
      return
    }
    const s = content.shapes.find(x => x.id === d.shapeId)
    if (!s) return
    const [x, y] = toWorld(e)
    if (d.kind === 'point') p.onShape(s.id, movePoint(s, d.index, x, y, options))
    else if (d.kind === 'handle') p.onShape(s.id, moveHandle(s, d.index, d.which, x, y, options))
    else {
      p.onShape(s.id, moveShape(s, x - d.last[0], y - d.last[1]))
      d.last = [x, y]
    }
  }
  function onUp() {
    const d = dragRef.current
    dragRef.current = null
    if (d && d.kind === 'pan' && !d.moved) p.onRightClick(d.target)
  }
  function onDouble(e: ReactMouseEvent, s: ModelShape) {
    e.stopPropagation()
    const [x, y] = toWorld(e)
    const hit = nearestEdge(s.pts, x, y)
    if (!hit) return
    const added = addPoint(s, hit.e, { mirror })
    if (added.index < 0) return
    const placed = mirror ? added.shape : movePoint(added.shape, added.index, hit.x, hit.y)
    p.onEditShape(s.id, placed, added.index)
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (!shape) return
    const step = e.shiftKey ? 5 : 0.5
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (d[e.key]) {
      e.preventDefault()
      p.onEditShape(shape.id, mode === 'move' ? moveShape(shape, d[e.key][0], d[e.key][1]) : nudgePoint(shape, selPoint, d[e.key][0], d[e.key][1], { mirror }), undefined)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'points') {
      e.preventDefault()
      const next = deletePoint(shape, selPoint, { mirror })
      if (next) p.onEditShape(shape.id, next, Math.max(0, Math.min(selPoint, next.pts.length - 1)))
    } else if (e.key === 'Escape') {
      p.onEscape()
    }
  }

  // The grid is a line every 10 units when zoomed out, 5 closer, 1 closer still.
  const step = vb.w > 120 ? 10 : vb.w > 40 ? 5 : 1
  const gridLines: ReactElement[] = []
  if (grid) {
    for (let k = Math.ceil(vb.x / step); k * step < vb.x + vb.w; k++) gridLines.push(<line key={`v${k}`} x1={k * step} y1={vb.y} x2={k * step} y2={vb.y + vb.h} className={k % 5 === 0 ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
    for (let k = Math.ceil(vb.y / step); k * step < vb.y + vb.h; k++) gridLines.push(<line key={`h${k}`} x1={vb.x} y1={k * step} x2={vb.x + vb.w} y2={k * step} className={k % 5 === 0 ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
  }

  const built = shape ? build(shape.pts, shape.closed) : []
  const handles = shape ? autoHandles(shape.pts, shape.closed) : []
  const cur = shape?.pts[selPoint]
  const nudgeHint = mode === 'move' ? 'Arrow keys move the shape' : 'Arrow keys move the point; Delete removes it'

  return (
    <svg
      ref={svgRef} className="cmCanvas" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="application" tabIndex={0}
      aria-label={`Designer canvas. ${nudgeHint}. Right-click the grid to see the end result.`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()} onKeyDown={onKey}
    >
      <rect x={vb.x - 1} y={vb.y - 1} width={vb.w + 2} height={vb.h + 2} className="cmCanvasBg" />
      {gridLines}
      <line x1={100} y1={vb.y} x2={100} y2={vb.y + vb.h} className={`cmMirrorLine${mirror ? ' cmMirrorLine--on' : ''}`} />
      {ordered.map(s => (
        <path
          key={s.id} d={shapePath(s)} data-shape={s.id}
          className={`cmShape${focusIds.has(s.id) ? ' cmShape--on' : ''}${!none && focusIds.size > 0 && !focusIds.has(s.id) ? ' cmShape--dim' : ''}${sel.kind === 'shape' && sel.id === s.id ? ' cmShape--sel' : ''}`}
          fillOpacity={s.op}
          onPointerDown={e => onShapeDown(e, s)} onDoubleClick={e => onDouble(e, s)}
        />
      ))}
      {shape && mode === 'points' && handles.length > 0 && cur && (
        <g className="cmHandles">
          {(cur.m === 'c' || cur.m === 'cs') && <HandleDot x={cur.x} y={cur.y} dx={handles[selPoint].hi[0]} dy={handles[selPoint].hi[1]} u={u} label="Incoming curve handle" onDown={e => onHandleDown(e, 'hi')} />}
          {(cur.m === 'c' || cur.m === 'sc') && <HandleDot x={cur.x} y={cur.y} dx={handles[selPoint].ho[0]} dy={handles[selPoint].ho[1]} u={u} label="Outgoing curve handle" onDown={e => onHandleDown(e, 'ho')} />}
        </g>
      )}
      {shape && mode === 'points' && built.map((b, i) => (
        <circle
          key={i} cx={b.x} cy={b.y} r={(i === selPoint ? 5.5 : 4) * u} role="button" tabIndex={-1} aria-label={`Point ${i + 1}`} aria-pressed={i === selPoint}
          className={`cmPoint${i === selPoint ? ' cmPoint--sel' : ''}${shape.pts[i].m === 's' ? ' cmPoint--sharp' : ''}`}
          onPointerDown={e => onPointDown(e, i)}
        />
      ))}
    </svg>
  )
}

// A curve handle: a line from its point and a dot at its end that can be dragged.
function HandleDot({ x, y, dx, dy, u, label, onDown }: { x: number; y: number; dx: number; dy: number; u: number; label: string; onDown: (e: ReactPointerEvent) => void }) {
  return (
    <>
      <line x1={x} y1={y} x2={x + dx} y2={y + dy} className="cmHandleLine" />
      <circle cx={x + dx} cy={y + dy} r={3.5 * u} role="button" tabIndex={-1} aria-label={label} className="cmHandle" onPointerDown={onDown} />
    </>
  )
}
