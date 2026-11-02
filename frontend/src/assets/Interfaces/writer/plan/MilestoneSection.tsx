import { useState, type DragEvent } from 'react'
import type { Milestone, Planner } from '../../../../lib/facets'
import { milestoneState, milestoneWork, type WorkEntry } from '../../../../lib/milestoneProgress'
import { MILESTONE_KIND_FIELDS, editMilestone } from '../../../../lib/phaseKinds'
import { deleteMilestone, nudgeMilestone, resetMilestone, setMilestoneDate, setMilestoneLength, toggleMilestonePin } from '../../../../lib/planActions'
import { tickMilestone } from '../../../../lib/planEdit'
import { DRAG_PLAN, type PlanDrag } from '../../../../lib/planDrop'
import { milestonesOf, moveMilestone, placeWork, type Moved, type WorkKind } from '../../../../lib/planSequence'
import { IconBtn } from '../schedule/IconBtn'
import { DRAG_ITEM } from '../schedule/TaskRow'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, GripIcon, LockIcon, PencilIcon, QueueIcon, ListIcon, RestoreIcon, TrashIcon, UnlockIcon, WrenchIcon } from '../../../icons'
import type { Projection } from '../../../../lib/planProjection'
import { OUTSIDE_ROW, beginSeqDrag, endSeqDrag, seqDrag } from './dragSeq'
import { ProjectionChip } from './ProjectionChip'

// A section of a phase: a milestone, a deliverable reached by finishing the work placed in it (tasks, processes, exercises, routines). It has its result, its date
// (the days it ends on, which flow from the order and the lengths until it is pinned) and the work in it, which can be dragged to another section of the same row.
// Work from the Work tile or the Backlog dropped on it is placed in it.

const KIND_ICON: Record<WorkKind, typeof ListIcon> = { task: ListIcon, process: QueueIcon, exercise: PencilIcon, routine: WrenchIcon }
const KIND_LABEL: Record<WorkKind, string> = { task: 'Task', process: 'Process', exercise: 'Exercise', routine: 'Routine' }
const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function WorkChip({ w, rowKey, from, onTake }: { w: WorkEntry; rowKey: string; from: string; onTake: () => void }) {
  const Icon = KIND_ICON[w.kind]
  return (
    <li className={`wrWorkChip${w.done ? ' wrWorkChip--done' : ''}`}>
      <span
        className="wrSchedGrip" draggable role="img" aria-label={`Drag ${w.label || KIND_LABEL[w.kind]} to another milestone of this row`} title="Drag to another milestone of this row"
        onDragStart={e => beginSeqDrag(e, { kind: 'work', id: w.id, rowKey, workKind: w.kind, from }, e.currentTarget.closest('li'))} onDragEnd={endSeqDrag}
      ><GripIcon size={20} /></span>
      <span aria-hidden="true"><Icon size={20} /></span>
      <span className="wrWorkChipLabel" title={KIND_LABEL[w.kind]}>{w.label || `Untitled ${KIND_LABEL[w.kind].toLowerCase()}`}</span>
      {w.done && <span role="img" aria-label="Done"><CheckIcon size={20} /></span>}
      <IconBtn Icon={TrashIcon} label={`Take ${w.label || KIND_LABEL[w.kind]} out of this milestone`} onClick={onTake} />
    </li>
  )
}

