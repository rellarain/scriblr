import { useState } from 'react'
import { newPhaseKind, type PhaseKind, type Planner } from '../../../../lib/facets'
import { removeKind, syncKind } from '../../../../lib/phaseKinds'
import { Fold } from '../schedule/Fold'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { ArcIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '../../../icons'
import { wholeOrNull } from './fields'

// The kinds of phase: recipes for a phase that comes round (a Revision pass). A kind has a result, a description, a length and milestones; a new pass on a row starts
// from it, and every pass follows it in the fields it has not changed itself, so an edit here is carried to them as it is made.

export function KindsPanel({ planner, setPlanner, today }: { planner: Planner; setPlanner: (p: Planner) => void; today: string }) {
  const [open, setOpen] = useState(false)
  const [openKind, setOpenKind] = useState<string | null>(null)
  const save = (kind: PhaseKind) => setPlanner(syncKind(planner, kind, today))
  const add = () => { const k = newPhaseKind(newId('kind'), 'New kind'); setPlanner(syncKind(planner, k, today)); setOpenKind(k.id); setOpen(true) }
  const passes = (id: string) => planner.phases.filter(p => p.kindId === id).length

  return (
    <Fold title="Phase kinds" summary={planner.phaseKinds.length === 0 ? 'None' : String(planner.phaseKinds.length)} open={open} onToggle={() => setOpen(o => !o)}>
      <p className="wrHint">A kind is a recipe for a phase that comes round, like a revision pass. Add a pass of it to any row; each pass follows the kind in what it has not changed itself.</p>
      {planner.phaseKinds.map(kind => {
        const isOpen = openKind === kind.id
        const n = passes(kind.id)
        const title = kind.title || 'Untitled kind'
        const patchMilestone = (id: string, change: Partial<PhaseKind['milestones'][number]>) => save({ ...kind, milestones: kind.milestones.map(m => (m.id === id ? { ...m, ...change } : m)) })
        return (
          <section key={kind.id} className={`wrPlanCard${isOpen ? ' wrPlanCard--open' : ''}`} aria-label={`Kind ${title}`}>
            <div className="wrPlanTop">
              <button type="button" className="wrPlanHead" aria-expanded={isOpen} aria-label={`${title} kind details`} onClick={() => setOpenKind(isOpen ? null : kind.id)}>
                <ArcIcon size={20} />
                <span className="wrPlanTitle"><b>{title}</b><small>{n === 0 ? 'no passes yet' : `${n} ${n === 1 ? 'pass' : 'passes'}`}{kind.lengthDays ? ` · ${kind.lengthDays} days` : ''}</small></span>
                {isOpen ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}
              </button>
            </div>
            {isOpen && (
              <div className="wrPlanBody">
                <input className="wrField" aria-label="Kind title" value={kind.title} onChange={e => save({ ...kind, title: e.target.value })} />
                <textarea className="wrField" aria-label="Kind result" placeholder="The result a pass builds to…" rows={2} maxLength={1000} value={kind.result} onChange={e => save({ ...kind, result: e.target.value })} />
                <textarea className="wrField" aria-label="Kind description" placeholder="Description…" rows={2} maxLength={2000} value={kind.description} onChange={e => save({ ...kind, description: e.target.value })} />
                <label>Days
                  <input className="wrField wrSchedNum" type="number" min={1} max={3650} placeholder="a fortnight" aria-label="Kind length in days" value={kind.lengthDays ?? ''} onChange={e => save({ ...kind, lengthDays: wholeOrNull(e.target.value, 3650) })} />
                </label>
                <div className="wrPlanMilestones">
                  <span className="wrLabel">Milestones{kind.milestones.length > 0 ? ` · ${kind.milestones.length}` : ''}</span>
                  {kind.milestones.map(m => (
                    <div className="wrPlanMilestone" key={m.id}>
                      <input className="wrField" aria-label="Kind milestone title" placeholder="Milestone" value={m.title} onChange={e => patchMilestone(m.id, { title: e.target.value })} />
                      <input className="wrField" aria-label={`${m.title || 'Milestone'} result in the kind`} placeholder="What it delivers…" value={m.result} onChange={e => patchMilestone(m.id, { result: e.target.value })} />
                      <input className="wrField wrSchedNum" type="number" min={1} max={3650} placeholder="share" aria-label={`${m.title || 'Milestone'} days in the kind`} value={m.lengthDays ?? ''} onChange={e => patchMilestone(m.id, { lengthDays: wholeOrNull(e.target.value, 3650) })} />
                      <IconBtn Icon={TrashIcon} label={`Delete ${m.title || 'milestone'} from ${title}`} onClick={() => save({ ...kind, milestones: kind.milestones.filter(x => x.id !== m.id) })} />
                    </div>
                  ))}
                  <IconBtn Icon={PlusIcon} label={`New milestone in ${title}`} onClick={() => save({ ...kind, milestones: [...kind.milestones, { id: newId('km'), title: 'New milestone', result: '', lengthDays: null }] })} />
                </div>
                <div className="wrSchedFormActions">
                  <span className="wrHint">{n > 0 ? `${n} ${n === 1 ? 'pass follows' : 'passes follow'} it. Deleting it leaves them as plain phases.` : 'No pass follows it yet.'}</span>
                  <IconBtn Icon={TrashIcon} label={`Delete the ${title} kind`} onClick={() => { setPlanner(removeKind(planner, kind.id)); setOpenKind(null) }} />
                </div>
              </div>
            )}
          </section>
        )
      })}
      <IconBtn Icon={PlusIcon} label="New phase kind" className="wrSmallBtn wrSmallBtn--accent" onClick={add} />
    </Fold>
  )
}
