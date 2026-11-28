import { useState } from 'react'
import type { ModelCloneAt, ModelContent, ModelJoint, ModelJointKind, ModelMirrorLine, ModelObject, ModelShape, ModelShapeKind } from '../../../../api/types'
import { sameLine, type LineOption } from './engine/mirrors'
import type { PartKind } from './designerState'
import { NAME_LIMIT, isWeld, linkHolder, sharedSegment, sharersOf, weldedTo, type CopyShare } from './engine/connect'
import { shapeById } from './modelContent'
import { AlignAcrossIcon, AlignDownIcon, AnchorIcon, BackwardIcon, CloseIcon, CopyIcon, FlipAcrossIcon, FlipDownIcon, ForwardIcon, LinkIcon, OrbitIcon, PlusIcon, PolygonIcon, SwapIcon, UnlockIcon } from '../../../icons'
import { JOINT_KINDS, JOINT_NAME_MAX, TURN_LIMIT } from './engine/pivots'
import { JOINT_LABEL, JOINT_NOTE } from './engine/jointLimits'
import { removeMark, renameMark } from './engine/anchors'
import { LIMITS } from './engine/limits'
import { CAST_OPACITY, KIND_NAMES, actsAs, isCast, kindOf, unlinkedCount } from './engine/kinds'
import { SYM_AXES_MAX } from './engine/symmetry'
import { MIN_SIDE, alignShape, flipShape, frameOf, setPlace, setSize, setTurn } from './engine/transform'
import { Stepper } from './Stepper'
import { edgeCount, homeEdgeLined, type EdgeHome } from './engine/edges'

// The shape editor's own sections of the panel: how a shape is placed (S4), how it looks (S3), what it is connected to (S5) and its symmetry (S6). Each step is one undo step.

type EditShape = (id: string, next: ModelShape, selectPoint?: number) => void

// What the Arrange section needs from the page: whether resizing keeps the proportions, the middle of the model in the shape's space, and moving the shape one place
// within its object (forward: in front).
// ---- mirrors (Z3) ----

export interface MirrorActions {
  // the lines a mirror of this shape or object may take
  options: (kind: 'shape' | 'object', twinId: string) => LineOption[]
  onMirror: (kind: 'shape' | 'object', id: string) => void
  onLine: (kind: 'shape' | 'object', twinId: string, line: ModelMirrorLine | null) => void
  onDetach: (kind: 'shape' | 'object', twinId: string) => void
}

// A shape's or an object's mirror: the Mirror button on an original (one mirror each); on a mirror, what it mirrors, its line, and Detach.
export function MirrorSection({ content, kind, thing, actions, clones }: { content: ModelContent; kind: 'shape' | 'object'; thing: ModelShape | ModelObject; actions: MirrorActions; clones?: CloneActions }) {
  const name = thing.name.trim() || `the ${kind}`
  if (thing.mirrorOf) {
    const list = kind === 'shape' ? content.shapes : content.objects
    const original = (list as Array<ModelShape | ModelObject>).find(x => x.id === thing.mirrorOf)
    const options = actions.options(kind, thing.id), at = Math.max(0, options.findIndex(o => sameLine(o.line, thing.mirrorLine)))
    return (
      <div className="cmMirror" role="group" aria-label="Mirror">
        <h3 className="cmInsSub">Mirror of {original?.name.trim() || `an untitled ${kind}`}</h3>
        <label className="cmField">
          <span>Mirror line</span>
          <select aria-label="Mirror line" value={at} onChange={e => actions.onLine(kind, thing.id, options[Number(e.target.value)]?.line ?? null)}>
            {options.map((o, i) => <option key={i} value={i}>{o.name}</option>)}
          </select>
        </label>
        <button type="button" className="cmIconBtn" aria-label={`Detach ${name}`} title={`Detach ${name}: it keeps its outline and stops following its original`} onClick={() => actions.onDetach(kind, thing.id)}><UnlockIcon size={14} /></button>
      </div>
    )
  }
  const list = kind === 'shape' ? content.shapes : content.objects
  const has = (list as Array<ModelShape | ModelObject>).some(x => x.mirrorOf === thing.id)
  return (
    <div className="cmMirror" role="group" aria-label="Copies">
      <button
        type="button" className="cmIconBtn" aria-label={`Mirror ${name}`} disabled={has}
        title={has ? `${name} has a mirror already` : `Mirror ${name}: a copy across a line of symmetry that follows every edit`} onClick={() => actions.onMirror(kind, thing.id)}
      ><SwapIcon size={14} /></button>
      {clones && (
        <button type="button" className="cmIconBtn" aria-label={`Clone ${name}`} title={`Clone ${name}: a copy with a place of its own that changes with every edit of the outline`} onClick={() => clones.onClone(kind, thing.id)}><CopyIcon size={14} /></button>
      )}
    </div>
  )
}

