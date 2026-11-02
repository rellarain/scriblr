import { useMemo } from 'react'
import { FACETS, FACET_LABEL, type Facet, type FacetActivityData } from '../../../../lib/facets'
import { goalSeries } from '../../../../lib/projection'
import { buildFacetGrid, type ShadeRule, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useStoredState } from '../shared'
import { GridViewIcon, LineChartIcon } from '../../../icons'
import { FacetCalendar } from './FacetCalendar'
import { FacetIcon } from './FacetIcon'
import { LineGraph } from './LineGraph'
import { ICON_PX } from './IconBtn'

// Activity, as the grid or as lines: the facets to show (several), what the shades are measured against, and the view. The controls are in the tile's
// title bar (ActivityControls); the chart takes the height of the tile.

export interface FacetGoalFacts { current: number; total: number; deadline: string | null }
export type View = 'grid' | 'line'

export interface ActivityState {
  view: View
  setView: (v: View) => void
  rule: ShadeRule
  setRule: (r: ShadeRule) => void
  shown: Facet[]
  toggle: (f: Facet) => void
}

export function useActivityState(): ActivityState {
  const [view, setView] = useStoredState<View>('scriblr.writer.schedule.view', 'grid')
  const [rule, setRule] = useStoredState<ShadeRule>('scriblr.writer.schedule.rule', 'goal')
  const [shown, setShown] = useStoredState<Facet[]>('scriblr.writer.schedule.facets', FACETS)
  const toggle = (f: Facet) => {
    const next = shown.includes(f) ? shown.filter(x => x !== f) : [...shown, f]
    if (next.length > 0) setShown(next) // at least one stays on
  }
  return { view, setView, rule, setRule, shown, toggle }
}

// The tile's toggles, for its title bar: the facets (several), the chart (an icon each) and, for the grid, what the shades are measured against
// (% of the daily goal, or # against the busiest day).
export function ActivityControls({ state }: { state: ActivityState }) {
  const { view, setView, rule, setRule, shown, toggle } = state
  return (
    <>
      <div className="wrActFacets" role="group" aria-label="Facets">
        {FACETS.map(f => (
          <button key={f} type="button" className={`wrSchedFacet${shown.includes(f) ? ' on' : ''}`} aria-pressed={shown.includes(f)} onClick={() => toggle(f)}>
            <FacetIcon facet={f} />{FACET_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="wrActModes">
      <div className="wrSchedSeg" role="group" aria-label="Chart type">
        <button type="button" className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} aria-label="Grid" title="Grid" onClick={() => setView('grid')}><GridViewIcon size={ICON_PX} /></button>
        <button type="button" className={view === 'line' ? 'on' : ''} aria-pressed={view === 'line'} aria-label="Line graph" title="Line graph" onClick={() => setView('line')}><LineChartIcon size={ICON_PX} /></button>
      </div>
      {view === 'grid' && (
        <div className="wrSchedSeg" role="group" aria-label="Shade against">
          <button type="button" className={rule === 'goal' ? 'on' : ''} aria-pressed={rule === 'goal'} aria-label="Vs goal" title="Shade against the daily goal" onClick={() => setRule('goal')}>%</button>
          <button type="button" className={rule === 'busiest' ? 'on' : ''} aria-pressed={rule === 'busiest'} aria-label="Vs busiest day" title="Shade against the busiest day" onClick={() => setRule('busiest')}>#</button>
        </div>
      )}
      </div>
    </>
  )
}

export function ActivityCard({
  state, data, today, weekStart, dailyGoals, totals,
}: {
  state: ActivityState
  data: FacetActivityData
  today: string
  weekStart: WeekStart
  dailyGoals: Partial<Record<Facet, number>>
  totals: Partial<Record<Facet, FacetGoalFacts>>
}) {
  const { view, rule, shown } = state
  const facets = FACETS.filter(f => shown.includes(f))
  const grid = useMemo(
    () => buildFacetGrid({ daily: data.daily, monthly: data.monthly, today, facets, rule, dailyGoals, weekStart }),
    [data.daily, data.monthly, today, facets.join(','), rule, dailyGoals, weekStart], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const lines = useMemo(
    () => facets.flatMap(f => {
      const t = totals[f]
      return t && t.total > 0 ? [{ facet: f, goal: goalSeries(f, { daily: data.daily, monthly: data.monthly, today, current: t.current, total: t.total, deadline: t.deadline }) }] : []
    }),
    [data.daily, data.monthly, today, totals, facets.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const deadline = lines.map(l => totals[l.facet]?.deadline ?? '').filter(Boolean).sort().at(-1) ?? null
  return (
    <div className="wrSchedCard wrSchedActivity">
      {view === 'grid'
        ? <FacetCalendar grid={grid} weekStart={weekStart} />
        : lines.length > 0 ? <LineGraph series={lines} today={today} deadline={deadline} /> : <p className="wrMuted">Set a total goal for a facet to draw its line.</p>}
    </div>
  )
}
