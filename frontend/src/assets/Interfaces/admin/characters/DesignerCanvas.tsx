import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react'
import type { ModelContent, ModelShape } from '../../../../api/types'
import { NO_COLOURING, type Colouring } from './engine/colour'
import { crossingNear, crossingsOf, type Crossing, type LockStage } from './engine/crossings'
import { addPoint, deletePoint, moveHandle, movePoint, moveShape, nudgePoint } from './engine/edit'
import { FRAME_HANDLES, movedBox, resizedBox, type FrameHandle } from './engine/frames'
import { apply, boxOf, build, flatten, inverse, nearestEdge, type Box, type BuiltPoint } from './engine/geometry'
import { gridStep, isMajor, snapTo } from './engine/gridSnap'
import { alignTo, guideTargets, headGuide, type GuideTargets } from './engine/guides'
import { dropTargetAt, handleHome, isConnected, isWeld, rootOf, sharedSegment, sharersOf, slideOnEdge, weldTree, type DropTarget } from './engine/connect'
import { rayAngles, wedgeAt } from './engine/symmetry'
import { BOX_HANDLES, HANDLE_NAMES, frameCorners, frameOf, handleAt, resizeFrom, rotOf, turnFrom, turnHandleAt, type BoxHandle, type Frame } from './engine/transform'
import { paintDefs, paintShapes } from './engine/paint'
import type { Solved } from './engine/rig'
import { PaintDefs, PaintedPath, useSvgPrefix } from './PaintedPath'
import { NONE, activeShape, shapesOf, type PartKind, type RightTarget, type Selection } from './designerState'
import { wheelZoom } from './zoomMap'
import type { LayerId } from './layerStack'

// The designer's canvas: the solved model's shapes in an SVG (every group where its pivots, anchors and the test sliders put it), with the selected shape's
// points, curve handles and mirror line, and the selected group's pivot. It fills the whole console, and the toolbars lie over its edges (`insets`).
// Left button: a click on the empty grid unselects everything, a click inside a shape selects the shape, a click on a point or a segment (the side between two points)
// selects it (another shape's too: that shape is selected with it), a click on a crossing of two outlines steps a lock (onto the edge, welded, free; with every tool only);
// a drag moves a point, a curve handle, the shape whose body it began on, or the pivot; a double-click on a segment adds a point there. Right button: a click on a point
// changes its type (corner, curve, curve in only, curve out only), on a segment makes it straight or curved, on a shape selects it, on the grid unselects everything; a
// drag pans. Ctrl and the wheel zoom about the pointer. Arrow keys move what is selected (a point, both ends of a segment, the shape; Shift: bigger steps), Delete removes
// the selected point. A shape is edited through its group's matrix, so it can be edited with the groups turned; `editable` is false when a slider changes the shape's own
// points (what is drawn is then not what is stored).
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
// how near (in pixels) a dragged point has to come to a point or a segment of another shape to connect to it (shape editor S5)
const CONNECT_REACH = 8
// the box of the selected shape (shape editor S4): how far outside the shape it is drawn, and how far above it the turn handle sits, in pixels
const BOX_PAD = 8
const TURN_OFF = 18
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
// What a Ctrl + click is on (shape types T2).
export type RemoveTarget = { kind: 'point'; id: string; i: number } | { kind: 'segment'; id: string; e: number }

// Where a right-click was: in canvas space, and on the screen.
export interface RightSpot { x: number; y: number; clientX: number; clientY: number }

export interface ConnectTool {
  onConnect: (shapeId: string, i: number, target: DropTarget) => void
  // a right-drag on a connected point: pull it free and put it at (x, y) in its shape's space (it is then dragged)
  onLoosen: (shapeId: string, i: number, x: number, y: number) => void
  // a double-click on a shared segment adds a point to it and to every segment that shares it
  onAddShared: (shapeId: string, e: number, x: number, y: number) => void
}
// How much of each edge of the canvas a toolbar covers, in pixels: the view is fitted and centred in what is left.
export interface Insets { left: number; right: number; bottom: number; top?: number }
const NO_INSETS: Insets = { left: 0, right: 0, bottom: 0, top: 0 }

