import { useState, type DragEvent } from 'react'
import { type Planner, type PlanItem, type Recurrence, type Routine } from '../../../../lib/facets'
import { addUnits, routineWindow, type RoutineWindow } from '../../../../lib/recurrence'
import { addDays } from '../../../../lib/projection'
import { newId } from './ids'
import { IconBtn } from './IconBtn'
import { CheckIcon, CloseIcon, PauseIcon, PlayIcon, PlusIcon, RestoreIcon } from '../../../icons'

// Everything waiting for a place: tasks not on a shift (drag one onto a shift to assign it) and the routines, grouped by where they stand today. A
// routine that comes round after an interval with a range (every 7-10 days) is low priority and tickable inside its range, and goes to the top once
// the range is past.

export interface BacklogOwner { id: string; label: string; planner: Planner }
export const DRAG_ITEM = 'application/x-scriblr-item'
const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function describe(r: Routine, w: RoutineWindow): string {
  const rec = r.recurrence
  if (rec.kind === 'daily') return rec.every === 1 ? 'Every day' : `Every ${rec.every} days`
  if (rec.kind === 'weekly') return rec.every === 1 ? 'Weekly' : `Every ${rec.every} weeks`
  const span = rec.rangeMax && rec.rangeMax > rec.every ? `${rec.every}-${rec.rangeMax}` : `${rec.every}`
  const unit = (rec.rangeMax ?? rec.every) > 1 ? `${rec.unit}s` : rec.unit
  return `Every ${span} ${unit} · ${w.state === 'upcoming' ? `next ${dayLabel(w.from)}` : `day ${w.day}`}`
}

interface Row { ownerId: string; routine: Routine; w: RoutineWindow }

