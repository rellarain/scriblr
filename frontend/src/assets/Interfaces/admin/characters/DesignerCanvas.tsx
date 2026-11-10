import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { NO_COLOURING, type Colouring } from './engine/colour'
import { addPoint, deletePoint, moveHandle, movePoint, moveShape, nudgePoint } from './engine/edit'
import { FRAME_HANDLES, movedBox, resizedBox, type FrameHandle } from './engine/frames'
import { apply, boxOf, build, flatten, inverse, nearestEdge, type Box } from './engine/geometry'
import { gridStep, isMajor, snapTo } from './engine/gridSnap'
import { paintDefs, paintShapes } from './engine/paint'
import type { Solved } from './engine/rig'
import { PaintDefs, PaintedPath, useSvgPrefix } from './PaintedPath'
import { activeShape, shapesOf, type EditMode, type Selection } from './designerState'

// The designer's canvas: the solved model's shapes in an SVG (every group where its pivots, anchors and the test sliders put it), with the selected shape's
// points, curve handles and mirror line, and the selected group's pivot. Left button: select a shape, drag a point or a handle (point editor) or the whole
// shape (move shape), or the pivot. Right button: a click on the grid unselects everything, a click on a shape moves through point editor, move shape,
// unselected; a drag pans. Arrow keys move the selected point (Shift: bigger steps), Delete removes it. A shape is edited through its group's matrix, so it
// can be edited with the groups turned; `editable` is false when a slider changes the shape's own points (what is drawn is then not what is stored).
// Nothing here changes the content itself: it reports gestures, and the page applies them (and keeps the undo stack).

export const FIGURE: Box = { x: 0, y: 0, w: 200, h: 400 }
// The canvas takes the shape of its tile, so the view is as wide as it is tall in pixels (8 by 7 where the browser cannot say: tests, a canvas not yet drawn).
const ASPECT = 8 / 7
const FALLBACK = { w: 704, h: 616 }   // the canvas's pixel size when the browser cannot say (tests)
// Holding a drag at an edge or a corner of the canvas pans the view that way: the pointer must be within EDGE pixels of the edge (or past it) for EDGE_HOLD milliseconds, then
// the view moves at up to EDGE_SPEED pixels a second, faster the nearer the edge. Anywhere else a drag leaves the view still.
const EDGE = 28
const EDGE_HOLD = 280
const EDGE_SPEED = 420

export interface PivotMarker {
  groupId: string
  name: string
  // Where it is drawn (canvas space).
  x: number
  y: number
  // Whether dragging or nudging it does anything (not when a slider is away from rest). For an anchored group it moves the anchor.
  draggable: boolean
}

// Pose mode: the figure is grabbed instead of edited. The page decides what a grab does (turn a group, scale one, slide an anchor, reach with a limb) and
// answers whether a drag began; the canvas only passes the pointer on, and draws the markers it is given (in canvas space).
export type PoseGrab = { kind: 'part'; shapeId: string } | { kind: 'scale'; groupId: string } | { kind: 'slide'; groupId: string } | { kind: 'grip'; gripId: string }
// A grip point of a hand (phase 5c), where a held item is taken: its place and the end of the short line showing the way the item points (canvas space). In Pose mode
// it is grabbed: dragging it reaches with the arm.
export interface GripMark { id: string; name: string; x: number; y: number; tx: number; ty: number; active: boolean }
export interface PoseMark { id: string; name: string; x: number; y: number }
export interface PoseCanvas {
  joints: Array<PoseMark & { active: boolean }>
  scales: PoseMark[]
  slides: PoseMark[]
  onDown: (grab: PoseGrab, world: [number, number], alt: boolean) => boolean
  onMove: (world: [number, number]) => void
  onUp: () => void
  onCancel: () => void
}

