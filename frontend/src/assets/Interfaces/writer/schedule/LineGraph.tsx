import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { FACET_LABEL, type Facet } from '../../../../lib/facets'
import { DAY_MS } from '../../../../lib/activityCalendar'
import type { GoalSeries, SeriesPoint } from '../../../../lib/projection'
import { MONTH_NAMES } from '../../../../lib/scheduleCalendar'
import { useElementSize } from '../useElementSize'

// The line graph: a line for each facet, the share of that facet's goal done over time, with the projection at the last 28 days' pace dotted past
// today. Daily points for the last 12 months and monthly ones before (that is how the totals are kept). Hover or the arrow keys read every value on a day. A ring marks the day a facet's goal was met.

export interface LineSeries { facet: Facet; goal: GoalSeries }
const W_DEFAULT = 900 // until the graph's box is measured
const H_DEFAULT = 230
const LEFT = 42
const TOP = 10
const MARKERS: Record<Facet, (x: number, y: number) => JSX.Element> = {
  outline: (x, y) => <circle cx={x} cy={y} r={4} />,
  plot: (x, y) => <rect x={x - 4} y={y - 4} width={8} height={8} />,
  draft: (x, y) => <path d={`M${x} ${y - 5}L${x + 5} ${y}L${x} ${y + 5}L${x - 5} ${y}Z`} />,
  revision: (x, y) => <path d={`M${x} ${y - 5}L${x + 5} ${y + 4}L${x - 5} ${y + 4}Z`} />,
  project: (x, y) => <path d={`M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}`} className="wrSchedMarkX" />,
}
const parse = (date: string): number => Date.parse(`${date}T00:00:00Z`)

// The share done on a day: the nearest point at or before it (the line runs flat between them), and 0 before the first.
export function valueAt(points: SeriesPoint[], date: string): number {
  let value = 0
  for (const p of points) {
    if (p.date > date) break
    value = p.pct
  }
  return value
}

// The day a facet's goal was met: the first point at or past all of it (null while it is not).
export function goalMetOn(points: SeriesPoint[]): SeriesPoint | null {
  return points.find(p => p.pct >= 1) ?? null
}

export function LineGraph({ series, today, deadline }: { series: LineSeries[]; today: string; deadline: string | null }) {
  const [hover, setHover] = useState<string | null>(null)
  // The graph is drawn in the pixels of its box (so its text keeps its size), which fills the tile.
  const [boxRef, box] = useElementSize()
  const W = box ? Math.max(240, Math.round(box.width)) : W_DEFAULT
  const H = box ? Math.max(140, Math.round(box.height)) : H_DEFAULT
  const RIGHT = W - 8
  const BOTTOM = H - 30
  const domain = useMemo(() => {
    const dates = series.flatMap(s => [...s.goal.points, ...s.goal.projection].map(p => p.date))
    const first = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today
    let last = new Date(parse(today) + 30 * DAY_MS).toISOString().slice(0, 10)
    for (const d of [...dates, deadline ?? '']) if (d > last) last = d
    return { from: parse(first), to: parse(last) }
  }, [series, today, deadline])
  const x = (date: string) => LEFT + ((parse(date) - domain.from) / Math.max(1, domain.to - domain.from)) * (RIGHT - LEFT)
  const y = (pct: number) => TOP + (1 - Math.min(1, Math.max(0, pct))) * (BOTTOM - TOP)
  const path = (pts: SeriesPoint[]) => pts.map(p => `${x(p.date).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ')
  const ticks: Array<{ date: string; label: string }> = []
  for (let d = new Date(domain.from); d.getTime() <= domain.to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    if (first.getTime() >= domain.from && first.getUTCMonth() % 3 === 0) ticks.push({ date: first.toISOString().slice(0, 10), label: `${MONTH_NAMES[first.getUTCMonth()].slice(0, 3)} ’${String(first.getUTCFullYear()).slice(2)}` })
  }
  const dateAt = (frac: number): string => new Date(domain.from + frac * (domain.to - domain.from)).toISOString().slice(0, 10)
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    setHover(px < LEFT || px > RIGHT ? null : dateAt((px - LEFT) / (RIGHT - LEFT)))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const at = parse(hover ?? today) + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 7 : 1) * DAY_MS
    setHover(new Date(Math.min(domain.to, Math.max(domain.from, at))).toISOString().slice(0, 10))
  }
  const label = hover ? new Date(parse(hover)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''
  return (
    <div className="wrSchedLine" ref={boxRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} aria-label="Goal completion by facet over time, with dotted projections. Left and right arrows read a day."
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey}
      >
        {[0, 0.25, 0.5, 0.75, 1].map(p => (
          <g key={p}><line className="wrSchedGrid" x1={LEFT} x2={RIGHT} y1={y(p)} y2={y(p)} /><text className="wrSchedAxis" x={LEFT - 6} y={y(p) + 3} textAnchor="end">{Math.round(p * 100)}%</text></g>
        ))}
        {ticks.map(t => <text key={t.date} className="wrSchedAxis" x={x(t.date)} y={H - 6} textAnchor="middle">{t.label}</text>)}
        <line className="wrSchedMark" x1={x(today)} x2={x(today)} y1={TOP} y2={BOTTOM} strokeDasharray="1 3" />
        <text className="wrSchedAxis" x={x(today) - 4} y={BOTTOM + 12} textAnchor="end">Today</text>
        {deadline && (
          <g>
            <line className="wrSchedMark wrSchedMark--deadline" x1={x(deadline)} x2={x(deadline)} y1={TOP} y2={BOTTOM} />
            <text className="wrSchedAxis" x={x(deadline) - 4} y={TOP + 8} textAnchor="end">Deadline</text>
          </g>
        )}
        {series.map(s => (
          <g key={s.facet} className="wrSchedSeries" style={{ color: `var(--wr-f-${s.facet})` }}>
            <polyline className="wrSchedLineSolid" points={path(s.goal.points)} />
            {s.goal.projection.length > 1 && <polyline className="wrSchedLineProjected" points={path(s.goal.projection)} />}
            {MARKERS[s.facet](x(today), y(valueAt(s.goal.points, today)))}
            {(() => {
              const met = goalMetOn(s.goal.points)
              return met && <circle className="wrSchedRing" cx={x(met.date)} cy={y(1)} r={8}><title>{`${FACET_LABEL[s.facet]} goal met ${met.date}`}</title></circle>
            })()}
          </g>
        ))}
        {hover && (
          <g>
            <line className="wrSchedHover" x1={x(hover)} x2={x(hover)} y1={TOP} y2={BOTTOM} />
            {series.map(s => <circle key={s.facet} cx={x(hover)} cy={y(valueAt(s.goal.points, hover))} r={3.5} style={{ fill: `var(--wr-f-${s.facet})` }} className="wrSchedHoverDot" />)}
          </g>
        )}
      </svg>
      {hover && (
        <div className="wrSchedTip" style={{ left: `${Math.min(70, (x(hover) / W) * 100 + 1.5)}%` }} role="status">
          <strong>{label}</strong>
          {series.map(s => <div key={s.facet}><span><i className="wrSchedDot" style={{ background: `var(--wr-f-${s.facet})` }} />{FACET_LABEL[s.facet]}</span><b>{Math.round(valueAt(s.goal.points, hover) * 100)}%{goalMetOn(s.goal.points)?.date !== undefined && goalMetOn(s.goal.points)!.date <= hover ? ' ✓' : ''}</b></div>)}
        </div>
      )}
    </div>
  )
}
