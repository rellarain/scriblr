import { useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { addPoint, deletePoint, moveHandle, movePoint, moveShape, nudgePoint } from './engine/edit'
import { apply, build, inverse, nearestEdge, type Box } from './engine/geometry'
import type { Solved } from './engine/rig'
import { activeShape, shapesOf, type EditMode, type Selection } from './designerState'

// The designer's canvas: the solved model's shapes in an SVG (every group where its pivots, anchors and the test sliders put it), with the selected shape's
// points, curve handles and mirror line, and the selected group's pivot. Left button: select a shape, drag a point or a handle (point editor) or the whole
// shape (move shape), or the pivot. Right button: a click on the grid unselects everything, a click on a shape moves through point editor, move shape,
// unselected; a drag pans. Arrow keys move the selected point (Shift: bigger steps), Delete removes it. A shape is edited through its group's matrix, so it
// can be edited with the groups turned; `editable` is false when a slider changes the shape's own points (what is drawn is then not what is stored).
// Nothing here changes the content itself: it reports gestures, and the page applies them (and keeps the undo stack).

export const FIGURE: Box = { x: 0, y: 0, w: 200, h: 400 }
const ASPECT = 8 / 7
const FALLBACK = { w: 704, h: 616 }   // the canvas's pixel size when the browser cannot say (tests)

export interface PivotMarker {
  groupId: string
  name: string
  // Where it is drawn (canvas space).
  x: number
  y: number
  // Whether dragging or nudging it does anything (not when a slider is away from rest). For an anchored group it moves the anchor.
  draggable: boolean
}

export interface CanvasProps {
  content: ModelContent
  solved: Solved
  sel: Selection
  mode: EditMode
  selPoint: number
  mirror: boolean
  snap: boolean
  grid: boolean
  zoom: number
  // The line the model mirrors about.
  axis: number
  // Fit the whole figure (true) or the selection (false).
  fitAll: boolean
  // False while the selected shape's points are changed by a slider, or the shape is a derived twin: it is shown, not edited.
  editable?: boolean
  pivot?: PivotMarker | null
  anchor?: [number, number] | null
  // Clicking one of these shapes picks an anchor instead of selecting it.
  pick?: { shapes: string[] } | null
  onPick?: (shapeId: string, x: number, y: number) => void
  onPivot?: (x: number, y: number) => void
  onPivotNudge?: (dx: number, dy: number) => void
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
  | { kind: 'pivot' }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number; target: { kind: 'grid' } | { kind: 'shape'; id: string }; moved: boolean }

export function DesignerCanvas(p: CanvasProps) {
  const { content, solved, sel, mode, selPoint, mirror, snap, grid, zoom, fitAll, axis, pivot, anchor } = p
  const editable = p.editable !== false
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const focus = shapesOf(content, sel)
  const focusIds = new Set(focus.map(s => s.id))
  const none = sel.kind === 'none'
  const box = fitAll || none ? FIGURE : boxOfSolved(solved, focus) ?? FIGURE
  let w = Math.max(box.w * 1.7, 24), h = Math.max(box.h * 1.7, 21)
  if (w / h < ASPECT) w = h * ASPECT
  else h = w / ASPECT
  w /= zoom; h /= zoom
  const vb = { x: box.x + box.w / 2 + pan.x - w / 2, y: box.y + box.h / 2 + pan.y - h / 2, w, h }
  const u = vb.w / 640   // one screen pixel in model units, roughly

  const shape = activeShape(content, sel)
  const solvedShape = shape ? solved.shapes[shape.id] : undefined
  const matrix = solvedShape?.matrix
  const overlay = !!shape && !!solvedShape?.visible && shape.pts.length >= 3
  const shapesById = new Map(content.shapes.map(s => [s.id, s]))
  const picking = new Set(p.pick?.shapes ?? [])

  function rect() {
    const r = svgRef.current?.getBoundingClientRect()
    return { left: r?.left ?? 0, top: r?.top ?? 0, w: r?.width || FALLBACK.w, h: r?.height || FALLBACK.h }
  }
  // The pointer in canvas space, and in the selected shape's own space (the shape is drawn through its group's matrix).
  function toWorld(e: { clientX: number; clientY: number }): [number, number] {
    const r = rect()
    return [vb.x + ((e.clientX - r.left) / r.w) * vb.w, vb.y + ((e.clientY - r.top) / r.h) * vb.h]
  }
  function toLocal(e: { clientX: number; clientY: number }): [number, number] {
    const [x, y] = toWorld(e)
    return matrix ? apply(inverse(matrix), x, y) : [x, y]
  }
  const capture = (e: ReactPointerEvent) => { try { svgRef.current?.setPointerCapture(e.pointerId) } catch { /* not every environment has it */ } }
  const options = { mirror, snap, axis }

  function onDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: { kind: 'grid' }, moved: false }
      capture(e)
    }
  }
  function onShapeDown(e: ReactPointerEvent, id: string) {
    e.stopPropagation()
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: { kind: 'shape', id }, moved: false }
      capture(e)
      return
    }
    if (e.button !== 0) return
    if (p.pick) {
      if (picking.has(id)) { const [x, y] = toWorld(e); p.onPick?.(id, x, y) }
      return
    }
    const already = sel.kind === 'shape' && sel.id === id
    if (!already) p.onSelect({ kind: 'shape', id })
    if (mode === 'move' && already && editable) {
      p.onGesture()
      dragRef.current = { kind: 'move', shapeId: id, last: toLocal(e) }
      capture(e)
    }
  }
  function onPointDown(e: ReactPointerEvent, i: number) {
    e.stopPropagation()
    if (!shape || e.button !== 0) return
    p.onSelectPoint(i)
    if (!editable) return
    p.onGesture()
    dragRef.current = { kind: 'point', shapeId: shape.id, index: i }
    capture(e)
  }
  function onHandleDown(e: ReactPointerEvent, which: 'hi' | 'ho') {
    e.stopPropagation()
    if (!shape || e.button !== 0 || !editable) return
    p.onGesture()
    dragRef.current = { kind: 'handle', shapeId: shape.id, index: selPoint, which }
    capture(e)
  }
  function onPivotDown(e: ReactPointerEvent) {
    e.stopPropagation()
    if (e.button !== 0 || !pivot?.draggable) return
    p.onGesture()
    dragRef.current = { kind: 'pivot' }
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
    if (d.kind === 'pivot') { const [wx, wy] = toWorld(e); p.onPivot?.(wx, wy); return }
    const s = shapesById.get(d.shapeId)
    if (!s) return
    const [x, y] = toLocal(e)
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
    if (!editable || p.pick) return
    const [x, y] = toLocal(e)
    const hit = nearestEdge(s.pts, x, y)
    if (!hit) return
    const added = addPoint(s, hit.e, { mirror, axis })
    if (added.index < 0) return
    const placed = mirror ? added.shape : movePoint(added.shape, added.index, hit.x, hit.y)
    p.onEditShape(s.id, placed, added.index)
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'Escape') { p.onEscape(); return }
    if (!shape || !editable) return
    const step = e.shiftKey ? 5 : 0.5
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (d[e.key]) {
      e.preventDefault()
      p.onEditShape(shape.id, mode === 'move' ? moveShape(shape, d[e.key][0], d[e.key][1]) : nudgePoint(shape, selPoint, d[e.key][0], d[e.key][1], { mirror, axis }), undefined)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'points') {
      e.preventDefault()
      const next = deletePoint(shape, selPoint, { mirror, axis })
      if (next) p.onEditShape(shape.id, next, Math.max(0, Math.min(selPoint, next.pts.length - 1)))
    }
  }
  function onPivotKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 5 : 0.5
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (!d[e.key] || !pivot?.draggable) return
    e.preventDefault()
    e.stopPropagation()
    p.onPivotNudge?.(d[e.key][0], d[e.key][1])
  }

  // The grid is a line every 10 units when zoomed out, 5 closer, 1 closer still.
  const step = vb.w > 120 ? 10 : vb.w > 40 ? 5 : 1
  const gridLines: ReactElement[] = []
  if (grid) {
    for (let k = Math.ceil(vb.x / step); k * step < vb.x + vb.w; k++) gridLines.push(<line key={`v${k}`} x1={k * step} y1={vb.y} x2={k * step} y2={vb.y + vb.h} className={k % 5 === 0 ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
    for (let k = Math.ceil(vb.y / step); k * step < vb.y + vb.h; k++) gridLines.push(<line key={`h${k}`} x1={vb.x} y1={k * step} x2={vb.x + vb.w} y2={k * step} className={k % 5 === 0 ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
  }

  const built = overlay && matrix ? build(shape!.pts, shape!.closed, matrix) : []
  const cur = built[selPoint]
  const nudgeHint = !editable ? 'This shape is shown, not edited' : mode === 'move' ? 'Arrow keys move the shape' : 'Arrow keys move the point; Delete removes it'

  return (
    <svg
      ref={svgRef} className={`cmCanvas${p.pick ? ' cmCanvas--pick' : ''}`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="application" tabIndex={0}
      aria-label={`Designer canvas. ${nudgeHint}. Right-click the grid to see the end result.`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()} onKeyDown={onKey}
    >
      <rect x={vb.x - 1} y={vb.y - 1} width={vb.w + 2} height={vb.h + 2} className="cmCanvasBg" />
      {gridLines}
      <line x1={axis} y1={vb.y} x2={axis} y2={vb.y + vb.h} className={`cmMirrorLine${mirror ? ' cmMirrorLine--on' : ''}`} />
      {solved.order.map(id => {
        const s = shapesById.get(id), r = solved.shapes[id]
        if (!s || !r?.d) return null
        const pickable = picking.has(id)
        return (
          <path
            key={id} d={r.d} data-shape={id}
            className={`cmShape${focusIds.has(id) ? ' cmShape--on' : ''}${!none && focusIds.size > 0 && !focusIds.has(id) ? ' cmShape--dim' : ''}${sel.kind === 'shape' && sel.id === id ? ' cmShape--sel' : ''}${pickable ? ' cmShape--pick' : ''}${p.pick && !pickable ? ' cmShape--off' : ''}`}
            fillOpacity={s.op}
            onPointerDown={e => onShapeDown(e, id)} onDoubleClick={e => onDouble(e, s)}
          />
        )
      })}
      {overlay && mode === 'points' && cur && (
        <g className="cmHandles">
          {(cur.m === 'c' || cur.m === 'cs') && <HandleDot x={cur.x} y={cur.y} hx={cur.hix} hy={cur.hiy} u={u} label="Incoming curve handle" onDown={e => onHandleDown(e, 'hi')} />}
          {(cur.m === 'c' || cur.m === 'sc') && <HandleDot x={cur.x} y={cur.y} hx={cur.hox} hy={cur.hoy} u={u} label="Outgoing curve handle" onDown={e => onHandleDown(e, 'ho')} />}
        </g>
      )}
      {overlay && mode === 'points' && built.map((b, i) => (
        <circle
          key={i} cx={b.x} cy={b.y} r={(i === selPoint ? 5.5 : 4) * u} role="button" tabIndex={-1} aria-label={`Point ${i + 1}`} aria-pressed={i === selPoint}
          className={`cmPoint${i === selPoint ? ' cmPoint--sel' : ''}${shape!.pts[i].m === 's' ? ' cmPoint--sharp' : ''}${editable ? '' : ' cmPoint--off'}`}
          onPointerDown={e => onPointDown(e, i)}
        />
      ))}
      {anchor && <rect x={anchor[0] - 3.5 * u} y={anchor[1] - 3.5 * u} width={7 * u} height={7 * u} transform={`rotate(45 ${anchor[0]} ${anchor[1]})`} className="cmAnchor" aria-hidden="true" />}
      {pivot && (
        <g
          className={`cmPivot${pivot.draggable ? '' : ' cmPivot--off'}`} role="button" tabIndex={0} aria-label={`Pivot of ${pivot.name}${pivot.draggable ? '. Drag it, or press the arrow keys' : ''}`}
          onPointerDown={onPivotDown} onKeyDown={onPivotKey}
        >
          <circle cx={pivot.x} cy={pivot.y} r={9 * u} className="cmPivotHit" />
          <circle cx={pivot.x} cy={pivot.y} r={5 * u} className="cmPivotRing" />
          <line x1={pivot.x - 8 * u} y1={pivot.y} x2={pivot.x + 8 * u} y2={pivot.y} className="cmPivotCross" />
          <line x1={pivot.x} y1={pivot.y - 8 * u} x2={pivot.x} y2={pivot.y + 8 * u} className="cmPivotCross" />
        </g>
      )}
    </svg>
  )
}

// The box around the solved shapes of a selection (null when none of them is drawn).
function boxOfSolved(solved: Solved, shapes: ModelShape[]): Box | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false
  for (const s of shapes) {
    const r = solved.shapes[s.id]
    if (!r || !r.visible) continue
    any = true
    x0 = Math.min(x0, r.box.x); y0 = Math.min(y0, r.box.y); x1 = Math.max(x1, r.box.x + r.box.w); y1 = Math.max(y1, r.box.y + r.box.h)
  }
  return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

// A curve handle: a line from its point and a dot at its end that can be dragged.
function HandleDot({ x, y, hx, hy, u, label, onDown }: { x: number; y: number; hx: number; hy: number; u: number; label: string; onDown: (e: ReactPointerEvent) => void }) {
  return (
    <>
      <line x1={x} y1={y} x2={hx} y2={hy} className="cmHandleLine" />
      <circle cx={hx} cy={hy} r={3.5 * u} role="button" tabIndex={-1} aria-label={label} className="cmHandle" onPointerDown={onDown} />
    </>
  )
}