// Frames (phase 5a): every frame of the model as a rectangle in the view (the one being edited has handles, and is moved and resized by dragging; the arrow keys
// nudge it, Shift with them resizes it, Alt makes the step five). The boxes are in canvas space, as seen from the view being edited.
export interface FrameMark { id: string; name: string; box: Box; on: boolean }
export interface FrameCanvas {
  frames: FrameMark[]
  // A drag is about to change a frame: remember it for undo once.
  onGesture: () => void
  onBox: (id: string, box: Box) => void
  onSelect: (id: string) => void
  onNudge: (id: string, dx: number, dy: number, resize: boolean) => void
}
// Looking through a frame: the picture is cropped to the box, on the card colour.
// The Weights tool: a click on a point of the selected shape steps its weight (how free it is to hang), and the arrow keys step it too.
export interface WeightTool { onCycle: (i: number) => void; onStep: (i: number, dir: -1 | 1) => void }
export interface ThroughFrame { box: Box; tile: string; name: string }
// Picking the pivot of a group by clicking its marker (the end of a bone).
export interface PickGroup { id: string; name: string; x: number; y: number }

export interface CanvasProps {
  content: ModelContent
  solved: Solved
  sel: Selection
  mode: EditMode
  selPoint: number
  mirror: boolean
  snap: boolean
  grid: boolean
  // Shapes (moved whole), pivots and frames land on the lines of the grid while they are dragged.
  gridSnap?: boolean
  zoom: number
  // The line the model mirrors about.
  axis: number
  // Fit everything that is drawn, with little blank space (true), or the selection (false).
  fitAll: boolean
  // The view is fitted when the selection (or the view being looked at, front or back) changes, or when this changes (the page bumps it when Fit is pressed): never because a
  // drag changed the shape, so the grid stays still while something is dragged.
  viewKey?: string
  viewNonce?: number
  // The view was moved by the canvas itself (panned with the right button, or by holding a drag at an edge).
  onViewMoved?: () => void
  // False while the selected shape's points are changed by a slider, or the shape is a derived twin: it is shown, not edited.
  editable?: boolean
  pivot?: PivotMarker | null
  anchor?: [number, number] | null
  // Pose mode (see above): null or missing is the ordinary editor.
  pose?: PoseCanvas | null
  // The grip points to show (missing: none are drawn).
  grips?: GripMark[]
  // The colours of the test character: what each shape is filled with (missing: every shape in the neutral gray).
  colouring?: Colouring
  // Draw, dashed behind each shape of a class member that has an outline of its own, the outline of the pattern it would otherwise follow.
  ghost?: boolean
  // The points of the selected shape that are linked to another shape: they are not dragged (the arrow keys adjust the link instead).
  linked?: number[]
  onNudgeLink?: (dx: number, dy: number) => void
  // Clicking one of these shapes picks an anchor (or what to link a point to) instead of selecting it; the groups are markers to click for a bone's end.
  pick?: { shapes: string[]; groups?: PickGroup[] } | null
  onPick?: (shapeId: string, x: number, y: number) => void
  onPickGroup?: (groupId: string) => void
  frames?: FrameCanvas | null
  through?: ThroughFrame | null
  weights?: WeightTool | null
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
  | { kind: 'move'; shapeId: string; last: [number, number]; start: [number, number]; from: ModelShape; box: Box | null }
  | { kind: 'pivot' }
  | { kind: 'pose' }
  | { kind: 'frame'; id: string; handle: FrameHandle | 'move'; start: [number, number]; box: Box }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number; target: { kind: 'grid' } | { kind: 'shape'; id: string }; moved: boolean }

