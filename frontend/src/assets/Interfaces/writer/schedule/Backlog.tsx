import { useMemo, useState, type ReactNode } from 'react'
import { newTask, PRIORITY_LABEL, type ActivityEvent, type PlanItem, type Planner, type Recurrence, type Routine } from '../../../../lib/facets'
import { DEFAULT_FILTER, moveItem, organise, type BacklogFilter, type Entry, type RoutineEntry, type TaskEntry } from '../../../../lib/backlog'
import { formatEstimate, parseQuickAdd, type QuickTarget } from '../../../../lib/quickAdd'
import { addUnits, type RoutineWindow } from '../../../../lib/recurrence'
import { addDays } from '../../../../lib/projection'
import { progressOf, withDescendants } from '../../../../lib/taskProgress'
import DragGap from '../../../../components/DragGap'
import { useStoredState } from '../shared'
import { useReorder } from '../../admin/plot/useReorder'
import { newId } from './ids'
import { IconBtn } from './IconBtn'
import { BacklogToolbar } from './BacklogToolbar'
import { RepeatPicker } from './RepeatPicker'
import { DRAG_ITEM, TaskRow } from './TaskRow'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, PauseIcon, PlayIcon, PlusIcon, RestoreIcon } from '../../../icons'

// Everything waiting for a place. Today comes first (the tasks on today's shifts, the one running now first, and the routines due), then what is overdue,
// then the tasks by priority (High, Medium, Low), the routines, and the tasks with no priority in a fold that opens by itself when nothing else is
// waiting. A task opens in place to its notes, subtasks, estimate, due day and node; drag one by its grip onto a shift in the Planner to put it there.
// A routine that comes round after an interval with a range (every 7-10 days) is low priority and tickable inside its range, and goes to the top once
// the range is past. (The order and the filters are lib/backlog.ts.)

export interface BacklogOwner { id: string; label: string; planner: Planner }
export { DRAG_ITEM }
const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function describe(r: Routine, w: RoutineWindow): string {
  const rec = r.recurrence
  if (rec.kind === 'daily') return rec.every === 1 ? 'Every day' : `Every ${rec.every} days`
  if (rec.kind === 'weekly') return rec.every === 1 ? 'Weekly' : `Every ${rec.every} weeks`
  const span = rec.rangeMax && rec.rangeMax > rec.every ? `${rec.every}-${rec.rangeMax}` : `${rec.every}`
  const unit = (rec.rangeMax ?? rec.every) > 1 ? `${rec.unit}s` : rec.unit
  return `Every ${span} ${unit} · ${w.state === 'upcoming' ? `next ${dayLabel(w.from)}` : `day ${w.day}`}`
}

export interface TreeNode { id: string; parentId: string | null; title: string }
type Remembered = Pick<BacklogFilter, 'facet' | 'sort' | 'done'>

