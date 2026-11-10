import { useState } from 'react'
import type { ModelContent, ModelObject } from '../../../../api/types'
import { BookmarkIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, EyeClosedIcon, EyeIcon, PlayIcon, RestoreIcon, SaveIcon, TrashIcon } from '../../../icons'
import { HslLocks } from './HslLocks'
import { shapesInOrder } from './engine/order'
import { slotsUsedBy, type LockPart } from './engine/locks'
import { presetsOf } from './engine/forms'
import { gripsOf, slidersByRole } from './engine/hands'
import { LIMITS } from './engine/limits'
import { isOn, kindsOf, type PresetKeep, type TestState } from './engine/presets'
import { KIND_MAX, NAME_MAX, groupById, objectById, shapeById } from './modelContent'

// The Presets tab: a preset is a named set of slider values and of objects and groups switched off (a pose, an expression, an age, a build, an outfit).
// Its kind is the slot it fills: applying a preset puts back whatever any other preset of the same kind controls, then sets its own, so a pose replaces the
// last pose and an expression leaves the arms alone. A variant (no scope) can also keep the expression of each object, the style on for each object and the default
// colour of each slot; a style of an object can also keep the drawing order of its shapes and which of them are switched off, and hold parts of the colours of its slots.
export interface PresetActions {
  apply: (id: string) => void
  save: (name: string, kind: string, keep?: PresetKeep) => void
  update: (id: string, keep?: PresetKeep) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  // Keep the current look of an object or a group as a style (a preset that belongs to it).
  saveStyle: (scopeId: string, name: string) => void
  // Phase 5c: the starter hand poses, and the grip point a pose holds with (null: none).
  addHandPoses: () => void
  setGrip: (id: string, gripId: string | null) => void
  // Phase D3a: a part of the colour of a slot that a style holds (null: free), and the shapes of an object: one a place forward or back, one switched off or on, all back
  // in the tree's order. These change the test look; Save the current look as a style keeps them.
  lockStyle: (id: string, slotId: string, part: LockPart, value: number | null) => void
  moveShape: (objectId: string, shapeId: string, dir: -1 | 1) => void
  toggleShape: (shapeId: string) => void
  resetOrder: (objectId: string) => void
}

const KEEPS: Array<{ id: keyof PresetKeep; name: string; title: string }> = [
  { id: 'forms', name: 'Expressions', title: 'Keep the form chosen for each axis of each object' },
  { id: 'styles', name: 'Styles', title: 'Keep the style that is on for each object' },
  { id: 'colours', name: 'Colours', title: 'Keep the default colour chosen for each slot (a swatch of a palette is the character\'s own, so it is not kept)' },
]
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const label = (name: string, fallback: string) => name.trim() || fallback

