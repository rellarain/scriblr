import { useState } from 'react'
import type { ModelContent, ModelFieldset, ModelRange } from '../../../../api/types'
import { EyeIcon, EyeOffIcon, FocusIcon, PlusIcon, SlidersIcon, TrashIcon } from '../../../icons'
import { contextObjectOf, type Selection } from './designerState'
import { featureOf, featureText, fieldDrive, fieldDriveIndex, fieldsOf, isOffered, ownerText, waitsOn, type FeatureRef, type OwnerRef } from './engine/fields'
import { LIMITS } from './engine/limits'
import type { TestState } from './engine/presets'
import { GROUP_LABELS, PROPS, propsOf, type PropKey } from './engine/props'
import { valueOf, type Values } from './engine/rig'
import { stepOf } from './engine/rigEdit'
import { shapeById } from './modelContent'
import type { RigActions } from './rigActions'
import { related } from './rigView'
import { Stepper } from './Stepper'

// The Fields tab (phase D3c): the sliders an author makes for one feature, set out as fieldsets. A feature is a whole shape, one point or one edge of a shape, or a whole object; a
// field is a slider that changes one property of it (its place, size, turn, opacity, the shift of its colour, the look of its gradient); a fieldset gathers the fields of one feature for
// an owner: an object or a group, or a variant or a style, whose fields the writer is offered while it is on. The sliders are the model's own, so the Ranges tab shows them too.
export interface FieldActions {
  addFieldset: (owner: OwnerRef, ref: FeatureRef) => void
  renameFieldset: (id: string, name: string) => void
  removeFieldset: (id: string) => void
  addField: (fieldsetId: string, prop: PropKey) => void
  removeField: (rangeId: string) => void
  setProp: (fieldsetId: string, rangeId: string, prop: PropKey) => void
  // select the feature of a fieldset on the canvas, and open the Ranges tab at the sliders
  select: (f: ModelFieldset) => void
  openRanges: () => void
}

export interface FieldsTabProps {
  content: ModelContent
  sel: Selection
  selPoint: number
  state: TestState
  values: Values
  actions: FieldActions
  rig: RigActions
}

interface Bind { id: string; label: string; ref: FeatureRef }
interface Who { id: string; label: string; ref: OwnerRef }

// The things the selection can hold fields for: the shape, a point or an edge of it (the selected point), the object.
function bindings(c: ModelContent, sel: Selection, selPoint: number): Bind[] {
  const out: Bind[] = []
  const shape = sel.kind === 'shape' ? shapeById(c, sel.id) : undefined
  if (shape) {
    out.push({ id: 'shape', label: 'This shape', ref: { feature: 'shape', target: shape.id, i: 0 } })
    if (!shape.mirrorOf && shape.pts.length >= 3) {
      const i = Math.max(0, Math.min(selPoint, shape.pts.length - 1))
      out.push({ id: 'point', label: `Point ${i + 1}`, ref: { feature: 'point', target: shape.id, i } }, { id: 'edge', label: `Edge ${i + 1}`, ref: { feature: 'edge', target: shape.id, i } })
    }
  }
  const object = contextObjectOf(c, sel)
  if (object) out.push({ id: 'object', label: 'This object', ref: { feature: 'object', target: object.id, i: 0 } })
  return out
}

// Who can be offered the fields: the open object, its group, a variant, or a style of the object.
function owners(c: ModelContent, sel: Selection): Who[] {
  const out: Who[] = []
  const object = contextObjectOf(c, sel)
  if (object) out.push({ id: `object:${object.id}`, label: `This object: ${object.name.trim() || object.id}`, ref: { kind: 'object', id: object.id } })
  const group = object ? c.groups.find(g => g.objects.includes(object.id)) : sel.kind === 'group' ? c.groups.find(g => g.id === sel.id) : undefined
  if (group) out.push({ id: `group:${group.id}`, label: `Its group: ${group.name.trim() || group.id}`, ref: { kind: 'group', id: group.id } })
  for (const p of c.presets ?? []) {
    if (!p.scope) out.push({ id: `preset:${p.id}`, label: `Variant: ${p.name.trim() || p.id}`, ref: { kind: 'preset', id: p.id } })
    else if (object && p.scope === object.id) out.push({ id: `preset:${p.id}`, label: `Style: ${p.name.trim() || p.id}`, ref: { kind: 'preset', id: p.id } })
  }
  return out
}

// The fieldsets that have to do with the selection: those it owns or is in the group of, and those bound to it or to a shape in it.
function fieldsetsHere(c: ModelContent, sel: Selection): ModelFieldset[] {
  if (sel.kind === 'none') return []
  const ids = related(c, sel)
  return (c.fieldsets ?? []).filter(f => (f.ownerKind !== 'preset' && ids.has(f.owner)) || ids.has(f.target))
}

