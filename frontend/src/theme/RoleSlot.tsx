import { sameSource, startDrag, useDropTarget, useThemeDnd, type DragSource } from './themeDnd'
import { hslCss, shadeStrip } from './palettes'
import { ROLE_LABEL } from './themeHues'
import { resolvePalette } from './zoneLooks'
import { ZONE_LABEL, type PaletteKey, type ThemeSettings, type ZoneKey } from './types'

// One colour of a time of day (theme, accent, alert, admin accent) in the account theme panel: its name and hue, and under them the strip of
// ten shades of that hue at this zone's saturation and brightness (display only; the role's own colour is outlined).
//
// It takes a hue from the list by a drop (or a click once a swatch is picked up), and it can itself be dragged onto another slot: within
// a zone the two swap, between zones the second takes the first's hue. A role cannot be emptied; turning the zone off clears them all.

const ROLE_HINT: Record<PaletteKey, string> = {
  theme: 'Inert, inactive and read-only elements',
  accent: 'Interactive, dynamic and active items',
  alert: 'Warnings, errors and notifications',
  accent2: 'Admin panel and admin-only items',
}

export function RoleSlot({ zone, role, theme }: { zone: ZoneKey; role: PaletteKey; theme: ThemeSettings }) {
  const dnd = useThemeDnd()
  const config = theme.zones[zone]
  const own = resolvePalette(config.palette, zone)[role]
  const shades = shadeStrip(config.palette, zone, role)
  const linked = theme.hues.findIndex(h => h.id === config.links[role])
  const source: DragSource = { kind: 'role', zone, role }
  const picked = sameSource(dnd.picked, source)
  const target = useDropTarget(dnd.dragging !== null && !sameSource(dnd.dragging, source), () => { if (dnd.dragging) dnd.dropOnRole(dnd.dragging, zone, role) })

  const name = `${ZONE_LABEL[zone]} ${ROLE_LABEL[role].toLowerCase()}`
  const where = linked >= 0 ? `hue ${linked + 1} in the list` : 'not from the list'
  const click = () => {
    if (dnd.picked && !picked) { dnd.dropOnRole(dnd.picked, zone, role); dnd.pick(null); return }
    dnd.pick(picked ? null : source)
  }

  return (
    <button
      type="button"
      className={`roleSlot${target.over ? ' roleSlot--over' : ''}${picked ? ' roleSlot--picked' : ''}`}
      data-role={role} aria-pressed={picked}
      aria-label={`${name}: hue ${own.h}°, ${where}`}
      title={`${ROLE_LABEL[role]}: ${ROLE_HINT[role]}. Drop a hue here, or pick one up and click here.`}
      draggable
      onDragStart={e => { e.stopPropagation(); startDrag(e, name); dnd.begin(source, e) }}
      onDragEnd={dnd.end}
      onClick={click}
      {...target.props}
    >
      <span className="roleSlotHead">
        <span className="roleSlotName">{ROLE_LABEL[role]}</span>
        <span className="roleSlotHue">{own.h}°{linked >= 0 ? ` · hue ${linked + 1}` : ''}</span>
      </span>
      <span className="shadeStrip" aria-hidden="true">
        {shades.map(s => (
          <span key={s.key} className={s.key === 'own' ? 'shade shade--own' : 'shade'} style={{ backgroundColor: hslCss(s.color) }} title={`${s.label}: ${hslCss(s.color)}`} />
        ))}
      </span>
      <span className="roleSlotDrop" aria-hidden="true">Use for {ROLE_LABEL[role].toLowerCase()}</span>
    </button>
  )
}

export default RoleSlot
