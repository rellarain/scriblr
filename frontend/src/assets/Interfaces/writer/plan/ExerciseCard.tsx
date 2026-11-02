import type { Exercise, Phase } from '../../../../lib/facets'
import { IconBtn } from '../schedule/IconBtn'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, PencilIcon, TrashIcon } from '../../../icons'
import { ChipSet, FacetChips, wholeOrNull } from './fields'

// One exercise: a writing drill with a prompt (its description), a length, how often it is suggested and a log of how often it has been done.

export function ExerciseCard({ exercise, phases, today, open, onOpen, onChange, onDelete }: {
  exercise: Exercise
  phases: Phase[]
  today: string
  open: boolean
  onOpen: (open: boolean) => void
  onChange: (patch: Partial<Exercise>) => void
  onDelete: () => void
}) {
  const title = exercise.title || 'Untitled exercise'
  return (
    <section className={`wrPlanCard${open ? ' wrPlanCard--open' : ''}`} aria-label={title}>
      <button type="button" className="wrPlanHead" aria-expanded={open} aria-label={`${title} details`} onClick={() => onOpen(!open)}>
        <PencilIcon size={20} />
        <span className="wrPlanTitle">
          <b>{title}</b>
          <small>{exercise.durationMinutes} min{exercise.perWeek ? ` · ${exercise.perWeek}× a week` : ''}{exercise.timesDone ? ` · done ${exercise.timesDone}×` : ''}</small>
        </span>
        {open ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}
      </button>
      {open && (
        <div className="wrPlanBody">
          <input className="wrField" aria-label="Exercise title" value={exercise.title} onChange={e => onChange({ title: e.target.value })} />
          <textarea className="wrField" aria-label="Prompt" placeholder="The prompt…" rows={3} maxLength={2000} value={exercise.description} onChange={e => onChange({ description: e.target.value })} />
          <div className="wrTaskGrid">
            <label>Minutes
              <input className="wrField" type="number" min={1} max={1440} aria-label="Duration in minutes" value={exercise.durationMinutes} onChange={e => onChange({ durationMinutes: wholeOrNull(e.target.value, 1440) ?? exercise.durationMinutes })} />
            </label>
            <label>Times a week
              <input className="wrField" type="number" min={1} max={21} placeholder="no pace" aria-label="Times a week" value={exercise.perWeek ?? ''} onChange={e => onChange({ perWeek: wholeOrNull(e.target.value, 21) })} />
            </label>
          </div>
          <FacetChips label="Exercise facets" value={exercise.facets} onChange={facets => onChange({ facets })} />
          {phases.length > 0 && <ChipSet label="Exercise phases" value={exercise.phaseIds} onChange={phaseIds => onChange({ phaseIds })} options={phases.map(p => ({ id: p.id, label: p.title || 'Untitled phase' }))} />}
          <div className="wrSchedFormActions">
            <span className="wrHint">{exercise.timesDone ? `Done ${exercise.timesDone} ${exercise.timesDone === 1 ? 'time' : 'times'}${exercise.lastDone ? `, last on ${exercise.lastDone}` : ''}.` : 'Not done yet.'}</span>
            <IconBtn Icon={CheckIcon} label={`I did ${title}`} onClick={() => onChange({ timesDone: exercise.timesDone + 1, lastDone: today })} />
            <IconBtn Icon={TrashIcon} label={`Delete ${title}`} onClick={onDelete} />
          </div>
        </div>
      )}
    </section>
  )
}
