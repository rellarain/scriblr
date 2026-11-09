import { useDeferredValue, useMemo, useState } from 'react'
import type { ModelAxis, ModelContent, ModelForm, ModelObject } from '../../../../api/types'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PlayIcon, PlusIcon, SaveIcon, StarIcon, TrashIcon } from '../../../icons'
import type { Selection } from './designerState'
import { overrideState } from './engine/formEdit'
import { axesFor, chosenForm, formKey, targetForShape, templateOfMember } from './engine/forms'
import { LIMITS } from './engine/limits'
import { isOn, stylesOf, type TestState } from './engine/presets'
import { solve } from './engine/rig'
import type { PresetActions } from './PresetsTab'
import { NAME_MAX, groupById, objectById, objectOfShape, shapeById } from './modelContent'

// The Forms tab: an object has axes (the shape of an eye, an expression, a style), each with forms to choose from. A form gives some of the object's shapes
// an outline of their own (or hides them); every other shape keeps its base outline. The chosen form is only for looking, like the Try it sliders: it is not
// saved, and a form being chosen is also the form the canvas edits. The first axis, in order, that has an outline for a shape wins.
export interface FormActions {
  selectObject: (id: string) => void
  addAxis: (objectId: string) => void
  removeAxis: (objectId: string, axisId: string) => void
  renameAxis: (objectId: string, axisId: string, name: string) => void
  moveAxis: (objectId: string, axisId: string, dir: -1 | 1) => void
  choose: (objectId: string, axisId: string, formId: string) => void
  addForm: (objectId: string, axisId: string) => void
  renameForm: (objectId: string, axisId: string, formId: string, name: string) => void
  makeDefault: (objectId: string, axisId: string, formId: string) => void
  moveForm: (objectId: string, axisId: string, formId: string, dir: -1 | 1) => void
  removeForm: (objectId: string, axisId: string, formId: string) => void
  hideShape: (objectId: string, axisId: string, formId: string, shapeId: string) => void
  useBase: (objectId: string, axisId: string, formId: string, shapeId: string) => void
}

export interface FormsTabProps { content: ModelContent; sel: Selection; state: TestState; actions: FormActions; presets: PresetActions }

const label = (name: string, fallback: string) => name.trim() || fallback

// A small picture of each form of an axis: the object's shapes with that form chosen (and the other axes as they are now), all at one scale. Drawn from the
// content that lags behind while a point is being dragged, so dragging stays smooth.
function useThumbs(content: ModelContent, object: ModelObject, axis: ModelAxis, state: TestState) {
  const lagging = useDeferredValue(content)
  return useMemo(() => {
    const own = new Set(object.shapes)
    const solves = axis.options.map(f => solve(lagging, {}, 'front', { forms: { ...state.forms, [formKey(object.id, axis.id)]: f.id }, show: [object.id] }))
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    const drawn = solves.map(s => s.order.filter(id => own.has(id)))
    solves.forEach((s, i) => { for (const id of drawn[i]) { const b = s.shapes[id].box; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h) } })
    const any = x1 >= x0
    const pad = 4, w = Math.max(any ? x1 - x0 : 0, 10), h = Math.max(any ? y1 - y0 : 0, 10)
    return { viewBox: `${any ? x0 - pad : 0} ${any ? y0 - pad : 0} ${w + 2 * pad} ${h + 2 * pad}`, paths: solves.map((s, i) => drawn[i].map(id => ({ id, d: s.shapes[id].d }))) }
  }, [lagging, object, axis, state.forms])
}

