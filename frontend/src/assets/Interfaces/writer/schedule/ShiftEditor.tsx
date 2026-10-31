import { useState } from 'react'
import { FACETS, FACET_LABEL, FACET_UNIT, SLOTS_PER_DAY, slotTime, type Facet, type PlanItem, type Shift } from '../../../../lib/facets'
import type { EditScope } from '../../../../lib/shiftEdit'
import { newId } from './ids'

// The editor for one shift: its title, facet, time, target, what it repeats on, pauses, and the checklist items assigned to it (ticked for the day it
// is opened on). A shift that repeats asks whether a change is for this day, this and the following, or all of them.

export interface TargetOption { id: string; title: string; tree: 'outline' | 'plot'; kind: string }
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const slots = Array.from({ length: SLOTS_PER_DAY + 1 }, (_, i) => i)

type Repeat = 'none' | 'daily' | 'weekly'
const repeatOf = (s: Shift): Repeat => (!s.recurrence || s.recurrence.kind === 'once' ? 'none' : s.recurrence.kind === 'daily' ? 'daily' : 'weekly')

export interface EditorProps {
  shift: Shift
  occurrence: string
  isNew: boolean
  items: PlanItem[]
  ticks: string[]
  targets: TargetOption[]
  onTick: (itemId: string, on: boolean) => void
  onSave: (shift: Shift, items: PlanItem[], scope: EditScope) => void
  onDelete: (scope: EditScope) => void
  onTemplate: (shift: Shift) => void
  onClose: () => void
}

