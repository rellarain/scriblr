import { useState } from 'react'
import { PROCESS_RELATIONS, PROCESS_RELATION_LABEL, type Milestone, type Phase, type Process, type ProcessRelation, type StepGroup } from '../../../../lib/facets'
import { unmetMilestones } from '../../../../lib/processOrder'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, LockIcon, PlusIcon, StackIcon, TrashIcon } from '../../../icons'
import { ChipSet, FacetChips, wholeOrNull } from './fields'

// One process: a titled, described recipe of steps. The steps are in groups, each done in order (one then the next) or in any order, and a process may mix
// both. It is for several phases and facets, may need milestones to be done first (until they are, it is blocked), and can be linked to other processes:
// before or after one (ordered), or with one (unordered: related, or done at the same time before whatever comes next).

export function ProcessCard({ process, processes, phases, milestones, stage, open, onOpen, onChange, onLink, onDelete }: {
  process: Process
  processes: Process[]
  phases: Phase[]
  milestones: Milestone[]
  // Its place in the sequence the ordered links make (1 is first), and null for one that goes round in a circle.
  stage: number | null
  open: boolean
  onOpen: (open: boolean) => void
  onChange: (patch: Partial<Process>) => void
  onLink: (otherId: string, relation: ProcessRelation | null) => void
  onDelete: () => void
}) {
  const [step, setStep] = useState<Record<string, string>>({})
  const unmet = unmetMilestones(process, milestones)
  const needs = unmet.map(id => milestones.find(m => m.id === id)?.title || 'a milestone that is gone')
  const steps = process.groups.reduce((n, g) => n + g.steps.length, 0)
  const patchGroup = (id: string, patch: Partial<StepGroup>) => onChange({ groups: process.groups.map(g => (g.id === id ? { ...g, ...patch } : g)) })
  const addStep = (g: StepGroup) => {
    const label = (step[g.id] ?? '').trim()
    if (!label) return
    patchGroup(g.id, { steps: [...g.steps, { id: newId('step'), label, estimateMinutes: null, facet: null }] })
    setStep(prev => ({ ...prev, [g.id]: '' }))
  }
  const others = processes.filter(p => p.id !== process.id)
  const linked = new Set(process.links.map(l => l.otherId))

  return (
    <section className={`wrPlanCard${open ? ' wrPlanCard--open' : ''}${unmet.length ? ' wrPlanCard--blocked' : ''}`} aria-label={process.title || 'Untitled process'}>
      <button type="button" className="wrPlanHead" aria-expanded={open} aria-label={`${process.title || 'Untitled process'} details`} onClick={() => onOpen(!open)}>
        <StackIcon size={20} />
        <span className="wrPlanTitle"><b>{process.title || 'Untitled process'}</b><small>{steps} {steps === 1 ? 'step' : 'steps'}{process.description ? ` · ${process.description}` : ''}</small></span>
        {stage !== null && <span className="wrSchedTag" title="Its place in the sequence the links make">Stage {stage}</span>}
        {unmet.length > 0 && <span className="wrSchedTag wrSchedTag--priority" title={`Needs: ${needs.join(', ')}`}><LockIcon size={20} /> Blocked</span>}
        {open ? <ChevronDownIcon size={20} /> : <ChevronRightIcon size={20} />}
      </button>
      {open && (
        <div className="wrPlanBody">
          <input className="wrField" aria-label="Process title" value={process.title} onChange={e => onChange({ title: e.target.value })} />
          <textarea className="wrField" aria-label="Process description" placeholder="Description…" rows={2} maxLength={2000} value={process.description} onChange={e => onChange({ description: e.target.value })} />
          <FacetChips label="Process facets" value={process.facets} onChange={facets => onChange({ facets })} />
          {phases.length > 0 && <ChipSet label="Process phases" value={process.phaseIds} onChange={phaseIds => onChange({ phaseIds })} options={phases.map(p => ({ id: p.id, label: p.title || 'Untitled phase' }))} />}
          {milestones.length > 0 && (
            <div className="wrPlanRequires">
              <span className="wrLabel">Needs these milestones done first</span>
              <ChipSet label="Required milestones" value={process.requiredMilestoneIds} onChange={requiredMilestoneIds => onChange({ requiredMilestoneIds })} options={milestones.map(m => ({ id: m.id, label: m.title || 'Untitled milestone' }))} />
            </div>
          )}

          <div className="wrPlanGroups">
            <span className="wrLabel">Steps</span>
            {process.groups.map((g, gi) => (
              <div key={g.id} className="wrStepGroup" role="group" aria-label={`Step group ${gi + 1}`}>
                <div className="wrStepGroupHead">
                  <div className="wrChoice" role="radiogroup" aria-label={`Group ${gi + 1} order`}>
                    <button type="button" role="radio" aria-checked={g.ordered} className={g.ordered ? 'on' : ''} onClick={() => patchGroup(g.id, { ordered: true })}>In order</button>
                    <button type="button" role="radio" aria-checked={!g.ordered} className={!g.ordered ? 'on' : ''} onClick={() => patchGroup(g.id, { ordered: false })}>Any order</button>
                  </div>
                  <IconBtn Icon={CloseIcon} label={`Remove step group ${gi + 1}`} onClick={() => onChange({ groups: process.groups.filter(x => x.id !== g.id) })} />
                </div>
                {g.steps.map((s, si) => (
                  <div className="wrStepRow" key={s.id}>
                    <span className="wrStepNo" aria-hidden="true">{g.ordered ? si + 1 : '•'}</span>
                    <input className="wrField" aria-label={`Step ${si + 1} of group ${gi + 1}`} value={s.label} onChange={e => patchGroup(g.id, { steps: g.steps.map(x => (x.id === s.id ? { ...x, label: e.target.value } : x)) })} />
                    <input className="wrField wrSchedNum" type="number" min={1} max={1440} placeholder="min" aria-label={`Minutes for ${s.label || 'the step'}`} value={s.estimateMinutes ?? ''} onChange={e => patchGroup(g.id, { steps: g.steps.map(x => (x.id === s.id ? { ...x, estimateMinutes: wholeOrNull(e.target.value, 1440) } : x)) })} />
                    <IconBtn Icon={CloseIcon} label={`Remove ${s.label || 'the step'}`} onClick={() => patchGroup(g.id, { steps: g.steps.filter(x => x.id !== s.id) })} />
                  </div>
                ))}
                <div className="wrStepRow">
                  <span className="wrStepNo" aria-hidden="true" />
                  <input className="wrField" aria-label={`New step in group ${gi + 1}`} placeholder="Add a step…" value={step[g.id] ?? ''} onChange={e => setStep(prev => ({ ...prev, [g.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep(g) } }} />
                  <IconBtn Icon={PlusIcon} label={`Add the step to group ${gi + 1}`} onClick={() => addStep(g)} />
                </div>
              </div>
            ))}
            <IconBtn Icon={PlusIcon} label="Add a step group" onClick={() => onChange({ groups: [...process.groups, { id: newId('group'), ordered: process.groups.length === 0, steps: [] }] })} />
          </div>

          <div className="wrPlanLinks">
            <span className="wrLabel">Linked processes</span>
            {process.links.map(l => (
              <div className="wrStepRow" key={l.otherId}>
                <select className="wrField" aria-label={`How this relates to ${processes.find(p => p.id === l.otherId)?.title ?? 'the process'}`} value={l.relation} onChange={e => onLink(l.otherId, e.target.value as ProcessRelation)}>
                  {PROCESS_RELATIONS.map(r => <option key={r} value={r}>{PROCESS_RELATION_LABEL[r]}</option>)}
                </select>
                <b>{processes.find(p => p.id === l.otherId)?.title || 'Untitled process'}</b>
                <IconBtn Icon={CloseIcon} label={`Unlink ${processes.find(p => p.id === l.otherId)?.title ?? 'the process'}`} onClick={() => onLink(l.otherId, null)} />
              </div>
            ))}
            {others.some(p => !linked.has(p.id)) && (
              <select className="wrField" aria-label="Link to a process" value="" onChange={e => { if (e.target.value) onLink(e.target.value, 'before') }}>
                <option value="">Link to a process…</option>
                {others.filter(p => !linked.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.title || 'Untitled process'}</option>)}
              </select>
            )}
          </div>
          <div className="wrSchedFormActions"><IconBtn Icon={TrashIcon} label={`Delete ${process.title || 'the process'}`} onClick={onDelete} /></div>
        </div>
      )}
    </section>
  )
}
