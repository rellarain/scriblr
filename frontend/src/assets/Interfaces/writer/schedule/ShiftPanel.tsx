import { useState, type ReactNode } from 'react'
import { FACETS, FACET_LABEL, FACET_UNIT, newTask, type Facet, type PlanItem, type Shift } from '../../../../lib/facets'
import type { EditScope } from '../../../../lib/shiftEdit'
import { newId } from './ids'
import { FacetIcon } from './FacetIcon'
import { IconBtn } from './IconBtn'
import { RepeatPicker, presetLabel } from './RepeatPicker'
import { TimeRange } from './TimeRange'
import { BookmarkIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, PauseIcon, PlusIcon, TrashIcon } from '../../../icons'

// The side panel of a shift, inside the Planner tile beside the calendar. It is the shift as it is being changed: every field is applied as it is set (there
// is no Save), for the days chosen at the top ("This day", "This and following", "All of them", asked first, for a shift that repeats). Always shown: the
// title, the facet, the day and the time. Folded: the aim and what it is on, how it repeats, the pauses and the checklist.

export interface TargetOption { id: string; title: string; tree: 'outline' | 'plot'; kind: string }
const SCOPES: Array<[EditScope, string]> = [['this', 'This day'], ['following', 'This and following'], ['all', 'All of them']]

function Fold({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="wrFold" aria-label={title}>
      <button type="button" className="wrFoldHead" aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}
        <span>{title}</span>
        {summary && !open && <small>{summary}</small>}
      </button>
      {open && <div className="wrFoldBody">{children}</div>}
    </section>
  )
}

export interface ShiftPanelProps {
  // The shift as it is now (for the day opened): the panel shows it and reports changes to it.
  shift: Shift
  // The id the shift's tasks are kept under (a shift that repeats keeps them under its first id).
  itemsShiftId: string
  occurrence: string
  isNew: boolean
  // The shift repeats, and its days are chosen with the scope.
  repeating: boolean
  scope: EditScope
  onScope: (scope: EditScope) => void
  items: PlanItem[]
  ticks: string[]
  targets: TargetOption[]
  // The projects (and the account) a new shift can be given to; with only one there is no choice.
  projects?: Array<{ id: string; label: string }>
  projectId?: string
  onProject?: (id: string) => void
  onChange: (patch: Partial<Shift>) => void
  onItems: (items: PlanItem[]) => void
  onTick: (itemId: string, on: boolean) => void
  onDelete: () => void
  onTemplate: () => void
  onClose: () => void
}

