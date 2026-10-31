import { useMemo } from 'react'
import { FACETS, FACET_LABEL, type Facet, type FacetActivityData } from '../../../../lib/facets'
import { goalSeries } from '../../../../lib/projection'
import { buildFacetGrid, type ShadeRule, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useStoredState } from '../shared'
import { FacetCalendar, FacetLegend } from './FacetCalendar'
import { LineGraph } from './LineGraph'

// Activity, as the grid or as lines: the facets to show (several), what the shades are measured against, and the view.

export interface FacetGoalFacts { current: number; total: number; deadline: string | null }
export type View = 'grid' | 'line'

export function ActivityCard({
  data, today, weekStart, dailyGoals, totals,
}: {
  data: FacetActivityData
  today: string
  weekStart: WeekStart
  dailyGoals: Partial<Record<Facet, number>>
  totals: Partial<Record<Facet, FacetGoalFacts>>
}) {
  const [view, setView] = useStoredState<View>('scriblr.writer.schedule.view', 'grid')
  const [rule, setRule] = useStoredState<ShadeRule>('scriblr.writer.schedule.rule', 'goal')
  const [shown, setShown] = useStoredState<Facet[]>('scriblr.writer.schedule.facets', FACETS)
  const facets = FACETS.filter(f => shown.includes(f))
  const toggle = (f: Facet) => {
    const next = shown.includes(f) ? shown.filter(x => x !== f) : [...shown, f]
    if (next.length > 0) setShown(next) // at least one stays on
  }
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
  const without = facets.filter(f => !totals[f] || totals[f]?.total === 0)
  const deadline = lines.map(l => totals[l.facet]?.deadline ?? '').filter(Boolean).sort().at(-1) ?? null
  const words = grid.total.draft
  return (
    <div className="wrSchedCard wrSchedActivity">
      <div className="wrSchedHead">
        <span className="wrSchedSpacer" />
        <div className="wrSchedSeg" role="group" aria-label="Chart type">
          <button type="button" className={view === 'grid' ? 'on' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
          <button type="button" className={view === 'line' ? 'on' : ''} aria-pressed={view === 'line'} onClick={() => setView('line')}>Line graph</button>
        </div>
      </div>
      <div className="wrSchedTools">
        {FACETS.map(f => (
          <button key={f} type="button" className={`wrSchedFacet${shown.includes(f) ? ' on' : ''}`} aria-pressed={shown.includes(f)} onClick={() => toggle(f)}>
            <i className="wrSchedDot" style={{ background: `var(--wr-f-${f})` }} />{FACET_LABEL[f]}
          </button>
        ))}
        <span className="wrSchedSpacer" />
        {view === 'grid' && (
          <div className="wrSchedSeg" role="group" aria-label="Shade against">
            <button type="button" className={rule === 'goal' ? 'on' : ''} aria-pressed={rule === 'goal'} onClick={() => setRule('goal')}>Vs goal</button>
            <button type="button" className={rule === 'busiest' ? 'on' : ''} aria-pressed={rule === 'busiest'} onClick={() => setRule('busiest')}>Vs busiest day</button>
          </div>
        )}
      </div>
      {view === 'grid' ? (
        <>
          <FacetCalendar grid={grid} weekStart={weekStart} />
          <div className="wrSchedFoot">
            <span className="wrMuted">{words.toLocaleString('en-US')} words drafted on {grid.activeDays} active days{rule === 'goal' ? ', shaded by share of each daily goal where there is one' : ''}</span>
            <FacetLegend />
          </div>
        </>
      ) : (
        <>
          {lines.length > 0 ? <LineGraph series={lines} today={today} deadline={deadline} /> : <p className="wrMuted">Set a total goal for a facet to draw its line.</p>}
          <div className="wrSchedFoot">
            <span className="wrMuted">
              Each line is the share of that facet&rsquo;s total goal done. Solid is logged; dotted is the last 28 days&rsquo; pace carried on.
              {without.length > 0 && lines.length > 0 ? ` No total goal for ${without.map(f => FACET_LABEL[f]).join(', ')}.` : ''}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
