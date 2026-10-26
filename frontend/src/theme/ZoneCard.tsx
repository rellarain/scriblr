import RoleSlot from './RoleSlot'
import SkyZoneCard from './SkyZoneCard'
import { useDropTarget, useThemeDnd } from './themeDnd'
import { ZONE_LOOKS } from './zoneLooks'
import { configuredZones } from './zones'
import { ZONE_LABEL, type PaletteKey, type ThemeSettings, type ZoneKey, type ZonePalette } from './types'

// A time of day in the account theme panel: the sky header (press it to turn the zone on or off) and, while it is on, a line saying what
// it looks like and a slot for each of its colours. A zone that is off is only its header.
//
// While a hue is dragged over the card its slots grow into drop targets (the one under the pointer lights up). The card takes the drop
// itself, doing nothing with it, so letting go between two slots does not count as letting go outside the list (which deletes a hue).
function ZoneCard({ zone, theme, roles, offPalette, now, onToggle }: {
  zone: ZoneKey
  theme: ThemeSettings
  roles: readonly PaletteKey[]
  offPalette: ZonePalette
  now: Date
  onToggle: () => void
}) {
  const dnd = useThemeDnd()
  const config = theme.zones[zone]
  const armed = useDropTarget(dnd.dragging !== null && config.configured, () => {})
  return (
    <section
      className={`zoneCard${config.configured ? '' : ' zoneCard--off'}`} data-zone={zone} data-armed={armed.over || undefined}
      aria-label={`${ZONE_LABEL[zone]} colours`}
      {...armed.props}
    >
      <SkyZoneCard
        zone={zone} configured={config.configured} startMinute={config.startMinute} palette={config.palette} offPalette={offPalette}
        onlyOne={configuredZones(theme.zones).length <= 1} now={now} onToggle={onToggle}
      />
      {config.configured && (
        <div className="zoneCardBody">
          <p className="zoneCardLook">{ZONE_LOOKS[zone].summary}</p>
          <div className="roleSlots">
            {roles.map(role => <RoleSlot key={role} zone={zone} role={role} theme={theme} />)}
          </div>
        </div>
      )}
    </section>
  )
}

export default ZoneCard
