import { useEffect, useMemo, useState } from 'react'
import { restoreSettings, saveSettingsNow, setTheme, setUi, useSettings, useSettingsSaveStatus } from '../settings/settingsStore'
import { SaveControl } from '../components/SaveControl'
import { ColorRange } from '../components/ColorRange'
import { CURRENT_USER } from '../userSeed'
import { ZONE_ICON } from './zoneIcons'
import SkyZoneTab from './SkyZoneTab'
import { useMinuteClock } from './useMinuteClock'
import { readableInk } from './contrast'
import { deriveTokens } from './tokens'
import { copyPalette, disableZone, enableZone, configuredZones, formatMinute, STEP_MINUTES } from './zones'
import { editHue } from './paletteRules'
import { derivedShades, hslCss, tints, type Swatch } from './palettes'
import { ZONE_LOOKS, resolvePalette } from './zoneLooks'
import { setPreviewZone, useThemeState } from './useTheme'
import { ZONE_KEYS, ZONE_LABEL, type PaletteKey, type Role, type ZoneKey, type ZonePalette } from './types'
import './themeSettings.scss'

const START_OPTIONS = Array.from({ length: 1440 / STEP_MINUTES }, (_, i) => i * STEP_MINUTES)

const COLOR_ROWS: Array<{ key: PaletteKey; label: string; hint: string; adminOnly?: boolean }> = [
  { key: 'theme', label: 'Theme', hint: 'Inert, inactive and read-only elements' },
  { key: 'accent', label: 'Accent', hint: 'Interactive, dynamic and active items' },
  { key: 'alert', label: 'Alert', hint: 'Warnings, errors and notifications' },
  { key: 'accent2', label: 'Admin accent', hint: 'Admin panel and admin-only items', adminOnly: true },
]

// One slider: its name, the colour selector, and the value.
function SliderRow({ label, unit, value, children }: { label: string; unit: string; value: number; children: React.ReactNode }) {
  return (
    <div className="themeSliderRow">
      <span>{label}</span>
      {children}
      <output>{value}{unit}</output>
    </div>
  )
}

// The palette generated for a colour: the shades the app really derives from
// it (named), and an even ladder of tints.
function Palette({ pal, zone, colorKey }: { pal: ZonePalette; zone: ZoneKey; colorKey: PaletteKey }) {
  const derived = useMemo(() => derivedShades(pal, colorKey, zone), [pal, zone, colorKey])
  const ladder = useMemo(() => tints(pal, colorKey, zone), [pal, zone, colorKey])
  const chip = (s: Swatch, named: boolean) => (
    <span key={s.key} className={named ? 'themeChip themeChip--named' : 'themeChip'} title={`${s.label}: ${hslCss(s.color)}`}>
      <span className="themeChipColor" style={{ backgroundColor: hslCss(s.color) }} />
      {named && <span className="themeChipLabel">{s.label}</span>}
    </span>
  )
  return (
    <div className="themePalette" aria-label={`${colorKey} palette`}>
      <div className="themePaletteRow" aria-label="Shades in use">{derived.map(s => chip(s, true))}</div>
      <div className="themePaletteRow themePaletteRow--tints" aria-label="Tints and shades">{ladder.map(s => chip(s, false))}</div>
    </div>
  )
}

function swatchColor(vars: Record<string, string>, key: PaletteKey): string {
  return `hsl(${vars[`--color-${key}-h`]} ${vars[`--color-${key}-s`]} ${vars[`--color-${key}-l`]})`
}

// 24h strip showing which zone is in effect when. Each segment is a midtone of
// its zone's accent (its accent hue and saturation at 50% lightness); every
// zone except the one being edited is a little dimmer.
function Timeline({ selected }: { selected: ZoneKey }) {
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
          const accent = resolvePalette(theme.zones[seg.key].palette, seg.key).accent
          const fill = { h: accent.h, s: accent.s, l: 50 }
          const Icon = ZONE_ICON[seg.key]
          return (
            <span
              key={`${seg.key}-${i}`}
              className={seg.key === selected ? 'themeTimelineSeg' : 'themeTimelineSeg themeTimelineSeg--dim'}
              style={{ left: `${(seg.from / 1440) * 100}%`, width: `${((seg.to - seg.from) / 1440) * 100}%`, backgroundColor: hslCss(fill), color: hslCss(readableInk(fill)) }}
              title={`${ZONE_LABEL[seg.key]}: ${formatMinute(seg.from % 1440)} - ${formatMinute(seg.to % 1440)}`}
            >
              <Icon size={14} />
            </span>
          )
        })}
      </div>
      <div className="themeTimelineTicks"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
    </div>
  )
}