export interface CanvasProps {
  content: ModelContent
  solved: Solved
  sel: Selection
  // what of the selected shape is selected, and which point or segment (`selPoint`)
  part: PartKind
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
  // The shape editor (S4): the selected shape has a box with handles that resize it and one that turns it; `keepRatio` makes every resize keep the proportions (Shift does too).
  transform?: boolean
  keepRatio?: boolean
  // The shape editor's connections (S5): a point dragged over a point or a segment of another shape is shown ready (the alert colour) and connected where it is dropped; a
  // welded point drags the point it is welded to, a point on a segment slides along it, and a right-drag pulls a connected point free.
  connect?: ConnectTool | null
  // The shape editor's symmetry (S6): while axes are being chosen the canvas draws them through the selected shape's middle, lights the side under the pointer and takes a
  // click as the side to copy; a symmetric shape's axes are the Symmetry axes layer.
  symmetry?: { choosing: { a: number; n: number } | null; onPick: (side: number) => void } | null
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
  onSelectSegment: (e: number) => void
  // Ctrl and the wheel over the canvas zoom (the view keeps the point under the pointer where it is).
  onZoom?: (zoom: number) => void
  // A drag is about to change the content: remember it for undo once.
  onGesture: () => void
  // The shape's new form while it is dragged (no undo entry of its own).
  onShape: (id: string, next: ModelShape) => void
  // Discrete edits: they remember the content themselves.
  onEditShape: (id: string, next: ModelShape, selectPoint?: number) => void
  // Something the canvas could not do, in words (a shape at its most points).
  onNote?: (note: string) => void
  // a right-click that did not drag, with where it was (in canvas space and on the screen)
  onRightClick: (target: RightTarget, at: RightSpot) => void
  // set to a function that turns a place on the screen into canvas space (the shape editor's new-shape form puts its shape there)
  worldRef?: { current: ((clientX: number, clientY: number) => [number, number]) | null }
  // the last place the pointer was over the canvas, in canvas space (null once it has left): the shape editor pastes there (T2)
  pointerRef?: { current: [number, number] | null }
  // the shape editor (T2): Delete on a selected shape removes it; Ctrl + click on a point removes it, and on a segment joins its two points
  onDeleteShape?: (id: string) => void
  onRemove?: (target: RemoveTarget) => void
  // Which mode the caller's keys set (the canvas itself only reports).
  onEscape: () => void
}

type Drag =
  | { kind: 'point'; shapeId: string; index: number; x0: number; y0: number; moved: boolean; via?: { shapeId: string; i: number } }
  // a point locked onto a segment of another shape, slid along it (shape editor S5)
  | { kind: 'slide'; shapeId: string; index: number; x0: number; y0: number; moved: boolean }
  | { kind: 'handle'; shapeId: string; index: number; which: 'hi' | 'ho' }
  | { kind: 'move'; shapeId: string; last: [number, number]; start: [number, number]; from: ModelShape; box: Box | null; world0: [number, number]; box0: Box | null; x0: number; y0: number; moved: boolean }
  | { kind: 'pivot' }
  | { kind: 'pose' }
  | { kind: 'frame'; id: string; handle: FrameHandle | 'move'; start: [number, number]; box: Box }
  // the box of the selected shape (shape editor S4): a resize from one of its handles, or a turn by its round handle, worked out from the shape as it was when it began
  | { kind: 'resize'; shapeId: string; handle: BoxHandle; from: ModelShape; frame: Frame; x0: number; y0: number; moved: boolean }
  | { kind: 'turn'; shapeId: string; from: ModelShape; frame: Frame; start: [number, number]; x0: number; y0: number; moved: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number; target: RightTarget; moved: boolean }
  | { kind: 'paint'; point: number; down: boolean; x0: number; y0: number; moved: boolean }

// What the pointer is over while nothing is dragged: a point of a shape, a crossing of the selected shape's outline with another, or a segment of an outline (e: which
// one; x, y: the spot on it nearest the pointer, where the hover handle sits).
type Hover =
  | { kind: 'point'; shapeId: string; i: number }
  | { kind: 'cross'; crossing: Crossing }
  | { kind: 'edge'; shapeId: string; e: number; x: number; y: number }

