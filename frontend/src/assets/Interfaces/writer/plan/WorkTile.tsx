import { useMemo, useState } from 'react'
import { FACETS, FACET_LABEL, newExercise, newProcess, newTask, type Exercise, type Facet, type PlanItem, type Planner, type Process, type Recurrence, type Routine } from '../../../../lib/facets'
import { linkProcesses, removeProcess } from '../../../../lib/planEdit'
import { setPlacements } from '../../../../lib/planSequence'
import { processStages } from '../../../../lib/processOrder'
import { useStoredState } from '../shared'
import { Fold } from '../schedule/Fold'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { RepeatPicker } from '../schedule/RepeatPicker'
import { TaskRow } from '../schedule/TaskRow'
import { PlusIcon, TrashIcon } from '../../../icons'
import { ExerciseCard } from './ExerciseCard'
import { MilestoneSelect, PhaseSelect, PlanGrip } from './fields'
import { ProcessCard } from './ProcessCard'
import { TEMPLATE_OWNER } from './useTemplate'

// The Work tile: what a project does to get its results, in four folds: the processes (recipes of steps), the exercises (writing drills), the routines
// (what comes round) and the tasks (what is waiting). Each is tagged with the phase it builds to; each opens in place and every change is made at once.

type Section = 'processes' | 'exercises' | 'routines' | 'tasks'

function RoutineRow({ ownerId, routine, phases, milestones, today, open, onOpen, onChange, onDelete }: {
  ownerId: string; routine: Routine; phases: Planner['phases']; milestones: Planner['milestones']; today: string; open: boolean; onOpen: (o: boolean) => void; onChange: (patch: Partial<Routine>) => void; onDelete: () => void
}) {
  return (
    <section className={`wrPlanCard${open ? ' wrPlanCard--open' : ''}`} aria-label={routine.label || 'Untitled routine'}>
      <div className="wrPlanTop">
      <button type="button" className="wrPlanHead" aria-expanded={open} aria-label={`${routine.label || 'Untitled routine'} details`} onClick={() => onOpen(!open)}>
        <span className="wrPlanTitle"><b>{routine.label || 'Untitled routine'}</b><small>{routine.facet ? FACET_LABEL[routine.facet] : 'Any facet'}{routine.lastDone ? ` · last ${routine.lastDone}` : ''}</small></span>
      </button>
      <PlanGrip ownerId={ownerId} kind="routine" id={routine.id} name={routine.label || 'the routine'} />
      </div>
      {open && (
        <div className="wrPlanBody">
          <input className="wrField" aria-label="Routine" value={routine.label} onChange={e => onChange({ label: e.target.value })} />
          <div className="wrTaskGrid">
            <label>About
              <select className="wrField" aria-label="Routine facet" value={routine.facet ?? ''} onChange={e => onChange({ facet: (e.target.value || null) as Facet | null })}>
                <option value="">Anything</option>
                {FACETS.map(f => <option key={f} value={f}>{FACET_LABEL[f]}</option>)}
              </select>
            </label>
            <label>Phase<PhaseSelect label={`Phase of ${routine.label || 'the routine'}`} phases={phases} value={routine.phaseId} onChange={phaseId => onChange({ phaseId })} /></label>
          </div>
          {milestones.length > 0 && (
            <label>Milestone
              <MilestoneSelect label={`Milestone of ${routine.label || 'the routine'}`} milestones={milestones} phases={phases} value={routine.milestoneId} onChange={milestoneId => onChange({ milestoneId, ...(milestoneId ? { phaseId: milestones.find(m => m.id === milestoneId)?.phaseId ?? routine.phaseId } : {}) })} />
            </label>
          )}
          <RepeatPicker value={routine.recurrence} anchor={routine.recurrence.anchor || today} allowInterval onChange={(rec: Recurrence | null) => { if (rec) onChange({ recurrence: rec }) }} />
          <div className="wrSchedFormActions"><IconBtn Icon={TrashIcon} label={`Delete ${routine.label || 'the routine'}`} onClick={onDelete} /></div>
        </div>
      )}
    </section>
  )
}

