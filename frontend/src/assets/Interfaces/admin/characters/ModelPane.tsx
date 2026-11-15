import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ModelContent, ModelEntry, ModelLayer, ModelPoint, ModelShape } from '../../../../api/types'
import {
  BrushIcon, CopyIcon, CursorIcon, ExportIcon, EyeOffIcon, GridSnapIcon, HandIcon, HighlighterIcon, HistoryIcon, PathIcon, PlusIcon, RestoreIcon, RulerIcon, SwapIcon, TrashIcon, UndoIcon, WeightIcon,
} from '../../../icons'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { useStoredState } from '../../writer/storage'
import { NodeBar } from './NodeBar'
import { TreeBar, type ModelsNav, type TreeActions } from './TreeBar'
import type { ClassActions } from './ClassPanel'
import { ColourTab, type ColourActions } from './ColourTab'
import { CheckPanel } from './CheckPanel'
import { useDesignerPolicy } from './designerPolicy'
import { DesignerCanvas, type FrameCanvas, type GripMark, type LineGrab, type LineHandles, type LockTool, type PivotMarker, type PoseCanvas, type PoseGrab, type ThroughFrame } from './DesignerCanvas'
import { ConsoleBar, PANEL_REST, ToolbarPanel, ViewBar, type PanelState } from './DesignerShell'
import { DEFAULT_LAYERS, SHAPE_LAYERS, drawOrder, normalizeLayers, type LayerState } from './layerStack'
import { advanceLock, lockStage } from './engine/crossings'
import { FormsTab, type FormActions } from './FormsTab'
import { FramesTab, type FramesState } from './FramesTab'
import { ADVANCED_TABS, Inspector, type InspectorTab } from './Inspector'
import { StatusBadge, modelLabel } from './StatusBadge'
import type { PaintActions } from './PaintSection'
import { PoseBar } from './PoseBar'
import { SkinPanel } from './SkinPanel'
import { TaperPanel } from './TaperPanel'
import { ProportionsTab } from './ProportionsTab'
import { PresetsTab, type PresetActions } from './PresetsTab'
import { PreviewStrip } from './PreviewStrip'
import { FieldsTab, type FieldActions } from './FieldsTab'
import { RangesTab } from './RangesTab'
import { RigTab } from './RigTab'
import { TemplateMenu } from './TemplateMenu'
import { NONE, contextObject, contextObjectOf, repair, rightClickGrid, rightClickShape, shapesOf, showFor, type PartKind, type RightTarget, type Selection } from './designerState'
import {
  NEUTRAL_GRAY, addColour, addGenre, addSlot, addStandardSlots, addSwatch, removeColour, removeGenre, removeSlot, removeSwatch, renameColour, renameGenre, renameSlot, setColourHex,
  setStarterPalette, setSwatch, stepSlot, toggleColourGenre,
} from './engine/colour'
import { addBone, boneById, removeBone, renameBone, setBoneEnd, setBoneStart, setHeadBone } from './engine/bones'
import { setFit as setObjectFit, stretchTargets } from './engine/fitEdit'
import { toggleUnder } from './engine/wear'
import { stepDrape } from './engine/drapeEdit'
import { addFrame, framesOf, frameById, hiddenThrough, movedBox, removeFrame, renameFrame, resizedBox, setFrameBox, setTile, tileOf, toggleFrameHide, viewBoxOf } from './engine/frames'
import { addMember, deleteClass, detachBeforeRemoval, detachMember, followTemplate, makeClass, moveObjectToGroup, reconcileClasses, renameClass, setExclusive, setShapeHide } from './engine/classEdit'
import { cycleMode, deletePoint, joinSegment, movePoint, moveShape, newShape, setMode, toggleSegment } from './engine/edit'
import { bridgeBetween, setLeaves, spotFromClick, type EdgeSpot } from './engine/bridgeEdit'
import { fadedBy as _fadedBy, setFade, stepFade } from './engine/fadeEdit'
import { cycleWeight, stepWeight } from './engine/fall'
import { SIDE_NAMES, addFall, addFallToObject, withWeight } from './engine/fallEdit'
import { alignSkins, weightsOf } from './engine/skin'
import { angleOf, fromBehind, type View } from './engine/angles'
import { shifted } from './engine/turn'
import { alignTurns, clearPointDepths, clearThick, setAngleOutline, setFormAngleOutline, setWrap, stepPointDepth, stepShapeDepth, stepThick } from './engine/turnEdit'
import { ObjectTurnSection, ShapeTurnSection, type TurnActions, type TurnWhere } from './TurnSection'
import { autoSkin, bendSlider, clearSkin, copySkin, defaultPartner, mirrorSkin, paintSkin, partnersOf, skinBlocked, smoothSkin, stepPointSkin } from './engine/skinEdit'
import { addAxis, addForm, hideInForm, moveAxis, moveForm, overrideState, removeAxis, removeForm, renameAxis, renameForm, setAxisCarry, setAxisRoll, setInitialForm, toggleAxisGenre, setLook, setOverride, useBaseOutline } from './engine/formEdit'
import { classKey, presetsOf, targetForShape } from './engine/forms'
import { IDENTITY, apply, build, flatten, inverse, mul, pathText, type Box } from './engine/geometry'
import { TAPER_DEFAULT, taperOutline, type SpinePoint, type TaperSpec } from './engine/taper'
import { addFinger, addGrip, addHand, addHandPoses, addThumb, apartHand, gripAt, gripGrab, gripsOf, mirrorGrip, moveGrip, removeGrip, renameGrip, setPresetGrip, stepGripAngle } from './engine/hands'
import { growthRefusal, writerFaults } from './engine/writerLimits'
import { emptyHistory, redo as redoHistory, remember, undo as undoHistory, type History } from './engine/history'
import { beginScale, beginTurn, canScale, canTurn, grabPoint, moveScale, moveTurn, poseTarget, reach, reachJoints, scaleDriver, slideValue, toModel, type ReachGrab, type ScaleDrag, type TurnDrag } from './engine/pose'
import { setObjectLock, setStyleLock, type LockPart } from './engine/locks'
import { shapesInOrder } from './engine/order'
import { addOption, addState, applyOption, removeOption, removeState, renameOption, renameState, updateOption } from './engine/states'
import { addField, addFieldset, removeField, removeFieldset, renameFieldset, setFieldProp } from './engine/fields'
import { deletePreset, duplicatePreset, renamePreset, savePreset, saveStyle, updatePreset } from './engine/presets'
import { chainOf, isPointDriven, restPivot, solve, valueOf, type Solved, type Values } from './engine/rig'
import * as paintOps from './engine/paintEdit'
import * as patternOps from './engine/patterns'
import { addShading } from './engine/shadeEdit'
import { apartSlider, joinSides, oneSideEach, poseSides } from './engine/sidesEdit'
import {
  addBend, addDepth, addLength, addRange, addScale, addSpin, addTurn, attachFromClick, attachGroup, clearLimit, clearPointMoves, detachGroup, groupOfShape, newRange, recordPoints, removeDrive, removeRange, renameRange, reparent,
  setAxis, setDriveAxis, setDriveBone, setPivot, setShow, stepGroupDepth, stepBendEdge, stepBound, stepDrive, stepLimit, type Edit,
} from './engine/rigEdit'
import { LIMITS } from './engine/limits'
import { axisOf, mirrorLineMat, mirrorPoints, mirroredTurn, usesMirrorLine } from './engine/mirrorLine'
import { keepCarried, makeMirror, mirrorLineOptions, originalPoint, originalSegment, reconcileMirrors, setMirrorLine } from './engine/mirrors'
import { normTurn, rotOf } from './engine/transform'
import { applyOnCanvas, lineOf, sharedLine, stretchMat, widenMat, widthHandle } from './engine/lines'
import { cloneEdit, clonePlace, detachClone, makeClone, reconcileClones, setCloneAt } from './engine/clones'
import { cloneTurn } from './engine/cloneAt'
import type { CloneActions, MirrorActions } from './ShapePanels'
import { addZone, ensureZones, moveGroupTo, moveObjectTo, moveShapeTo, moveZone, needsZones, newGroupIn, removeZone, renameZone, topZone, zoneById, zonesOf } from './engine/zones'
import type { ArrangeActions, ConnectionActions, JointActions, SymmetryActions } from './ShapePanels'
import { jointAt, migrateJoints, needsJoints, poseOf, setJointSetting, toggleJoint } from './engine/pivots'
import { addFreeAnchor, addFreePosable, anchorOn, anchorsOf, guardAnchors, marksOf, posableOn, toggleAnchor, togglePosable } from './engine/anchors'
import { isSlider, makeSlider, nearestPlace, placeAt, setStop, stopSlider } from './engine/sliders'
import { drawnOf } from './engine/connect'
import { beginPose, beginReach, beginSlide, isPosed, movePose, resetPose, type PoseDrag as ShapePoseDrag } from './engine/posing'
import { disableSymmetry, enableSymmetry, followSymmetry, restoreLinePoint } from './engine/symmetry'
import type { ConnectTool, RemoveTarget, RightSpot } from './DesignerCanvas'
import { PointForm } from './PointForm'
import * as clipboard from './shapeClipboard'
import { FIRST_CHOICE, ShapeForm, templateOfChoice, type FormKind, type ShapeChoice } from './ShapeForm'
import { CAST_OPACITY, KIND_NAMES } from './engine/kinds'
import { castOverlaps, hasBothCasts } from './engine/castOverlap'
import { alignConnected, alignSet } from './engine/align'
import { addPointShared, connect, connectedSet, copyShareAt, disconnect, linkShown, loosen, nameConnection, rebindByPlace, segmentHome } from './engine/connect'
import { templateBox, templateById } from './engine/templates'
import { breakPair, clearLinksTo, linkToEdge, linkToPoint, makeTwin, moveInOrder, setBack, setLoose, stepLink, unlinkPoint } from './engine/pairEdit'
import type { DrapeActions, FitActions, FrameActions, HandActions, LinkHow, NewSliderKind, PairActions, ProportionActions, Recording, RigActions, ViewName, WearActions } from './rigActions'
import { groupOfSelection, offRest, scrubValue, valueText } from './rigView'
import {
  FALL_SIDES, NAME_MAX, addGroup, addObject, addShape, duplicateShape, freshId, groupOfObject, moveBefore, moveObjectWithin, moveShapeWithin, newGroup, objectById, objectOfShape, publishFaults, removeGroup, removeObject, stepShape,
  outlineSize, removeShape, renameGroup, renameObject, renameShape, shapeById, twinsOf, updateShape, groupById, type MakeId,
} from './modelContent'
import type { CharacterModels } from './useCharacterModels'
import { useTestState } from './useTestState'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
const SCRUB_MS = 3000
const SCRUB_TICK = 40

// The versions of a model: the one published now, and the ten before it, each of which can be brought back into the draft.
function VersionsMenu({ entry, onBring }: { entry: ModelEntry; onBring: (version: number) => void }) {
  const versions = [...(entry.published ? [entry.published] : []), ...entry.history]
  return (
    <div className="cmMenu" role="group" aria-label={`Versions of ${modelLabel(entry)}`}>
      {versions.length === 0 && <p className="cmInsText">Nothing has been published yet.</p>}
      {versions.map(v => {
        const current = entry.published?.version === v.version
        return (
          <div className="cmMenuItem" key={v.version}>
            <span>v{v.version} · {when(v.publishedAt)}<small>{current ? 'Published now' : `${v.content.shapes.length} shapes`}</small></span>
            {current ? <span className="cmBadge">Current</span> : <button type="button" className="cmBtn cmBtn--small" onClick={() => onBring(v.version)}>Bring into draft</button>}
          </div>
        )
      })}
    </div>
  )
}

interface RecordingState extends Recording { draft: ModelShape }

// A drag in Pose mode: what was grabbed, the solved figure it began on (its pivots and whole-model transform stay put while it lasts) and the slider values
// to go back to if Escape is pressed.
type PoseDrag = { solved: Solved; start: Values; group: string } & (
  | { kind: 'turn'; turn: TurnDrag }
  | { kind: 'scale'; scale: ScaleDrag }
  | { kind: 'slide' }
  | { kind: 'reach'; grab: ReachGrab; current: Values }
)
const POSE_HINT = 'Pose mode: drag a part to turn it, a square to scale its group, a circle to slide its anchor. Hold Alt, or press Reach, and drag a hand or foot to bend the limb; drag a grip point to reach with it.'

// The open model. The canvas fills the whole console, and four toolbars lie over its edges: the tree (left), the editor (right), the view controls (the footer) and the
// console tools (undo, redo, save, publish: in the console's header, or at the top where the console has no header of its own). The undo stack lives here (it starts empty
// when another model is opened: the page keys this component on the model's id), and so do the test values of the sliders (what the Try it sliders are set to: for looking,
// never saved). The two side toolbars can be dragged wider or narrower and folded away, and the layers of the canvas (gridlines, guides, outlines, points...) are toggled and
// ordered in the view toolbar; where these are is remembered on this computer.
const PANELS_START: { left: PanelState; right: PanelState } = { left: { open: true, w: 300 }, right: { open: true, w: 360 } }
const PANEL_LIMITS = { left: { min: 220, max: 480 }, right: { min: 280, max: 600 } }
const VIEW_BAR = 44
// below this many pixels across, the console has room for one side toolbar at a time
const NARROW = 640
const DRAWER = 240

// The middle of the model's space down (it runs from 0 to 400): where Align down puts a shape's middle (shape editor S4).
const MODEL_MIDDLE_Y = 200

