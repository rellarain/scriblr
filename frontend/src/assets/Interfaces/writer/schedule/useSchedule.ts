import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emptyDay, emptyPlanner, type DayTotals, type FacetActivityData, type MonthTotals, type Planner } from '../../../../lib/facets'
import { getFacetActivity, getPlanner, getTicks, putPlanner, putTicks } from './scheduleApi'

// What the Schedule console reads: the activity and the planner of each project in its scope (one project at the Project level, all at the Dash),
// the activity added together. A planner is saved a moment after its last change.

const SAVE_DELAY_MS = 500
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
  const [planners, setPlanners] = useState<Record<string, Planner>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pending = useRef(new Map<string, Planner>())

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    if (projectIds.length === 0) { setFacets(NONE); setPlanners({}); setLoading(false); return undefined }
    Promise.all(projectIds.map(id => Promise.all([getFacetActivity(id), getPlanner(id)])))
      .then(rows => {
        if (!live) return
        setFacets(mergeFacetActivity(rows.map(r => r[0])))
        setPlanners(Object.fromEntries(rows.map((r, i) => [projectIds[i], { ...emptyPlanner(), ...r[1] }])))
        setLoading(false)
      })
      .catch((e: unknown) => { if (live) { setError(e instanceof Error ? e.message : 'Could not load the schedule.'); setLoading(false) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])

  const flush = useCallback((projectId: string) => {
    const next = pending.current.get(projectId)
    pending.current.delete(projectId)
    timers.current.delete(projectId)
    if (next) putPlanner(projectId, next).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save the schedule.'))
  }, [])

  const setPlanner = useCallback((projectId: string, next: Planner) => {
    setPlanners(prev => ({ ...prev, [projectId]: next }))
    pending.current.set(projectId, next)
    const old = timers.current.get(projectId)
    if (old) clearTimeout(old)
    timers.current.set(projectId, setTimeout(() => flush(projectId), SAVE_DELAY_MS))
  }, [flush])

  // Save what is waiting when the console goes away.
  useEffect(() => () => { for (const [id, t] of timers.current) { clearTimeout(t); flush(id) } }, [flush])

  const reload = useCallback(() => setVersion(v => v + 1), [])
  const setTicks = useCallback(async (projectId: string, date: string, ids: string[]) => { await putTicks(projectId, date, ids) }, [])

  return useMemo(() => ({ loading, error, facets, planners, setPlanner, reload, ticks: getTicks, setTicks }), [loading, error, facets, planners, setPlanner, reload, setTicks])
}
