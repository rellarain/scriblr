import { useState, type DragEvent } from 'react'
import { PHASE_STATUSES, PHASE_STATUS_LABEL, type Phase, type PhaseStatus, type Planner } from '../../../../lib/facets'
import { PHASE_KIND_FIELDS, applyToRows, editPhase, kindFromPhase, repeatPhase } from '../../../../lib/phaseKinds'
import { phaseProgress } from '../../../../lib/phaseProgress'
import { addMilestone, deletePhase, resetPhase, setPhaseLength, setPhaseStart, togglePhasePin } from '../../../../lib/planActions'
import { rowsBelow, type PlanRow } from '../../../../lib/planRows'
import { milestonesOf, moveMilestone, movePhase, phasesOnRowIndex } from '../../../../lib/planSequence'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { ArcIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, FlagIcon, GripIcon, LockIcon, RestoreIcon, StackIcon, TrashIcon, UnlockIcon } from '../../../icons'
import { OUTSIDE_ROW, beginSeqDrag, endSeqDrag, seqDrag } from './dragSeq'
import { MilestoneSection } from './MilestoneSection'

// A phase on a row: a card with its title, how far it is and its dates, which opens to be edited (its result, status, length, start) and holds its sections, the
// milestones that are reached by the work placed in them. Drag it by its grip to put it in another place in its row; a section dropped on it goes last in it.

const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const range = (p: Phase): string => (p.start && p.end ? `${dayLabel(p.start)} to ${dayLabel(p.end)}` : p.start ? `from ${dayLabel(p.start)}` : 'no dates')

const FIELD_NAME: Record<string, string> = { title: 'title', result: 'result', description: 'description', lengthDays: 'length' }

export function PhaseCard({ planner, setPlanner, today, phase, metGoals, rowKey, rows, ownerId, passNo, open, onOpen, showSections, onRefuse }: {
  planner: Planner
  setPlanner: (p: Planner) => void
  today: string
  phase: Phase
  metGoals: ReadonlySet<string>
  rowKey: string
  // Every row of the plan, for the rows this phase can be applied to.
  rows: PlanRow[]
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
  const [applying, setApplying] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([])
  const prog = phaseProgress(planner, phase.id, metGoals)
  const sections = milestonesOf(planner, phase.id)
  const kind = planner.phaseKinds.find(k => k.id === phase.kindId)
  const title = phase.title || 'Untitled phase'
  const patch = (change: Partial<Phase>) => setPlanner(editPhase(planner, phase.id, change))
  // The rows under this phase's row that it can be stamped onto (a project phase: the books and the chapters; a book phase: its chapters), without the ones that have a phase of this name already.
  const targets = phase.level === 'chapter' ? [] : (['book', 'chapter'] as const).flatMap(l => rowsBelow(rows, rowKey, l))
  const has = (row: PlanRow) => planner.phases.some(p => p.title === phase.title && (row.level === 'project' ? p.level === 'project' : p.level === row.level && p.nodeId === row.nodeId))
  const chosen = targets.filter(r => !skipped.includes(r.key) && !has(r))
  const apply = () => {
    setPlanner(applyToRows(planner, phase.id, chosen, newId, today))
    onRefuse(`${title} was applied to ${chosen.length} ${chosen.length === 1 ? 'row' : 'rows'}.`)
    setApplying(false)
  }
  const keep = () => { const r = kindFromPhase(planner, phase.id, newId); if (r) { setPlanner(r.planner); onRefuse(`${title} is kept as a kind. Add a pass of it to any row.`) } }

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
          {kind && (
            <div className="wrKindNote">
              <p className="wrHint">A pass of {kind.title}{passNo ? `, number ${passNo}` : ''}. It follows the kind in what it has not changed itself.</p>
              {PHASE_KIND_FIELDS.filter(f => phase.overrides.includes(f)).map(f => (
                <IconBtn key={f} Icon={RestoreIcon} label={`Reset the ${FIELD_NAME[f]} of ${title} to ${kind.title}`} onClick={() => setPlanner(resetPhase(planner, phase.id, f, today))} />
              ))}
            </div>
          )}
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
            <IconBtn Icon={CopyIcon} label={`Repeat ${title}`} title="Repeat: the same phase again, next in this row" onClick={() => setPlanner(repeatPhase(planner, phase.id, newId, today))} />
            {targets.length > 0 && <IconBtn Icon={StackIcon} label={`Apply ${title} to other rows`} aria-pressed={applying} title="Apply to the books or chapters under this row" onClick={() => setApplying(a => !a)} />}
            {!kind && <IconBtn Icon={BookmarkIcon} label={`Keep ${title} as a kind`} title="Keep as a kind: a recipe to add passes of" onClick={keep} />}
            <IconBtn Icon={TrashIcon} label={`Delete ${title}`} onClick={() => setPlanner(deletePhase(planner, phase.id, today))} />
          </div>
          {applying && (
            <fieldset className="wrApply">
              <legend>Apply {title} to</legend>
              {targets.map(r => {
                const there = has(r)
                return (
                  <label key={r.key} className="wrPickerItem">
                    <input type="checkbox" checked={!there && !skipped.includes(r.key)} disabled={there} onChange={e => setSkipped(e.target.checked ? skipped.filter(k => k !== r.key) : [...skipped, r.key])} />
                    <span>{r.title}{there ? ' (has one)' : ''}</span>
                  </label>
                )
              })}
              <IconBtn Icon={CheckIcon} label={`Apply ${title} to the checked rows`} className="wrSmallBtn wrSmallBtn--accent" disabled={chosen.length === 0} onClick={apply} />
            </fieldset>
          )}
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
