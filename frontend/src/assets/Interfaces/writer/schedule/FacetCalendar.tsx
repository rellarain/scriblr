import { useEffect, useRef } from 'react'
import { FACET_LABEL, type Facet } from '../../../../lib/facets'
import { rowLetters, type FacetGrid, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useShiftScrollX } from '../../../../lib/useShiftScrollX'

// The activity grid: a square a day, a column a week, the weeks' months as rectangles above them and the months before the grid as bars to the left
// of it. The day letters sit between the bars and the grid. Today has an outline in the ink colour. It scrolls sideways by touch or Shift + the wheel,
// and opens at the latest weeks.

export function FacetCalendar({ grid, weekStart }: { grid: FacetGrid; weekStart: WeekStart }) {
  const scroller = useRef<HTMLDivElement>(null)
  useShiftScrollX(scroller)
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth }, [grid.weeks])
  const summary = `${grid.activeDays} active days in the last 12 months`
  return (
    <div className="wrSchedCal">
      <div className="wrSchedCalScroll" ref={scroller} tabIndex={0} aria-label="Activity grid; Shift and the wheel scroll it sideways">
        <div className="wrSchedCalInner">
          <div className="wrSchedCalTop">
            {grid.bars.length > 0 && <div className="wrSchedCalBarsHead" style={{ width: grid.bars.length * 16 - 2 }}>Before · a day</div>}
            <div className="wrSchedCalLetterGap" />
            <div className="wrSchedCalMonths" style={{ gridTemplateColumns: `repeat(${grid.weeks}, 14px)` }}>
              {grid.months.map(m => <span key={m.key} className="wrSchedCalMonth" style={{ gridColumn: `${m.col} / span ${m.span}` }}>{m.name}</span>)}
            </div>
          </div>
          <div className="wrSchedCalRows">
            {grid.bars.length > 0 && (
              <div className="wrSchedCalBars" role="img" aria-label="Average a day in each month before the last 12 months">
                {grid.bars.map(b => (
                  <div key={b.key} className="wrSchedCalBar" title={b.title} style={{ height: `${Math.max(0, b.height) * 100}%` }}>
                    {b.segments.map(s => <i key={s.facet} style={{ height: `${s.part * 100}%`, background: `var(--wr-f-${s.facet})` }} />)}
                  </div>
                ))}
              </div>
            )}
            <div className="wrSchedCalLetters" aria-hidden="true">{rowLetters(weekStart).map((l, i) => <span key={i}>{l}</span>)}</div>
            <div className="wrSchedCalGrid" role="img" aria-label={summary}>
              {grid.cells.map(c => (
                <i key={c.date} className={`wrSchedCalCell wrSchedCalCell--${c.level < 0 ? 'x' : c.level}${c.today ? ' wrSchedCalCell--today' : ''}${c.met ? ' wrSchedCalCell--met' : ''}`} title={c.title} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FacetLegend() {
  return (
    <span className="wrSchedLegend" aria-hidden="true">
      Less{[0, 1, 2, 3, 4].map(l => <i key={l} className={`wrSchedCalCell wrSchedCalCell--${l}`} />)}More
      <i className="wrSchedCalCell wrSchedCalCell--0 wrSchedCalCell--today" />Today
    </span>
  )
}

export const facetName = (f: Facet): string => FACET_LABEL[f]
