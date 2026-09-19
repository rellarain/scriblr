import type { ComponentType } from 'react'
import { MoonIcon, SunIcon, SunriseIcon, SunsetIcon, type IconProps } from '../assets/icons'
import { setTheme } from '../settings/settingsStore'
import { configuredZones, formatMinute } from './zones'
import { useThemeState } from './useTheme'
import { ZONE_LABEL, type ZoneKey } from './types'
import './themeSettings.scss'

export const ZONE_ICON: Record<ZoneKey, ComponentType<IconProps>> = {
  dawn: SunriseIcon, day: SunIcon, dusk: SunsetIcon, night: MoonIcon,
}

// Override toggles on the UUI Dashboard: one icon per CONFIGURED time zone.
// Click one to force that palette; click the active override again to release
// it. The zone the clock is in is highlighted with the theme color (inert),
// a forced override with the accent color (active).
function ThemeZoneToggles() {
  const { settings, clockZone } = useThemeState()
  const zones = configuredZones(settings.zones)

  function toggle(key: ZoneKey) {
    setTheme(prev => ({ ...prev, override: prev.override === key ? null : key }))
  }

  return (
    <div className="themeZoneToggles" role="group" aria-label="Time-of-day theme">
      {zones.map(key => {
        const Icon = ZONE_ICON[key]
        const forced = settings.override === key
        const current = clockZone === key
        const classes = ['themeZoneBtn', forced ? 'themeZoneBtn--override' : '', current ? 'themeZoneBtn--clock' : '']
        const label = `${ZONE_LABEL[key]} from ${formatMinute(settings.zones[key].startMinute)}`
        return (
          <button
            key={key} type="button" className={classes.filter(Boolean).join(' ')}
            aria-pressed={forced}
            aria-label={forced ? `${label} (forced, click to release)` : label}
            title={forced ? `${label} - forced, click to release` : current ? `${label} - current` : label}
            onClick={() => toggle(key)}
          >
            <Icon size={18} />
          </button>
        )
      })}
    </div>
  )
}

export default ThemeZoneToggles
