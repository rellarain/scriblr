import { useState } from 'react'
import { FACET_LABEL, type Planner } from '../../../../lib/facets'
import {
  KIND_LABEL, PLAN_KINDS, copyIntoPlanner, describeCounts, emptySelection, isEmptyPlan, saveToTemplate, selectAll, selectionSize, withDependencies,
  type CopyResult, type PlanKindKey, type PlanSelection,
} from '../../../../lib/template'
import { Fold } from '../schedule/Fold'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import type { ScheduleOwner } from '../schedule/ScheduleCard'
import { CheckboxIcon, CopyIcon, ExportIcon, UndoIcon } from '../../../icons'
import { TEMPLATE_OWNER } from './useTemplate'

// The Template tile: the project template, a toolkit to copy from. **From the template** picks phases, milestones, processes, exercises, routines, tasks and goals from it and
// copies them into the plan being edited, dated from a start day that is asked (a copy is its own, never a link). **Save to the template** does it the other way,
// from this plan into the template. While the template itself is being edited there is nothing to copy between, and the tile says so.

const goalName = (g: Planner['goals'][number]): string => `${FACET_LABEL[g.facet]}${g.kind ? ` ${g.kind}s` : ''} goal${g.total ? ` of ${g.total.toLocaleString('en-US')}` : g.daily ? ` of ${g.daily.toLocaleString('en-US')} a day` : ''}`
const nameOf: { [K in PlanKindKey]: (x: Planner[K][number]) => string } = {
  phases: x => x.title || 'Untitled phase',
  milestones: x => x.title || 'Untitled milestone',
  processes: x => x.title || 'Untitled process',
  exercises: x => x.title || 'Untitled exercise',
  routines: x => x.label || 'Untitled routine',
  items: x => x.label || 'Untitled task',
  goals: goalName,
}

// The items of a plan that can be picked, a group for each kind that has any, each with a box and a box for the whole group.
function Picker({ planner, value, onChange, label, onlyOpenTasks }: { planner: Planner; value: PlanSelection; onChange: (next: PlanSelection) => void; label: string; onlyOpenTasks?: boolean }) {
  const listed = (k: PlanKindKey): Array<{ id: string; name: string }> => {
    const list = (planner[k] as Array<{ id: string; done?: boolean; doneOn?: string | null }>).filter(x => !(onlyOpenTasks && k === 'items' && x.doneOn))
    return list.map(x => ({ id: x.id, name: (nameOf[k] as (y: unknown) => string)(x) }))
  }
  const set = (k: PlanKindKey, ids: string[]) => onChange(withDependencies(planner, { ...value, [k]: ids }))
  return (
    <div className="wrPicker" role="group" aria-label={label}>
      {PLAN_KINDS.map(k => {
        const items = listed(k)
        if (items.length === 0) return null
        const chosen = items.filter(i => value[k].includes(i.id)).length
        return (
          <section key={k} className="wrPickerGroup" aria-label={KIND_LABEL[k]}>
            <label className="wrPickerAll">
              <input type="checkbox" aria-label={`All ${KIND_LABEL[k].toLowerCase()}`} checked={chosen === items.length} ref={el => { if (el) el.indeterminate = chosen > 0 && chosen < items.length }} onChange={e => set(k, e.target.checked ? items.map(i => i.id) : [])} />
              <b>{KIND_LABEL[k]}</b><small>{chosen}/{items.length}</small>
            </label>
            {items.map(i => (
              <label key={i.id} className="wrPickerItem">
                <input type="checkbox" aria-label={i.name} checked={value[k].includes(i.id)} onChange={e => set(k, e.target.checked ? [...value[k], i.id] : value[k].filter(x => x !== i.id))} />
                <span>{i.name}</span>
              </label>
            ))}
          </section>
        )
      })}
    </div>
  )
}

