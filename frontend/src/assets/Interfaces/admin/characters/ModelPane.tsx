import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ModelContent, ModelEntry, ModelLayer, ModelShape } from '../../../../api/types'
import {
  CheckIcon, CopyIcon, CursorIcon, EyeOffIcon, FitIcon, GridLinesIcon, HistoryIcon, PathIcon, RedoIcon, RulerIcon, SlidersIcon, SwapIcon, TrashIcon, UndoIcon, ZoomInIcon, ZoomOutIcon,
} from '../../../icons'
import { AssetTree, type TreeActions } from './AssetTree'
import { CheckPanel } from './CheckPanel'
import { DesignerCanvas } from './DesignerCanvas'
import { Inspector } from './Inspector'
import { StatusBadge, modelLabel } from './ModelList'
import { PreviewStrip } from './PreviewStrip'
import { TemplateMenu } from './TemplateMenu'
import { NONE, contextObject, repair, rightClickGrid, rightClickShape, type EditMode, type Selection } from './designerState'
import { newShape } from './engine/edit'
import { LIMITS } from './engine/limits'
import { emptyHistory, redo as redoHistory, remember, undo as undoHistory, type History } from './engine/history'
import { templateBox, templateById } from './engine/templates'
import {
  NAME_MAX, addGroup, addObject, addShape, duplicateShape, freshId, groupOfObject, moveShapeWithin, objectById, objectOfShape, publishFaults, removeGroup, removeObject, removeShape,
  renameGroup, renameObject, renameShape, updateShape, type MakeId,
} from './modelContent'
import type { CharacterModels } from './useCharacterModels'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })

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