export function Backlog({
  owners, today, nowSlot, todayTicks, onPlanner, onTick, events, targets, nodes, onOpenNode, project = null, onProject = () => {}, addTo, onAddTo = () => {}, colors = {},
}: {
  owners: BacklogOwner[]
  today: string
  nowSlot: number
  todayTicks: Record<string, string[]>
  onPlanner: (ownerId: string, next: Planner) => void
  onTick: (ownerId: string, id: string, on: boolean) => void
  // The work done on the project's nodes, for a task's progress, and the nodes a task can be about (a project's own).
  events: ActivityEvent[]
  targets: QuickTarget[]
  nodes: TreeNode[]
  onOpenNode?: (tree: 'outline' | 'plot', id: string) => void
  // The project shown (shared with the Planner), where a new task goes (the last one one was made for) and each project's colour.
  project?: string | null
  onProject?: (id: string | null) => void
  addTo?: string
  onAddTo?: (id: string) => void
  colors?: Record<string, string>
}) {
  const [remembered, setRemembered] = useStoredState<Remembered>('scriblr.writer.backlog.view', { facet: DEFAULT_FILTER.facet, sort: DEFAULT_FILTER.sort, done: DEFAULT_FILTER.done })
  const [search, setSearch] = useState('')
  const filter: BacklogFilter = { ...DEFAULT_FILTER, ...remembered, project, search }
  const [openId, setOpenId] = useState<string | null>(null)
  const [noneToggle, setNoneToggle] = useState<boolean | null>(null)
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [routineLabel, setRoutineLabel] = useState('')
  const [routineRec, setRoutineRec] = useState<Recurrence | null>(null)
  const multi = owners.length > 1
  const owner = addTo ?? owners[0]?.id ?? ''
  const target = owners.find(o => o.id === owner) ?? owners[0]
  const labelOf = (id: string) => owners.find(o => o.id === id)?.label ?? ''
  const update = (id: string, fn: (p: Planner) => Planner) => { const o = owners.find(x => x.id === id); if (o) onPlanner(id, fn(o.planner)) }
  const titles = useMemo(() => new Map(nodes.map(n => [n.id, n.title])), [nodes])
  const nodeTitle = (id: string | null) => (id ? titles.get(id) : undefined)

  const sections = useMemo(() => organise({
    owners, today, nowSlot, filter, ticked: (o, id) => (todayTicks[o] ?? []).includes(id), nodeTitle: id => titles.get(id),
  }), [owners, today, nowSlot, remembered, project, search, todayTicks, titles]) // eslint-disable-line react-hooks/exhaustive-deps
  const noneOpen = noneToggle ?? sections.noneOpen

  // ---- changes ----
  const patch = (ownerId: string, id: string, change: Partial<PlanItem>) => update(ownerId, p => ({ ...p, items: p.items.map(x => (x.id === id ? { ...x, ...change } : x)) }))
  const remove = (ownerId: string, id: string) => update(ownerId, p => ({ ...p, items: p.items.filter(x => x.id !== id) }))
  const reorder = useReorder<string>(
    (id, before) => { const o = owners.find(x => x.planner.items.some(i => i.id === id)); if (o) onPlanner(o.id, { ...o.planner, items: moveItem(o.planner.items, id, before) }) },
    (id, dir) => {
      const o = owners.find(x => x.planner.items.some(i => i.id === id))
      if (!o) return
      const at = o.planner.items.findIndex(i => i.id === id)
      const before = dir < 0 ? o.planner.items[at - 1]?.id : o.planner.items[at + 2]?.id ?? null
      if (before !== undefined) onPlanner(o.id, { ...o.planner, items: moveItem(o.planner.items, id, before) })
    },
  )
  const check = (r: RoutineEntry, on: boolean) => {
    onTick(r.ownerId, r.routine.id, on)
    if (r.routine.recurrence.kind === 'interval') update(r.ownerId, p => ({ ...p, routines: p.routines.map(x => (x.id === r.routine.id ? { ...x, lastDone: on ? today : null } : x)) }))
  }
  const pause = (r: RoutineEntry, weeks: number) => update(r.ownerId, p => ({ ...p, routines: p.routines.map(x => (x.id === r.routine.id ? { ...x, pauses: [...x.pauses, { start: today, end: addDays(addUnits(today, weeks, 'week'), -1) }] } : x)) }))
  const resume = (r: RoutineEntry) => update(r.ownerId, p => ({ ...p, routines: p.routines.map(x => (x.id === r.routine.id ? { ...x, pauses: x.pauses.filter(q => !(today >= q.start && today <= q.end)) } : x)) }))

  const quick = parseQuickAdd(text, today, targets)
  const addTask = () => {
    if (!quick.label || !target) return
    const node = quick.target
    update(target.id, p => ({
      ...p,
      items: [...p.items, newTask(newId('item'), quick.label, today, {
        priority: quick.priority ?? 'none', dueDate: quick.dueDate, estimateMinutes: quick.estimateMinutes,
        targetNodeId: node?.id ?? null, targetTree: node?.tree ?? null, facet: node ? (node.tree === 'plot' ? 'plot' : 'draft') : null,
      })],
    }))
    setText('')
  }
  const addRoutine = () => {
    const label = routineLabel.trim()
    const rec = routineRec ?? { kind: 'daily' as const, every: 1, unit: 'day' as const, days: [], rangeMax: null, anchor: today, until: null }
    if (!label || !target) return
    update(target.id, p => ({ ...p, routines: [...p.routines, { id: newId('routine'), label, facet: null, targetNodeId: null, targetTree: null, shiftId: null, recurrence: rec, pauses: [], lastDone: null }] }))
    setRoutineLabel('')
    setRoutineRec(null)
    setAdding(false)
  }

  // ---- rows ----
  const covered = (i: PlanItem) => (i.aim && i.targetNodeId ? withDescendants(nodes, i.targetNodeId) : null)
  const taskRow = (e: TaskEntry, more: { done?: boolean; overdue?: boolean; onShift?: string; running?: boolean; manual?: boolean } = {}) => (
    <TaskRow
      key={e.item.id} ownerId={e.ownerId} item={e.item} today={today} done={more.done ?? !!e.item.doneOn} overdue={more.overdue} from={multi ? labelOf(e.ownerId) : undefined} fromColor={colors[e.ownerId]}
      onShift={more.onShift} running={more.running} progress={progressOf(e.item, events, covered(e.item))} targets={targets} nodeTitle={nodeTitle(e.item.targetNodeId)}
      open={openId === e.item.id} onOpen={open => setOpenId(open ? e.item.id : null)} onChange={change => patch(e.ownerId, e.item.id, change)}
      onTick={on => onTick(e.ownerId, e.item.id, on)} onDelete={() => remove(e.ownerId, e.item.id)} onOpenNode={onOpenNode}
      reorderGrip={more.manual ? reorder.grip(e.item.id) : undefined} placeable={!e.item.shiftId && !e.item.doneOn}
    />
  )
  const routineRow = (r: RoutineEntry, tag?: string) => (
    <div className="wrSchedItem" key={`${r.ownerId}-${r.routine.id}`}>
      <label>
        <input type="checkbox" checked={r.ticked} disabled={r.w.state === 'paused'} onChange={e => check(r, e.target.checked)} aria-label={r.routine.label} />
        <span><b>{r.routine.label}</b><small>{describe(r.routine, r.w)}{multi ? <> · {colors[r.ownerId] && <i className="wrSchedDot" style={{ background: colors[r.ownerId] }} />}{labelOf(r.ownerId)}</> : ''}</small></span>
      </label>
      {tag && <span className={`wrSchedTag${r.w.state === 'overdue' ? ' wrSchedTag--priority' : ''}`}>{tag}</span>}
      {r.w.state === 'paused'
        ? <IconBtn Icon={PlayIcon} label={`Resume ${r.routine.label}`} onClick={() => resume(r)} />
        : <IconBtn Icon={PauseIcon} label={`Pause ${r.routine.label} for a week`} onClick={() => pause(r, 1)} />}
    </div>
  )
  const entryRow = (e: Entry) => (e.kind === 'task' ? taskRow(e, { overdue: true }) : routineRow(e, 'Priority'))
  const group = (title: ReactNode, list: ReactNode[], key: string, name = typeof title === 'string' ? title : key) => list.length > 0 && (
    <section className="wrSchedBacklogGroup" key={key} aria-label={name}>
      <h4 className="wrSchedSub">{title}</h4>
      {list}
    </section>
  )
  const flagged = (label: string, level: 'high' | 'medium' | 'low') => <span className={`wrPrioTitle wrPrioTitle--${level}`}>{label}</span>

  const todayRows = sections.today.map(e => (e.kind === 'task' ? taskRow(e, { done: e.done, onShift: e.shiftTitle, running: e.running }) : routineRow(e)))
  const manual = filter.sort === 'manual'
  const none = sections.groups.none
  const comingUp = [...sections.routines.upcoming]

  return (
    <div className="wrSchedCard wrSchedBacklog">
      <BacklogToolbar filter={filter} owners={owners} onChange={next => { setSearch(next.search); onProject(next.project); setRemembered({ facet: next.facet, sort: next.sort, done: next.done }) }} />
      {group(`Today · ${todayRows.length}`, todayRows, 'today')}
      {group(`Overdue · ${sections.overdue.length}`, sections.overdue.map(entryRow), 'overdue')}
      {filter.sort === 'priority' ? (
        <>
          {group(flagged(`High · ${sections.groups.high.length}`, 'high'), sections.groups.high.map(e => taskRow(e)), 'high', `High · ${sections.groups.high.length}`)}
          {group(flagged(`Medium · ${sections.groups.medium.length}`, 'medium'), sections.groups.medium.map(e => taskRow(e)), 'medium', `Medium · ${sections.groups.medium.length}`)}
          {group(flagged(`Low · ${sections.groups.low.length}`, 'low'), sections.groups.low.map(e => taskRow(e)), 'low', `Low · ${sections.groups.low.length}`)}
        </>
      ) : sections.flat.length > 0 && (
        <section className="wrSchedBacklogGroup" aria-label="Tasks">
          <h4 className="wrSchedSub">Tasks · {sections.flat.length}</h4>
          <div className="wrTaskList" ref={manual ? reorder.listRef : undefined}>
            {manual && <DragGap rect={reorder.gap} />}
            {sections.flat.map(e => (manual ? <div key={e.item.id} className={reorder.dragId === e.item.id ? 'wrTaskDragging' : undefined} {...reorder.item(e.item.id)}>{taskRow(e, { manual: true, overdue: false })}</div> : taskRow(e)))}
          </div>
        </section>
      )}
      {group('In range · low priority', sections.routines.inRange.map(r => routineRow(r, `${dayLabel(r.w.from)}-${dayLabel(r.w.to)}`)), 'inRange')}
      {group('Paused', sections.routines.paused.map(r => routineRow(r)), 'paused')}
      {comingUp.length > 0 && <details className="wrSchedBacklogGroup"><summary>Coming up ({comingUp.length})</summary>{comingUp.map(r => routineRow(r))}</details>}
      {filter.sort === 'priority' && none.length > 0 && (
        <section className="wrSchedBacklogGroup" aria-label="No priority">
          <button type="button" className="wrSchedFold" aria-expanded={noneOpen} onClick={() => setNoneToggle(!noneOpen)}>
            {noneOpen ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />} {PRIORITY_LABEL.none} priority · {none.length}
          </button>
          {noneOpen && none.map(e => taskRow(e))}
        </section>
      )}
      {sections.done.length > 0 && group(`Done · ${sections.done.length}`, sections.done.map(e => taskRow(e)), 'done')}
      {sections.empty && <p className="wrMuted">{search || filter.facet || filter.project ? 'Nothing matches.' : 'Nothing waiting. Add a task, or a routine that comes round on its own.'}</p>}

      <div className="wrSchedBacklogAdd">
        {multi && (
          <select className="wrField" aria-label="Add to" value={owner} onChange={e => onAddTo(e.target.value)}>{owners.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        )}
        <div className="wrKv">
          <input
            className="wrField" aria-label="New task" placeholder="Add a task…  try  Revise ch 3 !high ~2h fri @chapter 3" value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTask() }}
          />
          <IconBtn Icon={PlusIcon} label="Add task" onClick={addTask} disabled={!quick.label} />
        </div>
        {text.trim() && (quick.priority || quick.dueDate || quick.estimateMinutes || quick.target) && (
          <div className="wrQuickParse" aria-label="What the line says">
            {quick.priority && <span className={`wrPrioTitle wrPrioTitle--${quick.priority}`}>{PRIORITY_LABEL[quick.priority]}</span>}
            {quick.dueDate && <span className="wrTaskFact">due {quick.dueDate === today ? 'today' : dayLabel(quick.dueDate)}</span>}
            {quick.estimateMinutes && <span className="wrTaskFact">{formatEstimate(quick.estimateMinutes)}</span>}
            {quick.target && <span className="wrTaskFact">{quick.target.title}</span>}
          </div>
        )}
        <IconBtn Icon={RestoreIcon} label="Add a routine" aria-expanded={adding} onClick={() => setAdding(!adding)} />
        {adding && (
          <form className="wrSchedForm" aria-label="New routine" onSubmit={e => { e.preventDefault(); addRoutine() }}>
            <input className="wrField" aria-label="Routine" placeholder="Back up the project…" value={routineLabel} onChange={e => setRoutineLabel(e.target.value)} />
            <RepeatPicker value={routineRec ?? { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: today, until: null }} anchor={today} allowInterval label="Comes round" onChange={setRoutineRec} />
            <IconBtn type="submit" Icon={CheckIcon} label="Add routine" className="wrSmallBtn wrSmallBtn--accent" disabled={!routineLabel.trim()} />
          </form>
        )}
      </div>
    </div>
  )
}
