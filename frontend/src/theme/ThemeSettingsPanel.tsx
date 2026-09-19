import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { setTheme, setUi, useSettings } from '../settings/settingsStore'
import { CURRENT_USER } from '../userSeed'
import { ZONE_ICON } from './ThemeZoneToggles'
import { contrastBand, deriveTokens, effectiveBrightness } from './tokens'
import { disableZone, enableZone, configuredZones, formatMinute, STEP_MINUTES } from './zones'
import { editBrightness, editHue, editSaturation, legalRange } from './paletteRules'
import { setPreviewZone, useThemeState } from './useTheme'
import { ZONE_KEYS, ZONE_LABEL, type PaletteKey, type Role, type ZoneKey, type ZonePalette } from './types'
import './themeSettings.scss'

const START_OPTIONS = Array.from({ length: 1440 / STEP_MINUTES }, (_, i) => i * STEP_MINUTES)

const COLOR_ROWS: Array<{ key: PaletteKey; label: string; hint: string; adminOnly?: boolean }> = [
  { key: 'theme', label: 'Theme', hint: 'Inert, inactive and read-only elements' },
  { key: 'accent', label: 'Accent', hint: 'Interactive, dynamic and active items' },
  { key: 'alert', label: 'Alert', hint: 'Warnings, errors and notifications' },
  { key: 'accent2', label: 'Accent 2', hint: 'Admin features', adminOnly: true },
]

const HUE_TRACK = 'linear-gradient(to right, hsl(0,80%,50%), hsl(60,80%,50%), hsl(120,80%,50%), hsl(180,80%,50%), hsl(240,80%,50%), hsl(300,80%,50%), hsl(360,80%,50%))'