export function FormsTab({ content, sel, state, actions, presets }: FormsTabProps) {
  const object = sel.kind === 'object' ? objectById(content, sel.id) : sel.kind === 'shape' ? objectOfShape(content, sel.id) : undefined
  const group = sel.kind === 'group' ? groupById(content, sel.id) : undefined

  if (!object) {
    const choices = group ? group.objects.map(id => objectById(content, id)).filter((o): o is ModelObject => !!o) : []
    return (
      <div className="cmTabBody">
        <h2 className="cmInsTitle">Forms</h2>
        <p className="cmInsText">Forms belong to an object: the shape of an eye, an expression, a style. Select an object, or a shape in one, to see its forms.</p>
        {choices.length > 0 && (
          <div className="cmChips" role="group" aria-label="Objects of the group">
            {choices.map(o => <button key={o.id} type="button" className="cmChip cmChip--wide" onClick={() => actions.selectObject(o.id)}>{label(o.name, 'Untitled object')}{axesFor(content, o).length ? ` (${axesFor(content, o).length})` : ''}</button>)}
          </div>
        )}
        {group && <StylesSection content={content} scopeId={group.id} scopeName={label(group.name, 'the group')} state={state} actions={presets} />}
      </div>
    )
  }

  const owner = templateOfMember(content, object)   // a member of a class chooses among its template's axes
  const axes = axesFor(content, object)
  const name = label(object.name, 'Untitled object')
  const target = sel.kind === 'shape' ? targetForShape(object, sel.id, state.forms) : null
  const original = object.mirrorOf ? objectById(content, object.mirrorOf) : undefined

  return (
    <div className="cmTabBody">
      <h2 className="cmInsTitle">Forms of {name}</h2>
      {original ? (
        <>
          <p className="cmInsText">{name} is the twin of {label(original.name, 'another object')}: its shapes mirror the original, so they follow the form chosen there.</p>
          <button type="button" className="cmBtn cmBtn--small" onClick={() => actions.selectObject(original.id)}>Go to {label(original.name, 'the original')}</button>
        </>
      ) : (
        <>
          {target && (
            <p className="cmRecording" role="status">
              <b>Editing form {label(target.form.name, 'Untitled form')} of {label(target.axis.name, 'Untitled axis')}.</b> The points you move change only this form. Choose the default form to edit the base outline.
            </p>
          )}
          {owner && <p className="cmInsText">{name} is a member of a class: it chooses among the forms of {label(owner.name, 'the pattern')}. Edit the forms on the pattern.</p>}
          {axes.length === 0 && !owner && <p className="cmInsText">No axes yet. An axis is a way this object can vary, such as the shape of an eye or an expression. Each axis has forms to choose from; a form can give a shape an outline of its own or hide it.</p>}
          {axes.map((axis, i) => <AxisSection key={axis.id} content={content} object={object} owner={owner ?? object} readOnly={!!owner} axis={axis} first={i === 0} last={i === axes.length - 1} state={state} actions={actions} />)}
          {!owner && <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" disabled={axes.length >= LIMITS.axesMax} title={axes.length >= LIMITS.axesMax ? `An object may have at most ${LIMITS.axesMax} axes` : 'A new way this object can vary'} onClick={() => actions.addAxis(object.id)}><PlusIcon size={12} /> Add an axis</button>
            <span className={`cmCount${axes.length > LIMITS.axesWarn ? ' cmCount--warn' : ''}`} title="Axes of the object">{axes.length} of {LIMITS.axesMax}</span>
          </div>}
          {axes.length > 1 && !owner && <p className="cmInsText">When two axes give the same shape an outline, the first axis in this list wins.</p>}
        </>
      )}
      <StylesSection content={content} scopeId={object.id} scopeName={name} state={state} actions={presets} />
    </div>
  )
}

