import { useMemo, useState } from 'react'
import { ActivityCalendar, CalendarLegend } from '../../../components/ActivityCalendar'
import { NumberInput } from '../../../components/NumberInput'
import { bestStreak, buildCalendar, lastWeek, streakUntil } from '../../../lib/activityCalendar'
import { useStoredState } from './shared'
import { useWritingDays, type WritingDay, type WritingDays } from './useWritingDays'

// The Writer's analytics from the Reader's: how much was written each day (a calendar of the last 12 months), this week's words, the streak, a
// bar for each day of the week and the writer's goals. Over one project (the Project level) or all of them (the Dash).

type Metric = 'words' | 'edits' | 'revisions'
const METRICS: { key: Metric; label: string; unit: string; idle: string }[] = [
  { key: 'words', label: 'Words', unit: 'words', idle: 'No writing' },
  { key: 'edits', label: 'Edits', unit: 'edits', idle: 'No edits' },
  { key: 'revisions', label: 'Revisions', unit: 'revisions', idle: 'No revisions' },
]

export interface WritingGoals { wordsPerDay: number; wordsPerWeek: number }
export const DEFAULT_GOALS: WritingGoals = { wordsPerDay: 500, wordsPerWeek: 3000 }

const isActive = (d: WritingDay | undefined): boolean => Boolean(d) && (d as WritingDay).words + (d as WritingDay).edits + (d as WritingDay).revisions > 0

export interface WritingStats {
  wordsThisWeek: number
  activeDaysThisWeek: number
  wordsPerActiveDay: number
  streak: number
  best: number
  wordsToday: number
  week: { date: string; letter: string; words: number }[]
}

export function writingStats(days: WritingDays, today: string): WritingStats {
  const week = lastWeek(today).map(d => ({ ...d, words: days[d.date]?.words ?? 0 }))
  const wordsThisWeek = week.reduce((n, d) => n + d.words, 0)
  const activeDaysThisWeek = week.filter(d => isActive(days[d.date])).length
  const writingDays = week.filter(d => d.words > 0).length
  return {
    wordsThisWeek,
    activeDaysThisWeek,
    wordsPerActiveDay: writingDays > 0 ? Math.round(wordsThisWeek / writingDays) : 0,
    streak: streakUntil(date => isActive(days[date]), today),
    best: bestStreak(date => isActive(days[date]), today),
    wordsToday: days[today]?.words ?? 0,
    week,
  }
}

const Stat = ({ value, label }: { value: string | number; label: string }) => <div><strong>{value}</strong><span>{label}</span></div>
const Meter = ({ percent, label }: { percent: number; label: string }) => (
  <div className="wrBarTrack" role="img" aria-label={label}><div className="wrBarFill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>
)

export default function WritingAnalytics({ projectIds, today = new Date().toISOString().slice(0, 10) }: { projectIds: string[]; today?: string }) {
  const { days, error } = useWritingDays(projectIds)
  const [metric, setMetric] = useState<Metric>('words')
  const [goals, setGoals] = useStoredState<WritingGoals>('scriblr.writer.goals', DEFAULT_GOALS)
  const spec = METRICS.find(m => m.key === metric) as (typeof METRICS)[number]
  const grid = useMemo(() => {
    const values: Record<string, number> = {}
    for (const [date, d] of Object.entries(days ?? {})) values[date] = d[metric]
    return buildCalendar(values, today, spec.unit, spec.idle)
  }, [days, metric, today, spec.unit, spec.idle])
  const stats = useMemo(() => writingStats(days ?? {}, today), [days, today])
  if (error) return <p className="wrError" role="alert">{error}</p>
  if (!days) return <p className="wrMuted">Loading…</p>
  const top = Math.max(1, ...stats.week.map(d => d.words))
  const setGoal = (patch: Partial<WritingGoals>) => setGoals({ ...goals, ...patch })
  const number = (label: string, key: keyof WritingGoals, max: number) => (
    <label className="wrKv">
      <span>{label}</span>
      <NumberInput className="wrField wrCalNum" label={label} min={1} max={max} value={goals[key]} onChange={n => setGoal({ [key]: n })} />
    </label>
  )
  return (
    <div className="wrColumn wrColumn--bare">
      <div className="wrCard">
        <div className="wrCardTitle">This week</div>
        <div className="wrStatRow">
          <Stat value={stats.wordsThisWeek.toLocaleString('en-US')} label="words this week" />
          <Stat value={stats.wordsPerActiveDay.toLocaleString('en-US')} label="words a writing day" />
          <Stat value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`} label="streak" />
          <Stat value={`${stats.best} ${stats.best === 1 ? 'day' : 'days'}`} label="best streak" />
        </div>
      </div>
      <div className="wrCard">
        <div className="wrCardTitle">Writing, last 12 months</div>
        <ActivityCalendar grid={grid} prefix="wr" unit={spec.unit} />
        <div className="wrCalFoot">
          {METRICS.map(m => <button key={m.key} type="button" className={metric === m.key ? 'wrSmallBtn wrSmallBtn--accent' : 'wrSmallBtn'} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}
          <span className="wrMuted">{grid.total.toLocaleString('en-US')} {spec.unit} on {grid.activeDays} days</span>
          <CalendarLegend prefix="wr" />
        </div>
      </div>
      <div className="wrCard">
        <div className="wrCardTitle">Words per day this week</div>
        <div className="wrCalCols" role="img" aria-label="Words per day this week">
          {stats.week.map(d => <div key={d.date}><span>{d.words}</span><i style={{ height: `${Math.max(2, (d.words / top) * 70)}px` }} /><span>{d.letter}</span></div>)}
        </div>
      </div>
      <div className="wrCard">
        <div className="wrCardTitle">Goals</div>
        {number('Words a day', 'wordsPerDay', 100000)}
        <div className="wrKv"><span>Today</span><span>{stats.wordsToday.toLocaleString('en-US')} of {goals.wordsPerDay.toLocaleString('en-US')}</span></div>
        <Meter percent={(stats.wordsToday / goals.wordsPerDay) * 100} label="Today's words against the daily goal" />
        {number('Words a week', 'wordsPerWeek', 700000)}
        <div className="wrKv"><span>This week</span><span>{stats.wordsThisWeek.toLocaleString('en-US')} of {goals.wordsPerWeek.toLocaleString('en-US')}</span></div>
        <Meter percent={(stats.wordsThisWeek / goals.wordsPerWeek) * 100} label="This week's words against the weekly goal" />
        <p className="wrHint">A day&rsquo;s words are the net change in your drafts that day; a day you cut more than you wrote counts as none. Days are UTC, as recorded.</p>
      </div>
    </div>
  )
}
