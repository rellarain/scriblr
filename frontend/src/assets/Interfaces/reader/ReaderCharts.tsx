import { goalMet, type DayPoint, type MonthBar } from './readerAnalytics'
import { shortDate } from './readerFormat'

// The Analytics console's two charts, drawn in SVG on the card: a bar for each month (with the goal as a dashed line across them) and a line of the last
// days with a ring on every day that reached the goal.

const BAR_W = 24
const SLOT = 38
const PLOT_H = 96
const TOP_PAD = 16

export function MonthBars({ bars, goal = 0, unit, label }: { bars: MonthBar[]; goal?: number; unit: string; label: string }) {
  const top = Math.max(goal, ...bars.map(b => b.value), 1)
  const y = (v: number) => TOP_PAD + PLOT_H - (v / top) * PLOT_H
  const plotW = bars.length * SLOT + 4
  const width = plotW + (goal > 0 ? 46 : 0) // the goal's label stands at the right of the bars
  const height = TOP_PAD + PLOT_H + 18
  return (
    <svg className="rdChart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${bars.map(b => `${b.label} ${b.value}`).join(', ')}${goal > 0 ? `. Goal ${goal} ${unit}.` : ''}`}>
      <line className="rdChartAxis" x1={0} x2={plotW} y1={y(0)} y2={y(0)} />
      {bars.map((b, i) => {
        const x = 4 + i * SLOT
        const h = Math.max(b.value > 0 ? 2 : 0, y(0) - y(b.value))
        return (
          <g key={b.key}>
            <rect className={goalMet(b.value, goal) ? 'rdChartBar rdChartBar--met' : 'rdChartBar'} x={x} y={y(0) - h} width={BAR_W} height={h}><title>{`${b.label}: ${b.value} ${unit}`}</title></rect>
            {b.value > 0 && <text className="rdChartValue" x={x + BAR_W / 2} y={y(0) - h - 3} textAnchor="middle">{b.value}</text>}
            <text className="rdChartLabel" x={x + BAR_W / 2} y={height - 4} textAnchor="middle">{b.label}</text>
          </g>
        )
      })}
      {goal > 0 && (
        <g>
          <line className="rdChartGoal" x1={0} x2={plotW} y1={y(goal)} y2={y(goal)} />
          <text className="rdChartLabel" x={plotW + 4} y={y(goal) + 4}>goal {goal}</text>
        </g>
      )}
    </svg>
  )
}

const LEFT = 30
const LINE_W = 480
const LINE_H = 130
const LINE_TOP = 12
const LINE_BOTTOM = LINE_H - 22

export function DayLine({ days, goal = 0, unit, label }: { days: DayPoint[]; goal?: number; unit: string; label: string }) {
  const top = Math.max(goal, ...days.map(d => d.value), 1)
  const x = (i: number) => LEFT + (i / Math.max(1, days.length - 1)) * (LINE_W - LEFT - 8)
  const y = (v: number) => LINE_TOP + (1 - v / top) * (LINE_BOTTOM - LINE_TOP)
  const met = days.filter(d => goalMet(d.value, goal))
  const ends = [0, Math.floor((days.length - 1) / 2), days.length - 1]
  return (
    <svg
      className="rdChart" viewBox={`0 0 ${LINE_W} ${LINE_H}`} role="img"
      aria-label={`${label}: ${days.length} days${goal > 0 ? `, the goal of ${goal} ${unit} met on ${met.length}` : ''}`}
    >
      <line className="rdChartAxis" x1={LEFT} x2={LINE_W - 8} y1={y(0)} y2={y(0)} />
      <text className="rdChartLabel" x={LEFT - 5} y={y(0) + 3} textAnchor="end">0</text>
      <text className="rdChartLabel" x={LEFT - 5} y={y(top) + 3} textAnchor="end">{Math.round(top)}</text>
      {goal > 0 && <line className="rdChartGoal" x1={LEFT} x2={LINE_W - 8} y1={y(goal)} y2={y(goal)} />}
      <polyline className="rdChartLine" points={days.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')} />
      {days.map((d, i) => (
        <g key={d.date}>
          {goalMet(d.value, goal) && <circle className="rdChartRing" cx={x(i)} cy={y(d.value)} r={7} />}
          <circle className="rdChartDot" cx={x(i)} cy={y(d.value)} r={3}><title>{`${shortDate(d.date)}: ${d.value} ${unit}${goalMet(d.value, goal) ? ', goal met' : ''}`}</title></circle>
        </g>
      ))}
      {ends.map(i => <text key={i} className="rdChartLabel" x={x(i)} y={LINE_H - 5} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>{shortDate(days[i].date)}</text>)}
    </svg>
  )
}
