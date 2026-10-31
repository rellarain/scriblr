import { useLayoutEffect, useRef } from 'react'
import { FACET_LABEL, type Facet } from '../../../../lib/facets'
import { barYears, portraitRows, rowLetters, weekRows, type FacetGrid, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useShiftScrollX } from '../../../../lib/useShiftScrollX'
import { useElementSize } from '../useElementSize'

// The activity grid, in two orientations by the shape of its tile (the box it is drawn in).
//
// Landscape (wider than tall): a square a day, a column a week with the oldest at the left, the weeks' months as rectangles above them and the months before
// the grid as bars to the left of it, under their years, each bar with its month's number below it. The day letters sit between the bars and the grid. The
// squares grow and shrink so the seven rows fill the tile's height, and are squished (shorter, not narrower than 8px) when the tile is too short for them: the whole calendar is always in view vertically. It scrolls sideways by touch or Shift + the wheel, and keeps the current week at the right
// edge when the tile is resized.
//
// Portrait (taller than wide, or square): a row a week with the current week on the top row, the day letters across the top, the months as rectangles down the
// left (their names turned) and the months before the grid as bars under the weeks, each in its row, under its year, with its month's number at the right. The
// cells are as high as the weeks allow, so every week is in view with no scrolling, and as wide as the seven columns allow (at most three times their height).
//
// Today has an inset outline in the ink colour in both.

export const CELL_DEFAULT = 14
const CELL_MIN = 8 // the width of a cell, and its height, until the tile is too short to keep it
const CELL_MAX = 40
const CELL_FLOOR = 2 // the least a cell is squished to
const GAP = 4 // --space-2, the gap in the landscape grid
const GAP_P = 2 // --space-1, the gap in the portrait grid (it has a row for every week)
const TOP = 28 // the months' row (22px) and the space under it (--space-3)
const FOOT = 18 // the month numbers under the bars (a line of 11px text and --space-2)
const HEAD = 18 // the day letters over the portrait grid
const SIDE = 22 // a month's or a year's rectangle in the portrait grid
const SIDE_GAP = 10 // --space-4, between the rectangles, the squares and the numbers
const NUMS = 20 // the month numbers at the right of the portrait grid
const FLAT = 3 // the most a portrait cell is wider than it is tall

export interface CellSize { w: number; h: number; gap: number }
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// The cell that fits the whole of the landscape grid in `height` (seven rows, the months' row, the month numbers): square where the height allows, else
// squished in height, never under CELL_MIN wide.
export function landscapeCell(height: number | null, bars = false): CellSize {
  if (height === null) return { w: CELL_DEFAULT, h: CELL_DEFAULT, gap: GAP }
  const h = clamp(Math.floor((height - TOP - GAP - GAP * 6 - (bars ? FOOT : 0)) / 7), CELL_FLOOR, CELL_MAX)
  return { w: Math.max(CELL_MIN, h), h, gap: GAP }
}

// The cell that fits the whole of the portrait grid (a row for each week and each older month) in `box`: as high as the rows allow, as wide as the seven
// columns allow, but not more than FLAT times as wide as high.
export function portraitCell(box: { width: number; height: number } | null, rows: number, bars = false): CellSize {
  if (box === null) return { w: CELL_DEFAULT, h: CELL_DEFAULT, gap: GAP_P }
  const h = clamp(Math.floor((box.height - HEAD - GAP_P * (rows - 1)) / rows), CELL_FLOOR, CELL_MAX)
  const fit = Math.floor((box.width - SIDE - SIDE_GAP - (bars ? NUMS + SIDE_GAP : 0) - GAP_P * 6) / 7)
  return { w: clamp(Math.min(fit, Math.max(CELL_MIN, h * FLAT)), CELL_MIN, CELL_MAX), h, gap: GAP_P }
}

// Wider than tall is landscape; taller than wide, or square, is portrait. Until the box is measured: landscape.
export const isPortrait = (box: { width: number; height: number } | null): boolean => box !== null && box.height >= box.width

const cellClass = (c: FacetGrid['cells'][number]): string =>
  `wrSchedCalCell wrSchedCalCell--${c.level < 0 ? 'x' : c.level}${c.facet ? ` wrSchedCalCell--f-${c.facet}` : ''}${c.today ? ' wrSchedCalCell--today' : ''}`

