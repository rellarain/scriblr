import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { CURRENT_USER } from '../userSeed'
import { getSettings, subscribeSettings, useSettings } from '../settings/settingsStore'
import { applyVars, zoneVars } from './applyTheme'
import { clockZone, msUntilNextBoundary } from './zones'
import type { Role, ThemeSettings, ZoneKey, ZonePalette } from './types'

// --- a zone being previewed while its settings are open (not saved) ---

let preview: ZoneKey | null = null
const previewListeners = new Set<() => void>()

export function setPreviewZone(zone: ZoneKey | null): void {
  if (preview === zone) return
  preview = zone
  previewListeners.forEach(fn => fn())
}

function usePreviewZone(): ZoneKey | null {
  return useSyncExternalStore(
    fn => { previewListeners.add(fn); return () => { previewListeners.delete(fn) } },
    () => preview,
    () => preview,
  )
}

// --- the clock ---

// One clock for the whole app (it used to be one timer and four listeners per component that read the theme). It runs while
// anything is subscribed. The current time is re-read at each zone boundary, every minute, and whenever the window becomes
// visible/focused again (sleep, clock changes, timer drift); components subscribe to the zone it gives, not to the time, so
// they render only when the zone changes.
let clockNow = new Date()
const clockListeners = new Set<() => void>()
let stopClock: (() => void) | null = null

function startClock(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let { zones, timeBasedEnabled } = getSettings().theme
  const tick = () => {
    clockNow = new Date()
    clockListeners.forEach(fn => fn())
    const ms = msUntilNextBoundary(getSettings().theme.zones, clockNow)
    if (timer) clearTimeout(timer)
    if (ms !== null) timer = setTimeout(tick, ms + 50)
  }
  tick()
  const interval = setInterval(tick, 60_000)
  const onVisible = () => { if (document.visibilityState === 'visible') tick() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', tick)
  // New zone times move the next boundary.
  const unsubscribe = subscribeSettings(() => {
    const theme = getSettings().theme
    if (theme.zones === zones && theme.timeBasedEnabled === timeBasedEnabled) return
    ;({ zones, timeBasedEnabled } = theme)
    tick()
  })
  return () => {
    if (timer) clearTimeout(timer)
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', tick)
    unsubscribe()
  }
}

function subscribeClock(fn: () => void): () => void {
  clockListeners.add(fn)
  if (!stopClock) stopClock = startClock()
  return () => {
    clockListeners.delete(fn)
    if (clockListeners.size === 0 && stopClock) { stopClock(); stopClock = null }
  }
}

// The zone the schedule is in now. A string, so it is the same value until the zone changes.
function currentClockZone(): ZoneKey {
  return clockZone(getSettings().theme, stopClock ? clockNow : new Date())
}

function useClockZone(): ZoneKey {
  return useSyncExternalStore(subscribeClock, currentClockZone, currentClockZone)
}

export interface ThemeState {
  settings: ThemeSettings
  role: Role // the seeded user's own role
  effectiveRole: Role // role, unless "view as" is set
  clockZone: ZoneKey // the zone the schedule is in (Day when time-based is off)
  activeZone: ZoneKey // what is actually shown: preview > override > clock
}

// A subtree that shows one zone (and, optionally, its own palette) whatever the app's clock says: components read the zone through
// useThemeState, so inside a ThemeZoneProvider they draw for that zone. Used by the design system's previews to show several zones
// side by side; the app itself never mounts one.
export interface ThemeZoneOverride { zone: ZoneKey; palette?: ZonePalette }
const ThemeZoneContext = createContext<ThemeZoneOverride | null>(null)
export const ThemeZoneProvider = ThemeZoneContext.Provider

export function useThemeState(): ThemeState {
  const { theme, ui } = useSettings()
  const previewZone = usePreviewZone()
  const forced = useContext(ThemeZoneContext)
  const clock = useClockZone()
  const role = CURRENT_USER.role
  const activeZone = forced?.zone ?? previewZone ?? theme.override ?? clock
  const settings = useMemo<ThemeSettings>(() => {
    if (!forced?.palette) return theme
    return { ...theme, zones: { ...theme.zones, [forced.zone]: { ...theme.zones[forced.zone], palette: forced.palette } } }
  }, [theme, forced])
  return {
    settings,
    role,
    effectiveRole: ui.viewAs ?? role,
    clockZone: clock,
    activeZone,
  }
}

// Mounted once, near the top of the app: keeps <html>'s theme variables in
// step with the active zone and palette.
export function useThemeEngine(): ThemeState {
  const state = useThemeState()
  const palette = state.settings.zones[state.activeZone].palette
  const vars = useMemo(
    () => zoneVars(state.settings, state.activeZone, state.effectiveRole),
    // Only the palette and role matter to the derived variables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [palette, state.activeZone, state.effectiveRole],
  )
  useLayoutEffect(() => { applyVars(vars) }, [vars])
  return state
}
