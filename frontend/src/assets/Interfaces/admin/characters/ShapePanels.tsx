import type { ModelContent, ModelPivot, ModelShape, ModelShapeKind } from '../../../../api/types'
import type { PartKind } from './designerState'
import { NAME_LIMIT, isWeld, sharedSegment, sharersOf, weldedTo } from './engine/connect'
import { shapeById } from './modelContent'
import { AlignAcrossIcon, AlignDownIcon, BackwardIcon, CloseIcon, FlipAcrossIcon, FlipDownIcon, ForwardIcon, LinkIcon, PlusIcon, PolygonIcon } from '../../../icons'
import { RADIUS, TURN_LIMIT } from './engine/pivots'
import { LIMITS } from './engine/limits'
import { CAST_OPACITY, KIND_NAMES, actsAs, isCast, kindOf, unlinkedCount } from './engine/kinds'
import { SYM_AXES_MAX } from './engine/symmetry'
import { MIN_SIDE, alignShape, flipShape, frameOf, setPlace, setSize, setTurn } from './engine/transform'
import { Stepper } from './Stepper'

// The shape editor's own sections of the panel: how a shape is placed (S4), how it looks (S3), what it is connected to (S5) and its symmetry (S6). Each step is one undo step.

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

// A pivot circle (shape types T3): its pivot's name and place, the circle's size, its turn and the smallest and largest turn allowed, and one more circle on the pivot.
export interface PivotActions {
  pivot: ModelPivot
  radius: number
  onName: (name: string) => void
  onMove: (dx: number, dy: number) => void
  onRadius: (r: number) => void
  onSetting: (key: 'turn' | 'lo' | 'hi', value: number) => void
  onAddCircle: () => void
}
export function PivotSection({ shape, actions }: { shape: ModelShape; actions: PivotActions }) {
  const p = shape.pivot
  if (!p) return null
  const deg = (v: number) => `${fmt(v)}°`, step = (big: boolean) => (big ? 15 : 5)
  return (
    <div className="cmPivotPanel" role="group" aria-label="Pivot">
      <h3 className="cmInsSub">Pivot</h3>
      <label className="cmField"><span>Pivot name</span><input value={actions.pivot.name} maxLength={NAME_LIMIT} placeholder="Pivot" onChange={e => actions.onName(e.target.value)} /></label>
      <Stepper label="Across" value={fmt(actions.pivot.x)} bigBy={10} onStep={(dir, big) => actions.onMove(dir * (big ? 10 : 1), 0)} />
      <Stepper label="Down" value={fmt(actions.pivot.y)} bigBy={10} onStep={(dir, big) => actions.onMove(0, dir * (big ? 10 : 1))} />
      <Stepper label="Size" value={fmt(actions.radius)} bigBy={5} lowerOff={actions.radius <= RADIUS.min} raiseOff={actions.radius >= RADIUS.max} onStep={(dir, big) => actions.onRadius(actions.radius + dir * (big ? 5 : 1))} />
      <Stepper label="Turn" value={deg(p.turn)} bigBy={15} lowerOff={p.turn <= p.lo} raiseOff={p.turn >= p.hi} onStep={(dir, big) => actions.onSetting('turn', p.turn + dir * step(big))} />
      <Stepper label="Turns at least" value={deg(p.lo)} bigBy={15} lowerOff={p.lo <= -TURN_LIMIT} raiseOff={p.lo >= 0} onStep={(dir, big) => actions.onSetting('lo', p.lo + dir * step(big))} />
      <Stepper label="Turns at most" value={deg(p.hi)} bigBy={15} lowerOff={p.hi <= 0} raiseOff={p.hi >= TURN_LIMIT} onStep={(dir, big) => actions.onSetting('hi', p.hi + dir * step(big))} />
      <div className="cmInline">
        <button type="button" className="cmIconBtn" aria-label="Add a circle" title="Add a circle to the pivot" onClick={actions.onAddCircle}><PlusIcon size={14} /></button>
      </div>
    </div>
  )
}

// The look of a shape (S3): its outline (on or off, and its width in the model's units) and its opacity, which fades the fill only. A shadow or a light has only its opacity (T1).
export function LookSection({ shape, onEditShape }: { shape: ModelShape; onEditShape: EditShape }) {
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
