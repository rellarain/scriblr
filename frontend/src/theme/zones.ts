import { DEFAULT_START, defaultZone } from './defaults'
import { normalizePalette } from './paletteRules'
import { autoLinks, normalizeHues, normalizeLinks, seedHues, syncPalette } from './themeHues'
import { ZONE_KEYS, type ThemeSettings, type ZoneConfig, type ZoneKey } from './types'

const DAY_MINUTES = 1440
const DAY_MS = DAY_MINUTES * 60_000

export const STEP_MINUTES = 10
export const MAX_START = DAY_MINUTES - STEP_MINUTES
// The timeline's handles move by the hour, and keep an hour between zones; the last whole hour a zone can begin is 11 PM.
export const HOUR = 60
export const MAX_HOUR_START = DAY_MINUTES - HOUR

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

// Move where a zone begins (the timeline's handle). The zones in use keep their order and at least an hour each: a zone that
// would be run into is pushed along ahead of it (or back, going the other way), and none is carried past midnight. A zone that is
// the only one in use simply moves (it is in effect all day; the time is where its colours would begin once others are turned on).
export function moveZoneStart(settings: ThemeSettings, key: ZoneKey, target: number): ThemeSettings {
  const order = configuredZones(settings.zones)
  const k = order.indexOf(key)
  if (k < 0) return settings
  const n = order.length
  const starts = order.map(z => settings.zones[z].startMinute)
  starts[k] = Math.min(Math.max(Math.round(target), HOUR * k), MAX_HOUR_START - HOUR * (n - 1 - k))
  for (let i = k + 1; i < n; i++) starts[i] = Math.max(starts[i], starts[i - 1] + HOUR)
  for (let i = k - 1; i >= 0; i--) starts[i] = Math.min(starts[i], starts[i + 1] - HOUR)
  if (order.every((z, i) => starts[i] === settings.zones[z].startMinute)) return settings
  const zones = { ...settings.zones }
  order.forEach((z, i) => { zones[z] = { ...zones[z], startMinute: starts[i] } })
  return { ...settings, zones }
}

// Put a zone back to the time it begins at by default (pushing a neighbour along if it is in the way).
export const resetZoneStart = (settings: ThemeSettings, key: ZoneKey): ThemeSettings => moveZoneStart(settings, key, DEFAULT_START[key])

// The zone a newly turned-on zone takes its colours from: the one before it in the day's order (dawn, day, dusk, night, round to dawn
// again) that is on, going further back past any that are off. Null when no other zone is on.
export function previousZone(zones: Record<ZoneKey, ZoneConfig>, key: ZoneKey): ZoneKey | null {
  const at = ZONE_KEYS.indexOf(key)
  for (let back = 1; back < ZONE_KEYS.length; back += 1) {
    const candidate = ZONE_KEYS[(at - back + ZONE_KEYS.length) % ZONE_KEYS.length]
    if (zones[candidate].configured) return candidate
  }
  return null
}

// Turn a zone on, with a copy of the previous zone's hues (and the swatches they are linked to).
export function enableZone(settings: ThemeSettings, key: ZoneKey): ThemeSettings {
  if (settings.zones[key].configured) return settings
  const from = previousZone(settings.zones, key)
  const source = from ? settings.zones[from] : defaultZone('day')
  const zone: ZoneConfig = {
    configured: true,
    startMinute: freeStart(settings.zones, key),
    palette: JSON.parse(JSON.stringify(source.palette)),
    links: { ...source.links },
  }
  return { ...settings, zones: { ...settings.zones, [key]: zone } }
}

// Turn a zone off: it keeps its start time and loses its colours. At least one zone stays on (the last one is not turned off). A forced
// override on it is dropped.
export function disableZone(settings: ThemeSettings, key: ZoneKey): ThemeSettings {
  if (!settings.zones[key].configured || configuredZones(settings.zones).length <= 1) return settings
  const cleared = defaultZone(key)
  return {
    ...settings,
    override: settings.override === key ? null : settings.override,
    zones: { ...settings.zones, [key]: { ...settings.zones[key], configured: false, palette: cleared.palette, links: {} } },
  }
}

// Repair settings read from storage: fill missing zones, keep at least one zone on (Day if none is),
// snap start times to 10 minutes, keep just the hues of each palette (older
// saves also held saturation and brightness), drop an override that names no zone that is on.
// The hue list (up to ten swatches) and each role's link to one are repaired too; an account that has no list yet gets one made of the hues
// its zones use, and each role linked to the swatch of its hue. A linked role's hue is always its swatch's. A zone that is off has no colours.
// Whether the app follows the clock is no longer a choice: it does when two or more zones are on.
export function normalizeTheme(input: Partial<ThemeSettings> | null | undefined): ThemeSettings {
  const zones = {} as Record<ZoneKey, ZoneConfig>
  for (const key of ZONE_KEYS) {
    const fallback = defaultZone(key)
    const given = input?.zones?.[key]
    const start = typeof given?.startMinute === 'number' && Number.isFinite(given.startMinute) ? given.startMinute : fallback.startMinute
    zones[key] = {
      configured: given ? Boolean(given.configured) : fallback.configured,
      startMinute: Math.min(MAX_START, Math.max(0, Math.round(start / STEP_MINUTES) * STEP_MINUTES)),
      palette: normalizePalette(given?.palette ?? fallback.palette),
      links: {},
    }
  }
  if (!ZONE_KEYS.some(key => zones[key].configured)) zones.day = { ...zones.day, configured: true }

  let hues = normalizeHues(input?.hues)
  const seeded = hues.length === 0
  if (seeded) hues = seedHues(zones)
  for (const key of ZONE_KEYS) {
    const links = seeded ? autoLinks(zones[key].palette, hues) : normalizeLinks(input?.zones?.[key]?.links, hues)
    // A zone that is off keeps no links (and, so, no colours of its own).
    zones[key] = zones[key].configured ? { ...zones[key], links, palette: syncPalette(zones[key].palette, links, hues) } : { ...zones[key], links: {} }
  }

  const on = ZONE_KEYS.filter(key => zones[key].configured)
  const override = input?.override && on.includes(input.override) ? input.override : null
  return { timeBasedEnabled: on.length >= 2, override, zones, hues }
}

// The zone the clock puts the app in: with two or more zones on, the one the schedule is in now; with one, that zone.
export function clockZone(settings: ThemeSettings, now: Date): ZoneKey {
  const on = configuredZones(settings.zones)
  if (on.length === 0) return 'day'
  if (on.length === 1) return on[0]
  return resolveZone(settings.zones, minuteOfDay(now))
}

// A forced override wins over the clock.
export function activeZone(settings: ThemeSettings, now: Date): ZoneKey {
  return settings.override ?? clockZone(settings, now)
}
