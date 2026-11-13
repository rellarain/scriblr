import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { NO_COLOURING, type Colouring } from './engine/colour'
import { crossingNear, crossingsOf, type Crossing, type LockStage } from './engine/crossings'
import { addPoint, cycleMode, deletePoint, moveHandle, movePoint, moveShape, nudgePoint } from './engine/edit'
import { FRAME_HANDLES, movedBox, resizedBox, type FrameHandle } from './engine/frames'
import { apply, boxOf, build, flatten, inverse, nearestEdge, type Box } from './engine/geometry'
import { gridStep, isMajor, snapTo } from './engine/gridSnap'
import { alignTo, guideTargets, headGuide, type GuideTargets } from './engine/guides'
import { paintDefs, paintShapes } from './engine/paint'
import type { Solved } from './engine/rig'
import { PaintDefs, PaintedPath, useSvgPrefix } from './PaintedPath'
import { NONE, activeShape, shapesOf, type EditMode, type Selection } from './designerState'
import type { LayerId } from './layerStack'

// The designer's canvas: the solved model's shapes in an SVG (every group where its pivots, anchors and the test sliders put it), with the selected shape's
// points, curve handles and mirror line, and the selected group's pivot. It fills the whole console, and the toolbars lie over its edges (`insets`).
// Left button: a click on the empty grid unselects everything, a click on a shape selects it, a click on a point steps its handles (none, both, the incoming
// one, the outgoing one), a click on the large handle that follows the pointer along an outline adds a point there, a click on a crossing of two outlines steps
// a lock (onto the edge, welded, free); a drag moves a point or a handle (point editor), the whole shape (move shape), or the pivot. Right button: a click on the
// grid unselects everything, a click on a shape moves through point editor, move shape, unselected; a drag pans. Arrow keys move the selected point (Shift:
// bigger steps), Delete removes it. A shape is edited through its group's matrix, so it can be edited with the groups turned; `editable` is false when a slider
// changes the shape's own points (what is drawn is then not what is stored).
// The picture is drawn in `layers`, bottom first (the view toolbar's toggles, the leftmost on top); what only appears while the pointer is over an outline, a point
// or a crossing is drawn over all of them. Nothing here changes the content itself: it reports gestures, and the page applies them (and keeps the undo stack).

export const FIGURE: Box = { x: 0, y: 0, w: 200, h: 400 }
const FALLBACK = { w: 704, h: 616 }   // the canvas's pixel size when the browser cannot say (tests, a canvas not yet drawn)
// Holding a drag at an edge or a corner of the canvas pans the view that way: the pointer must be within EDGE pixels of the edge (or past it) for EDGE_HOLD milliseconds, then
// the view moves at up to EDGE_SPEED pixels a second, faster the nearer the edge. Anywhere else a drag leaves the view still.
const EDGE = 28
const EDGE_HOLD = 280
const EDGE_SPEED = 420
// How near, in pixels, the pointer has to be to an outline, a point or a crossing to reveal it; how far a press may move and still be a click; how near a dragged thing has to be to a line to show it.
const REACH_EDGE = 6
const REACH_POINT = 7
const REACH_CROSS = 9
const CLICK_SLOP = 3
const REACH_GUIDE = 3

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
// The Skin tool (phase O1): how much each point of the selected shape follows the chosen group. A click on a point steps its weight a tenth (Shift: down), a drag paints the points
// within `radius` of the pointer to the tool's strength, the arrow keys step the selected point. It works on a shape that is posed (shown, not edited).
export interface SkinTool { weights: number[]; radius: number; onStep: (i: number, dir: -1 | 1) => void; onPaint: (points: number[]) => void }
// Picking the pivot of a group by clicking its marker (the end of a bone).
export interface PickGroup { id: string; name: string; x: number; y: number }
// The lock at a crossing of two outlines. `enabled` is false when none can be made (a slider is away from rest, the back view, a form is being edited); `stageOf` says how
// far the lock at a crossing has got; `onAdvance` is a click on it.
export interface LockTool { enabled: boolean; stageOf: (c: Crossing) => LockStage; onAdvance: (c: Crossing) => void }
// The taper tool (phase O3): clicks lay the line a ribbon runs along (canvas space), Enter or a double-click makes it; the ribbon is shown as it will be while the line is laid.
export interface TaperCanvas {
  spine: Array<[number, number]>
  // the ribbon's outline as path text, once the line has two points
  preview: string | null
  onAdd: (x: number, y: number) => void
  onFinish: () => void
  // take back the last point (Backspace)
  onBack: () => void
}
// How much of each edge of the canvas a toolbar covers, in pixels: the view is fitted and centred in what is left.
export interface Insets { left: number; right: number; bottom: number; top?: number }
const NO_INSETS: Insets = { left: 0, right: 0, bottom: 0, top: 0 }