export function ShiftEditor({ shift, occurrence, isNew, items, ticks, targets, onTick, onSave, onDelete, onTemplate, onClose }: EditorProps) {
  const [s, setS] = useState<Shift>(shift)
  const [list, setList] = useState<PlanItem[]>(items)
  const [scope, setScope] = useState<EditScope>('this')
  const [added, setAdded] = useState('')
  const [pause, setPause] = useState({ start: '', end: '' })
  const set = (patch: Partial<Shift>) => setS(prev => ({ ...prev, ...patch }))
  const repeat = repeatOf(s)
  const setRepeat = (kind: Repeat) => {
    if (kind === 'none') return set({ recurrence: null })
    const prev = s.recurrence
    set({ recurrence: { kind, every: prev?.every ?? 1, unit: 'day', days: kind === 'weekly' ? (prev?.days.length ? prev.days : [0, 1, 2, 3, 4]) : [], rangeMax: null, anchor: prev?.anchor ?? s.date, until: prev?.until ?? null } })
  }
  const toggleDay = (d: number) => {
    const r = s.recurrence
    if (!r) return
    const days = r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d].sort()
    if (days.length) set({ recurrence: { ...r, days } })
  }
  const add = () => {
    const label = added.trim()
    if (!label) return
    setList([...list, { id: newId('item'), label, facet: s.facet, targetNodeId: s.targetNodeId, targetTree: s.targetTree, shiftId: s.id, doneOn: null }])
    setAdded('')
  }
  const unit = FACET_UNIT[s.facet].many
  const mine = list.filter(i => i.shiftId === s.id)
  const free = list.filter(i => !i.shiftId && !i.doneOn)
  const valid = s.title.trim().length > 0 && s.endSlot > s.startSlot
  const repeating = Boolean(shift.recurrence) && !isNew
  return (
    <form
      className="wrSchedEditor" aria-label={isNew ? 'New shift' : 'Edit shift'}
      onSubmit={e => { e.preventDefault(); if (valid) onSave({ ...s, title: s.title.trim() }, list, scope) }}
    >
      <div className="wrSchedHead"><h3 className="wrSchedSub">{isNew ? 'New shift' : 'Shift'}</h3><span className="wrSchedSpacer" /><button type="button" className="wrSmallBtn" onClick={onClose}>Close</button></div>
      <label className="wrKv"><span>Title</span><input className="wrField" aria-label="Title" value={s.title} onChange={e => set({ title: e.target.value })} autoFocus /></label>
      <label className="wrKv"><span>Facet</span>
        <select className="wrField" aria-label="Facet" value={s.facet} onChange={e => set({ facet: e.target.value as Facet })}>{FACETS.map(f => <option key={f} value={f}>{FACET_LABEL[f]}</option>)}</select>
      </label>
      <label className="wrKv"><span>Day</span><input className="wrField" type="date" aria-label="Day" value={s.date} onChange={e => set({ date: e.target.value, recurrence: s.recurrence ? { ...s.recurrence, anchor: s.recurrence.anchor > e.target.value ? e.target.value : s.recurrence.anchor } : null })} /></label>
      <div className="wrKv"><span>From</span>
        <select className="wrField" aria-label="From" value={s.startSlot} onChange={e => { const v = Number(e.target.value); set({ startSlot: v, endSlot: Math.max(s.endSlot, v + 3 > SLOTS_PER_DAY ? SLOTS_PER_DAY : v + 3) }) }}>{slots.slice(0, SLOTS_PER_DAY).map(i => <option key={i} value={i}>{slotTime(i)}</option>)}</select>
        <span>to</span>
        <select className="wrField" aria-label="To" value={s.endSlot} onChange={e => set({ endSlot: Number(e.target.value) })}>{slots.slice(1).map(i => <option key={i} value={i}>{i === SLOTS_PER_DAY ? 'Midnight' : slotTime(i)}</option>)}</select>
      </div>
      <label className="wrKv"><span>Aim ({unit})</span>
        <input className="wrField wrSchedNum" type="number" min={0} aria-label={`Aim in ${unit}`} value={s.target ?? ''} onChange={e => set({ target: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
      </label>
      <label className="wrKv"><span>Working on</span>
        <select className="wrField" aria-label="Working on" value={s.targetNodeId ? `${s.targetTree}:${s.targetNodeId}` : ''} onChange={e => { const [tree, id] = e.target.value.split(/:(.*)/s); set(e.target.value ? { targetTree: tree as 'outline' | 'plot', targetNodeId: id } : { targetTree: null, targetNodeId: null }) }}>
          <option value="">Nothing in particular</option>
          {targets.map(t => <option key={`${t.tree}:${t.id}`} value={`${t.tree}:${t.id}`}>{t.title} ({t.kind})</option>)}
        </select>
      </label>
      <label className="wrKv"><span>Repeats</span>
        <select className="wrField" aria-label="Repeats" value={repeat} onChange={e => setRepeat(e.target.value as Repeat)}>
          <option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">On chosen days</option>
        </select>
      </label>
      {s.recurrence && (
        <>
          <label className="wrKv"><span>{repeat === 'weekly' ? 'Every … weeks' : 'Every … days'}</span>
            <input className="wrField wrSchedNum" type="number" min={1} max={52} aria-label="Every" value={s.recurrence.every} onChange={e => set({ recurrence: { ...(s.recurrence as NonNullable<Shift['recurrence']>), every: Math.max(1, Number(e.target.value) || 1) } })} />
          </label>
          {repeat === 'weekly' && (
            <div className="wrKv"><span>On</span>
              <span className="wrSchedDays" role="group" aria-label="Days">
                {WEEKDAYS.map((l, d) => <button key={d} type="button" className={s.recurrence?.days.includes(d) ? 'on' : ''} aria-pressed={s.recurrence?.days.includes(d)} aria-label={WEEKDAY_NAMES[d]} onClick={() => toggleDay(d)}>{l}</button>)}
              </span>
            </div>
          )}
          <label className="wrKv"><span>Until</span><input className="wrField" type="date" aria-label="Until" value={s.recurrence.until ?? ''} onChange={e => set({ recurrence: { ...(s.recurrence as NonNullable<Shift['recurrence']>), until: e.target.value || null } })} /></label>
          <div className="wrSchedPauses">
            <span className="wrMuted">Paused</span>
            {s.pauses.map((p, i) => <span key={`${p.start}${i}`} className="wrSchedPause">{p.start} to {p.end}<button type="button" aria-label={`Remove pause ${p.start}`} onClick={() => set({ pauses: s.pauses.filter((_, j) => j !== i) })}>×</button></span>)}
            <input className="wrField" type="date" aria-label="Pause from" value={pause.start} onChange={e => setPause({ ...pause, start: e.target.value })} />
            <input className="wrField" type="date" aria-label="Pause to" value={pause.end} onChange={e => setPause({ ...pause, end: e.target.value })} />
            <button type="button" className="wrSmallBtn" disabled={!pause.start || !pause.end || pause.end < pause.start} onClick={() => { set({ pauses: [...s.pauses, pause] }); setPause({ start: '', end: '' }) }}>Pause</button>
          </div>
        </>
      )}
      <h4 className="wrSchedSub">Checklist for {occurrence}</h4>
      {mine.map(i => (
        <div key={i.id} className="wrSchedCheck">
          <label><input type="checkbox" checked={ticks.includes(i.id)} onChange={e => onTick(i.id, e.target.checked)} /> {i.label}</label>
          <button type="button" className="wrSmallBtn" aria-label={`Unassign ${i.label}`} onClick={() => setList(list.map(x => (x.id === i.id ? { ...x, shiftId: null } : x)))}>Unassign</button>
        </div>
      ))}
      {free.length > 0 && (
        <label className="wrKv"><span>Assign</span>
          <select className="wrField" aria-label="Assign an item" value="" onChange={e => e.target.value && setList(list.map(x => (x.id === e.target.value ? { ...x, shiftId: s.id } : x)))}>
            <option value="">Choose an item…</option>{free.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </label>
      )}
      <div className="wrKv">
        <input className="wrField" aria-label="New checklist item" placeholder="Add an item…" value={added} onChange={e => setAdded(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="wrSmallBtn" onClick={add} disabled={!added.trim()}>Add</button>
      </div>
      {repeating && (
        <fieldset className="wrSchedScope"><legend>Change</legend>
          {([['this', 'This day'], ['following', 'This and following'], ['all', 'All of them']] as const).map(([v, label]) => (
            <label key={v}><input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} /> {label}</label>
          ))}
        </fieldset>
      )}
      <div className="wrSchedFormActions">
        {!isNew && <button type="button" className="wrSmallBtn" onClick={() => onDelete(scope)}>{repeating && scope === 'this' ? 'Skip this day' : 'Delete'}</button>}
        <button type="button" className="wrSmallBtn" onClick={() => onTemplate(s)}>Save as template</button>
        <span className="wrSchedSpacer" />
        <button type="submit" className="wrSmallBtn wrSmallBtn--accent" disabled={!valid}>Save shift</button>
      </div>
    </form>
  )
}
