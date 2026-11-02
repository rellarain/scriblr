import { useState } from 'react'
import type { Planner } from '../../../../lib/facets'
import { Fold } from '../schedule/Fold'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { PlusIcon, TrashIcon } from '../../../icons'

// The project's own days, folded under the plan: when it starts and ends, and the rest days (which the chart shades; the Schedule's settings edit the same days).

const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function ProjectDates({ planner, setPlanner }: { planner: Planner; setPlanner: (p: Planner) => void }) {
  const [open, setOpen] = useState(false)
  const patchRest = (id: string, patch: Partial<Planner['restDays'][number]>) => setPlanner({ ...planner, restDays: planner.restDays.map(r => (r.id === id ? { ...r, ...patch } : r)) })
  const summary = [planner.timelineStart && planner.timelineEnd ? `${dayLabel(planner.timelineStart)} to ${dayLabel(planner.timelineEnd)}` : '', planner.restDays.length ? `${planner.restDays.length} rest` : ''].filter(Boolean).join(' · ') || 'None'
  return (
    <Fold title="Project dates and rest days" summary={summary} open={open} onToggle={() => setOpen(o => !o)}>
      <div className="wrTaskGrid">
        <label>Project starts<input className="wrField" type="date" aria-label="Project starts" value={planner.timelineStart ?? ''} onChange={e => setPlanner({ ...planner, timelineStart: e.target.value || null })} /></label>
        <label>Project ends<input className="wrField" type="date" aria-label="Project ends" min={planner.timelineStart ?? undefined} value={planner.timelineEnd ?? ''} onChange={e => setPlanner({ ...planner, timelineEnd: e.target.value || null })} /></label>
      </div>
      <span className="wrLabel">Rest days</span>
      {planner.restDays.map(r => (
        <div className="wrPlanMilestone" key={r.id}>
          <input className="wrField" aria-label="Rest days name" placeholder="Holiday" value={r.label} onChange={e => patchRest(r.id, { label: e.target.value })} />
          <input className="wrField" type="date" aria-label={`${r.label || 'Rest days'} start`} value={r.start} onChange={e => e.target.value && patchRest(r.id, { start: e.target.value, end: r.end < e.target.value ? e.target.value : r.end })} />
          <input className="wrField" type="date" aria-label={`${r.label || 'Rest days'} end`} min={r.start} value={r.end} onChange={e => e.target.value && patchRest(r.id, { end: e.target.value })} />
          <IconBtn Icon={TrashIcon} label={`Delete ${r.label || 'the rest days'}`} onClick={() => setPlanner({ ...planner, restDays: planner.restDays.filter(x => x.id !== r.id) })} />
        </div>
      ))}
      <IconBtn Icon={PlusIcon} label="Add rest days" onClick={() => { const d = planner.timelineStart ?? new Date().toISOString().slice(0, 10); setPlanner({ ...planner, restDays: [...planner.restDays, { id: newId('rest'), start: d, end: d, label: '' }] }) }} />
    </Fold>
  )
}