export interface CanvasProps {
  content: ModelContent
  solved: Solved
  sel: Selection
  mode: EditMode
  selPoint: number
  mirror: boolean
  snap: boolean
  // The layers to draw, bottom first (see layerStack.ts).
  layers: LayerId[]
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
  // The toolbars over the edges of the canvas.
  insets?: Insets
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
  skin?: SkinTool | null
  taper?: TaperCanvas | null
  lock?: LockTool | null
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
  // Something the canvas could not do, in words (a shape at its most points).
  onNote?: (note: string) => void
  onRightClick: (target: { kind: 'grid' } | { kind: 'shape'; id: string }) => void
  // Which mode the caller's keys set (the canvas itself only reports).
  onEscape: () => void
}

type Drag =
  | { kind: 'point'; shapeId: string; index: number; x0: number; y0: number; moved: boolean }
  | { kind: 'handle'; shapeId: string; index: number; which: 'hi' | 'ho' }
  | { kind: 'move'; shapeId: string; last: [number, number]; start: [number, number]; from: ModelShape; box: Box | null; world0: [number, number]; box0: Box | null }
  | { kind: 'pivot' }
  | { kind: 'pose' }
  | { kind: 'frame'; id: string; handle: FrameHandle | 'move'; start: [number, number]; box: Box }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number; target: { kind: 'grid' } | { kind: 'shape'; id: string }; moved: boolean }
  | { kind: 'paint'; point: number; down: boolean; x0: number; y0: number; moved: boolean }

// What the pointer is over while nothing is dragged: a point of the selected shape, a crossing of its outline with another, or an outline (x, y: where the large handle sits).
type Hover =
  | { kind: 'point'; i: number }
  | { kind: 'cross'; crossing: Crossing }
  | { kind: 'edge'; shapeId: string; x: number; y: number }

