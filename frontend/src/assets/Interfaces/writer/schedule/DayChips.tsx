// The days of the week as seven chips (Monday first), any of which can be on; at least one stays on.
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function DayChips({ days, label = 'Days', onChange }: { days: number[]; label?: string; onChange: (days: number[]) => void }) {
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort((a, b) => a - b)
    if (next.length) onChange(next)
  }
  return (
    <div className="wrSchedDays" role="group" aria-label={label}>
      {LETTERS.map((l, d) => (
        <button key={NAMES[d]} type="button" className={days.includes(d) ? 'on' : ''} aria-pressed={days.includes(d)} aria-label={NAMES[d]} title={NAMES[d]} onClick={() => toggle(d)}>{l}</button>
      ))}
    </div>
  )
}
