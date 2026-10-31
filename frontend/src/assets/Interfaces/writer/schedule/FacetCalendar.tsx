import { useEffect, useRef } from 'react'
import { FACET_LABEL, type Facet } from '../../../../lib/facets'
import { rowLetters, type FacetGrid, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useShiftScrollX } from '../../../../lib/useShiftScrollX'
import { useElementSize } from '../useElementSize'

// The activity grid: a square a day, a column a week, the weeks' months as rectangles above them and the months before the grid as bars to the left
// of it. The day letters sit between the bars and the grid. Today has an inset outline in the ink colour. The squares grow and shrink so the seven rows
// fill the tile's height (CELL_MIN to CELL_MAX). It scrolls sideways by touch or Shift + the wheel,
// and opens at the latest weeks.

export const CELL_DEFAULT = 14
const CELL_MIN = 8
const CELL_MAX = 40
const GAP = 4 // --space-2
const TOP = 28 // the months' row (22px) and the space under it (--space-3)

// The side of a square that fits seven rows and the months' row in `height`.
export const cellFor = (height: number | null): number =>
  height === null ? CELL_DEFAULT : Math.min(CELL_MAX, Math.max(CELL_MIN, Math.floor((height - TOP - GAP - GAP * 6) / 7)))

export function FacetCalendar({ grid, weekStart }: { grid: FacetGrid; weekStart: WeekStart }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [boxRef, box] = useElementSize()
  const cell = cellFor(box ? box.height : null)
  useShiftScrollX(scroller)
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth }, [grid.weeks])
  const summary = `${grid.activeDays} active days in the last 12 months`
  return (
    <div className="wrSchedCal" ref={boxRef} style={{ ['--cell' as string]: `${cell}px` }}>
      <div className="wrSchedCalScroll" ref={scroller} tabIndex={0} aria-label="Activity grid; Shift and the wheel scroll it sideways">
        <div className="wrSchedCalInner">
          <div className="wrSchedCalTop">
            {grid.bars.length > 0 && <div className="wrSchedCalBarsHead" style={{ width: `calc(${grid.bars.length} * (var(--cell) + var(--space-2)) - var(--space-2))` }}>Before · a day</div>}
            <div className="wrSchedCalLetterGap" />
            <div className="wrSchedCalMonths" style={{ gridTemplateColumns: `repeat(${grid.weeks}, var(--cell))` }}>
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
                <i key={c.date} className={`wrSchedCalCell wrSchedCalCell--${c.level < 0 ? 'x' : c.level}${c.today ? ' wrSchedCalCell--today' : ''}`} title={c.title} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const facetName = (f: Facet): string => FACET_LABEL[f]