const unitOf = (prop: string | null | undefined): string => (prop && prop in PROPS ? PROPS[prop as PropKey].unit : '')

export function FieldsTab({ content, sel, selPoint, state, values, actions, rig }: FieldsTabProps) {
  const [filter, setFilter] = useState<'selection' | 'all'>('selection')
  const [bindId, setBindId] = useState('shape')
  const [whoId, setWhoId] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  // the property chosen to add, per fieldset
  const [adding, setAdding] = useState<Record<string, PropKey | ''>>({})
  const binds = bindings(content, sel, selPoint), whos = owners(content, sel)
  const bind = binds.find(b => b.id === bindId) ?? binds[0], who = whos.find(w => w.id === whoId) ?? whos[0]
  const all = content.fieldsets ?? []
  const list = filter === 'all' || sel.kind === 'none' ? all : fieldsetsHere(content, sel)
  const full = all.length >= LIMITS.fieldsetsMax

  return (
    <div className="cmTabBody">
      <h2 className="cmInsTitle">Fields</h2>
      <p className="cmInsText">A field is a slider that changes one property of a shape, a point, an edge or an object: where it is, how big, how turned, how opaque, the shift of its colour, how its gradient runs. The fields of one feature are a fieldset; it belongs to an object, a group, or a variant or style, whose fields the writer is offered while it is on.</p>

      <section className="cmFieldMake" aria-label="Make a fieldset">
        <h3 className="cmInsSub">Make a fieldset</h3>
        {binds.length === 0
          ? <p className="cmInsText">Select a shape, or open an object, to make fields for it. Select a point on a shape to make fields for that point or the edge after it.</p>
          : (
            <>
              <div className="cmChips" role="group" aria-label="What the fields change">
                {binds.map(b => <button key={b.id} type="button" className={`cmChip cmChip--wide${bind?.id === b.id ? ' cmChip--on' : ''}`} aria-pressed={bind?.id === b.id} onClick={() => setBindId(b.id)}>{b.label}</button>)}
              </div>
              <label className="cmField">
                <span>Offered to</span>
                <select value={who?.id ?? ''} aria-label="Who is offered the fields" onChange={e => setWhoId(e.target.value)}>
                  {whos.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
              </label>
              <button
                type="button" className="cmBtn cmBtn--small" disabled={!bind || !who || full} aria-label={bind ? `Add a fieldset for ${featureText(content, bind.ref)}` : 'Add a fieldset'}
                title={full ? `A model may have at most ${LIMITS.fieldsetsMax} fieldsets.` : 'A fieldset gathers the sliders of one feature'} onClick={() => bind && who && actions.addFieldset(who.ref, bind.ref)}
              ><PlusIcon size={12} /> Add a fieldset</button>
            </>
          )}
      </section>

      <div className="cmChips" role="group" aria-label="Which fieldsets to list">
        <button type="button" className={`cmChip cmChip--wide${filter === 'selection' ? ' cmChip--on' : ''}`} aria-pressed={filter === 'selection'} onClick={() => setFilter('selection')}>This selection</button>
        <button type="button" className={`cmChip cmChip--wide${filter === 'all' ? ' cmChip--on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All ({all.length})</button>
      </div>
      {list.length === 0 && <p className="cmInsText">{all.length === 0 ? 'No fieldset yet.' : 'No fieldset has to do with the selection. Show All, or make one.'}</p>}
      {list.map(f => fieldsetCard(f))}
    </div>
  )

  function fieldsetCard(f: ModelFieldset) {
    const ref = featureOf(f), title = f.name.trim() || featureText(content, ref), fields = fieldsOf(content, f)
    const waits = waitsOn(content, f), offered = isOffered(content, state, f)
    const used = new Set(fields.map(r => fieldDrive(r, ref)?.prop))
    const free = propsOf(f.feature).filter(p => !used.has(p.key))
    const chosen = free.some(p => p.key === adding[f.id]) ? (adding[f.id] as PropKey) : ''
    const ownerWord = f.ownerKind === 'preset' ? (waits?.scope ? 'Style' : 'Variant') : f.ownerKind === 'group' ? 'Group' : 'Object'
    return (
      <section key={f.id} className="cmSlider cmFieldset" aria-label={`Fieldset ${title}`}>
        <div className="cmSliderHead">
          <input className="cmSliderName" aria-label={`Name of fieldset ${title}`} value={f.name} maxLength={40} placeholder={featureText(content, ref)} onChange={e => actions.renameFieldset(f.id, e.target.value)} />
          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Select ${featureText(content, ref)} on the canvas`} title="Select what the fieldset changes" onClick={() => actions.select(f)}><FocusIcon size={12} /></button>
          {confirm === f.id ? (
            <span className="cmConfirm" role="group" aria-label={`Delete ${title}?`}>
              <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.removeFieldset(f.id) }}>Delete it</button>
              <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
            </span>
          ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete fieldset ${title}`} title="Delete the fieldset and its sliders" onClick={() => setConfirm(f.id)}><TrashIcon size={12} /></button>}
        </div>
        <p className="cmInsText">Changes <b>{featureText(content, ref)}</b>. Offered to {ownerWord.toLowerCase()} <b>{ownerText(content, { kind: f.ownerKind, id: f.owner })}</b>.</p>
        {f.ownerKind === 'preset' && <p className="cmInsText" role="status">{offered ? `Offered now: ${waits?.name.trim() || 'it'} is on.` : `Offered while ${waits?.name.trim() || 'it'} is on.`}</p>}
        {fields.length === 0 && <p className="cmInsText">No field yet.</p>}
        <ul className="cmDrives">
          {fields.map(r => <li key={r.id}>{fieldRow(f, r)}</li>)}
        </ul>
        <div className="cmInline">
          <select aria-label={`Property to add to ${title}`} value={chosen} disabled={free.length === 0 || fields.length >= LIMITS.fieldsMax} onChange={e => setAdding(a => ({ ...a, [f.id]: e.target.value as PropKey }))}>
            <option value="">{free.length === 0 ? 'Every property has a field' : 'Choose a property'}</option>
            {(['place', 'size', 'look', 'colour', 'gradient'] as const).map(g => {
              const props = free.filter(p => p.group === g)
              return props.length === 0 ? null : <optgroup key={g} label={GROUP_LABELS[g]}>{props.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</optgroup>
            })}
          </select>
          <button
            type="button" className="cmBtn cmBtn--small" aria-label={`Add a field to ${title}`} disabled={!chosen || fields.length >= LIMITS.fieldsMax} title={fields.length >= LIMITS.fieldsMax ? `A fieldset may have at most ${LIMITS.fieldsMax} fields.` : 'Add a slider that changes the chosen property'}
            onClick={() => { if (chosen) { actions.addField(f.id, chosen); setAdding(a => ({ ...a, [f.id]: '' })) } }}
          ><PlusIcon size={12} /> Add a field</button>
        </div>
      </section>
    )
  }

  function fieldRow(f: ModelFieldset, r: ModelRange) {
    const ref = featureOf(f), d = fieldDrive(r, ref), at = fieldDriveIndex(r, ref), title = r.name.trim() || 'Field', v = valueOf(r, values)
    const u = unitOf(d?.prop)
    return (
      <div className="cmDrive cmField--row" role="group" aria-label={`Field ${title}`}>
        <div className="cmSliderHead">
          <input className="cmSliderName" aria-label={`Name of field ${title}`} value={r.name} maxLength={40} placeholder="Name" onChange={e => rig.renameRange(r.id, e.target.value)} />
          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={r.show ? `Hide ${title} from writers` : `Offer ${title} to writers`} title={r.show ? 'Writers can use this field (click to hide it)' : 'Hidden from writers (click to offer it)'} aria-pressed={r.show} onClick={() => rig.setShow(r.id, !r.show)}>{r.show ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}</button>
          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Show ${title} in the Ranges tab`} title="Change the span of the slider in the Ranges tab" onClick={actions.openRanges}><SlidersIcon size={12} /></button>
          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete field ${title}`} title="Delete the field and its slider" onClick={() => actions.removeField(r.id)}><TrashIcon size={12} /></button>
        </div>
        <label className="cmField">
          <span>Changes</span>
          <select value={d?.prop ?? ''} aria-label={`Property that ${title} changes`} onChange={e => actions.setProp(f.id, r.id, e.target.value as PropKey)}>
            {propsOf(f.feature).filter(p => p.key === d?.prop || !fieldsOf(content, f).some(x => x.id !== r.id && fieldDrive(x, ref)?.prop === p.key)).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        {d?.prop && <p className="cmInsText">{PROPS[d.prop as PropKey]?.hint}</p>}
        <label className="cmField">
          <span>Try it</span>
          <span className="cmRange">
            <input type="range" min={r.min} max={r.max} step={stepOf(r)} value={v} aria-label={`Try ${title}`} onChange={e => rig.setValue(r.id, Number(e.target.value))} />
            <output>{Math.round(v * 100) / 100}{r.unit}</output>
          </span>
        </label>
        {d && at >= 0 && (
          <div className="cmSteps">
            <Stepper label={`Amount at the minimum of ${title}`} value={`${d.atMin}${u}`} onStep={(dir, big) => rig.stepDrive(r.id, at, 'atMin', dir, big)} />
            <Stepper label={`Amount at the maximum of ${title}`} value={`${d.atMax}${u}`} onStep={(dir, big) => rig.stepDrive(r.id, at, 'atMax', dir, big)} />
          </div>
        )}
      </div>
    )
  }
}
