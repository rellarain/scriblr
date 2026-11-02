import { useState, type DragEvent, type HTMLAttributes, type ReactNode } from 'react'
import { FACETS, FACET_LABEL, PRIORITIES, PRIORITY_LABEL, type Facet, type Phase, type PlanItem, type TaskPriority } from '../../../../lib/facets'
import { formatEstimate, type QuickTarget } from '../../../../lib/quickAdd'
import type { Progress } from '../../../../lib/taskProgress'
import { newId } from './ids'
import { IconBtn } from './IconBtn'
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, FlagIcon, GripIcon, LinkIcon, PlusIcon, TrashIcon } from '../../../icons'

// One task of the Backlog: a line (the priority marker, a tick, the label with what is known about it, a grip) that opens in place into its details
// (notes, subtasks, an estimate, a due day, the priority, the facet and the node it is about). Every change is made at once.

export const DRAG_ITEM = 'application/x-scriblr-item'
const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export interface TaskRowProps {
  ownerId: string
  item: PlanItem
  today: string
  // Done for today: ticked on a shift, or done (a task of the backlog).
  done: boolean
  overdue?: boolean
  // Where it is from (a project's name), shown when more than one is listed, with the project's colour where there is one.
  from?: string
  fromColor?: string
  // Where it sits today ("Morning draft"), for a task on today's shift.
  onShift?: string
  running?: boolean
  progress: Progress | null
  targets: QuickTarget[]
  // The linked node's name, if it is known.
  nodeTitle?: string
  open: boolean
  onOpen: (open: boolean) => void
  onChange: (patch: Partial<PlanItem>) => void
  onTick: (on: boolean) => void
  onDelete: () => void
  onOpenNode?: (tree: 'outline' | 'plot', id: string) => void
  // The grip that reorders (a manual sort) and the one that carries the task to a shift are different: this is the first.
  reorderGrip?: HTMLAttributes<HTMLElement>
  // The task can be dragged onto a shift (a task that is not on one yet).
  placeable?: boolean
  // A step that follows another, which is not done yet: it cannot be ticked.
  locked?: boolean
  // The phase the task builds to: its name beside the task, and the phases to choose from when it is opened.
  phaseTitle?: string
  phases?: Phase[]
}

function PriorityMark({ value, name, onPick }: { value: TaskPriority; name: string; onPick: (p: TaskPriority) => void }) {
  const [choosing, setChoosing] = useState(false)
  if (!choosing) {
    return (
      <button type="button" className={`wrPrio wrPrio--${value}`} aria-label={`${name}: ${PRIORITY_LABEL[value]} priority (change)`} title={`${PRIORITY_LABEL[value]} priority`} aria-expanded={false} onClick={() => setChoosing(true)}>
        <FlagIcon size={20} />
      </button>
    )
  }
  return (
    <div className="wrPrioPick" role="radiogroup" aria-label={`${name} priority`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setChoosing(false) } }} onMouseLeave={() => setChoosing(false)}>
      {PRIORITIES.map(p => (
        <button key={p} type="button" role="radio" aria-checked={p === value} className={`wrPrio wrPrio--${p}${p === value ? ' wrPrio--on' : ''}`} autoFocus={p === value} onClick={() => { setChoosing(false); onPick(p) }}>{PRIORITY_LABEL[p]}</button>
      ))}
    </div>
  )
}

