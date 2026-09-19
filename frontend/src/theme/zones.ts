import { defaultZone } from './defaults'
import { normalizePalette } from './paletteRules'
import { ZONE_KEYS, type ThemeSettings, type ZoneConfig, type ZoneKey } from './types'

const DAY_MINUTES = 1440
const DAY_MS = DAY_MINUTES * 60_000

export const STEP_MINUTES = 10
export const MAX_START = DAY_MINUTES - STEP_MINUTES

// A minute of the day as a 12-hour clock time: 0 -> "12:00 AM", 1430 -> "11:50 PM".
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// Configured zones in the order they occur across the day (ties broken by the
// canonical dawn < day < dusk < night order).
export function configuredZones(zones: Record<ZoneKey, ZoneConfig>): ZoneKey[] {
  return ZONE_KEYS
    .filter(k => zones[k].configured)
    .sort((a, b) => zones[a].startMinute - zones[b].startMinute || ZONE_KEYS.indexOf(a) - ZONE_KEYS.indexOf(b))
}

// The zone in effect at a minute of the day: the configured zone with the
// latest start at or before it, wrapping past midnight to the day's last
// start. With one configured zone, that zone always.
export function resolveZone(zones: Record<ZoneKey, ZoneConfig>, minuteOfDay: number): ZoneKey {
  const order = configuredZones(zones)
  if (order.length === 0) return 'day'
  let current = order[order.length - 1]
  for (const key of order) {
    if (zones[key].startMinute <= minuteOfDay) current = key
  }
  return current
}

export const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes()

// Milliseconds until the next zone boundary, or null when there is only one
// configured zone (nothing will change).
export function msUntilNextBoundary(zones: Record<ZoneKey, ZoneConfig>, now: Date): number | null {
  const order = configuredZones(zones)
  if (order.length < 2) return null
  const nowMs = ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds()
  let best = Infinity
  for (const key of order) {
    let diff = zones[key].startMinute * 60_000 - nowMs
    if (diff <= 0) diff += DAY_MS
    best = Math.min(best, diff)
  }
  return best
}

// A free 10-minute start for a zone being enabled: its own default if nobody
// else has it, else the next free slot.
function freeStart(zones: Record<ZoneKey, ZoneConfig>, key: ZoneKey): number {
  const taken = new Set(configuredZones(zones).map(k => zones[k].startMinute))
  let start = zones[key].startMinute
  for (let i = 0; i < DAY_MINUTES / STEP_MINUTES && taken.has(start); i++) start = (start + STEP_MINUTES) % DAY_MINUTES
  return start
}

// Turn a zone on, seeded with a copy of Day's palette.
export function enableZone(settings: ThemeSettings, key: ZoneKey): ThemeSettings {
  if (settings.zones[key].configured) return settings
  const zone: ZoneConfig = {
    configured: true,
    startMinute: freeStart(settings.zones, key),
    palette: JSON.parse(JSON.stringify(settings.zones.day.palette)),
  }
  return { ...settings, zones: { ...settings.zones, [key]: zone } }
}

// Turn a zone off (Day cannot be turned off). A forced override on it is dropped.
export function disableZone(settings: ThemeSettings, key: ZoneKey): ThemeSettings {
  if (key === 'day' || !settings.zones[key].configured) return settings
  return {
    ...settings,
    override: settings.override === key ? null : settings.override,
    zones: { ...settings.zones, [key]: { ...settings.zones[key], configured: false } },
  }
}

// Repair settings read from storage: fill missing zones, keep Day configured,
// snap start times to 10 minutes, normalize palettes, drop a stale override.
export function normalizeTheme(input: Partial<ThemeSettings> | null | undefined): ThemeSettings {
  const zones = {} as Record<ZoneKey, ZoneConfig>
  for (const key of ZONE_KEYS) {
    const fallback = defaultZone(key)
    const given = input?.zones?.[key]
    const start = typeof given?.startMinute === 'number' && Number.isFinite(given.startMinute) ? given.startMinute : fallback.startMinute
    zones[key] = {
      configured: key === 'day' ? true : Boolean(given?.configured),
      startMinute: Math.min(MAX_START, Math.max(0, Math.round(start / STEP_MINUTES) * STEP_MINUTES)),
      palette: normalizePalette(given?.palette ?? fallback.palette),
    }
  }
  const override = input?.override && ZONE_KEYS.includes(input.override) && zones[input.override].configured ? input.override : null
  return { timeBasedEnabled: Boolean(input?.timeBasedEnabled), override, zones }
}

// The zone whose palette is shown: the clock's zone when time-based theming
// is on, else Day.
export function clockZone(settings: ThemeSettings, now: Date): ZoneKey {
  if (!settings.timeBasedEnabled) return 'day'
  return resolveZone(settings.zones, minuteOfDay(now))
}

// A forced override wins over the clock.
export function activeZone(settings: ThemeSettings, now: Date): ZoneKey {
  return settings.override ?? clockZone(settings, now)
}
