import { FACET_LABEL, unitOf } from '../../../../lib/facets'
import type { DayTotals } from '../../../../lib/facets'
import { review, type ReviewPeriod } from '../../../../lib/review'
import { useStoredState } from '../shared'
import { ViewMonthIcon, ViewWeekIcon } from '../../../icons'
import { FacetIcon } from './FacetIcon'
import { ICON_PX } from './IconBtn'

// A week or a month in review: each facet's total against the period before, and how many days had any work.

export function ReviewCard({ daily, today }: { daily: Record<string, DayTotals>; today: string }) {
  const [period, setPeriod] = useStoredState<ReviewPeriod>('scriblr.writer.schedule.review', 'week')
  const r = review(daily, today, period)
  return (
    <div className="wrSchedCard wrSchedReview">
      <div className="wrSchedHead">
        <span className="wrSchedSpacer" />
        <div className="wrSchedSeg" role="group" aria-label="Review period">
          <button type="button" className={period === 'week' ? 'on' : ''} aria-pressed={period === 'week'} aria-label="Week" title="Week" onClick={() => setPeriod('week')}><ViewWeekIcon size={ICON_PX} /></button>
          <button type="button" className={period === 'month' ? 'on' : ''} aria-pressed={period === 'month'} aria-label="Month" title="Month" onClick={() => setPeriod('month')}><ViewMonthIcon size={ICON_PX} /></button>
        </div>
      </div>
      <p className="wrMuted">{r.from} to {r.to} · worked on {r.activeDays} {r.activeDays === 1 ? 'day' : 'days'}</p>
      {r.rows.map(row => {
        const diff = row.now - row.before
        return (
          <div key={row.facet} className="wrSchedReviewRow">
            <FacetIcon facet={row.facet} />
            <span>{FACET_LABEL[row.facet]}</span>
            <b>{row.now.toLocaleString('en-US')} {unitOf(row.facet, row.now)}</b>
            <small className="wrMuted">{diff === 0 ? 'same as before' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toLocaleString('en-US')} ${diff > 0 ? 'more' : 'fewer'} than the ${period} before`}</small>
          </div>
        )
      })}
    </div>
  )
}
