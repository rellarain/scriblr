import { useState, type ReactNode } from 'react'
import type { ModelBlend, ModelContent, ModelGradDir, ModelShape, ModelTintKind } from '../../../../api/types'
import { CursorIcon, EyeOffIcon, LayersIcon, PlusIcon } from '../../../icons'
import { Stepper } from './Stepper'
import { paintLocked } from './engine/paintEdit'
import { LIMITS, shadingCount } from './engine/limits'
import { KINDS, SIDES, type Side } from './engine/shadeEdit'
import { slotsOf } from './engine/colour'
import { valueText } from './rigView'
import { objectOfShape, shapeById } from './modelContent'

// The Paint section of the Colour tab (phase 4b): what is done to the colour of the selected shape. A tone, a derived tone, a gradient, a blend mode, a clip, the
// shapes that cut a hole in it, whether it is a helper; or, for a shading shape, its kind and amount. A shape that takes its paint from another (a twin, a shape that
// follows a template) shows where from instead. Nothing here is saved by the test character: it is the model's own data.
export interface PaintActions {
  setTone: (id: string, tone: number) => void
  setDerive: (id: string, kind: ModelTintKind | null) => void
  stepTint: (id: string, field: 'derive' | 'shade', dir: 1 | -1, big: boolean) => void
  setShadeKind: (id: string, kind: ModelTintKind) => void
  setGradient: (id: string, grad: { dir: ModelGradDir; to: string | null } | null) => void
  setBlend: (id: string, blend: ModelBlend | null) => void
  setClip: (id: string, target: string | null) => void
  toggleCut: (id: string, target: string) => void
  setHelper: (id: string, on: boolean) => void
  // Show the shape with a slider (null: always shown), and move the two places that hide and show it one step (phase 5b)
  setFade: (id: string, sliderId: string | null) => void
  stepFade: (id: string, end: 'hidden' | 'shown', dir: 1 | -1, big: boolean) => void
  addShading: (id: string, kind: ModelTintKind, side: Side) => void
  // start (or stop, with null) picking a shape on the canvas to clip to or to cut with
  pick: (what: 'clip' | 'cut' | null) => void
}

const label = (name: string, fallback: string) => name.trim() || fallback
const TONES = [{ v: -1, name: 'Darker' }, { v: 0, name: 'Base' }, { v: 1, name: 'Lighter' }]
const KIND_NAMES: Record<ModelTintKind, string> = { shadow: 'Shadow', mid: 'Mid tone', highlight: 'Highlight' }
const DIRECTIONS: Array<{ id: ModelGradDir; name: string }> = [{ id: 'down', name: 'Down' }, { id: 'up', name: 'Up' }, { id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }, { id: 'radial', name: 'Radial' }]
const BLENDS: Array<{ id: ModelBlend | null; name: string }> = [{ id: null, name: 'Normal' }, { id: 'multiply', name: 'Multiply' }, { id: 'screen', name: 'Screen' }, { id: 'overlay', name: 'Overlay' }]

// A row of chips with a label of its own above it (the chips are a group of the same name).
function ChipRow({ label: text, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cmChipRow">
      <span className="cmChipsLabel" aria-hidden="true">{text}</span>
      <div className="cmChips" role="group" aria-label={text}>{children}</div>
    </div>
  )
}

