import { useState, type DragEvent } from 'react'
import { PHASE_STATUSES, PHASE_STATUS_LABEL, type Phase, type PhaseStatus, type Planner } from '../../../../lib/facets'
import { editPhase } from '../../../../lib/phaseKinds'
import { phaseProgress } from '../../../../lib/phaseProgress'
import { addMilestone, deletePhase, setPhaseLength, setPhaseStart, togglePhasePin } from '../../../../lib/planActions'
import { milestonesOf, moveMilestone, movePhase, phasesOnRowIndex } from '../../../../lib/planSequence'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { ArcIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, FlagIcon, GripIcon, LockIcon, TrashIcon, UnlockIcon } from '../../../icons'
import { OUTSIDE_ROW, beginSeqDrag, endSeqDrag, seqDrag } from './dragSeq'
import { MilestoneSection } from './MilestoneSection'

// A phase on a row: a card with its title, how far it is and its dates, which opens to be edited (its result, status, length, start) and holds its sections, the
// milestones that are reached by the work placed in them. Drag it by its grip to put it in another place in its row; a section dropped on it goes last in it.

const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const range = (p: Phase): string => (p.start && p.end ? `${dayLabel(p.start)} to ${dayLabel(p.end)}` : p.start ? `from ${dayLabel(p.start)}` : 'no dates')