export function TaskRow(p: TaskRowProps) {
  const { item, today, open } = p
  const [sub, setSub] = useState('')
  const subs = item.subtasks
  const patchSub = (id: string, patch: Partial<{ label: string; done: boolean }>) => p.onChange({ subtasks: subs.map(s => (s.id === id ? { ...s, ...patch } : s)) })
  const addSub = () => {
    const label = sub.trim()
    if (!label) return
    p.onChange({ subtasks: [...subs, { id: newId('sub'), label, done: false }] })
    setSub('')
  }
  const drag = (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.setData(DRAG_ITEM, JSON.stringify({ ownerId: p.ownerId, itemId: item.id }))
    e.dataTransfer.effectAllowed = 'move'
    const row = (e.currentTarget as HTMLElement).closest('.wrSchedTask')
    if (row) e.dataTransfer.setDragImage(row, 12, 12)
  }
  const facts: ReactNode[] = []
  if (p.overdue) facts.push(<span key="late" className="wrSchedTag wrSchedTag--priority">Overdue</span>)
  if (item.carried) facts.push(<span key="carried" className="wrSchedTag">Carried</span>)
  if (item.dueDate) facts.push(<span key="due" className="wrTaskFact" title="Due">due {item.dueDate === today ? 'today' : dayLabel(item.dueDate)}</span>)
  if (item.estimateMinutes) facts.push(<span key="est" className="wrTaskFact" title="Estimate">{formatEstimate(item.estimateMinutes)}</span>)
  if (p.phaseTitle) facts.push(<span key="phase" className="wrTaskFact" title="Phase">{p.phaseTitle}</span>)
  if (p.onShift) facts.push(<span key="shift" className="wrTaskFact">{p.running ? 'now · ' : ''}{p.onShift}</span>)
  if (p.from) facts.push(<span key="from" className="wrTaskFact">{p.fromColor && <i className="wrSchedDot" style={{ background: p.fromColor }} />}{p.from}</span>)

  return (
    <div className={`wrSchedTask${open ? ' wrSchedTask--open' : ''}${p.done ? ' wrSchedTask--done' : ''}${p.overdue ? ' wrSchedTask--overdue' : ''}${p.running ? ' wrSchedTask--running' : ''}`}>
      <div className="wrTaskLine">
        <PriorityMark value={item.priority} name={item.label} onPick={priority => p.onChange({ priority })} />
        <input type="checkbox" checked={p.done} aria-label={item.label} disabled={p.locked} title={p.locked ? 'Do the step before it first' : undefined} onChange={e => p.onTick(e.target.checked)} />
        <button type="button" className="wrTaskMain" aria-expanded={open} aria-label={`${item.label} details`} onClick={() => p.onOpen(!open)}>
          <b>{item.label}</b>
          {(facts.length > 0 || item.facet || item.targetNodeId || p.progress) && (
            <small>
              {item.facet && <i className="wrSchedDot" style={{ background: `var(--wr-f-${item.facet})` }} title={FACET_LABEL[item.facet]} />}
              {facts}
              {item.targetNodeId && p.nodeTitle && <span className="wrTaskFact" title="About">{p.nodeTitle}</span>}
              {p.progress && <span className="wrTaskFact" title="Progress">{p.progress.done}/{p.progress.total}</span>}
            </small>
          )}
          {p.progress && <span className="wrTaskBar" role="progressbar" aria-label={`${item.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress.pct * 100)}><i style={{ width: `${p.progress.pct * 100}%` }} /></span>}
        </button>
        {p.reorderGrip && <span className="wrSchedGrip" role="button" tabIndex={0} aria-label={`Move ${item.label} (Alt+Up or Down)`} title="Reorder" {...p.reorderGrip}><GripIcon size={20} /></span>}
        {p.placeable && <span className="wrSchedGrip" draggable onDragStart={drag} role="img" aria-label={`Drag ${item.label} onto a shift`} title="Drag onto a shift"><GripIcon size={20} /></span>}
        <span className="wrTaskChevron" aria-hidden="true">{open ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}</span>
      </div>
      {open && (
        <div className="wrTaskDetail">
          <input className="wrField" aria-label="Task" value={item.label} onChange={e => p.onChange({ label: e.target.value })} onBlur={() => { if (!item.label.trim()) p.onChange({ label: 'Untitled task' }) }} />
          <textarea className="wrField" aria-label="Notes" placeholder="Notes…" rows={2} maxLength={2000} value={item.notes} onChange={e => p.onChange({ notes: e.target.value })} />
          <div className="wrTaskGrid">
            <label>Priority
              <select className="wrField" value={item.priority} onChange={e => p.onChange({ priority: e.target.value as TaskPriority })}>
                {PRIORITIES.map(x => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
              </select>
            </label>
            <label>Due
              <span className="wrTaskInline">
                <input className="wrField" type="date" value={item.dueDate ?? ''} onChange={e => p.onChange({ dueDate: e.target.value || null })} />
                {item.dueDate && <IconBtn Icon={CloseIcon} label="Clear the due day" onClick={() => p.onChange({ dueDate: null })} />}
              </span>
            </label>
            <label>Estimate (minutes)
              <input className="wrField" type="number" min={1} max={1440} placeholder="none" value={item.estimateMinutes ?? ''} onChange={e => p.onChange({ estimateMinutes: e.target.value ? Math.min(1440, Math.max(1, Math.floor(Number(e.target.value)) || 1)) : null })} />
            </label>
            <label>About
              <select className="wrField" value={item.facet ?? ''} onChange={e => p.onChange({ facet: (e.target.value || null) as Facet | null })}>
                <option value="">Anything</option>
                {FACETS.map(f => <option key={f} value={f}>{FACET_LABEL[f]}</option>)}
              </select>
            </label>
          </div>
          {p.phases && p.phases.length > 0 && (
            <div className="wrTaskGrid">
              <label>Phase
                <select className="wrField" value={item.phaseId && p.phases.some(x => x.id === item.phaseId) ? item.phaseId : ''} onChange={e => p.onChange({ phaseId: e.target.value || null })}>
                  <option value="">No phase</option>
                  {p.phases.map(x => <option key={x.id} value={x.id}>{x.title || 'Untitled phase'}</option>)}
                </select>
              </label>
            </div>
          )}
          {p.targets.length > 0 && (
            <div className="wrTaskGrid">
              <label>Node
                <select
                  className="wrField" value={item.targetNodeId ?? ''}
                  onChange={e => { const t = p.targets.find(x => x.id === e.target.value); p.onChange({ targetNodeId: t?.id ?? null, targetTree: t?.tree ?? null, aim: t ? item.aim : null }) }}
                >
                  <option value="">None</option>
                  {p.targets.map(t => <option key={t.id} value={t.id}>{t.title} ({t.kind})</option>)}
                </select>
              </label>
              {item.targetNodeId && (
                <label>Aim (words or nodes from now)
                  <input className="wrField" type="number" min={1} placeholder="none" value={item.aim ?? ''} onChange={e => p.onChange({ aim: e.target.value ? Math.max(1, Math.floor(Number(e.target.value)) || 1) : null, addedOn: item.addedOn ?? today })} />
                </label>
              )}
            </div>
          )}
          {item.targetNodeId && item.targetTree && p.onOpenNode && (
            <button type="button" className="wrSmallBtn wrTaskNode" onClick={() => p.onOpenNode?.(item.targetTree as 'outline' | 'plot', item.targetNodeId as string)}><LinkIcon size={20} /> Open {p.nodeTitle ?? 'the node'}</button>
          )}
          <div className="wrTaskSubs">
            <span className="wrLabel">Subtasks{subs.length > 0 ? ` · ${subs.filter(s => s.done).length}/${subs.length}` : ''}</span>
            {subs.map(s => (
              <div className="wrTaskSub" key={s.id}>
                <input type="checkbox" checked={s.done} aria-label={s.label} onChange={e => patchSub(s.id, { done: e.target.checked })} />
                <input className="wrField" aria-label={`Subtask ${s.label}`} value={s.label} onChange={e => patchSub(s.id, { label: e.target.value })} />
                <IconBtn Icon={CloseIcon} label={`Remove ${s.label}`} onClick={() => p.onChange({ subtasks: subs.filter(x => x.id !== s.id) })} />
              </div>
            ))}
            <div className="wrTaskSub">
              <input className="wrField" aria-label="New subtask" placeholder="Add a subtask…" value={sub} onChange={e => setSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSub() }} />
              <IconBtn Icon={PlusIcon} label="Add subtask" onClick={addSub} disabled={!sub.trim()} />
            </div>
          </div>
          <div className="wrTaskActions">
            <IconBtn Icon={TrashIcon} label={`Delete ${item.label}`} onClick={p.onDelete} />
          </div>
        </div>
      )}
    </div>
  )
}