// ---- clones (Z4) ----

export interface CloneActions {
  onClone: (kind: 'shape' | 'object', id: string) => void
  onDetach: (kind: 'shape' | 'object', id: string) => void
  // where a clone object stands (a clone shape is placed by moving, turning and flipping it)
  onPlace: (objectId: string, at: ModelCloneAt) => void
}

// A clone's section: what it is a clone of and Detach; a clone object's place too (Across, Down, Turn, Flip).
export function CloneSection({ content, kind, thing, actions }: { content: ModelContent; kind: 'shape' | 'object'; thing: ModelShape | ModelObject; actions: CloneActions }) {
  const name = thing.name.trim() || `the ${kind}`
  const list = (kind === 'shape' ? content.shapes : content.objects) as Array<ModelShape | ModelObject>
  const original = list.find(x => x.id === thing.cloneOf)
  const at = kind === 'object' ? thing.cloneAt ?? null : null
  const place = (next: Partial<ModelCloneAt>) => { if (at) actions.onPlace(thing.id, { ...at, ...next }) }
  const by = (big: boolean, small: number, large: number) => (big ? large : small)
  return (
    <div className="cmMirror" role="group" aria-label="Clone">
      <h3 className="cmInsSub">Clone of {original?.name.trim() || `an untitled ${kind}`}</h3>
      {at && (
        <>
          <Stepper label="Across" value={fmt(at.x)} bigBy={10} onStep={(dir, big) => place({ x: at.x + dir * by(big, 1, 10) })} />
          <Stepper label="Down" value={fmt(at.y)} bigBy={10} onStep={(dir, big) => place({ y: at.y + dir * by(big, 1, 10) })} />
          <Stepper label="Turn" value={`${fmt(at.turn)}°`} bigBy={15} onStep={(dir, big) => place({ turn: big ? (Math.round(at.turn / 15) + dir) * 15 : at.turn + dir })} />
          <button type="button" className={`cmIconBtn${at.flip ? ' cmIconBtn--on' : ''}`} aria-pressed={at.flip} aria-label="Flip across" title="Flip across" onClick={() => place({ flip: !at.flip })}><FlipAcrossIcon size={14} /></button>
        </>
      )}
      <button type="button" className="cmIconBtn" aria-label={`Detach ${name}`} title={`Detach ${name}: it keeps its outline and stops following its original`} onClick={() => actions.onDetach(kind, thing.id)}><UnlockIcon size={14} /></button>
    </div>
  )
}

export interface ArrangeActions {
  keep: boolean
  onKeep: (on: boolean) => void
  centre: [number, number]
  onStep: (shapeId: string, dir: -1 | 1) => void
  // Align a shape that is connected to others: they all move so the box around them is centred (engine/align.ts); false when it is alone (it aligns by itself)
  onAlign?: (axis: 'x' | 'y') => boolean
  canForward: boolean
  canBack: boolean
}

const fmt = (v: number): string => String(Math.round(v * 100) / 100)