export function Backlog({
  owners, today, todayTicks, onPlanner, onTick,
}: {
  owners: BacklogOwner[]
  today: string
  todayTicks: Record<string, string[]>
  onPlanner: (ownerId: string, next: Planner) => void
  onTick: (ownerId: string, id: string, on: boolean) => void
}) {
  const [text, setText] = useState('')
  const [owner, setOwner] = useState(owners[0]?.id ?? '')
  const [adding, setAdding] = useState(false)
  const [routine, setRoutine] = useState<{ label: string; kind: Recurrence['kind']; every: number; unit: Recurrence['unit']; rangeMax: string }>({ label: '', kind: 'daily', every: 1, unit: 'day', rangeMax: '' })
  const target = owners.find(o => o.id === owner) ?? owners[0]
  const update = (id: string, fn: (p: Planner) => Planner) => { const o = owners.find(x => x.id === id); if (o) onPlanner(id, fn(o.planner)) }

  const rows: Row[] = owners.flatMap(o => o.planner.routines.map(r => ({ ownerId: o.id, routine: r, w: routineWindow(r, today, o.planner.restDays) })))
  const tasks = owners.flatMap(o => o.planner.items.filter(i => !i.shiftId && !i.doneOn).map(i => ({ ownerId: o.id, item: i })))
  const group = (state: RoutineWindow['state']) => rows.filter(r => r.w.state === state)
  const ticked = (r: Row): boolean => (r.routine.recurrence.kind === 'interval' ? r.routine.lastDone === today : (todayTicks[r.ownerId] ?? []).includes(r.routine.id))
  const multi = owners.length > 1

  const check = (r: Row, on: boolean) => {
    onTick(r.ownerId, r.routine.id, on)
    if (r.routine.recurrence.kind === 'interval') update(r.ownerId, p => ({ ...p, routines: p.routines.map(x => (x.id === r.routine.id ? { ...x, lastDone: on ? today : null } : x)) }))
  }
  const pause = (r: Row, weeks: number) => update(r.ownerId, p => ({ ...p, routines: p.routines.map(x => (x.id === r.routine.id ? { ...x, pauses: [...x.pauses, { start: today, end: addDays(addUnits(today, weeks, 'week'), -1) }] } : x)) }))
  const resume = (r: Row) => update(r.ownerId, p => ({ ...p, routines: p.routines.map(x => (x.id === r.routine.id ? { ...x, pauses: x.pauses.filter(q => !(today >= q.start && today <= q.end)) } : x)) }))
  const drag = (e: DragEvent, ownerId: string, item: PlanItem) => { e.dataTransfer.setData(DRAG_ITEM, JSON.stringify({ ownerId, itemId: item.id })); e.dataTransfer.effectAllowed = 'move' }

  const addTask = () => {
    const label = text.trim()
    if (!label || !target) return
    update(target.id, p => ({ ...p, items: [...p.items, { id: newId('item'), label, facet: null, targetNodeId: null, targetTree: null, shiftId: null, doneOn: null }] }))
    setText('')
  }
  const addRoutine = () => {
    const label = routine.label.trim()
    if (!label || !target) return
    const range = routine.kind === 'interval' && routine.rangeMax ? Math.max(routine.every, Number(routine.rangeMax)) : null
    const rec: Recurrence = { kind: routine.kind, every: routine.every, unit: routine.kind === 'interval' ? routine.unit : 'day', days: [], rangeMax: range, anchor: today, until: null }
    update(target.id, p => ({ ...p, routines: [...p.routines, { id: newId('routine'), label, facet: null, targetNodeId: null, targetTree: null, shiftId: null, recurrence: rec, pauses: [], lastDone: null }] }))
    setRoutine({ ...routine, label: '' })
    setAdding(false)
  }

  const section = (title: string, list: Row[], tag?: (r: Row) => string) => list.length > 0 && (
    <div className="wrSchedBacklogGroup">
      <h4 className="wrSchedSub">{title}</h4>
      {list.map(r => (
        <div className="wrSchedItem" key={`${r.ownerId}-${r.routine.id}`}>
          <label>
            <input type="checkbox" checked={ticked(r)} disabled={r.w.state === 'paused'} onChange={e => check(r, e.target.checked)} aria-label={r.routine.label} />
            <span><b>{r.routine.label}</b><small>{describe(r.routine, r.w)}{multi ? ` · ${owners.find(o => o.id === r.ownerId)?.label}` : ''}</small></span>
          </label>
          {tag && <span className={`wrSchedTag${r.w.state === 'overdue' ? ' wrSchedTag--priority' : ''}`}>{tag(r)}</span>}
          {r.w.state === 'paused'
            ? <IconBtn Icon={PlayIcon} label={`Resume ${r.routine.label}`} onClick={() => resume(r)} />
            : <IconBtn Icon={PauseIcon} label={`Pause ${r.routine.label} for a week`} onClick={() => pause(r, 1)} />}
        </div>
      ))}
    </div>
  )

  return (
    <div className="wrSchedCard wrSchedBacklog">
      {section('Overdue', group('overdue'), () => 'Priority')}
      {section('Due today', group('due'))}
      {section('In range · low priority', group('inRange'), r => `${dayLabel(r.w.from)}-${dayLabel(r.w.to)}`)}
      {tasks.length > 0 && (
        <div className="wrSchedBacklogGroup">
          <h4 className="wrSchedSub">Tasks</h4>
          {tasks.map(({ ownerId, item }) => (
            <div className="wrSchedItem" key={item.id} draggable onDragStart={e => drag(e, ownerId, item)}>
              <span className="wrSchedGrip" aria-hidden="true">⋮⋮</span>
              <label>
                <input type="checkbox" aria-label={item.label} onChange={e => { if (e.target.checked) { update(ownerId, p => ({ ...p, items: p.items.map(x => (x.id === item.id ? { ...x, doneOn: today } : x)) })); onTick(ownerId, item.id, true) } }} />
                <span><b>{item.label}</b><small>Drag onto a shift{multi ? ` · ${owners.find(o => o.id === ownerId)?.label}` : ''}</small></span>
              </label>
              <IconBtn Icon={CloseIcon} label={`Delete ${item.label}`} onClick={() => update(ownerId, p => ({ ...p, items: p.items.filter(x => x.id !== item.id) }))} />
            </div>
          ))}
        </div>
      )}
      {section('Paused', group('paused'))}
      {group('upcoming').length + group('resting').length > 0 && (
        <details className="wrSchedBacklogGroup"><summary>Coming up ({group('upcoming').length + group('resting').length})</summary>{section('', [...group('upcoming'), ...group('resting')])}</details>
      )}
      {rows.length === 0 && tasks.length === 0 && <p className="wrMuted">Nothing waiting. Add a task, or a routine that comes round on its own.</p>}
      <div className="wrSchedBacklogAdd">
        {multi && (
          <select className="wrField" aria-label="Add to" value={owner} onChange={e => setOwner(e.target.value)}>{owners.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        )}
        <div className="wrKv">
          <input className="wrField" aria-label="New task" placeholder="Add a task…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask() }} />
          <IconBtn Icon={PlusIcon} label="Add task" onClick={addTask} disabled={!text.trim()} />
        </div>
        <IconBtn Icon={RestoreIcon} label="Add a routine" aria-expanded={adding} onClick={() => setAdding(!adding)} />
        {adding && (
          <form className="wrSchedForm" aria-label="New routine" onSubmit={e => { e.preventDefault(); addRoutine() }}>
            <input className="wrField" aria-label="Routine" placeholder="Back up the project…" value={routine.label} onChange={e => setRoutine({ ...routine, label: e.target.value })} />
            <select className="wrField" aria-label="Comes round" value={routine.kind} onChange={e => setRoutine({ ...routine, kind: e.target.value as Recurrence['kind'], every: 1 })}>
              <option value="daily">Every day</option><option value="weekly">Every week</option><option value="interval">After an interval</option>
            </select>
            {routine.kind === 'interval' && (
              <div className="wrKv">
                <span>every</span><input className="wrField wrSchedNum" type="number" min={1} aria-label="Every" value={routine.every} onChange={e => setRoutine({ ...routine, every: Math.max(1, Number(e.target.value) || 1) })} />
                <span>to</span><input className="wrField wrSchedNum" type="number" min={1} aria-label="Up to" placeholder="same" value={routine.rangeMax} onChange={e => setRoutine({ ...routine, rangeMax: e.target.value })} />
                <select className="wrField" aria-label="Unit" value={routine.unit} onChange={e => setRoutine({ ...routine, unit: e.target.value as Recurrence['unit'] })}><option value="day">days</option><option value="week">weeks</option><option value="month">months</option></select>
              </div>
            )}
            <IconBtn type="submit" Icon={CheckIcon} label="Add routine" className="wrSmallBtn wrSmallBtn--accent" disabled={!routine.label.trim()} />
          </form>
        )}
      </div>
    </div>
  )
}