// The open model: its name and publishing buttons, then the tree, the canvas and the inspector, the preview strip and the checks. The undo stack
// lives here (it starts empty when another model is opened: the page keys this component on the model's id).
export function ModelPane({ entry, models, makeId, onRemove, onDuplicate }: {
  entry: ModelEntry
  models: CharacterModels
  makeId: MakeId
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
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
  const historyRef = useRef(history)
  historyRef.current = history
  const faults = publishFaults(content)
  const busy = models.busy
  const published = !!entry.published
  const empty = content.shapes.length === 0

  useEffect(() => { setSel(s => repair(content, s)) }, [content])

  // ---- applying changes ----

  // A change that is one undo step of its own.
  function commit(next: ModelContent, immediate = false) {
    setHistory(h => remember(h, content))
    models.edit(entry.id, () => next, immediate)
    setNote('')
  }
  // A change in the middle of a drag: no undo step of its own (onGesture made it).
  function live(id: string, next: ModelShape) {
    models.edit(entry.id, c => updateShape(c, id, () => next), false)
  }
  function editShape(id: string, next: ModelShape, point?: number) {
    commit(updateShape(content, id, () => next))
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
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
    else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
  }

  function choose(next: Selection) {
    setSel(next); setSelPoint(0); setMode('points')
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
    return { content: addGroup(c, { id, name: 'Group 1', parent: null, objects: [] }), groupId: id }
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
      commit(addGroup(content, { id, name: `Group ${content.groups.length + 1}`, parent: null, objects: [] }), true)
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
      const owner = objectOfShape(content, id)
      if (owner && owner.shapes.length >= LIMITS.shapesPerObjectMax) { setNote(`An object may have at most ${LIMITS.shapesPerObjectMax} shapes.`); return }
      const copyId = freshId(content, 's', makeId)
      commit(duplicateShape(content, id, copyId), true)
      choose({ kind: 'shape', id: copyId })
    },
    onDelete: s => {
      commit(s.kind === 'shape' ? removeShape(content, s.id) : s.kind === 'object' ? removeObject(content, s.id) : removeGroup(content, s.id), true)
      setSel(NONE)
    },
    onMoveShape: (objectId, shapeId, dir) => {
      const list = objectById(content, objectId)?.shapes ?? []
      const at = list.indexOf(shapeId)
      if (at < 0) return
      commit(moveShapeWithin(content, objectId, shapeId, dir < 0 ? list[at - 1] ?? null : list[at + 2] ?? null), true)
    },
  }

  // The canvas's "new shape" button: into the selected object, else into a new object (and group) on the Body layer.
  function newShapeFromCanvas(templateId: string) {
    const inObject = contextObject(content, sel)
    if (inObject) { addShapeTo(inObject, templateId, content); return }
    const r = addObjectOn('body')
    addShapeTo(r.objectId, templateId, r.content)
  }

  const selShape = sel.kind === 'shape'

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
          <AssetTree content={content} sel={sel} actions={actions} />
          <div className="cmStage">
            <div className="cmToolbar" role="toolbar" aria-label="Designer tools">
              <button type="button" className="cmIconBtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.past.length} onClick={undo}><UndoIcon size={14} /></button>
              <button type="button" className="cmIconBtn" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!history.future.length} onClick={redo}><RedoIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className={`cmIconBtn${mode === 'points' ? ' cmIconBtn--on' : ''}`} aria-label="Point editor" title="Point editor: drag points and curve handles" aria-pressed={mode === 'points'} onClick={() => setMode('points')}><PathIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${mode === 'move' ? ' cmIconBtn--on' : ''}`} aria-label="Move shape" title="Move shape: drag the whole shape" aria-pressed={mode === 'move'} onClick={() => setMode('move')}><CursorIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className={`cmIconBtn${mirror ? ' cmIconBtn--on' : ''}`} aria-label="Mirror editing" title="Mirror editing: a point and its twin move together" aria-pressed={mirror} onClick={() => setMirror(m => !m)}><SwapIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${snap ? ' cmIconBtn--on' : ''}`} aria-label="Snap" title="Snap to half units and the mirror line" aria-pressed={snap} onClick={() => setSnap(s => !s)}><RulerIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${grid ? ' cmIconBtn--on' : ''}`} aria-label="Grid" title="Grid" aria-pressed={grid} onClick={() => setGrid(g => !g)}><GridLinesIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <button type="button" className="cmIconBtn" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom(z => Math.min(8, z * 1.25))}><ZoomInIcon size={14} /></button>
              <button type="button" className="cmIconBtn" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom(z => Math.max(0.25, z / 1.25))}><ZoomOutIcon size={14} /></button>
              <button type="button" className={`cmIconBtn${fitAll ? ' cmIconBtn--on' : ''}`} aria-label="Fit the whole figure" title="Fit the whole figure" aria-pressed={fitAll} onClick={() => { setFitAll(f => !f); setZoom(1) }}><FitIcon size={14} /></button>
              <span className="cmSep" aria-hidden="true" />
              <TemplateMenu label="New shape" title="New shape from a template" onPick={newShapeFromCanvas} />
              <span className="cmSpacer" />
              <button type="button" className={`cmIconBtn${drawer ? ' cmIconBtn--on' : ''}`} aria-label="Inspector" title="Show or hide the inspector" aria-pressed={drawer} onClick={() => setDrawer(d => !d)}><SlidersIcon size={14} /></button>
            </div>
            {empty && <p className="cmHint">No shape yet. Use New shape to start from a template, or the + beside a layer in the tree.</p>}
            <DesignerCanvas
              content={content} sel={sel} mode={mode} selPoint={selPoint} mirror={mirror} snap={snap} grid={grid} zoom={zoom} fitAll={fitAll}
              onSelect={choose} onSelectPoint={setSelPoint}
              onGesture={() => setHistory(h => remember(h, content))}
              onShape={live} onEditShape={editShape}
              onRightClick={t => {
                const next = t.kind === 'grid' ? rightClickGrid() : rightClickShape(sel, mode, t.id)
                setSel(next.sel); setMode(next.mode); if (t.kind === 'shape' && next.sel.kind === 'shape' && next.sel.id !== (sel.kind === 'shape' ? sel.id : '')) setSelPoint(0)
              }}
              onEscape={() => setSel(NONE)}
            />
            <p className="cmStageNote" aria-live="polite">
              {selShape ? (mode === 'points' ? 'Point editor: drag a point or a handle; double-click an edge to add a point.' : 'Move shape: drag the shape.') : sel.kind === 'none' ? 'Nothing is selected: this is the end result.' : 'Pick a shape in the tree to edit its points.'}
            </p>
          </div>
          {drawer && (
            <Inspector
              content={content} sel={sel} selPoint={selPoint} mirror={mirror} onSelectPoint={setSelPoint}
              onRename={(s, name) => models.edit(entry.id, c => (s.kind === 'shape' ? renameShape(c, s.id, name) : s.kind === 'object' ? renameObject(c, s.id, name) : renameGroup(c, s.id, name)), false)}
              onSetLayer={(id, layer) => commit({ ...content, objects: content.objects.map(o => (o.id === id ? { ...o, layer } : o)) })}
              onEditShape={editShape}
            />
          )}
        </div>
        <PreviewStrip content={content} sel={sel} />
        <CheckPanel content={content} />
      </fieldset>
    </div>
  )
}
