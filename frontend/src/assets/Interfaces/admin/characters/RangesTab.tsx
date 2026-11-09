import { useState } from 'react'
import type { ModelContent, ModelDrive, ModelGroup, ModelRange, ModelScaleAxis } from '../../../../api/types'
import { EyeIcon, EyeOffIcon, LinkIcon, PauseIcon, PlayIcon, PlusIcon, RestoreIcon, TrashIcon } from '../../../icons'
import { fadedBy } from './engine/fadeEdit'
import { hangs } from './engine/fall'
import { LIMITS } from './engine/limits'
import { valueOf, type Values } from './engine/rig'
import { stepOf } from './engine/rigEdit'
import { isApart, originalSideOf, otherSideOf, whyNotApart } from './engine/sidesEdit'
import { LimitSteppers } from './LimitSteppers'
import { Stepper } from './Stepper'
import type { Selection } from './designerState'
import type { NewSliderKind, Recording, RigActions } from './rigActions'
import { driveText, offRest, rangesForSelection, valueText } from './rigView'

// The Ranges tab: the model's sliders. Each has a Try it slider (the test value is only for looking: it is never saved), its minimum, rest and maximum,
// and what it drives (turn a group about its pivot, scale, move recorded points, bend a shape, lengthen a bone, let a shape fall), each with steppers for how much. A slider that
// is offered to writers also has the span a writer may choose within.
const KIND_LABEL: Record<NewSliderKind, string> = { turn: 'Turn the group', scale: 'Scale', points: 'Move points (record)', bend: 'Bend the shape', length: 'Length of a bone', fall: 'Let the shape fall' }
const AXES: Array<{ id: ModelScaleAxis; name: string }> = [{ id: 'xy', name: 'Both ways' }, { id: 'x', name: 'Across' }, { id: 'y', name: 'Up and down' }]

export interface RangesTabProps {
  content: ModelContent
  sel: Selection
  group: ModelGroup | undefined
  values: Values
  recording: Recording | null
  scrubbing: string | null
  filter: 'selection' | 'all'
  onFilter: (f: 'selection' | 'all') => void
  actions: RigActions
}

