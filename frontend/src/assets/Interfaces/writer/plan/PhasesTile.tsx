import { useState } from 'react'
import { PHASE_STATUSES, PHASE_STATUS_LABEL, newMilestone, newPhase, type Milestone, type Phase, type PhaseStatus, type Planner } from '../../../../lib/facets'
import { removeMilestone, removePhase, tickMilestone } from '../../../../lib/planEdit'
import { phaseProgress } from '../../../../lib/phaseProgress'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { ArcIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, FlagIcon, PlusIcon, TrashIcon } from '../../../icons'
import { PhaseSelect } from './fields'

// The Phases tile: each phase is a stage of the project, defined by the result it builds to, with a status, dates, and the milestones along it. A phase shows
// how far it is (what is tagged with it, done over all: tasks, milestones and goals) and opens in place to be edited; every change is made at once.

const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const range = (p: Phase): string => (p.start && p.end ? `${dayLabel(p.start)} to ${dayLabel(p.end)}` : p.start ? `from ${dayLabel(p.start)}` : p.end ? `until ${dayLabel(p.end)}` : 'no dates')

function MilestoneRow({ m, phases, today, onChange, onTick, onDelete, showPhase }: {
  m: Milestone; phases: Phase[]; today: string; showPhase: boolean
  onChange: (patch: Partial<Milestone>) => void; onTick: (on: boolean) => void; onDelete: () => void
}) {
  return (
    <div className="wrPlanMilestone">
      <input type="checkbox" checked={m.done} aria-label={`${m.title || 'Milestone'} done`} onChange={e => onTick(e.target.checked)} />
      <input className="wrField" aria-label="Milestone title" placeholder="Milestone" value={m.title} onChange={e => onChange({ title: e.target.value })} />
      <input className="wrField" type="date" aria-label={`${m.title || 'Milestone'} date`} value={m.date ?? ''} onChange={e => onChange({ date: e.target.value || null })} />
      {showPhase && <PhaseSelect label={`Phase of ${m.title || 'milestone'}`} phases={phases} value={m.phaseId} onChange={phaseId => onChange({ phaseId })} />}
      {m.done && m.doneOn && <small className="wrMuted" title="Done on">{m.doneOn === today ? 'today' : dayLabel(m.doneOn)}</small>}
      <IconBtn Icon={TrashIcon} label={`Delete ${m.title || 'milestone'}`} onClick={onDelete} />
    </div>
  )
}