export function MilestoneSection({ planner, setPlanner, today, milestone: m, rowKey, ownerId, onRefuse, projection }: {
  planner: Planner
  setPlanner: (p: Planner) => void
  today: string
  milestone: Milestone
  rowKey: string
  ownerId: string
  onRefuse: (why: string) => void
  // When the work left in it would be done.
  projection?: Projection
}) {
  const [over, setOver] = useState<'ok' | 'refuse' | null>(null)
  const work = milestoneWork(planner, m.id)
  const state = milestoneState(planner, m.id)
  const siblings = m.phaseId ? milestonesOf(planner, m.phaseId) : []
  const at = siblings.findIndex(x => x.id === m.id)
  const name = m.title || 'Untitled milestone'
  const kind = planner.phaseKinds.find(k => k.id === planner.phases.find(p => p.id === m.phaseId)?.kindId)
  const own = kind && m.kindMilestoneId ? MILESTONE_KIND_FIELDS.filter(f => m.overrides.includes(f)) : []
  const apply = (r: Moved) => { if (r.ok) setPlanner(r.planner); else onRefuse(r.reason) }

  const accepts = (e: DragEvent): boolean => {
    const t = Array.from(e.dataTransfer.types)
    return !!seqDrag() || t.includes(DRAG_PLAN) || t.includes(DRAG_ITEM)
  }
  const dragOver = (e: DragEvent) => {
    if (!accepts(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const d = seqDrag()
    setOver(d && d.rowKey !== rowKey ? 'refuse' : 'ok')
  }
  const drop = (e: DragEvent) => {
    setOver(null)
    if (!accepts(e)) return
    e.preventDefault()
    e.stopPropagation()
    const d = seqDrag()
    endSeqDrag()
    if (d) {
      if (d.rowKey !== rowKey) { onRefuse(`${name} is on another row. ${OUTSIDE_ROW}`); return }
      if (d.kind === 'milestone' && m.phaseId && d.id !== m.id) apply(moveMilestone(planner, d.id, m.phaseId, at))
      else if (d.kind === 'work') apply(placeWork(planner, d.workKind, d.id, m.id, d.from))
      return
    }
    // From outside the plan: a card of the Work tile (a process, an exercise or a routine), or a task of the Backlog.
    const plan = e.dataTransfer.getData(DRAG_PLAN)
    if (plan) {
      try { const p = JSON.parse(plan) as PlanDrag; if (p.ownerId === ownerId) apply(placeWork(planner, p.kind, p.id, m.id)) } catch { /* not ours */ }
      return
    }
    const item = e.dataTransfer.getData(DRAG_ITEM)
    if (item) {
      try { const p = JSON.parse(item) as { ownerId: string; itemId: string }; if (p.ownerId === ownerId) apply(placeWork(planner, 'task', p.itemId, m.id)) } catch { /* not ours */ }
    }
  }

  return (
    <section
      className={`wrSection${state.achieved ? ' wrSection--achieved' : ''}${over ? ` wrSection--${over}` : ''}`} aria-label={`Milestone ${name}`} data-milestone={m.id}
      onDragOver={dragOver} onDragLeave={() => setOver(null)} onDrop={drop}
    >
      <div className="wrSectionHead">
        <span
          className="wrSchedGrip" draggable role="img" aria-label={`Drag ${name} to reorder it within this row`} title="Drag to reorder, within this row"
          onDragStart={e => beginSeqDrag(e, { kind: 'milestone', id: m.id, rowKey }, e.currentTarget.closest('section'))} onDragEnd={endSeqDrag}
        ><GripIcon size={20} /></span>
        <input type="checkbox" checked={state.achieved} aria-label={`${name} achieved`} title={state.total > 0 ? 'Achieved when all its work is done; tick it to say so yourself' : 'Tick when it is achieved'} onChange={e => setPlanner(tickMilestone(planner, m.id, e.target.checked, today))} />
        <input className="wrField" aria-label="Milestone title" placeholder="Milestone" value={m.title} onChange={e => setPlanner(editMilestone(planner, m.id, { title: e.target.value }))} />
        {m.date && <small className="wrMuted" title="The day it ends on">{dayLabel(m.date)}</small>}
        <IconBtn Icon={ChevronLeftIcon} label={`Move ${name} earlier`} disabled={at <= 0} onClick={() => apply(nudgeMilestone(planner, m.id, -1))} />
        <IconBtn Icon={ChevronRightIcon} label={`Move ${name} later`} disabled={at < 0 || at >= siblings.length - 1} onClick={() => apply(nudgeMilestone(planner, m.id, 1))} />
        {own.map(f => <IconBtn key={f} Icon={RestoreIcon} label={`Reset the ${f === 'lengthDays' ? 'length' : f} of ${name} to ${kind?.title}`} onClick={() => setPlanner(resetMilestone(planner, m.id, f, today))} />)}
        <IconBtn Icon={TrashIcon} label={`Delete ${name}`} onClick={() => setPlanner(deleteMilestone(planner, m.id, today))} />
      </div>
      <div className="wrSectionBody">
        <input className="wrField" aria-label="Milestone result" placeholder="What it delivers…" maxLength={1000} value={m.result} onChange={e => setPlanner(editMilestone(planner, m.id, { result: e.target.value }))} />
        <div className="wrTaskGrid">
          <label>Days
            <input className="wrField wrSchedNum" type="number" min={1} max={3650} placeholder="share" aria-label={`${name} length in days`} disabled={m.fixed} value={m.lengthDays ?? ''} onChange={e => setPlanner(setMilestoneLength(planner, m.id, e.target.value === '' ? null : Number(e.target.value), today))} />
          </label>
          <label>Ends
            <span className="wrSectionDate">
              <input className="wrField" type="date" aria-label={`${name} date`} value={m.date ?? ''} onChange={e => setPlanner(setMilestoneDate(planner, m.id, e.target.value || null, today))} />
              <IconBtn Icon={m.fixed ? LockIcon : UnlockIcon} label={m.fixed ? `Let ${name} flow with the sequence` : `Pin ${name} to its date`} aria-pressed={m.fixed} disabled={!m.fixed && !m.date} onClick={() => setPlanner(toggleMilestonePin(planner, m.id, today))} />
            </span>
          </label>
        </div>
        {work.length > 0 ? (
          <ul className="wrWorkChips" aria-label={`Work in ${name}`}>
            {work.map(w => <WorkChip key={`${w.kind}:${w.id}`} w={w} rowKey={rowKey} from={m.id} onTake={() => apply(placeWork(planner, w.kind, w.id, null, m.id))} />)}
          </ul>
        ) : <p className="wrHint">Drag processes, exercises, routines or tasks here, or place them from the Work tile.</p>}
        <ProjectionChip p={projection} />
        {state.total > 0 && <span className="wrTaskBar" role="progressbar" aria-label={`${name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((state.done / state.total) * 100)}><i style={{ width: `${(state.done / state.total) * 100}%` }} /></span>}
      </div>
    </section>
  )
}

