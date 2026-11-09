import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ModelContent, ModelEntry, ModelLayer, ModelShape } from '../../../../api/types'
import {
  BackIcon, CheckIcon, CopyIcon, CursorIcon, DiceIcon, ExportIcon, EyeOffIcon, FitIcon, StampIcon, FrontIcon, GridLinesIcon, HandIcon, HistoryIcon, PathIcon, RedoIcon, RestoreIcon, RulerIcon, SlidersIcon, SwapIcon, TrashIcon, UndoIcon, ZoomInIcon, ZoomOutIcon,
} from '../../../icons'
import { AssetTree, type TreeActions, type TreeMode } from './AssetTree'
import type { ClassActions } from './ClassPanel'
import { ColourTab, type ColourActions } from './ColourTab'
import { CheckPanel } from './CheckPanel'
import { DesignerCanvas, type PivotMarker, type PoseCanvas, type PoseGrab } from './DesignerCanvas'
import { FormsTab, type FormActions } from './FormsTab'
import { Inspector, type InspectorTab } from './Inspector'
import { StatusBadge, modelLabel } from './ModelList'
import { PoseBar } from './PoseBar'
import { PresetsTab, type PresetActions } from './PresetsTab'
import { PreviewStrip } from './PreviewStrip'
import { RangesTab } from './RangesTab'
import { RigTab } from './RigTab'
import { TemplateMenu } from './TemplateMenu'
import { NONE, contextObject, repair, rightClickGrid, rightClickShape, showFor, type EditMode, type Selection } from './designerState'
import {
  NEUTRAL_GRAY, addColour, addGenre, addSlot, addStandardSlots, addSwatch, paletteOf, removeColour, removeGenre, removeSlot, removeSwatch, renameColour, renameGenre, renameSlot, setColourHex,
  setStarterPalette, setSwatch, stepSlot, toggleColourGenre,
} from './engine/colour'
import { addMember, deleteClass, detachBeforeRemoval, detachMember, followTemplate, makeClass, moveObjectToGroup, reconcileClasses, renameClass, setExclusive, setShapeHide } from './engine/classEdit'
import { newShape } from './engine/edit'
import { addAxis, addForm, hideInForm, moveAxis, moveForm, overrideState, removeAxis, removeForm, renameAxis, renameForm, setInitialForm, setOverride, useBaseOutline } from './engine/formEdit'
import { classKey, presetsOf, targetForShape } from './engine/forms'
import { apply, inverse } from './engine/geometry'
import { LIMITS } from './engine/limits'
import { emptyHistory, redo as redoHistory, remember, undo as undoHistory, type History } from './engine/history'
import { beginScale, beginTurn, grabPoint, moveScale, moveTurn, poseTarget, reach, reachJoints, scaleDriver, slideValue, toModel, turnDrivers, type ReachGrab, type ScaleDrag, type TurnDrag } from './engine/pose'
import { deletePreset, renamePreset, savePreset, saveStyle, updatePreset } from './engine/presets'
import { chainOf, isPointDriven, restPivot, solve, type Solved, type Values } from './engine/rig'
import {
  addBend, addRange, addScale, addTurn, attachFromClick, attachGroup, clearPointMoves, detachGroup, groupOfShape, newRange, recordPoints, removeDrive, removeRange, renameRange, reparent,
  setAxis, setDriveAxis, setPivot, setShow, stepBendEdge, stepBound, stepDrive, type Edit,
} from './engine/rigEdit'
import { templateBox, templateById } from './engine/templates'
import { breakPair, clearLinksTo, linkToEdge, linkToPoint, makeTwin, moveInOrder, setBack, setLoose, stepLink, unlinkPoint } from './engine/pairEdit'
import type { LinkHow, NewSliderKind, PairActions, Recording, RigActions, ViewName } from './rigActions'
import { groupOfSelection, offRest, scrubValue, valueText } from './rigView'
import {
  NAME_MAX, addGroup, addObject, addShape, duplicateShape, freshId, groupOfObject, moveBefore, moveObjectWithin, moveShapeWithin, newGroup, objectById, objectOfShape, publishFaults, removeGroup, removeObject,
  outlineSize, removeShape, renameGroup, renameObject, renameShape, shapeById, twinsOf, updateShape, type MakeId,
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
const POSE_HINT = 'Pose mode: drag a part to turn it, a square to scale its group, a circle to slide its anchor. Hold Alt, or press Reach, and drag a hand or foot to bend the limb.'

// The open model: its name and publishing buttons, then the tree, the canvas and the inspector, the preview strip and the checks. The undo stack
// lives here (it starts empty when another model is opened: the page keys this component on the model's id), and so do the test values of the sliders
// (what the Try it sliders are set to: for looking, never saved).
export function ModelPane({ entry, models, makeId, onRemove, onDuplicate, onExport }: {
  entry: ModelEntry
  models: CharacterModels
  makeId: MakeId
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onExport: (entry: ModelEntry) => void
}) {
  const content = entry.draft
  const [sel, setSel] = useState<Selection>(NONE)
  const [mode, setMode] = useState<EditMode>('points')
  const [selPoint, setSelPoint] = useState(0)
  const [mirror, setMirror] = useState(true)
  const [snap, setSnap] = useState(true)
  const [grid, setGrid] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [fitAll, setFitAll] = useState(false)
  const [drawer, setDrawer] = useState(true)
  const [history, setHistory] = useState<History<ModelContent>>(emptyHistory)
  const [versions, setVersions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<InspectorTab>('shape')
  const [treeMode, setTreeMode] = useState<TreeMode>('layers')
  const test = useTestState()
  const { values, setValues } = test
  const [recording, setRecording] = useState<RecordingState | null>(null)
  const [pickOn, setPickOn] = useState(false)
  const [view, setView] = useState<ViewName>('front')
  const [linkMode, setLinkMode] = useState<LinkHow | null>(null)
  const [rangeFilter, setRangeFilter] = useState<'selection' | 'all'>('selection')
  const [scrubbing, setScrubbing] = useState<string | null>(null)
  const [poseMode, setPoseMode] = useState(false)
  const [reachOn, setReachOn] = useState(false)
  const [poseStatus, setPoseStatus] = useState(POSE_HINT)
  const [poseActive, setPoseActive] = useState<string | null>(null)
  const [ghost, setGhost] = useState(false)
  const poseRef = useRef<PoseDrag | null>(null)
  const historyRef = useRef(history)
  historyRef.current = history
  const faults = publishFaults(content)
  const busy = models.busy
  const published = !!entry.published
  const empty = content.shapes.length === 0

  useEffect(() => { setSel(s => repair(content, s)) }, [content])

  // while a shape is recorded the canvas shows the copy being dragged, with every slider at rest
  const shown = useMemo(() => (recording ? updateShape(content, recording.shapeId, () => recording.draft) : content), [content, recording])
  // the selected object is drawn whatever its class says (a pattern, or a member of a family that is not the one chosen), so it can be looked at and edited
  const show = useMemo(() => showFor(content, sel), [content, sel])
  const solved = useMemo(() => solve(shown, recording ? {} : values, view, recording ? {} : { forms: test.forms, hidden: test.hidden, show }), [shown, values, recording, view, test.forms, test.hidden, show])
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

  // A change that is one undo step of its own.
  function commit(next: ModelContent, immediate = false) {
    setHistory(h => remember(h, content))
    // every member has a shape for each shape of its pattern: an edit that added or took away a pattern's shape reaches them here
    const synced = reconcileClasses(next, makeId)
    models.edit(entry.id, () => synced, immediate)
    setNote('')
  }
  // Apply what a rig operation returns: the new content, or why it cannot.
  function applyEdit(e: Edit): boolean {
    if (!e.ok) { setNote(e.reason); return false }
    commit(e.content, true)
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
    setSel(next); setSelPoint(0); setMode('points'); setPickOn(false); setLinkMode(null)
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
    setValues({}); setScrubbing(null); setPickOn(false); setDrawer(true); setTab('ranges')
    setSel({ kind: 'shape', id: shapeId }); setSelPoint(0); setMode('points')
    setRecording({ rangeId, shapeId, end, draft: { ...s, pts: s.pts.map(p => ({ ...p })) } })
    setNote('')
  }
  function newSlider(kind: NewSliderKind) {
    const id = freshId(content, 'r', makeId)
    const gName = group?.name.trim() || 'the group'
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
    const start = addRange(content, newRange(id, sliderName(content, kind === 'points' ? `${name} shape` : `${name} bend`), kind, selShape.id))
    if (!start.ok) { setNote(start.reason); return }
    if (kind === 'bend') { if (applyEdit(addBend(start.content, id, selShape.id))) { setTab('ranges'); setRangeFilter('selection') } }
    else { commit(start.content, true); startRecording(id, selShape.id, 'max') }
  }
  function addDrive(rangeId: string, kind: NewSliderKind) {
    if (kind === 'turn') { if (!group) setNote('Select a group first.'); else applyEdit(addTurn(content, rangeId, group.id)); return }
    if (kind === 'scale') { const t = scaleTarget(); applyEdit(addScale(content, rangeId, t.target, t.id)); return }
    if (!selShape) { setNote('Select a shape first.'); return }
    if (kind === 'bend') applyEdit(addBend(content, rangeId, selShape.id))
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
    setDriveAxis: (rangeId, index, axis) => commit(setDriveAxis(content, rangeId, index, axis), true),
    stepBend: (rangeId, index, edge, dir, big) => commit(stepBendEdge(content, rangeId, index, edge, dir, big), true),
    record: startRecording,
    finishRecording,
    cancelRecording: () => setRecording(null),
    scrub: id => setScrubbing(s => (s === id ? null : id)),
    setValue,
    resetValues,
    openSlider: () => { setTab('ranges'); setRangeFilter('selection') },
  }

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
  }

  // ---- posing by dragging ----

  function poseBegin(grab: PoseGrab, world: [number, number], alt: boolean): boolean {
    if (recording) return false
    const sv = solved, p = toModel(sv, world[0], world[1]), start = valuesRef.current
    const gid = grab.kind === 'part' ? groupOfShape(content, grab.shapeId) : grab.groupId
    const name = content.groups.find(g => g.id === gid)?.name.trim() || 'the group'
    if (grab.kind === 'scale') {
      const scale = gid ? beginScale(content, sv, start, gid, p) : null
      if (!scale || !gid) return false
      poseRef.current = { kind: 'scale', solved: sv, start, group: gid, scale }
      setPoseActive(gid); setPoseStatus(`Scaling ${name}.`)
      return true
    }
    if (grab.kind === 'slide') {
      if (!gid) return false
      poseRef.current = { kind: 'slide', solved: sv, start, group: gid }
      setPoseActive(gid); setPoseStatus(`Sliding ${name}.`)
      return true
    }
    if (alt || reachOn) {
      if (!gid || reachJoints(content, gid).length === 0) { const t = poseTarget(content, gid); setPoseStatus(t.ok ? 'Nothing here bends.' : t.reason); return false }
      poseRef.current = { kind: 'reach', solved: sv, start, group: gid, grab: grabPoint(sv, gid, p), current: start }
      setPoseActive(gid); setPoseStatus(`Reaching with ${name}.`)
      return true
    }
    const target = poseTarget(content, gid)
    if (!target.ok) { setPoseStatus(target.reason); return false }
    const turn = beginTurn(content, sv, start, target, p)
    if (!turn) return false
    poseRef.current = { kind: 'turn', solved: sv, start, group: target.group.id, turn }
    setPoseActive(target.group.id); setPoseStatus(`Turning ${target.group.name.trim() || 'the group'}.`)
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
  // what the pose mode shows on the canvas: a ring at the pivot of every group a drag can turn, a square on every group that has a Scale slider, a circle on
  // every anchor that a slider slides
  const poseCanvas: PoseCanvas | null = poseMode && !recording ? (() => {
    const at = (x: number, y: number) => apply(solved.global, x, y)
    const named = (id: string) => content.groups.find(g => g.id === id)?.name.trim() || 'the group'
    const joints = content.groups.filter(g => !g.mirrorOf && turnDrivers(content, g.id).length > 0 && solved.pivots[g.id]).map(g => { const [x, y] = at(...solved.pivots[g.id]); return { id: g.id, name: named(g.id), x, y, active: poseActive === g.id } })
    const scales = content.groups.filter(g => !g.mirrorOf && scaleDriver(content, g.id)).flatMap(g => {
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
    save: (name, kind) => { applyEdit(savePreset(content, test.state, name, kind, makeId)) },
    saveStyle: (scopeId, name) => { applyEdit(saveStyle(content, test.state, scopeId, name, 'Style', makeId)) },
    update: id => commit(updatePreset(content, id, test.state), true),
    rename: (id, name) => models.edit(entry.id, c => renamePreset(c, id, name), false),
    remove: id => commit(deletePreset(content, id), true),
  }

  const colourActions: ColourActions = {
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
    if (obj && obj.shapes.length >= LIMITS.shapesPerObjectMax) { setNote(`An object may have at most ${LIMITS.shapesPerObjectMax} shapes.`); return }
    const id = freshId(c, 's', makeId)
    const shape = newShape(id, templateById(templateId)?.name ?? 'Shape', templateId, templateBox(templateId, 100, 100))
    commit(addShape(c, objectId, shape), true)
    choose({ kind: 'shape', id })
  }
  const actions: TreeActions = {
    onSelect: choose,
    onAddGroup: () => {
      if (content.groups.length >= 60) { setNote('A model may have at most 60 groups.'); return }
      const id = freshId(content, 'g', makeId)
      commit(addGroup(content, newGroup(id, `Group ${content.groups.length + 1}`)), true)
      choose({ kind: 'group', id })
    },
    onAddObject: layer => {
      const groupObjects = (() => { const { content: b, groupId } = groupForNew(content); return b.groups.find(g => g.id === groupId)?.objects.length ?? 0 })()
      if (groupObjects >= LIMITS.objectsPerGroupMax) { setNote(`A group may have at most ${LIMITS.objectsPerGroupMax} objects.`); return }
      const r = addObjectOn(layer)
      commit(r.content, true)
      choose({ kind: 'object', id: r.objectId })
    },
    onAddShape: (objectId, t) => addShapeTo(objectId, t, content),
    onDuplicateShape: id => {
      if (shapeById(content, id)?.mirrorOf) { setNote('A twin has no outline of its own to copy: break the pair first, or copy the original.'); return }
      const owner = objectOfShape(content, id)
      if (owner && owner.shapes.length >= LIMITS.shapesPerObjectMax) { setNote(`An object may have at most ${LIMITS.shapesPerObjectMax} shapes.`); return }
      const copyId = freshId(content, 's', makeId)
      commit(duplicateShape(content, id, copyId), true)
      choose({ kind: 'shape', id: copyId })
    },
    onDelete: s => {
      if (s.kind === 'shape' && shapeById(content, s.id)?.copyOf) { setNote('A shape that follows the pattern cannot be deleted: hide it in this member instead (the Shape tab).'); return }
      const twins = twinsOf(content, s.kind === 'none' ? 'shape' : s.kind, s.kind === 'none' ? '' : s.id).length
      // the members of a class whose pattern goes keep their look: they are detached first
      const base = s.kind === 'none' ? content : detachBeforeRemoval(content, s.kind === 'shape' ? { shapes: [s.id] } : s.kind === 'object' ? { objects: [s.id] } : { groups: [s.id] })
      commit(s.kind === 'shape' ? removeShape(base, s.id) : s.kind === 'object' ? removeObject(base, s.id) : removeGroup(base, s.id), true)
      setSel(NONE)
      if (base !== content) setNote('The members of its class were detached first: they keep their look.')
      else if (twins) setNote('Its twin went with it.')
    },
    onMoveShape: (objectId, shapeId, dir) => {
      const list = objectById(content, objectId)?.shapes ?? []
      const at = list.indexOf(shapeId)
      if (at < 0) return
      commit(moveShapeWithin(content, objectId, shapeId, dir < 0 ? list[at - 1] ?? null : list[at + 2] ?? null), true)
    },
    onReorderShape: (objectId, shapeId, before) => commit(moveShapeWithin(content, objectId, shapeId, before), true),
    onReorderObject: (groupId, objectId, before) => commit(moveObjectWithin(content, groupId, objectId, before), true),
    onReorderGroup: (groupId, before) => commit({ ...content, groups: moveBefore(content.groups, groupId, before) }, true),
    onReparent: (groupId, parentId) => { applyEdit(reparent(content, groupId, parentId)) },
    onToggleHidden: test.toggleHidden,
    onToggleLock: test.toggleLock,
  }

  // The canvas's "new shape" button: into the selected object, else into a new object (and group) on the Body layer.
  function newShapeFromCanvas(templateId: string) {
    const inObject = contextObject(content, sel)
    if (inObject) { addShapeTo(inObject, templateId, content); return }
    const r = addObjectOn('body')
    addShapeTo(r.objectId, templateId, r.content)
  }

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
  const pick = linkPick ?? (pickOn && group?.attach ? { shapes: ancestorShapes.map(s => s.id) } : null)

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

  const stageNote = recording ? 'Recording: drag the points, then press Set in the Ranges tab.'
    : poseMode ? 'Pose mode: the figure is grabbed, not edited. The sliders in the Ranges tab do the same from the keyboard.'
    : linkMode ? `Click the shape to link point ${selPoint + 1} to. Escape stops.`
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

  return (
    <div className="cmPane" onKeyDown={onKeyDown}>
      <fieldset className="cmFieldset" disabled={busy}>
        <div className="cmTools">
          <input
            className="cmName" data-kf="" maxLength={NAME_MAX} aria-label="Model name" placeholder="Model name" value={content.name}
            onChange={e => models.edit(entry.id, c => ({ ...c, name: e.target.value }), false)}
          />
          <StatusBadge entry={entry} />
          <span className="cmToolGroup">
            <button type="button" className="cmBtn cmBtn--primary" disabled={faults.length > 0} title={faults.length ? 'Fix what the checks say first' : 'Publish this draft as the next version'} onClick={() => void models.publish(entry.id)}><CheckIcon size={12} /> Publish</button>
            <button type="button" className="cmBtn" disabled={!published} onClick={() => void models.unpublish(entry.id)}><EyeOffIcon size={12} /> Unpublish</button>
            <button type="button" className="cmBtn" onClick={() => void models.discard(entry.id)} title={published ? 'Put the draft back to the published version' : 'Clear the draft'}><UndoIcon size={12} /> Discard changes</button>
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
        {models.actionError && <p className="cmErr" role="alert">{models.actionError} <button type="button" className="cmLink" onClick={models.clearActionError}>Dismiss</button></p>}
        {note && <p className="cmErr" role="status">{note}</p>}

        <div className={`cmWork${drawer ? '' : ' cmWork--noDrawer'}`}>
          <AssetTree content={content} sel={sel} actions={actions} mode={treeMode} onMode={setTreeMode} hidden={hiddenSet} locks={lockSet} />
          <div className="cmStage">
            <div className="cmToolbar" role="toolbar" aria-label="Designer tools">
              <button type="button" className="cmIconBtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.past.length || !!recording} onClick={undo}><UndoIcon size={14} /></button>
              <button type="button" className="cmIconBtn" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!history.future.length || !!recording} onClick={redo}><RedoIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className={`cmIconBtn${mode === 'points' ? ' cmIconBtn--on' : ''}`} aria-label="Point editor" title="Point editor: drag points and curve handles" aria-pressed={mode === 'points'} onClick={() => setMode('points')}><PathIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${mode === 'move' ? ' cmIconBtn--on' : ''}`} aria-label="Move shape" title="Move shape: drag the whole shape" aria-pressed={mode === 'move'} onClick={() => setMode('move')}><CursorIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${poseMode ? ' cmIconBtn--on' : ''}`} aria-label="Pose mode" title="Pose mode: drag the figure to turn, scale and reach (the sliders follow)" aria-pressed={poseMode} disabled={!!recording} onClick={() => { if (poseMode) poseCancel(); setPoseMode(m => !m); setPoseStatus(POSE_HINT) }}><HandIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className={`cmIconBtn${mirror ? ' cmIconBtn--on' : ''}`} aria-label="Mirror editing" title="Mirror editing: a point and its twin move together" aria-pressed={mirror} onClick={() => setMirror(m => !m)}><SwapIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${snap ? ' cmIconBtn--on' : ''}`} aria-label="Snap" title="Snap to half units and the mirror line" aria-pressed={snap} onClick={() => setSnap(s => !s)}><RulerIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${grid ? ' cmIconBtn--on' : ''}`} aria-label="Grid" title="Grid" aria-pressed={grid} onClick={() => setGrid(g => !g)}><GridLinesIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${ghost ? ' cmIconBtn--on' : ''}`} aria-label="Ghost of the pattern" title="Ghost of the pattern: a dashed line where the pattern's outline is, behind a member's own outline" aria-pressed={ghost} onClick={() => setGhost(g => !g)}><StampIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className={`cmIconBtn${view === 'front' ? ' cmIconBtn--on' : ''}`} aria-label="Front view" title="Front view" aria-pressed={view === 'front'} disabled={!!recording} onClick={() => { setView('front') }}><FrontIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${view === 'back' ? ' cmIconBtn--on' : ''}`} aria-label="Back view" title="Back view: the figure turned round" aria-pressed={view === 'back'} disabled={!!recording} onClick={() => { setView('back'); setLinkMode(null) }}><BackIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className="cmIconBtn" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom(z => Math.min(8, z * 1.25))}><ZoomInIcon size={14} /></button>
              <button type="button" className="cmIconBtn" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom(z => Math.max(0.25, z / 1.25))}><ZoomOutIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${fitAll ? ' cmIconBtn--on' : ''}`} aria-label="Fit the whole figure" title="Fit the whole figure" aria-pressed={fitAll} onClick={() => { setFitAll(f => !f); setZoom(1) }}><FitIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className="cmIconBtn" aria-label="Roll the look" title="Roll a new look for the test character: colours, a form on every axis and the member of each family; what is locked in the tree stays" disabled={!!recording} onClick={() => test.roll(content)}><DiceIcon size={14} /></button>
              <TemplateMenu label="New shape" title="New shape from a template" onPick={newShapeFromCanvas} />
              <span className="cmSpacer" />
              {awayAll > 0 && (
                <button type="button" className="cmBtn cmBtn--small" aria-label="Reset test values" title="Put every slider back at rest, every axis on its default form and show everything" disabled={!!recording} onClick={resetEverything}><RestoreIcon size={12} /> {awayAll} off rest</button>
              )}
              <button type="button" className={`cmIconBtn${drawer ? ' cmIconBtn--on' : ''}`} aria-label="Inspector" title="Show or hide the inspector" aria-pressed={drawer} onClick={() => setDrawer(d => !d)}><SlidersIcon size={14} /></button>
            </div>
            {poseMode && !recording && <PoseBar status={poseStatus} reach={reachOn} onReach={() => setReachOn(r => !r)} onReset={() => { setScrubbing(null); setValues({}) }} onSave={savePose} canReset={away > 0} />}
            {empty && <p className="cmHint">No shape yet. Use New shape to start from a template, or the + beside a layer in the tree.</p>}
            <DesignerCanvas
              content={canvasContent} solved={solved} sel={sel} mode={mode} selPoint={selPoint} mirror={mirror} snap={snap} grid={grid} zoom={zoom} fitAll={fitAll} axis={content.axis}
              editable={editable || (!!recording && !!selShape)} pivot={pivot} anchor={anchorSpot} pick={pick} onPick={onPick} pose={poseCanvas} ghost={ghost} colouring={colouring}
              linked={selShape ? selShape.pts.flatMap((pt, i) => (pt.bind ? [i] : [])) : []} onNudgeLink={nudgeLink} onPivot={movePivot} onPivotNudge={nudgePivot}
              onSelect={choose} onSelectPoint={setSelPoint}
              onGesture={() => { if (!recording) setHistory(h => remember(h, content)) }}
              onShape={live} onEditShape={editShape}
              onRightClick={t => {
                if (recording) return
                const next = t.kind === 'grid' ? rightClickGrid() : rightClickShape(sel, mode, t.id)
                setSel(next.sel); setMode(next.mode); if (t.kind === 'shape' && next.sel.kind === 'shape' && next.sel.id !== (sel.kind === 'shape' ? sel.id : '')) setSelPoint(0)
              }}
              onEscape={() => { if (linkMode) setLinkMode(null); else if (pickOn) setPickOn(false); else if (!recording) setSel(NONE) }}
            />
            <p className="cmStageNote" aria-live="polite">{stageNote}</p>
          </div>
          {drawer && (
            <Inspector
              content={canvasContent} sel={sel} view={view} linkMode={linkMode} pairs={pairs} classes={classes} choices={test.forms} selPoint={selPoint} mirror={mirror} onSelectPoint={setSelPoint}
              onRename={(s, name) => models.edit(entry.id, c => (s.kind === 'shape' ? renameShape(c, s.id, name) : s.kind === 'object' ? renameObject(c, s.id, name) : renameGroup(c, s.id, name)), false)}
              onSetLayer={(id, layer) => commit({ ...content, objects: content.objects.map(o => (o.id === id ? { ...o, layer } : o)) })}
              onEditShape={editShape}
              tab={tab} onTab={setTab}
              onAxis={(dir, big) => commit(setAxis(content, content.axis + dir * (big ? 5 : 1)), true)}
              rigTab={<RigTab content={content} group={group} picking={pickOn} actions={rigActions} pairs={pairs} />}
              rangesTab={<RangesTab content={content} sel={sel} group={group} values={values} recording={recording} scrubbing={scrubbing} filter={rangeFilter} onFilter={setRangeFilter} actions={rigActions} />}
              formsTab={<FormsTab content={content} sel={sel} state={test.state} actions={forms} presets={presets} colouring={colouring} />}
              presetsTab={<PresetsTab content={content} state={test.state} actions={presets} />}
              colourTab={<ColourTab content={content} sel={sel} state={{ colours: test.colours, palette: testPalette, genre: test.genre, locks: test.locks }} actions={colourActions} />}
            />
          )}
        </div>
        <PreviewStrip content={content} sel={sel} view={view} />
        <CheckPanel content={content} />
      </fieldset>
    </div>
  )
}