function AxisSection({ content, object, owner, readOnly, axis, first, last, state, actions }: { content: ModelContent; object: ModelObject; owner: ModelObject; readOnly: boolean; axis: ModelAxis; first: boolean; last: boolean; state: TestState; actions: FormActions }) {
  const [confirm, setConfirm] = useState<string | null>(null)   // 'axis' or a form id
  const thumbs = useThumbs(content, object, axis, state)
  const chosen = chosenForm(owner, axis, state.forms, object.id)
  const title = label(axis.name, 'Untitled axis')
  const o = object.id, a = axis.id
  return (
    <section className="cmAxis" aria-label={`Axis ${title}`}>
      {readOnly ? <h3 className="cmInsSub">{title}</h3> : <div className="cmSliderHead">
        <input className="cmSliderName" aria-label={`Name of axis ${title}`} value={axis.name} maxLength={NAME_MAX} placeholder="Name" onChange={e => actions.renameAxis(o, a, e.target.value)} />
        <span className={`cmCount${axis.options.length > LIMITS.formsWarn ? ' cmCount--warn' : ''}`} title="Forms of the axis">{axis.options.length} of {LIMITS.formsMax}</span>
        <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move axis ${title} earlier`} title="Earlier: its forms win over the axes after it" disabled={first} onClick={() => actions.moveAxis(o, a, -1)}><ChevronUpIcon size={12} /></button>
        <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move axis ${title} later`} title="Later" disabled={last} onClick={() => actions.moveAxis(o, a, 1)}><ChevronDownIcon size={12} /></button>
        {confirm === 'axis' ? (
          <span className="cmConfirm" role="group" aria-label={`Delete axis ${title}?`}>
            <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.removeAxis(o, a) }}>Delete the axis</button>
            <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
          </span>
        ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete axis ${title}`} title="Delete the axis with all its forms" onClick={() => setConfirm('axis')}><TrashIcon size={12} /></button>}
      </div>}

      <div className="cmForms" role="group" aria-label={`Forms of ${title}`}>
        {axis.options.map((f, i) => {
          const on = chosen?.id === f.id
          return (
            <button key={f.id} type="button" className={`cmFormCard${on ? ' cmFormCard--on' : ''}`} aria-pressed={on} onClick={() => actions.choose(o, a, f.id)}>
              <svg className="cmFormThumb" viewBox={thumbs.viewBox} aria-hidden="true" focusable="false">
                {thumbs.paths[i]?.map(p => <path key={p.id} d={p.d} className="cmFormShape" />)}
              </svg>
              <span className="cmFormName">{label(f.name, 'Untitled form')}{f.id === axis.initial ? <small> · default</small> : null}</span>
            </button>
          )
        })}
      </div>
      {!readOnly && <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={axis.options.length >= LIMITS.formsMax} title={axis.options.length >= LIMITS.formsMax ? `An axis may have at most ${LIMITS.formsMax} forms` : 'A new form that starts as a copy of the outlines drawn now'} onClick={() => actions.addForm(o, a)}><PlusIcon size={12} /> Add a form from the current one</button>
      </div>}

      {chosen && !readOnly && (
        <FormDetail
          content={content} object={object} axis={axis} form={chosen} confirm={confirm === chosen.id} onConfirm={v => setConfirm(v ? chosen.id : null)} actions={actions}
          index={axis.options.findIndex(f => f.id === chosen.id)}
        />
      )}
    </section>
  )
}

function FormDetail({ content, object, axis, form, index, confirm, onConfirm, actions }: {
  content: ModelContent; object: ModelObject; axis: ModelAxis; form: ModelForm; index: number; confirm: boolean; onConfirm: (on: boolean) => void; actions: FormActions
}) {
  const o = object.id, a = axis.id, f = form.id
  const title = label(form.name, 'Untitled form')
  const isDefault = axis.initial === f
  return (
    <div className="cmFormDetail">
      <div className="cmSliderHead">
        <input className="cmSliderName" aria-label={`Name of form ${title}`} value={form.name} maxLength={NAME_MAX} placeholder="Name" onChange={e => actions.renameForm(o, a, f, e.target.value)} />
        <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move form ${title} earlier`} title="Earlier in the list" disabled={index <= 0} onClick={() => actions.moveForm(o, a, f, -1)}><ChevronUpIcon size={12} /></button>
        <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Move form ${title} later`} title="Later in the list" disabled={index >= axis.options.length - 1} onClick={() => actions.moveForm(o, a, f, 1)}><ChevronDownIcon size={12} /></button>
      </div>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={isDefault} title="Show this form unless another is chosen" onClick={() => actions.makeDefault(o, a, f)}><StarIcon size={12} /> Make default</button>
        {confirm ? (
          <span className="cmConfirm" role="group" aria-label={`Delete form ${title}?`}>
            <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { onConfirm(false); actions.removeForm(o, a, f) }}>Delete the form</button>
            <button type="button" className="cmBtn cmBtn--small" onClick={() => onConfirm(false)}>Keep it</button>
          </span>
        ) : <button type="button" className="cmBtn cmBtn--small" disabled={axis.options.length <= 1} title={axis.options.length <= 1 ? 'An axis needs at least one form' : 'Delete this form'} onClick={() => onConfirm(true)}><TrashIcon size={12} /> Delete</button>}
      </div>
      <ul className="cmPlain cmFormShapes" aria-label={`What ${title} does to each shape`}>
        {object.shapes.map(id => {
          const s = shapeById(content, id)
          if (!s) return null
          const sName = label(s.name, 'Untitled shape')
          const twinOf = s.mirrorOf ? shapeById(content, s.mirrorOf) : undefined
          if (s.mirrorOf) return <li key={id}><span className="cmFormShapeName">{sName}</span> <small>follows {label(twinOf?.name ?? '', 'its original')}</small></li>
          const state = overrideState(form, id)
          return (
            <li key={id}>
              <span className="cmFormShapeName">{sName}</span>{' '}
              <small>{state === 'own' ? 'own outline' : state === 'hidden' ? 'hidden in this form' : 'base outline'}</small>
              <span className="cmInline">
                {state !== 'hidden' && <button type="button" className="cmBtn cmBtn--small" onClick={() => actions.hideShape(o, a, f, id)}>Hide {sName} in this form</button>}
                {state !== 'base' && <button type="button" className="cmBtn cmBtn--small" onClick={() => actions.useBase(o, a, f, id)}>Use the base outline for {sName}</button>}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="cmInsText">Choose this form, then pick a shape and move its points: the shape gets an outline of its own in this form. The base outline is what anchors, links and sliders always read.</p>
    </div>
  )
}

// Styles: named looks of an object or a group, kept as presets that belong to it. A style keeps the forms chosen for what is inside, the member of a family
// that is shown, the sliders listed under it and what is switched off inside it; applying one replaces the last style of its kind that belongs to the same thing.
function StylesSection({ content, scopeId, scopeName, state, actions }: { content: ModelContent; scopeId: string; scopeName: string; state: TestState; actions: PresetActions }) {
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const styles = stylesOf(content, scopeId)
  return (
    <section className="cmSec" aria-label={`Styles of ${scopeName}`}>
      <h3 className="cmInsSub">Styles</h3>
      <p className="cmInsText">A style is a named look of {scopeName}: the forms chosen inside it, the family member shown, the sliders listed under it and what is switched off inside it.</p>
      <label className="cmField">
        <span>Style name</span>
        <input value={name} maxLength={NAME_MAX} aria-label={`Style name for ${scopeName}`} placeholder="Tired, Angry, Formal…" onChange={e => setName(e.target.value)} />
      </label>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" title={`Keep the current look of ${scopeName} as a style`} onClick={() => { actions.saveStyle(scopeId, name); setName('') }}><PlusIcon size={12} /> Save the current look as a style</button>
      </div>
      {styles.length > 0 && (
        <ul className="cmPresets">
          {styles.map(p => {
            const title = label(p.name, 'Untitled style'), on = isOn(content, state, p)
            return (
              <li key={p.id} className={`cmPreset${on ? ' cmPreset--on' : ''}`} aria-label={`Style ${title}`}>
                <div className="cmSliderHead">
                  <input className="cmSliderName" aria-label={`Name of style ${title}`} value={p.name} maxLength={NAME_MAX} placeholder="Name" onChange={e => actions.rename(p.id, e.target.value)} />
                  {on && <span className="cmOn" role="img" aria-label={`${title} is on`} title="The look is as this style sets it"><CheckIcon size={12} /> On</span>}
                </div>
                <div className="cmInline">
                  <button type="button" className="cmBtn cmBtn--small" aria-label={`Apply style ${title}`} onClick={() => actions.apply(p.id)}><PlayIcon size={12} /> Apply</button>
                  <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Update style ${title} from the current look`} title="Replace what this style keeps with the current look" onClick={() => actions.update(p.id)}><SaveIcon size={12} /></button>
                  {confirm === p.id ? (
                    <span className="cmConfirm" role="group" aria-label={`Delete style ${title}?`}>
                      <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.remove(p.id) }}>Delete the style</button>
                      <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
                    </span>
                  ) : <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete style ${title}`} title="Delete the style" onClick={() => setConfirm(p.id)}><TrashIcon size={12} /></button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