export function ArrangeSection({ shape, actions, onEditShape }: { shape: ModelShape; actions: ArrangeActions; onEditShape: EditShape }) {
  const f = frameOf(shape)
  if (!f) return null
  const edit = (next: ModelShape) => { if (next !== shape) onEditShape(shape.id, next) }
  const by = (big: boolean, small: number, large: number) => (big ? large : small)
  return (
    <div className="cmArrange" role="group" aria-label="Arrange the shape">
      <h3 className="cmInsSub">Arrange</h3>
      <Stepper label="Across" value={fmt(f.cx)} bigBy={10} onStep={(dir, big) => edit(setPlace(shape, 'x', f.cx + dir * by(big, 1, 10)))} />
      <Stepper label="Down" value={fmt(f.cy)} bigBy={10} onStep={(dir, big) => edit(setPlace(shape, 'y', f.cy + dir * by(big, 1, 10)))} />
      <Stepper label="Width" value={fmt(f.w)} bigBy={10} lowerOff={f.w <= MIN_SIDE} raiseOff={f.w <= 1e-6} onStep={(dir, big) => edit(setSize(shape, 'w', f.w + dir * by(big, 1, 10), actions.keep))} />
      <Stepper label="Height" value={fmt(f.h)} bigBy={10} lowerOff={f.h <= MIN_SIDE} raiseOff={f.h <= 1e-6} onStep={(dir, big) => edit(setSize(shape, 'h', f.h + dir * by(big, 1, 10), actions.keep))} />
      <Stepper label="Turn" value={`${fmt(f.rot)}°`} bigBy={15} onStep={(dir, big) => edit(setTurn(shape, big ? (Math.round(f.rot / 15) + dir) * 15 : f.rot + dir))} />
      <div className="cmInline cmArrangeTools">
        <button type="button" className={`cmIconBtn${actions.keep ? ' cmIconBtn--on' : ''}`} aria-pressed={actions.keep} aria-label="Keep proportions" title="Keep proportions" onClick={() => actions.onKeep(!actions.keep)}><LinkIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Flip across" title="Flip across" onClick={() => edit(flipShape(shape, 'across'))}><FlipAcrossIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Flip down" title="Flip down" onClick={() => edit(flipShape(shape, 'down'))}><FlipDownIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Align across to the middle of the model" title="Align across to the middle of the model" onClick={() => { if (!actions.onAlign?.('x')) edit(alignShape(shape, 'x', actions.centre)) }}><AlignAcrossIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Align down to the middle of the model" title="Align down to the middle of the model" onClick={() => { if (!actions.onAlign?.('y')) edit(alignShape(shape, 'y', actions.centre)) }}><AlignDownIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Forward" title="Forward" disabled={!actions.canForward} onClick={() => actions.onStep(shape.id, 1)}><ForwardIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Back" title="Back" disabled={!actions.canBack} onClick={() => actions.onStep(shape.id, -1)}><BackwardIcon size={14} /></button>
      </div>
    </div>
  )
}

// An object's or a group's Align buttons: its shapes and every shape connected to them are centred together on the middle of the model.
export function AlignSection({ kind, onAlign }: { kind: 'object' | 'group'; onAlign: (axis: 'x' | 'y') => void }) {
  return (
    <div className="cmArrange" role="group" aria-label={`Align the ${kind}`}>
      <h3 className="cmInsSub">Align</h3>
      <div className="cmInline cmArrangeTools">
        <button type="button" className="cmIconBtn" aria-label="Align across to the middle of the model" title="Align across to the middle of the model" onClick={() => onAlign('x')}><AlignAcrossIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Align down to the middle of the model" title="Align down to the middle of the model" onClick={() => onAlign('y')}><AlignDownIcon size={14} /></button>
      </div>
    </div>
  )
}

