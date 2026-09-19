import { deriveTokens, type ThemeVars } from './tokens'
import { activeZone } from './zones'
import type { Role, ThemeSettings, ZoneKey } from './types'

// Writes the derived tokens onto <html>, where the registered @property
// variables (theme/_theme.scss) live and fade.

const HUE_VARS = ['--color-theme-h', '--color-accent-h', '--color-alert-h', '--color-accent2-h']
const lastHue = new Map<string, number>()

// Hues wrap around, but a transition between 330 and 32 would sweep the whole
// wheel the long way. Pick the equivalent hue nearest the previous one (it may
// leave 0..360; hsl() accepts that).
export function unwrapHue(previous: number | undefined, next: number): number {
  if (previous === undefined) return next
  const diff = ((next - previous + 540) % 360) - 180
  return previous + diff
}

export function applyVars(vars: ThemeVars, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(vars)) {
    let out = value
    if (HUE_VARS.includes(name)) {
      const hue = unwrapHue(lastHue.get(name), parseFloat(value))
      lastHue.set(name, hue)
      out = String(hue)
    }
    root.style.setProperty(name, out)
  }
}

export function zoneVars(settings: ThemeSettings, zone: ZoneKey, role: Role): ThemeVars {
  return deriveTokens(settings.zones[zone].palette, role)
}

// Apply the zone in effect right now, without any fade -- used before the
// first render so the very first paint is already themed.
export function applyInitialTheme(settings: ThemeSettings, role: Role, now = new Date()): void {
  const root = document.documentElement
  root.setAttribute('data-theme-boot', '')
  applyVars(zoneVars(settings, activeZone(settings, now), role), root)
}

// Let the fade run again after the first paint (two frames: the boot styles
// must actually be painted before the transition is re-enabled).
export function endBoot(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.removeAttribute('data-theme-boot')))
}
