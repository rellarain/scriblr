import { useEffect, useRef } from 'react'
import type { ActivityGrid } from '../lib/activityCalendar'

// A GitHub-style calendar of one number a day (lib/activityCalendar.ts). `prefix` is the class family of the page that draws it (rd for the
// Reader, wr for the Writer): <prefix>Cal, <prefix>CalDays, <prefix>CalScroll, <prefix>CalMonths, <prefix>CalGrid, <prefix>CalCell.
// When it is wider than its card it opens scrolled to the latest weeks, as GitHub's does.

export function ActivityCalendar({ grid, prefix, unit }: { grid: ActivityGrid; prefix: 'rd' | 'wr'; unit: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth }, [grid.weeks])
  return (
    <div className={`${prefix}Cal`}>
      <div className={`${prefix}CalDays`} aria-hidden="true"><span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /></div>
      <div className={`${prefix}CalScroll`} ref={scroller}>
        <div className={`${prefix}CalMonths`} style={{ gridTemplateColumns: `repeat(${grid.weeks}, 14px)` }}>
          {grid.months.map(m => <span key={`${m.label}-${m.col}`} style={{ gridColumn: m.col }}>{m.label}</span>)}
        </div>
        <div className={`${prefix}CalGrid`} role="img" aria-label={`${grid.total.toLocaleString('en-US')} ${unit} on ${grid.activeDays} days`}>
          {grid.cells.map(c => <i key={c.date} className={`${prefix}CalCell ${prefix}CalCell--${c.level < 0 ? 'x' : c.level}`} title={c.title} />)}
        </div>
      </div>
    </div>
  )
}

export function CalendarLegend({ prefix }: { prefix: 'rd' | 'wr' }) {
  return <span className={`${prefix}CalLegend`} aria-hidden="true">Less{[0, 1, 2, 3, 4].map(l => <i key={l} className={`${prefix}CalCell ${prefix}CalCell--${l}`} />)}More</span>
}
