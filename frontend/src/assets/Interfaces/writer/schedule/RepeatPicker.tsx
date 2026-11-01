import { useState } from 'react'
import type { Recurrence } from '../../../../lib/facets'
import { IconBtn } from './IconBtn'
import { DayChips } from './DayChips'
import { CloseIcon } from '../../../icons'

// How a routine (or a shift) comes round, in one picker: a few presets, and Custom for the rest. The presets are the common cases; Custom opens "every N
// days or weeks" (with the weekdays for weeks) and an end date; a routine can also come round After an interval (every 7-10 days: tickable inside the
// range, due once it is past), which a shift cannot.

export type RepeatPreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom' | 'interval'
const WEEKDAYS = [0, 1, 2, 3, 4]
const LABEL: Record<RepeatPreset, string> = { none: 'Does not repeat', daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly', custom: 'Custom', interval: 'After an interval' }
const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i])
// Monday = 0 (the day an anchor falls on).
const weekdayOf = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

// The preset a recurrence reads as.
export function presetOf(rec: Recurrence | null): RepeatPreset {
  if (!rec || rec.kind === 'once') return 'none'
  if (rec.kind === 'interval') return 'interval'
  if (rec.kind === 'daily') return rec.every === 1 ? 'daily' : 'custom'
  if (rec.every !== 1) return 'custom'
  return sameDays(rec.days, WEEKDAYS) ? 'weekdays' : 'weekly'
}

export function RepeatPicker({ value, anchor, onChange, allowNone = false, allowInterval = false, label = 'Repeat' }: {
  value: Recurrence | null
  // The first day (a recurrence counts from it).
  anchor: string
  onChange: (next: Recurrence | null) => void
  allowNone?: boolean
  allowInterval?: boolean
  label?: string
}) {
  // Custom stays open while its number is edited (a one in it reads as Every day, which would close it under the pointer).
  const [custom, setCustom] = useState(false)
  const read = presetOf(value)
  const preset: RepeatPreset = custom && (read === 'daily' || read === 'custom') ? 'custom' : read
  const presets: RepeatPreset[] = [...(allowNone ? ['none' as const] : []), 'daily', 'weekdays', 'weekly', 'custom', ...(allowInterval ? ['interval' as const] : [])]
  const base: Recurrence = { kind: 'daily', every: 1, unit: 'day', days: [], rangeMax: null, anchor, until: value?.until ?? null }
  const set = (patch: Partial<Recurrence>) => onChange({ ...(value ?? base), ...patch })
  const choose = (p: RepeatPreset) => {
    setCustom(p === 'custom')
    if (p === 'none') return onChange(null)
    if (p === 'daily') return onChange({ ...base, anchor: value?.anchor ?? anchor })
    if (p === 'weekdays') return onChange({ ...base, kind: 'weekly', days: WEEKDAYS, anchor: value?.anchor ?? anchor })
    if (p === 'weekly') return onChange({ ...base, kind: 'weekly', days: [weekdayOf(anchor)], anchor: value?.anchor ?? anchor })
    if (p === 'interval') return onChange({ ...base, kind: 'interval', every: 7, unit: 'day', until: null, anchor: value?.anchor ?? anchor })
    onChange({ ...base, kind: 'daily', every: 2, anchor: value?.anchor ?? anchor })
  }
  // A typed whole number of one or more; an emptied field leaves the number as it is.
  const num = (v: string, was: number) => (v === '' ? was : Math.max(1, Math.floor(Number(v)) || 1))

  return (
    <div className="wrRepeat" role="group" aria-label={label}>
      <div className="wrSchedSeg wrRepeatPresets" role="radiogroup" aria-label={`${label} how often`}>
        {presets.map(p => (
          <button key={p} type="button" role="radio" aria-checked={preset === p} className={preset === p ? 'on' : ''} onClick={() => choose(p)}>{LABEL[p]}</button>
        ))}
      </div>
      {(preset === 'weekly' || (preset === 'custom' && value?.kind === 'weekly')) && (
        <DayChips days={value?.days ?? []} label="On these days" onChange={days => set({ days })} />
      )}
      {preset === 'custom' && value && (
        <div className="wrRepeatRow">
          <span>Every</span>
          <input className="wrField wrSchedNum" type="number" min={1} aria-label="Every" value={value.every} onChange={e => set({ every: num(e.target.value, value.every) })} />
          <select
            className="wrField" aria-label="Days or weeks" value={value.kind}
            onChange={e => set(e.target.value === 'weekly' ? { kind: 'weekly', days: [weekdayOf(anchor)] } : { kind: 'daily', days: [] })}
          >
            <option value="daily">days</option><option value="weekly">weeks</option>
          </select>
        </div>
      )}
      {preset === 'interval' && value && (
        <div className="wrRepeatRow">
          <span>Every</span>
          <input className="wrField wrSchedNum" type="number" min={1} aria-label="Every" value={value.every} onChange={e => set({ every: num(e.target.value, value.every) })} onBlur={() => set({ rangeMax: value.rangeMax && value.rangeMax > value.every ? value.rangeMax : null })} />
          <span>to</span>
          <input
            className="wrField wrSchedNum" type="number" min={1} aria-label="Up to" placeholder="same" value={value.rangeMax ?? ''}
            onChange={e => set({ rangeMax: e.target.value ? num(e.target.value, value.rangeMax ?? 1) : null })}
            onBlur={() => set({ rangeMax: value.rangeMax && value.rangeMax > value.every ? value.rangeMax : null })}
          />
          <select className="wrField" aria-label="Unit" value={value.unit} onChange={e => set({ unit: e.target.value as Recurrence['unit'] })}>
            <option value="day">days</option><option value="week">weeks</option><option value="month">months</option>
          </select>
        </div>
      )}
      {(preset === 'custom' || preset === 'daily' || preset === 'weekdays' || preset === 'weekly') && value && (
        <div className="wrRepeatRow">
          <span>Until</span>
          <input className="wrField" type="date" aria-label="Repeat until" value={value.until ?? ''} min={value.anchor} onChange={e => set({ until: e.target.value || null })} />
          {value.until && <IconBtn Icon={CloseIcon} label="Repeat without an end" onClick={() => set({ until: null })} />}
        </div>
      )}
    </div>
  )
}