// The type of a shape (shape types T1): Base, Shadow or Light. A shadow or a light has no outline and starts see-through; one turned back into a base shape is opaque with the thin
// outline again. A shape whose every point follows another shape is a stretch shape (a shape made as one says how many of its points still follow nothing).
const TYPE_CHIPS: ModelShapeKind[] = ['base', 'shadow', 'light']
export function TypeSection({ shape, onEditShape }: { shape: ModelShape; onEditShape: EditShape }) {
  const kind = kindOf(shape.kind), chip = kind === 'stretch' ? 'base' : kind, acts = actsAs(shape)
  // a pivot circle (T3) shows its own chip; the others turn it into a shape of that kind (it stops turning about its pivot)
  const chips: ModelShapeKind[] = kind === 'pivot' ? ['pivot', ...TYPE_CHIPS] : TYPE_CHIPS
  const missing = kind === 'stretch' && acts !== 'stretch' ? unlinkedCount(shape) : 0
  const set = (k: ModelShapeKind) => {
    if (k === chip) return
    const cast = k === 'shadow' || k === 'light', was = isCast(shape)
    onEditShape(shape.id, { ...shape, kind: k, pivot: null, ...(cast ? { outline: null, op: was ? shape.op : CAST_OPACITY[k] } : was ? { op: 1, outline: LIMITS.outlineNew } : {}) })
  }
  return (
    <div className="cmShapeType" role="group" aria-label="Type of the shape">
      <h3 className="cmInsSub">Type</h3>
      <div className="cmInline">
        {chips.map(k => <button key={k} type="button" className={`cmChip${chip === k ? ' cmChip--on' : ''}`} aria-pressed={chip === k} onClick={() => set(k)}>{KIND_NAMES[k]}</button>)}
      </div>
      {acts === 'stretch' && <p className="cmInsText" role="status">Stretch: every point follows a shape</p>}
      {missing > 0 && <p className="cmInsText" role="status">Stretch: {missing} {missing === 1 ? 'point follows' : 'points follow'} nothing yet</p>}
    </div>
  )
}

// The shape's anchors (shape types T4): each with a name and a Delete. They are placed from the point form (a right-click on a point, or inside the shape).
export function MarksSection({ shape, onEditShape }: { shape: ModelShape; onEditShape: (id: string, next: ModelShape) => void }) {
  return (
    <>
      <MarkList shape={shape} kind="anchor" group="Anchors" one="anchor" onEditShape={onEditShape} />
      <MarkList shape={shape} kind="pose" group="Posable points" one="posable point" onEditShape={onEditShape} />
    </>
  )
}
function MarkList({ shape, kind, group, one, onEditShape }: { shape: ModelShape; kind: 'anchor' | 'pose'; group: string; one: string; onEditShape: (id: string, next: ModelShape) => void }) {
  const marks = (shape.marks ?? []).filter(m => m.kind === kind)
  if (!marks.length) return null
  return (
    <div className="cmMarksPanel" role="group" aria-label={group}>
      <h3 className="cmInsSub">{group}</h3>
      {marks.map((m, k) => (
        <div key={m.id} className="cmInline cmMarkRow">
          <label className="cmField"><span>{`Name of ${one} ${k + 1}`}</span><input value={m.name} maxLength={NAME_LIMIT} placeholder={m.i === null ? 'Inside the shape' : `On point ${m.i + 1}`} onChange={e => onEditShape(shape.id, renameMark(shape, m.id, e.target.value))} /></label>
          <button type="button" className="cmIconBtn" aria-label={`Delete ${one} ${k + 1}`} title={`Delete the ${one}`} onClick={() => onEditShape(shape.id, removeMark(shape, m.id))}><CloseIcon size={14} /></button>
        </div>
      ))}
    </div>
  )
}

