import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { bestStreak, streakUntil } from '../../../../lib/activityCalendar'
import { FACETS, dayValue, emptyPlanner, type Facet, type Goal, type Planner } from '../../../../lib/facets'
import { currentOf } from '../../../../lib/goalFacts'
import { toIcs } from '../../../../lib/ics'
import { migrateLegacy } from '../../../../lib/legacySchedule'
import { getKv } from '../../../../settings/settingsStore'
import { goalProgress, addDays, weekOf } from '../../../../lib/projection'
import { shiftOccurrences } from '../../../../lib/recurrence'
import { slotOfDate } from '../../../../lib/ribbon'
import type { WeekStart } from '../../../../lib/scheduleCalendar'
import { FACET_COLOR } from '../../../../theme/zoneLooks'
import { SplitArea, type SplitTile } from '../SplitArea'
import { useStoredState } from '../shared'
import { ActivityCard, ActivityControls, useActivityState, type FacetGoalFacts } from './ActivityCard'
import { AnalyticsCard } from './AnalyticsCard'
import { Backlog } from './Backlog'
import { GoalsCard, type OwnedProgress } from './GoalsCard'
import { ReviewCard } from './ReviewCard'
import { ScheduleCard, type ScheduleOwner, type TicksApi } from './ScheduleCard'
import { DEFAULT_HUES, ScheduleSettings, SettingsButton, type FacetHues } from './ScheduleSettings'
import type { TargetOption } from './ShiftEditor'
import { getTicks, putTicks } from './scheduleApi'
import { useProjectFacts } from './useProjectFacts'
import { requestReminderPermission, useShiftReminders } from './useShiftReminders'
import { localToday, useSchedule } from './useSchedule'
import type { SplitNode } from '../../../../components/tiles/splitTree'

// The Schedule console: Goals, Activity (the grid or lines), the Schedule, the Backlog beside it, Analytics and a Review, each its own tile on a split
// grid (drag a title bar to move one, a divider to resize). At the Project level it is that project's; at the Dash it is every project's added
// together, with the account's own goals, shifts and routines too.

export const ACCOUNT_OWNER = 'account'
// Where the tiles sit before any is moved: the goals beside the activity on top, then the schedule with the backlog, the analytics and the review stacked beside it.
export const DEFAULT_TREE: SplitNode = {
  dir: 'col', ratio: 0.5,
  a: { dir: 'row', ratio: 0.34, a: { id: 'goals' }, b: { id: 'activity' } },
  b: { dir: 'row', ratio: 0.6, a: { id: 'schedule' }, b: { dir: 'col', ratio: 0.4, a: { id: 'backlog' }, b: { dir: 'col', ratio: 0.62, a: { id: 'analytics' }, b: { id: 'review' } } } },
}

const hueVars = (hues: FacetHues) => Object.fromEntries(FACETS.map(f => [`--wr-f-${f}`, `hsl(${hues[f]}, ${FACET_COLOR.s}%, ${FACET_COLOR.l}%)`]))

