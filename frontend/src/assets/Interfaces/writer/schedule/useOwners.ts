import { useMemo } from 'react'
import { emptyPlanner, normalizePlanner, type Planner } from '../../../../lib/facets'
import { currentOf } from '../../../../lib/goalFacts'
import type { FacetActivityData } from '../../../../lib/facets'
import type { ProjectFacts } from '../../../../lib/goalFacts'
import { goalProgress } from '../../../../lib/projection'
import { useStoredState } from '../shared'
import type { OwnedProgress } from './GoalsCard'
import type { ScheduleOwner } from './ScheduleCard'
import type { ScheduleData } from './useSchedule'

// Who owns the plan in a console: each project in its scope, and at the Dash the account too (its planner is kept in the settings store, free JSON, so
// every console of the Dash reads and writes the one copy). Shared by the Schedule and the Project consoles.

export const ACCOUNT_OWNER = 'account'

export function useOwners(scope: 'dash' | 'project', projectIds: string[], titles: Record<string, string>, schedule: Pick<ScheduleData, 'planners' | 'setPlanner'>) {
  const [accountRaw, setAccount] = useStoredState<Planner>('scriblr.writer.planner.account', emptyPlanner())
  const account = useMemo(() => normalizePlanner(accountRaw), [accountRaw])
  const owners: ScheduleOwner[] = useMemo(() => {
    const list: ScheduleOwner[] = projectIds.map(id => ({ id, label: titles[id] ?? 'Project', projectId: id, planner: schedule.planners[id] ?? emptyPlanner(), setPlanner: (p: Planner) => schedule.setPlanner(id, p) }))
    return scope === 'dash' ? [{ id: ACCOUNT_OWNER, label: 'Account', projectId: null, planner: account, setPlanner: setAccount }, ...list] : list
  }, [scope, projectIds, titles, schedule.planners, schedule.setPlanner, account, setAccount])  // eslint-disable-line react-hooks/exhaustive-deps
  return { owners, account, setAccount }
}

// Every owner's goals with their progress: at the Dash, the account's and each project's, each read against its own project (the account's against them all).
export function ownedProgress(owners: ScheduleOwner[], facts: ProjectFacts[], data: FacetActivityData, today: string): OwnedProgress[] {
  return owners.flatMap(o => o.planner.goals.map(g => ({
    ownerId: o.id,
    p: goalProgress(g, { current: currentOf(g, o.id === ACCOUNT_OWNER ? facts : facts.filter(f => f.projectId === o.id), data), daily: data.daily, today, fallbackDeadline: o.planner.timelineEnd }),
  })))
}