// A pivot circle (shape types T3): its pivot's name and place, the circle's size, its turn and the smallest and largest turn allowed, and one more circle on the pivot.
// A pivot point's section (joints J2): the turn of the linked point it is made from, and the smallest and largest turn allowed (5 degrees a step; Shift 15).
// Joint limits (slice 9d): its name and the joint of the body it stands for, which sets its limits from the table.
export interface JointActions {
  joint: ModelJoint
  onSetting: (key: 'turn' | 'lo' | 'hi', value: number) => void
  onName?: (name: string) => void
  onKind?: (kind: ModelJointKind | null) => void
}
export function JointSection({ actions }: { actions: JointActions }) {
  const p = actions.joint
  const deg = (v: number) => `${fmt(v)}°`, step = (big: boolean) => (big ? 15 : 5)
  const [name, setName] = useState<string | null>(null)
  const commitName = () => { if (name !== null && name.trim() !== (p.name ?? '')) actions.onName?.(name); setName(null) }
  return (
    <div className="cmPivotPanel" role="group" aria-label="Pivot point">
      <h3 className="cmInsSub">Pivot point</h3>
      {actions.onName && (
        <label className="cmField">
          <span>Name</span>
          <input value={name ?? p.name ?? ''} maxLength={JOINT_NAME_MAX} placeholder={p.kind ? JOINT_LABEL[p.kind] : ''} aria-label="Name of the pivot point"
            onChange={e => setName(e.target.value)} onBlur={commitName} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        </label>
      )}
      {actions.onKind && (
        <label className="cmField">
          <span>Stands for</span>
          <select value={p.kind ?? ''} onChange={e => actions.onKind?.((e.target.value || null) as ModelJointKind | null)}>
            <option value="">No joint of the body</option>
            {JOINT_KINDS.map(k => <option key={k} value={k}>{JOINT_LABEL[k]}</option>)}
          </select>
        </label>
      )}
      {p.kind && <p className="cmInsText">{JOINT_LABEL[p.kind]}: {JOINT_NOTE[p.kind]}. Choosing it set the limits; they can still be changed here.</p>}
      <Stepper label="Turn" value={deg(p.turn)} bigBy={15} lowerOff={p.turn <= p.lo} raiseOff={p.turn >= p.hi} onStep={(dir, big) => actions.onSetting('turn', p.turn + dir * step(big))} />
      <Stepper label="Turns at least" value={deg(p.lo)} bigBy={15} lowerOff={p.lo <= -TURN_LIMIT} raiseOff={p.lo >= 0} onStep={(dir, big) => actions.onSetting('lo', p.lo + dir * step(big))} />
      <Stepper label="Turns at most" value={deg(p.hi)} bigBy={15} lowerOff={p.hi <= 0} raiseOff={p.hi >= TURN_LIMIT} onStep={(dir, big) => actions.onSetting('hi', p.hi + dir * step(big))} />
    </div>
  )
}

// The look of a shape (S3): its outline (on or off, and its width in the model's units) and its opacity, which fades the fill only. A shadow or a light has only its opacity (T1).
// Per-edge outlines (slice 9a): which part of the shape is selected, where its edges' outlines are kept (null: a clone, whose edges are its original's) and setting one edge
// (null: every edge) on or off.
export interface EdgeActions {
  part: PartKind
  home: (shape: ModelShape) => EdgeHome | null
  onEdge: (shape: ModelShape, e: number | null, on: boolean) => void
}

export function LookSection({ shape, onEditShape, selPoint = -1, edges }: { shape: ModelShape; onEditShape: EditShape; selPoint?: number; edges?: EdgeActions }) {
  const on = typeof shape.outline === 'number', width = shape.outline ?? LIMITS.outlineNew, op = Math.round(shape.op * 100)
  const set = (patch: Partial<ModelShape>) => onEditShape(shape.id, { ...shape, ...patch })
  const stepWidth = (dir: -1 | 1, big: boolean) => set({ outline: Math.round(Math.min(LIMITS.outlineMax, Math.max(LIMITS.outlineMin, width + dir * (big ? 1 : 0.25))) * 100) / 100 })
  const stepOpacity = (dir: -1 | 1, big: boolean) => set({ op: Math.min(100, Math.max(0, op + dir * (big ? 25 : 5))) / 100 })
  return (
    <div className="cmLook" role="group" aria-label="Look of the shape">
      <h3 className="cmInsSub">Look</h3>
      {!isCast(shape) && (
      <div className="cmInline">
        <button type="button" className={`cmIconBtn${on ? ' cmIconBtn--on' : ''}`} aria-pressed={on} aria-label="Outline" title="Outline" onClick={() => set({ outline: on ? null : width })}><PolygonIcon size={14} /></button>
        <Stepper label="Outline width" value={on ? String(width) : 'None'} lowerOff={!on || width <= LIMITS.outlineMin} raiseOff={!on || width >= LIMITS.outlineMax} bigBy={1} onStep={stepWidth} />
      </div>
      )}
      {on && !isCast(shape) && edges && <EdgeLines shape={shape} selPoint={selPoint} edges={edges} />}
      <Stepper label="Opacity of the shape" value={`${op}%`} lowerOff={op <= 0} raiseOff={op >= 100} bigBy={25} onStep={stepOpacity} />
    </div>
  )
}