export function FacetCalendar({ grid, weekStart }: { grid: FacetGrid; weekStart: WeekStart }) {
  const [boxRef, box] = useElementSize()
  const portrait = isPortrait(box)
  const bars = grid.bars.length > 0
  const size = portrait ? portraitCell(box, grid.weeks + grid.bars.length, bars) : landscapeCell(box ? box.height : null, bars)
  return (
    <div className={`wrSchedCal${portrait ? ' wrSchedCal--portrait' : ''}`} ref={boxRef} style={{ ['--cw' as string]: `${size.w}px`, ['--ch' as string]: `${size.h}px`, ['--cg' as string]: `${size.gap}px` }}>
      {portrait ? <PortraitGrid grid={grid} weekStart={weekStart} /> : <LandscapeGrid grid={grid} weekStart={weekStart} box={box} cell={size.h} />}
    </div>
  )
}

function LandscapeGrid({ grid, weekStart, box, cell }: { grid: FacetGrid; weekStart: WeekStart; box: { width: number; height: number } | null; cell: number }) {
  const scroller = useRef<HTMLDivElement>(null)
  // How far the view is from the right edge (the current week): kept when the tile is resized, so the current week stays put instead of the left edge.
  const fromRight = useRef(0)
  useShiftScrollX(scroller)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth - el.clientWidth - fromRight.current
  }, [cell, box?.width, box?.height, grid.weeks])
  const summary = `${grid.activeDays} active days in the last 12 months`
  return (
    <div
      className="wrSchedCalScroll" ref={scroller} tabIndex={0} aria-label="Activity grid; Shift and the wheel scroll it sideways"
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
            {grid.months.map(m => <span key={m.key} className="wrSchedCalMonth" style={{ gridColumn: `${m.col} / span ${m.span}` }}>{m.name}</span>)}
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

function PortraitGrid({ grid, weekStart }: { grid: FacetGrid; weekStart: WeekStart }) {
  const weeks = weekRows(grid.cells)
  const bars = [...grid.bars].reverse() // the newest first, under the weeks
  const rows = weeks.length + bars.length
  const template = `repeat(${rows}, var(--ch))`
  const summary = `${grid.activeDays} active days in the last 12 months`
  return (
    <div className="wrSchedCalScroll wrSchedCalScroll--portrait" tabIndex={0} aria-label="Activity grid; scrolls down through the weeks">
      <div className="wrSchedCalPDays" aria-hidden="true">
        <span className="wrSchedCalPSide" />
        <div className="wrSchedCalPLetters">{rowLetters(weekStart).map((l, i) => <span key={i}>{l}</span>)}</div>
      </div>
      <div className="wrSchedCalPBody">
        <div className="wrSchedCalPRects" style={{ gridTemplateRows: template }}>
          {grid.months.map(m => {
            const r = portraitRows(m.col, m.span, grid.weeks)
            return <span key={m.key} className="wrSchedCalMonth wrSchedCalMonth--v" style={{ gridRow: `${r.row} / span ${r.span}` }}>{m.name}</span>
          })}
          {barYears(bars).map(y => <span key={y.year} className="wrSchedCalYear wrSchedCalYear--v" style={{ gridRow: `${weeks.length + y.col} / span ${y.span}` }}>{y.year}</span>)}
        </div>
        <div className="wrSchedCalPMain" role="img" aria-label={summary}>
          {weeks.map(week => week.map(c => <i key={c.date} className={cellClass(c)} title={c.title} />))}
          {bars.map(b => (
            <div key={b.key} className="wrSchedCalPBar" title={b.title}>
              <span style={{ width: `${Math.max(0, b.height) * 100}%` }}>
                {b.segments.map(s => <i key={s.facet} style={{ width: `${s.part * 100}%`, background: `var(--wr-f-${s.facet})` }} />)}
              </span>
            </div>
          ))}
        </div>
        {bars.length > 0 && (
          <div className="wrSchedCalPNums" aria-hidden="true" style={{ gridTemplateRows: template }}>
            {bars.map((b, i) => <span key={b.key} title={b.name} style={{ gridRow: weeks.length + i + 1 }}>{Number(b.key.slice(5, 7))}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

export const facetName = (f: Facet): string => FACET_LABEL[f]
