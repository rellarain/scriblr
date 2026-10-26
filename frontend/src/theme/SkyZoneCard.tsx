import { formatMinute } from './zones'
import { ZONE_LABEL, type ZoneKey, type ZonePalette } from './types'
import { OFF_SKY_SATURATION, skyLook } from './skyLook'
import { usePageHidden } from './usePageHidden'
import SkyScene from './SkyScene'
import './skyToggle.scss'

// The header of a time-of-day card in the account theme panel: a large version of the header's sky toggle. The painted sky, the sun or
// moon, the stars and the clouds are the toggle's own (SkyScene), drawn at 120x30 and scaled to the width of the card by CSS (skyToggle.scss);
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
  const label = ZONE_LABEL[zone]
  const stuck = configured && onlyOne
  const description = configured
    ? (stuck ? `${label}, on, from ${formatMinute(startMinute)}. It is the only time of day on, so it stays on` : `${label}, on, from ${formatMinute(startMinute)}. Turn off`)
    : `${label}, off. Turn on`
  const classes = ['skyCard', configured ? '' : 'skyCard--off', stuck ? 'skyCard--stuck' : '', hidden ? 'skyCard--paused' : '']
  return (
    <button
      type="button" className={classes.filter(Boolean).join(' ')} data-zone={zone}
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
