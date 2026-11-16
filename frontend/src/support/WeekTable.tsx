import { useState } from 'react'
import '../feedback/feedback.scss'
import { useQueues } from './supportStores'
import { DAY_LABEL, type ScheduleWeek } from './supportTypes'
import '../assets/Interfaces/helper/queue.scss'

// Everyone's helper time, read only (the Office's Department and Team Schedule tabs): a row per person with helper hours, a column per
// day, this week or next. Each sets their own (Helper > Settings, Admin > Dashboard > Schedule); the hours come from the queue view.

const clock = (h: number) => `${h}:00`
const dateOf = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '')
const SHORT = DAY_LABEL.map(d => d.slice(0, 3))

export default function WeekTable({ people, label }: { people: Array<{ id: string; name: string }>; label: string }) {
  const { view, status, error } = useQueues()
  const [which, setWhich] = useState<'thisWeek' | 'nextWeek'>('thisWeek')
  if (!view) return <p className={status === 'error' ? 'fbError' : 'fbMuted'} role={status === 'error' ? 'alert' : undefined}>{status === 'error' ? error : 'Loading…'}</p>
  const rows = people.flatMap(p => {
    const w = view.weeks.find(x => x.id === p.id)
    return w ? [{ ...p, week: w[which] as ScheduleWeek }] : []
  })
  const start = rows[0]?.week.start ?? (which === 'thisWeek' ? view.me.thisWeek.start : view.me.nextWeek.start)
  return (
    <div className="fbList">
      <div className="fbRow">
        <div className="fbVerbs" role="group" aria-label="Which week">
          <button type="button" className="fbVerbChip" aria-pressed={which === 'thisWeek'} onClick={() => setWhich('thisWeek')}>This week</button>
          <button type="button" className="fbVerbChip" aria-pressed={which === 'nextWeek'} onClick={() => setWhich('nextWeek')}>Next week</button>
        </div>
        {start && <span className="fbMuted">from {dateOf(start)}</span>}
      </div>
      {rows.length === 0 ? <p className="fbMuted">Nobody here has helper hours.</p> : (
        <div className="qWeekTableWrap">
          <table className="stTable qWeekTable" aria-label={`${label}, ${which === 'thisWeek' ? 'this week' : 'next week'}`}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                {SHORT.map((d, i) => <th key={d} scope="col" abbr={DAY_LABEL[i]}>{d}</th>)}
                <th scope="col">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  {DAY_LABEL.map((_, day) => {
                    const b = r.week.blocks.find(x => x.day === day)
                    return <td key={day}>{b ? `${clock(b.start)}–${clock(b.start + b.hours)}` : ''}</td>
                  })}
                  <td>{r.week.hours} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