export function ShiftPanel(p: ShiftPanelProps) {
  const { shift: s, items } = p
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [added, setAdded] = useState('')
  const [pause, setPause] = useState({ start: '', end: '' })
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }))
  const mine = items.filter(i => i.shiftId === p.itemsShiftId)
  const free = items.filter(i => !i.shiftId && !i.doneOn)
  const unit = FACET_UNIT[s.facet].many
  const node = p.targets.find(t => t.id === s.targetNodeId)
  const ticked = mine.filter(i => p.ticks.includes(i.id)).length
  // How it repeats is the pattern's, so it is changed for the days after this one or for all of them, not for one day.
  const patternLocked = p.repeating && p.scope === 'this'

  const addItem = () => {
    const label = added.trim()
    if (!label) return
    p.onItems([...items, newTask(newId('item'), label, p.occurrence, { facet: s.facet, targetNodeId: s.targetNodeId, targetTree: s.targetTree, shiftId: p.itemsShiftId, priority: 'medium' })])
    setAdded('')
  }

  return (
    <form className="wrSchedPanel" aria-label={p.isNew ? 'New shift' : 'Edit shift'} onSubmit={e => e.preventDefault()} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); p.onClose() } }}>
      <div className="wrSchedHead">
        <h3 className="wrSchedSub">{p.isNew ? 'New shift' : 'Shift'}</h3>
        <span className="wrSchedSpacer" />
        <IconBtn Icon={BookmarkIcon} label="Save as template" onClick={p.onTemplate} />
        <IconBtn Icon={TrashIcon} label={p.repeating && p.scope === 'this' ? 'Skip this day' : 'Delete'} onClick={p.onDelete} />
        <IconBtn Icon={CloseIcon} label="Close" onClick={p.onClose} />
      </div>
      {p.repeating && (
        <div className="wrChoice" role="radiogroup" aria-label="Change which shifts?">
          {SCOPES.map(([v, text]) => <button key={v} type="button" role="radio" aria-checked={p.scope === v} className={p.scope === v ? 'on' : ''} onClick={() => p.onScope(v)}>{text}</button>)}
        </div>
      )}
      {p.isNew && p.projects && p.projects.length > 1 && (
        <select className="wrField" aria-label="Project" value={p.projectId} onChange={e => p.onProject?.(e.target.value)}>
          {p.projects.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
      <input className="wrField" aria-label="Title" placeholder="What is this shift for?" value={s.title} onChange={e => p.onChange({ title: e.target.value })} autoFocus={p.isNew} />
      <div className="wrSchedTools" role="group" aria-label="Facet">
        {FACETS.map(f => (
          <button key={f} type="button" className={`wrSchedFacet${s.facet === f ? ' on' : ''}`} aria-pressed={s.facet === f} onClick={() => p.onChange({ facet: f as Facet })}>
            <FacetIcon facet={f} />{FACET_LABEL[f]}
          </button>
        ))}
      </div>
      <input className="wrField" type="date" aria-label="Day" value={s.date} onChange={e => e.target.value && p.onChange({ date: e.target.value })} />
      <TimeRange start={s.startSlot} end={s.endSlot} onChange={(startSlot, endSlot) => p.onChange({ startSlot, endSlot })} />

      <Fold title="Aim and target" open={!!open.aim} onToggle={() => toggle('aim')} summary={[s.target ? `${s.target} ${unit}` : '', node?.title ?? ''].filter(Boolean).join(' · ') || 'None'}>
        <label className="wrFoldField">Aim ({unit})
          <input className="wrField wrSchedNum" type="number" min={0} aria-label={`Aim in ${unit}`} value={s.target ?? ''} onChange={e => p.onChange({ target: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
        </label>
        <label className="wrFoldField">Working on
          <select
            className="wrField" aria-label="Working on" value={s.targetNodeId ? `${s.targetTree}:${s.targetNodeId}` : ''}
            onChange={e => { const [tree, id] = e.target.value.split(/:(.*)/s); p.onChange(e.target.value ? { targetTree: tree as 'outline' | 'plot', targetNodeId: id } : { targetTree: null, targetNodeId: null }) }}
          >
            <option value="">Nothing in particular</option>
            {p.targets.map(t => <option key={`${t.tree}:${t.id}`} value={`${t.tree}:${t.id}`}>{t.title} ({t.kind})</option>)}
          </select>
        </label>
      </Fold>

      <Fold title="Repeat" open={!!open.repeat} onToggle={() => toggle('repeat')} summary={presetLabel(s.recurrence)}>
        {patternLocked
          ? <p className="wrMuted">{presetLabel(s.recurrence)}. Choose This and following, or All of them, to change how it repeats.</p>
          : <RepeatPicker value={s.recurrence} anchor={s.recurrence?.anchor ?? s.date} allowNone onChange={recurrence => p.onChange({ recurrence })} />}
      </Fold>

      {s.recurrence && (
        <Fold title="Pauses" open={!!open.pauses} onToggle={() => toggle('pauses')} summary={s.pauses.length ? `${s.pauses.length}` : 'None'}>
          <div className="wrSchedPauses">
            {s.pauses.map((q, i) => <span key={`${q.start}${i}`} className="wrSchedPause">{q.start} to {q.end}<IconBtn Icon={CloseIcon} className="" label={`Remove pause ${q.start}`} disabled={patternLocked} onClick={() => p.onChange({ pauses: s.pauses.filter((_, j) => j !== i) })} /></span>)}
          </div>
          <div className="wrRepeatRow">
            <input className="wrField" type="date" aria-label="Pause from" value={pause.start} disabled={patternLocked} onChange={e => setPause({ ...pause, start: e.target.value })} />
            <span>to</span>
            <input className="wrField" type="date" aria-label="Pause to" value={pause.end} disabled={patternLocked} onChange={e => setPause({ ...pause, end: e.target.value })} />
            <IconBtn Icon={PauseIcon} label="Add pause" disabled={patternLocked || !pause.start || !pause.end || pause.end < pause.start} onClick={() => { p.onChange({ pauses: [...s.pauses, pause] }); setPause({ start: '', end: '' }) }} />
          </div>
        </Fold>
      )}

      <Fold title="Checklist" open={open.checklist ?? mine.length > 0} onToggle={() => setOpen(o => ({ ...o, checklist: !(o.checklist ?? mine.length > 0) }))} summary={mine.length ? `${ticked}/${mine.length}` : 'Empty'}>
        <small className="wrMuted">For {p.occurrence}</small>
        {mine.map(i => (
          <div key={i.id} className="wrSchedCheck">
            <label><input type="checkbox" checked={p.ticks.includes(i.id)} onChange={e => p.onTick(i.id, e.target.checked)} /> {i.label}</label>
            <IconBtn Icon={CloseIcon} label={`Unassign ${i.label}`} onClick={() => p.onItems(items.map(x => (x.id === i.id ? { ...x, shiftId: null } : x)))} />
          </div>
        ))}
        {free.length > 0 && (
          <select className="wrField" aria-label="Assign an item" value="" onChange={e => e.target.value && p.onItems(items.map(x => (x.id === e.target.value ? { ...x, shiftId: p.itemsShiftId } : x)))}>
            <option value="">Assign a task…</option>{free.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        )}
        <div className="wrKv">
          <input className="wrField" aria-label="New checklist item" placeholder="Add an item…" value={added} onChange={e => setAdded(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }} />
          <IconBtn Icon={PlusIcon} label="Add item" onClick={addItem} disabled={!added.trim()} />
        </div>
      </Fold>
    </form>
  )
}