export function PaintSection({ content, shape, picking, actions }: { content: ModelContent; shape: ModelShape; picking: 'clip' | 'cut' | null; actions: PaintActions }) {
  const [kind, setKind] = useState<ModelTintKind>('shadow')
  const [side, setSide] = useState<Side>('left')
  const home = objectOfShape(content, shape.id)
  const name = label(shape.name, 'This shape')
  const locked = paintLocked(content, shape)
  const slots = slotsOf(content)
  const id = shape.id

  // the shapes a clip or a cut-out can point at without picking: the object's own shapes (not its shading), every helper, and whatever it points at now
  const clipName = shape.clip ? label(shapeById(content, shape.clip)?.name ?? '', shape.clip) : ''
  const candidates = [...new Set([...(home?.shapes ?? []), ...content.shapes.filter(s => s.helper).map(s => s.id), ...(shape.clip ? [shape.clip] : []), ...(shape.cut ?? [])])]
    .filter(t => t !== id).map(t => shapeById(content, t)).filter((s): s is ModelShape => !!s && (!s.shade || s.id === shape.clip || (shape.cut ?? []).includes(s.id)))
  const nameOf = (s: ModelShape) => `${label(s.name, 'Untitled shape')}${s.helper ? ' (helper)' : ''}`

  if (locked) {
    return (
      <section className="cmSec" aria-label="Paint of the selection">
        <h3 className="cmInsSub">Paint</h3>
        <p className="cmInsText">{locked}</p>
      </section>
    )
  }

  const shading = shadingCount(content, home?.id ?? '')
  const bandKindName = KIND_NAMES[kind].toLowerCase()
  return (
    <section className="cmSec" aria-label="Paint of the selection">
      <h3 className="cmInsSub">{shape.shade ? 'Shading' : 'Paint'}</h3>

      {shape.shade ? (
        <>
          <p className="cmInsText">{name} is a shading shape: a tone of its colour, kept inside the other shapes of its object.</p>
          <ChipRow label="Kind of shading">
            {KINDS.map(k => <button key={k.id} type="button" className={`cmChip cmChip--wide${shape.shade?.kind === k.id ? ' cmChip--on' : ''}`} aria-pressed={shape.shade?.kind === k.id} onClick={() => actions.setShadeKind(id, k.id)}>{k.name}</button>)}
          </ChipRow>
          <Stepper label="Amount" value={shape.shade.t.toFixed(2)} lowerOff={shape.shade.t <= 0.02} raiseOff={shape.shade.t >= 0.8} onStep={(dir, big) => actions.stepTint(id, 'shade', dir, big)} />
        </>
      ) : (
        <>
          <ChipRow label="Tone">
            {TONES.map(t => <button key={t.v} type="button" className={`cmChip cmChip--wide${(shape.tone ?? 0) === t.v ? ' cmChip--on' : ''}`} aria-pressed={(shape.tone ?? 0) === t.v} title={t.v === 0 ? 'The colour as it is' : `A step ${t.name.toLowerCase()} than the colour`} onClick={() => actions.setTone(id, t.v)}>{t.name}</button>)}
          </ChipRow>
          <ChipRow label="Derived tone">
            <button type="button" className={`cmChip cmChip--wide${!shape.derive ? ' cmChip--on' : ''}`} aria-pressed={!shape.derive} title="The colour itself" onClick={() => actions.setDerive(id, null)}>Own colour</button>
            {KINDS.map(k => <button key={k.id} type="button" className={`cmChip cmChip--wide${shape.derive?.kind === k.id ? ' cmChip--on' : ''}`} aria-pressed={shape.derive?.kind === k.id} title={`A ${KIND_NAMES[k.id].toLowerCase()} of the colour (a brow is a shadow of the hair)`} onClick={() => actions.setDerive(id, k.id)}>{k.name}</button>)}
          </ChipRow>
          {shape.derive && <Stepper label="Derived amount" value={shape.derive.t.toFixed(2)} lowerOff={shape.derive.t <= 0.02} raiseOff={shape.derive.t >= 0.8} onStep={(dir, big) => actions.stepTint(id, 'derive', dir, big)} />}

          <ChipRow label="Gradient">
            <button type="button" className={`cmChip cmChip--wide${!shape.grad ? ' cmChip--on' : ''}`} aria-pressed={!shape.grad} title="One flat colour" onClick={() => actions.setGradient(id, null)}>No gradient</button>
            {DIRECTIONS.map(d => <button key={d.id} type="button" className={`cmChip${shape.grad?.dir === d.id ? ' cmChip--on' : ''}`} aria-pressed={shape.grad?.dir === d.id} title={d.id === 'radial' ? 'From the middle outward' : `The colour runs ${d.id}`} onClick={() => actions.setGradient(id, { dir: d.id, to: shape.grad?.to ?? null })}>{d.name}</button>)}
          </ChipRow>
          {shape.grad && (
            <ChipRow label="Second colour of the gradient">
              <button type="button" className={`cmChip cmChip--wide${!shape.grad.to ? ' cmChip--on' : ''}`} aria-pressed={!shape.grad.to} title="A darker tone of its own colour" onClick={() => actions.setGradient(id, { dir: shape.grad!.dir, to: null })}>Darker of itself</button>
              {slots.map(s => <button key={s.id} type="button" className={`cmChip cmChip--wide${shape.grad?.to === s.id ? ' cmChip--on' : ''}`} aria-pressed={shape.grad?.to === s.id} onClick={() => actions.setGradient(id, { dir: shape.grad!.dir, to: s.id })}>{label(s.name, 'Untitled slot')}</button>)}
            </ChipRow>
          )}
        </>
      )}

      <ChipRow label="Blend mode">
        {BLENDS.map(b => <button key={b.name} type="button" className={`cmChip cmChip--wide${(shape.blend ?? null) === b.id ? ' cmChip--on' : ''}`} aria-pressed={(shape.blend ?? null) === b.id} onClick={() => actions.setBlend(id, b.id)}>{b.name}</button>)}
      </ChipRow>

      <ChipRow label="Clip to">
        <button type="button" className={`cmChip cmChip--wide${!shape.clip ? ' cmChip--on' : ''}`} aria-pressed={!shape.clip} title="Draw it whole" onClick={() => actions.setClip(id, null)}>Not clipped</button>
        {candidates.map(t => <button key={t.id} type="button" className={`cmChip cmChip--wide${shape.clip === t.id ? ' cmChip--on' : ''}`} aria-pressed={shape.clip === t.id} title={`Draw ${name} only inside ${label(t.name, 'it')}`} onClick={() => actions.setClip(id, t.id)}>{nameOf(t)}</button>)}
        <button type="button" className={`cmChip cmChip--wide${picking === 'clip' ? ' cmChip--on' : ''}`} aria-pressed={picking === 'clip'} title="Click the shape on the canvas" onClick={() => actions.pick(picking === 'clip' ? null : 'clip')}><CursorIcon size={12} /> {picking === 'clip' ? 'Click a shape…' : 'Pick on the canvas'}</button>
      </ChipRow>
      {shape.clip && <p className="cmInsText">Clipped to {clipName}.</p>}

      <ChipRow label="Cut by">
        {candidates.map(t => {
          const on = (shape.cut ?? []).includes(t.id)
          return <button key={t.id} type="button" className={`cmChip cmChip--wide${on ? ' cmChip--on' : ''}`} aria-pressed={on} title={`${on ? 'Stop' : 'Let'} ${label(t.name, 'it')} cut a hole in ${name}`} onClick={() => actions.toggleCut(id, t.id)}>{nameOf(t)}</button>
        })}
        <button type="button" className={`cmChip cmChip--wide${picking === 'cut' ? ' cmChip--on' : ''}`} aria-pressed={picking === 'cut'} title="Click a shape on the canvas to let it cut a hole, or to stop it" onClick={() => actions.pick(picking === 'cut' ? null : 'cut')}><CursorIcon size={12} /> {picking === 'cut' ? 'Click a shape…' : 'Pick on the canvas'}</button>
      </ChipRow>
      <p className="cmInsText">{(shape.cut ?? []).length} of {LIMITS.cutsMax} cut-outs. A shape that cuts a hole is best made a helper, so it is not drawn itself.</p>

      <div className="cmInline">
        <button type="button" className={`cmBtn cmBtn--small${shape.helper ? ' cmBtn--primary' : ''}`} aria-pressed={!!shape.helper} title="A helper shape is never drawn in the previews: it only clips or cuts other shapes" onClick={() => actions.setHelper(id, !shape.helper)}><EyeOffIcon size={12} /> Helper shape</button>
      </div>

      <h4 className="cmInsSub">Shows with a slider</h4>
      <label className="cmField">
        <span>Slider</span>
        <select value={shape.opBy?.slider ?? ''} aria-label={`Slider that ${name} shows with`} onChange={e => actions.setFade(id, e.target.value || null)}>
          <option value="">Always shown</option>
          {content.ranges.map(r => <option key={r.id} value={r.id}>{label(r.name, 'Untitled slider')}</option>)}
          {shape.opBy && !content.ranges.some(r => r.id === shape.opBy!.slider) && <option value={shape.opBy.slider}>(gone)</option>}
        </select>
      </label>
      {shape.opBy && (() => {
        const r = content.ranges.find(x => x.id === shape.opBy!.slider)
        const at = (v: number) => (r ? valueText(r, v) : `${v}`)
        return (
          <>
            <div className="cmSteps">
              <Stepper label={`${name} is hidden at`} value={at(shape.opBy.hidden)} onStep={(dir, big) => actions.stepFade(id, 'hidden', dir, big)} />
              <Stepper label={`${name} is shown at`} value={at(shape.opBy.shown)} onStep={(dir, big) => actions.stepFade(id, 'shown', dir, big)} />
            </div>
            <p className="cmInsText">It fades in as the slider moves from the first value to the second (a crease that comes with a bend). Any shape can do this.</p>
          </>
        )
      })()}

      {!shape.shade && (
        <>
          <h4 className="cmInsSub">Add shading</h4>
          <p className="cmInsText">A band along one edge of {name}, locked to that edge and kept inside the shapes of {label(home?.name ?? '', 'its object')}.</p>
          <ChipRow label="Kind of the new shading">
            {KINDS.map(k => <button key={k.id} type="button" className={`cmChip cmChip--wide${kind === k.id ? ' cmChip--on' : ''}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.name}</button>)}
          </ChipRow>
          <ChipRow label="Edge of the new shading">
            {SIDES.map(s => <button key={s.id} type="button" className={`cmChip${side === s.id ? ' cmChip--on' : ''}`} aria-pressed={side === s.id} onClick={() => setSide(s.id)}>{s.name}</button>)}
          </ChipRow>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" disabled={shading >= LIMITS.shadesMax} title={shading >= LIMITS.shadesMax ? `An object may have at most ${LIMITS.shadesMax} shading shapes` : undefined} onClick={() => actions.addShading(id, kind, side)}><PlusIcon size={12} /> Add a {bandKindName} band along the {side} edge</button>
            <span className={`cmCount${shading > LIMITS.shadesWarn ? ' cmCount--warn' : ''}`} title="Shading shapes of the object"><LayersIcon size={11} /> {shading} of {LIMITS.shadesMax}</span>
          </div>
        </>
      )}
    </section>
  )
}