export function WorkTile({ ownerId, planner, setPlanner, today }: { ownerId: string; planner: Planner; setPlanner: (p: Planner) => void; today: string }) {
  const [open, setOpen] = useStoredState<Section[]>('scriblr.writer.plan.work.open', ['processes'])
  const toggle = (s: Section) => setOpen(open.includes(s) ? open.filter(x => x !== s) : [...open, s])
  const [openId, setOpenId] = useState<string | null>(null)
  const [text, setText] = useState<Record<Section, string>>({ processes: '', exercises: '', routines: '', tasks: '' })
  const say = (s: Section, v: string) => setText(prev => ({ ...prev, [s]: v }))
  const stages = useMemo(() => processStages(planner.processes), [planner.processes])
  const stageOf = (id: string): number | null => { const i = stages.stages.findIndex(s => s.includes(id)); return i < 0 ? null : i + 1 }

  const patch = <K extends 'processes' | 'exercises' | 'routines' | 'items'>(key: K, id: string, change: Partial<Planner[K][number]>) =>
    setPlanner({ ...planner, [key]: (planner[key] as Array<{ id: string }>).map(x => (x.id === id ? { ...x, ...change } : x)) })
  const take = (s: Section): string | null => { const v = text[s].trim(); if (v) say(s, ''); return v || null }
  const addProcess = () => { const t = take('processes'); if (!t) return; const p = newProcess(newId('process'), t); setPlanner({ ...planner, processes: [...planner.processes, p] }); setOpenId(p.id) }
  const addExercise = () => { const t = take('exercises'); if (!t) return; const x = newExercise(newId('exercise'), t); setPlanner({ ...planner, exercises: [...planner.exercises, x] }); setOpenId(x.id) }
  const addRoutine = () => {
    const t = take('routines')
    if (!t) return
    const r: Routine = { id: newId('routine'), label: t, facet: null, targetNodeId: null, targetTree: null, shiftId: null, recurrence: { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor: today, until: null }, pauses: [], lastDone: null, phaseId: null }
    setPlanner({ ...planner, routines: [...planner.routines, r] })
    setOpenId(r.id)
  }
  const addTask = () => { const t = take('tasks'); if (t) setPlanner({ ...planner, items: [...planner.items, newTask(newId('item'), t, today)] }) }
  // A task of a repeating shift is ticked a day at a time, on the Agenda's checklist; the ones listed here are the ones that are done once and for all.
  const tasks = planner.items.filter((i: PlanItem) => { const shift = i.shiftId ? planner.shifts.find(s => s.id === i.shiftId) : null; return !shift?.recurrence })

  const adder = (s: Section, label: string, placeholder: string, add: () => void) => (
    <div className="wrPlanAdd">
      <input className="wrField" aria-label={label} placeholder={placeholder} value={text[s]} onChange={e => say(s, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
      <IconBtn Icon={PlusIcon} label={`Add ${label.toLowerCase().replace(/^new /, '')}`} onClick={add} />
    </div>
  )

  return (
    <div className="wrSchedCard wrWork">
      <Fold title="Processes" summary={String(planner.processes.length)} open={open.includes('processes')} onToggle={() => toggle('processes')}>
        {adder('processes', 'New process', 'A recipe of steps…', addProcess)}
        {stages.cyclic.length > 0 && <p className="wrHint">These processes are linked in a circle, so they have no place in the sequence: {stages.cyclic.map(id => planner.processes.find(p => p.id === id)?.title).join(', ')}.</p>}
        {planner.processes.map((p: Process) => (
          <ProcessCard
            key={p.id} ownerId={ownerId} process={p} processes={planner.processes} phases={planner.phases} milestones={planner.milestones} stage={stageOf(p.id)}
            open={openId === p.id} onOpen={o => setOpenId(o ? p.id : null)} onChange={change => patch('processes', p.id, change)} onPlace={ids => setPlanner(setPlacements(planner, 'process', p.id, ids))}
            onLink={(other, relation) => setPlanner(linkProcesses(planner, p.id, other, relation))} onDelete={() => setPlanner(removeProcess(planner, p.id))}
          />
        ))}
      </Fold>
      <Fold title="Exercises" summary={String(planner.exercises.length)} open={open.includes('exercises')} onToggle={() => toggle('exercises')}>
        {adder('exercises', 'New exercise', 'A writing drill…', addExercise)}
        {planner.exercises.map((x: Exercise) => (
          <ExerciseCard
            key={x.id} ownerId={ownerId} exercise={x} phases={planner.phases} milestones={planner.milestones} today={today} open={openId === x.id} onOpen={o => setOpenId(o ? x.id : null)}
            onChange={change => patch('exercises', x.id, change)} onPlace={ids => setPlanner(setPlacements(planner, 'exercise', x.id, ids))} onDelete={() => setPlanner({ ...planner, exercises: planner.exercises.filter(e => e.id !== x.id) })}
          />
        ))}
      </Fold>
      <Fold title="Routines" summary={String(planner.routines.length)} open={open.includes('routines')} onToggle={() => toggle('routines')}>
        {adder('routines', 'New routine', 'Something that comes round…', addRoutine)}
        {planner.routines.map((r: Routine) => (
          <RoutineRow
            key={r.id} ownerId={ownerId} routine={r} phases={planner.phases} milestones={planner.milestones} today={today} open={openId === r.id} onOpen={o => setOpenId(o ? r.id : null)}
            onChange={change => patch('routines', r.id, change)} onDelete={() => setPlanner({ ...planner, routines: planner.routines.filter(x => x.id !== r.id) })}
          />
        ))}
      </Fold>
      <Fold title="Tasks" summary={String(tasks.length)} open={open.includes('tasks')} onToggle={() => toggle('tasks')}>
        {adder('tasks', 'New task', 'Something to do…', addTask)}
        {tasks.map(item => (
          <TaskRow
            key={item.id} ownerId={ownerId} item={item} today={today} done={!!item.doneOn} progress={null} targets={[]}
            open={openId === item.id} onOpen={o => setOpenId(o ? item.id : null)} onChange={change => patch('items', item.id, change)}
            onTick={on => patch('items', item.id, { doneOn: on ? today : null })} onDelete={() => setPlanner({ ...planner, items: planner.items.filter(x => x.id !== item.id) })}
            placeable={ownerId !== TEMPLATE_OWNER && !item.shiftId && !item.doneOn} phases={planner.phases} phaseTitle={planner.phases.find(x => x.id === item.phaseId)?.title}
            milestones={planner.milestones} milestoneTitle={planner.milestones.find(x => x.id === item.milestoneId)?.title}
          />
        ))}
      </Fold>
    </div>
  )
}
