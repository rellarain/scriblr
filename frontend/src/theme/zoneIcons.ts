import type { ComponentType } from 'react'
import { MoonIcon, SunIcon, SunriseIcon, SunsetIcon, type IconProps } from '../assets/icons'
import type { ZoneKey } from './types'

export const ZONE_ICON: Record<ZoneKey, ComponentType<IconProps>> = {
  dawn: SunriseIcon, day: SunIcon, dusk: SunsetIcon, night: MoonIcon,
}
