import { Fragment, useLayoutEffect, useRef } from 'react'
import { FACET_LABEL, type Facet } from '../../../../lib/facets'
import { barYears, fitMonthName, monthGroups, rowLetters, yearGroups, type FacetGrid, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useWheelScrollX } from '../../../../lib/useWheelScrollX'
import { useElementSize } from '../useElementSize'

// The activity grid, in two orientations by the shape of its tile (the box it is drawn in), scrolling along its long side.
//
// Landscape (wider than tall): a square a day, a column a week with the oldest at the left, the weeks' months as rectangles above them and the months before
// the grid as bars to the left of it, under their years, each bar with its month's number below it. The day letters sit between the bars and the grid. The
// cells grow and shrink so the seven rows fill the tile's height, and are squished (shorter, not narrower than 8px) when the tile is too short for them, so
// it is never cut off vertically. It scrolls sideways (the wheel, a swipe, touch) and keeps the current week at the right edge when the tile is resized.
//
// Portrait (taller than wide, or square): a calendar. The day letters are across the top; under them each month, the newest first, is a divider with its name in
// capitals over its weeks, the newest week first (so the current week is the top row), each week a row of seven with a day in every place the month has; the
// months before the grid are bars under the weeks, each year a divider with its months' bars under it and each bar's month number at its right. The cells are square,
// the seven columns filling the tile's width, and it scrolls down (the wheel, a swipe, touch).
//
// Today has an inset outline in the ink colour in both.

export const CELL_DEFAULT = 14
const CELL_MIN = 8 // the width of a cell, and its height, until the tile is too short to keep it
const CELL_MAX = 40
const CELL_FLOOR = 2 // the least a cell is squished to
const GAP = 4 // --space-2, the gap in the landscape grid
const TOP = 28 // the months' row (22px) and the space under it (--space-3)
const FOOT = 18 // the month numbers under the bars (a line of 11px text and --space-2)
const NUMS = 20 // the month numbers at the right of the portrait bars

export interface CellSize { w: number; h: number; gap: number }
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// The cell that fits the whole of the landscape grid in `height` (seven rows, the months' row, the month numbers): square where the height allows, else
// squished in height, never under CELL_MIN wide.
export function landscapeCell(height: number | null, bars = false): CellSize {
  if (height === null) return { w: CELL_DEFAULT, h: CELL_DEFAULT, gap: GAP }
  const h = clamp(Math.floor((height - TOP - GAP - GAP * 6 - (bars ? FOOT : 0)) / 7), CELL_FLOOR, CELL_MAX)
  return { w: Math.max(CELL_MIN, h), h, gap: GAP }
}

// The cell that fits the seven columns of the portrait grid, and the month numbers beside the bars, in `width`: square (the weeks scroll down).
export function portraitCell(width: number | null, bars = false): CellSize {
  if (width === null) return { w: CELL_DEFAULT, h: CELL_DEFAULT, gap: GAP }
  const w = clamp(Math.floor((width - (bars ? NUMS + GAP : 0) - GAP * 6) / 7), CELL_MIN, CELL_MAX)
  return { w, h: w, gap: GAP }
}

// Wider than tall is landscape; taller than wide, or square, is portrait. Until the box is measured: landscape.
export const isPortrait = (box: { width: number; height: number } | null): boolean => box !== null && box.height >= box.width

const cellClass = (c: FacetGrid['cells'][number]): string =>
  `wrSchedCalCell wrSchedCalCell--${c.level < 0 ? 'x' : c.level}${c.facet ? ` wrSchedCalCell--f-${c.facet}` : ''}${c.today ? ' wrSchedCalCell--today' : ''}`

export function FacetCalendar({ grid, weekStart }: { grid: FacetGrid; weekStart: WeekStart }) {
  const [boxRef, box] = useElementSize()
  const portrait = isPortrait(box)
  const bars = grid.bars.length > 0
  const size = portrait ? portraitCell(box ? box.width : null, bars) : landscapeCell(box ? box.height : null, bars)
  return (
    <div className={`wrSchedCal${portrait ? ' wrSchedCal--portrait' : ''}`} ref={boxRef} style={{ ['--cw' as string]: `${size.w}px`, ['--ch' as string]: `${size.h}px`, ['--cg' as string]: `${size.gap}px` }}>
      {portrait ? <PortraitGrid grid={grid} weekStart={weekStart} size={size} /> : <LandscapeGrid grid={grid} weekStart={weekStart} box={box} size={size} />}
    </div>
  )
}

