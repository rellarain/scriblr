import type { HueSwatch, ThemeSettings, UiSettings, ZoneConfig, ZoneKey, ZonePalette } from './types'

// The hues every install starts with (in every zone, until the user changes them).
export const DEFAULT_PALETTE: ZonePalette = {
  theme: { h: 330 },
  accent: { h: 32 },
  alert: { h: 200 },
  accent2: { h: 260 },
}

// The account's hue list on a new install: the four default hues.
export const DEFAULT_HUE_SWATCHES: HueSwatch[] = [
  { id: 'h1', h: DEFAULT_PALETTE.theme.h }, { id: 'h2', h: DEFAULT_PALETTE.accent.h }, { id: 'h3', h: DEFAULT_PALETTE.alert.h }, { id: 'h4', h: DEFAULT_PALETTE.accent2.h },
]

// Where each zone begins until the user moves it: dawn 4 AM, day 10 AM, dusk 4 PM, night 10 PM.
export const DEFAULT_START: Record<ZoneKey, number> = { dawn: 240, day: 600, dusk: 960, night: 1320 }

export function defaultZone(key: ZoneKey): ZoneConfig {
  return {
    configured: key === 'day',
    startMinute: DEFAULT_START[key],
    palette: JSON.parse(JSON.stringify(DEFAULT_PALETTE)) as ZonePalette,
    // A zone that is on starts with its roles linked to the default swatches; one that is off has no colours.
    links: key === 'day' ? { theme: 'h1', accent: 'h2', alert: 'h3', accent2: 'h4' } : {},
  }
}

export function defaultThemeSettings(): ThemeSettings {
  return {
    timeBasedEnabled: false,
    override: null,
    zones: { dawn: defaultZone('dawn'), day: defaultZone('day'), dusk: defaultZone('dusk'), night: defaultZone('night') },
    hues: DEFAULT_HUE_SWATCHES.map(s => ({ ...s })),
  }
}

export const DEFAULT_UI_SETTINGS: UiSettings = { viewAs: null, handedness: 'right', autosaveEnabled: false, autosaveSeconds: 60 }