export function DesignerCanvas(p: CanvasProps) {
  const { content, solved, sel, part, selPoint, mirror, snap, zoom, fitAll, axis, pivot, anchor } = p
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
  // the side under the pointer while the axes of a symmetry are being chosen (shape editor S6)
  const [symHover, setSymHover] = useState<number | null>(null)
  // what a dragged point would connect to if it were dropped now (shape editor S5)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const dropRef = useRef<DropTarget | null>(null)
  const showDrop = (t: DropTarget | null) => {
    const a = dropRef.current
    const same = a === t || (!!a && !!t && a.kind === t.kind && a.shapeId === t.shapeId && (a.kind === 'point' ? a.i === (t as typeof a).i : a.e === (t as typeof a).e && Math.abs(a.x - t.x) + Math.abs(a.y - t.y) < 1e-3))
    dropRef.current = t
    if (!same) setDrop(t)
  }
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
  // in the shape editor the points are drawn where the links put them (a welded point on its target, a shared segment with its handles)
  const builtFrom = p.connect && solvedShape && solvedShape.local.length === shape?.pts.length ? solvedShape.local : shape?.pts
  const built = overlay && matrix && builtFrom ? build(builtFrom, shape!.closed, matrix) : []
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
  if (p.worldRef) p.worldRef.current = (clientX, clientY) => toWorld({ clientX, clientY })
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

  // Where a dragged point (index >= 0) or curve handle (-1) lands: on the grid with Snap to grid; with Snap, a point lands on a point of the same shape near it, or lines up
  // with the guides. (Another shape's points are what a dropped point connects to.)
  function snapPoint(s: ModelShape, index: number, wx: number, wy: number): [number, number] {
    if (onGrid) { showGuides(null, null); return [snapTo(wx, unit), snapTo(wy, unit)] }
    if (index < 0) return [wx, wy]
    if (snap) {
      const r = solved.shapes[s.id]
      if (r) {
        const pts = build(r.local, s.closed, r.matrix), reach = REACH_POINT * pixel()
        let best: [number, number] | null = null, bd = reach
        for (let k = 0; k < pts.length; k++) {
          if (k === index) continue
          const dd = Math.hypot(pts[k].x - wx, pts[k].y - wy)
          if (dd <= bd) { bd = dd; best = [pts[k].x, pts[k].y] }
        }
        if (best) { showGuides(null, null); return best }
      }
    }
    return guided(wx, wy)
  }

  // Ctrl and the wheel zoom about the pointer: the point under it stays where it is. Plain scrolling moves the view across the grid, up and down (sideways with Shift, or a
  // sideways scroll). The listener is not passive, so the page does not zoom or scroll as well.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelRef.current = (e: WheelEvent) => {
    if (!e.ctrlKey) {
      const r = rect(), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.h : 1
      let dx = e.deltaX * unit, dy = e.deltaY * unit
      if (e.shiftKey && !dx) { dx = dy; dy = 0 }
      if (!dx && !dy) return
      e.preventDefault()
      setPan(q => ({ x: q.x + (dx / r.w) * vb.w, y: q.y + (dy / r.h) * vb.h }))
      p.onViewMoved?.()
      return
    }
    if (!p.onZoom) return
    e.preventDefault()
    const next = wheelZoom(zoom, e.deltaY)
    if (Math.abs(next - zoom) < 1e-9) return
    const r = rect(), k1 = (k * zoom) / next
    const ax = e.clientX - r.left - (visW / 2 + ins.left), ay = e.clientY - r.top - (visH / 2 + (ins.top ?? 0))
    setPan(q => ({ x: q.x + (k - k1) * ax, y: q.y + (k - k1) * ay }))
    p.onZoom(next)
    p.onViewMoved?.()
  }
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

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
    if (overlay && shape && (editable || !!p.skin)) {
      let best = -1, bd = REACH_POINT * px
      built.forEach((b, i) => { const d = Math.hypot(b.x - wx, b.y - wy); if (d <= bd) { bd = d; best = i } })
      if (best >= 0) return { kind: 'point', shapeId: shape.id, i: best }
    }
    if (overlay && shape && matrix && !p.skin) {
      const [lx, ly] = apply(inverse(matrix), wx, wy)
      const hit = nearestEdge(shape.pts, lx, ly)
      if (hit && hit.dist * Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) <= REACH_EDGE * px) {
        const [cx, cy] = apply(matrix, hit.x, hit.y)
        return { kind: 'edge', shapeId: shape.id, e: hit.e, x: cx, y: cy }
      }
    }
    for (let i = solved.order.length - 1; i >= 0; i--) {
      const id = solved.order[i], r = solved.shapes[id], s = shapesById.get(id)
      if (!r || !s || !r.visible || r.off || id === shape?.id || r.poly.length < 2 || s.mirrorOf) continue
      const reach = REACH_POINT * px
      if (wx < r.box.x - reach || wx > r.box.x + r.box.w + reach || wy < r.box.y - reach || wy > r.box.y + r.box.h + reach) continue
      // another shape's points come before its outline, so a click on one selects that shape and that point at once
      const pts = build(r.local, s.closed, r.matrix)
      let best = -1, bd = reach
      pts.forEach((b, k) => { const d = Math.hypot(b.x - wx, b.y - wy); if (d <= bd) { bd = d; best = k } })
      if (best >= 0) return { kind: 'point', shapeId: id, i: best }
      const [lx, ly] = apply(inverse(r.matrix), wx, wy)
      const hit = nearestEdge(r.local, lx, ly)
      if (hit && hit.dist * Math.sqrt(Math.abs(r.matrix[0] * r.matrix[3] - r.matrix[1] * r.matrix[2])) <= REACH_EDGE * px) {
        const [cx, cy] = apply(r.matrix, hit.x, hit.y)
        return { kind: 'edge', shapeId: id, e: hit.e, x: cx, y: cy }
      }
    }
    return null
  }
  const sameHover = (a: Hover | null, b: Hover | null): boolean => {
    if (a === b) return true
    if (!a || !b || a.kind !== b.kind) return false
    if (a.kind === 'point' && b.kind === 'point') return a.shapeId === b.shapeId && a.i === b.i
    if (a.kind === 'cross' && b.kind === 'cross') return a.crossing.other === b.crossing.other && Math.hypot(a.crossing.x - b.crossing.x, a.crossing.y - b.crossing.y) < 0.01
    if (a.kind === 'edge' && b.kind === 'edge') return a.shapeId === b.shapeId && a.e === b.e && Math.hypot(a.x - b.x, a.y - b.y) < 0.5 * pixel()
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
    // another shape's point or segment: that shape is selected with it (the next press drags it)
    if (!shape || h.shapeId !== shape.id) {
      if (onBody && h.kind === 'edge') return false
      p.onSelect({ kind: 'shape', id: h.shapeId })
      if (h.kind === 'point') p.onSelectPoint(h.i)
      else p.onSelectSegment(h.e)
      return true
    }
    if (h.kind === 'point') { beginPoint(e, h.i); return true }
    if (p.weights || p.skin) return false
    p.onSelectSegment(h.e)
    return true
  }

  // ---- pressing ----

  // The taper tool: a click lays the next point of the ribbon's line (on the grid with Snap to grid, on half units with Snap).
  function addTaper(e: { clientX: number; clientY: number }) {
    let [x, y] = toWorld(e)
    if (onGrid) { x = snapTo(x, unit); y = snapTo(y, unit) } else if (snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2 }
    p.taper?.onAdd(x, y)
  }
  // What a right press is on: a point or a segment (of the selected shape, or of another the pointer is over), else what it was pressed on.
  function rightTarget(e: { clientX: number; clientY: number }, fallback: RightTarget): RightTarget {
    const h = p.pose || p.pick || through ? null : hitTest(e)
    if (h?.kind === 'point') return { kind: 'point', id: h.shapeId, i: h.i }
    if (h?.kind === 'edge') return { kind: 'segment', id: h.shapeId, e: h.e }
    return fallback
  }
  function onDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: rightTarget(e, { kind: 'grid' }), moved: false }
      capture(e)
      return
    }
    if (e.button !== 0) return
    if (ctrlRemove(e)) return
    if (p.taper) { addTaper(e); return }
    if (hoverDown(e)) return
    // a click on the empty grid unselects everything (not while a tool is waiting for a click of its own)
    if (!p.pick && !p.pose && !p.frames && !p.weights && !p.skin && !through && sel.kind !== 'none') p.onSelect(NONE)
  }
  function onShapeDown(e: ReactPointerEvent, id: string) {
    e.stopPropagation()
    if (e.button === 2) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: rightTarget(e, { kind: 'shape', id }), moved: false }
      capture(e)
      return
    }
    if (e.button !== 0) return
    if (ctrlRemove(e)) return
    if (p.taper) { addTaper(e); return }
    if (p.pose) { if (p.pose.onDown({ kind: 'part', shapeId: id }, toWorld(e), e.altKey)) { dragRef.current = { kind: 'pose' }; capture(e) } return }
    if (p.pick) {
      if (picking.has(id)) { const [x, y] = toWorld(e); p.onPick?.(id, x, y) }
      return
    }
    if (hoverDown(e, true)) return
    const already = sel.kind === 'shape' && sel.id === id
    if (!already || part !== 'shape') p.onSelect({ kind: 'shape', id })
    const from = shapesById.get(id), r = solved.shapes[id]
    if (!from || from.mirrorOf || p.weights || p.skin || (already && !editable) || !r) return
    // the shape's own space (its group's matrix), so the drag can begin before the page has drawn it selected
    const inv = inverse(r.matrix), [wx, wy] = toWorld(e), at = apply(inv, wx, wy)
    dragRef.current = { kind: 'move', shapeId: id, last: at, start: at, from, box: from.pts.length >= 3 ? boxOf(flatten(build(from.pts, from.closed), from.closed)) : null, world0: [wx, wy], box0: r.box, x0: e.clientX, y0: e.clientY, moved: false }
    beginGuides([id])
    capture(e)
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
    if (!editable) return
    if (linkedSet.has(i)) {
      // the shape editor (S5): a welded point drags the point it is welded to (both move), a point on a segment slides along it
      if (!p.connect) return
      const b = shape.pts[i].bind
      if (isWeld(b)) {
        const root = rootOf(content, shape.id, i)
        dragRef.current = { kind: 'point', shapeId: root.shapeId, index: root.i, x0: e.clientX, y0: e.clientY, moved: false, via: { shapeId: shape.id, i } }
        beginGuides([root.shapeId, shape.id])
        capture(e)
      } else if (b?.kind === 'edge') {
        dragRef.current = { kind: 'slide', shapeId: shape.id, index: i, x0: e.clientX, y0: e.clientY, moved: false }
        capture(e)
      }
      return
    }
    dragRef.current = { kind: 'point', shapeId: shape.id, index: i, x0: e.clientX, y0: e.clientY, moved: false }
    beginGuides([shape.id])
    capture(e)
  }
  // Ctrl + click on a point removes it, on a segment joins its two points (shape types T2); true when it was one
  function ctrlRemove(e: ReactPointerEvent): boolean {
    if (e.button !== 0 || !(e.ctrlKey || e.metaKey) || !p.onRemove || p.pose || p.pick || through) return false
    const h = hitTest(e)
    if (h?.kind === 'point') { p.onRemove({ kind: 'point', id: h.shapeId, i: h.i }); return true }
    if (h?.kind === 'edge') { p.onRemove({ kind: 'segment', id: h.shapeId, e: h.e }); return true }
    return false
  }
  function onPointDown(e: ReactPointerEvent, i: number) {
    e.stopPropagation()
    if ((e.ctrlKey || e.metaKey) && e.button === 0 && p.onRemove && shape) { p.onRemove({ kind: 'point', id: shape.id, i }); return }
    if (e.button === 2 && shape) {
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, target: { kind: 'point', id: shape.id, i }, moved: false }
      capture(e)
      return
    }
    if (e.button !== 0) return
    beginPoint(e, i)
  }
  function onHandleDown(e: ReactPointerEvent, index: number, which: 'hi' | 'ho') {
    e.stopPropagation()
    if (!shape || e.button !== 0 || !editable) return
    p.onGesture()
    // a handle of a shared segment is the handle of the segment that is drawn (shape editor S5)
    const home = p.connect && part === 'segment' ? handleHome(content, shape.id, selPoint, index === selPoint ? 'start' : 'end') : null
    dragRef.current = home ? { kind: 'handle', shapeId: home.shapeId, index: home.index, which: home.which } : { kind: 'handle', shapeId: shape.id, index, which }
    capture(e)
  }
  // The box's handles (shape editor S4): a press on one begins a resize or a turn, worked out from the shape as it is now; it is a click until it has moved a little.
  function onBoxDown(e: ReactPointerEvent, h: BoxHandle) {
    e.stopPropagation()
    if (!shape || e.button !== 0 || !editable) return
    const f = frameOf(shape)
    if (!f) return
    dragRef.current = { kind: 'resize', shapeId: shape.id, handle: h, from: shape, frame: f, x0: e.clientX, y0: e.clientY, moved: false }
    capture(e)
  }
  function onTurnDown(e: ReactPointerEvent) {
    e.stopPropagation()
    if (!shape || e.button !== 0 || !editable) return
    const f = frameOf(shape), r = solved.shapes[shape.id]
    if (!f) return
    const [wx, wy] = toWorld(e)
    const start: [number, number] = r ? apply(inverse(r.matrix), wx, wy) : [wx, wy]
    dragRef.current = { kind: 'turn', shapeId: shape.id, from: shape, frame: f, start, x0: e.clientX, y0: e.clientY, moved: false }
    capture(e)
  }
  // Choosing the side of a symmetry to copy (shape editor S6): the side under the pointer lights, and a click takes it.
  function symSideAt(e: { clientX: number; clientY: number }): number | null {
    const ch = p.symmetry?.choosing
    if (!ch || !symFrame || !shape) return null
    const [wx, wy] = toWorld(e), [lx, ly] = matrix ? apply(inverse(matrix), wx, wy) : [wx, wy]
    return wedgeAt(symFrame.cx, symFrame.cy, rotOf(shape), ch.a, ch.n, lx, ly)
  }
  function symHoverAt(e: { clientX: number; clientY: number }) {
    const w = symSideAt(e)
    setSymHover(h => (h === w ? h : w))
  }
  function onSymPick(e: ReactPointerEvent) {
    e.stopPropagation()
    if (e.button !== 0) return
    const w = symSideAt(e)
    if (w !== null) p.symmetry?.onPick(w)
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

  function onMove(e: { clientX: number; clientY: number; shiftKey?: boolean }) {
    if (p.pointerRef) p.pointerRef.current = toWorld(e)
    const d = dragRef.current
    if (p.skin) { const at = toWorld(e); setBrush(b => (b && Math.abs(b[0] - at[0]) < 1e-6 && Math.abs(b[1] - at[1]) < 1e-6 ? b : at)) }
    if (!d) { if (symFrame) symHoverAt(e); updateHover(e); return }
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
    if (d.kind === 'resize' || d.kind === 'turn') {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_SLOP) return
        d.moved = true
        p.onGesture()
      }
      const at = solved.shapes[d.shapeId], [wx, wy] = toWorld(e)
      const [x, y] = at ? apply(inverse(at.matrix), wx, wy) : [wx, wy]
      p.onShape(d.shapeId, d.kind === 'resize'
        ? resizeFrom(d.from, d.frame, d.handle, x, y, { keep: e.shiftKey === true || p.keepRatio === true, grid: onGrid ? unit : null })
        : turnFrom(d.from, d.frame, d.start, x, y, e.shiftKey === true))
      return
    }
    if (d.kind === 'pan' && p.connect && d.target.kind === 'point' && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3 && isConnected(content, d.target.id, d.target.i)) {
      // the shape editor (S5): a right-drag on a connected point pulls it free, and then drags it
      const [fx, fy] = toWorld(e), fm = solved.shapes[d.target.id]?.matrix
      const [lx, ly] = fm ? apply(inverse(fm), fx, fy) : [fx, fy]
      p.connect.onLoosen(d.target.id, d.target.i, lx, ly)
      dragRef.current = { kind: 'point', shapeId: d.target.id, index: d.target.i, x0: d.startX, y0: d.startY, moved: true }
      return
    }
    if (d.kind === 'slide') {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_SLOP) return
        d.moved = true
        p.onGesture()
      }
      const [sx, sy] = toWorld(e), slid = slideOnEdge(content, solved, d.shapeId, d.index, sx, sy)
      if (slid) p.onShape(d.shapeId, slid)
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
    // a press on a point, or on the body of a shape, is a click until it has moved a little: then it is a drag, and the undo step begins
    if ((d.kind === 'point' || d.kind === 'move') && !d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_SLOP) return
      d.moved = true
      p.onGesture()
    }
    const s = shapesById.get(d.shapeId)
    if (!s) return
    let [wx, wy] = toWorld(e)
    // the shape editor (S5): a dragged point over a point or a segment of another shape is ready to connect there (and is not snapped meanwhile)
    const ready = d.kind === 'point' && p.connect ? dropTargetAt(content, solved, d.shapeId, wx, wy, CONNECT_REACH * u, weldTree(content, d.shapeId, d.index)) : null
    if (d.kind === 'point') showDrop(ready)
    if ((d.kind === 'point' && !ready) || d.kind === 'handle') [wx, wy] = snapPoint(s, d.kind === 'point' ? d.index : -1, wx, wy)
    else if (d.kind === 'move' && !onGrid && d.box0) {
      const b = d.box0, [sx, sy] = d.world0
      ;[wx, wy] = guided(wx, wy, (px, py) => {
        const x0 = b.x + (px - sx), y0 = b.y + (py - sy)
        return { xs: [x0, x0 + b.w / 2, x0 + b.w], ys: [y0, y0 + b.h / 2, y0 + b.h] }
      })
    }
    const m = solved.shapes[s.id]?.matrix ?? matrix
    const [x, y] = m ? apply(inverse(m), wx, wy) : [wx, wy]
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
    if (d && d.kind === 'point' && d.moved && dropRef.current && p.connect) p.connect.onConnect(d.shapeId, d.index, dropRef.current)
    showDrop(null)
    if (d && d.kind === 'pan' && !d.moved) {
      const [wx, wy] = toWorld({ clientX: d.startX, clientY: d.startY })
      p.onRightClick(d.target, { x: wx, y: wy, clientX: d.startX, clientY: d.startY })
    }
    if (d && d.kind === 'paint' && !d.moved && d.point >= 0) p.skin?.onStep(d.point, d.down ? -1 : 1)
  }
  // A double-click on a segment adds a point there (on the segment of the shape the pointer is over, which the first click selected).
  function onDouble(e: ReactMouseEvent) {
    e.stopPropagation()
    if (p.taper) { e.preventDefault(); p.taper.onFinish(); return }
    if (p.pick || p.pose || through) return
    const h = hitTest(e)
    if (!h || h.kind !== 'edge') return
    const s = shapesById.get(h.shapeId), r = solved.shapes[h.shapeId]
    if (!s || !r || s.mirrorOf || (shape?.id === s.id && !editable)) return
    // a shared segment gets its point on the segment that is drawn and on every segment that shares it (shape editor S5)
    if (p.connect && (sharedSegment(content, s.id, h.e) || sharersOf(content, s.id, h.e).length)) { p.connect.onAddShared(s.id, h.e, h.x, h.y); return }
    const [x, y] = apply(inverse(r.matrix), h.x, h.y)
    const added = addPoint(s, h.e, { mirror, axis })
    if (added.index < 0) { p.onNote?.('A shape may have at most 60 points.'); return }
    const placed = mirror ? added.shape : movePoint(added.shape, added.index, x, y)
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
    if (d[e.key] && part === 'point' && linkedSet.has(selPoint)) {
      e.preventDefault()
      p.onNudgeLink?.(d[e.key][0], d[e.key][1])
    } else if (d[e.key]) {
      e.preventDefault()
      const [dx, dy] = d[e.key], n = shape.pts.length
      const next = part === 'shape' ? moveShape(shape, dx, dy)
        : part === 'segment' ? nudgePoint(nudgePoint(shape, selPoint, dx, dy, { mirror, axis }), (selPoint + 1) % n, dx, dy, { mirror, axis })
        : nudgePoint(shape, selPoint, dx, dy, { mirror, axis })
      p.onEditShape(shape.id, next, undefined)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && part === 'shape' && p.onDeleteShape) {
      e.preventDefault()
      p.onDeleteShape(shape.id)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && part === 'point') {
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
  // the point the selected segment ends at (none past the last point of an open shape)
  const segEnd = part === 'segment' && shape && (shape.closed || selPoint < built.length - 1) ? built[(selPoint + 1) % built.length] : undefined
  const nudgeHint = p.taper ? 'Taper: click to lay the line the ribbon runs along, then press Enter or double-click to make it; Backspace takes back a point, Escape starts over' : p.skin ? 'Skin weights: click a point to raise its weight a tenth (Shift: lower it), drag to paint, or press the arrow keys' : !editable ? 'This shape is shown, not edited' : p.weights ? 'Click a point or press Enter to change its weight; the arrow keys step it' : part === 'shape' ? 'Arrow keys move the shape' : part === 'segment' ? 'Arrow keys move the segment' : 'Arrow keys move the point; Delete removes it'
  const hoverShapeId = hover ? (hover.kind === 'edge' ? hover.shapeId : shape?.id ?? null) : null
  const hoveredPoint = hover?.kind === 'point' && hover.shapeId === shape?.id ? hover.i : -1
  const edgeOnSelected = hover?.kind === 'edge' && !!shape && hover.shapeId === shape.id
  const selectedPointsDrawn = shown.has('points') && overlay
  // The box of the selected shape (shape editor S4), while the shape itself is what is selected: its frame a few pixels out, eight handles that resize it and a round one above
  // it that turns it.
  // the point being dragged that is ready to connect (the selected shape's point, also when the drag moves the point it is welded to), and the names of the shared segments
  // of the selected shape as titles on a band along each (shape editor S5)
  const dragging = dragRef.current?.kind === 'point' ? dragRef.current : null
  const connectAt = drop && dragging ? dragging.via ?? { shapeId: dragging.shapeId, i: dragging.index } : null
  const sharedNames = p.connect && selectedPointsDrawn && shape ? shape.pts.map((pt, k) => {
    const name = pt.bind?.segName, next = built[(k + 1) % built.length]
    if (!name || !next || (!shape.closed && k >= built.length - 1) || !sharedSegment(content, shape.id, k)) return null
    return <path key={`n${k}`} d={segmentPath(built[k], next)} className="cmSegName" data-segment-name={k}><title>{name}</title></path>
  }) : null
  // The shape editor's symmetry (S6): the axes being chosen as rays from the selected shape's middle, the side under the pointer lit, and a sheet over everything that takes the
  // click; and a symmetric shape's axes as lines through its middle (the Symmetry axes layer).
  const symFrame = p.symmetry?.choosing && shape && overlay ? frameOf(shape) : null
  const symMarkup = symFrame && matrix && p.symmetry?.choosing ? (() => {
    const ch = p.symmetry!.choosing!, reach = Math.max(symFrame.w, symFrame.h) * 0.75 + 16 * u, angles = rayAngles(rotOf(shape!), ch.a, ch.n), span = 180 / ch.n
    const along = (ang: number, r: number): [number, number] => apply(matrix, symFrame.cx + Math.cos((ang * Math.PI) / 180) * r, symFrame.cy + Math.sin((ang * Math.PI) / 180) * r)
    const c = apply(matrix, symFrame.cx, symFrame.cy), lit = symHover !== null && symHover < angles.length ? symHover : null
    const wedge = lit === null ? '' : `M${[c, ...Array.from({ length: 13 }, (_, k) => along(angles[lit] + (span * k) / 12, reach))].map(q => `${q[0]} ${q[1]}`).join(' L')} Z`
    return (
      <g className="cmSym">
        {lit !== null && <path d={wedge} className="cmSymWedge" data-sym-wedge={lit} aria-hidden="true" />}
        {angles.map((ang, j) => { const e = along(ang, reach); return <line key={j} x1={c[0]} y1={c[1]} x2={e[0]} y2={e[1]} className="cmSymRay" data-sym-ray={j} aria-hidden="true" /> })}
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} className="cmSymPick" data-sym-pick="" onPointerDown={onSymPick} aria-hidden="true" />
      </g>
    )
  })() : null
  const symAxes = shape?.sym && matrix && overlay ? (() => {
    const sym = shape.sym, f = frameOf(shape), reach = (f ? Math.max(f.w, f.h) * 0.75 : 40) + 16 * u
    return (
      <g className="cmLayer" data-layer="symmetry" aria-hidden="true">
        {Array.from({ length: sym.n }, (_, k) => {
          const ang = ((rotOf(shape) + sym.a + (k * 180) / sym.n) * Math.PI) / 180, dx = Math.cos(ang) * reach, dy = Math.sin(ang) * reach
          const a = apply(matrix, sym.cx - dx, sym.cy - dy), b = apply(matrix, sym.cx + dx, sym.cy + dy)
          return <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="cmSymAxis" data-sym-axis={k} />
        })}
      </g>
    )
  })() : null
  const boxFrame = p.transform && selectedPointsDrawn && part === 'shape' && editable && !p.taper && !p.weights && !p.skin && !p.pick ? frameOf(shape!) : null
  const boxMarkup = boxFrame && matrix ? (() => {
    const pad = BOX_PAD * u, at = (pt: [number, number]) => apply(matrix, pt[0], pt[1])
    const corners = frameCorners(boxFrame, pad).map(at)
    const top = at(handleAt(boxFrame, 'n', pad)), knob = at(turnHandleAt(boxFrame, pad + TURN_OFF * u))
    return (
      <g className="cmBox" data-box={shape!.id}>
        <polygon points={corners.map(c => `${c[0]},${c[1]}`).join(' ')} className="cmBoxLine" aria-hidden="true" />
        <line x1={top[0]} y1={top[1]} x2={knob[0]} y2={knob[1]} className="cmBoxLine" aria-hidden="true" />
        {BOX_HANDLES.map(h => {
          const [x, y] = at(handleAt(boxFrame, h, pad))
          return (
            <rect
              key={h} x={x - 4 * u} y={y - 4 * u} width={8 * u} height={8 * u} transform={boxFrame.rot ? `rotate(${boxFrame.rot} ${x} ${y})` : undefined}
              className={`cmBoxHandle cmBoxHandle--${h}`} role="button" tabIndex={-1} aria-label={`Resize from the ${HANDLE_NAMES[h]}`} data-handle={h} onPointerDown={e => onBoxDown(e, h)}
            />
          )
        })}
        <circle cx={knob[0]} cy={knob[1]} r={5 * u} className="cmBoxTurn" role="button" tabIndex={-1} aria-label="Turn the shape" data-handle="turn" onPointerDown={onTurnDown} />
      </g>
    )
  })() : null
  const ptOn = (i: number) => part === 'point' && i === selPoint

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
          // a shadow or a light (shape types T1) shows only where it lies over other shapes, but the whole of it can be grabbed: an unclipped, unpainted area over it
          const hit = item.cast ? <path d={item.d} className="cmShapeHit" fill="none" pointerEvents="fill" data-hit={id} aria-hidden="true" onPointerDown={e => onShapeDown(e, id)} onDoubleClick={onDouble} /> : null
          return (
            <Fragment key={id}>
            <PaintedPath
              item={item} prefix={prefix} data-shape={id}
              lineClass={`cmShapeLine${!none && focusIds.size > 0 && !focusIds.has(id) ? ' cmShapeLine--dim' : ''}`}
              className={`cmShape${focusIds.has(id) ? ' cmShape--on' : ''}${!none && focusIds.size > 0 && !focusIds.has(id) ? ' cmShape--dim' : ''}${selected ? ' cmShape--sel' : ''}${pickable ? ' cmShape--pick' : ''}${p.pick && !pickable ? ' cmShape--off' : ''}${s.mirrorOf ? ' cmShape--twin' : ''}${item.helper ? ' cmShape--helper' : ''}`}
              onPointerDown={e => onShapeDown(e, id)} onDoubleClick={onDouble}
            />
            {hit}
            </Fragment>
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
    mirror: p.transform ? symAxes : <line x1={axis} y1={vb.y} x2={axis} y2={vb.y + vb.h} className={`cmMirrorLine${mirror ? ' cmMirrorLine--on' : ''}`} />,
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
        {segEnd && part === 'segment' && cur && <path d={segmentPath(cur, segEnd)} className="cmSeg cmSeg--sel" data-segment={selPoint} aria-hidden="true" />}
      </>
    ) : null,
    points: selectedPointsDrawn ? (
      <>
        {boxMarkup}
        {sharedNames}
        {drop && (
          <g aria-hidden="true">
            <circle cx={drop.x} cy={drop.y} r={8 * u} className="cmConnectRing cmConnectRing--under" />
            <circle cx={drop.x} cy={drop.y} r={8 * u} className="cmConnectRing" data-connect={drop.kind} />
          </g>
        )}
        {built.map((b, i) => {
          const w = Math.min(1, Math.max(0, shape!.pts[i].w ?? 0))
          return (
            <circle
              key={i} cx={b.x} cy={b.y} r={(ptOn(i) || i === hoveredPoint ? 5.5 : edgeOnSelected ? 3 : 4) * u} role="button" tabIndex={-1} aria-pressed={ptOn(i)}
              aria-label={`Point ${i + 1}${linkedSet.has(i) ? ', linked' : ''}${p.skin ? `, skin weight ${Math.round((p.skin.weights[i] ?? 0) * 100)}%` : w > 0 ? `, weight ${Math.round(w * 100)}%` : p.weights ? ', no weight' : ''}`}
              className={`cmPoint${ptOn(i) ? ' cmPoint--sel' : ''}${i === hoveredPoint ? ' cmPoint--hover' : ''}${shape!.pts[i].m === 's' ? ' cmPoint--sharp' : ''}${editable ? '' : ' cmPoint--off'}${linkedSet.has(i) ? ' cmPoint--linked' : ''}${w > 0 && !p.skin ? ' cmPoint--weighted' : ''}${p.weights || p.skin ? ' cmPoint--weigh' : ''}${connectAt && connectAt.shapeId === shape!.id && connectAt.i === i ? ' cmPoint--connect' : ''}`}
              onPointerDown={e => onPointDown(e, i)}
            >
              {shape!.pts[i].bind?.name ? <title>{shape!.pts[i].bind!.name}</title> : null}
            </circle>
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
    weights: overlay ? (
      <>
        {cur && part === 'point' && (
          <g className="cmHandles">
            {(cur.m === 'c' || cur.m === 'cs') && <HandleDot x={cur.x} y={cur.y} hx={cur.hix} hy={cur.hiy} u={u} label="Incoming curve handle" onDown={e => onHandleDown(e, selPoint, 'hi')} />}
            {(cur.m === 'c' || cur.m === 'sc') && <HandleDot x={cur.x} y={cur.y} hx={cur.hox} hy={cur.hoy} u={u} label="Outgoing curve handle" onDown={e => onHandleDown(e, selPoint, 'ho')} />}
          </g>
        )}
        {segEnd && part === 'segment' && cur && (
          <g className="cmHandles">
            {(cur.m === 'c' || cur.m === 'sc') && <HandleDot x={cur.x} y={cur.y} hx={cur.hox} hy={cur.hoy} u={u} label="Curve handle at the start of the segment" onDown={e => onHandleDown(e, selPoint, 'ho')} />}
            {(segEnd.m === 'c' || segEnd.m === 'cs') && <HandleDot x={segEnd.x} y={segEnd.y} hx={segEnd.hix} hy={segEnd.hiy} u={u} label="Curve handle at the end of the segment" onDown={e => onHandleDown(e, (selPoint + 1) % built.length, 'hi')} />}
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
        {hover.kind === 'edge' && (() => {
          const a = pts[hover.e], b = pts[(hover.e + 1) % pts.length]
          return a && b ? <path d={segmentPath(a, b)} className="cmSeg cmSeg--hover" data-hover-segment={hover.e} /> : null
        })()}
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
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { setHover(null); setBrush(null); if (p.pointerRef) p.pointerRef.current = null }} onContextMenu={e => e.preventDefault()} onKeyDown={onKey}
      onDoubleClick={onDouble}
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
      {symMarkup}
    </svg>
  )
}

// The path of one segment, from a built point to the next: straight, or the curve their handles make.
function segmentPath(a: BuiltPoint, b: BuiltPoint): string {
  const out = a.m === 'c' || a.m === 'sc', inn = b.m === 'c' || b.m === 'cs'
  if (!out && !inn) return `M${a.x} ${a.y}L${b.x} ${b.y}`
  return `M${a.x} ${a.y}C${out ? a.hox : a.x} ${out ? a.hoy : a.y} ${inn ? b.hix : b.x} ${inn ? b.hiy : b.y} ${b.x} ${b.y}`
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