function LandscapeGrid({ grid, weekStart, box, size }: { grid: FacetGrid; weekStart: WeekStart; box: { width: number; height: number } | null; size: CellSize }) {
  const scroller = useRef<HTMLDivElement>(null)
  // How far the view is from the right edge (the current week): kept when the tile is resized, so the current week stays put instead of the left edge.
  const fromRight = useRef(0)
  useWheelScrollX(scroller)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth - el.clientWidth - fromRight.current
  }, [size.h, size.w, box?.width, box?.height, grid.weeks])
  const summary = `${grid.activeDays} active days in the last 12 months`
  return (
    <div
      className="wrSchedCalScroll" ref={scroller} tabIndex={0} aria-label="Activity grid; the wheel scrolls it sideways"
      onScroll={e => { const el = e.currentTarget; fromRight.current = Math.max(0, el.scrollWidth - el.clientWidth - el.scrollLeft) }}
    >
      <div className="wrSchedCalInner">
        <div className="wrSchedCalTop">
          {grid.bars.length > 0 && (
            <div className="wrSchedCalYears" style={{ gridTemplateColumns: `repeat(${grid.bars.length}, var(--cw))` }}>
              {barYears(grid.bars).map(y => <span key={y.year} className="wrSchedCalYear" style={{ gridColumn: `${y.col} / span ${y.span}` }}>{y.year}</span>)}
            </div>
          )}
          <div className="wrSchedCalLetterGap" />
          <div className="wrSchedCalMonths" style={{ gridTemplateColumns: `repeat(${grid.weeks}, var(--cw))` }}>
            {grid.months.map(m => <span key={m.key} className="wrSchedCalMonth" title={m.name} style={{ gridColumn: `${m.col} / span ${m.span}` }}>{fitMonthName(m.name, m.span * size.w + (m.span - 1) * size.gap)}</span>)}
          </div>
        </div>
        <div className="wrSchedCalRows">
          {grid.bars.length > 0 && (
            <div className="wrSchedCalBarsCol">
              <div className="wrSchedCalBars" role="img" aria-label="Average a day in each month before the last 12 months">
                {grid.bars.map(b => (
                  <div key={b.key} className="wrSchedCalBar" title={b.title} style={{ height: `${Math.max(0, b.height) * 100}%` }}>
                    {b.segments.map(s => <i key={s.facet} style={{ height: `${s.part * 100}%`, background: `var(--wr-f-${s.facet})` }} />)}
                  </div>
                ))}
              </div>
              <div className="wrSchedCalBarMonths" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${grid.bars.length}, var(--cw))` }}>
                {grid.bars.map(b => <span key={b.key} title={b.name}>{Number(b.key.slice(5, 7))}</span>)}
              </div>
            </div>
          )}
          <div className="wrSchedCalLetters" aria-hidden="true">{rowLetters(weekStart).map((l, i) => <span key={i}>{l}</span>)}</div>
          <div className="wrSchedCalGrid" role="img" aria-label={summary}>
            {grid.cells.map(c => <i key={c.date} className={cellClass(c)} title={c.title} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function PortraitGrid({ grid, weekStart, size }: { grid: FacetGrid; weekStart: WeekStart; size: CellSize }) {
  const groups = monthGroups(grid.cells)
  const years = yearGroups([...grid.bars].reverse()) // the newest first, under the weeks
  const summary = `${grid.activeDays} active days in the last 12 months`
  const across = 7 * size.w + 6 * size.gap // the width of the seven columns
  return (
    <div className="wrSchedCalScroll wrSchedCalScroll--portrait" tabIndex={0} aria-label="Activity grid; the wheel scrolls it down through the weeks">
      <div className="wrSchedCalPDays" aria-hidden="true">
        <div className="wrSchedCalPLetters">{rowLetters(weekStart).map((l, i) => <span key={i}>{l}</span>)}</div>
      </div>
      <div className="wrSchedCalPMain" role="img" aria-label={summary}>
        {groups.map(g => (
          <Fragment key={g.key}>
            <div className="wrSchedCalPDivider" title={g.name}>{fitMonthName(g.name, across)}</div>
            {g.rows.map((row, r) => row.map((c, d) => (c
              ? <i key={c.date} className={cellClass(c)} title={c.title} />
              : <i key={`${g.key}-${r}-${d}`} className="wrSchedCalCell wrSchedCalCell--x" />)))}
          </Fragment>
        ))}
      </div>
      {years.length > 0 && (
        <div className="wrSchedCalPBars" role="img" aria-label="Average a day in each month before the last 12 months">
          {years.map(y => (
            <Fragment key={y.year}>
              <div className="wrSchedCalPDivider">{y.year}</div>
              {y.items.map(b => (
                <Fragment key={b.key}>
                  <div className="wrSchedCalPBar" title={b.title}>
                    <span style={{ width: `${Math.max(0, b.height) * 100}%` }}>
                      {b.segments.map(s => <i key={s.facet} style={{ width: `${s.part * 100}%`, background: `var(--wr-f-${s.facet})` }} />)}
                    </span>
                  </div>
                  <span className="wrSchedCalPNum" title={b.name}>{Number(b.key.slice(5, 7))}</span>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

export const facetName = (f: Facet): string => FACET_LABEL[f]
