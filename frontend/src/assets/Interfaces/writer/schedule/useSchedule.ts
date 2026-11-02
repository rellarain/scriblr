import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { emptyDay, emptyPlanner, type DayTotals, type FacetActivityData, type MonthTotals, type Planner } from '../../../../lib/facets'
import { planStore } from './planStore'
import { getFacetActivity, getPlanner, getTicks, putTicks } from './scheduleApi'

// What the Schedule console reads: the activity and the planner of each project in its scope (one project at the Project level, all at the Dash),
// the activity added together. The planners are the ones every console shares (planStore): a planner is saved a moment after its last change.

// The machine's own day, as the backend counts days.
export const localToday = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function mergeFacetActivity(list: FacetActivityData[]): FacetActivityData {
  const daily: Record<string, DayTotals> = {}
  const monthly: Record<string, MonthTotals> = {}
  const add = (into: DayTotals, from: DayTotals) => {
    for (const f of ['outline', 'plot', 'draft', 'revision', 'project', 'flagsApplied', 'flagsResolved'] as const) into[f] += from[f]
    for (const [k, v] of Object.entries(from.books)) into.books[k] = (into.books[k] ?? 0) + v
    for (const [k, v] of Object.entries(from.kinds)) into.kinds[k] = (into.kinds[k] ?? 0) + v
  }
  for (const data of list) {
    for (const [date, d] of Object.entries(data.daily ?? {})) add((daily[date] ??= emptyDay()), d)
    for (const [key, m] of Object.entries(data.monthly ?? {})) {
      const into = (monthly[key] ??= { ...emptyDay(), activeDays: 0 })
      add(into, m)
      into.activeDays += m.activeDays
    }
  }
  return { today: list[0]?.today ?? localToday(), events: list.flatMap(d => d.events ?? []), daily, monthly }
}

export interface ScheduleData {
  loading: boolean
  error: string | null
  facets: FacetActivityData
  planners: Record<string, Planner>
  setPlanner: (projectId: string, next: Planner) => void
  reload: () => void
  ticks: (projectId: string, date: string) => Promise<string[]>
  setTicks: (projectId: string, date: string, ids: string[]) => Promise<void>
}

const NONE: FacetActivityData = { today: localToday(), events: [], daily: {}, monthly: {} }

export function useSchedule(projectIds: string[]): ScheduleData {
  const key = projectIds.join(',')
  const [facets, setFacets] = useState<FacetActivityData>(NONE)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  // Moves when any console changes a planner (or a save fails).
  const stored = useSyncExternalStore(planStore.subscribe, planStore.version)
  const saveError = useSyncExternalStore(planStore.subscribe, planStore.error)

  useEffect(() => {
    let live = true
    setLoading(true)
    setLoadError(null)
    if (projectIds.length === 0) { setFacets(NONE); setLoading(false); return undefined }
    Promise.all(projectIds.map(id => Promise.all([getFacetActivity(id), getPlanner(id)])))
      .then(rows => {
        if (!live) return
        setFacets(mergeFacetActivity(rows.map(r => r[0])))
        rows.forEach((r, i) => planStore.load(projectIds[i], r[1]))
        setLoading(false)
      })
      .catch((e: unknown) => { if (live) { setLoadError(e instanceof Error ? e.message : 'Could not load the schedule.'); setLoading(false) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])

  const planners = useMemo(
    () => Object.fromEntries(projectIds.map(id => [id, planStore.get(id) ?? emptyPlanner()])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, stored],
  )
  const setPlanner = useCallback((projectId: string, next: Planner) => planStore.set(projectId, next), [])

  // Save what is waiting when the console goes away.
  useEffect(() => () => planStore.flush(), [])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  const setTicks = useCallback(async (projectId: string, date: string, ids: string[]) => { await putTicks(projectId, date, ids) }, [])

  return useMemo(
    () => ({ loading, error: loadError ?? saveError, facets, planners, setPlanner, reload, ticks: getTicks, setTicks }),
    [loading, loadError, saveError, facets, planners, setPlanner, reload, setTicks],
  )
}
