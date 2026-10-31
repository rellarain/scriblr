import { useEffect, useRef } from 'react'
import type { ActivityGrid, WeekStart } from '../lib/activityCalendar'
import { rowLetters } from '../lib/scheduleCalendar'
import { useShiftScrollX } from '../lib/useShiftScrollX'

// The Reader's calendar of one number a day (lib/activityCalendar.ts): the months as rectangles with their whole names over the weeks that begin in
// them, one letter beside every row, and today outlined in the ink colour. `prefix` is the class family of the page that draws it (rd for the Reader):
// <prefix>Cal, <prefix>CalScroll, <prefix>CalInner, <prefix>CalTop, <prefix>CalMonths, <prefix>CalMonth, <prefix>CalRows, <prefix>CalLetters,
// <prefix>CalGrid, <prefix>CalCell. It opens scrolled to the latest weeks, and scrolls sideways by touch or Shift + the wheel.

export function ActivityCalendar({ grid, prefix, unit, weekStart = 'monday' }: { grid: ActivityGrid; prefix: 'rd'; unit: string; weekStart?: WeekStart }) {
  const scroller = useRef<HTMLDivElement>(null)
  useShiftScrollX(scroller)
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth }, [grid.weeks])
  return (
    <div className={`${prefix}Cal`}>
      <div className={`${prefix}CalScroll`} ref={scroller} tabIndex={0} aria-label="Activity calendar; Shift and the wheel scroll it sideways">
        <div className={`${prefix}CalInner`}>
          <div className={`${prefix}CalTop`}>
            <span className={`${prefix}CalLetterGap`} />
            <div className={`${prefix}CalMonths`} style={{ gridTemplateColumns: `repeat(${grid.weeks}, 14px)` }}>
              {grid.months.map(m => <span key={`${m.label}-${m.col}`} className={`${prefix}CalMonth`} style={{ gridColumn: `${m.col} / span ${m.span}` }}>{m.label}</span>)}
            </div>
          </div>
          <div className={`${prefix}CalRows`}>
            <div className={`${prefix}CalLetters`} aria-hidden="true">{rowLetters(weekStart).map((l, i) => <span key={i}>{l}</span>)}</div>
            <div className={`${prefix}CalGrid`} role="img" aria-label={`${grid.total.toLocaleString('en-US')} ${unit} on ${grid.activeDays} days`}>
              {grid.cells.map(c => <i key={c.date} className={`${prefix}CalCell ${prefix}CalCell--${c.level < 0 ? 'x' : c.level}${c.today ? ` ${prefix}CalCell--today` : ''}`} title={c.title} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CalendarLegend({ prefix }: { prefix: 'rd' }) {
  return (
    <span className={`${prefix}CalLegend`} aria-hidden="true">
      Less{[0, 1, 2, 3, 4].map(l => <i key={l} className={`${prefix}CalCell ${prefix}CalCell--${l}`} />)}More
      <i className={`${prefix}CalCell ${prefix}CalCell--0 ${prefix}CalCell--today`} />Today
    </span>
  )
}
