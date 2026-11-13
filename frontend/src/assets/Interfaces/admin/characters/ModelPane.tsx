import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ModelContent, ModelEntry, ModelLayer, ModelShape } from '../../../../api/types'
import {
  BrushIcon, CopyIcon, CursorIcon, ExportIcon, EyeOffIcon, GridSnapIcon, HandIcon, HighlighterIcon, HistoryIcon, PathIcon, RestoreIcon, RulerIcon, SwapIcon, TrashIcon, UndoIcon, WeightIcon,
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
import { DesignerCanvas, type FrameCanvas, type GripMark, type LockTool, type PivotMarker, type PoseCanvas, type PoseGrab, type ThroughFrame } from './DesignerCanvas'
import { ConsoleBar, PANEL_REST, ToolbarPanel, ViewBar, type PanelState } from './DesignerShell'
import { DEFAULT_LAYERS, drawOrder, normalizeLayers, type LayerState } from './layerStack'
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
import { NONE, contextObject, contextObjectOf, repair, rightClickGrid, rightClickShape, shapesOf, showFor, type EditMode, type Selection } from './designerState'
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
import { newShape } from './engine/edit'
import { bridgeBetween, setLeaves, spotFromClick, type EdgeSpot } from './engine/bridgeEdit'
import { fadedBy as _fadedBy, setFade, stepFade } from './engine/fadeEdit'
import { cycleWeight, stepWeight } from './engine/fall'
import { SIDE_NAMES, addFall, addFallToObject, withWeight } from './engine/fallEdit'
import { alignSkins, weightsOf } from './engine/skin'
import { autoSkin, bendSlider, clearSkin, copySkin, defaultPartner, mirrorSkin, paintSkin, partnersOf, skinBlocked, smoothSkin, stepPointSkin } from './engine/skinEdit'
import { addAxis, addForm, hideInForm, moveAxis, moveForm, overrideState, removeAxis, removeForm, renameAxis, renameForm, setAxisRoll, setInitialForm, toggleAxisGenre, setLook, setOverride, useBaseOutline } from './engine/formEdit'
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
  addBend, addDepth, addLength, addRange, addScale, addTurn, attachFromClick, attachGroup, clearLimit, clearPointMoves, detachGroup, groupOfShape, newRange, recordPoints, removeDrive, removeRange, renameRange, reparent,
  setAxis, setDriveAxis, setDriveBone, setPivot, setShow, stepBendEdge, stepBound, stepDrive, stepLimit, type Edit,
} from './engine/rigEdit'
import { templateBox, templateById } from './engine/templates'
import { breakPair, clearLinksTo, linkToEdge, linkToPoint, makeTwin, moveInOrder, setBack, setLoose, stepLink, unlinkPoint } from './engine/pairEdit'
import type { DrapeActions, FitActions, FrameActions, HandActions, LinkHow, NewSliderKind, PairActions, ProportionActions, Recording, RigActions, ViewName, WearActions } from './rigActions'
import { groupOfSelection, offRest, scrubValue, valueText } from './rigView'
import {
  FALL_SIDES, NAME_MAX, addGroup, addObject, addShape, duplicateShape, freshId, groupOfObject, moveBefore, moveObjectWithin, moveShapeWithin, newGroup, objectById, objectOfShape, publishFaults, removeGroup, removeObject,
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
  const [mode, setMode] = useState<EditMode>('points')
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
  const [history, setHistory] = useState<History<ModelContent>>(emptyHistory)
  const [versions, setVersions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmUpdate, setConfirmUpdate] = useState(false)
  const [note, setNote] = useState('')
  const [tabRaw, setTab] = useState<InspectorTab>('shape')
  // a tab the writer has put away with the advanced tools is not the open one, whatever was open before
  const tab: InspectorTab = !policy.advanced && ADVANCED_TABS.includes(tabRaw) ? 'shape' : tabRaw
  const test = useTestState()
  const { values, setValues } = test
  const [recording, setRecording] = useState<RecordingState | null>(null)
  const [pickOn, setPickOn] = useState(false)
  // picking a shape on the canvas to clip the selected shape to, or to let cut a hole in it
  const [paintPick, setPaintPick] = useState<'clip' | 'cut' | null>(null)
  const [view, setView] = useState<ViewName>('front')
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

  // while a shape is recorded the canvas shows the copy being dragged, with every slider at rest
  const shown = useMemo(() => (recording ? updateShape(content, recording.shapeId, () => recording.draft) : content), [content, recording])
  // the selected object is drawn whatever its class says (a pattern, or a member of a family that is not the one chosen), so it can be looked at and edited
  const show = useMemo(() => showFor(content, sel), [content, sel])
  // looking through a frame leaves out what the frame leaves out
  const through = frameById(content, throughId)
  const solved = useMemo(() => solve(shown, recording ? {} : values, view, recording ? {} : { forms: test.forms, hidden: hiddenThrough(through, test.hidden), show, fall: test.fall, order: test.order }), [shown, values, recording, view, test.forms, test.hidden, test.fall, test.order, show, through])
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
  const editable = !!selShape && !pointDriven && !selShape.mirrorOf && !hiddenByForm && !switchedOff && !selShape.hide
  // What the canvas draws and edits for the selected shape: the points as the rig puts them (links resolved), in the view being edited. A twin is shown the same
  // way, but not edited.
  const canvasContent = useMemo(() => {
    const r = selShape ? solved.shapes[selShape.id] : undefined
    return selShape && r && r.local.length >= 3 ? updateShape(shown, selShape.id, sh => ({ ...sh, pts: r.local })) : shown
  }, [shown, solved, selShape])

  // The form an edit of this shape's points goes to, if a chosen form gives the shape its outline (see forms.targetForShape).
  function formTargetIn(c: ModelContent, shapeId: string) {
    const sh = shapeById(c, shapeId), o = objectOfShape(c, shapeId)
    if (!sh || !o || sh.mirrorOf) return null
    const t = targetForShape(o, shapeId, test.forms)
    return t ? { object: o, axis: t.axis, form: t.form, shapeId } : null
  }

  // ---- applying changes ----

  // A change that is one undo step of its own. In a writer's designer a change that makes a count grow past a limit the admin set is not made, and the note says so.
  function commit(next: ModelContent, immediate = false): boolean {
    // every member has a shape for each shape of its pattern: an edit that added or took away a pattern's shape reaches them here
    // skin weights stay with their points when points are added or taken away (phase O1)
    const synced = reconcileClasses(alignSkins(content, next), makeId)
    const refused = policy.writer ? growthRefusal(content, synced, policy.writer) : null
    if (refused) { setNote(refused); return false }
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
    models.edit(entry.id, c => {
      if (view === 'back') return updateShape(c, id, sh => ({ ...next, pts: sh.pts, back: next.pts }))
      const t = formTargetIn(c, id)
      if (!t) return updateShape(c, id, () => next)
      const e = setOverride(c, t.object.id, t.axis.id, t.form.id, id, next.pts)
      return e.ok ? e.content : c
    }, false)
  }
  function editShape(id: string, next: ModelShape, point?: number) {
    if (recording) {
      if (next.pts.length !== recording.draft.pts.length) { setNote('Adding or deleting points is not recorded: record the points that are there.'); return }
      setRecording({ ...recording, draft: next })
      if (point !== undefined) setSelPoint(point)
      return
    }
    const old = shapeById(content, id)
    if (!old) return
    // a change of the shape's settings (view, opacity, template name) leaves its points as they are stored
    if (JSON.stringify(next.pts) === JSON.stringify(solved.shapes[id]?.local ?? old.pts)) {
      commit(updateShape(content, id, () => ({ ...next, pts: old.pts })))
      if (point !== undefined) setSelPoint(point)
      return
    }
    if (view === 'back') {
      commit(updateShape(content, id, () => ({ ...next, pts: old.pts, back: next.pts })))
      if (point !== undefined) setSelPoint(point)
      return
    }
    // a chosen form gives the shape its outline: the points go there, and the base outline (which anchors and links read) is left alone
    const t = formTargetIn(content, id)
    if (t) {
      const e = setOverride(content, t.object.id, t.axis.id, t.form.id, id, next.pts)
      if (!e.ok) { setNote(e.reason); return }
      commit(updateShape(e.content, id, sh => ({ ...next, pts: sh.pts })))
      if (point !== undefined) setSelPoint(point)
      return
    }
    // points recorded or linked by number cannot survive a change in how many there are
    let base = content, cleared: string[] = [], cut: string[] = []
    if (outlineSize(content, old) !== next.pts.length) {
      const r = clearPointMoves(content, id)
      const l = clearLinksTo(r.content, id)
      base = l.content; cleared = r.cleared; cut = l.cut
    }
    commit(updateShape(base, id, () => next))
    if (cleared.length) setNote(`The recorded point moves of ${cleared.join(', ')} were cleared because the shape's points changed. Record them again.`)
    else if (cut.length) setNote(`The links of ${cut.join(', ')} to this shape were cut because its points changed. Link them again.`)
    if (point !== undefined) setSelPoint(point)
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
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
    else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
  }

  function choose(next: Selection) {
    if (recording) return
    setSel(next); setSelPoint(0); setMode('points'); setPickOn(false); setLinkMode(null); setPaintPick(null); setBonePick(null); setFitPick(false); setBridgeSpots(null)
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
    setSel({ kind: 'shape', id: shapeId }); setSelPoint(0); setMode('points')
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
      if (view === 'back') { setNote('Link points in the front view: a link works in both views.'); return }
      setPickOn(false); setMode('points'); setLinkMode(how)
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
    moveInOrder: (shapeId, dir) => { applyEdit(moveInOrder(content, shapeId, view, dir)) },
    setLeaves: (shapeId, index, on) => { applyEdit(setLeaves(content, shapeId, index, on)) },
    startBridge: () => {
      if (view === 'back') { setNote('Build a bridge in the front view: its points are locked to edges, which work in both views.'); return }
      setPickOn(false); setLinkMode(null); setPaintPick(null); setBonePick(null); setFitPick(false); setWeighing(false); setMode('points'); setBridgeSpots([])
    },
    stopBridge: () => setBridgeSpots(null),
  }

  // ---- posing by dragging ----

  function poseBegin(grab: PoseGrab, world: [number, number], alt: boolean): boolean {
    if (recording) return false
    const sv = solved, p = toModel(sv, world[0], world[1]), start = valuesRef.current
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

  // The group a new object goes into: the selection's group, else the first group, else a new one (returned with its content).
  function groupForNew(c: ModelContent): { content: ModelContent; groupId: string } {
    if (sel.kind === 'group') return { content: c, groupId: sel.id }
    const obj = sel.kind === 'object' ? objectById(c, sel.id) : sel.kind === 'shape' ? objectOfShape(c, sel.id) : undefined
    const g = obj ? groupOfObject(c, obj.id) : undefined
    if (g) return { content: c, groupId: g.id }
    if (c.groups[0]) return { content: c, groupId: c.groups[0].id }
    const id = freshId(c, 'g', makeId)
    return { content: addGroup(c, newGroup(id, 'Group 1')), groupId: id }
  }
  function addObjectOn(layer: ModelLayer, c: ModelContent = content): { content: ModelContent; objectId: string } {
    const { content: base, groupId } = groupForNew(c)
    const id = freshId(base, 'o', makeId)
    return { content: addObject(base, groupId, { id, name: `Object ${base.objects.length + 1}`, layer, shapes: [] }), objectId: id }
  }
  function addShapeTo(objectId: string, templateId: string, c: ModelContent) {
    const obj = objectById(c, objectId)
    if (obj && obj.shapes.length >= policy.max.shapesPerObject) { setNote(`An object may have at most ${policy.max.shapesPerObject} shapes.`); return }
    const id = freshId(c, 's', makeId)
    const shape = newShape(id, templateById(templateId)?.name ?? 'Shape', templateId, templateBox(templateId, 100, 100))
    if (commit(addShape(c, objectId, shape), true)) choose({ kind: 'shape', id })
  }
  // Delete what is selected, with what goes with it (a group's objects, an object's shapes, a twin).
  function deleteSelection(s: Selection) {
    if (s.kind === 'shape' && shapeById(content, s.id)?.copyOf) { setNote('A shape that follows the pattern cannot be deleted: hide it in this member instead (the Shape tab).'); return }
    const twins = twinsOf(content, s.kind === 'none' ? 'shape' : s.kind, s.kind === 'none' ? '' : s.id).length
    // the members of a class whose pattern goes keep their look: they are detached first
    const base = s.kind === 'none' ? content : detachBeforeRemoval(content, s.kind === 'shape' ? { shapes: [s.id] } : s.kind === 'object' ? { objects: [s.id] } : { groups: [s.id] })
    commit(s.kind === 'shape' ? removeShape(base, s.id) : s.kind === 'object' ? removeObject(base, s.id) : removeGroup(base, s.id), true)
    setSel(NONE)
    if (base !== content) setNote('The members of its class were detached first: they keep their look.')
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
    blocked: !editable ? 'This line is shown, not edited here (a twin, a shape a slider moves, or one hidden in this form)' : view !== 'front' ? 'Taper a line in the front view' : selShape.pts.length < 2 ? 'The line needs two points' : null,
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
    : selShape && view === 'back' ? 'Back view: a shape shows its front outline from behind until you edit its points here; then it has an outline of its own for the back.'
    : selShape && pointDriven ? 'A slider changes this shape\'s points and is away from rest: set the sliders back to rest to edit it.'
    : selShape ? (mode === 'points' ? 'Point editor: drag a point or a handle; double-click an edge to add a point.' : 'Move shape: drag the shape.')
    : sel.kind === 'none' ? 'Nothing is selected: this is the end result.' : 'Pick a shape in the tree to edit its points.'

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
    enabled: !!selShape && editable && atRest && awayAll === 0 && view === 'front' && !formTarget && !through,
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
            content={canvasContent} solved={solved} sel={sel} mode={mode} selPoint={selPoint} mirror={mirror} snap={snap} layers={drawOrder(layerState)} gridSnap={gridSnap} zoom={zoom} fitAll={fitAll} viewKey={view} viewNonce={viewNonce} insets={insets}
            onViewMoved={() => setViewMoved(true)} axis={content.axis}
            editable={editable || (!!recording && !!selShape)} pivot={pivot} anchor={anchorSpot} pick={pick} onPick={onPick} onPickGroup={id => { if (bonePick && applyEdit(setBoneEnd(content, bonePick, { kind: 'group', id, i: 0 }))) setBonePick(null) }} pose={poseCanvas} grips={gripMarks} colouring={colouring}
            frames={frameCanvas} through={throughFrame} weights={weights} skin={skin} taper={taperCanvas} lock={lock} onNote={setNote}
            linked={selShape ? selShape.pts.flatMap((pt, i) => (pt.bind ? [i] : [])) : []} onNudgeLink={nudgeLink} onPivot={movePivot} onPivotNudge={nudgePivot}
            onSelect={choose} onSelectPoint={setSelPoint}
            onGesture={() => { if (!recording) setHistory(h => remember(h, content)) }}
            onShape={live} onEditShape={editShape}
            onRightClick={t => {
              if (recording) return
              const next = t.kind === 'grid' ? rightClickGrid() : rightClickShape(sel, mode, t.id)
              setSel(next.sel); setMode(next.mode); if (t.kind === 'shape' && next.sel.kind === 'shape' && next.sel.id !== (sel.kind === 'shape' ? sel.id : '')) setSelPoint(0)
            }}
            onEscape={() => { if (tapering) { if (taperSpine.length) setTaperSpine([]); else setTapering(false) } else if (bridgeSpots) setBridgeSpots(null); else if (skinPick) setSkinPick(false); else if (skinning) setSkinning(false); else if (weighing) setWeighing(false); else if (bonePick) setBonePick(null); else if (fitPick) setFitPick(false); else if (linkMode) setLinkMode(null); else if (paintPick) setPaintPick(null); else if (pickOn) setPickOn(false); else if (!recording) setSel(NONE) }}
          />

          <div className="dzNotes">
            {models.actionError && <p className="cmErr" role="alert">{models.actionError} <button type="button" className="cmLink" onClick={models.clearActionError}>Dismiss</button></p>}
            {note && <p className="cmErr" role="status">{note}</p>}
            {empty && <p className="cmHint">No shape yet. Use New shape to start from a template, or the + beside a layer in the tree.</p>}
            <p className="cmStageNote" aria-live="polite">{stageNote}</p>
          </div>

          <ToolbarPanel side="left" title="Tree" label="Tree tools" state={left} min={PANEL_LIMITS.left.min} max={PANEL_LIMITS.left.max} onOpen={open => setPanel('left', { open })} onWidth={onPanelWidth('left')}>
            <TreeBar content={content} sel={sel} state={test.state} hidden={hiddenSet} models={nav} actions={actions} />
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
            {entry.id === 'basic' && models.basicUpdate && (
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
              <button type="button" className={`cmIconBtn${mode === 'points' ? ' cmIconBtn--on' : ''}`} aria-label="Point editor" title="Point editor: drag points and curve handles; click a point to step its handles" aria-pressed={mode === 'points'} onClick={() => setMode('points')}><PathIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${mode === 'move' ? ' cmIconBtn--on' : ''}`} aria-label="Move shape" title="Move shape: drag the whole shape" aria-pressed={mode === 'move'} onClick={() => setMode('move')}><CursorIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${weighing ? ' cmIconBtn--on' : ''}`} aria-label="Weights" title="Weights: click a point to say how free it is to hang (for hair, scarves, capes and tails)" aria-pressed={weighing} disabled={!!recording || poseMode} onClick={() => { setWeighing(w => !w); setSkinning(false); setTapering(false); setMode('points'); setBridgeSpots(null) }}><WeightIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${skinning ? ' cmIconBtn--on' : ''}`} aria-label="Skin weights" title="Skin weights: paint how much each point follows another group, so the outline bends like skin at a joint" aria-pressed={skinning} disabled={!!recording || poseMode} onClick={() => { setSkinning(k => !k); setWeighing(false); setTapering(false); setSkinPick(false); setMode('points'); setBridgeSpots(null) }}><BrushIcon size={14} /></button>
              <button
                type="button" className={`cmIconBtn${tapering ? ' cmIconBtn--on' : ''}`} aria-label="Taper" aria-pressed={tapering} disabled={!!recording || poseMode}
                title="Taper: lay a line on the canvas and make a ribbon along it, wider in the middle and pointed at the ends (brows, lashes, folds, collarbones)"
                onClick={() => { setTapering(t => !t); setTaperSpine([]); setWeighing(false); setSkinning(false); setSkinPick(false); setBridgeSpots(null) }}
              ><HighlighterIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${poseMode ? ' cmIconBtn--on' : ''}`} aria-label="Pose mode" title="Pose mode: drag the figure to turn, scale and reach (the sliders follow)" aria-pressed={poseMode} disabled={!!recording} onClick={() => { if (poseMode) poseCancel(); setPoseMode(m => !m); setTapering(false); setPoseStatus(POSE_HINT) }}><HandIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className={`cmIconBtn${mirror ? ' cmIconBtn--on' : ''}`} aria-label="Mirror editing" title="Mirror editing: a point and its twin move together" aria-pressed={mirror} onClick={() => setMirror(m => !m)}><SwapIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${snap ? ' cmIconBtn--on' : ''}`} aria-label="Snap" title="Snap to half units, the mirror line and the alignment guides" aria-pressed={snap} onClick={() => setSnap(s => !s)}><RulerIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${gridSnap ? ' cmIconBtn--on' : ''}`} aria-label="Snap to grid" title="Snap to grid: a shape moved whole, a pivot and a frame land on the grid lines" aria-pressed={gridSnap} onClick={() => setGridSnap(s => !s)}><GridSnapIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <TemplateMenu label="New shape" title="New shape from a template" onPick={newShapeFromCanvas} />
              {(weighing || content.ranges.some(r => r.drives.some(d => d.kind === 'fall'))) && (
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
              content={content} sel={sel} locked={sel.kind === 'group' || sel.kind === 'object' ? lockSet.has(sel.id) : false} away={awayAll} busy={!!recording}
              onToggleLock={test.toggleLock} onDelete={deleteSelection} onCopyShape={copyShape} onRoll={() => test.roll(content)} onReset={resetEverything}
            />
            <Inspector
              content={canvasContent} sel={sel} view={view} linkMode={linkMode} pairs={pairs} classes={classes} choices={test.forms} selPoint={selPoint} mirror={mirror} onSelectPoint={setSelPoint}
              onRename={(s, name) => models.edit(entry.id, c => (s.kind === 'shape' ? renameShape(c, s.id, name) : s.kind === 'object' ? renameObject(c, s.id, name) : renameGroup(c, s.id, name)), false)}
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
              <div id="dz-drawer" className="dzDrawer" role="region" aria-label="Previews and checks" style={{ height: DRAWER }}>
                <PreviewStrip content={content} sel={sel} view={view} tile={tile} />
                <CheckPanel content={content} />
              </div>
            )}
            <ViewBar
              layers={layerState} onLayers={setLayersRaw} view={view} onView={v => { setView(v); if (v === 'back') setLinkMode(null) }} viewOff={!!recording}
              fitAll={fitAll}
              onFit={() => {
                // Pressed with everything fitted and the view left alone: back to fitting the selection. Otherwise fit everything, and start from the middle of it.
                const same = fitAll && !viewMoved && Math.abs(zoom - 1) < 1e-6
                setFitAll(!same); setZoom(1); setViewMoved(false); setViewNonce(n => n + 1)
              }}
              zoom={zoom} onZoom={setZoom} drawerOpen={drawer} onDrawer={() => setDrawer(d => !d)} checks={faults.length}
              layerNotes={{ heads: content.headBone && boneById(content, content.headBone) ? undefined : 'There is no head bone yet: add a bone in the Proportions tab and press Use as the head.' }}
            />
          </div>
        </div>
      </fieldset>
    </div>
  )
}