// While a slider is being dragged the preview should track the thumb, so the
// fade between palettes is switched off until the pointer is released.
function liveDragProps() {
  return {
    onPointerDown: (_e: ReactPointerEvent) => {
      document.documentElement.setAttribute('data-theme-live', '')
      const end = () => {
        document.documentElement.removeAttribute('data-theme-live')
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
      }
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
  }
}

function SliderRow({ label, value, min, max, unit, track, onChange }: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  track?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="themeSliderRow">
      <span>{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        style={track ? { background: track } : undefined}
        aria-label={label}
        onChange={e => onChange(Number(e.target.value))}
        {...liveDragProps()}
      />
      <output>{value}{unit}</output>
    </label>
  )
}

function swatchColor(vars: Record<string, string>, key: PaletteKey): string {
  return `hsl(${vars[`--color-${key}-h`]} ${vars[`--color-${key}-s`]} ${vars[`--color-${key}-l`]})`
}

// 24h strip showing which zone is in effect when, colored with each zone's
// theme color.
function Timeline() {
  const { theme } = useSettings()
  const order = configuredZones(theme.zones)
  const segments: Array<{ key: ZoneKey; from: number; to: number }> = []
  order.forEach((key, i) => {
    const from = theme.zones[key].startMinute
    let to = theme.zones[order[(i + 1) % order.length]].startMinute
    if (order.length === 1) to = from + 1440
    else if (to <= from) to += 1440
    if (to > 1440) {
      segments.push({ key, from, to: 1440 })
      segments.push({ key, from: 0, to: to - 1440 })
    } else {
      segments.push({ key, from, to })
    }
  })
  return (
    <div className="themeTimeline" role="img" aria-label="Time zones across the day">
      <div className="themeTimelineBar">
        {segments.map((seg, i) => {
          const vars = deriveTokens(theme.zones[seg.key].palette, 'user')
          const Icon = ZONE_ICON[seg.key]
          return (
            <span
              key={`${seg.key}-${i}`} className="themeTimelineSeg"
              style={{ left: `${(seg.from / 1440) * 100}%`, width: `${((seg.to - seg.from) / 1440) * 100}%`, backgroundColor: swatchColor(vars, 'theme') }}
              title={`${ZONE_LABEL[seg.key]}: ${formatMinute(seg.from % 1440)} - ${formatMinute(seg.to % 1440)}`}
            >
              <Icon size={14} />
            </span>
          )
        })}
      </div>
      <div className="themeTimelineTicks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
    </div>
  )
}

function ZoneEditor({ zoneKey, role }: { zoneKey: ZoneKey; role: Role }) {
  const { theme } = useSettings()
  const zone = theme.zones[zoneKey]
  const pal = zone.palette
  const vars = useMemo(() => deriveTokens(pal, role), [pal, role])
  const band = useMemo(() => contrastBand(pal), [pal])
  const effective = effectiveBrightness(pal).brightness

  function updatePalette(fn: (p: ZonePalette) => ZonePalette) {
    setTheme(prev => ({
      ...prev,
      zones: { ...prev.zones, [zoneKey]: { ...prev.zones[zoneKey], palette: fn(prev.zones[zoneKey].palette) } },
    }))
  }

  return (
    <div className="themeZoneEditor">
      <label className="themeStartRow">
        <span>Starts at</span>
        <select
          value={zone.startMinute}
          onChange={e => setTheme(prev => ({
            ...prev,
            zones: { ...prev.zones, [zoneKey]: { ...prev.zones[zoneKey], startMinute: Number(e.target.value) } },
          }))}
        >
          {START_OPTIONS.map(m => <option key={m} value={m}>{formatMinute(m)}</option>)}
        </select>
        <small>until the next zone starts</small>
      </label>

      {COLOR_ROWS.filter(row => !row.adminOnly || role === 'admin').map(row => {
        const range = legalRange(pal, row.key)
        return (
          <fieldset key={row.key} className="themeColorGroup">
            <legend>
              <span className="themeSwatch" style={{ backgroundColor: swatchColor(vars, row.key) }} />
              {row.label} <small>{row.hint}</small>
            </legend>
            <SliderRow
              label="Hue" value={pal[row.key].h} min={0} max={360} unit="°" track={HUE_TRACK}
              onChange={h => updatePalette(p => editHue(p, row.key, h))}
            />
            <SliderRow
              label="Saturation" value={pal[row.key].s} min={range.min} max={range.max} unit="%"
              onChange={s => updatePalette(p => editSaturation(p, row.key, s))}
            />
          </fieldset>
        )
      })}

      <fieldset className="themeColorGroup">
        <legend>Brightness <small>text switches between light and dark automatically</small></legend>
        <SliderRow
          label="Brightness" value={pal.brightness} min={0} max={100} unit="%"
          onChange={b => updatePalette(p => editBrightness(p, b))}
        />
        <div className="themeBand" aria-hidden="true" title="Between the two limits the theme cannot show readable text, so it snaps to the nearer side">
          <span style={{ left: `${band.maxLight}%`, width: `${Math.max(0, band.minDark - band.maxLight)}%` }} />
        </div>
        {effective !== pal.brightness && <p className="themeNote">Shown as {effective}% so text stays readable.</p>}
      </fieldset>

      {zoneKey !== 'day' && (
        <div className="themeZoneActions">
          <button
            type="button" className="themeBtn"
            onClick={() => setTheme(prev => ({
              ...prev,
              zones: { ...prev.zones, [zoneKey]: { ...prev.zones[zoneKey], palette: JSON.parse(JSON.stringify(prev.zones.day.palette)) } },
            }))}
          >
            Reset from Day
          </button>
          <button type="button" className="themeBtn" onClick={() => setTheme(prev => disableZone(prev, zoneKey))}>
            Stop using this zone
          </button>
        </div>
      )}
    </div>
  )
}

// The full theme customization tool (UUI Dashboard > Settings).
function ThemeSettingsPanel() {
  const { theme, ui } = useSettings()
  const { effectiveRole } = useThemeState()
  const [selected, setSelected] = useState<ZoneKey>('day')

  const configured = theme.zones[selected].configured

  // Show the zone being edited while its editor is open (not saved).
  useEffect(() => {
    setPreviewZone(configured ? selected : null)
    return () => setPreviewZone(null)
  }, [selected, configured])

  const canViewAs = CURRENT_USER.role === 'admin'

  return (
    <div className="themeSettings">
      <h2>Theme</h2>

      <div className="themeRow">
        <label className="themeSwitch">
          <input
            type="checkbox" role="switch" checked={theme.timeBasedEnabled}
            onChange={e => setTheme(prev => ({ ...prev, timeBasedEnabled: e.target.checked }))}
          />
          <span>Change theme by time of day</span>
        </label>
        <small>{theme.timeBasedEnabled ? 'Following the schedule below.' : 'Off - the Day palette is used.'}</small>
      </div>

      {canViewAs && (
        <div className="themeRow">
          <span className="themeRowLabel">View as</span>
          <div className="themeSegmented" role="group" aria-label="View as">
            {(['user', 'admin'] as const).map(role => (
              <button
                key={role} type="button"
                className={effectiveRole === role ? 'themeSegBtn themeSegBtn--active' : 'themeSegBtn'}
                aria-pressed={effectiveRole === role}
                onClick={() => setUi(prev => ({ ...prev, viewAs: role === CURRENT_USER.role ? null : role }))}
              >
                {role === 'user' ? 'User' : 'Admin'}
              </button>
            ))}
          </div>
          <small>{ui.viewAs ? 'Previewing the other role.' : 'Your own role.'}</small>
        </div>
      )}

      <Timeline />

      <div className="themeZoneTabs" role="tablist" aria-label="Time zones">
        {ZONE_KEYS.map(key => {
          const Icon = ZONE_ICON[key]
          const on = theme.zones[key].configured
          return (
            <button
              key={key} type="button" role="tab" aria-selected={selected === key}
              className={`themeZoneTab${selected === key ? ' themeZoneTab--active' : ''}${on ? '' : ' themeZoneTab--off'}`}
              onClick={() => setSelected(key)}
            >
              <Icon size={16} /> {ZONE_LABEL[key]}
            </button>
          )
        })}
      </div>

      {configured ? (
        <ZoneEditor key={selected} zoneKey={selected} role={effectiveRole} />
      ) : (
        <div className="themeZoneOff">
          <p>{ZONE_LABEL[selected]} is not in use. Turn it on to give it its own colors and start time.</p>
          <button type="button" className="themeBtn themeBtn--primary" onClick={() => setTheme(prev => enableZone(prev, selected))}>
            Use {ZONE_LABEL[selected]}
          </button>
        </div>
      )}
    </div>
  )
}

export default ThemeSettingsPanel
