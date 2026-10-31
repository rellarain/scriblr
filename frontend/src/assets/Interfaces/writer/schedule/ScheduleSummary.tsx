import { shiftOccurrences } from '../../../../lib/recurrence'
import { slotTime } from '../../../../lib/facets'
import { useSchedule } from './useSchedule'

// The Schedule tab at Mid size: today's shifts and how many goals there are. The whole console is the Max tile.

export function ScheduleSummary({ projectIds }: { projectIds: string[] }) {
  const s = useSchedule(projectIds)
  if (s.error) return <p className="wrError" role="alert">{s.error}</p>
  const today = s.facets.today
  const planners = Object.values(s.planners)
  const todays = planners.flatMap(p => shiftOccurrences(p.shifts, p.restDays, today, today))
  const goals = planners.reduce((n, p) => n + p.goals.length, 0)
  const waiting = planners.reduce((n, p) => n + p.items.filter(i => !i.shiftId && !i.doneOn).length, 0)
  return (
    <div className="wrSummary">
      <p className="wrMuted">Open this tab at full size for the goals, the week, the backlog and the charts.</p>
      <h4 className="wrSchedSub">Today</h4>
      {s.loading ? <p className="wrMuted">Loading…</p> : todays.length === 0 ? <p className="wrMuted">No shifts today.</p> : todays.map(o => (
        <div key={`${o.shiftId}${o.date}`} className="wrBarLabel"><span>{o.title}</span><span>{slotTime(o.startSlot)} – {slotTime(o.endSlot)}</span></div>
      ))}
      <div className="wrBarLabel"><span>Goals</span><span>{goals}</span></div>
      <div className="wrBarLabel"><span>Tasks waiting</span><span>{waiting}</span></div>
    </div>
  )
}