// Which edges have the outline: the selected edge on or off, or every edge at once. A symmetric shape's copies are outlined together, so it is set as a whole.
function EdgeLines({ shape, selPoint, edges }: { shape: ModelShape; selPoint: number; edges: EdgeActions }) {
  const home = edges.home(shape)
  if (!home) return <p className="cmInsText">A clone's edges are outlined as its original's are.</p>
  const { lined, edges: total } = edgeCount(home.list, home.closed)
  const seg = edges.part === 'segment' && !shape.sym && selPoint >= 0 && selPoint < total ? selPoint : -1
  const segOn = seg >= 0 && homeEdgeLined(home, seg)
  return (
    <div className="cmEdgeLines cmInline" role="group" aria-label="Edges with the outline">
      <p className="cmInsText">{lined === total ? 'Every edge has the outline.' : lined === 0 ? 'No edge has the outline.' : `${lined} of ${total} edges have the outline.`}</p>
      {seg >= 0 && (
        <button type="button" className={`cmBtn cmBtn--small${segOn ? ' cmBtn--on' : ''}`} aria-pressed={segOn} onClick={() => edges.onEdge(shape, seg, !segOn)}>Outline this edge</button>
      )}
      {seg < 0 && !shape.sym && <p className="cmInsText">Select an edge to outline it or not.</p>}
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={lined === total} onClick={() => edges.onEdge(shape, null, true)}>Every edge</button>
        <button type="button" className="cmBtn cmBtn--small" disabled={lined === 0} onClick={() => edges.onEdge(shape, null, false)}>No edges</button>
      </div>
    </div>
  )
}

// ---- connections (S5) ----

// What the Connections section needs from the page: which part of the shape is selected, naming a connection (or the shared segment that starts at a point) and cutting one
// (`both`: the two ends of a shared segment).
export interface ConnectionActions {
  part: PartKind
  onName: (shapeId: string, i: number, field: 'name' | 'segName', value: string) => void
  onDisconnect: (shapeId: string, i: number, both: boolean) => void
  // on a symmetric shape, the copy of a shared segment a segment is (it shows the connection of the copy that is shared)
  copyShare?: (shapeId: string, e: number) => CopyShare | null
}

interface ConnectionRow { key: string; text: string; shapeId: string; i: number; field: 'name' | 'segName'; value: string; label: string; with?: string }