export function PhasesTile({ planner, setPlanner, today, metGoals }: { planner: Planner; setPlanner: (p: Planner) => void; today: string; metGoals: ReadonlySet<string> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const phaseOf = (id: string) => planner.phases.find(p => p.id === id)
  const patchPhase = (id: string, patch: Partial<Phase>) => setPlanner({ ...planner, phases: planner.phases.map(p => (p.id === id ? { ...p, ...patch } : p)) })
  const patchMilestone = (id: string, patch: Partial<Milestone>) => setPlanner({ ...planner, milestones: planner.milestones.map(m => (m.id === id ? { ...m, ...patch } : m)) })
  const addPhase = () => {
    const phase = newPhase(newId('phase'), 'New phase', { status: planner.phases.length === 0 ? 'active' : 'planned' })
    setPlanner({ ...planner, phases: [...planner.phases, phase] })
    setOpenId(phase.id)
  }
  const addMilestone = (phaseId: string | null) => setPlanner({ ...planner, milestones: [...planner.milestones, newMilestone(newId('ms'), 'New milestone', { phaseId })] })
  const milestoneRow = (m: Milestone, showPhase: boolean) => (
    <MilestoneRow
      key={m.id} m={m} phases={planner.phases} today={today} showPhase={showPhase} onChange={patch => patchMilestone(m.id, patch)}
      onTick={on => setPlanner(tickMilestone(planner, m.id, on, today))} onDelete={() => setPlanner(removeMilestone(planner, m.id))}
    />
  )
  const loose = planner.milestones.filter(m => !m.phaseId || !phaseOf(m.phaseId))

  return (
    <div className="wrSchedCard wrPhases">
      <div className="wrSchedHead">
        <span className="wrSchedSpacer" />
        <IconBtn Icon={FlagIcon} label="New milestone" onClick={() => addMilestone(null)} />
        <IconBtn Icon={PlusIcon} label="New phase" className="wrSmallBtn wrSmallBtn--accent" onClick={addPhase} />
      </div>
      {planner.phases.length === 0 && <p className="wrMuted">No phases yet. A phase is a stage of the project, defined by the result it builds to; the routines, processes, tasks and goals that build to it are tagged with it.</p>}
      {planner.phases.map(ph => {
        const prog = phaseProgress(planner, ph.id, metGoals)
        const open = openId === ph.id
        const mine = planner.milestones.filter(m => m.phaseId === ph.id)
        return (
          <section key={ph.id} className={`wrPlanCard wrPlanCard--${ph.status}${open ? ' wrPlanCard--open' : ''}`} aria-label={ph.title || 'Untitled phase'}>
            <button type="button" className="wrPlanHead" aria-expanded={open} aria-label={`${ph.title || 'Untitled phase'} details`} onClick={() => setOpenId(open ? null : ph.id)}>
              <ArcIcon size={20} />
              <span className="wrPlanTitle"><b>{ph.title || 'Untitled phase'}</b><small>{ph.result || range(ph)}</small></span>
              <span className={`wrSchedTag wrPlanStatus wrPlanStatus--${ph.status}`}>{PHASE_STATUS_LABEL[ph.status]}</span>
              {prog.pct !== null && <span className="wrPlanPct" title={`${prog.done} of ${prog.total} done`}>{prog.pct}%</span>}
              {open ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}
            </button>
            {prog.pct !== null && <span className="wrTaskBar" role="progressbar" aria-label={`${ph.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.pct}><i style={{ width: `${prog.pct}%` }} /></span>}
            {open && (
              <div className="wrPlanBody">
                <input className="wrField" aria-label="Phase title" value={ph.title} onChange={e => patchPhase(ph.id, { title: e.target.value })} />
                <textarea className="wrField" aria-label="Result" placeholder="The result this phase builds to…" rows={2} maxLength={1000} value={ph.result} onChange={e => patchPhase(ph.id, { result: e.target.value })} />
                <textarea className="wrField" aria-label="Description" placeholder="Description…" rows={2} maxLength={2000} value={ph.description} onChange={e => patchPhase(ph.id, { description: e.target.value })} />
                <div className="wrChoice" role="radiogroup" aria-label="Status">
                  {PHASE_STATUSES.map(s => <button key={s} type="button" role="radio" aria-checked={ph.status === s} className={ph.status === s ? 'on' : ''} onClick={() => patchPhase(ph.id, { status: s as PhaseStatus })}>{PHASE_STATUS_LABEL[s]}</button>)}
                </div>
                <div className="wrTaskGrid">
                  <label>Starts<input className="wrField" type="date" aria-label="Phase starts" value={ph.start ?? ''} onChange={e => patchPhase(ph.id, { start: e.target.value || null })} /></label>
                  <label>Ends<input className="wrField" type="date" aria-label="Phase ends" value={ph.end ?? ''} min={ph.start ?? undefined} onChange={e => patchPhase(ph.id, { end: e.target.value || null })} /></label>
                </div>
                <div className="wrPlanMilestones">
                  <span className="wrLabel">Milestones{mine.length > 0 ? ` · ${mine.filter(m => m.done).length}/${mine.length}` : ''}</span>
                  {mine.map(m => milestoneRow(m, false))}
                  <IconBtn Icon={PlusIcon} label={`New milestone on ${ph.title || 'the phase'}`} onClick={() => addMilestone(ph.id)} />
                </div>
                {prog.total > 0 && <p className="wrHint">{prog.done} of {prog.total} done: {prog.tasks[0]}/{prog.tasks[1]} tasks, {prog.milestones[0]}/{prog.milestones[1]} milestones, {prog.goals[0]}/{prog.goals[1]} goals.</p>}
                <div className="wrSchedFormActions">
                  {prog.pct === 100 && ph.status !== 'done' && <IconBtn Icon={CheckIcon} label="Mark the phase done" className="wrSmallBtn wrSmallBtn--accent" onClick={() => patchPhase(ph.id, { status: 'done' })} />}
                  <IconBtn Icon={TrashIcon} label={`Delete ${ph.title || 'the phase'}`} onClick={() => { setPlanner(removePhase(planner, ph.id)); setOpenId(null) }} />
                </div>
              </div>
            )}
          </section>
        )
      })}
      {loose.length > 0 && (
        <section className="wrPlanLoose" aria-label="Milestones on no phase">
          <h4 className="wrSchedSub">Not on a phase · {loose.length}</h4>
          {loose.map(m => milestoneRow(m, true))}
        </section>
      )}
    </div>
  )
}
