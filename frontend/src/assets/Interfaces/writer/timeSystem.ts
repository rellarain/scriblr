import type { OutlineNode, TimeSystem, TimeUnit } from '../../../api/types'

// A project's time systems (see backend TimeSystem): an ordered list of units,
// largest to smallest. A scene's Time is one number per unit (blank units are
// absent), and scenes sort by comparing units in order.
//   - number: any whole number ("Day 3", year 1024)
//   - named:  an index into the unit's names (Spring = 0, Summer = 1, ...)
//   - clock:  minutes after midnight (9:30 AM = 570)

export type TimeValue = Record<string, number>

export const STANDARD_SYSTEM_ID = 'standard'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter']

export function standardSystem(): TimeSystem {
  return {
    id: STANDARD_SYSTEM_ID,
    name: 'Standard date & time',
    units: [
      { id: 'year', label: 'Year', kind: 'number', names: [] },
      { id: 'month', label: 'Month', kind: 'named', names: [...MONTH_NAMES] },
      { id: 'day', label: 'Day', kind: 'number', names: [] },
      { id: 'time', label: 'Time', kind: 'clock', names: [] },
    ],
  }
}

const unit = (id: string, label: string, kind: TimeUnit['kind'], names: string[] = []): TimeUnit => ({ id, label, kind, names })

// Systems the Project Editor can start from.
export const TIME_PRESETS: Array<{ key: string; name: string; build: () => TimeSystem }> = [
  { key: 'standard', name: 'Standard date & time', build: standardSystem },
  { key: 'storyDays', name: 'Story days', build: () => ({ id: 'storyDays', name: 'Story days', units: [unit('day', 'Day', 'number'), unit('time', 'Time', 'clock')] }) },
  { key: 'weeks', name: 'Weeks & days', build: () => ({ id: 'weeks', name: 'Weeks & days', units: [unit('week', 'Week', 'number'), unit('day', 'Day', 'number')] }) },
  {
    key: 'seasons', name: 'Seasons',
    build: () => ({ id: 'seasons', name: 'Seasons', units: [unit('year', 'Year', 'number'), unit('season', 'Season', 'named', SEASON_NAMES), unit('day', 'Day', 'number')] }),
  },
  {
    key: 'months', name: 'Months',
    build: () => ({ id: 'months', name: 'Months', units: [unit('year', 'Year', 'number'), unit('month', 'Month', 'named', MONTH_NAMES), unit('day', 'Day', 'number')] }),
  },
]

// The system a book's scenes use: the book's own choice, else the project's first.
export function systemForBook(systems: TimeSystem[], book: Pick<OutlineNode, 'timeSystemId'> | undefined): TimeSystem {
  const chosen = book?.timeSystemId ? systems.find(s => s.id === book.timeSystemId) : undefined
  return chosen ?? systems[0] ?? standardSystem()
}

export function formatClock(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function formatUnit(u: TimeUnit, value: number): string {
  if (u.kind === 'clock') return formatClock(value)
  if (u.kind === 'named') return u.names[value] ?? `${u.label} ${value + 1}`
  return `${u.label} ${value}`
}

const has = (value: TimeValue | undefined, id: string) => value !== undefined && typeof value[id] === 'number'

// A value as text: "March 9, 1024 · 9:30 AM" for the standard system, otherwise
// each set unit in order ("Week 3, Day 2", "Year 12, Autumn, Day 5").
export function formatTime(system: TimeSystem, value: TimeValue | undefined): string {
  if (!value) return ''
  const ids = system.units.map(u => u.id).join(',')
  if (ids === 'year,month,day,time') {
    const month = has(value, 'month') ? formatUnit(system.units[1], value.month) : ''
    const day = has(value, 'day') ? String(value.day) : ''
    const date = [month, day].filter(Boolean).join(' ')
    const dated = has(value, 'year') ? (date ? `${date}, ${value.year}` : String(value.year)) : date
    const time = has(value, 'time') ? formatClock(value.time) : ''
    return [dated, time].filter(Boolean).join(' · ')
  }
  return system.units.filter(u => has(value, u.id)).map(u => formatUnit(u, value[u.id])).join(', ')
}

export function hasTime(value: TimeValue | undefined): boolean {
  return value !== undefined && Object.values(value).some(v => typeof v === 'number')
}

// Unit-by-unit comparison, largest unit first. A blank unit sorts after any
// value; equal so far -> 0. Values compare within one system (a book's).
export function compareTimeValues(system: TimeSystem, a: TimeValue | undefined, b: TimeValue | undefined): number {
  for (const u of system.units) {
    const av = has(a, u.id) ? a![u.id] : Infinity
    const bv = has(b, u.id) ? b![u.id] : Infinity
    if (av !== bv) return av < bv ? -1 : 1
  }
  return 0
}

// Whether two values differ (for the "changed from the previous scene" highlight).
export function timeChanged(a: TimeValue | undefined, b: TimeValue | undefined): boolean {
  const canon = (v: TimeValue | undefined) => JSON.stringify(Object.entries(v ?? {}).filter(([, n]) => typeof n === 'number').sort(([x], [y]) => x.localeCompare(y)))
  return canon(a) !== canon(b)
}

// Keeps a value valid for a (possibly edited) system: drops units it no longer has.
export function pruneTimeValue(system: TimeSystem, value: TimeValue | undefined): TimeValue {
  const out: TimeValue = {}
  for (const u of system.units) if (has(value, u.id)) out[u.id] = value![u.id]
  return out
}
