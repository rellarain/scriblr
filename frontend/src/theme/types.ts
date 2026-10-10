// Time-of-day theming: four zones, each with its own palette. The shapes here
// are mirrored by the backend's user-settings schema (backend/app/storage/schema.py).

export type ZoneKey = 'dawn' | 'day' | 'dusk' | 'night'
export const ZONE_KEYS: ZoneKey[] = ['dawn', 'day', 'dusk', 'night']
export const ZONE_LABEL: Record<ZoneKey, string> = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' }

export interface Hue { h: number }

// theme: inert / read-only; accent: interactive / active; alert: needs
// attention; accent2: admin features (admins only).
export type PaletteKey = 'theme' | 'accent' | 'alert' | 'accent2'
export const PALETTE_KEYS: PaletteKey[] = ['theme', 'accent', 'alert', 'accent2']

// All a user chooses per zone: four hues. Saturation and lightness are the
// zone's fixed look (zoneLooks.ts).
export interface ZonePalette {
  theme: Hue
  accent: Hue
  alert: Hue
  accent2: Hue
}

export interface ZoneConfig {
  configured: boolean
  startMinute: number // minutes after midnight, a multiple of 10 (0..1430)
  palette: ZonePalette
}

export interface ThemeSettings {
  timeBasedEnabled: boolean
  override: ZoneKey | null
  zones: Record<ZoneKey, ZoneConfig>
}

export type Role = 'user' | 'admin'
export type Handedness = 'left' | 'right'

export interface UiSettings {
  viewAs: Role | null
  handedness: Handedness
  // Autosave: on/off (off by default), and the seconds of inactivity before an editor saves on
  // its own: 1, 5 or 10 minutes (AUTOSAVE_SECONDS).
  autosaveEnabled: boolean
  autosaveSeconds: number
}

// The waits an editor can autosave after: 1, 5 or 10 minutes (the Save component's toggle also has Off).
export const AUTOSAVE_SECONDS = [60, 300, 600] as const
export type AutosaveSeconds = (typeof AUTOSAVE_SECONDS)[number]
// What the toggle shows: 0 = off, else the wait in seconds.
export type AutosaveMode = 0 | AutosaveSeconds
export const autosaveModeOf = (ui: Pick<UiSettings, 'autosaveEnabled' | 'autosaveSeconds'>): AutosaveMode =>
  ui.autosaveEnabled ? (ui.autosaveSeconds as AutosaveSeconds) : 0
