import { useState } from 'react'
import type { ModelContent } from '../../../../api/types'
import { BookmarkIcon, CheckIcon, PlayIcon, SaveIcon, TrashIcon } from '../../../icons'
import { presetsOf } from './engine/forms'
import { gripsOf, slidersByRole } from './engine/hands'
import { LIMITS } from './engine/limits'
import { isOn, kindsOf, type TestState } from './engine/presets'
import { KIND_MAX, NAME_MAX, groupById, objectById } from './modelContent'

// The Presets tab: a preset is a named set of slider values and of objects and groups switched off (a pose, an expression, an age, a build, an outfit).
// Its kind is the slot it fills: applying a preset puts back whatever any other preset of the same kind controls, then sets its own, so a pose replaces the
// last pose and an expression leaves the arms alone. A preset does not keep which form is chosen.
export interface PresetActions {
  apply: (id: string) => void
  save: (name: string, kind: string) => void
  update: (id: string) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  // Keep the current look of an object or a group as a style (a preset that belongs to it).
  saveStyle: (scopeId: string, name: string) => void
  // Phase 5c: the starter hand poses, and the grip point a pose holds with (null: none).
  addHandPoses: () => void
  setGrip: (id: string, gripId: string | null) => void
}

const label = (name: string, fallback: string) => name.trim() || fallback

export function PresetsTab({ content, state, actions }: { content: ModelContent; state: TestState; actions: PresetActions }) {
  const [filter, setFilter] = useState<string>('all')
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
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small cmBtn--primary" disabled={full} title={full ? `A model may have at most ${LIMITS.presetsMax} presets` : 'Keep the sliders and hidden things as they are now'} onClick={() => { actions.save(name, kind); setName('') }}>
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

      {presets.length === 0 && <p className="cmInsText">No preset yet. Set the sliders, switch things off with the eye, and save the current look above.</p>}
      <ul className="cmPresets">
        {shown.map(p => {
          const on = isOn(content, state, p), title = p.name.trim() || 'Untitled preset'
          return (
            <li key={p.id} className={`cmPreset${on ? ' cmPreset--on' : ''}`} aria-label={`Preset ${title}`}>
              <div className="cmSliderHead">
                <input className="cmSliderName" aria-label={`Name of preset ${title}`} value={p.name} maxLength={NAME_MAX} placeholder="Name" onChange={e => actions.rename(p.id, e.target.value)} />
                {on && <span className="cmOn" role="img" aria-label={`${title} is on`} title="The sliders and hidden things are as this preset sets them"><CheckIcon size={12} /> On</span>}
              </div>
              <p className="cmInsText">{p.scope ? `${p.kind} of ${label(objectById(content, p.scope)?.name ?? groupById(content, p.scope)?.name ?? '', 'something gone')}` : p.kind} · {Object.keys(p.values).length} slider{Object.keys(p.values).length === 1 ? '' : 's'}, {p.hidden.length} hidden{p.scope ? `, ${Object.keys(p.forms ?? {}).length} form choice${Object.keys(p.forms ?? {}).length === 1 ? '' : 's'}` : ''}</p>
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
                <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Update ${title} from the current`} title="Replace what this preset keeps with the current sliders and hidden things" onClick={() => actions.update(p.id)}><SaveIcon size={12} /></button>
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
