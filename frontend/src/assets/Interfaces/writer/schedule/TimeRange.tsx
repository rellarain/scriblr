import { SLOTS_PER_DAY, slotTime } from '../../../../lib/facets'

// A shift's start and end as two pickers of 10-minute times, with its length beside them. Moving the start moves the end with it (the length stays);
// the end can be set on its own, but never at or before the start.
const SLOTS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i)

export function lengthText(slots: number): string {
  const minutes = slots * 10
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function TimeRange({ start, end, onChange }: { start: number; end: number; onChange: (start: number, end: number) => void }) {
  const length = end - start
  return (
    <div className="wrTimeRange" role="group" aria-label="Time">
      <select className="wrField" aria-label="From" value={start} onChange={e => { const s = Number(e.target.value); onChange(s, Math.min(SLOTS_PER_DAY, s + length)) }}>
        {SLOTS.map(i => <option key={i} value={i}>{slotTime(i)}</option>)}
      </select>
      <span aria-hidden="true">–</span>
      <select className="wrField" aria-label="To" value={end} onChange={e => onChange(start, Number(e.target.value))}>
        {SLOTS.filter(i => i > start).map(i => <option key={i} value={i}>{slotTime(i)}</option>)}
        <option value={SLOTS_PER_DAY}>Midnight</option>
      </select>
      <small className="wrTimeLength">{lengthText(length)}</small>
    </div>
  )
}
