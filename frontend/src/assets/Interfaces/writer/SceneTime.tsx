import { useEffect, useRef, useState } from 'react'
import type { TimeSystem, TimeUnit } from '../../../api/types'
import { formatTime, hasTime, type TimeValue } from './timeSystem'

const two = (n: number) => String(n).padStart(2, '0')
const toClockInput = (minutes: number) => `${two(Math.floor(minutes / 60) % 24)}:${two(minutes % 60)}`
function fromClockInput(text: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text)
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

// One input for one unit of the time system: a number box, a dropdown of
// names, or a time picker. An empty input clears that unit.
function UnitInput({ unit, value, onChange }: { unit: TimeUnit; value: number | undefined; onChange: (next: number | undefined) => void }) {
  if (unit.kind === 'named') {
    return (
      <select value={value ?? ''} aria-label={unit.label} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}>
        <option value="">-</option>
        {unit.names.map((name, i) => <option key={name + i} value={i}>{name}</option>)}
      </select>
    )
  }
  if (unit.kind === 'clock') {
    return (
      <input
        type="time" aria-label={unit.label} value={value === undefined ? '' : toClockInput(value)}
        onChange={e => onChange(e.target.value === '' ? undefined : fromClockInput(e.target.value))}
      />
    )
  }
  return (
    <input
      type="number" aria-label={unit.label} value={value ?? ''} placeholder="-"
      onChange={e => {
        const n = parseInt(e.target.value, 10)
        onChange(e.target.value === '' || !Number.isFinite(n) ? undefined : n)
      }}
    />
  )
}

// A scene's Time: a button showing the formatted value (or a "Time"
// placeholder) that opens a small popover with one input per unit of the
// book's time system. `changed` highlights it in the accent color (it differs
// from the previous scene).
export function SceneTime({ system, value, changed, onChange }: {
  system: TimeSystem
  value: TimeValue | undefined
  changed: boolean
  onChange: (next: TimeValue) => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const text = formatTime(system, value)
  const set = (id: string, next: number | undefined) => {
    const out: TimeValue = { ...(value ?? {}) }
    if (next === undefined) delete out[id]
    else out[id] = next
    onChange(out)
  }

  return (
    <div className="wrTimeWrap" ref={wrap}>
      <button
        type="button"
        className={`wrSceneField wrSceneField--time wrTimeBtn${changed ? ' wrSceneField--changed' : ''}${text ? '' : ' wrTimeBtn--empty'}`}
        aria-haspopup="dialog" aria-expanded={open} aria-label="Time"
        title={changed ? 'Time changed from the previous scene' : 'Set when this scene happens'}
        onClick={() => setOpen(o => !o)}
      >
        {text || 'Time'}
      </button>
      {open && (
        <div className="wrTimePopover" role="dialog" aria-label={`Time (${system.name})`}>
          <div className="wrTimePopoverTitle">{system.name}</div>
          {system.units.length === 0 && <p className="wrMuted">This time system has no units. Add some in the Project Editor.</p>}
          {system.units.map(u => (
            <label key={u.id} className="wrTimeRow">
              <span>{u.label}</span>
              <UnitInput unit={u} value={value?.[u.id]} onChange={next => set(u.id, next)} />
            </label>
          ))}
          <div className="wrTimePopoverFoot">
            <button type="button" className="wrSmallBtn wrSmallBtn--light" disabled={!hasTime(value)} onClick={() => onChange({})}>Clear</button>
            <button type="button" className="wrSmallBtn wrSmallBtn--light" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
