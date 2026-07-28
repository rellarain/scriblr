import type { DailyActivityLog } from '../../types'

interface Props {
  daily: DailyActivityLog
}

function levelFor(delta: number): number {
  if (delta <= 0) return 0
  if (delta < 200) return 1
  if (delta < 500) return 2
  if (delta < 1000) return 3
  return 4
}

// Hand-rolled GitHub-style yearly heatmap: weeks as columns, Mon..Sun as rows
// within each column. No charting/calendar-heatmap dependency, per the
// project's existing zero-extra-viz-dependency convention.
function Heatmap({ daily }: Props) {
  const today = new Date()
  const days: { date: string; delta: number }[] = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${day}`
    days.push({ date: dateStr, delta: daily.days[dateStr]?.wordCountDelta ?? 0 })
  }

  const weeks: { date: string; delta: number }[][] = []
  let currentWeek: { date: string; delta: number }[] = []
  days.forEach((day) => {
    const weekday = (new Date(day.date).getDay() + 6) % 7 // 0=Mon..6=Sun
    if (weekday === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    currentWeek.push(day)
  })
  if (currentWeek.length > 0) weeks.push(currentWeek)

  return (
    <div className="heatmap">
      <div className="heatmap__grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap__week">
            {week.map((day) => (
              <div
                key={day.date}
                className={`heatmap__day heatmap__day--level-${levelFor(day.delta)}`}
                title={`${day.date}: ${day.delta > 0 ? `+${day.delta}` : day.delta} words`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap__legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div key={level} className={`heatmap__day heatmap__day--level-${level}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

export default Heatmap