export function PresetsTab({ content, state, actions, object = null }: { content: ModelContent; state: TestState; actions: PresetActions; object?: ModelObject | null }) {
  const [filter, setFilter] = useState<string>('all')
  const [keep, setKeep] = useState<PresetKeep>({})
  const [locksOpen, setLocksOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('Pose')
  const [confirm, setConfirm] = useState<string | null>(null)
  const presets = presetsOf(content)
  const kinds = kindsOf(content)
  const shown = filter === 'all' ? presets : presets.filter(p => p.kind.trim().toLowerCase() === filter.trim().toLowerCase())
  const full = presets.length >= LIMITS.presetsMax
  const handsHere = [false, true].some(other => Object.keys(slidersByRole(content, other)).some(r => r.startsWith('curl-')))
  const grips = gripsOf(content)

  return (
    <div className="cmTabBody">
      <h2 className="cmInsTitle">Presets</h2>
      <p className="cmInsText">A preset keeps the sliders that are away from rest and the objects and groups switched off with the eye. Applying one replaces the last preset of its kind.</p>

      <section className="cmSec" aria-label="Save the current as a preset">
        <h3 className="cmInsSub">Save the current</h3>
        <label className="cmField">
          <span>Name</span>
          <input value={name} maxLength={NAME_MAX} aria-label="Preset name" placeholder="Wave, Curious, Broad…" onChange={e => setName(e.target.value)} />
        </label>
        <label className="cmField">
          <span>Kind</span>
          <input value={kind} maxLength={KIND_MAX} aria-label="Preset kind" list="cm-preset-kinds" placeholder="Pose, Expression, Age, Build, Outfit…" onChange={e => setKind(e.target.value)} />
          <datalist id="cm-preset-kinds">{kinds.map(k => <option key={k} value={k} />)}</datalist>
        </label>
        <div className="cmChips" role="group" aria-label="Also keep in the preset">
          {KEEPS.map(k => <button key={k.id} type="button" className={`cmChip cmChip--wide${keep[k.id] ? ' cmChip--on' : ''}`} aria-pressed={!!keep[k.id]} title={k.title} onClick={() => setKeep(prev => ({ ...prev, [k.id]: !prev[k.id] }))}>{k.name}</button>)}
        </div>
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small cmBtn--primary" disabled={full} title={full ? `A model may have at most ${LIMITS.presetsMax} presets` : 'Keep the sliders and hidden things as they are now, and the parts chosen above'} onClick={() => { actions.save(name, kind, keep); setName('') }}>
            <SaveIcon size={12} /> Save the current as a preset
          </button>
          <span className={`cmCount${presets.length > LIMITS.presetsWarn ? ' cmCount--warn' : ''}`} title="Presets of the model">{presets.length} of {LIMITS.presetsMax}</span>
        </div>
      </section>

      {handsHere && (
        <section className="cmSec" aria-label="Hand poses">
          <h3 className="cmInsSub">Hand poses</h3>
          <p className="cmInsText">Open, Fist, Point, Pinch and Grip, made from the Curl, Spread and thumb sliders of the hands. The other hand&apos;s poses are a kind of their own, so each hand takes one.</p>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" disabled={full} title={full ? `A model may have at most ${LIMITS.presetsMax} presets` : 'Add the standard hand poses that are not there yet'} onClick={actions.addHandPoses}><BookmarkIcon size={12} /> Add the standard hand poses</button>
          </div>
        </section>
      )}

      {kinds.length > 0 && (
        <div className="cmChips" role="group" aria-label="Which presets to list">
          <button type="button" className={`cmChip cmChip--wide${filter === 'all' ? ' cmChip--on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All ({presets.length})</button>
          {kinds.map(k => <button key={k} type="button" className={`cmChip cmChip--wide${filter === k ? ' cmChip--on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k}</button>)}
        </div>
      )}

      {object && <ShapesOf content={content} object={object} state={state} actions={actions} />}

      {presets.length === 0 && <p className="cmInsText">No preset yet. Set the sliders, switch things off with the eye, and save the current look above.</p>}
      <ul className="cmPresets">
        {shown.map(p => {
          const on = isOn(content, state, p), title = p.name.trim() || 'Untitled preset'
          const styleObject = p.scope ? objectById(content, p.scope) : undefined
          const extras = p.scope
            ? `${p.order?.length ? `, drawn in an order of ${count(p.order.length, 'shape')}` : ''}${Object.keys(p.hsl ?? {}).length ? `, ${count(Object.keys(p.hsl ?? {}).length, 'colour lock')}` : ''}`
            : `${Object.keys(p.forms ?? {}).length ? `, ${count(Object.keys(p.forms ?? {}).length, 'expression')}` : ''}${Object.keys(p.styles ?? {}).length ? `, ${count(Object.keys(p.styles ?? {}).length, 'style')}` : ''}${Object.keys(p.picks ?? {}).length ? `, ${count(Object.keys(p.picks ?? {}).length, 'colour')}` : ''}`
          return (
            <li key={p.id} className={`cmPreset${on ? ' cmPreset--on' : ''}`} aria-label={`Preset ${title}`}>
              <div className="cmSliderHead">
                <input className="cmSliderName" aria-label={`Name of preset ${title}`} value={p.name} maxLength={NAME_MAX} placeholder="Name" onChange={e => actions.rename(p.id, e.target.value)} />
                {on && <span className="cmOn" role="img" aria-label={`${title} is on`} title="The sliders and hidden things are as this preset sets them"><CheckIcon size={12} /> On</span>}
              </div>
              <p className="cmInsText">{p.scope ? `${p.kind} of ${label(objectById(content, p.scope)?.name ?? groupById(content, p.scope)?.name ?? '', 'something gone')}` : p.kind} · {Object.keys(p.values).length} slider{Object.keys(p.values).length === 1 ? '' : 's'}, {p.hidden.length} hidden{p.scope ? `, ${Object.keys(p.forms ?? {}).length} form choice${Object.keys(p.forms ?? {}).length === 1 ? '' : 's'}` : ''}{extras}</p>
              {styleObject && (
                <div className="cmSec">
                  <button
                    type="button" className="cmBtn cmBtn--small" aria-expanded={locksOpen === p.id} aria-label={`Colour locks of ${title}`}
                    title="The parts of the colour of a slot this style holds while it is on (the object's own locks win)" onClick={() => setLocksOpen(locksOpen === p.id ? null : p.id)}
                  >{locksOpen === p.id ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />} Colour locks</button>
                  {locksOpen === p.id && <HslLocks content={content} state={state} slots={slotsUsedBy(content, styleObject)} locks={p.hsl} owner={`style ${title}`} onChange={(slotId, part, value) => actions.lockStyle(p.id, slotId, part, value)} />}
                </div>
              )}
              {grips.length > 0 && !p.scope && (
                <label className="cmField">
                  <span>Holds with</span>
                  <select value={p.grip ?? ''} aria-label={`Grip point that ${title} holds with`} onChange={e => actions.setGrip(p.id, e.target.value || null)}>
                    <option value="">No grip point</option>
                    {grips.map(g => <option key={g.id} value={g.id}>{g.name.trim() || 'Grip'}</option>)}
                  </select>
                </label>
              )}
              <div className="cmInline">
                <button type="button" className="cmBtn cmBtn--small" aria-label={`Apply ${title}`} title="Set the sliders and the hidden things to this preset" onClick={() => actions.apply(p.id)}><PlayIcon size={12} /> Apply</button>
                <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Update ${title} from the current`} title="Replace what this preset keeps with the current sliders and hidden things" onClick={() => actions.update(p.id, keep)}><SaveIcon size={12} /></button>
                {confirm === p.id ? (
                  <span className="cmConfirm" role="group" aria-label={`Delete preset ${title}?`}>
                    <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.remove(p.id) }}>Delete the preset</button>
                    <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
                  </span>
                ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete preset ${title}`} title="Delete the preset" onClick={() => setConfirm(p.id)}><TrashIcon size={12} /></button>}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// The shapes of the open object, front first: put them in another drawing order or switch some off, as a style of the object would (Save the current look as a style keeps it).
function ShapesOf({ content, object, state, actions }: { content: ModelContent; object: ModelObject; state: TestState; actions: PresetActions }) {
  const name = label(object.name, 'the object')
  const sequence = shapesInOrder(content, object, state.order)
  const changed = (state.order?.[object.id]?.length ?? 0) > 0
  return (
    <section className="cmSec" aria-label={`Shapes of ${name}`}>
      <h3 className="cmInsSub">Shapes of {name}</h3>
      {object.mirrorOf ? (
        <p className="cmInsText">{name} is a twin: its shapes are drawn like its original&apos;s.</p>
      ) : (
        <>
          <p className="cmInsText">Put the shapes in another drawing order or switch some off, then save the current look as a style of {name}: the style then draws them like this.</p>
          <ul className="cmShapeRows">
            {[...sequence].reverse().map((id, k, front) => {
              const shape = shapeById(content, id)
              if (!shape) return null
              const title = label(shape.name, 'Untitled shape'), off = state.hidden.includes(id)
              return (
                <li key={id} className={`cmShapeRow${off ? ' cmShapeRow--off' : ''}`} aria-label={`Shape ${title}`}>
                  <span className="cmShapeName">{title}</span>
                  <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${title} forward`} title="One place toward the front" disabled={k === 0} onClick={() => actions.moveShape(object.id, id, 1)}><ChevronUpIcon size={12} /></button>
                  <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move ${title} back`} title="One place toward the back" disabled={k === front.length - 1} onClick={() => actions.moveShape(object.id, id, -1)}><ChevronDownIcon size={12} /></button>
                  <button
                    type="button" className="cmIconBtn cmIconBtn--small" aria-pressed={!off} aria-label={off ? `Show shape ${title}` : `Hide shape ${title}`}
                    title={off ? `${title} is switched off: show it` : `${title} is shown: switch it off`} onClick={() => actions.toggleShape(id)}
                  >{off ? <EyeClosedIcon size={12} /> : <EyeIcon size={12} />}</button>
                </li>
              )
            })}
          </ul>
          {changed && <div className="cmInline"><button type="button" className="cmBtn cmBtn--small" title="Draw the shapes in the order of the tree again" onClick={() => actions.resetOrder(object.id)}><RestoreIcon size={12} /> Back in the tree&apos;s order</button></div>}
        </>
      )}
    </section>
  )
}