// The connections of the selected point (its own, and the points welded to it) or the selected segment (shared with another shape, either way round), each with a name
// and Disconnect.
export function ConnectionsSection({ content, shape, selPoint, actions }: { content: ModelContent; shape: ModelShape; selPoint: number; actions: ConnectionActions }) {
  const nameOf = (id: string): string => shapeById(content, id)?.name || 'a shape'
  const rows: ConnectionRow[] = []
  if (actions.part === 'point') {
    // on a symmetric shape the copies of a point share its link (joints J1): a copy shows the link of the copy that holds it
    const holder = linkHolder(shape, selPoint), b = holder === null ? null : shape.pts[holder]?.bind
    if (b && holder !== null) {
      const text = b.kind === 'edge' ? `On a segment of ${nameOf(b.s)}` : b.kind === 'center' ? `On the centre of ${nameOf(b.s)}` : isWeld(b) ? `Welded to point ${b.i + 1} of ${nameOf(b.s)}` : `Follows point ${b.i + 1} of ${nameOf(b.s)}`
      rows.push({ key: 'own', text: holder === selPoint ? text : `${text} (a copy of point ${holder + 1})`, shapeId: shape.id, i: holder, field: 'name', value: b.name ?? '', label: 'Name of the connection' })
    }
    for (const f of weldedTo(content, shape.id, selPoint)) {
      const fb = shapeById(content, f.shapeId)?.pts[f.i]?.bind
      rows.push({ key: `${f.shapeId}:${f.i}`, text: `Point ${f.i + 1} of ${nameOf(f.shapeId)} is welded to it`, shapeId: f.shapeId, i: f.i, field: 'name', value: fb?.name ?? '', label: `Name of the connection to ${nameOf(f.shapeId)}` })
    }
  } else if (actions.part === 'segment') {
    // on a symmetric shape a copy of a shared segment shows the connection of the copy that is shared (the user, 2026-11-15: shared on both segments)
    const copy = !sharedSegment(content, shape.id, selPoint) && !sharersOf(content, shape.id, selPoint).length ? actions.copyShare?.(shape.id, selPoint) ?? null : null
    const seg = copy?.weld ? copy.source : selPoint, note = copy?.weld ? ` (a copy of segment ${copy.source + 1})` : ''
    const own = sharedSegment(content, shape.id, seg)
    if (own) rows.push({ key: 'seg', text: `Shared with ${nameOf(own.shapeId)}${note}`, shapeId: shape.id, i: seg, field: 'segName', value: shape.pts[seg]?.bind?.segName ?? '', label: 'Name of the shared segment', with: nameOf(own.shapeId) })
    for (const sh of sharersOf(content, shape.id, seg)) {
      const fb = shapeById(content, sh.shapeId)?.pts[sh.e]?.bind
      rows.push({ key: `${sh.shapeId}:${sh.e}`, text: `Shared with ${nameOf(sh.shapeId)}${note}`, shapeId: sh.shapeId, i: sh.e, field: 'segName', value: fb?.segName ?? '', label: `Name of the segment shared with ${nameOf(sh.shapeId)}`, with: nameOf(sh.shapeId) })
    }
  }
  if (!rows.length) return null
  return (
    <div className="cmConnections" role="group" aria-label="Connections">
      <h3 className="cmInsSub">Connections</h3>
      {rows.map(r => (
        <div key={r.key} className="cmConnRow">
          <label className="cmField">
            <span>{r.text}</span>
            <input value={r.value} maxLength={NAME_LIMIT} aria-label={r.label} onChange={e => actions.onName(r.shapeId, r.i, r.field, e.target.value)} />
          </label>
          <button type="button" className="cmIconBtn" aria-label={r.field === 'segName' ? `Disconnect the segment shared with ${r.with ?? nameOf(r.shapeId)}` : r.key === 'own' ? 'Disconnect' : `Disconnect ${nameOf(r.shapeId)}`} title="Disconnect" onClick={() => actions.onDisconnect(r.shapeId, r.i, r.field === 'segName')}><CloseIcon size={14} /></button>
        </div>
      ))}
    </div>
  )
}

// ---- the centre (C1) ----

