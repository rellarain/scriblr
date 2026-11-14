import type { ModelContent, ModelShape } from '../../../../api/types'
import type { PartKind } from './designerState'
import { NAME_LIMIT, isWeld, sharedSegment, sharersOf, weldedTo } from './engine/connect'
import { shapeById } from './modelContent'
import { AlignAcrossIcon, AlignDownIcon, BackwardIcon, CloseIcon, FlipAcrossIcon, FlipDownIcon, ForwardIcon, LinkIcon, PolygonIcon } from '../../../icons'
import { LIMITS } from './engine/limits'
import { MIN_SIDE, alignShape, flipShape, frameOf, setPlace, setSize, setTurn } from './engine/transform'
import { Stepper } from './Stepper'

// The shape editor's own sections of the panel: how a shape is placed (S4), how it looks (S3) and what it is connected to (S5). Each step is one undo step.

type EditShape = (id: string, next: ModelShape, selectPoint?: number) => void

// What the Arrange section needs from the page: whether resizing keeps the proportions, the middle of the model in the shape's space, and moving the shape one place
// within its object (forward: in front).
export interface ArrangeActions {
  keep: boolean
  onKeep: (on: boolean) => void
  centre: [number, number]
  onStep: (shapeId: string, dir: -1 | 1) => void
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
        <button type="button" className="cmIconBtn" aria-label="Align across to the middle of the model" title="Align across to the middle of the model" onClick={() => edit(alignShape(shape, 'x', actions.centre))}><AlignAcrossIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Align down to the middle of the model" title="Align down to the middle of the model" onClick={() => edit(alignShape(shape, 'y', actions.centre))}><AlignDownIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Forward" title="Forward" disabled={!actions.canForward} onClick={() => actions.onStep(shape.id, 1)}><ForwardIcon size={14} /></button>
        <button type="button" className="cmIconBtn" aria-label="Back" title="Back" disabled={!actions.canBack} onClick={() => actions.onStep(shape.id, -1)}><BackwardIcon size={14} /></button>
      </div>
    </div>
  )
}

// The look of a shape (S3): its outline (on or off, and its width in the model's units) and its opacity, which fades the fill only.
export function LookSection({ shape, onEditShape }: { shape: ModelShape; onEditShape: EditShape }) {
  const on = typeof shape.outline === 'number', width = shape.outline ?? LIMITS.outlineNew, op = Math.round(shape.op * 100)
  const set = (patch: Partial<ModelShape>) => onEditShape(shape.id, { ...shape, ...patch })
  const stepWidth = (dir: -1 | 1, big: boolean) => set({ outline: Math.round(Math.min(LIMITS.outlineMax, Math.max(LIMITS.outlineMin, width + dir * (big ? 1 : 0.25))) * 100) / 100 })
  const stepOpacity = (dir: -1 | 1, big: boolean) => set({ op: Math.min(100, Math.max(0, op + dir * (big ? 25 : 5))) / 100 })
  return (
    <div className="cmLook" role="group" aria-label="Look of the shape">
      <h3 className="cmInsSub">Look</h3>
      <div className="cmInline">
        <button type="button" className={`cmIconBtn${on ? ' cmIconBtn--on' : ''}`} aria-pressed={on} aria-label="Outline" title="Outline" onClick={() => set({ outline: on ? null : width })}><PolygonIcon size={14} /></button>
        <Stepper label="Outline width" value={on ? String(width) : 'None'} lowerOff={!on || width <= LIMITS.outlineMin} raiseOff={!on || width >= LIMITS.outlineMax} bigBy={1} onStep={stepWidth} />
      </div>
      <Stepper label="Opacity of the shape" value={`${op}%`} lowerOff={op <= 0} raiseOff={op >= 100} bigBy={25} onStep={stepOpacity} />
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
}

interface ConnectionRow { key: string; text: string; shapeId: string; i: number; field: 'name' | 'segName'; value: string; label: string }

// The connections of the selected point (its own, and the points welded to it) or the selected segment (shared with another shape, either way round), each with a name
// and Disconnect.
export function ConnectionsSection({ content, shape, selPoint, actions }: { content: ModelContent; shape: ModelShape; selPoint: number; actions: ConnectionActions }) {
  const nameOf = (id: string): string => shapeById(content, id)?.name || 'a shape'
  const rows: ConnectionRow[] = []
  if (actions.part === 'point') {
    const b = shape.pts[selPoint]?.bind
    if (b) {
      const text = b.kind === 'edge' ? `On a segment of ${nameOf(b.s)}` : isWeld(b) ? `Welded to point ${b.i + 1} of ${nameOf(b.s)}` : `Follows point ${b.i + 1} of ${nameOf(b.s)}`
      rows.push({ key: 'own', text, shapeId: shape.id, i: selPoint, field: 'name', value: b.name ?? '', label: 'Name of the connection' })
    }
    for (const f of weldedTo(content, shape.id, selPoint)) {
      const fb = shapeById(content, f.shapeId)?.pts[f.i]?.bind
      rows.push({ key: `${f.shapeId}:${f.i}`, text: `Point ${f.i + 1} of ${nameOf(f.shapeId)} is welded to it`, shapeId: f.shapeId, i: f.i, field: 'name', value: fb?.name ?? '', label: `Name of the connection to ${nameOf(f.shapeId)}` })
    }
  } else if (actions.part === 'segment') {
    const own = sharedSegment(content, shape.id, selPoint)
    if (own) rows.push({ key: 'seg', text: `Shared with ${nameOf(own.shapeId)}`, shapeId: shape.id, i: selPoint, field: 'segName', value: shape.pts[selPoint]?.bind?.segName ?? '', label: 'Name of the shared segment' })
    for (const sh of sharersOf(content, shape.id, selPoint)) {
      const fb = shapeById(content, sh.shapeId)?.pts[sh.e]?.bind
      rows.push({ key: `${sh.shapeId}:${sh.e}`, text: `Shared with ${nameOf(sh.shapeId)}`, shapeId: sh.shapeId, i: sh.e, field: 'segName', value: fb?.segName ?? '', label: `Name of the segment shared with ${nameOf(sh.shapeId)}` })
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
          <button type="button" className="cmIconBtn" aria-label={r.field === 'segName' ? `Disconnect the segment shared with ${r.key === 'seg' ? nameOf(sharedSegment(content, shape.id, selPoint)?.shapeId ?? '') : nameOf(r.shapeId)}` : r.key === 'own' ? 'Disconnect' : `Disconnect ${nameOf(r.shapeId)}`} title="Disconnect" onClick={() => actions.onDisconnect(r.shapeId, r.i, r.field === 'segName')}><CloseIcon size={14} /></button>
        </div>
      ))}
    </div>
  )
}
