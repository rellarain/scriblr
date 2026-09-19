// Time-of-day theming: four zones, each with its own palette. The shapes here
// are mirrored by the backend's user-settings schema (backend/app/storage/schema.py).

export type ZoneKey = 'dawn' | 'day' | 'dusk' | 'night'
export const ZONE_KEYS: ZoneKey[] = ['dawn', 'day', 'dusk', 'night']
export const ZONE_LABEL: Record<ZoneKey, string> = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' }

export interface HS { h: number; s: number }

// theme: inert / read-only; accent: interactive / active; alert: needs
// attention; accent2: admin features (admins only).
export type PaletteKey = 'theme' | 'accent' | 'alert' | 'accent2'
export const PALETTE_KEYS: PaletteKey[] = ['theme', 'accent', 'alert', 'accent2']

export interface ZonePalette {
  brightness: number // 0..100, the theme's base lightness
  theme: HS
  accent: HS
  alert: HS
  accent2: HS
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
}