// `titleSlot` is the element in the console's tab-tile title bar where the Settings button goes (null while it is not drawn yet); without one (undefined) the button is the console's first row.
export default function ScheduleConsole({ scope, projectIds, titles, titleSlot }: { scope: 'dash' | 'project'; projectIds: string[]; titles: Record<string, string>; titleSlot?: HTMLElement | null }) {
  const schedule = useSchedule(projectIds)
  const activity = useActivityState()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const facts = useProjectFacts(projectIds)
  const [weekStart, setWeekStart] = useStoredState<WeekStart>('scriblr.weekStart', 'monday')
  const [hues, setHues] = useStoredState<FacetHues>('scriblr.writer.facetHues', DEFAULT_HUES)
  const [account, setAccount] = useStoredState<Planner>('scriblr.writer.planner.account', emptyPlanner())
  const [accountTicks, setAccountTicks] = useStoredState<Record<string, string[]>>('scriblr.writer.ticks.account', {})
  const [projectTicks, setProjectTicks] = useState<Record<string, string[]>>({})
  const [nowSlot, setNowSlot] = useState(() => slotOfDate(new Date()))
  useEffect(() => { const t = setInterval(() => setNowSlot(slotOfDate(new Date())), 30_000); return () => clearInterval(t) }, [])
  const today = schedule.loading ? localToday() : schedule.facets.today

  // ---- who owns what ----
  const owners: ScheduleOwner[] = useMemo(() => {
    const list: ScheduleOwner[] = projectIds.map(id => ({ id, label: titles[id] ?? 'Project', projectId: id, planner: schedule.planners[id] ?? emptyPlanner(), setPlanner: (p: Planner) => schedule.setPlanner(id, p) }))
    return scope === 'dash' ? [{ id: ACCOUNT_OWNER, label: 'Account', projectId: null, planner: { ...emptyPlanner(), ...account }, setPlanner: setAccount }, ...list] : list
  }, [scope, projectIds, titles, schedule.planners, schedule.setPlanner, account, setAccount])  // eslint-disable-line react-hooks/exhaustive-deps
  const goalOwner = owners[0]
  const planner = goalOwner?.planner ?? emptyPlanner()

  // The old task list, routine list and word goals (kept in the settings store) become the account's planner, once.
  const [moved, setMoved] = useStoredState<boolean>('scriblr.writer.planner.migrated', false)
  useEffect(() => {
    if (scope !== 'dash' || moved || schedule.loading) return
    setMoved(true)
    const m = migrateLegacy(getKv('scriblr.writer.tasks'), getKv('scriblr.writer.routines'), getKv('scriblr.writer.goals'), schedule.facets.today)
    if (!m) return
    setAccount({ ...emptyPlanner(), ...account, items: [...account.items, ...m.planner.items], routines: [...account.routines, ...m.planner.routines], goals: [...account.goals, ...m.planner.goals] })
    if (m.ticked.length) setAccountTicks({ ...accountTicks, [schedule.facets.today]: m.ticked })
  }, [scope, moved, schedule.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ticks, a day at a time ----
  const ticks: TicksApi = useMemo(() => ({
    get: (ownerId, date) => (ownerId === ACCOUNT_OWNER ? accountTicks[date] ?? [] : projectTicks[`${ownerId}|${date}`] ?? []),
    load: (ownerId, date) => {
      if (ownerId === ACCOUNT_OWNER || projectTicks[`${ownerId}|${date}`]) return
      getTicks(ownerId, date).then(ids => setProjectTicks(prev => ({ ...prev, [`${ownerId}|${date}`]: ids })), () => {})
    },
    set: (ownerId, date, id, on) => {
      const current = ownerId === ACCOUNT_OWNER ? accountTicks[date] ?? [] : projectTicks[`${ownerId}|${date}`] ?? []
      const next = on ? [...new Set([...current, id])] : current.filter(x => x !== id)
      if (ownerId === ACCOUNT_OWNER) setAccountTicks({ ...accountTicks, [date]: next })
      else { setProjectTicks(prev => ({ ...prev, [`${ownerId}|${date}`]: next })); putTicks(ownerId, date, next).catch(() => {}) }
    },
  }), [accountTicks, projectTicks, setAccountTicks])
  useEffect(() => { for (const o of owners) ticks.load(o.id, today) }, [owners.map(o => o.id).join(','), today]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- goals ----
  const { daily } = schedule.facets
  // Every owner's goals: at the Dash, the account's and each project's, each read against its own project (the account's against them all).
  const progress: OwnedProgress[] = useMemo(
    () => owners.flatMap(o => o.planner.goals.map(g => ({
      ownerId: o.id,
      p: goalProgress(g, { current: currentOf(g, o.id === ACCOUNT_OWNER ? facts : facts.filter(f => f.projectId === o.id), schedule.facets), daily, today, fallbackDeadline: o.planner.timelineEnd }),
    }))),
    [owners, facts, schedule.facets, daily, today],
  )
  // A line per facet: the account's own total goal for it, or else the project goals' totals added together.
  const totals = useMemo(() => {
    const out: Partial<Record<Facet, FacetGoalFacts>> = {}
    const wholes = progress.filter(x => x.p.goal.scope === 'project' && x.p.goal.total)
    for (const f of FACETS) {
      const mine = wholes.filter(x => x.p.goal.facet === f)
      const account = mine.filter(x => x.ownerId === ACCOUNT_OWNER)
      const use = account.length ? account.slice(0, 1) : mine
      if (use.length === 0) continue
      out[f] = { current: use.reduce((n, x) => n + x.p.current, 0), total: use.reduce((n, x) => n + (x.p.goal.total ?? 0), 0), deadline: use.map(x => x.p.deadline ?? '').filter(Boolean).sort().at(-1) ?? null }
    }
    return out
  }, [progress])
  const dailyGoals = useMemo(() => {
    const out: Partial<Record<Facet, number>> = {}
    for (const { p } of progress) if (p.goal.daily && !out[p.goal.facet]) out[p.goal.facet] = p.goal.daily
    return out
  }, [progress])
  const stats = useMemo(() => {
    const active = (d: string) => FACETS.some(f => dayValue(daily[d], f) > 0)
    let words = 0
    let writing = 0
    for (let d = weekOf(today); d <= today; d = addDays(d, 1)) { const v = dayValue(daily[d], 'draft'); words += v; if (v > 0) writing += 1 }
    const s = streakUntil(active, today)
    const b = bestStreak(active, today)
    return [
      { value: words.toLocaleString('en-US'), label: 'words this week' },
      { value: (writing ? Math.round(words / writing) : 0).toLocaleString('en-US'), label: 'words a writing day' },
      { value: `${s} ${s === 1 ? 'day' : 'days'}`, label: 'streak' },
      { value: `${b} ${b === 1 ? 'day' : 'days'}`, label: 'best streak' },
    ]
  }, [daily, today])

  // ---- what the pickers offer ----
  const single = scope === 'project' ? facts[0] : undefined
  const targets: TargetOption[] = useMemo(() => [
    ...(single?.outline ?? []).filter(n => ['book', 'arc', 'chapter', 'act', 'scene'].includes(n.kind)).map(n => ({ id: n.id, title: n.title, tree: 'outline' as const, kind: n.kind })),
    ...(single?.plot ?? []).filter(n => ['category', 'plotline'].includes(n.kind)).map(n => ({ id: n.id, title: n.title, tree: 'plot' as const, kind: n.kind })),
  ], [single])
  const bookTitles = useMemo(() => Object.fromEntries(facts.flatMap(f => f.outline.filter(n => n.kind === 'book').map(n => [n.id, n.title]))), [facts])

  // ---- reminders, export, print ----
  const upcoming = useMemo(() => owners.flatMap(o => shiftOccurrences(o.planner.shifts, o.planner.restDays, today, today)), [owners, today])
  useShiftReminders(upcoming, planner.reminderLeadMinutes, today)
  const exportIcs = useCallback(() => {
    const from = addDays(today, -7)
    const to = addDays(today, 120)
    const shifts = owners.flatMap(o => shiftOccurrences(o.planner.shifts, o.planner.restDays, from, to))
    const deadlines = owners.flatMap(o => o.planner.goals.filter((g: Goal) => g.deadline).map((g: Goal) => ({ date: g.deadline as string, title: `${g.facet} goal due` })))
    const url = URL.createObjectURL(new Blob([toIcs(shifts, deadlines)], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'scriblr-schedule.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [owners, today])
  const print = useCallback(() => { document.body.classList.add('wrPrintSchedule'); window.print(); document.body.classList.remove('wrPrintSchedule') }, [])

  if (schedule.error) return <p className="wrError" role="alert">{schedule.error}</p>
  if (!goalOwner) return <p className="wrMuted">Open a project to plan its schedule.</p>

  const settingsButton = <SettingsButton open={settingsOpen} onToggle={() => setSettingsOpen(o => !o)} />
  const tiles: SplitTile[] = [
    { id: 'goals', title: 'Goals', children: <GoalsCard owners={owners} progress={progress} stats={stats} nodes={single?.outline ?? []} scoped={scope === 'project'} /> },
    { id: 'review', title: 'Review', children: <ReviewCard daily={daily} today={today} /> },
    { id: 'activity', title: 'Activity', titleExtras: <ActivityControls state={activity} />, children: <ActivityCard state={activity} data={schedule.facets} today={today} weekStart={weekStart} dailyGoals={dailyGoals} totals={totals} /> },
    {
      id: 'schedule', title: 'Schedule',
      children: (
        <ScheduleCard
          owners={owners} today={today} nowSlot={nowSlot} events={schedule.facets.events} weekStart={weekStart} targets={targets} ticks={ticks}
        />
      ),
    },
    {
      id: 'backlog', title: 'Backlog',
      children: <Backlog owners={owners} today={today} todayTicks={Object.fromEntries(owners.map(o => [o.id, ticks.get(o.id, today)]))} onPlanner={(id, next) => owners.find(o => o.id === id)?.setPlanner(next)} onTick={(id, item, on) => ticks.set(id, today, item, on)} />,
    },
    { id: 'analytics', title: 'Analytics', children: <AnalyticsCard data={schedule.facets} today={today} titles={bookTitles} weekStart={weekStart} /> },
  ]
  return (
    <div className="wrSchedConsole" style={hueVars(hues) as CSSProperties}>
      {titleSlot === undefined ? <div className="wrSchedConsoleBar">{settingsButton}</div> : titleSlot && createPortal(settingsButton, titleSlot)}
      {settingsOpen && (
        <ScheduleSettings
          weekStart={weekStart} onWeekStart={setWeekStart} hues={hues} onHues={setHues} planner={planner} onPlanner={goalOwner.setPlanner}
          onReminders={lead => { if (lead !== null) void requestReminderPermission() }} onIcs={exportIcs} onPrint={print}
          scopeLabel={scope === 'dash' ? 'Account' : 'This project'} onClose={() => setSettingsOpen(false)}
        />
      )}
      <SplitArea gridId={`scriblr.writer.schedule.tiles.${scope}`} label="Schedule tiles" tiles={tiles.map(t => ({ ...t, bodyClassName: 'wrSchedTileBody' }))} defaultTree={DEFAULT_TREE} />
    </div>
  )
}