export function ModelPane({ entry, models, makeId, onRemove, onDuplicate, onExport, barHost = null, nav, onAdvanced }: {
  entry: ModelEntry
  models: CharacterModels
  makeId: MakeId
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onExport: (entry: ModelEntry) => void
  // The element the console toolbar goes into (the console's header); missing: it is drawn at the top of the pane.
  barHost?: HTMLElement | null
  // The models as cards, for the top of the tree.
  nav: ModelsNav
  // Turns the advanced tools on or off (a writer's designer: the console keeps the choice and tells the pane through the policy).
  onAdvanced?: () => void
}) {
  const content = entry.draft
  const [sel, setSel] = useState<Selection>(NONE)
  // what of the selected shape is selected: the shape, a point or a segment (`selPoint` says which point or segment)
  const [part, setPart] = useState<PartKind>('shape')
  const [selPoint, setSelPoint] = useState(0)
  const [mirror, setMirror] = useState(true)
  const [snap, setSnap] = useState(true)
  // Shapes (moved whole), pivots and frames land on the lines of the grid while they are dragged.
  const [gridSnap, setGridSnap] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fitAll, setFitAll] = useState(false)
  // Fit asks the canvas for a new fit (and a view in the middle of it); `viewMoved` is whether the view has been panned or zoomed since.
  const [viewNonce, setViewNonce] = useState(0)
  const [viewMoved, setViewMoved] = useState(false)
  // The layers of the canvas (which are shown and in what order) and the two side panels (open, and how wide) are kept on this computer, with the other settings; the
  // previews and checks drawer is open or not.
  const [layersRaw, setLayersRaw] = useStoredState<LayerState>('scriblr.designer.layers', DEFAULT_LAYERS)
  const layerState = useMemo(() => normalizeLayers(layersRaw), [layersRaw])
  const [panelsRaw, setPanelsRaw] = useStoredState<{ left: PanelState; right: PanelState }>('scriblr.designer.panels', PANELS_START)
  const panels = {
    left: { ...PANELS_START.left, ...panelsRaw.left, w: Math.min(PANEL_LIMITS.left.max, Math.max(PANEL_LIMITS.left.min, Number(panelsRaw.left?.w) || PANELS_START.left.w)) },
    right: { ...PANELS_START.right, ...panelsRaw.right, w: Math.min(PANEL_LIMITS.right.max, Math.max(PANEL_LIMITS.right.min, Number(panelsRaw.right?.w) || PANELS_START.right.w)) },
  }
  // the width of a panel while it is being dragged, before it settles
  const [dragW, setDragW] = useState<{ side: 'left' | 'right'; w: number } | null>(null)
  // The panels never take more than 46% of the console each, so a narrow console still has some canvas between them.
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageW, setStageW] = useState(0)
  const narrowRef = useRef(false)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStageW(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  // In a console too narrow for both, the tree has the room and the editor is a rail until the tree is folded (opening the editor then folds the tree).
  const narrow = stageW > 0 && stageW < NARROW
  narrowRef.current = narrow
  const panelNow = (side: 'left' | 'right'): PanelState => {
    const w = dragW && dragW.side === side ? dragW.w : panels[side].w
    const open = panels[side].open && !(narrow && side === 'right' && panels.left.open)
    return { open, w: stageW > 0 ? Math.min(w, Math.floor(stageW * (narrow ? 0.7 : 0.46))) : w }
  }
  const setPanel = (side: 'left' | 'right', change: Partial<PanelState>) => setPanelsRaw(prev => {
    const other = side === 'left' ? 'right' : 'left'
    const next = { ...PANELS_START, ...prev, [side]: { ...PANELS_START[side], ...prev[side], ...change } }
    // where only one fits, opening a toolbar folds the other
    if (change.open && narrowRef.current) next[other] = { ...PANELS_START[other], ...prev[other], open: false }
    return next
  })
  const [drawer, setDrawer] = useState(false)
  const { ui } = useSettings()
  // what the designer is for: the admin's own limits and every tab, or the writer's limits and the tabs the writer has turned on
  const policy = useDesignerPolicy()
  // the shape editor (designerFeatures.ts): one Shape tab and the shape tools; mirror editing (about x = 100) is off there
  const shapesOnly = policy.shapes
  const [history, setHistory] = useState<History<ModelContent>>(emptyHistory)
  const [versions, setVersions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmUpdate, setConfirmUpdate] = useState(false)
  const [note, setNote] = useState('')
  const [tabRaw, setTab] = useState<InspectorTab>('shape')
  // a tab the writer has put away with the advanced tools is not the open one, whatever was open before
  const tab: InspectorTab = shapesOnly || (!policy.advanced && ADVANCED_TABS.includes(tabRaw)) ? 'shape' : tabRaw
  const test = useTestState()
  const { values, setValues } = test
  const [recording, setRecording] = useState<RecordingState | null>(null)
  const [pickOn, setPickOn] = useState(false)
  // picking a shape on the canvas to clip the selected shape to, or to let cut a hole in it
  const [paintPick, setPaintPick] = useState<'clip' | 'cut' | null>(null)
  // the angle the figure is seen from (phase A3: any angle; 'front' and 'back' are 0 and 180)
  const [view, setView] = useState<View>('front')
  // the shape editor's Keep proportions (S4): every resize keeps the shape's proportions
  const [keepRatio, setKeepRatio] = useState(false)
  // the shape editor's symmetry being chosen for a shape (S6): its axes, until the side to copy is clicked on the canvas
  const [symChoose, setSymChoose] = useState<{ id: string; a: number; n: number } | null>(null)
  // the shape editor's new-shape form (shape types T1): where it was opened (in the stage, and in canvas space) and the object it adds to, and what it made last
  const [shapeForm, setShapeForm] = useState<{ left: number; top: number; x: number; y: number; objectId: string | null } | null>(null)
  const [formChoice, setFormChoice] = useState<ShapeChoice>(FIRST_CHOICE)
  const worldRef = useRef<((clientX: number, clientY: number) => [number, number]) | null>(null)
  const closeShapeForm = useCallback(() => setShapeForm(null), [])
  // the point form (T2): the point it was opened for and where; and the last place the pointer was over the canvas (a paste goes there)
  // i is -1 for a form opened inside a shape (shape types T4), with `inside` the spot in the shape's own space
  const [pointForm, setPointForm] = useState<{ id: string; i: number; left: number; top: number; inside?: [number, number] } | null>(null)
  // a drag in the shape editor's Pose mode (T4): what it does, the content when it began, and whether it has changed anything yet (its undo step is made then)
  const shapePoseRef = useRef<{ drag: ShapePoseDrag; start: ModelContent; changed: boolean } | null>(null)
  const closePointForm = useCallback(() => setPointForm(null), [])
  const pointerRef = useRef<[number, number] | null>(null)
  const turnAngle = angleOf(view)
  // the side a panel that knows only the front and the back speaks of: the back once more of the back is seen than of the front
  const side: ViewName = fromBehind(view) ? 'back' : 'front'
  const [linkMode, setLinkMode] = useState<LinkHow | null>(null)
  const [rangeFilter, setRangeFilter] = useState<'selection' | 'all'>('selection')
  const [scrubbing, setScrubbing] = useState<string | null>(null)
  const [poseMode, setPoseMode] = useState(false)
  const [reachOn, setReachOn] = useState(false)
  const [poseStatus, setPoseStatus] = useState(POSE_HINT)
  const [poseActive, setPoseActive] = useState<string | null>(null)
  // proportions and frames (phase 5a): the bone whose end is being picked on the canvas, picking the shape an object stretches to, the frame being edited on the
  // canvas, the frame the canvas looks through, and the test card colour (never saved unless it is kept as the starter colour)
  const [bonePick, setBonePick] = useState<string | null>(null)
  const [fitPick, setFitPick] = useState(false)
  // bridges, creases and fall (phase 5b): the spots of a bridge picked so far on the canvas (null: not making one), and the Weights tool (a click on a point steps its weight)
  const [bridgeSpots, setBridgeSpots] = useState<EdgeSpot[] | null>(null)
  const [weighing, setWeighing] = useState(false)
  // the Skin tool (phase O1): on or off, the group the selected shape's weights are painted for (null: the tool's choice), how strongly and how widely a drag paints, and
  // picking the shape to copy weights from
  const [skinning, setSkinning] = useState(false)
  const [skinGroup, setSkinGroup] = useState<string | null>(null)
  const [skinStrength, setSkinStrength] = useState(1)
  const [skinRadius, setSkinRadius] = useState(10)
  const [skinPick, setSkinPick] = useState(false)
  // the taper tool (phase O3): the line being laid on the canvas (in the canvas's space) and the ribbon's widths
  const [tapering, setTapering] = useState(false)
  const [taperSpine, setTaperSpine] = useState<SpinePoint[]>([])
  const [taperSpec, setTaperSpec] = useState<TaperSpec>(TAPER_DEFAULT)
  const [frameSel, setFrameSel] = useState<string | null>(null)
  const [throughId, setThroughId] = useState<string | null>(null)
  const [tileTest, setTileTest] = useState<string | null>(null)
  const poseRef = useRef<PoseDrag | null>(null)
  const historyRef = useRef(history)
  historyRef.current = history
  // what stops Publish (each count is a pass over the whole model, so it is worked out again only when the model or the limits change)
  const faults = useMemo(() => [...publishFaults(content), ...(policy.writer ? writerFaults(content, policy.writer) : [])], [content, policy.writer])
  const busy = models.busy
  const published = !!entry.published
  const empty = content.shapes.length === 0

  useEffect(() => { setSel(s => repair(content, s)) }, [content])
  // the shape editor's tree has zones (Z2): a model without them gets the five starter zones, its groups in Torso; a group in no zone goes to the top zone (no undo step)
  useEffect(() => {
    if (shapesOnly && needsZones(content)) models.edit(entry.id, c => (needsZones(c) ? ensureZones(c, makeId) : c), false)
    // a model made with pivot circles gets pivot points instead (joints J2), once
    if (shapesOnly && needsJoints(content)) models.edit(entry.id, c => (needsJoints(c) ? migrateJoints(c, solve(c)) : c), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapesOnly, content, entry.id])

  // while a shape is recorded the canvas shows the copy being dragged, with every slider at rest
  const shown = useMemo(() => (recording ? updateShape(content, recording.shapeId, () => recording.draft) : content), [content, recording])
  // the selected object is drawn whatever its class says (a pattern, or a member of a family that is not the one chosen), so it can be looked at and edited
  const show = useMemo(() => showFor(content, sel), [content, sel])
  // looking through a frame leaves out what the frame leaves out
  const through = frameById(content, throughId)
  const solved = useMemo(() => solve(shown, recording ? {} : values, view, recording ? {} : { forms: test.forms, hidden: hiddenThrough(through, test.hidden), show, fall: test.fall, order: test.order, edit: true }), [shown, values, recording, view, test.forms, test.hidden, test.fall, test.order, show, through])
  // what the canvas edits: a shape seen at a key spot shows (and is edited as) its outline there, drawn through where that outline is drawn (phase A3)
  const canvasSolved = useMemo(() => {
    if (!Object.values(solved.shapes).some(s => s.angle)) return solved
    const shapes = { ...solved.shapes }
    for (const [id, s] of Object.entries(shapes)) if (s.angle) shapes[id] = { ...s, local: s.angle.local, matrix: s.angle.matrix }
    return { ...solved, shapes }
  }, [solved])
  // Where a shape is seen from now: the front or the back as they were drawn before angles (an edit goes to its outline or its back outline), a key spot (an edit draws
  // its outline there), or between key spots (it cannot be edited there).
  function whereOf(id: string): TurnWhere {
    const s = solved.shapes[id]
    if (s?.angle) return 'key'
    if (!s?.seenAt) return turnAngle === 180 ? 'back' : turnAngle === 0 ? 'front' : 'between'
    const [y, p] = s.seenAt
    return p !== 0 ? 'between' : y === 0 ? 'front' : y === 180 ? 'back' : 'between'
  }
  // An edit of a shape seen at a key spot: the outline drawn there, kept without what its links and sliders move it by (to the form being edited when one is chosen).
  function keyEdit(c: ModelContent, id: string, pts: ModelPoint[]): Edit {
    const spot = solved.shapes[id]?.angle
    if (!spot) return { ok: false, reason: 'Turn to a key angle to draw the shape there.' }
    if (pts.length !== spot.local.length) return { ok: false, reason: 'Add or delete points in the front view: an outline drawn at an angle keeps the points of the front one.' }
    const stored = shifted(pts, spot.shift, true)
    const t = formTargetIn(c, id)
    return t ? setFormAngleOutline(c, t.object.id, t.axis.id, t.form.id, id, spot.at, spot.tilt, stored) : setAngleOutline(c, id, spot.at, spot.tilt, stored)
  }
  const group = groupOfSelection(content, sel)
  const valuesRef = useRef(values)
  valuesRef.current = values
  const away = offRest(content, values)
  const awayAll = test.away(content)
  const hiddenSet = useMemo(() => new Set(test.hidden), [test.hidden])
  const lockSet = useMemo(() => new Set(test.locks), [test.locks])
  // the colours of the test character: its own palette once edited, else the model's; no choice for a slot is gray
  const colouringOf = test.colouring
  const colouring = useMemo(() => colouringOf(content), [colouringOf, content])
  const testPalette = colouring.palette
  const selShape = sel.kind === 'shape' ? shapeById(content, sel.id) : undefined
  const pointDriven = !!selShape && !recording && isPointDriven(content, values, selShape.id)
  // the form the selected shape's outline is drawn from (or would be edited into): the canvas edits that form's outline, not the base one
  const formTarget = selShape && !selShape.mirrorOf && !recording ? formTargetIn(content, selShape.id) : null
  const hiddenByForm = !!formTarget && overrideState(formTarget.form, formTarget.shapeId) === 'hidden'
  const switchedOff = !!selShape && !!solved.shapes[selShape.id]?.off
  const selWhere: TurnWhere = selShape ? whereOf(selShape.id) : 'front'
  // a mirror drawn across a line (Z3) is edited as it is drawn: what is done to it is done to its original, across the line
  const mirrorOriginal = selShape?.mirrorOf ? shapeById(content, selShape.mirrorOf) : undefined
  const editableMirror = shapesOnly && !!selShape && !!mirrorOriginal && !mirrorOriginal.mirrorOf && usesMirrorLine(content, selShape)
  // a clone (Z4) is edited as it is drawn too: a move, turn or flip places it, any other change goes to its original (so every clone changes)
  const cloneOriginal = selShape?.cloneOf ? shapeById(content, selShape.cloneOf) : undefined
  const editableClone = shapesOnly && !!selShape && !!cloneOriginal && !cloneOriginal.cloneOf && !cloneOriginal.mirrorOf && !selShape.mirrorOf
  const editable = !!selShape && !pointDriven && (!selShape.mirrorOf || editableMirror) && (!selShape.cloneOf || editableClone) && !hiddenByForm && !switchedOff && !selShape.hide && selWhere !== 'between'
  // What the canvas draws and edits for the selected shape: the points as the rig puts them (links resolved), in the view being edited. A twin is shown the same
  // way, but not edited.
  // (the panel's copy: an editable mirror is shown with its outline as drawn and its frame turned across the line, still a mirror)
  const panelContent = useMemo(() => {
    const r = selShape ? canvasSolved.shapes[selShape.id] : undefined
    if (!selShape || !r || r.local.length < 3) return shown
    if (editableMirror && mirrorOriginal) {
      const R = mirrorLineMat(content, selShape.mirrorLine, sid => canvasSolved.shapes[sid]?.frame, [mirrorOriginal.id, selShape.id])
      return updateShape(shown, selShape.id, sh => ({ ...sh, pts: r.local, rot: mirroredTurn(R, rotOf(mirrorOriginal)) }))
    }
    if (editableClone && cloneOriginal) {
      // a clone's frame is its original's turned by the clone's place
      const place = clonePlace(content, selShape, sid => canvasSolved.shapes[sid]?.local)
      return updateShape(shown, selShape.id, sh => ({ ...sh, pts: r.local, rot: place ? cloneTurn(place.at, rotOf(cloneOriginal)) : rotOf(sh) }))
    }
    return updateShape(shown, selShape.id, sh => ({ ...sh, pts: r.local }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, canvasSolved, selShape, editableMirror, mirrorOriginal, editableClone, cloneOriginal])
  // an editable mirror or clone is handed to the canvas as a shape of its own; its edits come back to toOriginal or toClone
  const canvasContent = useMemo(
    () => ((editableMirror || editableClone) && selShape ? updateShape(panelContent, selShape.id, sh => ({ ...sh, mirrorOf: null, cloneOf: null })) : panelContent),
    [panelContent, editableMirror, editableClone, selShape],
  )

  // An edit made on a mirror (Z3), given to its original: the outline carried back across the line (the mirror's turn the other way round). Null when the shape is not an
  // editable mirror; 'same' when the canvas handed back the mirror unchanged.
  function toOriginal(id: string, next: ModelShape): { id: string; next: ModelShape } | 'same' | null {
    if (!shapesOnly) return null
    const tw = shapeById(content, id), orig = tw?.mirrorOf ? shapeById(content, tw.mirrorOf) : undefined
    if (!tw || !orig || orig.mirrorOf || !usesMirrorLine(content, tw)) return null
    const rt = canvasSolved.shapes[id], ro = canvasSolved.shapes[orig.id]
    if (!rt || !ro) return null
    const unchanged = JSON.stringify(next.pts) === JSON.stringify(rt.local)
    // a change of the mirror's own settings (from its panel) is the mirror's; the canvas's copy of it unchanged is nothing
    if (unchanged) return next.mirrorOf ? null : 'same'
    const R = mirrorLineMat(content, tw.mirrorLine, sid => canvasSolved.shapes[sid]?.frame, [orig.id, id])
    const T = mul(inverse(ro.frame), mul(R, rt.frame))
    const turned = rotOf(next) - mirroredTurn(R, rotOf(orig))
    return { id: orig.id, next: { ...orig, pts: keepCarried(orig.pts, mirrorPoints(next.pts, T)), rot: normTurn(rotOf(orig) - turned) } }
  }

  // An edit made on a clone (Z4): a move, turn or flip places the clone (or its clone object); any other change of its outline goes to its original, kept where it is, so
  // every clone changes. 'own' is a change of the clone's own settings (from its panel); 'same' the canvas's copy handed back unchanged; null not an editable clone.
  type CloneRoute = { kind: 'place'; edit: (c: ModelContent) => ModelContent } | { kind: 'outline'; id: string; next: ModelShape } | { kind: 'own'; next: ModelShape }
  function toClone(id: string, next: ModelShape): CloneRoute | 'same' | null {
    if (!shapesOnly) return null
    const cl = shapeById(content, id), orig = cl?.cloneOf ? shapeById(content, cl.cloneOf) : undefined
    if (!cl || !orig || orig.cloneOf || orig.mirrorOf || cl.mirrorOf) return null
    const r = canvasSolved.shapes[id]
    if (!r) return null
    if (JSON.stringify(next.pts) === JSON.stringify(r.local)) return next.cloneOf ? { kind: 'own', next: { ...next, pts: cl.pts, rot: cl.rot, cloneAt: cl.cloneAt } } : 'same'
    const e = cloneEdit(content, cl, r.local, next.pts, sid => canvasSolved.shapes[sid]?.local)
    if (!e) return null
    if (e.kind === 'place') return { kind: 'place', edit: c => setCloneAt(c, e.owner, e.id, e.at) }
    return { kind: 'outline', id: e.id, next: { ...orig, pts: e.pts } }
  }

  // The form an edit of this shape's points goes to, if a chosen form gives the shape its outline (see forms.targetForShape).
  function formTargetIn(c: ModelContent, shapeId: string) {
    const sh = shapeById(c, shapeId), o = objectOfShape(c, shapeId)
    if (!sh || !o || sh.mirrorOf) return null
    const t = targetForShape(o, shapeId, test.forms)
    return t ? { object: o, axis: t.axis, form: t.form, shapeId } : null
  }

  // ---- applying changes ----

  // Lights and shadows may not overlap (shape types T1): a change that makes a light and a shadow overlap that did not overlap before is refused, and the note says which.
  function castRefusal(before: ModelContent, after: ModelContent): string | null {
    if (!shapesOnly || !hasBothCasts(after)) return null
    const had = new Set(hasBothCasts(before) ? castOverlaps(before, solve(before)).map(p => p.join(' ')) : [])
    const now = castOverlaps(after, solve(after)).find(p => !had.has(p.join(' ')))
    if (!now) return null
    const name = (id: string) => shapeById(after, id)?.name.trim() || 'a shape'
    return `A light and a shadow may not overlap: ${name(now[0])} would overlap ${name(now[1])}.`
  }
  // A change that is one undo step of its own. In a writer's designer a change that makes a count grow past a limit the admin set is not made, and the note says so.
  function commit(next: ModelContent, immediate = false): boolean {
    // every member has a shape for each shape of its pattern: an edit that added or took away a pattern's shape reaches them here
    // skin weights stay with their points when points are added or taken away (phase O1)
    // depths and outlines at key angles stay with their points too (phase A3)
    // a mirrored object has a mirror of each shape of its original (Z3)
    // a clone object has a clone of each shape of its original (Z4)
    const synced = reconcileClones(reconcileMirrors(reconcileClasses(alignTurns(content, alignSkins(content, next)), makeId), makeId), makeId)
    const refused = policy.writer ? growthRefusal(content, synced, policy.writer) : null
    if (refused) { setNote(refused); return false }
    const cast = castRefusal(content, synced)
    if (cast) { setNote(cast); return false }
    setHistory(h => remember(h, content))
    models.edit(entry.id, () => synced, immediate)
    setNote('')
    return true
  }
  // Apply what a rig operation returns: the new content, or why it cannot.
  function applyEdit(e: Edit): boolean {
    if (!e.ok) { setNote(e.reason); return false }
    if (!commit(e.content, true)) return false
    if (e.note) setNote(e.note)
    return true
  }
  // A change in the middle of a drag: no undo step of its own (onGesture made it). The canvas hands back the shape as it is drawn: in the front view its
  // points go back into `pts`, in the back view into the outline of its own for the back.
  function live(id: string, next: ModelShape) {
    if (recording) { setRecording(r => (r ? { ...r, draft: next } : r)); return }
    const across = toOriginal(id, next)
    if (across === 'same') return
    if (across) { live(across.id, across.next); return }
    const cloned = toClone(id, next)
    if (cloned === 'same') return
    if (cloned?.kind === 'place') { const place = cloned.edit; models.edit(entry.id, c => place(c), false); return }
    if (cloned?.kind === 'outline') { live(cloned.id, cloned.next); return }
    if (cloned?.kind === 'own') { const own = cloned.next; models.edit(entry.id, c => updateShape(c, id, () => own), false); return }
    // an anchor stays put (shape types T4): a drag that would move it stops, one that turns or resizes its shape goes about it
    const anchored = shapesOnly ? shapeById(content, id) : undefined
    if (anchored && anchorsOf(anchored).length) {
      const followed = anchored.sym && next.sym ? followSymmetry(anchored, next).shape : next
      const g = guardAnchors(anchored, followed)
      if (!g.ok) { setNote(g.reason); return }
      models.edit(entry.id, c => updateShape(c, id, () => g.shape), false)
      return
    }
    // a drag that would push a light into a shadow stops where it was (shape types T1)
    if (shapesOnly && hasBothCasts(content)) {
      const before = shapeById(content, id), followed = before?.sym && next.sym ? followSymmetry(before, next).shape : next
      const cast = castRefusal(content, updateShape(content, id, () => followed))
      if (cast) { setNote(cast); return }
    }
    models.edit(entry.id, c => {
      const where = whereOf(id)
      if (where === 'between') return c
      if (where === 'key') { const e = keyEdit(c, id, next.pts); return e.ok ? e.content : c }
      if (where === 'back') return updateShape(c, id, sh => ({ ...next, pts: sh.pts, back: next.pts }))
      const t = formTargetIn(c, id)
      if (!t) {
        // a symmetric shape's copies follow what a drag does to any of them (shape editor S6)
        const before = shapeById(c, id), followed = before?.sym && next.sym ? followSymmetry(before, next).shape : next
        return updateShape(c, id, () => followed)
      }
      const e = setOverride(c, t.object.id, t.axis.id, t.form.id, id, next.pts)
      return e.ok ? e.content : c
    }, false)
  }
  // A drag in a shape's fill (joints J1): the shape moves, and every shape connected to it (links either way) moves with it by as much on the canvas. Nothing moves when
  // one of them is anchored.
  function moveBody(id: string, next: ModelShape) {
    const cur = shapeById(canvasContent, id), r = canvasSolved.shapes[id]
    const others = shapesOnly && !recording && cur && !cur.mirrorOf && !cur.cloneOf ? [...connectedSet(content, id)].filter(sid => sid !== id) : []
    if (!others.length || !cur || !r || !cur.pts.length || cur.pts.length !== next.pts.length) { live(id, next); return }
    // an anchored shape refuses the move itself; one connected to it holds the rest
    if (anchorsOf(cur).length) { live(id, next); return }
    const pinned = others.map(sid => shapeById(content, sid)).find(s => !!s && anchorsOf(s).length > 0)
    if (pinned) { setNote(`${pinned.name.trim() || 'A connected shape'} is anchored, and this shape is connected to it: it cannot be moved.`); return }
    const m = r.matrix, lx = next.pts[0].x - cur.pts[0].x, ly = next.pts[0].y - cur.pts[0].y
    const wx = m[0] * lx + m[2] * ly, wy = m[1] * lx + m[3] * ly
    if (Math.abs(wx) < 1e-9 && Math.abs(wy) < 1e-9) return
    live(id, next)
    for (const sid of others) {
      const s = shapeById(content, sid), rs = canvasSolved.shapes[sid]
      if (!s || !rs || !s.pts.length) continue
      const iv = inverse(rs.matrix)
      live(sid, moveShape(s, iv[0] * wx + iv[2] * wy, iv[1] * wx + iv[3] * wy))
    }
  }
  // `followed`: a symmetric shape's copies were already made to follow (a joined segment, T2)
  function editShape(id: string, next: ModelShape, point?: number, followed = false) {
    if (recording) {
      if (next.pts.length !== recording.draft.pts.length) { setNote('Adding or deleting points is not recorded: record the points that are there.'); return }
      setRecording({ ...recording, draft: next })
      if (point !== undefined) selectPoint(point)
      return
    }
    const across = toOriginal(id, next)
    if (across === 'same') return
    if (across) { editShape(across.id, across.next, undefined, followed); if (point !== undefined) selectPoint(point); return }
    const cloned = toClone(id, next)
    if (cloned === 'same') return
    if (cloned) {
      if (cloned.kind === 'place') commit(cloned.edit(content), true)
      else if (cloned.kind === 'own') commit(updateShape(content, id, () => cloned.next))
      else editShape(cloned.id, cloned.next, undefined, followed)
      if (point !== undefined) selectPoint(point)
      return
    }
    const old = shapeById(content, id)
    if (!old) return
    // an edit of a symmetric shape's points goes to its source, and the copies follow (shape editor S6)
    if (old.sym && next.sym && !followed) {
      const f = followSymmetry(old, next)
      if (f.refused) { setNote(f.refused); return }
      next = f.shape
    }
    // an anchor stays put, and the marks go with their points (shape types T4)
    if (shapesOnly) {
      const g = guardAnchors(old, next)
      if (!g.ok) { setNote(g.reason); return }
      next = g.shape
    }
    // a change of the shape's settings (view, opacity, template name) leaves its points as they are stored
    if (JSON.stringify(next.pts) === JSON.stringify(canvasSolved.shapes[id]?.local ?? old.pts)) {
      commit(updateShape(content, id, () => ({ ...next, pts: old.pts, turn: old.turn, back: old.back })))
      if (point !== undefined) selectPoint(point)
      return
    }
    const where = whereOf(id)
    if (where === 'between') { setNote('Seen between key angles: turn to a multiple of 15 degrees to draw the shape there, or go back to the front.'); return }
    if (where === 'key') {
      const e = keyEdit(content, id, next.pts)
      if (!e.ok) { setNote(e.reason); return }
      commit(updateShape(e.content, id, sh => ({ ...next, pts: sh.pts, turn: sh.turn, back: sh.back })))
      if (point !== undefined) selectPoint(point)
      return
    }
    if (where === 'back') {
      commit(updateShape(content, id, () => ({ ...next, pts: old.pts, back: next.pts })))
      if (point !== undefined) selectPoint(point)
      return
    }
    // a chosen form gives the shape its outline: the points go there, and the base outline (which anchors and links read) is left alone
    const t = formTargetIn(content, id)
    if (t) {
      const e = setOverride(content, t.object.id, t.axis.id, t.form.id, id, next.pts)
      if (!e.ok) { setNote(e.reason); return }
      commit(updateShape(e.content, id, sh => ({ ...next, pts: sh.pts })))
      if (point !== undefined) selectPoint(point)
      return
    }
    // points recorded or linked by number cannot survive a change in how many there are
    let base = content, cleared: string[] = [], cut: string[] = [], rebound = false
    if (outlineSize(content, old) !== next.pts.length) {
      const r = clearPointMoves(content, id)
      if (shapesOnly) {
        // the shape editor keeps connections to the same places (S5): a weld follows its point to its new number, and only one whose point went is cut
        const l = rebindByPlace(r.content, canvasSolved, updateShape(r.content, id, () => next), id)
        base = l.content; cleared = r.cleared; cut = l.cut; rebound = true
      } else {
        const l = clearLinksTo(r.content, id)
        base = l.content; cleared = r.cleared; cut = l.cut
      }
    }
    commit(rebound ? base : updateShape(base, id, () => next))
    if (cleared.length) setNote(`The recorded point moves of ${cleared.join(', ')} were cleared because the shape's points changed. Record them again.`)
    else if (cut.length) setNote(rebound ? `The connections of ${cut.join(', ')} to the point that was deleted were cut.` : `The links of ${cut.join(', ')} to this shape were cut because its points changed. Link them again.`)
    if (point !== undefined) selectPoint(point)
  }
  // The weight of a point of the selected shape (how free it is to hang), set through the canvas's own edit so a form or the back view gets it where it belongs.
  function setWeightAt(i: number, w: number) {
    const cs = selShape ? shapeById(canvasContent, selShape.id) : undefined
    if (!cs || !cs.pts[i]) return
    if (!editable) { setNote(pointDriven ? 'A slider changes this shape\'s points and is away from rest: set the sliders back to rest to change its weights.' : 'This shape is shown, not edited.'); return }
    editShape(cs.id, { ...cs, pts: cs.pts.map((p, k) => (k === i ? withWeight(p, w) : p)) }, i)
  }
  const weightAt = (i: number): number | undefined => (selShape ? shapeById(canvasContent, selShape.id)?.pts[i]?.w ?? undefined : undefined)
  const weights = weighing && selShape && editable ? { onCycle: (i: number) => setWeightAt(i, cycleWeight(weightAt(i))), onStep: (i: number, dir: -1 | 1) => setWeightAt(i, stepWeight(weightAt(i), dir)) } : null
  // The Skin tool: the weights of the selected shape for one group, painted on the canvas (they may be painted on a posed shape: the bend shows what they do).
  const skinBlock = skinning && selShape ? skinBlocked(content, selShape.id, view, !!formTarget) : null
  // how shapes turn (phase A3): the Turning section of the Shape tab
  const turnActions: TurnActions = {
    stepDepth: (id, dir, big) => applyEdit(stepShapeDepth(content, id, dir, big)),
    stepThick: (id, dir, big) => applyEdit(stepThick(content, id, dir, big)),
    clearThick: id => applyEdit(clearThick(content, id)),
    stepPointDepth: (id, i, dir, big) => applyEdit(stepPointDepth(content, id, i, dir, big)),
    clearPointDepths: id => applyEdit(clearPointDepths(content, id)),
    setWrap: (objectId, shapeId) => applyEdit(setWrap(content, objectId, shapeId)),
    dropKey: id => {
      const spot = solved.shapes[id]?.angle
      if (!spot) return
      const t = formTargetIn(content, id)
      applyEdit(t ? setFormAngleOutline(content, t.object.id, t.axis.id, t.form.id, id, spot.at, spot.tilt, null) : setAngleOutline(content, id, spot.at, spot.tilt, null))
    },
  }
  const skinPartners = skinning && selShape ? partnersOf(content, selShape.id) : []
  const skinWith = skinning && selShape ? (skinGroup && skinPartners.some(g => g.id === skinGroup) ? skinGroup : defaultPartner(content, selShape.id)) : null
  const skinWeights = selShape && skinWith ? weightsOf(selShape, skinWith) : []
  const skin = skinning && selShape && skinWith && !skinBlock && !recording ? {
    weights: skinWeights, radius: skinRadius,
    onStep: (i: number, dir: -1 | 1) => applyEdit(stepPointSkin(content, selShape.id, skinWith, i, dir)),
    onPaint: (points: number[]) => {
      const next = paintSkin(content, selShape.id, skinWith, points, skinStrength)
      if (next) models.edit(entry.id, () => next, false)
      else setNote('A shape may follow at most 3 groups besides its own: clear one of them first.')
    },
  } : null
  const bend = selShape && skinWith ? bendSlider(content, selShape.id, skinWith) : null
  function undo() {
    const r = undoHistory(history, content)
    if (!r) return
    setHistory(r.history)
    models.setDraft(entry.id, r.value)
    setSel(s => repair(r.value, s))
  }
  function redo() {
    const r = redoHistory(history, content)
    if (!r) return
    setHistory(r.history)
    models.setDraft(entry.id, r.value)
    setSel(s => repair(r.value, s))
  }
  function onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || recording) return
    // the shape editor's clipboard (T2): copy, cut and paste the selected shape
    if (shapesOnly && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase(), held = sel.kind === 'shape' ? shapeById(content, sel.id) : undefined
      if ((k === 'c' || k === 'x') && held && !held.mirrorOf) {
        e.preventDefault()
        // a clone (Z4) is copied as it is drawn, a shape of its own
        clipboard.copyShape(held.cloneOf ? { ...held, pts: (canvasSolved.shapes[held.id]?.rig ?? []).map(p => ({ ...p, bind: null })), cloneOf: null, cloneAt: null } : held)
        if (k === 'x') deleteSelection({ kind: 'shape', id: held.id })
        return
      }
      if (k === 'v' && clipboard.hasCopy()) { e.preventDefault(); pasteHere(); return }
    }
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
    else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
  }

  // A point or a segment of the selected shape chosen (on the canvas, or by its chip).
  function selectPoint(i: number) { setSelPoint(i); setPart('point') }
  function selectSegment(e: number) { setSelPoint(e); setPart('segment') }
  // A right-click that did not drag: on a point it changes the point's type, on a segment it makes the segment straight or curved (of the shape it is on, which is
  // selected with it), on a shape it selects the shape, on the grid it unselects everything.
  function onRightClick(t: RightTarget, at?: RightSpot) {
    if (recording) return
    // in the shape editor a right-click on the grid opens the new-shape form there (shape types T1)
    if (t.kind === 'grid' && shapesOnly && at) { openShapeForm(at.clientX, at.clientY); return }
    if (t.kind === 'grid') { setSel(rightClickGrid()); setPart('shape'); return }
    const other = !(sel.kind === 'shape' && sel.id === t.id)
    if (other) choose(rightClickShape(t.id))
    if (t.kind === 'shape') {
      // in the shape editor a right-click inside a shape (away from its points and segments) opens the point form there, to put an anchor inside it (T4)
      const s = shapeById(content, t.id), r = canvasSolved.shapes[t.id]
      if (shapesOnly && at && s && r && !s.mirrorOf) {
        const [x, y] = apply(inverse(r.matrix), at.x, at.y), box = stageRef.current?.getBoundingClientRect()
        setPointForm({ id: s.id, i: -1, inside: [x, y], left: at.clientX - (box?.left ?? 0), top: at.clientY - (box?.top ?? 0) })
      }
      setPart('shape')
      return
    }
    const s = shapeById(content, t.id)
    // the shape the click is on can be changed when it is the selected one and editable, or another shape that is plain (not a twin, nothing away from rest)
    const changeable = !!s && (other ? !s.mirrorOf && !s.hide && atRest && awayAll === 0 : editable)
    if (t.kind === 'point') {
      selectPoint(t.i)
      // in the shape editor it opens the point form there (T2)
      if (s && changeable && shapesOnly && at) { const r = stageRef.current?.getBoundingClientRect(); setPointForm({ id: s.id, i: t.i, left: at.clientX - (r?.left ?? 0), top: at.clientY - (r?.top ?? 0) }) }
      else if (s && changeable) editShape(s.id, cycleMode(s, t.i, { mirror: mirror && !shapesOnly, axis: content.axis }), t.i)
    } else {
      selectSegment(t.e)
      // a shared segment is the segment that is drawn: it changes there (shape editor S5)
      // ... and on a symmetric shape a copy of a shared segment changes as the segment it lies along
      const copy = shapesOnly && s ? copyShareAt(canvasContent, canvasSolved, s.id, t.e) : null
      const home = copy?.side === 'follower' && copy.weld ? { shapeId: copy.target, e: copy.te } : shapesOnly && s ? segmentHome(content, s.id, t.e) : null, homeShape = home ? shapeById(content, home.shapeId) : undefined
      if (home && homeShape && home.shapeId !== s!.id) editShape(home.shapeId, toggleSegment(homeShape, home.e))
      else if (s && changeable) editShape(s.id, toggleSegment(s, t.e))
    }
  }

  function choose(next: Selection) {
    if (recording) return
    setSel(next); setSelPoint(0); setPart('shape'); setPickOn(false); setLinkMode(null); setPaintPick(null); setBonePick(null); setFitPick(false); setBridgeSpots(null)
  }

  // ---- the sliders' test values ----

  const setValue = (id: string, v: number) => { setScrubbing(null); setValues(vs => ({ ...vs, [id]: v })) }
  const resetValues = () => { setScrubbing(null); setValues({}) }
  const resetEverything = () => { setScrubbing(null); test.resetAll() }
  // the scrub sweeps a slider from its minimum to its maximum and back (it runs even with reduced motion: it is asked for, and shows what the slider does)
  useEffect(() => {
    if (!scrubbing) return
    const r = content.ranges.find(x => x.id === scrubbing)
    if (!r) { setScrubbing(null); return }
    let t = 0
    const timer = setInterval(() => { t = (t + SCRUB_TICK / SCRUB_MS) % 1; setValues(vs => ({ ...vs, [r.id]: scrubValue(r, t) })) }, SCRUB_TICK)
    return () => clearInterval(timer)
  }, [scrubbing, content.ranges, setValues])

  // ---- the rig ----

  // The shape a new slider or drive is about, from the selection: the group, the shape, or (nothing selected) the whole model.
  function scaleTarget(): { target: 'group' | 'shape' | 'model'; id: string | null; name: string } {
    if (sel.kind === 'shape' && selShape) return { target: 'shape', id: selShape.id, name: selShape.name.trim() || 'the shape' }
    if (group && sel.kind !== 'none') return { target: 'group', id: group.id, name: group.name.trim() || 'the group' }
    return { target: 'model', id: null, name: 'the model' }
  }
  const sliderName = (c: ModelContent, base: string) => {
    const names = new Set(c.ranges.map(r => r.name.trim().toLowerCase()))
    let name = base, n = 2
    while (names.has(name.toLowerCase())) name = `${base} ${n++}`
    return name.slice(0, 40)
  }
  function startRecording(rangeId: string, shapeId: string, end: 'max' | 'min') {
    const s = shapeById(content, shapeId)
    if (!s) return
    if (s.mirrorOf) { setNote('A twin follows its original: record the original instead, or break the pair.'); return }
    setView('front'); setLinkMode(null); setPoseMode(false); poseRef.current = null
    setValues({}); setScrubbing(null); setPickOn(false); setPanel('right', { open: true }); setTab('ranges')
    setSel({ kind: 'shape', id: shapeId }); setSelPoint(0); setPart('shape')
    setRecording({ rangeId, shapeId, end, draft: { ...s, pts: s.pts.map(p => ({ ...p })) } })
    setNote('')
  }
  // The bone a new Length drive lengthens: one that starts at the selected group, else the first.
  function lengthBone() {
    const bones = content.bones ?? []
    return bones.find(b => b.start === group?.id) ?? bones[0]
  }
  function newSlider(kind: NewSliderKind) {
    const id = freshId(content, 'r', makeId)
    const gName = group?.name.trim() || 'the group'
    if (kind === 'length' || kind === 'depth') {
      const b = lengthBone()
      if (!b) { setNote(`Add a bone first (Proportions tab): a ${kind === 'depth' ? 'Depth slider turns' : 'Length slider lengthens'} a bone.`); return }
      const start = addRange(content, newRange(id, sliderName(content, `${b.name.trim() || 'Bone'} ${kind === 'depth' ? 'depth' : 'length'}`), kind, b.start))
      if (start.ok && applyEdit(kind === 'depth' ? addDepth(start.content, id, b.id) : addLength(start.content, id, b.id))) { setTab('ranges'); setRangeFilter('selection') }
      else if (!start.ok) setNote(start.reason)
      return
    }
    if (kind === 'turn') {
      if (!group) { setNote('Select a group first.'); return }
      const start = addRange(content, newRange(id, sliderName(content, `${gName} turn`), 'turn', group.id))
      if (start.ok && applyEdit(addTurn(start.content, id, group.id))) { setTab('ranges'); setRangeFilter('selection') }
      else if (!start.ok) setNote(start.reason)
      return
    }
    if (kind === 'yaw' || kind === 'pitch') {
      if (!group) { setNote('Select a group first.'); return }
      const start = addRange(content, newRange(id, sliderName(content, `${gName} ${kind === 'yaw' ? 'turn in depth' : 'nod'}`), kind, group.id))
      if (start.ok && applyEdit(addSpin(start.content, id, group.id, kind))) { setTab('ranges'); setRangeFilter('selection') }
      else if (!start.ok) setNote(start.reason)
      return
    }
    if (kind === 'scale') {
      const t = scaleTarget()
      const start = addRange(content, newRange(id, sliderName(content, t.target === 'model' ? 'Size' : `${t.name} size`), 'scale', t.target === 'model' ? null : t.id))
      if (start.ok && applyEdit(addScale(start.content, id, t.target, t.id))) { setTab('ranges'); setRangeFilter(t.target === 'model' ? 'all' : 'selection') }
      else if (!start.ok) setNote(start.reason)
      return
    }
    if (!selShape) { setNote('Select a shape first.'); return }
    if (selShape.mirrorOf) { setNote('A twin follows its original: use the original, or break the pair.'); return }
    const name = selShape.name.trim() || 'the shape'
    const start = addRange(content, newRange(id, sliderName(content, kind === 'points' ? `${name} shape` : kind === 'fall' ? `${name} fall` : `${name} bend`), kind, selShape.id))
    if (!start.ok) { setNote(start.reason); return }
    if (kind === 'fall') { if (applyEdit(addFall(start.content, id, selShape.id))) { setTab('ranges'); setRangeFilter('selection') } }
    else if (kind === 'bend') { if (applyEdit(addBend(start.content, id, selShape.id))) { setTab('ranges'); setRangeFilter('selection') } }
    else { commit(start.content, true); startRecording(id, selShape.id, 'max') }
  }
  function addDrive(rangeId: string, kind: NewSliderKind) {
    if (kind === 'length') { const b = lengthBone(); if (!b) setNote('Add a bone first (Proportions tab): a Length slider lengthens a bone.'); else applyEdit(addLength(content, rangeId, b.id)); return }
    if (kind === 'depth') { const b = lengthBone(); if (!b) setNote('Add a bone first (Proportions tab): a Depth slider turns a bone toward the viewer.'); else applyEdit(addDepth(content, rangeId, b.id)); return }
    if (kind === 'turn') { if (!group) setNote('Select a group first.'); else applyEdit(addTurn(content, rangeId, group.id)); return }
    if (kind === 'yaw' || kind === 'pitch') { if (!group) setNote('Select a group first.'); else applyEdit(addSpin(content, rangeId, group.id, kind)); return }
    if (kind === 'scale') { const t = scaleTarget(); applyEdit(addScale(content, rangeId, t.target, t.id)); return }
    if (!selShape) { setNote('Select a shape first.'); return }
    if (kind === 'fall') applyEdit(addFall(content, rangeId, selShape.id))
    else if (kind === 'bend') applyEdit(addBend(content, rangeId, selShape.id))
    else startRecording(rangeId, selShape.id, 'max')
  }
  function finishRecording() {
    if (!recording) return
    const e = recordPoints(content, recording.rangeId, recording.shapeId, recording.end, recording.draft)
    if (!applyEdit(e)) return
    const r = content.ranges.find(x => x.id === recording.rangeId)
    setValues(r ? { [r.id]: recording.end === 'max' ? r.max : r.min } : {})
    setRecording(null)
  }

  const rigActions: RigActions = {
    selectGroup: id => choose({ kind: 'group', id }),
    reparent: (groupId, parentId) => { applyEdit(reparent(content, groupId, parentId)) },
    setAttach: (groupId, att) => {
      if (!att) { commit(detachGroup(content, groupId), true); return }
      applyEdit(attachGroup(content, groupId, att))
    },
    centerPivot: groupId => {
      const g = content.groups.find(x => x.id === groupId)
      if (!g) return
      const [x, y] = restPivot(content, g)
      commit(setPivot(content, groupId, x, y), true)
    },
    stepDepth: (groupId, dir, big) => commit(stepGroupDepth(content, groupId, dir, big), true),
    pick: setPickOn,
    newSlider,
    renameRange: (id, name) => models.edit(entry.id, c => renameRange(c, id, name), false),
    stepBound: (id, field, dir, big) => commit(stepBound(content, id, field, dir, big), true),
    setShow: (id, show) => commit(setShow(content, id, show), true),
    removeRange: id => { applyEdit(removeRange(content, id)); setValues(vs => { const { [id]: _gone, ...rest } = vs; return rest }) },
    addDrive,
    removeDrive: (rangeId, index) => commit(removeDrive(content, rangeId, index), true),
    stepDrive: (rangeId, index, field, dir, big) => commit(stepDrive(content, rangeId, index, field, dir, big), true),
    setDriveBone: (rangeId, index, boneId) => { applyEdit(setDriveBone(content, rangeId, index, boneId)) },
    stepLimit: (rangeId, end, dir, big) => commit(stepLimit(content, rangeId, end, dir, big), true),
    clearLimit: rangeId => commit(clearLimit(content, rangeId), true),
    setDriveAxis: (rangeId, index, axis) => commit(setDriveAxis(content, rangeId, index, axis), true),
    stepBend: (rangeId, index, edge, dir, big) => commit(stepBendEdge(content, rangeId, index, edge, dir, big), true),
    record: startRecording,
    finishRecording,
    cancelRecording: () => setRecording(null),
    scrub: id => setScrubbing(s => (s === id ? null : id)),
    setValue,
    resetValues,
    openSlider: () => { setTab('ranges'); setRangeFilter('selection') },
    selectShape: id => choose({ kind: 'shape', id }),
    fallObject: (rangeId, objectId) => { applyEdit(addFallToObject(content, rangeId, objectId)) },
    apartSlider: rangeId => { applyEdit(apartSlider(content, rangeId, makeId)) },
    joinSides: rangeId => {
      const e = joinSides(content, rangeId)
      if (applyEdit(e)) setValues(vs => { const kept = new Set(e.ok ? e.content.ranges.map(r => r.id) : []); return Object.fromEntries(Object.entries(vs).filter(([k]) => kept.has(k))) })
    },
    oneSideEach: () => { applyEdit(oneSideEach(content)) },
  }

  // ---- authored fields (phase D3c) ----

  const fieldActions: FieldActions = {
    addFieldset: (owner, ref) => { applyEdit(addFieldset(content, owner, ref, '', makeId)) },
    renameFieldset: (id, name) => models.edit(entry.id, c => renameFieldset(c, id, name), false),
    removeFieldset: id => {
      const gone = new Set((content.fieldsets ?? []).find(f => f.id === id)?.ranges ?? [])
      commit(removeFieldset(content, id), true)
      setValues(vs => Object.fromEntries(Object.entries(vs).filter(([k]) => !gone.has(k))))
    },
    addField: (fieldsetId, prop) => { applyEdit(addField(content, fieldsetId, prop, makeId)) },
    removeField: id => {
      commit(removeField(content, id), true)
      setValues(vs => { const { [id]: _gone, ...rest } = vs; return rest })
    },
    setProp: (fieldsetId, rangeId, prop) => { if (applyEdit(setFieldProp(content, fieldsetId, rangeId, prop))) setValues(vs => { const { [rangeId]: _gone, ...rest } = vs; return rest }) },
    select: f => {
      if (f.feature === 'object') choose({ kind: 'object', id: f.target })
      else { choose({ kind: 'shape', id: f.target }); if (f.feature === 'point' || f.feature === 'edge') setSelPoint(f.i) }
    },
    openRanges: () => { setTab('ranges'); setRangeFilter('selection') },
  }

  // ---- hands (phase 5c) ----

  const hands: HandActions = {
    addFinger: groupId => { applyEdit(addFinger(content, groupId, { role: null }, makeId)) },
    addThumb: groupId => { applyEdit(addThumb(content, groupId, {}, makeId)) },
    addHand: groupId => { applyEdit(addHand(content, groupId, {}, makeId)) },
    apartHand: groupId => { applyEdit(apartHand(content, groupId, makeId)) },
    addPoses: groupId => { if (applyEdit(addHandPoses(content, groupId, makeId))) setTab('presets') },
    addGrip: groupId => { const e = addGrip(content, groupId, makeId); if (applyEdit(e) && e.ok && e.gripId) test.setGrip(e.gripId) },
    renameGrip: (id, name) => models.edit(entry.id, c => renameGrip(c, id, name), false),
    stepGrip: (id, field, dir, big) => {
      const g = gripsOf(content).find(x => x.id === id)
      if (!g) return
      commit(field === 'angle' ? stepGripAngle(content, id, dir, big) : moveGrip(content, id, g.x + (field === 'x' ? dir * (big ? 5 : 1) : 0), g.y + (field === 'y' ? dir * (big ? 5 : 1) : 0)), true)
    },
    mirrorGrip: id => { applyEdit(mirrorGrip(content, id, makeId)) },
    removeGrip: id => { commit(removeGrip(content, id), true); if (test.grip === id) test.setGrip(null) },
    holdGrip: test.setGrip,
  }

  // ---- proportions: bones, fit and frames ----

  const proportions: ProportionActions = {
    addBone: () => {
      const start = group && !group.mirrorOf ? group : content.groups.find(g => !g.mirrorOf)
      if (!start) { setNote('Make a group first: a bone starts at the pivot of one.'); return }
      const end = content.groups.find(g => g.parent === start.id) ?? content.groups.find(g => g.id !== start.id)
      if (!end) { setNote('Make a second group first: a bone runs from the pivot of one group to another.'); return }
      if (applyEdit(addBone(content, start.id, { kind: 'group', id: end.id, i: 0 }, `${start.name.trim() || 'Group'} bone`, makeId))) setTab('proportions')
    },
    renameBone: (id, name) => models.edit(entry.id, c => renameBone(c, id, name), false),
    setStart: (id, groupId) => { applyEdit(setBoneStart(content, id, groupId)) },
    setEnd: (id, kind, targetId, i) => { applyEdit(setBoneEnd(content, id, { kind, id: targetId, i })) },
    stepEndPoint: (id, dir) => {
      const b = boneById(content, id), n = b ? shapeById(content, b.end.id)?.pts.length ?? 0 : 0
      if (b && b.end.kind === 'point' && n > 0) applyEdit(setBoneEnd(content, id, { ...b.end, i: ((b.end.i + dir) % n + n) % n }))
    },
    pickEnd: id => { setBonePick(id); if (id) { setLinkMode(null); setPickOn(false); setPaintPick(null); setFitPick(false) } },
    removeBone: id => {
      const r = removeBone(content, id)
      commit(r.content, true)
      if (r.sliders.length) setNote(`The Length drive of ${r.sliders.join(', ')} went with the bone.`)
    },
    setHeadBone: id => { applyEdit(setHeadBone(content, id)) },
    lengthSlider: boneId => {
      const b = boneById(content, boneId)
      if (!b) return
      const id = freshId(content, 'r', makeId)
      const start = addRange(content, newRange(id, sliderName(content, `${b.name.trim() || 'Bone'} length`), 'length', b.start))
      if (!start.ok) { setNote(start.reason); return }
      applyEdit(addLength(start.content, id, boneId))
    },
    depthSlider: boneId => {
      const b = boneById(content, boneId)
      if (!b) return
      const id = freshId(content, 'r', makeId)
      const start = addRange(content, newRange(id, sliderName(content, `${b.name.trim() || 'Bone'} depth`), 'depth', b.start))
      if (!start.ok) { setNote(start.reason); return }
      applyEdit(addDepth(start.content, id, boneId))
    },
    openSlider: () => { setTab('ranges'); setRangeFilter('all') },
  }
  const wear: WearActions = { toggleUnder: (objectId, targetId) => { applyEdit(toggleUnder(content, objectId, targetId)) } }
  const drape: DrapeActions = { stepDrape: (objectId, dir, big) => { applyEdit(stepDrape(content, objectId, dir, big)) } }
  const fit: FitActions = {
    setFit: (objectId, mode, fitTo) => { setFitPick(false); applyEdit(setObjectFit(content, objectId, mode, fitTo)) },
    pick: on => { setFitPick(on); if (on) { setBonePick(null); setLinkMode(null); setPickOn(false); setPaintPick(null) } },
  }
  // the box a new frame starts as, in the view being edited: around the selection (else the whole figure), with a margin
  function frameStart(): Box {
    const ids = sel.kind === 'none' ? solved.order : shapesOf(content, sel).map(s => s.id)
    const boxes = ids.map(id => solved.shapes[id]).filter(r => r?.visible).map(r => r.box)
    if (boxes.length === 0) return { x: 0, y: 0, w: 200, h: 400 }
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y)), x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h))
    const mx = (x1 - x0) * 0.08, my = (y1 - y0) * 0.08
    return { x: x0 - mx, y: y0 - my, w: x1 - x0 + 2 * mx, h: y1 - y0 + 2 * my }
  }
  const tile = tileTest ?? tileOf(content)
  const frameActions: FrameActions = {
    add: () => {
      const e = addFrame(content, viewBoxOf(frameStart(), view, content.axis), `Frame ${framesOf(content).length + 1}`, makeId)
      if (applyEdit(e) && e.ok && e.frameId) setFrameSel(e.frameId)
    },
    rename: (id, name) => models.edit(entry.id, c => renameFrame(c, id, name), false),
    remove: id => { commit(removeFrame(content, id), true); setFrameSel(s => (s === id ? null : s)); setThroughId(t => (t === id ? null : t)) },
    select: setFrameSel,
    through: id => { setThroughId(id); if (id) { setPoseMode(false); poseRef.current = null } },
    toggleHide: (id, thingId) => { applyEdit(toggleFrameHide(content, id, thingId)) },
    setTile: setTileTest,
    useTile: () => { if (tileTest) { commit(setTile(content, tileTest), true); setTileTest(null) } },
    resetTile: () => setTileTest(null),
  }
  const framesState: FramesState = { selected: frameById(content, frameSel)?.id ?? null, through: through?.id ?? null, tile, tileChanged: tileTest !== null && tileTest !== tileOf(content) }
  // the rectangles of the frames on the canvas while the Frames tab is open, as seen from the view being edited (a drag gives a box in that view)
  const frameCanvas: FrameCanvas | null = tab === 'frames' && !through && !recording ? {
    frames: framesOf(content).map(f => ({ id: f.id, name: f.name, box: viewBoxOf(f, view, content.axis), on: f.id === framesState.selected })),
    onGesture: () => setHistory(h => remember(h, content)),
    onBox: (id, box) => models.edit(entry.id, c => setFrameBox(c, id, viewBoxOf(box, view, c.axis)), false),
    onSelect: setFrameSel,
    onNudge: (id, dx, dy, resize) => {
      const f = frameById(content, id)
      if (!f) return
      const at = viewBoxOf(f, view, content.axis)
      commit(setFrameBox(content, id, viewBoxOf(resize ? resizedBox(at, 'se', dx, dy) : movedBox(at, dx, dy), view, content.axis)))
    },
  } : null
  const throughFrame: ThroughFrame | null = through ? { box: viewBoxOf(through, view, content.axis), tile, name: through.name } : null

  // ---- pairs, links and the back view ----

  const pairs: PairActions = {
    select: choose,
    makeTwin: (kind, id) => { applyEdit(makeTwin(content, kind, id, makeId)) },
    breakPair: (kind, id) => { applyEdit(breakPair(content, kind, id)) },
    startLink: how => {
      if (!selShape || selShape.mirrorOf) return
      if (turnAngle !== 0) { setNote('Link points in the front view: a link works in every view.'); return }
      setPickOn(false); setLinkMode(how)
    },
    stopLink: () => setLinkMode(null),
    unlink: (shapeId, index) => commit(unlinkPoint(content, shapeId, index), true),
    stepLink: (shapeId, index, field, dir, big) => commit(stepLink(content, shapeId, index, field, dir, big), true),
    setLoose: (shapeId, rangeId) => { applyEdit(setLoose(content, [shapeId], rangeId)) },
    makeLoose: shapeId => {
      const sh = shapeById(content, shapeId)
      if (!sh) return
      const id = freshId(content, 'r', makeId)
      const made = addRange(content, { ...newRange(id, sliderName(content, `${sh.name.trim() || 'Shape'} fit`), 'scale', shapeId), min: 0, rest: 100, max: 200, unit: '%' })
      if (!made.ok) { setNote(made.reason); return }
      applyEdit(setLoose(made.content, [shapeId], id))
    },
    useFront: shapeId => { applyEdit(setBack(content, shapeId, null)) },
    moveInOrder: (shapeId, dir) => { applyEdit(moveInOrder(content, shapeId, side, dir)) },
    setLeaves: (shapeId, index, on) => { applyEdit(setLeaves(content, shapeId, index, on)) },
    startBridge: () => {
      if (turnAngle !== 0) { setNote('Build a bridge in the front view: its points are locked to edges, which work in every view.'); return }
      setPickOn(false); setLinkMode(null); setPaintPick(null); setBonePick(null); setFitPick(false); setWeighing(false); setBridgeSpots([])
    },
    stopBridge: () => setBridgeSpots(null),
  }

  // ---- posing by dragging ----

  function poseBegin(grab: PoseGrab, world: [number, number], alt: boolean): boolean {
    if (recording) return false
    const sv = solved, p = toModel(sv, world[0], world[1]), start = valuesRef.current
    // (a posable point and a slider are grabbed only in the shape editor's Pose mode)
    if (grab.kind === 'mark' || grab.kind === 'slider') return false
    const gid = grab.kind === 'part' ? groupOfShape(content, grab.shapeId) : grab.kind === 'grip' ? undefined : grab.groupId
    const name = content.groups.find(g => g.id === gid)?.name.trim() || 'the group'
    // A twin whose original moves only its own side is given the slider it lacks the moment it is grabbed, so either side can be posed: the new sliders are one
    // undo step of their own, and the status says so.
    const sided = (made: string[]) => (made.length > 0 ? ` A slider for this side was added (${made.length}).` : '')
    if (grab.kind === 'scale') {
      const sides = gid && !scaleDriver(content, gid) ? poseSides(content, [gid], 'scale', makeId) : { content, made: [] as string[] }
      const scale = gid ? beginScale(sides.content, sv, start, gid, p) : null
      if (!scale || !gid) return false
      if (sides.made.length > 0) commit(sides.content, true)
      poseRef.current = { kind: 'scale', solved: sv, start, group: gid, scale }
      setPoseActive(gid); setPoseStatus(`Scaling ${name}.${sided(sides.made)}`)
      return true
    }
    if (grab.kind === 'grip') {
      const grip = gripsOf(content).find(g => g.id === grab.gripId), held = grip && gripGrab(grip)
      if (!grip || !held) return false
      if (reachJoints(content, held.groupId).length === 0) { setPoseStatus('Nothing bends to reach with this grip: give the arm Turn sliders.'); return false }
      poseRef.current = { kind: 'reach', solved: sv, start, group: held.groupId, grab: held, current: start }
      test.setGrip(grip.id)
      setPoseActive(held.groupId); setPoseStatus(`Reaching with ${grip.name.trim() || 'the grip point'}.`)
      return true
    }
    if (grab.kind === 'slide') {
      if (!gid) return false
      poseRef.current = { kind: 'slide', solved: sv, start, group: gid }
      setPoseActive(gid); setPoseStatus(`Sliding ${name}.`)
      return true
    }
    if (alt || reachOn) {
      // every joint of the limb on this side gets the slider it lacks, so the whole limb bends
      const sides = gid ? poseSides(content, chainOf(content, gid), 'turn', makeId) : { content, made: [] as string[] }
      if (!gid || reachJoints(sides.content, gid).length === 0) { const t = poseTarget(content, gid); setPoseStatus(t.ok ? 'Nothing here bends.' : t.reason); return false }
      if (sides.made.length > 0) commit(sides.content, true)
      poseRef.current = { kind: 'reach', solved: sv, start, group: gid, grab: grabPoint(sv, gid, p), current: start }
      setPoseActive(gid); setPoseStatus(`Reaching with ${name}.${sided(sides.made)}`)
      return true
    }
    let target = poseTarget(content, gid), made: string[] = [], c2 = content
    if (!target.ok && target.side) {
      const sides = poseSides(content, [target.side], 'turn', makeId)
      if (sides.made.length > 0) { c2 = sides.content; made = sides.made; target = poseTarget(c2, gid) }
    }
    if (!target.ok) { setPoseStatus(target.reason); return false }
    const turn = beginTurn(c2, sv, start, target, p)
    if (!turn) return false
    if (made.length > 0) commit(c2, true)
    poseRef.current = { kind: 'turn', solved: sv, start, group: target.group.id, turn }
    setPoseActive(target.group.id); setPoseStatus(`Turning ${target.group.name.trim() || 'the group'}.${sided(made)}`)
    return true
  }
  function poseMove(world: [number, number]) {
    const d = poseRef.current
    if (!d) return
    const p = toModel(d.solved, world[0], world[1])
    if (d.kind === 'turn') {
      const r = moveTurn(content, d.turn, p)
      d.turn = r.drag
      setValues(r.values)
      const range = content.ranges.find(x => x.id === d.turn.rangeId)
      if (range) setPoseStatus(`Turning ${content.groups.find(g => g.id === d.group)?.name.trim() || 'the group'}: ${range.name.trim() || 'slider'} ${valueText(range, r.values[range.id] ?? range.rest)}.`)
    } else if (d.kind === 'scale') {
      const next = moveScale(content, d.scale, p)
      setValues(next)
      const range = content.ranges.find(x => x.id === d.scale.rangeId)
      if (range) setPoseStatus(`Scaling ${content.groups.find(g => g.id === d.group)?.name.trim() || 'the group'}: ${range.name.trim() || 'slider'} ${valueText(range, next[range.id] ?? range.rest)}.`)
    } else if (d.kind === 'slide') {
      const s = slideValue(content, d.solved, d.group, p)
      if (s) setValues({ ...d.start, [s.rangeId]: s.value })
    } else {
      const r = reach(content, d.current, view, d.grab, p)
      d.current = r.values
      setValues(r.values)
    }
  }
  function poseEnd() {
    if (poseRef.current) setPoseStatus('Drag again to keep posing, or save the pose as a preset.')
    poseRef.current = null; setPoseActive(null)
  }
  function poseCancel() {
    const d = poseRef.current
    if (d) setValues(d.start)
    poseRef.current = null; setPoseActive(null); setPoseStatus('Put back as it was.')
  }
  function savePose() {
    const n = presetsOf(content).filter(x => x.kind.trim().toLowerCase() === 'pose').length + 1
    if (applyEdit(savePreset(content, { ...test.state, hidden: [] }, `Pose ${n}`, 'Pose', makeId))) setPoseStatus(`Saved as the preset Pose ${n}. Rename it in the Presets tab.`)
  }
  // what the pose mode shows on the canvas: a ring at the pivot of every group a drag can turn (a twin too: the slider of its side is made when it is grabbed), a square on every group that has a Scale slider, a circle on
  // every anchor that a slider slides
  // the grip points on the canvas: where each is now (carried by its hand) and the way it points; shown in Pose mode, in the Rig and Presets tabs, and while one is held
  const gripMarks: GripMark[] | undefined = (() => {
    const list = gripsOf(content)
    if (list.length === 0 || !(poseMode || tab === 'rig' || tab === 'presets' || test.grip)) return undefined
    return list.map(g => {
      const at = gripAt(solved, g), a = (at.angle * Math.PI) / 180
      const [x, y] = apply(solved.global, at.x, at.y), [tx, ty] = apply(solved.global, at.x + Math.sin(a) * 10, at.y + Math.cos(a) * 10)
      return { id: g.id, name: g.name, x, y, tx, ty, active: test.grip === g.id }
    })
  })()
  const poseCanvas: PoseCanvas | null = poseMode && !recording && !through ? (() => {
    const at = (x: number, y: number) => apply(solved.global, x, y)
    const named = (id: string) => content.groups.find(g => g.id === id)?.name.trim() || 'the group'
    const joints = content.groups.filter(g => canTurn(content, g) && solved.pivots[g.id]).map(g => { const [x, y] = at(...solved.pivots[g.id]); return { id: g.id, name: named(g.id), x, y, active: poseActive === g.id } })
    const scales = content.groups.filter(g => canScale(content, g)).flatMap(g => {
      const boxes = g.objects.flatMap(oid => objectById(content, oid)?.shapes ?? []).map(id => solved.shapes[id]).filter(r => r?.visible).map(r => r.box)
      if (!boxes.length) return []
      return [{ id: g.id, name: named(g.id), x: Math.max(...boxes.map(b => b.x + b.w)), y: Math.max(...boxes.map(b => b.y + b.h)) }]
    })
    const slides = content.groups.filter(g => !g.mirrorOf && g.attach?.kind === 'range' && solved.anchors[g.id]).map(g => { const [x, y] = at(...solved.anchors[g.id]!); return { id: g.id, name: named(g.id), x, y } })
    return { joints, scales, slides, onDown: poseBegin, onMove: poseMove, onUp: poseEnd, onCancel: poseCancel }
  })() : null

  // ---- forms and presets ----

  // The outlines now drawn for the object's shapes that differ from the base, to start a new form from (the others keep the base outline).
  function drawnOutlines(objectId: string): Record<string, ModelContent['shapes'][number]['pts']> {
    const rest = solve(content, {}, 'front', { forms: test.forms })
    const out: Record<string, ModelContent['shapes'][number]['pts']> = {}
    for (const id of objectById(content, objectId)?.shapes ?? []) {
      const sh = shapeById(content, id), drawn = rest.shapes[id]?.local
      if (sh && drawn && drawn.length >= 3 && JSON.stringify(drawn) !== JSON.stringify(sh.pts)) out[id] = drawn
    }
    return out
  }
  const forms: FormActions = {
    selectObject: id => choose({ kind: 'object', id }),
    addAxis: objectId => {
      const e = addAxis(content, objectId, `Axis ${(objectById(content, objectId)?.axes?.length ?? 0) + 1}`, makeId)
      if (applyEdit(e) && e.ok && e.axisId && e.formId) test.setForm(objectId, e.axisId, e.formId)
    },
    removeAxis: (objectId, axisId) => commit(removeAxis(content, objectId, axisId), true),
    renameAxis: (objectId, axisId, name) => models.edit(entry.id, c => renameAxis(c, objectId, axisId, name), false),
    setAxisRoll: (objectId, axisId, roll) => models.edit(entry.id, c => setAxisRoll(c, objectId, axisId, roll), false),
    setAxisCarry: (objectId, axisId, carry) => models.edit(entry.id, c => setAxisCarry(c, objectId, axisId, carry), false),
    toggleAxisGenre: (objectId, axisId, genreId) => models.edit(entry.id, c => toggleAxisGenre(c, objectId, axisId, genreId), false),
    moveAxis: (objectId, axisId, dir) => commit(moveAxis(content, objectId, axisId, dir), true),
    choose: (objectId, axisId, formId) => test.setForm(objectId, axisId, formId),
    addForm: (objectId, axisId) => {
      const count = objectById(content, objectId)?.axes?.find(a => a.id === axisId)?.options.length ?? 0
      const e = addForm(content, objectId, axisId, drawnOutlines(objectId), `Form ${count + 1}`, makeId)
      if (applyEdit(e) && e.ok && e.formId) test.setForm(objectId, axisId, e.formId)
    },
    renameForm: (objectId, axisId, formId, name) => models.edit(entry.id, c => renameForm(c, objectId, axisId, formId, name), false),
    makeDefault: (objectId, axisId, formId) => commit(setInitialForm(content, objectId, axisId, formId), true),
    moveForm: (objectId, axisId, formId, dir) => commit(moveForm(content, objectId, axisId, formId, dir), true),
    removeForm: (objectId, axisId, formId) => { applyEdit(removeForm(content, objectId, axisId, formId)) },
    hideShape: (objectId, axisId, formId, shapeId) => { applyEdit(hideInForm(content, objectId, axisId, formId, shapeId)) },
    useBase: (objectId, axisId, formId, shapeId) => { applyEdit(useBaseOutline(content, objectId, axisId, formId, shapeId)) },
    setLook: (objectId, axisId, formId, shapeId, look) => { applyEdit(setLook(content, objectId, axisId, formId, shapeId, look)) },
  }

  // ---- paint effects ----

  const paintActions: PaintActions = {
    setFade: (id, sliderId) => { applyEdit(setFade(content, id, sliderId)) },
    stepFade: (id, end, dir, big) => commit(stepFade(content, id, end, dir, big), true),
    setTone: (id, tone) => { applyEdit(paintOps.setTone(content, id, tone)) },
    setDerive: (id, kind) => { applyEdit(paintOps.setDerive(content, id, kind)) },
    stepTint: (id, field, dir, big) => { applyEdit(paintOps.stepTint(content, id, field, dir, big)) },
    setShadeKind: (id, kind) => { applyEdit(paintOps.setShadeKind(content, id, kind)) },
    setGradient: (id, grad) => { applyEdit(paintOps.setGradient(content, id, grad)) },
    setBlend: (id, blend) => { applyEdit(paintOps.setBlend(content, id, blend)) },
    setClip: (id, target) => { applyEdit(paintOps.setClip(content, id, target)) },
    toggleCut: (id, target) => { applyEdit(paintOps.toggleCut(content, id, target)) },
    toggleOver: (id, objectId) => { applyEdit(paintOps.toggleOver(content, id, objectId)) },
    setHelper: (id, on) => { applyEdit(paintOps.setHelper(content, id, on)) },
    addShading: (id, kind, side) => {
      const e = addShading(content, id, kind, side, makeId)
      if (applyEdit(e) && e.ok && e.shapeId) { setSel({ kind: 'shape', id: e.shapeId }); setSelPoint(0) }
    },
    pick: what => { setPaintPick(what); if (what) { setLinkMode(null); setPickOn(false) } },
    stepRound: (id, dir, big) => { applyEdit(paintOps.stepRound(content, id, dir, big)) },
    addPattern: (baseId, marks, name) => { applyEdit(patternOps.addPattern(content, baseId, marks, name, makeId)) },
    renamePattern: (id, name) => models.edit(entry.id, c => patternOps.renamePattern(c, id, name), false),
    toggleMark: (patternId, shapeId) => { applyEdit(patternOps.toggleMark(content, patternId, shapeId)) },
    removePattern: id => commit(patternOps.removePattern(content, id), true),
    toggleShown: id => test.toggleHidden(id),
  }
  const classes: ClassActions = {
    select: choose,
    makeClass: (objectId, name, exclusive) => { applyEdit(makeClass(content, objectId, name, exclusive, makeId)) },
    renameClass: (classId, name) => models.edit(entry.id, c => renameClass(c, classId, name), false),
    setExclusive: (classId, exclusive) => commit(setExclusive(content, classId, exclusive), true),
    addMember: classId => {
      const e = addMember(content, classId, makeId)
      if (applyEdit(e) && e.ok && e.memberId) choose({ kind: 'object', id: e.memberId })
    },
    detach: memberId => { applyEdit(detachMember(content, memberId)) },
    deleteClass: classId => { applyEdit(deleteClass(content, classId)) },
    showMember: (classId, memberId) => test.setChoice(classKey(classId), memberId),
    moveToGroup: (objectId, groupId) => { applyEdit(moveObjectToGroup(content, objectId, groupId)) },
    followTemplate: shapeId => commit(followTemplate(content, shapeId), true),
    hideShape: (shapeId, hide) => commit(setShapeHide(content, shapeId, hide), true),
  }
  const presets: PresetActions = {
    apply: id => { const p = presetsOf(content).find(x => x.id === id); if (p) { setScrubbing(null); test.apply(content, p) } },
    save: (name, kind, keep) => { applyEdit(savePreset(content, test.state, name, kind, makeId, keep)) },
    saveStyle: (scopeId, name) => { applyEdit(saveStyle(content, test.state, scopeId, name, 'Style', makeId)) },
    update: (id, keep) => commit(updatePreset(content, id, test.state, keep), true),
    rename: (id, name) => models.edit(entry.id, c => renamePreset(c, id, name), false),
    remove: id => commit(deletePreset(content, id), true),
    addHandPoses: () => { applyEdit(addHandPoses(content, undefined, makeId)) },
    setGrip: (id, gripId) => { applyEdit(setPresetGrip(content, id, gripId)) },
    lockStyle: (id, slotId, part, value) => lockEdit(c => setStyleLock(c, id, slotId, part, value), (presetsOf(content).find(p => p.id === id)?.hsl?.[slotId]?.[part] ?? null) === null !== (value === null)),
    moveShape: (objectId, shapeId, dir) => {
      const o = objectById(content, objectId)
      if (!o) return
      const seq = shapesInOrder(content, o, test.order), at = seq.indexOf(shapeId), to = at + dir
      if (at < 0 || to < 0 || to >= seq.length) return
      const next = [...seq]
      ;[next[at], next[to]] = [next[to], next[at]]
      test.setOrder(objectId, next)
    },
    toggleShape: shapeId => test.toggleHidden(shapeId),
    resetOrder: objectId => test.setOrder(objectId, null),
  }
  // A change to the parts of a colour an object or a style holds: switching a lock on or off is a step of its own, moving a locked value is not (as for a colour's sliders).
  function lockEdit(make: (c: ModelContent) => Edit, step: boolean) {
    if (step) { applyEdit(make(content)); return }
    models.edit(entry.id, c => { const e = make(c); return e.ok ? e.content : c }, false)
  }

  const colourActions: ColourActions = {
    lockObject: (objectId, slotId, part: LockPart, value) => lockEdit(c => setObjectLock(c, objectId, slotId, part, value), (objectById(content, objectId)?.hsl?.[slotId]?.[part] ?? null) === null !== (value === null)),
    setSlot: (shapeIds, slotId) => commit({ ...content, shapes: content.shapes.map(s => (shapeIds.includes(s.id) ? { ...s, slot: slotId } : s)) }, true),
    stepGray: (id, dir, big) => commit(updateShape(content, id, s => ({ ...s, gray: Math.min(100, Math.max(0, Math.round((s.gray ?? NEUTRAL_GRAY) + dir * (big ? 25 : 5)))) })), true),
    neutral: id => commit(updateShape(content, id, s => ({ ...s, gray: null })), true),
    choose: test.setColour,
    roll: () => test.roll(content),
    setGenre: test.setGenre,
    addSwatch: () => { const r = addSwatch(testPalette, makeId); if (r.reason) setNote(r.reason); else test.setPalette(r.palette) },
    setSwatch: (id, change) => test.setPalette(setSwatch(testPalette, id, change)),
    removeSwatch: id => { const r = removeSwatch(testPalette, test.colours, id); test.setPalette(r.palette, r.choices) },
    saveStarter: () => { commit(setStarterPalette(content, testPalette), true); test.setPalette(null) },
    resetPalette: () => test.setPalette(null),
    addSlot: () => { applyEdit(addSlot(content, 'Colour', makeId)) },
    renameSlot: (id, name) => models.edit(entry.id, c => renameSlot(c, id, name), false),
    stepSlot: (id, key, dir, big) => commit(stepSlot(content, id, key, dir, big), true),
    removeSlot: id => { if (applyEdit(removeSlot(content, id))) test.setColour(id, null) },
    addColour: slotId => { applyEdit(addColour(content, slotId, '#808080', makeId)) },
    renameColour: (slotId, id, name) => models.edit(entry.id, c => renameColour(c, slotId, id, name), false),
    setColourHex: (slotId, id, hex) => models.edit(entry.id, c => setColourHex(c, slotId, id, hex), false),
    toggleColourGenre: (slotId, id, genreId) => commit(toggleColourGenre(content, slotId, id, genreId), true),
    removeColour: (slotId, id) => commit(removeColour(content, slotId, id), true),
    addGenre: () => { applyEdit(addGenre(content, 'Genre', makeId)) },
    renameGenre: (id, name) => models.edit(entry.id, c => renameGenre(c, id, name), false),
    removeGenre: id => { commit(removeGenre(content, id), true); if (test.genre === id) test.setGenre(null) },
    addStandard: () => { applyEdit(addStandardSlots(content)) },
  }

  // ---- the tree's actions ----

  // The group a new object goes into: the selection's group; else, in a model with zones (Z2), a new group in the selected zone or the top zone; else the first group, else a
  // new one (returned with its content).
  function groupForNew(c: ModelContent): { content: ModelContent; groupId: string } {
    if (sel.kind === 'group' && groupById(c, sel.id)) return { content: c, groupId: sel.id }
    const obj = sel.kind === 'object' ? objectById(c, sel.id) : sel.kind === 'shape' ? objectOfShape(c, sel.id) : undefined
    const g = obj ? groupOfObject(c, obj.id) : undefined
    if (g) return { content: c, groupId: g.id }
    const zone = sel.kind === 'zone' ? zoneById(c, sel.id) ?? topZone(c) : topZone(c)
    if (zone) return newGroupIn(c, zone.id, makeId)
    if (c.groups[0]) return { content: c, groupId: c.groups[0].id }
    const id = freshId(c, 'g', makeId)
    return { content: addGroup(c, newGroup(id, 'Group 1')), groupId: id }
  }
  function addObjectOn(layer: ModelLayer, c: ModelContent = content): { content: ModelContent; objectId: string } {
    const { content: base, groupId } = groupForNew(c)
    const id = freshId(base, 'o', makeId)
    return { content: addObject(base, groupId, { id, name: `Object ${base.objects.length + 1}`, layer, shapes: [] }), objectId: id }
  }
  function addShapeTo(objectId: string, templateId: string, c: ModelContent, from?: { kind: FormKind; at: [number, number]; box?: Box }) {
    const obj = objectById(c, objectId)
    if (obj && obj.shapes.length >= policy.max.shapesPerObject) { setNote(`An object may have at most ${policy.max.shapesPerObject} shapes.`); return }
    const id = freshId(c, 's', makeId)
    const at = from?.at ?? [100, 100], kind = from?.kind ?? 'base'
    const made = newShape(id, templateById(templateId)?.name ?? 'Shape', templateId, from?.box ?? templateBox(templateId, at[0], at[1]))
    // the shape editor's shapes start with a thin outline (S3); a shadow or a light has none, and starts see-through (T1)
    const shape = !shapesOnly ? made : kind === 'shadow' || kind === 'light' ? { ...made, name: KIND_NAMES[kind], kind, op: CAST_OPACITY[kind], outline: null } : { ...made, kind, outline: LIMITS.outlineNew }
    if (commit(addShape(c, objectId, shape), true)) choose({ kind: 'shape', id })
  }
  // Delete what is selected, with what goes with it (a group's objects, an object's shapes, a twin).
  function deleteSelection(s: Selection) {
    if (s.kind === 'zone') { commit(removeZone(content, s.id), true); setSel(NONE); return }
    if (s.kind === 'shape' && shapeById(content, s.id)?.copyOf) { setNote('A shape that follows the pattern cannot be deleted: hide it in this member instead (the Shape tab).'); return }
    if (s.kind === 'shape' && shapeById(content, s.id)?.cloneOf && objectOfShape(content, s.id)?.cloneOf) { setNote('A shape of a clone object follows its original: delete the shape in the original, or detach the clone.'); return }
    const twins = twinsOf(content, s.kind === 'none' ? 'shape' : s.kind, s.kind === 'none' ? '' : s.id).length
    const clones = s.kind === 'shape' ? content.shapes.filter(x => x.cloneOf === s.id).length : s.kind === 'object' ? content.objects.filter(x => x.cloneOf === s.id).length : 0
    // the members of a class whose pattern goes keep their look: they are detached first
    const base = s.kind === 'none' ? content : detachBeforeRemoval(content, s.kind === 'shape' ? { shapes: [s.id] } : s.kind === 'object' ? { objects: [s.id] } : { groups: [s.id] })
    commit(s.kind === 'shape' ? removeShape(base, s.id) : s.kind === 'object' ? removeObject(base, s.id) : removeGroup(base, s.id), true)
    setSel(NONE)
    if (base !== content) setNote('The members of its class were detached first: they keep their look.')
    else if (clones) setNote(clones === 1 && !twins ? 'Its clone went with it.' : 'Its copies went with it.')
    else if (twins) setNote('Its twin went with it.')
  }
  function copyShape(id: string) {
    if (shapeById(content, id)?.mirrorOf) { setNote('A twin has no outline of its own to copy: break the pair first, or copy the original.'); return }
    const owner = objectOfShape(content, id)
    if (owner && owner.shapes.length >= policy.max.shapesPerObject) { setNote(`An object may have at most ${policy.max.shapesPerObject} shapes.`); return }
    const copyId = freshId(content, 's', makeId)
    if (commit(duplicateShape(content, id, copyId), true)) choose({ kind: 'shape', id: copyId })
  }
  // A new look kept as a variant (of the model), a pose (of a group) or a style (of an object).
  function newPreset(scope: string | null) {
    const group = scope ? groupById(content, scope) : undefined
    const count = presetsOf(content).filter(p => (p.scope ?? null) === scope).length + 1
    const e = !scope
      ? savePreset(content, test.state, `Variant ${count}`, 'Variant', makeId, { forms: true, styles: true, colours: true })
      : saveStyle(content, test.state, scope, `${group ? 'Pose' : 'Style'} ${count}`, group ? 'Pose' : 'Style', makeId)
    applyEdit(e)
  }
  const actions: TreeActions = {
    onSelect: choose,
    onAddGroup: () => {
      if (content.groups.length >= policy.max.groups) { setNote(`A model may have at most ${policy.max.groups} groups.`); return }
      const id = freshId(content, 'g', makeId)
      if (commit(addGroup(content, newGroup(id, `Group ${content.groups.length + 1}`)), true)) choose({ kind: 'group', id })
    },
    onAddObject: groupId => {
      const g = groupById(content, groupId)
      if (!g) return
      if (g.objects.length >= policy.max.objectsPerGroup) { setNote(`A group may have at most ${policy.max.objectsPerGroup} objects.`); return }
      const id = freshId(content, 'o', makeId)
      if (commit(addObject(content, groupId, { id, name: `Object ${content.objects.length + 1}`, layer: 'body', shapes: [] }), true)) choose({ kind: 'object', id })
    },
    onAddShape: (objectId, t) => addShapeTo(objectId, t, content),
    onShapeForm: objectId => openShapeFormInView(objectId),
    onTwin: (kind, id) => { applyEdit(makeTwin(content, kind, id, makeId)) },
    onReorderShape: (objectId, shapeId, before) => commit(moveShapeWithin(content, objectId, shapeId, before), true),
    onReorderObject: (groupId, objectId, before) => commit(moveObjectWithin(content, groupId, objectId, before), true),
    onReorderGroup: (groupId, before) => commit({ ...content, groups: moveBefore(content.groups, groupId, before) }, true),
    onToggleHidden: test.toggleHidden,
    onToggleModelHidden: () => test.setHidden(content.groups.map(g => g.id), !(content.groups.length > 0 && content.groups.every(g => hiddenSet.has(g.id)))),
    onApply: id => { const p = presetsOf(content).find(x => x.id === id); if (p) { setScrubbing(null); test.apply(content, p) } },
    onClear: id => { const p = presetsOf(content).find(x => x.id === id); if (p) { setScrubbing(null); test.clear(content, p) } },
    onNewPreset: newPreset,
    onAddState: groupId => { applyEdit(addState(content, test.state, groupId, makeId)) },
    onRenameState: (groupId, stateId, name) => models.edit(entry.id, c => renameState(c, groupId, stateId, name), false),
    onRemoveState: (groupId, stateId) => commit(removeState(content, groupId, stateId), true),
    onAddOption: (groupId, stateId) => { applyEdit(addOption(content, test.state, groupId, stateId, makeId)) },
    onRenameOption: (groupId, stateId, optionId, name) => models.edit(entry.id, c => renameOption(c, groupId, stateId, optionId, name), false),
    onUpdateOption: (groupId, stateId, optionId) => commit(updateOption(content, test.state, groupId, stateId, optionId), true),
    onRemoveOption: (groupId, stateId, optionId) => { applyEdit(removeOption(content, groupId, stateId, optionId)) },
    onChooseOption: (groupId, stateId, optionId) => { setScrubbing(null); test.set(applyOption(content, test.state, groupId, stateId, optionId)) },
    onDuplicatePreset: id => { applyEdit(duplicatePreset(content, id, makeId)) },
    onChooseForm: (objectId, axisId, formId) => test.setForm(objectId, axisId, formId),
    onAddForm: (objectId, axisId, fromCurrent) => {
      const count = objectById(content, objectId)?.axes?.find(a => a.id === axisId)?.options.length ?? 0
      const e = addForm(content, objectId, axisId, fromCurrent ? drawnOutlines(objectId) : {}, `Form ${count + 1}`, makeId)
      if (applyEdit(e) && e.ok && e.formId) test.setForm(objectId, axisId, e.formId)
    },
  }
  // the shape editor's tree of zones (Z2)
  actions.shapeTree = shapesOnly ? {
    onSelect: choose,
    onSelectPoint: (shapeId, i) => { choose({ kind: 'shape', id: shapeId }); selectPoint(i) },
    onAddZone: () => {
      const id = freshId(content, 'z', makeId), e = addZone(content, { id, name: `Zone ${zonesOf(content).length + 1}`, groups: [] })
      if (applyEdit(e)) choose({ kind: 'zone', id })
    },
    onAddGroupIn: zoneId => {
      if (content.groups.length >= policy.max.groups) { setNote(`A model may have at most ${policy.max.groups} groups.`); return }
      const r = newGroupIn(content, zoneId, makeId)
      if (commit(r.content, true)) choose({ kind: 'group', id: r.groupId })
    },
    onAddObject: actions.onAddObject,
    onShapeForm: objectId => openShapeFormInView(objectId),
    onMoveCard: (kind, id, parent, before) => {
      if (kind === 'zone') { commit(moveZone(content, id, before), true); return }
      if (!parent) return
      applyEdit(kind === 'group' ? moveGroupTo(content, id, parent, before) : kind === 'object' ? moveObjectTo(content, id, parent, before, policy.max.objectsPerGroup) : moveShapeTo(content, id, parent, before, policy.max.shapesPerObject))
    },
    onToggleHidden: test.toggleHidden,
    onSetHidden: (ids, hide) => test.setHidden(ids, hide),
    onToggleModelHidden: actions.onToggleModelHidden,
  } : undefined

  // Paste (T2): the copied shape into the selection's object (else a new one), under the pointer when it is over the canvas, else a little right of and below where it was.
  function pasteHere() {
    const into = contextObject(content, sel)
    const base = into ? { content, objectId: into } : addObjectOn('body')
    const obj = objectById(base.content, base.objectId)
    if (obj && obj.shapes.length >= policy.max.shapesPerObject) { setNote(`An object may have at most ${policy.max.shapesPerObject} shapes.`); return }
    const id = freshId(base.content, 's', makeId), shape = clipboard.pasted(id, pointerRef.current)
    if (shape && commit(addShape(base.content, base.objectId, shape), true)) choose({ kind: 'shape', id })
  }
  // Ctrl + click (T2): a point is removed; a segment's two points are joined into one at its middle (a symmetric shape's copies do the same).
  function removeAt(t: RemoveTarget, keepSelection = false) {
    if (recording) return
    const s = shapeById(content, t.id)
    if (!s) return
    if (s.mirrorOf) {
      // on a mirror (Z3): the point or segment of its original that it shows
      const o = shapeById(content, s.mirrorOf)
      if (!shapesOnly || !o || o.mirrorOf || !usesMirrorLine(content, s)) return
      if (!(sel.kind === 'shape' && sel.id === s.id)) choose({ kind: 'shape', id: s.id })
      const n = o.pts.length
      removeAt(t.kind === 'point' ? { kind: 'point', id: o.id, i: originalPoint(n, t.i) } : { kind: 'segment', id: o.id, e: originalSegment(n, t.e) }, true)
      return
    }
    if (s.cloneOf) {
      // on a clone (Z4): the point or segment of its original that it shows (a flipped clone runs the other way round)
      const o = shapeById(content, s.cloneOf)
      if (!shapesOnly || !o || o.cloneOf || o.mirrorOf) return
      if (!(sel.kind === 'shape' && sel.id === s.id)) choose({ kind: 'shape', id: s.id })
      const flipped = !!(s.cloneAt ?? objectOfShape(content, s.id)?.cloneAt)?.flip, n = o.pts.length
      const i = t.kind === 'point' ? (flipped ? originalPoint(n, t.i) : t.i) : (flipped ? originalSegment(n, t.e) : t.e)
      removeAt(t.kind === 'point' ? { kind: 'point', id: o.id, i } : { kind: 'segment', id: o.id, e: i }, true)
      return
    }
    if (!keepSelection && !(sel.kind === 'shape' && sel.id === s.id)) choose({ kind: 'shape', id: s.id })
    const few = 'A shape needs at least three points.'
    if (t.kind === 'point') {
      const next = deletePoint(s, t.i)
      if (!next) { setNote(few); return }
      editShape(s.id, next, Math.max(0, Math.min(t.i, next.pts.length - 1)))
      return
    }
    const joined = joinSegment(s, t.e)
    if (!joined) { setNote(few); return }
    const j = (t.e + 1) % s.pts.length, at = t.e < j ? t.e : t.e - 1
    if (!s.sym) { editShape(s.id, joined, at); return }
    const moved = followSymmetry(s, movePoint(s, t.e, joined.pts[at].x, joined.pts[at].y))
    if (moved.refused) { setNote(moved.refused); return }
    const fewer = deletePoint(moved.shape, j)
    if (!fewer) { setNote(few); return }
    const f = followSymmetry(moved.shape, fewer)
    if (f.refused) { setNote(f.refused); return }
    editShape(s.id, f.shape, undefined, true)
  }
  // The new-shape form (shape types T1): opened where a right-click was, or (the New shape button, a tree's add button) in the middle of what the panels leave of the canvas.
  function openShapeForm(clientX: number, clientY: number, objectId: string | null = null) {
    const r = stageRef.current?.getBoundingClientRect(), toWorld = worldRef.current
    if (!r || !toWorld) return
    const [x, y] = toWorld(clientX, clientY)
    setShapeForm({ left: clientX - r.left, top: clientY - r.top, x, y, objectId })
  }
  function openShapeFormInView(objectId: string | null = null) {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r) return
    openShapeForm(r.left + insets.left + Math.max(0, r.width - insets.left - insets.right) / 2, r.top + Math.max(0, r.height - insets.bottom) / 2, objectId)
  }
  // Create: the chosen shape where the form was opened, into the object it was opened for, else the selection's, else a new object on the Body layer.
  function createFromForm() {
    if (!shapeForm) return
    const into = shapeForm.objectId && objectById(content, shapeForm.objectId) ? shapeForm.objectId : contextObject(content, sel)
    setShapeForm(null)
    const from = { kind: formChoice.kind, at: [shapeForm.x, shapeForm.y] as [number, number] }, t = templateOfChoice(formChoice)
    if (into) { addShapeTo(into, t, content, from); return }
    const r = addObjectOn('body')
    addShapeTo(r.objectId, t, r.content, from)
  }
  // A box dragged out on the empty grid (Z1): a rectangle there (a square when Shift kept it square), into the selected object, else into a new object.
  function drawRectangle(box: Box) {
    const into = contextObject(content, sel), from = { kind: 'base' as FormKind, at: [box.x + box.w / 2, box.y + box.h / 2] as [number, number], box }
    const template = Math.abs(box.w - box.h) < 1e-6 ? 'square' : 'rectangle'
    if (into) { addShapeTo(into, template, content, from); return }
    const r = addObjectOn('body')
    addShapeTo(r.objectId, template, r.content, from)
  }
  // The canvas's "new shape" button: into the selected object, else into a new object (and group) on the Body layer.
  function newShapeFromCanvas(templateId: string) {
    const inObject = contextObject(content, sel)
    if (inObject) { addShapeTo(inObject, templateId, content); return }
    const r = addObjectOn('body')
    addShapeTo(r.objectId, templateId, r.content)
  }

  // ---- the taper tool ----

  // Where a new ribbon goes: into the selected object (or the selected shape's), else into a new body object.
  const taperObject = contextObject(content, sel)
  const taperInto = taperObject ? objectById(content, taperObject)?.name.trim() || 'the selected object' : 'a new object'
  const taperPreview = (() => {
    if (taperSpine.length < 2) return null
    const pts = taperOutline(taperSpine, taperSpec)
    return pts ? pathText(build(pts, true), true) : null
  })()
  // The ribbon made from the line laid on the canvas. The line is in the canvas's space; a shape keeps its points in its group's own space, so the line is read back through the
  // group's matrix as it is drawn now (it lands where it was laid, whatever the sliders are doing).
  function makeTaper() {
    if (taperSpine.length < 2) { setNote('Lay at least two points of the line first.'); return }
    const base = taperObject ? { content, objectId: taperObject } : addObjectOn('body')
    const obj = objectById(base.content, base.objectId)
    if (obj && obj.shapes.length >= policy.max.shapesPerObject) { setNote(`An object may have at most ${policy.max.shapesPerObject} shapes.`); return }
    const g = groupOfObject(base.content, base.objectId)
    const back = inverse(mul(solved.global, (g && solved.mats[g.id]) || IDENTITY))
    const pts = taperOutline(taperSpine.map(([x, y]) => apply(back, x, y)), taperSpec)
    if (!pts) { setNote('The line needs two points that are apart.'); return }
    const id = freshId(base.content, 's', makeId)
    const shape: ModelShape = { ...newShape(id, 'Ribbon', 'path', { x: 0, y: 0, w: 10, h: 10 }), pts, template: null }
    if (commit(addShape(base.content, base.objectId, shape), true)) { choose({ kind: 'shape', id }); setTaperSpine([]) }
  }
  // Turning the selected open line into a ribbon along its own path (its curve, not only its points).
  const taperLine = selShape && !selShape.closed ? {
    name: selShape.name.trim() || 'the line',
    blocked: !editable ? 'This line is shown, not edited here (a twin, a shape a slider moves, or one hidden in this form)' : turnAngle !== 0 ? 'Taper a line in the front view' : selShape.pts.length < 2 ? 'The line needs two points' : null,
  } : null
  function taperSelected() {
    const cs = selShape ? shapeById(canvasContent, selShape.id) : undefined
    if (!cs || !taperLine || taperLine.blocked) return
    const pts = taperOutline(flatten(build(cs.pts, false), false), taperSpec)
    if (!pts) { setNote('The line needs two points that are apart.'); return }
    editShape(cs.id, { ...cs, closed: true, pts, half: 0, skin: [] }, 0)
  }
  const taperCanvas = tapering && !recording && !poseMode ? {
    spine: taperSpine, preview: taperPreview, onFinish: makeTaper,
    onAdd: (x: number, y: number) => setTaperSpine(list => (list.length >= 200 ? list : [...list, [x, y]])),
    onBack: () => setTaperSpine(list => list.slice(0, -1)),
  } : null

  // ---- the pivot and the anchor on the canvas ----

  const atRest = away === 0 && !recording
  const pivot: PivotMarker | null = (() => {
    if (!group || sel.kind === 'none') return null
    const p = solved.pivots[group.id]
    if (!p) return null
    const [x, y] = apply(solved.global, p[0], p[1])
    return { groupId: group.id, name: group.name.trim() || 'the group', x, y, draggable: atRest && !group.mirrorOf }
  })()
  const anchorSpot = (() => {
    const a = group ? solved.anchors[group.id] : null
    return a ? apply(solved.global, a[0], a[1]) : null
  })()
  const ancestorShapes = group?.parent ? content.shapes.filter(s => { const home = groupOfShape(content, s.id); return !!home && chainOf(content, group.parent!).includes(home) && outlineSize(content, s) >= 3 }) : []
  // linking a point: any other shape with an outline can be clicked; picking an anchor: the shapes of the parent and above
  const linkPick = linkMode && selShape && !selShape.mirrorOf ? { shapes: content.shapes.filter(s => s.id !== selShape.id && outlineSize(content, s) >= 3 && !!solved.shapes[s.id]?.d).map(s => s.id) } : null
  // choosing what the selected shape is clipped to, or cut by: any other shape that is drawn (a helper too)
  const paintPickShapes = paintPick && selShape ? { shapes: content.shapes.filter(s => s.id !== selShape.id && !!solved.shapes[s.id]?.d).map(s => s.id) } : null
  // choosing the end of a bone: a pivot marker of any group, or a shape (its nearest point to the click)
  const bonePickData = bonePick ? {
    shapes: content.shapes.filter(s => s.pts.length >= 3 && !!solved.shapes[s.id]?.d).map(s => s.id),
    groups: content.groups.filter(g => solved.pivots[g.id]).map(g => { const [x, y] = apply(solved.global, ...solved.pivots[g.id]); return { id: g.id, name: g.name.trim() || 'Untitled group', x, y } }),
  } : null
  // choosing the shape the selected object stretches to
  const selObject = sel.kind === 'object' ? objectById(content, sel.id) : sel.kind === 'shape' ? objectOfShape(content, sel.id) : undefined
  const fitPickData = fitPick && selObject ? { shapes: stretchTargets(content, selObject.id).filter(id => !!solved.shapes[id]?.d) } : null
  // making a bridge: any shape that is drawn and is not a twin (the spots are on the edges of the original parts)
  const bridgePickData = bridgeSpots ? { shapes: content.shapes.filter(s => !s.mirrorOf && !s.shade && outlineSize(content, s) >= 3 && !!solved.shapes[s.id]?.d).map(s => s.id) } : null
  // copying skin weights: any other shape with an outline
  const skinPickShapes = skinPick && skinning && selShape ? { shapes: content.shapes.filter(s => s.id !== selShape.id && outlineSize(content, s) >= 3 && !!solved.shapes[s.id]?.d).map(s => s.id) } : null
  const pick = bridgePickData ?? bonePickData ?? fitPickData ?? linkPick ?? paintPickShapes ?? skinPickShapes ?? (pickOn && group?.attach ? { shapes: ancestorShapes.map(s => s.id) } : null)

  // Dragging the pivot of a group: an unanchored one moves to the pointer (read back into the group's own space); an anchored one is fixed again at the
  // nearest place of the same kind on its shape.
  function movePivot(wx: number, wy: number) {
    if (!group) return
    if (group.attach) {
      const att = attachFromClick(solved, group.attach.kind, group.attach.shape, wx, wy, group.attach.slider)
      const e = att ? attachGroup(content, group.id, att) : null
      if (e?.ok) models.edit(entry.id, () => e.content, false)
      return
    }
    const [px, py] = apply(inverse(solved.global), wx, wy)
    const pm = group.parent ? solved.mats[group.parent] : undefined
    const [x, y] = pm ? apply(inverse(pm), px, py) : [px, py]
    models.edit(entry.id, c => setPivot(c, group.id, x, y), false)
  }
  // The arrow keys on the pivot. A free pivot moves in canvas units; the pivot of an anchored group is its anchor, which steps along what it is fixed to:
  // to the next or previous point, along the edge, or across and down the shape (Shift: bigger steps).
  function nudgePivot(dx: number, dy: number) {
    if (!group) return
    const att = group.attach
    if (att) {
      const big = Math.abs(dx) + Math.abs(dy) > 1, step = big ? 0.1 : 0.02, dir = dx + dy < 0 ? -1 : 1
      const n = shapeById(content, att.shape)?.pts.length ?? 1
      const unit = (v: number) => Math.max(0, Math.min(1, Math.round(v * 100) / 100))
      const next = att.kind === 'point' ? { ...att, i: ((att.i + dir) % n + n) % n }
        : att.kind === 'inside' ? { ...att, rx: unit(att.rx + Math.sign(dx) * step), ry: unit(att.ry + Math.sign(dy) * step) }
        : { ...att, t: unit(att.t + dir * step) }
      applyEdit(attachGroup(content, group.id, next))
      return
    }
    const p = group.pivot ?? restPivot(content, group)
    commit(setPivot(content, group.id, p[0] + dx, p[1] + dy))
  }
  // The arrow keys on a linked point adjust the link: along the edge (or across, for a follow) with left and right, outward (or down) with up and down.
  function nudgeLink(dx: number, dy: number) {
    const b = selShape?.pts[selPoint]?.bind
    if (!selShape || !b) return
    const sideways = Math.abs(dx) >= Math.abs(dy), dir = (sideways ? dx : dy) < 0 ? -1 : 1, big = Math.abs(dx) + Math.abs(dy) > 1
    commit(stepLink(content, selShape.id, selPoint, b.kind === 'edge' ? (sideways ? 't' : 'o') : sideways ? 'dx' : 'dy', dir, big))
  }
  function onPick(shapeId: string, wx: number, wy: number) {
    if (bridgeSpots) {
      const [x, y] = apply(inverse(solved.global), wx, wy)
      const spot = spotFromClick(content, shapeId, x, y)
      if (!spot) { setNote('That shape has no edge to join.'); return }
      const [a, b] = [bridgeSpots[0]?.shape, bridgeSpots[1]?.shape]
      if (bridgeSpots.length === 1 && spot.shape === a) { setNote('Click the other part for the second spot: a bridge joins two different parts.'); return }
      if (bridgeSpots.length === 2 && spot.shape !== a && spot.shape !== b) { setNote('The other side runs between the same two parts: click an edge of one of them.'); return }
      if (bridgeSpots.length === 3 && spot.shape === bridgeSpots[2].shape) { setNote('Click an edge of the other part for the last spot.'); return }
      const spots = [...bridgeSpots, spot]
      setNote('')
      if (spots.length < 4) { setBridgeSpots(spots); return }
      const e = bridgeBetween(content, spots, makeId)
      if (applyEdit(e)) {
        setBridgeSpots(null)
        if (e.ok && e.shapeId) { setSel({ kind: 'shape', id: e.shapeId }); setSelPoint(0) }
      }
      return
    }
    if (bonePick) {
      const at = attachFromClick(solved, 'point', shapeId, wx, wy)
      if (at && applyEdit(setBoneEnd(content, bonePick, { kind: 'point', id: shapeId, i: at.i }))) setBonePick(null)
      return
    }
    if (fitPick && selObject) {
      if (applyEdit(setObjectFit(content, selObject.id, 'stretch', shapeId))) setFitPick(false)
      return
    }
    if (skinPick && selShape) {
      if (applyEdit(copySkin(content, selShape.id, shapeId))) setSkinPick(false)
      return
    }
    if (paintPick && selShape) {
      const e = paintPick === 'clip' ? paintOps.setClip(content, selShape.id, shapeId) : paintOps.toggleCut(content, selShape.id, shapeId)
      if (applyEdit(e)) setPaintPick(null)
      return
    }
    if (linkMode && selShape) {
      const [x, y] = apply(inverse(solved.global), wx, wy)
      const e = linkMode === 'edge' ? linkToEdge(content, selShape.id, selPoint, shapeId, x, y) : linkToPoint(content, selShape.id, selPoint, shapeId, x, y, linkMode)
      if (applyEdit(e)) setLinkMode(null)
      return
    }
    if (!group?.attach) return
    const att = attachFromClick(solved, group.attach.kind, shapeId, wx, wy, group.attach.slider)
    if (att && applyEdit(attachGroup(content, group.id, att))) setPickOn(false)
  }

  const stageNote = bridgeSpots ? `Bridge: ${['click the edge of the first part, where one side of the bridge leaves it', 'click the edge of the other part, where that side arrives', 'for the other side, click an edge of either part', 'click the edge of the other part again'][bridgeSpots.length]} (spot ${bridgeSpots.length + 1} of 4). Escape stops.`
    : skinPick && skin ? 'Click the shape to copy the skin weights from (the one under this shape). Escape stops.'
    : skin ? 'Skin weights: click a point to raise its weight a tenth (Shift: lower it), or drag to paint the points inside the dashed circle. A dashed ring shows how much a point follows the chosen group.'
    : weights ? 'Weights: click a point (or press Enter) to step how free it is to hang; the arrow keys step it too. A ring round a point shows its weight.'
    : weighing && selShape && !editable ? (pointDriven ? 'A slider changes this shape\'s points and is away from rest: set the sliders back to rest to change its weights.' : 'This shape is shown, not edited.')
    : throughFrame ? `Looking through ${through?.name.trim() || 'the frame'}: the figure is cropped to it, without what it leaves out. Choose Whole figure in the Frames tab to go back.`
    : bonePick ? 'Click the pivot marker of a group, or a shape, for the end of the bone. Escape stops.'
    : fitPick && selObject ? `Click the shape ${selObject.name.trim() || 'this object'} is to stretch to. Escape stops.`
    : tab === 'frames' && frameCanvas ? 'Frames: drag the outlined rectangle to move the frame, its handles to resize it. Press Enter on a rectangle to edit it.'
    : recording ? 'Recording: drag the points, then press Set in the Ranges tab.'
    : poseMode ? 'Pose mode: the figure is grabbed, not edited. The sliders in the Ranges tab do the same from the keyboard.'
    : linkMode ? `Click the shape to link point ${selPoint + 1} to. Escape stops.`
    : paintPick && selShape ? `Click the shape ${selShape.name.trim() || 'this shape'} is to be ${paintPick === 'clip' ? 'clipped to' : 'cut by (click it again to stop)'}. Escape stops.`
    : formTarget && selShape && hiddenByForm ? `${selShape.name.trim() || 'This shape'} is hidden in the form ${formTarget.form.name.trim() || 'chosen'}: use the base outline for it in the Forms tab, or choose another form.`
    : formTarget && selShape ? `Editing the form ${formTarget.form.name.trim() || 'chosen'} of ${formTarget.axis.name.trim() || 'the axis'}: the points you move change only this form.`
    : selShape && switchedOff ? `${selShape.name.trim() || 'This shape'} is switched off with the eye: show it to edit it.`
    : selShape?.mirrorOf ? `This is the twin of ${shapeById(content, selShape.mirrorOf)?.name.trim() || 'another shape'}: it mirrors it. Edit the original, or break the pair.`
    : selShape?.copyOf && selShape.hide ? `${selShape.name.trim() || 'This shape'} is left out of this member: show it again in the Shape tab to edit it.`
    : selShape?.copyOf && selShape.pts.length < 3 ? `${selShape.name.trim() || 'This shape'} follows the pattern: move a point to give it an outline of its own, or edit the pattern.`
    : selShape?.copyOf ? `${selShape.name.trim() || 'This shape'} has an outline of its own: follow the pattern again from the Shape tab to drop it.`
    : selShape && selWhere === 'between' ? `Seen between key angles (${Math.round(turnAngle)}°): turn to a multiple of 15 degrees to draw ${selShape.name.trim() || 'the shape'} there, or go back to the front.`
    : selShape && selWhere === 'key' ? (solved.shapes[selShape.id]?.angle?.drawn ? 'Drawn at this angle: the points you move change its outline here only.' : 'Key angle: it is turned from the front here; move a point to draw it here (it keeps the front\'s points).')
    : selShape && selWhere === 'back' ? 'Back view: a shape shows its front outline from behind until you edit its points here; then it has an outline of its own for the back.'
    : selShape && pointDriven ? 'A slider changes this shape\'s points and is away from rest: set the sliders back to rest to edit it.'
    : selShape ? 'Drag a point, a curve handle or the shape; right-click a point or a segment to change it; double-click a segment to add a point.'
    : sel.kind === 'none' ? 'Nothing is selected: this is the end result.' : 'Pick a shape in the tree to edit its points.'

  // The shape editor's Arrange section (S4): Keep proportions, the middle of the model in the shape's own space, and Forward and Back within its object.
  const arrangeObject = shapesOnly && selShape ? objectOfShape(content, selShape.id) : undefined
  const arrangeAt = selShape ? solved.shapes[selShape.id] : undefined
  const arrangeIndex = selShape && arrangeObject ? arrangeObject.shapes.indexOf(selShape.id) : -1
  // Align with everything connected (engine/align.ts): the box around the shapes and every shape connected to them is centred on the model's middle, as one undo step.
  function alignAll(seeds: string[], axis: 'x' | 'y') {
    const r = alignConnected(content, canvasSolved, seeds, axis, axis === 'x' ? content.axis : MODEL_MIDDLE_Y)
    if (!r.ok) { setNote(r.reason); return }
    if (r.content !== content) commit(r.content, true)
  }
  const onAlignPart = shapesOnly && !recording ? (kind: 'object' | 'group', id: string, axis: 'x' | 'y') => {
    const objects = kind === 'object' ? [id] : groupById(content, id)?.objects ?? []
    alignAll(objects.flatMap(oid => objectById(content, oid)?.shapes ?? []), axis)
  } : undefined
  const arrange: ArrangeActions | undefined = shapesOnly && selShape ? {
    keep: keepRatio, onKeep: setKeepRatio,
    centre: arrangeAt ? apply(inverse(arrangeAt.matrix), content.axis, MODEL_MIDDLE_Y) : [content.axis, MODEL_MIDDLE_Y],
    onStep: (id, dir) => { commit(stepShape(content, id, dir), true) },
    // a shape connected to others aligns with them; a lone one aligns by itself (the panel does it)
    onAlign: axis => {
      if (recording || selShape.mirrorOf || selShape.cloneOf || alignSet(content, [selShape.id]).length < 2) return false
      alignAll([selShape.id], axis)
      return true
    },
    canForward: !!arrangeObject && arrangeIndex >= 0 && arrangeIndex < arrangeObject.shapes.length - 1,
    canBack: arrangeIndex > 0,
  } : undefined

  // The shape editor's connections (S5): connecting a dropped point (part of the drag's undo step), pulling a point free with a right-drag (an undo step of its own, before
  // the drag), adding a point to a shared segment, and naming and cutting connections in the panel.
  const connectTool: ConnectTool | null = shapesOnly ? {
    onConnect: (sid, i, target) => {
      const tried = connect(content, canvasSolved, sid, i, target)
      if (!tried.ok) { setNote(tried.reason); return }
      const cast = castRefusal(content, tried.content)
      if (cast) { setNote(cast); return }
      models.edit(entry.id, c => { const e = connect(c, canvasSolved, sid, i, target); return e.ok ? e.content : c })
    },
    onLoosen: (sid, i, x, y) => {
      if (!recording) setHistory(h => remember(h, content))
      models.edit(entry.id, c => updateShape(loosen(c, canvasSolved, sid, i), sid, sh => movePoint(sh, i, x, y)))
    },
    onAddShared: (sid, e, x, y) => {
      const next = addPointShared(content, canvasSolved, sid, e, x, y, policy.max.points)
      if (!next) { setNote(`A shape may have at most ${policy.max.points} points.`); return }
      commit(next, true)
    },
    // a symmetric shape's point back on the axis its side crosses (its copies on the matching axes too)
    onRestoreLinePoint: (sid, e) => {
      const sh = shapeById(content, sid), restored = sh ? restoreLinePoint(sh, e) : null
      if (!sh || !restored) return
      if (restored.pts.length > policy.max.points) { setNote(`A shape may have at most ${policy.max.points} points.`); return }
      editShape(sid, restored, undefined, true)
    },
  } : null
  // The shape editor's symmetry (S6): choosing the axes in the panel, then the side on the canvas; turning it on lets go of the shape's own connections (a symmetric shape's
  // points follow nothing) and keeps the connections to it by place; turning it off keeps every point.
  const symChoosing = symChoose && selShape && symChoose.id === selShape.id ? { a: symChoose.a, n: symChoose.n } : null
  const symmetry: SymmetryActions | undefined = shapesOnly && selShape ? {
    choosing: symChoosing,
    onStart: () => setSymChoose({ id: selShape.id, a: 90, n: 1 }),
    onChoose: (a, n) => setSymChoose({ id: selShape.id, a, n }),
    onCancel: () => setSymChoose(null),
    onOff: id => { commit(updateShape(content, id, sh => disableSymmetry(sh)), true) },
  } : undefined
  const symCanvas = shapesOnly && selShape && symChoosing ? {
    choosing: symChoosing,
    onPick: (side: number) => {
      let base = content
      shapeById(base, selShape.id)?.pts.forEach((pt, i) => { if (pt.bind) base = disconnect(base, canvasSolved, selShape.id, i) })
      const made = enableSymmetry(shapeById(base, selShape.id)!, symChoosing, side, policy.max.points)
      if (!made.ok) { setNote(made.reason); return }
      const kept = rebindByPlace(base, canvasSolved, updateShape(base, selShape.id, () => made.shape), selShape.id)
      if (commit(kept.content, true)) { setSymChoose(null); selectPoint(0) }
    },
  } : null
  const connections: ConnectionActions | undefined = shapesOnly ? {
    part,
    onName: (sid, i, field, value) => models.edit(entry.id, c => nameConnection(c, sid, i, field, value)),
    onDisconnect: (sid, i, both) => {
      const n = shapeById(content, sid)?.pts.length ?? 0
      const once = disconnect(content, canvasSolved, sid, i)
      commit(both && n ? disconnect(once, canvasSolved, sid, (i + 1) % n) : once, true)
    },
    copyShare: (sid, e) => copyShareAt(canvasContent, canvasSolved, sid, e),
  } : undefined

  // The selected point's pivot section (joints J2): the turn and limits of the pivot point it is (its own link, a symmetric copy's, or a point welded to it).
  const selJoint = shapesOnly && selShape && part === 'point' ? jointAt(content, selShape.id, selPoint) : null
  // the line the selected mirror, or the selected shape's mirror, is reflected across (Z3), in canvas space
  const mirrorAxis = (() => {
    if (!shapesOnly || !selShape) return null
    const tw = selShape.mirrorOf ? selShape : content.shapes.find(s => s.mirrorOf === selShape.id)
    if (!tw || !usesMirrorLine(content, tw)) return null
    const S = tw.mirrorLine ? shapeById(content, tw.mirrorLine.shape) : undefined, f = S ? canvasSolved.shapes[S.id]?.frame : undefined
    const ax = S && f && tw.mirrorLine ? axisOf(S, tw.mirrorLine.k, f) : null
    const g = canvasSolved.global, a = ((ax ? ax.angle : 90) * Math.PI) / 180
    const [x, y] = apply(g, ax ? ax.x : content.axis ?? 100, ax ? ax.y : 200)
    return { x, y, dx: g[0] * Math.cos(a) + g[2] * Math.sin(a), dy: g[1] * Math.cos(a) + g[3] * Math.sin(a) }
  })()
  // the selected symmetric shape's line of symmetry as handles (Z5): its ends (carried on through the shapes connected to it on the same line) and its width handle
  const lineShape = shapesOnly && selShape && part === 'shape' && editable && !recording ? shapeById(canvasContent, selShape.id) : undefined
  const shared = lineShape ? sharedLine(canvasContent, canvasSolved, lineShape.id) : null
  const lineHandles: LineHandles | null = shared ? { a: shared.a, b: shared.b, side: widthHandle(lineShape, canvasSolved), shared: shared.ids.length > 1 } : null
  // A drag of one of them works from the content as it was when it began, so the shapes keep their shares however far it goes.
  const lineStart = useRef<{ c: ModelContent; solved: Solved; id: string; ids: string[]; a: [number, number]; b: [number, number]; side: [number, number] | null } | null>(null)
  function moveLine(handle: LineGrab, world: [number, number], first: boolean) {
    if (first || !lineStart.current) {
      const line = selShape ? sharedLine(canvasContent, canvasSolved, selShape.id) : null
      if (!selShape || !line) { lineStart.current = null; return }
      lineStart.current = { c: content, solved: canvasSolved, id: selShape.id, ids: line.ids, a: line.a, b: line.b, side: widthHandle(shapeById(canvasContent, selShape.id), canvasSolved) }
    }
    const st = lineStart.current
    const own = handle === 'side' ? lineOf(shapeById(st.c, st.id), st.solved) : null
    const m = handle === 'side' ? (own && st.side ? widenMat(own, st.side, world) : null) : handle === 'a' ? stretchMat(st.b, st.a, world) : stretchMat(st.a, st.b, world)
    if (!m) return
    const done = applyOnCanvas(st.c, st.solved, handle === 'side' ? [st.id] : st.ids, m)
    if (!done.ok) { setNote(done.reason); return }
    const next = done.content
    models.edit(entry.id, () => next, false)
  }
  // the shape editor's mirrors (Z3): make one, change its line, detach it
  const mirrorActions: MirrorActions | undefined = shapesOnly ? {
    options: (kind, twinId) => {
      const thing = kind === 'shape' ? shapeById(content, twinId) : objectById(content, twinId)
      const originalId = thing?.mirrorOf ?? twinId
      return mirrorLineOptions(content, kind === 'shape' ? [originalId] : objectById(content, originalId)?.shapes ?? [])
    },
    onMirror: (kind, id) => {
      const r = makeMirror(content, kind, id, makeId)
      if (applyEdit(r.edit) && r.twinId) choose({ kind, id: r.twinId })
    },
    onLine: (kind, twinId, line) => { commit(setMirrorLine(content, kind, twinId, line), true) },
    onDetach: (kind, twinId) => { applyEdit(breakPair(content, kind, twinId)) },
  } : undefined
  // the shape editor's clones (Z4): make one, place a clone object, detach one
  const cloneActions: CloneActions | undefined = shapesOnly ? {
    onClone: (kind, id) => {
      const r = makeClone(content, kind, id, makeId, { shapes: policy.max.shapesPerObject, objects: policy.max.objectsPerGroup })
      if (applyEdit(r.edit) && r.cloneId) choose({ kind, id: r.cloneId })
    },
    onDetach: (kind, id) => { applyEdit(detachClone(content, kind, id, canvasSolved)) },
    onPlace: (objectId, at) => { commit(setCloneAt(content, 'object', objectId, at), true) },
  } : undefined
  const jointActions: JointActions | undefined = selShape && selJoint ? {
    joint: selJoint,
    onSetting: (key, v) => { commit(setJointSetting(content, selShape.id, selPoint, key, v), true) },
  } : undefined
  // Pose mode in the shape editor (joints J3): on while a group or an object is selected (objects are the posable segments of a group). With a group selected any of its objects
  // can be dragged, with an object that object (all its shapes together). A press that moves poses; one that stays put selects as usual, which leaves Pose mode. Each drag is
  // one undo step.
  const posingOn = shapesOnly && !recording && !through && (sel.kind === 'group' || sel.kind === 'object')
  const inPoseScope = (shapeId: string): boolean => (sel.kind === 'group' ? groupOfShape(content, shapeId) === sel.id : sel.kind === 'object' ? objectOfShape(content, shapeId)?.id === sel.id : false)
  function shapePoseBegin(grab: PoseGrab, world: [number, number]): boolean {
    const at = toModel(solved, world[0], world[1])
    const target = grab.kind === 'slider' ? shapeById(content, grab.shapeId)?.pts[grab.i]?.bind?.s : undefined
    const r = grab.kind === 'part' ? beginPose(content, grab.shapeId, at)
      : grab.kind === 'mark' ? beginReach(content, grab.shapeId, grab.markId, at)
      : grab.kind === 'slider' && target ? beginSlide(content, grab.shapeId, grab.i, drawnOf(content, canvasSolved, target))
      : null
    if (!r) return false
    if (!r.ok) { setNote(r.reason); return false }
    shapePoseRef.current = { drag: r.drag, start: content, changed: r.content !== content }
    if (r.content !== content) { setHistory(h => remember(h, content)); models.edit(entry.id, () => r.content, false) }
    setNote('')
    return true
  }
  function shapePoseMove(world: [number, number]) {
    const d = shapePoseRef.current
    if (!d) return
    const next = movePose(d.start, d.drag, toModel(solved, world[0], world[1]))
    if (!d.changed) { setHistory(h => remember(h, d.start)); d.changed = true }
    models.edit(entry.id, () => next, false)
  }
  function shapePoseCancel() {
    const d = shapePoseRef.current
    shapePoseRef.current = null
    if (d?.changed) models.edit(entry.id, () => d.start, false)
  }
  // what Pose mode can grab: the shapes of a figure with a pivot, a posable point, a slider
  const poseHandles = content.shapes.some(s => marksOf(s).some(m => m.kind === 'pose') || s.pts.some(isSlider))
  const shapePose: PoseCanvas | null = posingOn && (poseOf(content).posable.size > 0 || poseHandles) ? {
    joints: [], scales: [], slides: [], light: true,
    canPose: id => poseOf(content).posable.has(id) && inPoseScope(id),
    canGrab: id => inPoseScope(id),
    onDown: shapePoseBegin, onMove: shapePoseMove, onUp: () => { shapePoseRef.current = null }, onCancel: shapePoseCancel,
  } : null
  // the posable points and the sliders where they are drawn now (T5); a slider's stops are shown while its shape is edited
  const poseMarks = shapesOnly ? content.shapes.flatMap(s => marksOf(s).filter(m => m.kind === 'pose').map(m => {
    const [x, y] = apply(canvasSolved.shapes[s.id]?.matrix ?? IDENTITY, m.x, m.y)
    return { id: `${s.id}:${m.id}`, shapeId: s.id, markId: m.id, x, y, name: m.name }
  })) : undefined
  const sliderMarks = shapesOnly ? content.shapes.flatMap(s => s.pts.flatMap((p, i) => {
    const b = p.bind, r = canvasSolved.shapes[s.id], q = r?.local[i]
    if (!b?.slide || !r || !q) return []
    const a = drawnOf(content, canvasSolved, b.s)
    if (a.length < 2) return []
    const [x, y] = apply(r.matrix, q.x, q.y)
    return [{ id: `${s.id}:${i}`, shapeId: s.id, i, x, y, lo: placeAt(a, b.slide.lo), hi: placeAt(a, b.slide.hi), name: b.name ?? '', stops: sel.kind === 'shape' && sel.id === s.id }]
  })) : undefined
  function moveStop(shapeId: string, i: number, which: 'lo' | 'hi', world: [number, number]) {
    const s = shapeById(content, shapeId), b = s?.pts[i]?.bind
    if (!s || !b?.slide) return
    const a = drawnOf(content, canvasSolved, b.s)
    if (a.length < 2) return
    live(shapeId, setStop(s, i, which, nearestPlace(a, 0, a.length, world[0], world[1]), a.length))
  }
  // the anchors where they are drawn now
  const anchorMarks = shapesOnly ? content.shapes.flatMap(s => anchorsOf(s).map(m => {
    const [x, y] = apply(canvasSolved.shapes[s.id]?.matrix ?? IDENTITY, m.x, m.y)
    return { id: `${s.id}:${m.id}`, x, y, name: m.name }
  })) : undefined
  // where the pivot points are now (they move with the side that holds them)
  // the pivot points where they are drawn now (joints J2), each with the name of its link
  const pivotPoints = shapesOnly ? [...poseOf(content).joints.values()].map(j => {
    const at = poseOf(content).points.get(j.id) ?? j.at, [x, y] = apply(canvasSolved.global, at[0], at[1])
    return { id: j.id, x, y, name: shapeById(content, j.shape)?.pts[j.i]?.bind?.name ?? '' }
  }) : undefined

  // ---- the toolbars ----

  const consoleBar = (
    <ConsoleBar
      canUndo={history.past.length > 0 && !recording} canRedo={history.future.length > 0 && !recording} onUndo={undo} onRedo={redo}
      saveStatus={models.saveStatus} onSave={() => { void models.saveNow() }}
      autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: models.saveCountdown.nextSaveAt, wait: models.saveCountdown.wait }}
      onPublish={() => void models.publish(entry.id)} publishBlocked={faults.length > 0 ? 'Fix what the checks say first' : null} busy={busy}
      advanced={onAdvanced ? { on: policy.advanced, onToggle: onAdvanced } : undefined}
    />
  )
  // A lock at a crossing of two outlines is made in the model's own space, so it waits for the sliders at rest, the front view and the base outline.
  const lock: LockTool = {
    enabled: !shapesOnly && !!selShape && editable && atRest && awayAll === 0 && turnAngle === 0 && selWhere === 'front' && !formTarget && !through,
    stageOf: cr => (selShape ? lockStage(content, solved, selShape.id, cr).stage : 0),
    onAdvance: cr => { if (selShape) applyEdit(advanceLock(content, solved, selShape.id, cr)) },
  }
  const left = panelNow('left'), right = panelNow('right')
  const insets = { left: left.open ? left.w : PANEL_REST, right: right.open ? right.w : PANEL_REST, bottom: VIEW_BAR + (drawer ? DRAWER : 0) }
  const onPanelWidth = (side: 'left' | 'right') => (w: number, settled: boolean) => {
    if (settled) { setPanel(side, { w }); setDragW(null) } else setDragW({ side, w })
  }

  return (
    <div className="cmPane dzPane" onKeyDown={onKeyDown}>
      {barHost ? createPortal(consoleBar, barHost) : <div className="dzBarRow">{consoleBar}</div>}
      <fieldset className="cmFieldset dzFieldset" disabled={busy}>
        <div className="dzStage" ref={stageRef}>
          <DesignerCanvas
            content={canvasContent} solved={canvasSolved} sel={sel} part={part} selPoint={selPoint} mirror={mirror && !shapesOnly} snap={snap} layers={shapesOnly ? drawOrder(layerState).filter(id => SHAPE_LAYERS.includes(id)) : drawOrder(layerState)} gridSnap={gridSnap} zoom={zoom} fitAll={fitAll} viewKey={side} viewNonce={viewNonce} insets={insets}
            onViewMoved={() => setViewMoved(true)} axis={content.axis}
            editable={editable || (!!recording && !!selShape)} pivot={shapesOnly ? null : pivot} anchor={shapesOnly ? null : anchorSpot} pick={pick} onPick={onPick} onPickGroup={id => { if (bonePick && applyEdit(setBoneEnd(content, bonePick, { kind: 'group', id, i: 0 }))) setBonePick(null) }} pose={shapesOnly ? shapePose : poseCanvas} grips={gripMarks} colouring={colouring}
            frames={frameCanvas} through={throughFrame} weights={weights} skin={skin} taper={taperCanvas} lock={lock} onNote={setNote}
            linked={selShape ? selShape.pts.flatMap((pt, i) => (pt.bind ? [i] : [])) : []} linkShown={shapesOnly && selShape ? linkShown(content, selShape.id) : undefined} onNudgeLink={nudgeLink} onPivot={movePivot} onPivotNudge={nudgePivot}
            onSelect={choose} onSelectPoint={selectPoint} onSelectSegment={selectSegment} onZoom={setZoom} transform={shapesOnly} keepRatio={keepRatio} connect={connectTool} symmetry={symCanvas}
            onGesture={() => { if (!recording) setHistory(h => remember(h, content)) }}
            onShape={live} onMoveBody={shapesOnly ? moveBody : undefined} onEditShape={editShape}
            onRightClick={onRightClick} worldRef={worldRef} pointerRef={pointerRef}
            onDeleteShape={shapesOnly ? id => deleteSelection({ kind: 'shape', id }) : undefined} onRemove={shapesOnly ? removeAt : undefined}
            pivotPoints={pivotPoints} anchorMarks={anchorMarks} poseMarks={poseMarks} sliders={sliderMarks} onStop={shapesOnly ? moveStop : undefined}
            onDrawBox={shapesOnly && !recording ? drawRectangle : undefined}
            mirrorAxis={mirrorAxis} lines={lineHandles} onLine={shapesOnly ? moveLine : undefined}
            onEscape={() => { if (symChoosing) setSymChoose(null); else if (tapering) { if (taperSpine.length) setTaperSpine([]); else setTapering(false) } else if (bridgeSpots) setBridgeSpots(null); else if (skinPick) setSkinPick(false); else if (skinning) setSkinning(false); else if (weighing) setWeighing(false); else if (bonePick) setBonePick(null); else if (fitPick) setFitPick(false); else if (linkMode) setLinkMode(null); else if (paintPick) setPaintPick(null); else if (pickOn) setPickOn(false); else if (!recording) setSel(NONE) }}
          />

          <div className="dzNotes">
            {models.actionError && <p className="cmErr" role="alert">{models.actionError} <button type="button" className="cmLink" onClick={models.clearActionError}>Dismiss</button></p>}
            {note && <p className="cmErr" role="status">{note}</p>}
            {empty && !shapesOnly && <p className="cmHint">No shape yet. Use New shape to start from a template, or the + beside a layer in the tree.</p>}
            {!shapesOnly && <p className="cmStageNote" aria-live="polite">{stageNote}</p>}
          </div>

          {pointForm && pointForm.inside && shapeById(content, pointForm.id) && (
            <PointForm
              at={{ left: pointForm.left, top: pointForm.top }}
              onAnchor={() => {
                const s = shapeById(content, pointForm.id), spot = pointForm.inside
                setPointForm(null)
                if (!s || !spot) return
                const r = addFreeAnchor(s, spot[0], spot[1])
                if (!r.ok) setNote(r.reason); else editShape(s.id, r.shape)
              }}
              onPosable={() => {
                const s = shapeById(content, pointForm.id), spot = pointForm.inside
                setPointForm(null)
                if (!s || !spot) return
                const r = addFreePosable(s, spot[0], spot[1])
                if (!r.ok) setNote(r.reason); else editShape(s.id, r.shape)
              }}
              onClose={closePointForm}
            />
          )}
          {pointForm && !pointForm.inside && shapeById(content, pointForm.id)?.pts[pointForm.i] && (
            <PointForm
              at={{ left: pointForm.left, top: pointForm.top }} mode={shapeById(content, pointForm.id)!.pts[pointForm.i].m}
              onMode={m => { const s = shapeById(content, pointForm.id); if (s) editShape(s.id, setMode(s, pointForm.i, m, { axis: content.axis }), pointForm.i); setPointForm(null) }}
              pivot={!!jointAt(content, pointForm.id, pointForm.i)}
              onPivot={() => {
                const r = toggleJoint(content, pointForm.id, pointForm.i)
                setPointForm(null)
                if (!r.ok) setNote(r.reason); else commit(r.content, true)
              }}
              anchored={!!anchorOn(shapeById(content, pointForm.id)!, pointForm.i)}
              onAnchor={() => {
                const s = shapeById(content, pointForm.id), i = pointForm.i
                setPointForm(null)
                if (!s) return
                const r = toggleAnchor(s, i)
                if (!r.ok) setNote(r.reason); else editShape(s.id, r.shape, i)
              }}
              posable={!!posableOn(shapeById(content, pointForm.id)!, pointForm.i)}
              onPosable={() => {
                const s = shapeById(content, pointForm.id), i = pointForm.i
                setPointForm(null)
                if (!s) return
                const r = togglePosable(s, i)
                if (!r.ok) setNote(r.reason); else editShape(s.id, r.shape, i)
              }}
              slider={isSlider(shapeById(content, pointForm.id)!.pts[pointForm.i])}
              onSlider={shapeById(content, pointForm.id)!.pts[pointForm.i].bind?.kind === 'edge' ? () => {
                const s = shapeById(content, pointForm.id), i = pointForm.i
                setPointForm(null)
                if (!s) return
                if (isSlider(s.pts[i])) { editShape(s.id, stopSlider(s, i), i); return }
                const r = makeSlider(s, i)
                if (!r.ok) setNote(r.reason); else editShape(s.id, r.shape, i)
              } : undefined}
              onClose={closePointForm}
            />
          )}
          {shapeForm && (
            <ShapeForm
              at={{ left: shapeForm.left, top: shapeForm.top }} choice={formChoice} onChoice={setFormChoice} onCreate={createFromForm}
              onClose={closeShapeForm}
            />
          )}
          <ToolbarPanel side="left" title="Tree" label="Tree tools" state={left} min={PANEL_LIMITS.left.min} max={PANEL_LIMITS.left.max} onOpen={open => setPanel('left', { open })} onWidth={onPanelWidth('left')}>
            <TreeBar content={content} sel={sel} selPoint={part === 'point' ? selPoint : null} state={test.state} hidden={hiddenSet} models={nav} actions={actions} />
          </ToolbarPanel>

          <ToolbarPanel side="right" title="Editor" label="Editor tools" state={right} min={PANEL_LIMITS.right.min} max={PANEL_LIMITS.right.max} onOpen={open => setPanel('right', { open })} onWidth={onPanelWidth('right')}>
            <div className="dzModel">
              <input
                className="cmName" data-kf="" maxLength={NAME_MAX} aria-label="Model name" placeholder="Model name" value={content.name}
                onChange={e => models.edit(entry.id, c => ({ ...c, name: e.target.value }), false)}
              />
              <StatusBadge entry={entry} />
              <span className="cmToolGroup dzModelActions">
                <button type="button" className="cmBtn cmBtn--small" disabled={!published} onClick={() => void models.unpublish(entry.id)}><EyeOffIcon size={12} /> Unpublish</button>
                <button type="button" className="cmBtn cmBtn--small" onClick={() => void models.discard(entry.id)} title={published ? 'Put the draft back to the published version' : 'Clear the draft'}><UndoIcon size={12} /> Discard changes</button>
                <span className="cmMenuAnchor">
                  <button type="button" className="cmIconBtn" aria-label="Versions" title="Versions" aria-expanded={versions} onClick={() => setVersions(v => !v)}><HistoryIcon size={14} /></button>
                  {versions && <VersionsMenu entry={entry} onBring={v => { void models.restore(entry.id, v); setVersions(false) }} />}
                </span>
                <button type="button" className="cmIconBtn" aria-label="Duplicate the model" title="Duplicate the model" onClick={() => onDuplicate(entry.id)}><CopyIcon size={14} /></button>
                <button type="button" className="cmIconBtn" aria-label="Export the model to a file" title="Export the draft to a file" onClick={() => onExport(entry)}><ExportIcon size={14} /></button>
                {confirmDelete ? (
                  <span className="cmConfirm" role="group" aria-label="Delete the model?">
                    <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirmDelete(false); onRemove(entry.id) }}>Delete the model</button>
                    <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirmDelete(false)}>Keep it</button>
                  </span>
                ) : (
                  <button type="button" className="cmIconBtn" aria-label="Delete the model" title="Delete the model" onClick={() => setConfirmDelete(true)}><TrashIcon size={14} /></button>
                )}
              </span>
            </div>
            {entry.id === 'basic' && models.basicUpdate && !shapesOnly && (
              <div className="dzBasicUpdate" role="group" aria-label="A newer basic model">
                <p className="cmHint" role="status">A newer basic model came with this version of Scriblr. This one was left as it is because it had been changed.</p>
                {confirmUpdate ? (
                  <span className="cmConfirm" role="group" aria-label="Update the basic model?">
                    <button type="button" className="cmBtn cmBtn--primary cmBtn--small" onClick={() => { setConfirmUpdate(false); void models.updateBasic() }}>Replace the draft and publish</button>
                    <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirmUpdate(false)}>Not now</button>
                  </span>
                ) : (
                  <button
                    type="button" className="cmBtn cmBtn--small" disabled={busy} title="Put the newer basic model in place of this draft and publish it as the next version (the version published now stays in Versions)"
                    onClick={() => setConfirmUpdate(true)}
                  ><RestoreIcon size={12} /> Update the basic model</button>
                )}
              </div>
            )}

            <div className="cmToolbar dzTools" role="toolbar" aria-label="Designer tools">
              {!shapesOnly && <>
              <button type="button" className={`cmIconBtn${weighing ? ' cmIconBtn--on' : ''}`} aria-label="Weights" title="Weights: click a point to say how free it is to hang (for hair, scarves, capes and tails)" aria-pressed={weighing} disabled={!!recording || poseMode} onClick={() => { setWeighing(w => !w); setSkinning(false); setTapering(false); setBridgeSpots(null) }}><WeightIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${skinning ? ' cmIconBtn--on' : ''}`} aria-label="Skin weights" title="Skin weights: paint how much each point follows another group, so the outline bends like skin at a joint" aria-pressed={skinning} disabled={!!recording || poseMode} onClick={() => { setSkinning(k => !k); setWeighing(false); setTapering(false); setSkinPick(false); setBridgeSpots(null) }}><BrushIcon size={14} /></button>
              <button
                type="button" className={`cmIconBtn${tapering ? ' cmIconBtn--on' : ''}`} aria-label="Taper" aria-pressed={tapering} disabled={!!recording || poseMode}
                title="Taper: lay a line on the canvas and make a ribbon along it, wider in the middle and pointed at the ends (brows, lashes, folds, collarbones)"
                onClick={() => { setTapering(t => !t); setTaperSpine([]); setWeighing(false); setSkinning(false); setSkinPick(false); setBridgeSpots(null) }}
              ><HighlighterIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${poseMode ? ' cmIconBtn--on' : ''}`} aria-label="Pose mode" title="Pose mode: drag the figure to turn, scale and reach (the sliders follow)" aria-pressed={poseMode} disabled={!!recording} onClick={() => { if (poseMode) poseCancel(); setPoseMode(m => !m); setTapering(false); setPoseStatus(POSE_HINT) }}><HandIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className={`cmIconBtn${mirror ? ' cmIconBtn--on' : ''}`} aria-label="Mirror editing" title="Mirror editing: a point and its twin move together" aria-pressed={mirror} onClick={() => setMirror(m => !m)}><SwapIcon size={14} /></button>
              </>}
              <button type="button" className={`cmIconBtn${snap ? ' cmIconBtn--on' : ''}`} aria-label="Snap" title="Snap to half units, the mirror line and the alignment guides" aria-pressed={snap} onClick={() => setSnap(s => !s)}><RulerIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${gridSnap ? ' cmIconBtn--on' : ''}`} aria-label="Snap to grid" title="Snap to grid: a shape moved whole, a pivot and a frame land on the grid lines" aria-pressed={gridSnap} onClick={() => setGridSnap(s => !s)}><GridSnapIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              {shapesOnly
                ? <button type="button" className="cmIconBtn" aria-label="New shape" title="New shape" aria-haspopup="dialog" aria-expanded={!!shapeForm} onClick={() => openShapeFormInView()}><PlusIcon size={14} /></button>
                : <TemplateMenu label="New shape" title="New shape from a template" onPick={newShapeFromCanvas} />}
              {!shapesOnly && (weighing || content.ranges.some(r => r.drives.some(d => d.kind === 'fall'))) && (
                <span className="cmFallSide" role="group" aria-label="The side things fall to">
                  {FALL_SIDES.map(side => (
                    <button
                      key={side} type="button" className={`cmChip${test.fall === side ? ' cmChip--on' : ''}`} aria-pressed={test.fall === side}
                      aria-label={`Things fall ${side === 'down' ? 'straight down' : side === 'behind' ? 'behind the figure' : `to the picture's ${side}`}`}
                      title={side === 'down' ? 'Straight down' : side === 'behind' ? 'Behind the figure: narrower, seen from the front' : `Toward the picture's ${side}`} onClick={() => test.setFall(side)}
                    >{SIDE_NAMES[side]}</button>
                  ))}
                </span>
              )}
            </div>
            {skinning && !recording && (
              <SkinPanel
                shapeName={selShape?.name.trim() ?? ''} blocked={selShape ? skinBlock : 'Pick a shape to paint its skin weights.'} partners={skinPartners} partner={skinWith} onPartner={setSkinGroup}
                following={skinWeights.filter(w => w > 0).length}
                strength={skinStrength} onStrength={(dir, big) => setSkinStrength(v => Math.min(1, Math.max(0, Math.round((v + dir * (big ? 0.5 : 0.1)) * 10) / 10)))}
                radius={skinRadius} onRadius={(dir, big) => setSkinRadius(v => Math.min(60, Math.max(1, v + dir * (big ? 10 : 2))))}
                bend={bend ? {
                  name: bend.name.trim() || 'the joint', value: `${Math.round(valueOf(bend, values))}${bend.unit}`, atRest: valueOf(bend, values) === bend.rest,
                  atMin: valueOf(bend, values) <= bend.min, atMax: valueOf(bend, values) >= bend.max,
                  onStep: (dir, big) => setValues(v => ({ ...v, [bend.id]: Math.min(bend.max, Math.max(bend.min, valueOf(bend, v) + dir * (big ? 30 : 10))) })),
                  onRest: () => setValues(v => ({ ...v, [bend.id]: bend.rest })),
                } : null}
                picking={skinPick}
                onAuto={() => { if (selShape && skinWith) applyEdit(autoSkin(content, selShape.id, skinWith, skinRadius)) }}
                onSmooth={() => { if (selShape && skinWith) applyEdit(smoothSkin(content, selShape.id, skinWith)) }}
                onMirror={() => { if (selShape && skinWith) applyEdit(mirrorSkin(content, selShape.id, skinWith, (selShape.pts[selPoint]?.x ?? content.axis) > content.axis ? 1 : -1)) }}
                onCopy={() => setSkinPick(k => !k)}
                onClear={() => { if (selShape && skinWith) applyEdit(clearSkin(content, selShape.id, skinWith)) }}
                canClear={!!selShape && (selShape.skin ?? []).some(k => k.g === skinWith)}
              />
            )}
            {tapering && !recording && !poseMode && (
              <TaperPanel
                spec={taperSpec} onSpec={setTaperSpec} points={taperSpine.length} into={taperInto} onMake={makeTaper}
                onBack={() => setTaperSpine(list => list.slice(0, -1))} onClear={() => setTaperSpine([])} line={taperLine} onTaperLine={taperSelected}
              />
            )}
            {poseMode && !recording && <PoseBar status={poseStatus} reach={reachOn} onReach={() => setReachOn(r => !r)} onReset={() => { setScrubbing(null); setValues({}) }} onSave={savePose} canReset={away > 0} />}

            <NodeBar
              content={content} sel={sel} locked={sel.kind === 'group' || sel.kind === 'object' ? lockSet.has(sel.id) : false} away={awayAll} busy={!!recording} simple={shapesOnly}
              onToggleLock={test.toggleLock} onDelete={deleteSelection} onCopyShape={copyShape} onRoll={() => test.roll(content)} onReset={resetEverything}
            />
            <Inspector
              content={panelContent} sel={sel} view={side} linkMode={linkMode} pairs={pairs} classes={classes} choices={test.forms} selPoint={selPoint} mirror={mirror && !shapesOnly} onSelectPoint={selectPoint}
              arrange={arrange} connections={connections} symmetry={symmetry} joint={jointActions} mirrors={mirrorActions} clones={cloneActions} onAlign={onAlignPart}
              turnSection={selShape ? <ShapeTurnSection content={content} shape={selShape} selPoint={selPoint} where={selWhere} spot={solved.shapes[selShape.id]?.angle} actions={turnActions} />
                : sel.kind === 'object' && selObject ? <ObjectTurnSection content={content} object={selObject} actions={turnActions} /> : null}
              onRename={(s, name) => models.edit(entry.id, c => (s.kind === 'shape' ? renameShape(c, s.id, name) : s.kind === 'object' ? renameObject(c, s.id, name) : s.kind === 'zone' ? renameZone(c, s.id, name) : renameGroup(c, s.id, name)), false)}
              onSetLayer={(id, layer) => commit({ ...content, objects: content.objects.map(o => (o.id === id ? { ...o, layer } : o)) })}
              onEditShape={editShape} onWeight={(i, dir) => setWeightAt(i, stepWeight(weightAt(i), dir))} bridge={bridgeSpots ? bridgeSpots.length : null}
              tab={tab} onTab={setTab}
              onAxis={(dir, big) => commit(setAxis(content, content.axis + dir * (big ? 5 : 1)), true)}
              rigTab={<RigTab content={content} group={group} object={selObject} picking={pickOn} fitPicking={fitPick} actions={rigActions} pairs={pairs} fit={fit} wear={wear} drape={drape} hands={hands} held={test.grip} />}
              rangesTab={<RangesTab content={content} sel={sel} group={group} values={values} recording={recording} scrubbing={scrubbing} filter={rangeFilter} onFilter={setRangeFilter} actions={rigActions} />}
              fieldsTab={<FieldsTab content={content} sel={sel} selPoint={selPoint} state={test.state} values={values} actions={fieldActions} rig={rigActions} />}
              formsTab={<FormsTab content={content} sel={sel} state={test.state} actions={forms} presets={presets} colouring={colouring} />}
              presetsTab={<PresetsTab content={content} state={test.state} actions={presets} object={contextObjectOf(content, sel)} />}
              proportionsTab={<ProportionsTab content={content} solved={solved} picking={bonePick} actions={proportions} limits={rigActions} />}
              framesTab={<FramesTab content={content} state={framesState} actions={frameActions} />}
              colourTab={<ColourTab content={content} sel={sel} state={{ colours: test.colours, palette: testPalette, genre: test.genre, locks: test.locks, hidden: test.hidden }} actions={colourActions} paint={paintActions} picking={paintPick} />}
            />
          </ToolbarPanel>

          <div className="dzFoot" style={{ left: 0, right: 0 }}>
            {drawer && (
              <div id="dz-drawer" className="dzDrawer" role="region" aria-label={shapesOnly ? 'Checks' : 'Previews and checks'} style={{ height: DRAWER }}>
                {!shapesOnly && <PreviewStrip content={content} sel={sel} view={view} tile={tile} />}
                <CheckPanel content={content} />
              </div>
            )}
            <ViewBar
              layers={layerState} onLayers={setLayersRaw} view={view} onView={v => { setView(v); if (angleOf(v) !== 0) setLinkMode(null) }} viewOff={!!recording}
              fitAll={fitAll}
              onFit={() => {
                // Pressed with everything fitted and the view left alone: back to fitting the selection. Otherwise fit everything, and start from the middle of it.
                const same = fitAll && !viewMoved && Math.abs(zoom - 1) < 1e-6
                setFitAll(!same); setZoom(1); setViewMoved(false); setViewNonce(n => n + 1)
              }}
              zoom={zoom} onZoom={setZoom} drawerOpen={drawer} onDrawer={() => setDrawer(d => !d)} checks={faults.length} simple={shapesOnly}
              onResetPose={posingOn && isPosed(content) ? () => { commit(resetPose(content), true) } : undefined}
              layerNotes={{ heads: content.headBone && boneById(content, content.headBone) ? undefined : 'There is no head bone yet: add a bone in the Proportions tab and press Use as the head.' }}
            />
          </div>
        </div>
      </fieldset>
    </div>
  )
}
