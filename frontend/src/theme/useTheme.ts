import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { CURRENT_USER } from '../userSeed'
import { useSettings } from '../settings/settingsStore'
import { applyVars, zoneVars } from './applyTheme'
import { clockZone, msUntilNextBoundary } from './zones'
import type { Role, ThemeSettings, ZoneKey } from './types'

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

// The current time, re-read at each zone boundary, every minute, and whenever
// the window becomes visible/focused again (sleep, clock changes, timer drift).
function useNow(settings: ThemeSettings): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      setNow(new Date())
      const ms = msUntilNextBoundary(settings.zones, new Date())
      if (timer) clearTimeout(timer)
      if (ms !== null) timer = setTimeout(tick, ms + 50)
    }
    tick()
    const interval = setInterval(() => setNow(new Date()), 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [settings.zones, settings.timeBasedEnabled])
  return now
}

export interface ThemeState {
  settings: ThemeSettings
  role: Role // the seeded user's own role
  effectiveRole: Role // role, unless "view as" is set
  clockZone: ZoneKey // the zone the schedule is in (Day when time-based is off)
  activeZone: ZoneKey // what is actually shown: preview > override > clock
}

export function useThemeState(): ThemeState {
  const { theme, ui } = useSettings()
  const previewZone = usePreviewZone()
  const now = useNow(theme)
  const role = CURRENT_USER.role
  const clock = clockZone(theme, now)
  return {
    settings: theme,
    role,
    effectiveRole: ui.viewAs ?? role,
    clockZone: clock,
    activeZone: previewZone ?? theme.override ?? clock,
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
