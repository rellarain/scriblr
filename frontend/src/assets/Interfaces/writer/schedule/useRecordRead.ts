import { useEffect } from 'react'
import { passState } from '../../../../lib/revisionPasses'
import { getPlanner, recordRead } from './scheduleApi'
import { localToday } from './useSchedule'

// A chapter opened in the Preview counts as read for a revision pass's reading goal: when the project has a pass running today with a
// "Read every chapter once" goal, the opening is recorded (an activity event, facet "revision", action "read"; no revision work in the totals).
// Nothing is recorded when no such pass runs. A failure is quiet: it only means one read less.
export function useRecordRead(projectId: string | null, chapterId: string) {
  useEffect(() => {
    if (!projectId) return undefined
    let live = true
    getPlanner(projectId)
      .then(planner => {
        if (!live) return
        const today = localToday()
        const reading = (planner?.passes ?? []).some(p => passState(p, today) === 'running' && p.goals.some(g => g.kind === 'read'))
        if (reading) void recordRead(projectId, chapterId).catch(() => undefined)
      })
      .catch(() => undefined)
    return () => { live = false }
  }, [projectId, chapterId])
}