export function PhaseCard({ planner, setPlanner, today, phase, metGoals, rowKey, ownerId, passNo, open, onOpen, showSections, onRefuse }: {
  planner: Planner
  setPlanner: (p: Planner) => void
  today: string
  phase: Phase
  metGoals: ReadonlySet<string>
  rowKey: string
  ownerId: string
  // "Revision 2": the pass number among the phases of its kind on its row.
  passNo?: number
  open: boolean
  onOpen: (open: boolean) => void
  // The sections are always shown (the Sequence view), or only while the card is open.
  showSections: boolean
  onRefuse: (why: string) => void
}) {
  const [over, setOver] = useState<'ok' | 'refuse' | null>(null)
  const prog = phaseProgress(planner, phase.id, metGoals)
  const sections = milestonesOf(planner, phase.id)
  const kind = planner.phaseKinds.find(k => k.id === phase.kindId)
  const title = phase.title || 'Untitled phase'
  const patch = (change: Partial<Phase>) => setPlanner(editPhase(planner, phase.id, change))

  const dragOver = (e: DragEvent) => {
    const d = seqDrag()
    if (!d || (d.kind !== 'phase' && d.kind !== 'milestone')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOver(d.rowKey === rowKey ? 'ok' : 'refuse')
  }
  const drop = (e: DragEvent) => {
    setOver(null)
    const d = seqDrag()
    if (!d || (d.kind !== 'phase' && d.kind !== 'milestone')) return
    e.preventDefault()
    e.stopPropagation()
    endSeqDrag()
    if (d.rowKey !== rowKey) { onRefuse(`${title} is on another row. ${OUTSIDE_ROW}`); return }
    const r = d.kind === 'phase' ? (d.id === phase.id ? { ok: true as const, planner } : movePhase(planner, d.id, phasesOnRowIndex(planner, phase.id))) : moveMilestone(planner, d.id, phase.id, sections.length)
    if (r.ok) setPlanner(r.planner); else onRefuse(r.reason)
  }

  return (
    <section
      className={`wrPlanCard wrPhaseCard wrPlanCard--${phase.status}${open ? ' wrPlanCard--open' : ''}${over ? ` wrPhaseCard--${over}` : ''}`} aria-label={title} data-phase={phase.id}
      onDragOver={dragOver} onDragLeave={() => setOver(null)} onDrop={drop}
    >
      <div className="wrPlanTop">
        <span
          className="wrSchedGrip" draggable role="img" aria-label={`Drag ${title} to reorder it within this row`} title="Drag to reorder, within this row"
          onDragStart={e => beginSeqDrag(e, { kind: 'phase', id: phase.id, rowKey }, e.currentTarget.closest('section'))} onDragEnd={endSeqDrag}
        ><GripIcon size={20} /></span>
        <button type="button" className="wrPlanHead" aria-expanded={open} aria-label={`${title} details`} onClick={() => onOpen(!open)}>
          <ArcIcon size={20} />
          <span className="wrPlanTitle"><b>{title}{kind && passNo ? ` · ${passNo}` : ''}</b><small>{phase.result || range(phase)}</small></span>
          <span className={`wrSchedTag wrPlanStatus wrPlanStatus--${phase.status}`}>{PHASE_STATUS_LABEL[phase.status]}</span>
          {prog.pct !== null && <span className="wrPlanPct" title={`${prog.done} of ${prog.total} done`}>{prog.pct}%</span>}
          {open ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}
        </button>
      </div>
      {prog.pct !== null && <span className="wrTaskBar" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.pct}><i style={{ width: `${prog.pct}%` }} /></span>}
      {open && (
        <div className="wrPlanBody">
          {kind && <p className="wrHint">A pass of {kind.title}{passNo ? `, number ${passNo}` : ''}.{phase.overrides.length > 0 ? ` Changed on its own: ${phase.overrides.join(', ')}.` : ''}</p>}
          <input className="wrField" aria-label="Phase title" value={phase.title} onChange={e => patch({ title: e.target.value })} />
          <textarea className="wrField" aria-label="Result" placeholder="The result this phase builds to…" rows={2} maxLength={1000} value={phase.result} onChange={e => patch({ result: e.target.value })} />
          <textarea className="wrField" aria-label="Description" placeholder="Description…" rows={2} maxLength={2000} value={phase.description} onChange={e => patch({ description: e.target.value })} />
          <div className="wrChoice" role="radiogroup" aria-label="Status">
            {PHASE_STATUSES.map(s => <button key={s} type="button" role="radio" aria-checked={phase.status === s} className={phase.status === s ? 'on' : ''} onClick={() => patch({ status: s as PhaseStatus })}>{PHASE_STATUS_LABEL[s]}</button>)}
          </div>
          <div className="wrTaskGrid">
            <label>Starts
              <span className="wrSectionDate">
                <input className="wrField" type="date" aria-label="Phase starts" value={phase.start ?? ''} onChange={e => e.target.value && setPlanner(setPhaseStart(planner, phase.id, e.target.value, today))} />
                <IconBtn Icon={phase.fixed ? LockIcon : UnlockIcon} label={phase.fixed ? `Let ${title} flow with the sequence` : `Pin ${title} to its start`} aria-pressed={phase.fixed} disabled={!phase.fixed && !phase.start} onClick={() => setPlanner(togglePhasePin(planner, phase.id, today))} />
              </span>
            </label>
            <label>Days
              <input className="wrField wrSchedNum" type="number" min={1} max={3650} aria-label="Phase length in days" value={phase.lengthDays ?? ''} onChange={e => e.target.value && setPlanner(setPhaseLength(planner, phase.id, Number(e.target.value), today))} />
            </label>
          </div>
          {prog.total > 0 && <p className="wrHint">{prog.done} of {prog.total} done: {prog.tasks[0]}/{prog.tasks[1]} work, {prog.milestones[0]}/{prog.milestones[1]} milestones, {prog.goals[0]}/{prog.goals[1]} goals.</p>}
          <div className="wrSchedFormActions">
            {prog.pct === 100 && phase.status !== 'done' && <IconBtn Icon={CheckIcon} label="Mark the phase done" className="wrSmallBtn wrSmallBtn--accent" onClick={() => patch({ status: 'done' })} />}
            <IconBtn Icon={TrashIcon} label={`Delete ${title}`} onClick={() => setPlanner(deletePhase(planner, phase.id, today))} />
          </div>
        </div>
      )}
      {(open || showSections) && (
        <div className="wrSections">
          {sections.map(m => <MilestoneSection key={m.id} planner={planner} setPlanner={setPlanner} today={today} milestone={m} rowKey={rowKey} ownerId={ownerId} onRefuse={onRefuse} />)}
          <IconBtn Icon={FlagIcon} label={`New milestone on ${title}`} onClick={() => setPlanner(addMilestone(planner, phase.id, 'New milestone', today, newId).planner)} />
        </div>
      )}
    </section>
  )
}