export function TemplateTile({ owner, template, setTemplate, today }: { owner: ScheduleOwner; template: Planner; setTemplate: (p: Planner) => void; today: string }) {
  const editingTemplate = owner.id === TEMPLATE_OWNER
  const [open, setOpen] = useState<'from' | 'to' | null>('from')
  const [fromSel, setFromSel] = useState<PlanSelection>(emptySelection)
  const [toSel, setToSel] = useState<PlanSelection>(emptySelection)
  const [start, setStart] = useState('')
  const [said, setSaid] = useState<string | null>(null)
  // The plan as it was before the last copy and as it was left, so that the copy can be taken back while nothing else has changed it.
  const [undo, setUndo] = useState<{ before: Planner; after: Planner } | null>(null)
  const startDay = start || owner.planner.timelineStart || today
  const mk = (prefix: string) => newId(prefix)

  if (editingTemplate) {
    return (
      <div className="wrSchedCard wrTemplate">
        <p className="wrHint">You are editing the template. Its phases and milestones are counted in days from the start of whatever project they are copied into. Pick a project or the account above to copy from it, or to save its items here.</p>
      </div>
    )
  }

  const copy = () => {
    const r: CopyResult = copyIntoPlanner(template, fromSel, owner.planner, startDay, mk)
    setUndo({ before: owner.planner, after: r.planner })
    owner.setPlanner(r.planner)
    setSaid(`Copied ${describeCounts(r.counts)} into ${owner.label}, from ${startDay}.`)
    setFromSel(emptySelection())
  }
  const save = () => {
    const r = saveToTemplate(owner.planner, toSel, template, mk)
    setTemplate(r.planner)
    setSaid(`Saved ${describeCounts(r.counts)} to the template.`)
    setToSel(emptySelection())
  }
  const canUndo = undo !== null && owner.planner === undo.after

  return (
    <div className="wrSchedCard wrTemplate">
      {said && (
        <p className="wrSchedNotice" role="status">
          {said}
          {canUndo && <IconBtn Icon={UndoIcon} label="Undo the copy" onClick={() => { owner.setPlanner(undo.before); setUndo(null); setSaid('Took the copy back.') }} />}
        </p>
      )}
      <Fold title="From the template" summary={isEmptyPlan(template) ? 'Empty' : undefined} open={open === 'from'} onToggle={() => setOpen(open === 'from' ? null : 'from')}>
        {isEmptyPlan(template) ? (
          <p className="wrHint">The template is empty. Choose Template at the top to define it, or save items from this plan below.</p>
        ) : (
          <>
            <Picker planner={template} value={fromSel} onChange={setFromSel} label="Template items" />
            <div className="wrPickerBar">
              <label className="wrKv"><span>Starts on</span><input className="wrField" type="date" aria-label="Start day of the copy" value={start || startDay} onChange={e => setStart(e.target.value)} /></label>
              <IconBtn Icon={CopyIcon} label={`Copy into ${owner.label}`} className="wrSmallBtn wrSmallBtn--accent" disabled={selectionSize(fromSel) === 0 || !startDay} onClick={copy} />
              <IconBtn Icon={CheckboxIcon} label="Pick everything" onClick={() => setFromSel(selectAll(template))} />
            </div>
            <span className="wrHint">{selectionSize(fromSel)} picked</span>
          </>
        )}
      </Fold>
      <Fold title="Save to the template" open={open === 'to'} onToggle={() => setOpen(open === 'to' ? null : 'to')}>
        {isEmptyPlan(owner.planner) ? (
          <p className="wrHint">{owner.label} has nothing to save yet.</p>
        ) : (
          <>
            <Picker planner={owner.planner} value={toSel} onChange={setToSel} label={`${owner.label} items`} onlyOpenTasks />
            <div className="wrPickerBar">
              <IconBtn Icon={ExportIcon} label="Add to the template" className="wrSmallBtn wrSmallBtn--accent" disabled={selectionSize(toSel) === 0} onClick={save} />
            </div>
            <span className="wrHint">{selectionSize(toSel)} picked</span>
          </>
        )}
      </Fold>
    </div>
  )
}
