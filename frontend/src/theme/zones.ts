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

// The zones that are on, always in the day's order: dawn, day, dusk, night. Their start times are kept in that order too (normalizeTheme,
// enableZone and moveZoneStart see to it), so this is also the order they occur across the day.
export function configuredZones(zones: Record<ZoneKey, ZoneConfig>): ZoneKey[] {
  return ZONE_KEYS.filter(k => zones[k].configured)
}

// The zone in effect at a minute of the day: the configured zone with the
// latest start at or before it, wrapping past midnight to the day's last
// start. With one configured zone, that zone always.
export function resolveZone(zones: Record<ZoneKey, ZoneConfig>, minuteOfDay: number): ZoneKey {
  // By start time, so a schedule is read right even if its starts were not in order (a stable sort: a tie keeps the day's order).
  const order = configuredZones(zones).sort((a, b) => zones[a].startMinute - zones[b].startMinute)
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

// Where a zone can begin between the zone before it and the one after it in the day's order (undefined when there is none): the time
// asked for if it is an hour clear of both, else the nearest time that is, else, when the two are closer than that, half way between.
function startBetween(before: number | undefined, after: number | undefined, preferred: number): number {
  const lowest = before === undefined ? 0 : before + HOUR
  const highest = after === undefined ? MAX_HOUR_START : after - HOUR
  if (lowest <= highest) return Math.min(Math.max(preferred, lowest), highest)
  return Math.round(((before ?? 0) + (after ?? MAX_START)) / 2 / STEP_MINUTES) * STEP_MINUTES
}

// The start for a zone being turned on: its default time (dawn 4 AM, day 10 AM, dusk 4 PM, night 10 PM) where that keeps the day's order,
// else the nearest time that does, between the zones on before it and after it. (Not the time it had when it was last on: that is left
// over from a schedule that is gone, and need not suit the one it joins.)
function startFor(zones: Record<ZoneKey, ZoneConfig>, key: ZoneKey): number {
  const at = ZONE_KEYS.indexOf(key)
  const earlier = ZONE_KEYS.slice(0, at).filter(k => zones[k].configured)
  const later = ZONE_KEYS.slice(at + 1).filter(k => zones[k].configured)
  return startBetween(
    earlier.length > 0 ? zones[earlier[earlier.length - 1]].startMinute : undefined,
    later.length > 0 ? zones[later[0]].startMinute : undefined,
    DEFAULT_START[key],
  )
}

// Puts the start times of the zones that are on in the day's order, dawn, day, dusk, night, each later than the one before. Times that are
// not (an old save, or a time left over from when a zone was last on) are put right: a zone that is the one out of place goes between its
// neighbours; when more than one is out of place they all go back to their default times. Times already in order are left as they are.
function keepInOrder(zones: Record<ZoneKey, ZoneConfig>): void {
  const on = configuredZones(zones)
  const starts = on.map(k => zones[k].startMinute)
  if (starts.every((s, i) => i === 0 || s > starts[i - 1])) return
  const set = (i: number, start: number) => { zones[on[i]] = { ...zones[on[i]], startMinute: start } }
  // The most zones that already begin in order (there are at most four, so every choice is tried).
  let kept: number[] = []
  for (let mask = 1; mask < 1 << on.length; mask++) {
    const picked = on.map((_, i) => i).filter(i => mask & (1 << i))
    if (picked.length > kept.length && picked.every((i, j) => j === 0 || starts[i] > starts[picked[j - 1]])) kept = picked
  }
  if (kept.length < on.length - 1) {
    on.forEach((key, i) => set(i, DEFAULT_START[key]))
    return
  }
  const stray = on.map((_, i) => i).find(i => !kept.includes(i)) as number
  const before = kept.filter(i => i < stray).pop()
  const after = kept.find(i => i > stray)
  set(stray, startBetween(before === undefined ? undefined : starts[before], after === undefined ? undefined : starts[after], DEFAULT_START[on[stray]]))
  // Where two are left closer than a step, they are moved apart (the last can begin at 11:50 PM).
  const apart = on.map(k => zones[k].startMinute)
  for (let i = 1; i < apart.length; i++) apart[i] = Math.max(apart[i], apart[i - 1] + STEP_MINUTES)
  if (apart[apart.length - 1] > MAX_START) {
    apart[apart.length - 1] = MAX_START
    for (let i = apart.length - 2; i >= 0; i--) apart[i] = Math.min(apart[i], apart[i + 1] - STEP_MINUTES)
  }
  apart.forEach((start, i) => set(i, start))
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

// Turn a zone on, with a copy of the previous zone's hues (and the swatches they are linked to). It begins where it fits the day's order.
export function enableZone(settings: ThemeSettings, key: ZoneKey): ThemeSettings {
  if (settings.zones[key].configured) return settings
  const from = previousZone(settings.zones, key)
  const source = from ? settings.zones[from] : defaultZone('day')
  const zone: ZoneConfig = {
    configured: true,
    startMinute: startFor(settings.zones, key),
    palette: JSON.parse(JSON.stringify(source.palette)),
    links: { ...source.links },
  }
  return { ...settings, zones: { ...settings.zones, [key]: zone } }
}

// Turn a zone off: it loses its colours and its start time (both go back to their defaults). At least one zone stays on (the last one is
// not turned off). A forced override on it is dropped.
export function disableZone(settings: ThemeSettings, key: ZoneKey): ThemeSettings {
  if (!settings.zones[key].configured || configuredZones(settings.zones).length <= 1) return settings
  const cleared = defaultZone(key)
  return {
    ...settings,
    override: settings.override === key ? null : settings.override,
    zones: { ...settings.zones, [key]: { ...settings.zones[key], configured: false, startMinute: cleared.startMinute, palette: cleared.palette, links: {} } },
  }
}

// Repair settings read from storage: fill missing zones, keep at least one zone on (Day if none is),
// snap start times to 10 minutes and keep those of the zones that are on in the day's order (dawn, day, dusk, night), keep just the hues of each palette (older
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
  keepInOrder(zones)

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