// What the Centre section needs from the page: whether the shape is anchored at its centre, and the points of other shapes linked to it, each a pivot point or not.
export interface CentreActions {
  anchored: boolean
  onAnchor: () => void
  linked: Array<{ shapeId: string; i: number; pivot: boolean }>
  onPivot: (shapeId: string, i: number) => void
  onDisconnect: (shapeId: string, i: number) => void
}
export function CentreSection({ content, actions }: { content: ModelContent; actions: CentreActions }) {
  const nameOf = (id: string): string => shapeById(content, id)?.name || 'a shape'
  return (
    <div className="cmCentrePanel" role="group" aria-label="Centre">
      <h3 className="cmInsSub">Centre</h3>
      <div className="cmInline">
        <button type="button" className={`cmIconBtn${actions.anchored ? ' cmIconBtn--on' : ''}`} aria-pressed={actions.anchored} aria-label="Anchor at the centre" title={actions.anchored ? 'Anchor: take the anchor off' : 'Anchor: pin the shape at its centre'} onClick={actions.onAnchor}><AnchorIcon size={14} /></button>
      </div>
      {actions.linked.map(l => (
        <div key={`${l.shapeId}:${l.i}`} className="cmConnRow">
          <span className="cmInsText">Point {l.i + 1} of {nameOf(l.shapeId)}</span>
          <button type="button" className={`cmIconBtn${l.pivot ? ' cmIconBtn--on' : ''}`} aria-pressed={l.pivot} aria-label={`Pivot: point ${l.i + 1} of ${nameOf(l.shapeId)}`} title={l.pivot ? 'Pivot: make it a plain link' : 'Pivot: the shapes on its two sides bend here'} onClick={() => actions.onPivot(l.shapeId, l.i)}><OrbitIcon size={14} /></button>
          <button type="button" className="cmIconBtn" aria-label={`Disconnect point ${l.i + 1} of ${nameOf(l.shapeId)}`} title="Disconnect" onClick={() => actions.onDisconnect(l.shapeId, l.i)}><CloseIcon size={14} /></button>
        </div>
      ))}
    </div>
  )
}

// ---- symmetry (S6) ----

// What the Symmetry section needs from the page: the axes being chosen (the canvas then waits for a click on the side to copy), starting and changing that, and turning
// symmetry off (the points stay).
export interface SymmetryActions {
  choosing: { a: number; n: number } | null
  onStart: () => void
  onChoose: (a: number, n: number) => void
  onCancel: () => void
  onOff: (shapeId: string) => void
}

// The presets of the first axis: its angle in the shape's frame (y grows downward, so 45 runs down to the right).
const AXIS_PRESETS: Array<{ a: number; name: string }> = [
  { a: 90, name: 'Vertical' }, { a: 0, name: 'Horizontal' }, { a: 45, name: 'Diagonal, down to the right' }, { a: 135, name: 'Diagonal, up to the right' },
]

export function SymmetrySection({ shape, actions }: { shape: ModelShape; actions: SymmetryActions }) {
  const sym = shape.sym, ch = actions.choosing, pressed = !!sym || !!ch
  const turnAxis = (a: number, by: number) => (((a + by) % 180) + 180) % 180
  return (
    <div className="cmSymmetry" role="group" aria-label="Symmetry">
      <h3 className="cmInsSub">Symmetry</h3>
      <div className="cmInline">
        <button
          type="button" className={`cmIconBtn${pressed ? ' cmIconBtn--on' : ''}`} aria-pressed={pressed} aria-label="Symmetry" title="Symmetry"
          disabled={shape.mirrorOf != null || !shape.closed} onClick={() => (sym ? actions.onOff(shape.id) : ch ? actions.onCancel() : actions.onStart())}
        ><FlipAcrossIcon size={14} /></button>
        {sym && <span className="cmInsText">{sym.n === 1 ? '1 axis' : `${sym.n} axes`} at {sym.a}°</span>}
      </div>
      {ch && !sym && (
        <>
          <div className="cmChips" role="group" aria-label="Axis presets">
            {AXIS_PRESETS.map(pr => (
              <button key={pr.a} type="button" className={`cmChip${ch.a === pr.a ? ' cmChip--on' : ''}`} aria-pressed={ch.a === pr.a} onClick={() => actions.onChoose(pr.a, ch.n)}>{pr.name}</button>
            ))}
          </div>
          <Stepper label="Angle of the first axis" value={`${ch.a}°`} bigBy={15} onStep={(dir, big) => actions.onChoose(turnAxis(ch.a, dir * (big ? 15 : 1)), ch.n)} />
          <Stepper label="Number of axes" value={String(ch.n)} lowerOff={ch.n <= 1} raiseOff={ch.n >= SYM_AXES_MAX} onStep={dir => actions.onChoose(ch.a, Math.min(SYM_AXES_MAX, Math.max(1, ch.n + dir)))} />
        </>
      )}
    </div>
  )
}
