import { useEffect, useState } from 'react'
import type { DayTotals } from '../../../../lib/facets'
import { getFacetActivity } from '../schedule/scheduleApi'

// The project's activity a day (net words drafted, nodes made by kind), read when the component mounts or the project changes: what a book's
// estimates take the writer's usual pace from. Nothing until it has come, and nothing when it cannot be read.
export function useDailyActivity(projectId: string | null): Record<string, DayTotals> {
  const [daily, setDaily] = useState<Record<string, DayTotals>>({})
  useEffect(() => {
    if (!projectId) return undefined
    let live = true
    getFacetActivity(projectId).then(d => { if (live) setDaily(d.daily ?? {}) }, () => undefined)
    return () => { live = false }
  }, [projectId])
  return daily
}