export function RangesTab({ content, sel, group, values, recording, scrubbing, filter, onFilter, actions }: RangesTabProps) {
  const [menu, setMenu] = useState<string | null>(null)   // 'new' or a slider id: whose add menu is open
  const [confirm, setConfirm] = useState<string | null>(null)
  const shapeSel = sel.kind === 'shape'
  const selected = sel.kind === 'shape' ? content.shapes.find(s => s.id === sel.id) : undefined
  // the object whose weighted shapes can all be let fall with a slider at once
  const selObject = sel.kind === 'object' ? content.objects.find(o => o.id === sel.id) : sel.kind === 'shape' ? content.objects.find(o => o.shapes.includes(sel.id)) : undefined
  const list = filter === 'all' || sel.kind === 'none' ? content.ranges : rangesForSelection(content, sel)
  const away = offRest(content, values)
  const can = (kind: NewSliderKind): string | null =>
    kind === 'turn' ? (group ? null : 'Select a group first')
      : kind === 'scale' ? null
      : kind === 'length' ? ((content.bones ?? []).length > 0 ? null : 'Add a bone in the Proportions tab first')
      : kind === 'fall' ? (!shapeSel ? 'Select a shape first' : selected && hangs(selected.pts, selected.closed) ? null : 'Mark points with the Weights tool first')
      : shapeSel ? null : 'Select a shape first'
  const kinds: NewSliderKind[] = ['turn', 'scale', 'points', 'bend', 'length', 'fall']
  const recShape = recording ? content.shapes.find(s => s.id === recording.shapeId) : undefined
  const recRange = recording ? content.ranges.find(r => r.id === recording.rangeId) : undefined

  function menuFor(id: string, onPick: (k: NewSliderKind) => void) {
    return (
      <div className="cmMenu cmMenu--list" role="menu" aria-label={id === 'new' ? 'New slider' : 'Add what the slider drives'}>
        {kinds.map(k => {
          const why = can(k)
          return <button key={k} type="button" role="menuitem" className="cmMenuBtn" disabled={!!why} title={why ?? undefined} onClick={() => { setMenu(null); onPick(k) }}>{KIND_LABEL[k]}{why ? <small>{why}</small> : null}</button>
        })}
      </div>
    )
  }

  return (
    <div className="cmTabBody">
      <div className="cmInline cmRangesBar">
        <span className="cmMenuAnchor">
          <button type="button" className="cmBtn cmBtn--small" aria-haspopup="menu" aria-expanded={menu === 'new'} disabled={content.ranges.length >= LIMITS.rangesMax || !!recording} onClick={() => setMenu(m => (m === 'new' ? null : 'new'))}><PlusIcon size={12} /> New slider</button>
          {menu === 'new' && menuFor('new', k => actions.newSlider(k))}
        </span>
        <button type="button" className="cmBtn cmBtn--small" disabled={away === 0 || !!recording} onClick={actions.resetValues} title="Put every slider back at rest"><RestoreIcon size={12} /> Reset test values{away ? ` (${away})` : ''}</button>
      </div>
      <div className="cmChips" role="group" aria-label="Which sliders to list">
        <button type="button" className={`cmChip cmChip--wide${filter === 'selection' ? ' cmChip--on' : ''}`} aria-pressed={filter === 'selection'} onClick={() => onFilter('selection')}>This selection</button>
        <button type="button" className={`cmChip cmChip--wide${filter === 'all' ? ' cmChip--on' : ''}`} aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>All ({content.ranges.length})</button>
      </div>

      {recording && recShape && recRange && (
        <div className="cmRecording" role="status">
          <p><b>Recording {recording.end === 'max' ? 'the maximum' : 'the minimum'} of {recRange.name.trim() || 'the slider'}.</b> Drag the points of {recShape.name.trim() || 'the shape'} to where they should be, then press Set. Adding or deleting points is not recorded.</p>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small cmBtn--primary" onClick={actions.finishRecording}>Set {recording.end === 'max' ? 'maximum' : 'minimum'}</button>
            <button type="button" className="cmBtn cmBtn--small" onClick={actions.cancelRecording}>Cancel</button>
          </div>
        </div>
      )}

      {list.length === 0 && <p className="cmInsText">{content.ranges.length === 0 ? 'No slider yet. A slider turns a group, scales something, moves points or bends a shape; make one with New slider.' : filter === 'selection' && sel.kind === 'none' ? 'Select something to see its sliders.' : 'No slider has to do with the selection. Show All, or make one.'}</p>}

      {list.map(r => sliderCard(r))}
    </div>
  )

  function sliderCard(r: ModelRange) {
    const v = valueOf(r, values), step = stepOf(r), title = r.name.trim() || 'Slider'
    const locked = !!recording
    return (
      <section key={r.id} className="cmSlider" aria-label={`Slider ${title}`}>
        <div className="cmSliderHead">
          <input className="cmSliderName" aria-label={`Name of ${title}`} value={r.name} maxLength={40} placeholder="Name" onChange={e => actions.renameRange(r.id, e.target.value)} />
          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={r.show ? `Hide ${title} from writers` : `Offer ${title} to writers`} title={r.show ? 'Writers can use this slider (click to hide it)' : 'Hidden from writers (click to offer it)'} aria-pressed={r.show} onClick={() => actions.setShow(r.id, !r.show)}>{r.show ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}</button>
          {confirm === r.id ? (
            <span className="cmConfirm" role="group" aria-label={`Delete ${title}?`}>
              <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.removeRange(r.id) }}>Delete it</button>
              <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
            </span>
          ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete slider ${title}`} title="Delete the slider" disabled={locked} onClick={() => setConfirm(r.id)}><TrashIcon size={12} /></button>}
        </div>
        <label className="cmField">
          <span>Try it</span>
          <span className="cmRange">
            <input type="range" min={r.min} max={r.max} step={step} value={v} disabled={locked} aria-label={`Try ${title}`} onChange={e => actions.setValue(r.id, Number(e.target.value))} />
            <output>{valueText(r, v)}</output>
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={scrubbing === r.id ? `Stop sweeping ${title}` : `Sweep ${title} from its minimum to its maximum`} title="Sweep from the minimum to the maximum and back, to see what it does" aria-pressed={scrubbing === r.id} disabled={locked} onClick={() => actions.scrub(r.id)}>{scrubbing === r.id ? <PauseIcon size={12} /> : <PlayIcon size={12} />}</button>
          </span>
        </label>
        <div className="cmSteps">
          <Stepper label={`Minimum of ${title}`} value={valueText(r, r.min)} onStep={(dir, big) => actions.stepBound(r.id, 'min', dir, big)} />
          <Stepper label={`Rest of ${title}`} value={valueText(r, r.rest)} onStep={(dir, big) => actions.stepBound(r.id, 'rest', dir, big)} />
          <Stepper label={`Maximum of ${title}`} value={valueText(r, r.max)} onStep={(dir, big) => actions.stepBound(r.id, 'max', dir, big)} />
        </div>
        {r.show && <LimitSteppers range={r} onStep={(end, dir, big) => actions.stepLimit(r.id, end, dir, big)} onClear={() => actions.clearLimit(r.id)} />}
        <ul className="cmDrives">
          {r.drives.map((d, i) => <li key={i}>{driveRow(r, d, i, locked)}</li>)}
        </ul>
        {r.drives.length === 0 && fadedBy(content, r.id).length === 0 && <p className="cmInsText">It drives nothing yet.</p>}
        {sidesRow(r, locked)}
        {fadedBy(content, r.id).length > 0 && (
          <p className="cmInsText">Shows with it: {fadedBy(content, r.id).map((s, k) => <span key={s.id}>{k > 0 && ', '}<button type="button" className="cmLink" onClick={() => actions.selectShape(s.id)}>{s.name.trim() || s.id}</button></span>)}. Set in the Colour tab.</p>
        )}
        <div className="cmInline">
          <span className="cmMenuAnchor">
            <button type="button" className="cmBtn cmBtn--small" aria-haspopup="menu" aria-expanded={menu === r.id} disabled={locked || r.drives.length >= LIMITS.drivesMax} onClick={() => setMenu(m => (m === r.id ? null : r.id))}><PlusIcon size={12} /> Add what it drives</button>
            {menu === r.id && menuFor(r.id, k => actions.addDrive(r.id, k))}
          </span>
          {selObject && selObject.shapes.some(sid => { const sh = content.shapes.find(x => x.id === sid); return !!sh && !sh.mirrorOf && hangs(sh.pts, sh.closed) && !r.drives.some(d => d.kind === 'fall' && d.shape === sid) }) && (
            <button type="button" className="cmBtn cmBtn--small" disabled={locked || r.drives.length >= LIMITS.drivesMax} title="Let every shape of this object that has weighted points fall with the slider" onClick={() => actions.fallObject(r.id, selObject.id)}><PlusIcon size={12} /> Let {selObject.name.trim() || 'the object'} fall</button>
          )}
        </div>
      </section>
    )
  }

  // Posing the two sides apart (phase 5c): a slider that turns or scales groups that have twins can give the twins a slider of their own.
  function sidesRow(r: ModelRange, locked: boolean) {
    const other = isApart(r) ? otherSideOf(content, r) : undefined, original = other ? undefined : originalSideOf(content, r)
    const title = r.name.trim() || 'the slider'
    if (other || original) {
      const mate = other ?? original!
      return (
        <div className="cmInline cmSides">
          <p className="cmInsText">Posed apart from <b>{mate.name.trim() || 'its other side'}</b>: each side has its own slider.</p>
          <button type="button" className="cmBtn cmBtn--small" disabled={locked} aria-label={`Pose both sides of ${title} together`} title="Take the other side's slider away: one slider poses both sides again" onClick={() => actions.joinSides(r.id)}><LinkIcon size={12} /> Pose both sides together</button>
        </div>
      )
    }
    if (whyNotApart(content, r)) return null
    return (
      <div className="cmInline cmSides">
        <button type="button" className="cmBtn cmBtn--small" disabled={locked} aria-label={`Pose the other side of ${title} apart`} title="Give the twin groups it turns or scales a slider of their own, so the two sides can be posed on their own" onClick={() => actions.apartSlider(r.id)}><LinkIcon size={12} /> Pose the other side apart</button>
      </div>
    )
  }

  function driveRow(r: ModelRange, d: ModelDrive, i: number, locked: boolean) {
    const unit = d.kind === 'scale' || d.kind === 'length' || d.kind === 'fall' ? '%' : '°'
    return (
      <div className="cmDrive">
        <p className="cmInsText">{driveText(content, d)}</p>
        {d.kind !== 'points' && (
          <div className="cmSteps">
            <Stepper label={`At the minimum (drive ${i + 1} of ${r.name.trim() || 'the slider'})`} value={`${d.atMin}${unit}`} onStep={(dir, big) => actions.stepDrive(r.id, i, 'atMin', dir, big)} />
            <Stepper label={`At the maximum (drive ${i + 1} of ${r.name.trim() || 'the slider'})`} value={`${d.atMax}${unit}`} onStep={(dir, big) => actions.stepDrive(r.id, i, 'atMax', dir, big)} />
          </div>
        )}
        {d.kind === 'length' && (
          <label className="cmField">
            <span>Bone</span>
            <select value={d.id ?? ''} aria-label={`Bone that drive ${i + 1} of ${r.name.trim() || 'the slider'} lengthens`} disabled={locked} onChange={e => actions.setDriveBone(r.id, i, e.target.value)}>
              {!(content.bones ?? []).some(b => b.id === d.id) && <option value="">(gone)</option>}
              {(content.bones ?? []).map(b => <option key={b.id} value={b.id}>{b.name.trim() || b.id}</option>)}
            </select>
          </label>
        )}
        {d.kind === 'scale' && (
          <div className="cmChips" role="group" aria-label="Which way it scales">
            {AXES.map(a => <button key={a.id} type="button" className={`cmChip cmChip--wide${d.axis === a.id ? ' cmChip--on' : ''}`} aria-pressed={d.axis === a.id} onClick={() => actions.setDriveAxis(r.id, i, a.id)}>{a.name}</button>)}
          </div>
        )}
        {d.kind === 'bend' && (
          <div className="cmSteps">
            <Stepper label="Bend starts at" value={`${Math.round(d.y0)}`} onStep={(dir, big) => actions.stepBend(r.id, i, 'y0', dir, big)} />
            <Stepper label="Bend ends at" value={`${Math.round(d.y1)}`} onStep={(dir, big) => actions.stepBend(r.id, i, 'y1', dir, big)} />
          </div>
        )}
        {d.kind === 'points' && d.shape && (
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" disabled={locked} onClick={() => actions.record(r.id, d.shape!, 'max')}>Record the maximum again</button>
            <button type="button" className="cmBtn cmBtn--small" disabled={locked} onClick={() => actions.record(r.id, d.shape!, 'min')}>Record the minimum</button>
          </div>
        )}
        <button type="button" className="cmLink" disabled={locked} onClick={() => actions.removeDrive(r.id, i)}>Remove this</button>
      </div>
    )
  }
}