function ZoneEditor({ zoneKey, role }: { zoneKey: ZoneKey; role: Role }) {
  const { theme } = useSettings()
  const zone = theme.zones[zoneKey]
  const pal = zone.palette
  const vars = useMemo(() => deriveTokens(pal, role, zoneKey), [pal, role, zoneKey])
  const copySources = configuredZones(theme.zones).filter(k => k !== zoneKey)

  function updatePalette(fn: (p: ZonePalette) => ZonePalette) {
    setTheme(prev => ({
      ...prev,
      zones: { ...prev.zones, [zoneKey]: { ...prev.zones[zoneKey], palette: fn(prev.zones[zoneKey].palette) } },
    }))
  }

  return (
    <div className="themeZoneEditor">
      <div className="themeStartRow">
        <label>
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
        </label>
        <small>until the next zone starts</small>
        {copySources.length > 0 && (
          <label className="themeCopy">
            <span>Copy colors from</span>
            <select
              value="" aria-label="Copy colors from another zone"
              onChange={e => { if (e.target.value) setTheme(prev => copyPalette(prev, e.target.value as ZoneKey, zoneKey)) }}
            >
              <option value="">Choose a zone…</option>
              {copySources.map(k => <option key={k} value={k}>{ZONE_LABEL[k]}</option>)}
            </select>
          </label>
        )}
      </div>

      <p className="themeLook">{ZONE_LOOKS[zoneKey].summary}</p>

      {COLOR_ROWS.filter(row => !row.adminOnly || role === 'admin').map(row => {
        const { s, l: light } = derivedShades(pal, row.key, zoneKey)[0].color
        const { h } = pal[row.key]
        return (
          <section key={row.key} className="themeColor">
            <div className="themeColorHead">
              <span className="themeSwatch" style={{ backgroundColor: swatchColor(vars, row.key) }} />
              <strong>{row.label}</strong> <small>{row.hint}</small>
            </div>
            <Palette pal={pal} zone={zoneKey} colorKey={row.key} />
            <SliderRow label="Hue" unit="°" value={h}>
              <ColorRange
                label={`${row.label} hue`} value={h} sat={s} light={light} live
                onChange={v => updatePalette(p => editHue(p, row.key, v))}
              />
            </SliderRow>
          </section>
        )
      })}

      {zoneKey !== 'day' && (
        <div className="themeZoneActions">
          <button type="button" className="themeBtn" onClick={() => setTheme(prev => disableZone(prev, zoneKey))}>
            Stop using this zone
          </button>
        </div>
      )}
    </div>
  )
}

// The full theme customization tool (UUI Dashboard > Settings), all in one
// card with its sections divided by thin rules.
function ThemeSettingsPanel() {
  const { theme, ui } = useSettings()
  const { effectiveRole } = useThemeState()
  const saveStatus = useSettingsSaveStatus()
  const now = useMinuteClock()
  const [selected, setSelected] = useState<ZoneKey>('day')

  const configured = theme.zones[selected].configured

  // Show the zone being edited while its editor is open (not saved).
  useEffect(() => {
    setPreviewZone(configured ? selected : null)
    return () => setPreviewZone(null)
  }, [selected, configured])

  const canViewAs = CURRENT_USER.role === 'admin'

  return (
    <div className="themeSettings themeCard">
      <div className="themeHeader">
        <h2>Theme</h2>
        <SaveControl status={saveStatus} onSave={() => { void saveSettingsNow() }} onRestore={restoreSettings} buttonClassName="themeBtn themeBtn--primary" />
      </div>

      <div className="themeSection">
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
      </div>

      <div className="themeSection">
        <Timeline selected={selected} />
      </div>

      <div className="themeSection">
        <div className="themeZoneTabs" role="tablist" aria-label="Time zones">
          {ZONE_KEYS.map(key => (
            <SkyZoneTab
              key={key} zone={key} palette={theme.zones[key].palette} configured={theme.zones[key].configured}
              startMinute={theme.zones[key].startMinute} selected={selected === key} now={now} onSelect={() => setSelected(key)}
            />
          ))}
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
    </div>
  )
}

export default ThemeSettingsPanel
