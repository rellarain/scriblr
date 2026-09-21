import type { ThemeSettings, UiSettings, ZoneConfig, ZoneKey, ZonePalette } from './types'

// The hues every install starts with (in every zone, until the user changes them).
export const DEFAULT_PALETTE: ZonePalette = {
  theme: { h: 330 },
  accent: { h: 32 },
  alert: { h: 200 },
  accent2: { h: 260 },
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

export const DEFAULT_UI_SETTINGS: UiSettings = { viewAs: null, handedness: 'right', autosaveEnabled: true, autosaveSeconds: 30 }