export function DesignerCanvas(p: CanvasProps) {
  const { content, solved, sel, mode, selPoint, mirror, snap, zoom, fitAll, axis, pivot, anchor } = p
  const shown = new Set<LayerId>(p.layers)
  // what every shape is painted with (colour, gradient, clip, cut-outs, blend), found once per drawing and shared by the shapes and their definitions
  const prefix = useSvgPrefix()
  const paintItems = useMemo(() => paintShapes(content, solved, p.colouring ?? NO_COLOURING), [content, solved, p.colouring])
  const defs = useMemo(() => paintDefs(paintItems, prefix), [paintItems, prefix])
  const editable = p.editable !== false
  const svgRef = useRef<SVGSVGElement>(null)
  // the canvas's size in pixels once the browser can say (the view takes the shape of what the toolbars leave uncovered)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (!(r.width > 0 && r.height > 0)) return
      setSize(prev => (prev && Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5 ? prev : { w: r.width, h: r.height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const dragRef = useRef<Drag | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hover, setHover] = useState<Hover | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null } | null>(null)
  // where the Skin tool's brush is (the pointer, in canvas space), while the tool is on
  const [brush, setBrush] = useState<[number, number] | null>(null)
  const targetsRef = useRef<GuideTargets | null>(null)
  const crossRef = useRef<{ solved: Solved; id: string; list: Crossing[] } | null>(null)

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
  // The view is fitted to the part of the canvas no toolbar covers, then widened to the whole canvas about it, so that the pointer maths (the whole svg) stays true.
  const ins = size ? p.insets ?? NO_INSETS : NO_INSETS   // (the toolbars are only known to cover the canvas once the canvas can be measured)
  const W = size?.w ?? FALLBACK.w, H = size?.h ?? FALLBACK.h
  const visW = Math.max(60, W - ins.left - ins.right), visH = Math.max(60, H - ins.bottom - (ins.top ?? 0))
  const aspect = Math.min(6, Math.max(1 / 6, visW / visH))
  let w = Math.max(box.w * (through ? 1.12 : tight ? 1.04 : 1.7) + (tight ? 6 : 0), 24), h = Math.max(box.h * (through ? 1.12 : tight ? 1.04 : 1.7) + (tight ? 6 : 0), 21)
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  w /= zoom; h /= zoom
  const k = w / visW   // model units to a pixel
  const vb = { x: box.x + box.w / 2 + pan.x - w / 2 - ins.left * k, y: box.y + box.h / 2 + pan.y - h / 2 - (ins.top ?? 0) * k, w: W * k, h: H * k }
  vbRef.current = vb
  const u = k   // one screen pixel in model units
  const unit = gridStep(vb.w)   // the distance between two lines of the grid
  const onGrid = p.gridSnap === true

  const shape = activeShape(content, sel)
  const solvedShape = shape ? solved.shapes[shape.id] : undefined
  const matrix = solvedShape?.matrix
  const overlay = !!shape && !p.pose && !through && !!solvedShape?.visible && shape.pts.length >= 3
  const built = overlay && matrix ? build(shape!.pts, shape!.closed, matrix) : []
  const shapesById = new Map(content.shapes.map(s => [s.id, s]))
  const picking = new Set(p.pick?.shapes ?? [])
  const linkedSet = new Set(p.linked ?? [])
  const lockOn = !!p.lock?.enabled && overlay && !p.weights && !p.skin
  const hoverOk = !p.pose && !p.pick && !through && !p.frames && !p.taper

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
  // one screen pixel in canvas units, as the pointer sees it
  const pixel = () => vb.w / rect().w

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

  // ---- alignment guides ----

  // What a drag can line up with is found when it begins (nothing else moves while it lasts), only when the guides are shown.
  function beginGuides(except: string[]) {
    targetsRef.current = shown.has('guides') ? guideTargets(content, solved, except, p.frames?.frames.map(f => f.box) ?? []) : null
  }
  function showGuides(x: number | null, y: number | null) {
    setGuides(prev => (x === null && y === null ? (prev ? null : prev) : prev && prev.x === x && prev.y === y ? prev : { x, y }))
  }
  // The pointer's place, pulled to a line it lines up with when Snap is on; the lines are drawn either way. `own` gives the dragged thing's own lines for a given pointer place.
  function guided(wx: number, wy: number, own?: (wx: number, wy: number) => { xs: number[]; ys: number[] }): [number, number] {
    const t = targetsRef.current
    if (!t) return [wx, wy]
    const hit = alignTo(own ? own(wx, wy) : { xs: [wx], ys: [wy] }, t, REACH_GUIDE * pixel())
    showGuides(hit.x, hit.y)
    return snap ? [wx + hit.dx, wy + hit.dy] : [wx, wy]
  }

  // ---- what the pointer is over ----

  const crossingsFor = (id: string): Crossing[] => {
    const c = crossRef.current
    if (c && c.solved === solved && c.id === id) return c.list
    const list = crossingsOf(content, solved, id)
    crossRef.current = { solved, id, list }
    return list
  }
  // The nearest of: a crossing of the selected shape's outline with another, a point of it, its outline, the outline of another drawn shape.
  function hitTest(e: { clientX: number; clientY: number }): Hover | null {
    if (!hoverOk) return null
    const px = pixel(), [wx, wy] = toWorld(e)
    // a crossing comes first: the point that holds its lock lies on it, and a click there steps the lock
    if (lockOn && shape) {
      const cr = crossingNear(crossingsFor(shape.id), wx, wy, REACH_CROSS * px)
      if (cr) return { kind: 'cross', crossing: cr }
    }
    if (overlay && mode === 'points' && (editable || !!p.skin)) {
      let best = -1, bd = REACH_POINT * px
      built.forEach((b, i) => { const d = Math.hypot(b.x - wx, b.y - wy); if (d <= bd) { bd = d; best = i } })
      if (best >= 0) return { kind: 'point', i: best }
    }
    if (overlay && shape && matrix && mode === 'points') {
      const [lx, ly] = apply(inverse(matrix), wx, wy)
      const hit = nearestEdge(shape.pts, lx, ly)
      if (hit && hit.dist * Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) <= REACH_EDGE * px) {
        const [cx, cy] = apply(matrix, hit.x, hit.y)
        return { kind: 'edge', shapeId: shape.id, x: cx, y: cy }
      }
    }
    for (let i = solved.order.length - 1; i >= 0; i--) {
      const id = solved.order[i], r = solved.shapes[id], s = shapesById.get(id)
      if (!r || !s || !r.visible || r.off || id === shape?.id || r.poly.length < 2) continue
      const reach = REACH_EDGE * px
      if (wx < r.box.x - reach || wx > r.box.x + r.box.w + reach || wy < r.box.y - reach || wy > r.box.y + r.box.h + reach) continue
      const near = nearestOnPolyline(r.poly, s.closed, wx, wy)
      if (near && near.dist <= reach) return { kind: 'edge', shapeId: id, x: near.x, y: near.y }
    }
    return null
  }
  const sameHover = (a: Hover | null, b: Hover | null): boolean => {
    if (a === b) return true
    if (!a || !b || a.kind !== b.kind) return false
    if (a.kind === 'point' && b.kind === 'point') return a.i === b.i
    if (a.kind === 'cross' && b.kind === 'cross') return a.crossing.other === b.crossing.other && Math.hypot(a.crossing.x - b.crossing.x, a.crossing.y - b.crossing.y) < 0.01
    if (a.kind === 'edge' && b.kind === 'edge') return a.shapeId === b.shapeId && Math.hypot(a.x - b.x, a.y - b.y) < 0.5 * pixel()
    return false
  }
  function updateHover(e: { clientX: number; clientY: number }) {
    const next = hitTest(e)
    setHover(prev => (sameHover(prev, next) ? prev : next))
  }
  // A press on what the pointer is over. Returns whether it was used. A press on the body of a shape leaves the outlines of other shapes alone: it selects the shape it is on.
  function hoverDown(e: ReactPointerEvent, onBody = false): boolean {
    if (e.button !== 0 || p.pose || p.pick || p.frames || through) return false
    if (p.skin && shape) {
      const h = hitTest(e)
      beginPaint(e, h?.kind === 'point' ? h.i : -1)
      return true
    }
    const h = hitTest(e)
    if (!h) return false
    if (h.kind === 'cross') { p.lock?.onAdvance(h.crossing); return true }
    if (h.kind === 'point') { beginPoint(e, h.i); return true }
    if (!shape || h.shapeId !== shape.id) {
      if (onBody) return false
      p.onSelect({ kind: 'shape', id: h.shapeId })
      return true
    }
    if (!editable || mode !== 'points' || p.weights || p.skin) return false
    // the large handle on the selected outline: a point is added there, and the press carries on as a drag of it
    const [x, y] = toLocal(e)
    const hit = nearestEdge(shape.pts, x, y)
    if (!hit) return false
    const added = addPoint(shape, hit.e, { mirror, axis })
    if (added.index < 0) { p.onNote?.('A shape may have at most 60 points.'); return true }
    p.onEditShape(shape.id, mirror ? added.shape : movePoint(added.shape, added.index, hit.x, hit.y), added.index)
    dragRef.current = { kind: 'point', shapeId: shape.id, index: added.index, x0: e.clientX, y0: e.clientY, moved: true }
    beginGuides([shape.id])
    capture(e)
    return true
  }

  // ---- pressing ----

  // The taper tool: a click lays the next point of the ribbon's line (on the grid with Snap to grid, on half units with Snap).
  function addTaper(e: { clientX: number; clientY: number }) {
    let [x, y] = toWorld(e)
    if (onGrid) { x = snapTo(x, unit); y = snapTo(y, unit) } else if (snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2 }
    p.taper?.onAdd(x, y)
  }
  function onDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: { kind: 'grid' }, moved: false }
      capture(e)
      return
    }
    if (e.button !== 0) return
    if (p.taper) { addTaper(e); return }
    if (hoverDown(e)) return
    // a click on the empty grid unselects everything (not while a tool is waiting for a click of its own)
    if (!p.pick && !p.pose && !p.frames && !p.weights && !p.skin && !through && sel.kind !== 'none') p.onSelect(NONE)
  }
  function onShapeDown(e: ReactPointerEvent, id: string) {
    e.stopPropagation()
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: { kind: 'shape', id }, moved: false }
      capture(e)
      return
    }
    if (e.button !== 0) return
    if (p.taper) { addTaper(e); return }
    if (p.pose) { if (p.pose.onDown({ kind: 'part', shapeId: id }, toWorld(e), e.altKey)) { dragRef.current = { kind: 'pose' }; capture(e) } return }
    if (p.pick) {
      if (picking.has(id)) { const [x, y] = toWorld(e); p.onPick?.(id, x, y) }
      return
    }
    if (hoverDown(e, true)) return
    const already = sel.kind === 'shape' && sel.id === id
    if (!already) p.onSelect({ kind: 'shape', id })
    if (mode === 'move' && already && editable) {
      p.onGesture()
      const from = shapesById.get(id)
      const at = toLocal(e)
      const r = solved.shapes[id]
      dragRef.current = { kind: 'move', shapeId: id, last: at, start: at, from: from ?? shape!, box: from && from.pts.length >= 3 ? boxOf(flatten(build(from.pts, from.closed), from.closed)) : null, world0: toWorld(e), box0: r ? r.box : null }
      beginGuides([id])
      capture(e)
    }
  }
  // The Skin tool: a press that stays put on a point steps its weight; one that moves paints the points near the pointer.
  function beginPaint(e: ReactPointerEvent, i: number) {
    if (i >= 0) p.onSelectPoint(i)
    dragRef.current = { kind: 'paint', point: i, down: e.shiftKey, x0: e.clientX, y0: e.clientY, moved: false }
    capture(e)
  }
  function paintAt(e: { clientX: number; clientY: number }) {
    if (!p.skin) return
    const [wx, wy] = toWorld(e), reach = Math.max(p.skin.radius, REACH_POINT * pixel())
    const near = built.flatMap((b, i) => (Math.hypot(b.x - wx, b.y - wy) <= reach ? [i] : []))
    if (near.length) p.skin.onPaint(near)
  }
  function beginPoint(e: ReactPointerEvent, i: number) {
    if (!shape) return
    if (p.skin) { beginPaint(e, i); return }
    p.onSelectPoint(i)
    if (p.weights && editable) { p.weights.onCycle(i); return }
    if (!editable || linkedSet.has(i)) return
    dragRef.current = { kind: 'point', shapeId: shape.id, index: i, x0: e.clientX, y0: e.clientY, moved: false }
    beginGuides([shape.id])
    capture(e)
  }
  function onPointDown(e: ReactPointerEvent, i: number) {
    e.stopPropagation()
    if (e.button !== 0) return
    beginPoint(e, i)
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
    beginGuides([])
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

  // ---- moving ----

  function onMove(e: { clientX: number; clientY: number }) {
    const d = dragRef.current
    if (p.skin) { const at = toWorld(e); setBrush(b => (b && Math.abs(b[0] - at[0]) < 1e-6 && Math.abs(b[1] - at[1]) < 1e-6 ? b : at)) }
    if (!d) { updateHover(e); return }
    lastPointer.current = { clientX: e.clientX, clientY: e.clientY }
    if (d.kind === 'paint') {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_SLOP) return
        d.moved = true
        p.onGesture()
        paintAt({ clientX: d.x0, clientY: d.y0 })
      }
      paintAt(e)
      return
    }
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
    if (d.kind === 'pivot') {
      const [wx, wy] = toWorld(e)
      if (onGrid) { p.onPivot?.(snapTo(wx, unit), snapTo(wy, unit)); return }
      const [gx, gy] = guided(wx, wy)
      p.onPivot?.(gx, gy)
      return
    }
    // a press on a point is a click until it has moved a little: then it is a drag, and the undo step begins
    if (d.kind === 'point' && !d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_SLOP) return
      d.moved = true
      p.onGesture()
    }
    const s = shapesById.get(d.shapeId)
    if (!s) return
    let [wx, wy] = toWorld(e)
    if (d.kind === 'point') [wx, wy] = guided(wx, wy)
    else if (d.kind === 'move' && !onGrid && d.box0) {
      const b = d.box0, [sx, sy] = d.world0
      ;[wx, wy] = guided(wx, wy, (px, py) => {
        const x0 = b.x + (px - sx), y0 = b.y + (py - sy)
        return { xs: [x0, x0 + b.w / 2, x0 + b.w], ys: [y0, y0 + b.h / 2, y0 + b.h] }
      })
    }
    const [x, y] = matrix ? apply(inverse(matrix), wx, wy) : [wx, wy]
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
    targetsRef.current = null
    setGuides(null)
    if (d && d.kind === 'pose') p.pose?.onUp()
    if (d && d.kind === 'pan' && !d.moved) p.onRightClick(d.target)
    if (d && d.kind === 'paint' && !d.moved && d.point >= 0) p.skin?.onStep(d.point, d.down ? -1 : 1)
    // a press on a point that did not move is a click: its handles step round
    if (d && d.kind === 'point' && !d.moved && shape && shape.id === d.shapeId && editable && mode === 'points' && !p.weights) {
      p.onEditShape(shape.id, cycleMode(shape, d.index, { mirror, axis }), d.index)
    }
  }
  function onDouble(e: ReactMouseEvent, s: ModelShape) {
    e.stopPropagation()
    if (p.taper) { p.taper.onFinish(); return }
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
    if (p.taper) {
      if (e.key === 'Enter') { e.preventDefault(); p.taper.onFinish() }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); p.taper.onBack() }
      return
    }
    if (shape && p.skin) {
      const up = e.key === 'ArrowUp' || e.key === 'ArrowRight', down = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
      if (up || down) { e.preventDefault(); p.skin.onStep(selPoint, up ? 1 : -1) }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.skin.onStep(selPoint, e.shiftKey ? -1 : 1) }
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

  // ---- the layers ----

  // The grid is a faint line every 2 units (1, then 0.5 as the view closes in; wider apart when it is zoomed far out) and a stronger one every 10 (see engine/gridSnap.ts).
  const gridLines: ReactElement[] = []
  if (shown.has('gridlines')) {
    for (let n = Math.ceil(vb.x / unit); n * unit < vb.x + vb.w; n++) gridLines.push(<line key={`v${n}`} x1={n * unit} y1={vb.y} x2={n * unit} y2={vb.y + vb.h} className={isMajor(n * unit, unit) ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
    for (let n = Math.ceil(vb.y / unit); n * unit < vb.y + vb.h; n++) gridLines.push(<line key={`h${n}`} x1={vb.x} y1={n * unit} x2={vb.x + vb.w} y2={n * unit} className={isMajor(n * unit, unit) ? 'cmGridLine cmGridLine--major' : 'cmGridLine'} />)
  }

  const cur = built[selPoint]
  const nudgeHint = p.taper ? 'Taper: click to lay the line the ribbon runs along, then press Enter or double-click to make it; Backspace takes back a point, Escape starts over' : p.skin ? 'Skin weights: click a point to raise its weight a tenth (Shift: lower it), drag to paint, or press the arrow keys' : !editable ? 'This shape is shown, not edited' : p.weights ? 'Click a point or press Enter to change its weight; the arrow keys step it' : mode === 'move' ? 'Arrow keys move the shape' : 'Arrow keys move the point; Delete removes it'
  const hoverShapeId = hover ? (hover.kind === 'edge' ? hover.shapeId : shape?.id ?? null) : null
  const hoveredPoint = hover?.kind === 'point' ? hover.i : -1
  const edgeOnSelected = hover?.kind === 'edge' && !!shape && hover.shapeId === shape.id
  const selectedPointsDrawn = shown.has('points') && overlay && mode === 'points'

  const figure = (
    <>
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
            <PaintedPath
              key={id} item={item} prefix={prefix} data-shape={id}
              className={`cmShape${focusIds.has(id) ? ' cmShape--on' : ''}${!none && focusIds.size > 0 && !focusIds.has(id) ? ' cmShape--dim' : ''}${selected ? ' cmShape--sel' : ''}${pickable ? ' cmShape--pick' : ''}${p.pick && !pickable ? ' cmShape--off' : ''}${s.mirrorOf ? ' cmShape--twin' : ''}${item.helper ? ' cmShape--helper' : ''}`}
              onPointerDown={e => onShapeDown(e, id)} onDoubleClick={e => onDouble(e, s)}
            />
          )
        })}
      </g>
    </>
  )

  // The head units: a line every head from the crown down, numbered, and the canon's landmarks as ticks at the left (see engine/guides.ts).
  const heads = shown.has('heads') ? headGuide(content, solved) : null
  const layerNodes: Record<LayerId, ReactNode> = {
    gridlines: gridLines.length ? <g className="cmLayer" data-layer="gridlines">{gridLines}</g> : null,
    heads: heads ? (
      <g className="cmLayer cmHeads" data-layer="heads" aria-hidden="true">
        {heads.lines.map(l => (
          <Fragment key={l.n}>
            <line x1={heads.x0} y1={l.y} x2={heads.x1} y2={l.y} className={`cmHeadLine${l.n === 0 ? ' cmHeadLine--crown' : ''}`} data-head={l.n} />
            <text x={heads.x1 + 2 * u} y={l.y + 3 * u} className="cmHeadText" style={{ fontSize: 9 * u }}>{l.n}</text>
          </Fragment>
        ))}
        {heads.marks.map(m => (
          <Fragment key={m.name}>
            <line x1={heads.x0 - 6 * u} y1={m.y} x2={heads.x0 + 8 * u} y2={m.y} className="cmHeadMark" data-mark={m.name} />
            <text x={heads.x0 - 8 * u} y={m.y + 3 * u} className="cmHeadText cmHeadText--mark" style={{ fontSize: 9 * u }}>{m.name}</text>
          </Fragment>
        ))}
        <line x1={heads.x0} y1={heads.bottom} x2={heads.x1} y2={heads.bottom} className="cmHeadLine cmHeadLine--soles" data-heads={heads.heads} />
        <text x={heads.x1 + 2 * u} y={heads.bottom + 12 * u} className="cmHeadText cmHeadText--total" style={{ fontSize: 9 * u }}>{`${heads.heads} heads`}</text>
      </g>
    ) : null,
    figure,
    ghost: (
      <>
        {solved.order.map(id => {
          const r = solved.shapes[id]
          return r?.ghost && r.visible ? <path key={`ghost-${id}`} d={r.ghost} data-ghost={id} className="cmGhost" aria-hidden="true" /> : null
        })}
        {p.frames && !through && p.frames.frames.map(f => {
          const label = `Frame ${f.name || 'Frame'}`
          const hs = 4 * u
          const at = (hd: FrameHandle): [number, number] => [f.box.x + (hd.includes('w') ? 0 : hd.includes('e') ? f.box.w : f.box.w / 2), f.box.y + (hd.includes('n') ? 0 : hd.includes('s') ? f.box.h : f.box.h / 2)]
          return (
            <g key={f.id} className={`cmFrame${f.on ? ' cmFrame--on' : ''}`}>
              <rect x={f.box.x} y={f.box.y} width={f.box.w} height={f.box.h} className="cmFrameRect" aria-hidden="true" />
              <text x={f.box.x + 2 * u} y={f.box.y - 3 * u} className="cmFrameName" aria-hidden="true" style={{ fontSize: 10 * u }}>{f.name || 'Frame'}</text>
              <rect
                x={f.box.x} y={f.box.y} width={f.box.w} height={f.box.h} className="cmFrameHit" style={{ strokeWidth: 12 * u }} role="button" tabIndex={0} aria-pressed={f.on}
                aria-label={f.on ? `${label}. Drag it to move it, or press the arrow keys; with Shift they resize it, with Alt they step by five` : `${label}. Press Enter to edit it`}
                onPointerDown={e => onFrameDown(e, f, 'move')} onKeyDown={e => onFrameKey(e, f)}
              />
              {f.on && FRAME_HANDLES.map(hd => {
                const [cx, cy] = at(hd)
                return <rect key={hd} x={cx - hs} y={cy - hs} width={hs * 2} height={hs * 2} className="cmFrameHandle" role="button" tabIndex={-1} aria-label={`Resize ${f.name || 'the frame'} from its ${hd}`} onPointerDown={e => onFrameDown(e, f, hd)} />
              })}
            </g>
          )
        })}
      </>
    ),
    mirror: <line x1={axis} y1={vb.y} x2={axis} y2={vb.y + vb.h} className={`cmMirrorLine${mirror ? ' cmMirrorLine--on' : ''}`} />,
    guides: guides ? (
      <g className="cmLayer" data-layer="guides" aria-hidden="true">
        {guides.x !== null && <line x1={guides.x} y1={vb.y} x2={guides.x} y2={vb.y + vb.h} className="cmGuide" data-guide="x" />}
        {guides.y !== null && <line x1={vb.x} y1={guides.y} x2={vb.x + vb.w} y2={guides.y} className="cmGuide" data-guide="y" />}
      </g>
    ) : null,
    outlines: sel.kind === 'shape' && shapesById.has(sel.id) && solved.shapes[sel.id]?.d ? (
      <>
        <path d={solved.shapes[sel.id].d} className="cmRing cmRing--under" aria-hidden="true" />
        <path d={solved.shapes[sel.id].d} className="cmRing cmRing--over" data-ring={sel.id} aria-hidden="true" />
      </>
    ) : null,
    points: selectedPointsDrawn ? (
      <>
        {built.map((b, i) => {
          const w = Math.min(1, Math.max(0, shape!.pts[i].w ?? 0))
          return (
            <circle
              key={i} cx={b.x} cy={b.y} r={(i === selPoint || i === hoveredPoint ? 5.5 : edgeOnSelected ? 3 : 4) * u} role="button" tabIndex={-1} aria-pressed={i === selPoint}
              aria-label={`Point ${i + 1}${linkedSet.has(i) ? ', linked' : ''}${p.skin ? `, skin weight ${Math.round((p.skin.weights[i] ?? 0) * 100)}%` : w > 0 ? `, weight ${Math.round(w * 100)}%` : p.weights ? ', no weight' : ''}`}
              className={`cmPoint${i === selPoint ? ' cmPoint--sel' : ''}${i === hoveredPoint ? ' cmPoint--hover' : ''}${shape!.pts[i].m === 's' ? ' cmPoint--sharp' : ''}${editable ? '' : ' cmPoint--off'}${linkedSet.has(i) ? ' cmPoint--linked' : ''}${w > 0 && !p.skin ? ' cmPoint--weighted' : ''}${p.weights || p.skin ? ' cmPoint--weigh' : ''}`}
              onPointerDown={e => onPointDown(e, i)}
            />
          )
        })}
      </>
    ) : null,
    pivots: (
      <>
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
      </>
    ),
    weights: overlay && mode === 'points' ? (
      <>
        {cur && (
          <g className="cmHandles">
            {(cur.m === 'c' || cur.m === 'cs') && <HandleDot x={cur.x} y={cur.y} hx={cur.hix} hy={cur.hiy} u={u} label="Incoming curve handle" onDown={e => onHandleDown(e, 'hi')} />}
            {(cur.m === 'c' || cur.m === 'sc') && <HandleDot x={cur.x} y={cur.y} hx={cur.hox} hy={cur.hoy} u={u} label="Outgoing curve handle" onDown={e => onHandleDown(e, 'ho')} />}
          </g>
        )}
        {p.skin ? built.map((b, i) => {
          const w = Math.min(1, Math.max(0, p.skin!.weights[i] ?? 0))
          return w > 0 ? <circle key={`k${i}`} cx={b.x} cy={b.y} r={(6 + w * 6) * u} data-skin={w} className="cmSkinRing" style={{ opacity: w }} aria-hidden="true" /> : null
        }) : built.map((b, i) => {
          const w = Math.min(1, Math.max(0, shape!.pts[i].w ?? 0))
          return w > 0 ? <circle key={`w${i}`} cx={b.x} cy={b.y} r={(6 + w * 6) * u} data-weight={w} className="cmWeightRing" style={{ opacity: 0.35 + 0.65 * w }} aria-hidden="true" /> : null
        })}
      </>
    ) : null,
  }

  // What shows only while the pointer is over an outline, a point or a crossing: the outline widens, its points appear small, the point under the pointer is larger, a large
  // handle sits on the outline where a click would add a point, and a crossing shows the stage of its lock. It is drawn over every layer and takes no clicks of its own.
  function hoverLayer(): ReactNode {
    if (!hover || !hoverShapeId) return null
    const hs = solved.shapes[hoverShapeId], hShape = shapesById.get(hoverShapeId)
    if (!hs || !hShape) return null
    const own = !!shape && hoverShapeId === shape.id
    const pts = own ? built : build(hs.local, hShape.closed, hs.matrix)
    return (
      <g className="cmHover" aria-hidden="true">
        <path d={hs.d} className="cmHoverOutline" data-hover={hoverShapeId} />
        {!(own && selectedPointsDrawn) && pts.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={(hover.kind === 'point' && hover.i === i ? 5.5 : 3) * u} className={`cmHoverPoint${hover.kind === 'point' && hover.i === i ? ' cmHoverPoint--on' : ''}`} />)}
        {hover.kind === 'edge' && <circle cx={hover.x} cy={hover.y} r={(own ? 6 : 4.5) * u} className={`cmEdgeHandle${own ? '' : ' cmEdgeHandle--soft'}`} data-edge-handle={hoverShapeId} />}
        {hover.kind === 'cross' && (() => {
          const stage = p.lock?.stageOf(hover.crossing) ?? 0
          return (
            <g className={`cmCross cmCross--${stage}`} data-cross={stage}>
              <circle cx={hover.crossing.x} cy={hover.crossing.y} r={8 * u} className="cmCrossRing" />
              <circle cx={hover.crossing.x} cy={hover.crossing.y} r={(stage === 0 ? 2 : 4) * u} className="cmCrossDot" />
              <title>{stage === 0 ? 'Click to lock this shape onto the other one' : stage === 1 ? 'Locked onto the edge: click to weld the two shapes' : 'Welded: click to unlock'}</title>
            </g>
          )
        })()}
      </g>
    )
  }

  return (
    <svg
      ref={svgRef} className={`cmCanvas${p.pick ? ' cmCanvas--pick' : ''}${p.pose ? ' cmCanvas--pose' : ''}${p.skin ? ' cmCanvas--skin' : ''}${p.taper ? ' cmCanvas--taper' : ''}`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="application" tabIndex={0}
      aria-label={`Designer canvas. ${nudgeHint}. Click the empty grid to unselect everything, or right-click it.`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { setHover(null); setBrush(null) }} onContextMenu={e => e.preventDefault()} onKeyDown={onKey}
      onDoubleClick={e => { if (p.taper) { e.preventDefault(); p.taper.onFinish() } }}
    >
      <rect x={vb.x - 1} y={vb.y - 1} width={vb.w + 2} height={vb.h + 2} className="cmCanvasBg" />
      {p.layers.map(id => <Fragment key={id}>{layerNodes[id]}</Fragment>)}
      {p.pick?.groups?.map(g => (
        <g key={g.id} className="cmPickGroup" role="button" tabIndex={0} aria-label={`Pick the pivot of ${g.name}`} onPointerDown={e => { e.stopPropagation(); if (e.button === 0) p.onPickGroup?.(g.id) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onPickGroup?.(g.id) } }}>
          <circle cx={g.x} cy={g.y} r={9 * u} className="cmPickGroupHit" />
          <circle cx={g.x} cy={g.y} r={4.5 * u} className="cmPickGroupDot" />
        </g>
      ))}
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
      {hoverLayer()}
      {p.taper && (
        <g className="cmTaper" aria-hidden="true">
          {p.taper.preview && <path d={p.taper.preview} className="cmTaperRibbon" data-taper-preview="" />}
          {p.taper.spine.length > 1 && <polyline points={p.taper.spine.map(q => q.join(',')).join(' ')} className="cmTaperSpine" />}
          {p.taper.spine.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3 * u} className="cmTaperDot" data-taper-point={i} />)}
        </g>
      )}
      {p.skin && brush && overlay && <circle cx={brush[0]} cy={brush[1]} r={p.skin.radius} className="cmSkinBrush" data-brush="" aria-hidden="true" />}
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

// The nearest place on a polyline (closed: with its closing side) to a point, and how far it is.
function nearestOnPolyline(poly: Array<[number, number]>, closed: boolean, x: number, y: number): { x: number; y: number; dist: number } | null {
  let best: { x: number; y: number; dist: number } | null = null
  const n = poly.length, last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0
    const px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(px - x, py - y)
    if (!best || d < best.dist) best = { x: px, y: py, dist: d }
  }
  return best
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
