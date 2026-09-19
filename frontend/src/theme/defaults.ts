import type { ThemeSettings, UiSettings, ZoneConfig, ZoneKey, ZonePalette } from './types'

// Today's colors: the Day palette every install starts with, so nothing looks
// different until the user configures more zones.
export const DEFAULT_PALETTE: ZonePalette = {
  brightness: 35,
  theme: { h: 330, s: 30 },
  accent: { h: 32, s: 95 },
  alert: { h: 200, s: 100 },
  accent2: { h: 260, s: 60 },
}

const DEFAULT_START: Record<ZoneKey, number> = { dawn: 330, day: 420, dusk: 1080, night: 1260 }

export function defaultZone(key: ZoneKey): ZoneConfig {
  return {
    configured: key === 'day',
    startMinute: DEFAULT_START[key],
    palette: JSON.parse(JSON.stringify(DEFAULT_PALETTE)) as ZonePalette,
  }
}

export function defaultThemeSettings(): ThemeSettings {
  return {
    timeBasedEnabled: false,
    override: null,
    zones: { dawn: defaultZone('dawn'), day: defaultZone('day'), dusk: defaultZone('dusk'), night: defaultZone('night') },
  }
}

export const DEFAULT_UI_SETTINGS: UiSettings = { viewAs: null, handedness: 'right' }
