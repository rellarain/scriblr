import { setTheme } from '../settings/settingsStore'
import { useThemeState } from './useTheme'
import { useMinuteClock } from './useMinuteClock'
import { usePageHidden } from './usePageHidden'
import { configuredZones, formatMinute, minuteOfDay } from './zones'
import { ZONE_LABEL } from './types'
import { nextZone } from './sky'
import { skyLook } from './skyLook'
import SkyScene from './SkyScene'
import './skyToggle.scss'

// The zone switch in the header (120x30): a painted sky with two buttons on it.
// The left one (a sun or moon) steps to the next zone that is on and locks it; the right one
// (the time and date) goes back to following the clock. The sky, orbs, stars and
// clouds are drawn behind the buttons (SkyScene); only the text is a real part of them.
// With only one zone on there is nothing to step to, so the left button is dimmed and does nothing.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function SkyToggle() {
  const { settings, clockZone, activeZone } = useThemeState()
  const now = useMinuteClock()
  const hidden = usePageHidden()
  const zone = activeZone
  const locked = settings.override !== null
  const inEffect = settings.override ?? clockZone
  const on = configuredZones(settings.zones)
  const upcoming = nextZone(inEffect, on)
  const look = skyLook(zone, settings.zones[zone].palette)

  const stepLabel = on.length > 1 ? `Theme: ${ZONE_LABEL[inEffect]}. Switch to ${ZONE_LABEL[upcoming]}` : `Theme: ${ZONE_LABEL[inEffect]}. It is the only time of day turned on`
  const clockLabel = locked ? `Locked to ${ZONE_LABEL[inEffect]}. Follow the clock` : 'Following the clock'
  const time = formatMinute(minuteOfDay(now))
  const date = `${MONTHS[now.getMonth()]} ${now.getDate()}`

  return (
    <div className={hidden ? 'skyBox skyToggle skyBox--paused' : 'skyBox skyToggle'} role="group" aria-label="Time of day" data-zone={zone} data-locked={locked}>
      <SkyScene zone={zone} look={look} now={now} following={!locked} />

      <button
        type="button" className="skySunBtn" style={{ color: look.sun }}
        aria-label={stepLabel} title={stepLabel} aria-disabled={on.length < 2}
        onClick={() => {
          if (on.length < 2) return
          setTheme(prev => ({ ...prev, override: nextZone(prev.override ?? clockZone, configuredZones(prev.zones)) }))
        }}
      />
      <button
        type="button" className={locked ? 'skyTimeBtn skyTimeBtn--locked' : 'skyTimeBtn'} style={{ color: locked ? look.textLocked : look.text }}
        aria-label={`${clockLabel}. ${time}, ${date}`} title={clockLabel}
        onClick={() => setTheme(prev => ({ ...prev, override: null }))}
      >
        <span className="skyTime">{time}</span>
        <span className="skyDate">{date}</span>
      </button>
    </div>
  )
}

export default SkyToggle
