import { useState } from 'react'
import { FACETS, FACET_LABEL, type Facet, type Planner } from '../../../../lib/facets'
import type { WeekStart } from '../../../../lib/scheduleCalendar'
import { CloseIcon, ExportIcon, GearIcon, PlusIcon, PrintIcon } from '../../../icons'
import { FacetIcon } from './FacetIcon'
import { ICON_PX, IconBtn } from './IconBtn'
import { ColorRange } from '../../../../components/ColorRange'
import { FACET_COLOR } from '../../../../theme/zoneLooks'
import { newId } from './ids'

// The console's settings, from the Settings button in the console's title bar (SettingsButton; the popover, ScheduleSettings, opens over the console): the week's first day, the facets' hues, shift reminders, the project's timeline and its
// rest days (routines pause and shifts are skipped, not missed, and streaks hold), and the export and print of the week.

export type FacetHues = Record<Facet, number>
export const DEFAULT_HUES: FacetHues = { outline: 212, plot: 272, draft: 32, revision: 168, project: 340 }
// The CSS variables a console sets for the facets' colours (--wr-f-<facet>): each hue at the facet colours' own saturation and lightness.
export const facetHueVars = (hues: FacetHues): Record<string, string> => Object.fromEntries(FACETS.map(f => [`--wr-f-${f}`, `hsl(${hues[f]}, ${FACET_COLOR.s}%, ${FACET_COLOR.l}%)`]))

// The gear in the console's title bar that opens and closes the settings.
export function SettingsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <button type="button" className="wrSmallBtn" aria-expanded={open} aria-haspopup="dialog" aria-label="Schedule settings" title="Schedule settings" onClick={onToggle}><GearIcon size={ICON_PX} /></button>
}

export function ScheduleSettings({
  weekStart, onWeekStart, hues, onHues, planner, onPlanner, onReminders, onIcs, onPrint, scopeLabel, onClose,
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
  onClose: () => void
}) {
  const [rest, setRest] = useState({ start: '', end: '', label: '' })
  return (
    <div className="wrSchedPopover" role="dialog" aria-label="Schedule settings" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
          <label className="wrKv"><span>Week starts on</span>
            <select className="wrField" aria-label="Week starts on" value={weekStart} onChange={e => onWeekStart(e.target.value as WeekStart)}><option value="monday">Monday</option><option value="sunday">Sunday</option></select>
          </label>
          <h4 className="wrSchedSub">Facet colours</h4>
          {FACETS.map(f => (
            <label key={f} className="wrKv wrSchedHue"><span><FacetIcon facet={f} />{FACET_LABEL[f]}</span>
              <ColorRange label={`${FACET_LABEL[f]} hue`} value={hues[f]} sat={FACET_COLOR.s} light={FACET_COLOR.l} onChange={h => onHues({ ...hues, [f]: h })} />
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
              <IconBtn Icon={CloseIcon} label={`Remove rest days ${r.start}`} onClick={() => onPlanner({ ...planner, restDays: planner.restDays.filter(x => x.id !== r.id) })} />
            </div>
          ))}
          <div className="wrSchedRest">
            <input className="wrField" aria-label="Rest from" type="date" value={rest.start} onChange={e => setRest({ ...rest, start: e.target.value })} />
            <input className="wrField" aria-label="Rest to" type="date" value={rest.end} onChange={e => setRest({ ...rest, end: e.target.value })} />
            <input className="wrField" aria-label="Rest label" placeholder="Holiday…" value={rest.label} onChange={e => setRest({ ...rest, label: e.target.value })} />
            <IconBtn Icon={PlusIcon} label="Add rest days" disabled={!rest.start || !rest.end || rest.end < rest.start} onClick={() => { onPlanner({ ...planner, restDays: [...planner.restDays, { id: newId('rest'), start: rest.start, end: rest.end, label: rest.label }] }); setRest({ start: '', end: '', label: '' }) }} />
          </div>
          <div className="wrSchedFormActions">
            <IconBtn Icon={ExportIcon} label="Export shifts (.ics)" onClick={onIcs} />
            <IconBtn Icon={PrintIcon} label="Print the week" onClick={onPrint} />
          </div>
    </div>
  )
}
