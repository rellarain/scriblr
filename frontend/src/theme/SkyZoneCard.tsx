import { useLayoutEffect, useRef } from 'react'
import { formatMinute } from './zones'
import { ZONE_LABEL, type ZoneKey, type ZonePalette } from './types'
import { OFF_SKY_SATURATION, skyLook } from './skyLook'
import { usePageHidden } from './usePageHidden'
import SkyScene from './SkyScene'
import './skyToggle.scss'

// The width of the 120x30 sky that SkyScene draws; the card scales it to its own width.
const SKY_WIDTH = 120

// Keeps `--sky-scale` on the element equal to its width over the sky's, as it is resized. CSS cannot work this out in the app's own
// browser (Electron's Chromium 120 reads `atan2(100cqw, 120px)` as 100 / 120), so it is measured. Written straight to the element, so a
// resize does not render the card again; where nothing is measured (jsdom) the stylesheet's fallback applies.
function useSkyScale<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => { if (el.offsetWidth > 0) el.style.setProperty('--sky-scale', String(el.offsetWidth / SKY_WIDTH)) }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

// The header of a time-of-day card in the account theme panel: a large version of the header's sky toggle. The painted sky, the sun or
// moon, the stars and the clouds are the toggle's own (SkyScene), drawn at 120x30 and scaled to the width of the card (see useSkyScale);
// the zone's name and its start time (or "Off") are text over it, fitted to read on that sky.
//
// Pressing it turns the zone on or off. A zone that is off is painted subtly, from `offPalette` (the theme hue of the zone in use) at
// a share of the saturation. The last zone left on cannot be turned off.
function SkyZoneCard({ zone, configured, startMinute, palette, offPalette, onlyOne, now, onToggle }: {
  zone: ZoneKey
  configured: boolean
  startMinute: number
  palette: ZonePalette
  offPalette: ZonePalette
  onlyOne: boolean
  now: Date
  onToggle: () => void
}) {
  const look = configured ? skyLook(zone, palette) : skyLook(zone, offPalette, OFF_SKY_SATURATION)
  const hidden = usePageHidden()
  const buttonRef = useSkyScale<HTMLButtonElement>()
  const label = ZONE_LABEL[zone]
  const stuck = configured && onlyOne
  const description = configured
    ? (stuck ? `${label}, on, from ${formatMinute(startMinute)}. It is the only time of day on, so it stays on` : `${label}, on, from ${formatMinute(startMinute)}. Turn off`)
    : `${label}, off. Turn on`
  const classes = ['skyCard', configured ? '' : 'skyCard--off', stuck ? 'skyCard--stuck' : '', hidden ? 'skyCard--paused' : '']
  return (
    <button
      ref={buttonRef} type="button" className={classes.filter(Boolean).join(' ')} data-zone={zone}
      aria-pressed={configured} aria-disabled={stuck} aria-label={description} title={description}
      onClick={() => { if (!stuck) onToggle() }}
    >
      <span className="skyScaler"><SkyScene zone={zone} look={look} now={now} following={false} /></span>
      <span className="skyCardText" style={{ color: look.text }}>
        <span className="skyCardName">{label}</span>
        <span className="skyCardTime">{configured ? formatMinute(startMinute) : 'Off'}</span>
      </span>
    </button>
  )
}

export default SkyZoneCard
