import { useState } from 'react'
import { FACETS, FACET_LABEL, type Facet, type Planner } from '../../../../lib/facets'
import type { WeekStart } from '../../../../lib/scheduleCalendar'
import { newId } from './ids'

// The console's settings, from the gear in the Schedule tile: the week's first day, the facets' hues, shift reminders, the project's timeline and its
// rest days (routines pause and shifts are skipped, not missed, and streaks hold), and the export and print of the week.

export type FacetHues = Record<Facet, number>
export const DEFAULT_HUES: FacetHues = { outline: 212, plot: 272, draft: 32, revision: 168, project: 340 }

export function ScheduleSettings({
  weekStart, onWeekStart, hues, onHues, planner, onPlanner, onReminders, onIcs, onPrint, scopeLabel,
}: {
  weekStart: WeekStart
  onWeekStart: (w: WeekStart) => void
  hues: FacetHues
  onHues: (h: FacetHues) => void
  planner: Planner
  onPlanner: (p: Planner) => void
  onReminders: (lead: number | null) => void
  onIcs: () => void
  onPrint: () => void
  scopeLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [rest, setRest] = useState({ start: '', end: '', label: '' })
  return (
    <span className="wrSchedSettings">
      <button type="button" className="wrSmallBtn" aria-expanded={open} aria-haspopup="dialog" aria-label="Schedule settings" onClick={() => setOpen(!open)}>Settings</button>
      {open && (
        <div className="wrSchedPopover" role="dialog" aria-label="Schedule settings">
          <label className="wrKv"><span>Week starts on</span>
            <select className="wrField" aria-label="Week starts on" value={weekStart} onChange={e => onWeekStart(e.target.value as WeekStart)}><option value="monday">Monday</option><option value="sunday">Sunday</option></select>
          </label>
          <h4 className="wrSchedSub">Facet colours</h4>
          {FACETS.map(f => (
            <label key={f} className="wrKv wrSchedHue"><span><i className="wrSchedDot" style={{ background: `var(--wr-f-${f})` }} />{FACET_LABEL[f]}</span>
              <input type="range" min={0} max={360} aria-label={`${FACET_LABEL[f]} hue`} value={hues[f]} onChange={e => onHues({ ...hues, [f]: Number(e.target.value) })} />
            </label>
          ))}
          <h4 className="wrSchedSub">{scopeLabel}</h4>
          <label className="wrKv"><span>Remind me before a shift</span>
            <select className="wrField" aria-label="Reminder" value={planner.reminderLeadMinutes ?? ''} onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); onPlanner({ ...planner, reminderLeadMinutes: v }); onReminders(v) }}>
              <option value="">Never</option><option value="0">When it starts</option><option value="5">5 minutes before</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option>
            </select>
          </label>
          <label className="wrKv"><span>Timeline starts</span><input className="wrField" type="date" aria-label="Timeline starts" value={planner.timelineStart ?? ''} onChange={e => onPlanner({ ...planner, timelineStart: e.target.value || null })} /></label>
          <label className="wrKv"><span>Timeline ends</span><input className="wrField" type="date" aria-label="Timeline ends" value={planner.timelineEnd ?? ''} onChange={e => onPlanner({ ...planner, timelineEnd: e.target.value || null })} /></label>
          <h4 className="wrSchedSub">Rest days</h4>
          {planner.restDays.map(r => (
            <div key={r.id} className="wrSchedCheck"><span>{r.label || 'Rest'} · {r.start} to {r.end}</span>
              <button type="button" className="wrSmallBtn" aria-label={`Remove rest days ${r.start}`} onClick={() => onPlanner({ ...planner, restDays: planner.restDays.filter(x => x.id !== r.id) })}>×</button>
            </div>
          ))}
          <div className="wrSchedRest">
            <input className="wrField" aria-label="Rest from" type="date" value={rest.start} onChange={e => setRest({ ...rest, start: e.target.value })} />
            <input className="wrField" aria-label="Rest to" type="date" value={rest.end} onChange={e => setRest({ ...rest, end: e.target.value })} />
            <input className="wrField" aria-label="Rest label" placeholder="Holiday…" value={rest.label} onChange={e => setRest({ ...rest, label: e.target.value })} />
            <button type="button" className="wrSmallBtn" disabled={!rest.start || !rest.end || rest.end < rest.start} onClick={() => { onPlanner({ ...planner, restDays: [...planner.restDays, { id: newId('rest'), start: rest.start, end: rest.end, label: rest.label }] }); setRest({ start: '', end: '', label: '' }) }}>Add rest days</button>
          </div>
          <div className="wrSchedFormActions">
            <button type="button" className="wrSmallBtn" onClick={onIcs}>Export shifts (.ics)</button>
            <button type="button" className="wrSmallBtn" onClick={onPrint}>Print the week</button>
          </div>
        </div>
      )}
    </span>
  )
}