export function DesignerCanvas(p: CanvasProps) {
  const { content, solved, sel, mode, selPoint, mirror, snap, grid, zoom, fitAll, axis, pivot, anchor } = p
  // what every shape is painted with (colour, gradient, clip, cut-outs, blend), found once per drawing and shared by the shapes and their definitions
  const prefix = useSvgPrefix()
  const paintItems = useMemo(() => paintShapes(content, solved, p.colouring ?? NO_COLOURING), [content, solved, p.colouring])
  const defs = useMemo(() => paintDefs(paintItems, prefix), [paintItems, prefix])
  const editable = p.editable !== false
  const svgRef = useRef<SVGSVGElement>(null)
  const [aspect, setAspect] = useState(ASPECT)
  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const a = r.width > 0 && r.height > 0 ? Math.min(6, Math.max(1 / 6, r.width / r.height)) : ASPECT
      setAspect(prev => (Math.abs(prev - a) < 0.002 ? prev : a))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const dragRef = useRef<Drag | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const focus = shapesOf(content, sel)
  const focusIds = new Set(focus.map(s => s.id))
  const none = sel.kind === 'none'
  const through = p.through ?? null
  const throughOn = !!through
  // The box the view is fitted to is found when Fit is pressed, the view (front or back) or Pose mode changes, or a selection is made that cannot be seen in the view, and then
  // held: the view never follows what a drag does to the selection. A selection that is in view leaves the view where it is (however it was made: a click, a right-click
  // that moves on through the modes, the tree), and so does selecting nothing. Fit takes the box round everything that is drawn; a selection (or Pose mode) gets room round
  // it for its handles.
  const forceKey = `${fitAll ? 'all' : 'sel'}|${p.pose ? 1 : 0}|${p.viewKey ?? ''}|${p.viewNonce ?? 0}`
  const selKey = fitAll ? '' : `${sel.kind}:${sel.id}`
  const live: Box | null = fitAll ? boxOfSolved(solved, content.shapes) : none || p.pose ? FIGURE : boxOfSolved(solved, focus)
  const vbRef = useRef<Box | null>(null)   // the view as it was last drawn
  const fitted = useRef<{ force: string; sel: string; box: Box; found: boolean; stamp: number } | null>(null)
  if (!through) {
    const cur = fitted.current
    const fresh = () => { fitted.current = { force: forceKey, sel: selKey, box: live ?? FIGURE, found: live !== null, stamp: (cur?.stamp ?? 0) + 1 } }
    if (!cur || cur.force !== forceKey || (!cur.found && live)) fresh()
    else if (cur.sel !== selKey) {
      const seen = vbRef.current
      if (!none && live && seen && !within(live, seen)) fresh()
      else fitted.current = { ...cur, sel: selKey }
    }
  }
  const fitStamp = fitted.current?.stamp ?? 0
  const box: Box = through ? through.box : fitted.current?.box ?? FIGURE
  const tight = fitAll && !through
  let w = Math.max(box.w * (through ? 1.12 : tight ? 1.04 : 1.7) + (tight ? 6 : 0), 24), h = Math.max(box.h * (through ? 1.12 : tight ? 1.04 : 1.7) + (tight ? 6 : 0), 21)
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  w /= zoom; h /= zoom
  const vb = { x: box.x + box.w / 2 + pan.x - w / 2, y: box.y + box.h / 2 + pan.y - h / 2, w, h }
  vbRef.current = vb
  const u = vb.w / 640   // one screen pixel in model units, roughly
  const unit = gridStep(vb.w)   // the distance between two lines of the grid
  const onGrid = p.gridSnap === true

  const shape = activeShape(content, sel)
  const solvedShape = shape ? solved.shapes[shape.id] : undefined
  const matrix = solvedShape?.matrix
  const overlay = !!shape && !p.pose && !through && !!solvedShape?.visible && shape.pts.length >= 3
  const shapesById = new Map(content.shapes.map(s => [s.id, s]))
  const picking = new Set(p.pick?.shapes ?? [])
  const linkedSet = new Set(p.linked ?? [])

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
  const options = { mirror, snap, axis }

  // A new fit starts from the middle of the view (a pan belongs to the fit it was made in).
  useLayoutEffect(() => { setPan(q => (q.x === 0 && q.y === 0 ? q : { x: 0, y: 0 })) }, [fitStamp, throughOn])

  // Holding a drag at an edge or a corner pans the view (see EDGE). The thing being dragged follows the view: after the view moves, the held pointer is handed to onMove again.
  const lastPointer = useRef<{ clientX: number; clientY: number } | null>(null)
  const edgeSince = useRef<number | null>(null)
  const follow = useRef(false)
  const frame = useRef(0)
  const moved = useRef(p.onViewMoved)
  moved.current = p.onViewMoved
  const moveRef = useRef(onMove)
  moveRef.current = onMove
  function stopWatch() {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    lastPointer.current = null
    edgeSince.current = null
  }
  function watchEdges() {
    if (frame.current) cancelAnimationFrame(frame.current)
    let before = performance.now()
    // How far into the edge zone a position is: 0 outside it, up to 1 (at the edge or past it), negative on the near side.
    const depth = (pos: number, size: number): number => (pos < EDGE ? -Math.min(1, (EDGE - pos) / EDGE) : pos > size - EDGE ? Math.min(1, (pos - (size - EDGE)) / EDGE) : 0)
    const tick = (now: number) => {
      const d = dragRef.current, at = lastPointer.current
      if (!d || d.kind === 'pan') { frame.current = 0; return }
      const dt = Math.min(0.05, (now - before) / 1000)
      before = now
      if (at) {
        const r = rect(), ax = depth(at.clientX - r.left, r.w), ay = depth(at.clientY - r.top, r.h)
        if (ax === 0 && ay === 0) edgeSince.current = null
        else {
          if (edgeSince.current === null) edgeSince.current = now
          if (now - edgeSince.current >= EDGE_HOLD) {
            const v = vbRef.current ?? vb
            follow.current = true
            setPan(q => ({ x: q.x + ax * EDGE_SPEED * dt * (v.w / r.w), y: q.y + ay * EDGE_SPEED * dt * (v.h / r.h) }))
            moved.current?.()
          }
        }
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }
  useEffect(() => {
    if (!follow.current) return
    follow.current = false
    const d = dragRef.current, at = lastPointer.current
    if (d && d.kind !== 'pan' && at) moveRef.current(at)
  }, [pan])
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current) }, [])

  // Every drag starts by capturing the pointer (after `dragRef` is set); a drag that is not a pan then watches the edges.
  const capture = (e: ReactPointerEvent) => {
    try { svgRef.current?.setPointerCapture(e.pointerId) } catch { /* not every environment has it */ }
    lastPointer.current = { clientX: e.clientX, clientY: e.clientY }
    edgeSince.current = null
    if (dragRef.current && dragRef.current.kind !== 'pan') watchEdges()
  }

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
    if (p.pose) { if (p.pose.onDown({ kind: 'part', shapeId: id }, toWorld(e), e.altKey)) { dragRef.current = { kind: 'pose' }; capture(e) } return }
    if (p.pick) {
      if (picking.has(id)) { const [x, y] = toWorld(e); p.onPick?.(id, x, y) }
      return
    }
    const already = sel.kind === 'shape' && sel.id === id
    if (!already) p.onSelect({ kind: 'shape', id })
    if (mode === 'move' && already && editable) {
      p.onGesture()
      const from = shapesById.get(id)
      const at = toLocal(e)
      dragRef.current = { kind: 'move', shapeId: id, last: at, start: at, from: from ?? shape!, box: from && from.pts.length >= 3 ? boxOf(flatten(build(from.pts, from.closed), from.closed)) : null }
      capture(e)
    }
  }
  function onPointDown(e: ReactPointerEvent, i: number) {
    e.stopPropagation()
    if (!shape || e.button !== 0) return
    p.onSelectPoint(i)
    if (p.weights && editable) { p.weights.onCycle(i); return }
    if (!editable || linkedSet.has(i)) return
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
  function onPoseHandleDown(e: ReactPointerEvent, grab: PoseGrab) {
    e.stopPropagation()
    if (e.button !== 0 || !p.pose) return
    if (p.pose.onDown(grab, toWorld(e), false)) { dragRef.current = { kind: 'pose' }; capture(e) }
  }
  function onGripDown(e: ReactPointerEvent, grab: PoseGrab) {
    if (!p.pose) return
    onPoseHandleDown(e, grab)
  }
  function onFrameDown(e: ReactPointerEvent, f: FrameMark, handle: FrameHandle | 'move') {
    e.stopPropagation()
    if (e.button !== 0 || !p.frames) return
    if (!f.on) { p.frames.onSelect(f.id); return }
    p.frames.onGesture()
    dragRef.current = { kind: 'frame', id: f.id, handle, start: toWorld(e), box: f.box }
    capture(e)
  }
  function onFrameKey(e: KeyboardEvent, f: FrameMark) {
    const step = e.altKey ? 5 : 1
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); p.frames?.onSelect(f.id); return }
    if (!d[e.key] || !f.on) return
    e.preventDefault()
    e.stopPropagation()
    p.frames?.onNudge(f.id, d[e.key][0], d[e.key][1], e.shiftKey)
  }
  function onMove(e: { clientX: number; clientY: number }) {
    const d = dragRef.current
    if (!d) return
    lastPointer.current = { clientX: e.clientX, clientY: e.clientY }
    if (d.kind === 'pose') { p.pose?.onMove(toWorld(e)); return }
    if (d.kind === 'frame') {
      const [wx, wy] = toWorld(e)
      let dx = wx - d.start[0], dy = wy - d.start[1]
      if (onGrid) {
        // the side or corner being dragged lands on a line (a frame that is moved lands with its top left corner on one)
        const b = d.box
        if (d.handle === 'move') { dx = snapTo(b.x + dx, unit) - b.x; dy = snapTo(b.y + dy, unit) - b.y }
        else {
          if (d.handle.includes('w')) dx = snapTo(b.x + dx, unit) - b.x
          else if (d.handle.includes('e')) dx = snapTo(b.x + b.w + dx, unit) - (b.x + b.w)
          if (d.handle.includes('n')) dy = snapTo(b.y + dy, unit) - b.y
          else if (d.handle.includes('s')) dy = snapTo(b.y + b.h + dy, unit) - (b.y + b.h)
        }
      }
      p.frames?.onBox(d.id, d.handle === 'move' ? movedBox(d.box, dx, dy) : resizedBox(d.box, d.handle, dx, dy))
      return
    }
    if (d.kind === 'pan') {
      const r = rect(), dx = e.clientX - d.startX, dy = e.clientY - d.startY
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (d.moved) { setPan({ x: d.panX - (dx / r.w) * vb.w, y: d.panY - (dy / r.h) * vb.h }); p.onViewMoved?.() }
      return
    }
    if (d.kind === 'pivot') { const [wx, wy] = toWorld(e); p.onPivot?.(onGrid ? snapTo(wx, unit) : wx, onGrid ? snapTo(wy, unit) : wy); return }
    const s = shapesById.get(d.shapeId)
    if (!s) return
    const [x, y] = toLocal(e)
    if (d.kind === 'point') p.onShape(s.id, movePoint(s, d.index, x, y, options))
    else if (d.kind === 'handle') p.onShape(s.id, moveHandle(s, d.index, d.which, x, y, options))
    else if (onGrid && d.box) {
      // the shape's top left corner lands on a line, whatever the pointer has done on the way
      const dx = snapTo(d.box.x + (x - d.start[0]), unit) - d.box.x, dy = snapTo(d.box.y + (y - d.start[1]), unit) - d.box.y
      p.onShape(s.id, moveShape(d.from, dx, dy))
    } else {
      p.onShape(s.id, moveShape(s, x - d.last[0], y - d.last[1]))
      d.last = [x, y]
    }
  }
  function onUp() {
    const d = dragRef.current
    dragRef.current = null
    stopWatch()
    if (d && d.kind === 'pose') p.pose?.onUp()
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
    if (e.key === 'Escape') {
      if (dragRef.current?.kind === 'pose') { dragRef.current = null; p.pose?.onCancel() }
      else p.onEscape()
      return
    }
    if (!shape || !editable) return
    if (p.weights) {
      const up = e.key === 'ArrowUp' || e.key === 'ArrowRight', down = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
      if (up || down) { e.preventDefault(); p.weights.onStep(selPoint, up ? 1 : -1) }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.weights.onCycle(selPoint) }
      return
    }
    const step = e.shiftKey ? 5 : 0.5
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (d[e.key] && mode === 'points' && linkedSet.has(selPoint)) {
      e.preventDefault()
      p.onNudgeLink?.(d[e.key][0], d[e.key][1])
    } else if (d[e.key]) {
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

  // The grid is a faint line every 2 units (1, then 0.5 as the view closes in; wider apart when it is zoomed far out) and a stronger one every 10 (see engine/gridSnap.ts).
  const gridLines: ReactElement[] = []
  if (grid) {
    for (let k = Math.ceil(vb.x / unit); k * unit < vb.x + vb.w; k++) gridLines.push(<line key={`v${k}`} x1={k * unit} y1={vb.y} x2={k * unit} y2={vb.y + vb.h} className={isMajor(k * unit, unit) ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
    for (let k = Math.ceil(vb.y / unit); k * unit < vb.y + vb.h; k++) gridLines.push(<line key={`h${k}`} x1={vb.x} y1={k * unit} x2={vb.x + vb.w} y2={k * unit} className={isMajor(k * unit, unit) ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
  }

  const built = overlay && matrix ? build(shape!.pts, shape!.closed, matrix) : []
  const cur = built[selPoint]
  const nudgeHint = !editable ? 'This shape is shown, not edited' : p.weights ? 'Click a point or press Enter to change its weight; the arrow keys step it' : mode === 'move' ? 'Arrow keys move the shape' : 'Arrow keys move the point; Delete removes it'

  return (
    <svg
      ref={svgRef} className={`cmCanvas${p.pick ? ' cmCanvas--pick' : ''}${p.pose ? ' cmCanvas--pose' : ''}`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="application" tabIndex={0}
      aria-label={`Designer canvas. ${nudgeHint}. Right-click the grid to see the end result.`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={e => e.preventDefault()} onKeyDown={onKey}
    >
      <rect x={vb.x - 1} y={vb.y - 1} width={vb.w + 2} height={vb.h + 2} className="cmCanvasBg" />
      {gridLines}
      <line x1={axis} y1={vb.y} x2={axis} y2={vb.y + vb.h} className={`cmMirrorLine${mirror ? ' cmMirrorLine--on' : ''}`} />
      {p.ghost && solved.order.map(id => {
        const r = solved.shapes[id]
        return r?.ghost && r.visible ? <path key={`ghost-${id}`} d={r.ghost} data-ghost={id} className="cmGhost" aria-hidden="true" /> : null
      })}
      <PaintDefs defs={defs} />
      {through && (
        <>
          <defs><clipPath id={`${prefix}-through`}><rect x={through.box.x} y={through.box.y} width={through.box.w} height={through.box.h} /></clipPath></defs>
          <rect x={through.box.x} y={through.box.y} width={through.box.w} height={through.box.h} className="cmFrameTile" style={{ '--tile': through.tile } as CSSProperties} data-tile="" aria-hidden="true" />
        </>
      )}
      <g clipPath={through ? `url(#${prefix}-through)` : undefined}>
      {paintItems.map(item => {
        const id = item.id, s = shapesById.get(id)
        if (!s) return null
        const pickable = picking.has(id), selected = sel.kind === 'shape' && sel.id === id
        return (
          <g key={id}>
            <PaintedPath
              item={item} prefix={prefix} data-shape={id}
              className={`cmShape${focusIds.has(id) ? ' cmShape--on' : ''}${!none && focusIds.size > 0 && !focusIds.has(id) ? ' cmShape--dim' : ''}${selected ? ' cmShape--sel' : ''}${pickable ? ' cmShape--pick' : ''}${p.pick && !pickable ? ' cmShape--off' : ''}${s.mirrorOf ? ' cmShape--twin' : ''}${item.helper ? ' cmShape--helper' : ''}`}
              onPointerDown={e => onShapeDown(e, id)} onDoubleClick={e => onDouble(e, s)}
            />
            {selected && <path d={item.d} className="cmRing cmRing--under" aria-hidden="true" />}
            {selected && <path d={item.d} className="cmRing cmRing--over" data-ring={id} aria-hidden="true" />}
          </g>
        )
      })}
      </g>
      {p.pick?.groups?.map(g => (
        <g key={g.id} className="cmPickGroup" role="button" tabIndex={0} aria-label={`Pick the pivot of ${g.name}`} onPointerDown={e => { e.stopPropagation(); if (e.button === 0) p.onPickGroup?.(g.id) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onPickGroup?.(g.id) } }}>
          <circle cx={g.x} cy={g.y} r={9 * u} className="cmPickGroupHit" />
          <circle cx={g.x} cy={g.y} r={4.5 * u} className="cmPickGroupDot" />
        </g>
      ))}
      {p.frames && !through && p.frames.frames.map(f => {
        const label = `Frame ${f.name || 'Frame'}`
        const hs = 4 * u
        const at = (h: FrameHandle): [number, number] => [f.box.x + (h.includes('w') ? 0 : h.includes('e') ? f.box.w : f.box.w / 2), f.box.y + (h.includes('n') ? 0 : h.includes('s') ? f.box.h : f.box.h / 2)]
        return (
          <g key={f.id} className={`cmFrame${f.on ? ' cmFrame--on' : ''}`}>
            <rect x={f.box.x} y={f.box.y} width={f.box.w} height={f.box.h} className="cmFrameRect" aria-hidden="true" />
            <text x={f.box.x + 2 * u} y={f.box.y - 3 * u} className="cmFrameName" aria-hidden="true" style={{ fontSize: 10 * u }}>{f.name || 'Frame'}</text>
            <rect
              x={f.box.x} y={f.box.y} width={f.box.w} height={f.box.h} className="cmFrameHit" style={{ strokeWidth: 12 * u }} role="button" tabIndex={0} aria-pressed={f.on}
              aria-label={f.on ? `${label}. Drag it to move it, or press the arrow keys; with Shift they resize it, with Alt they step by five` : `${label}. Press Enter to edit it`}
              onPointerDown={e => onFrameDown(e, f, 'move')} onKeyDown={e => onFrameKey(e, f)}
            />
            {f.on && FRAME_HANDLES.map(h => {
              const [cx, cy] = at(h)
              return <rect key={h} x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2} className="cmFrameHandle" role="button" tabIndex={-1} aria-label={`Resize ${f.name || 'the frame'} from its ${h}`} onPointerDown={e => onFrameDown(e, f, h)} />
            })}
          </g>
        )
      })}
      {overlay && mode === 'points' && cur && (
        <g className="cmHandles">
          {(cur.m === 'c' || cur.m === 'cs') && <HandleDot x={cur.x} y={cur.y} hx={cur.hix} hy={cur.hiy} u={u} label="Incoming curve handle" onDown={e => onHandleDown(e, 'hi')} />}
          {(cur.m === 'c' || cur.m === 'sc') && <HandleDot x={cur.x} y={cur.y} hx={cur.hox} hy={cur.hoy} u={u} label="Outgoing curve handle" onDown={e => onHandleDown(e, 'ho')} />}
        </g>
      )}
      {overlay && mode === 'points' && built.map((b, i) => {
        const w = Math.min(1, Math.max(0, shape!.pts[i].w ?? 0))
        return w > 0 ? <circle key={`w${i}`} cx={b.x} cy={b.y} r={(6 + w * 6) * u} data-weight={w} className="cmWeightRing" style={{ opacity: 0.35 + 0.65 * w }} aria-hidden="true" /> : null
      })}
      {overlay && mode === 'points' && built.map((b, i) => {
        const w = Math.min(1, Math.max(0, shape!.pts[i].w ?? 0))
        return (
          <circle
            key={i} cx={b.x} cy={b.y} r={(i === selPoint ? 5.5 : 4) * u} role="button" tabIndex={-1} aria-pressed={i === selPoint}
            aria-label={`Point ${i + 1}${linkedSet.has(i) ? ', linked' : ''}${w > 0 ? `, weight ${Math.round(w * 100)}%` : p.weights ? ', no weight' : ''}`}
            className={`cmPoint${i === selPoint ? ' cmPoint--sel' : ''}${shape!.pts[i].m === 's' ? ' cmPoint--sharp' : ''}${editable ? '' : ' cmPoint--off'}${linkedSet.has(i) ? ' cmPoint--linked' : ''}${w > 0 ? ' cmPoint--weighted' : ''}${p.weights ? ' cmPoint--weigh' : ''}`}
            onPointerDown={e => onPointDown(e, i)}
          />
        )
      })}
      {p.pose && p.pose.joints.map(j => (
        <g key={j.id} className={`cmJoint${j.active ? ' cmJoint--on' : ''}`} aria-hidden="true">
          <circle cx={j.x} cy={j.y} r={5 * u} className="cmJointRing" />
          <circle cx={j.x} cy={j.y} r={1.5 * u} className="cmJointDot" />
        </g>
      ))}
      {p.pose && p.pose.slides.map(m => (
        <circle key={m.id} cx={m.x} cy={m.y} r={6 * u} role="button" tabIndex={-1} aria-label={`Slide ${m.name}`} className="cmSlideHandle" onPointerDown={e => onPoseHandleDown(e, { kind: 'slide', groupId: m.id })} />
      ))}
      {p.pose && p.pose.scales.map(m => (
        <rect key={m.id} x={m.x - 4.5 * u} y={m.y - 4.5 * u} width={9 * u} height={9 * u} role="button" tabIndex={-1} aria-label={`Scale ${m.name}`} className="cmScaleHandle" onPointerDown={e => onPoseHandleDown(e, { kind: 'scale', groupId: m.id })} />
      ))}
      {p.grips && !through && p.grips.map(g => (
        <g
          key={g.id} className={`cmGrip${g.active ? ' cmGrip--on' : ''}${p.pose ? ' cmGrip--live' : ''}`} data-grip={g.id}
          {...(p.pose ? { role: 'button', tabIndex: -1, 'aria-label': `Reach with ${g.name.trim() || 'the grip point'}`, onPointerDown: (e: ReactPointerEvent) => onGripDown(e, { kind: 'grip', gripId: g.id }) } : { 'aria-hidden': true })}
        >
          <circle cx={g.x} cy={g.y} r={8 * u} className="cmGripHit" />
          <line x1={g.x} y1={g.y} x2={g.tx} y2={g.ty} className="cmGripLine" />
          <circle cx={g.x} cy={g.y} r={3.5 * u} className="cmGripDot" />
        </g>
      ))}
      {anchor && !p.pose && !through && <rect x={anchor[0] - 3.5 * u} y={anchor[1] - 3.5 * u} width={7 * u} height={7 * u} transform={`rotate(45 ${anchor[0]} ${anchor[1]})`} className="cmAnchor" aria-hidden="true" />}
      {pivot && !p.pose && !through && (
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

// Whether a box lies wholly inside another.
const within = (inner: Box, outer: Box): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

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
