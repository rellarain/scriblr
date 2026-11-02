import { useMemo } from 'react'
import { milestoneState } from '../../../../lib/milestoneProgress'
import { phaseProgress, currentPhase, nextMilestone } from '../../../../lib/phaseProgress'
import { PROJECT_ROW, rowOfPhase } from '../../../../lib/planRows'
import { daysBetween } from '../../../../lib/projection'
import { emptyPlanner } from '../../../../lib/facets'
import { localToday, useSchedule } from '../schedule/useSchedule'

// What the Project tab shows at Mid: for each project, the phase it is in with how far it is, and the next milestone with the days to go.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function ProjectSummary({ projectIds, titles }: { projectIds: string[]; titles: Record<string, string> }) {
  const schedule = useSchedule(projectIds)
  const today = schedule.loading ? localToday() : schedule.facets.today
  const rows = useMemo(() => projectIds.map(id => {
    const p = schedule.planners[id] ?? emptyPlanner()
    // The project's own row: the phase it is in, and the next milestone along its phases (the books' and chapters' rows are in the Plan tile).
    const own = p.phases.filter(x => rowOfPhase(x) === PROJECT_ROW)
    const ownIds = new Set(own.map(x => x.id))
    const phase = currentPhase(own, today)
    const prog = phase ? phaseProgress(p, phase.id) : null
    const next = nextMilestone(p.milestones.filter(m => (!m.phaseId || ownIds.has(m.phaseId)) && !milestoneState(p, m.id).achieved), today)
    return { id, phase, pct: prog?.pct ?? null, next, counts: [plural(p.phases.length, 'phase'), plural(p.processes.length, 'process', 'processes'), plural(p.exercises.length, 'exercise')].join(' · ') }
  }), [projectIds, schedule.planners, today])
  if (projectIds.length === 0) return <p className="wrMuted">Open a project to plan it.</p>
  return (
    <div className="wrSummary">
      {rows.map(r => (
        <div key={r.id} className="wrPlanSummaryRow">
          {projectIds.length > 1 && <b>{titles[r.id] ?? 'Project'}</b>}
          <div className="wrKv"><span>{r.phase ? r.phase.title || 'Untitled phase' : 'No phase yet'}</span><span>{r.pct !== null ? `${r.pct}%` : ''}</span></div>
          {r.next && <div className="wrKv"><span>Next: {r.next.title || 'milestone'}</span><span>{r.next.date ? (daysBetween(today, r.next.date) === 0 ? 'today' : `in ${plural(daysBetween(today, r.next.date), 'day')}`) : 'no date'}</span></div>}
          <p className="wrHint">{r.counts}</p>
        </div>
      ))}
      <p className="wrHint">Open the Project tab at full size to define the phases, processes and the rest.</p>
    </div>
  )
}
