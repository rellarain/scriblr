import { formatMinute } from './zones'
import { ZONE_LABEL, type ZonePalette, type ZoneKey } from './types'
import { skyLook } from './skyLook'
import { usePageHidden } from './usePageHidden'
import SkyScene from './SkyScene'
import './skyToggle.scss'

// A zone button in Theme settings, dressed like the header's sky toggle (120x30):
// that zone's own sky and sun or moon on the left, its name in place of the time
// and its start time in place of the date ("Off" while the zone is not in use).
function SkyZoneTab({ zone, palette, configured, startMinute, selected, now, onSelect }: {
  zone: ZoneKey
  palette: ZonePalette
  configured: boolean
  startMinute: number
  selected: boolean
  now: Date
  onSelect: () => void
}) {
  const look = skyLook(zone, palette)
  const hidden = usePageHidden()
  const classes = ['skyBox', 'skyTab', selected ? 'skyTab--selected' : '', configured ? '' : 'skyTab--off', hidden ? 'skyBox--paused' : '']
  return (
    <button
      type="button" role="tab" aria-selected={selected}
      className={classes.filter(Boolean).join(' ')} data-zone={zone}
      aria-label={configured ? `${ZONE_LABEL[zone]}, from ${formatMinute(startMinute)}` : `${ZONE_LABEL[zone]}, not in use`}
      onClick={onSelect}
    >
      <SkyScene zone={zone} look={look} now={now} following={false} />
      <span className="skyTabText" style={{ color: look.text }}>
        <span className="skyTime">{ZONE_LABEL[zone]}</span>
        <span className="skyDate">{configured ? formatMinute(startMinute) : 'Off'}</span>
      </span>
    </button>
  )
}

export default SkyZoneTab
