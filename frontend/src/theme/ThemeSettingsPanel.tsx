import { useCallback, useEffect, useMemo, useState } from 'react'
import { SettingsSaveCluster } from '../components/SettingsSaveCluster'
import HueList from './HueList'
import ThemeTimeline from './ThemeTimeline'
import ZoneCard from './ZoneCard'
import { ThemeDndContext, type DragSource, type ThemeDnd } from './themeDnd'
import { discardThemeDraft, editThemeDraft, getThemeDraft, useThemeDraft } from './themeDraft'
import { addHue, assignHue, copyRole, describeUses, moveHue, nextHueId, removeHue, setHue, swapRoles } from './themeHues'
import { useMinuteClock } from './useMinuteClock'
import { useThemeState } from './useTheme'
import { sliderLight } from './bookColors'
import { resolvePalette } from './zoneLooks'
import { activeZone as zoneInUse, disableZone, enableZone } from './zones'
import { MAX_HUE_SWATCHES, PALETTE_KEYS, ZONE_KEYS, type ZonePalette } from './types'
import './themeSettings.scss'

// The account theme panel (UUI Dashboard > Settings, and embedded in Account > Settings too), one card of three parts:
//
//  1. the list of hues (up to ten), the account's own colours;
//  2. the day bar, with a handle where each time of day begins;
//  3. a card for each time of day (dawn, day, dusk, night): its sky header turns it on or off, and while it is on it has a slot for each
//     colour (theme, accent, alert and, for admins, admin accent) that takes a hue from the list.
//
// Everything here is staged in a draft (themeDraft.ts) and shows only in this panel; the rest of the app keeps the saved look until the
// Save control saves it. Discard drops the draft, and so does leaving the panel without saving. `showHeader` is false where the embedding
// panel already shows its own heading and the shared Save control (Account > Settings).
function ThemeSettingsPanel({ showHeader = true }: { showHeader?: boolean } = {}) {
  const draft = useThemeDraft()
  const theme = draft.theme
  const { effectiveRole } = useThemeState()
  const now = useMinuteClock()
  const [dragging, setDragging] = useState<DragSource | null>(null)
  const [picked, setPicked] = useState<DragSource | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // The time of day in use decides what the swatches are drawn at, and what a time of day that is off is painted with.
  const inUse = zoneInUse(theme, now)
  const inUsePalette = theme.zones[inUse].palette
  const accent = resolvePalette(inUsePalette, inUse).accent
  const basis = useMemo(() => ({ s: accent.s, l: accent.l, track: sliderLight(inUse, accent.l) }), [accent.s, accent.l, inUse])
  const themeHue = inUsePalette.theme.h
  const offPalette = useMemo<ZonePalette>(() => ({ theme: { h: themeHue }, accent: { h: themeHue }, alert: { h: themeHue }, accent2: { h: themeHue } }), [themeHue])
  const roles = PALETTE_KEYS.filter(role => role !== 'accent2' || effectiveRole === 'admin')

  const addSwatch = useCallback((): string | null => {
    const current = getThemeDraft().theme
    if (current.hues.length >= MAX_HUE_SWATCHES) return null
    const id = nextHueId(current.hues)
    editThemeDraft(t => addHue(t, 0))
    setNote(null)
    return id
  }, [])

  const removeSwatch = useCallback((id: string) => {
    const current = getThemeDraft().theme
    const position = current.hues.findIndex(h => h.id === id)
    const next = removeHue(current, id)
    if (!next) {
      if (position < 0) return
      setNote(current.hues.length <= 1
        ? 'At least one hue stays in the list.'
        : `Hue ${position + 1} is ${describeUses(current, id)}, so it was kept. Give those colours another hue first.`)
      return
    }
    editThemeDraft(() => next)
    setNote(null)
    setPicked(prev => (prev?.kind === 'swatch' && prev.id === id ? null : prev))
  }, [])

  const dnd = useMemo<ThemeDnd>(() => ({
    dragging, picked,
    begin: source => { setPicked(null); setNote(null); setDragging(source) },
    end: () => setDragging(null),
    pick: source => { setPicked(source); setNote(null) },
    dropOnRole: (source, zone, role) => {
      editThemeDraft(t => {
        if (source.kind === 'swatch') return assignHue(t, zone, role, source.id)
        if (source.zone === zone) return swapRoles(t, zone, source.role, role)
        return copyRole(t, { zone: source.zone, role: source.role }, { zone, role })
      })
      setPicked(null)
      setDragging(null)
      setNote(null)
    },
  }), [dragging, picked])

  // A swatch let go anywhere that is not the list or a time of day's colours is deleted. The list, the cards and the slots handle (and
  // stop) their own drags, so only what is left reaches the document, which accepts it. Cancelling a drag (Escape) never drops, so nothing
  // is lost that way.
  useEffect(() => {
    if (dragging?.kind !== 'swatch') return
    const id = dragging.id
    // (A target must cancel dragenter as well as dragover, or a drop on it does not count.)
    const over = (e: DragEvent) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move' }
    const drop = (e: DragEvent) => { e.preventDefault(); setDragging(null); removeSwatch(id) }
    document.addEventListener('dragenter', over)
    document.addEventListener('dragover', over)
    document.addEventListener('drop', drop)
    return () => {
      document.removeEventListener('dragenter', over)
      document.removeEventListener('dragover', over)
      document.removeEventListener('drop', drop)
    }
  }, [dragging, removeSwatch])

  const following = theme.timeBasedEnabled

  return (
    <ThemeDndContext.Provider value={dnd}>
      <div
        className="themeSettings themeCard"
        onKeyDown={e => { if (e.key === 'Escape' && picked) setPicked(null) }}
      >
        {showHeader && (
          <div className="themeHeader">
            <h2>Theme</h2>
            <SettingsSaveCluster buttonClassName="themeBtn themeBtn--primary" />
          </div>
        )}

        <p className="themeIntro">
          Drag a hue from the list onto a colour of a time of day, or click a hue and then the colour. Click a sky to turn that time of day on or off.
        </p>

        {draft.dirty && (
          <div className="themeDraftBar" role="status">
            <span>These changes are not saved. The rest of the app keeps its look until you save.</span>
            <button type="button" className="themeBtn" onClick={discardThemeDraft}>Discard</button>
          </div>
        )}

        <div className="themeSection">
          <h3 className="themeSectionTitle">Hues</h3>
          <HueList
            theme={theme} basis={basis} note={note}
            onAdd={addSwatch}
            onSetHue={(id, h) => editThemeDraft(t => setHue(t, id, h))}
            onMove={(id, beforeId) => editThemeDraft(t => moveHue(t, id, beforeId))}
            onRemove={removeSwatch}
          />
        </div>

        <div className="themeSection">
          <h3 className="themeSectionTitle">Day</h3>
          <ThemeTimeline theme={theme} onChange={editThemeDraft} />
          <small className="themeClock">
            {following ? 'The app follows the clock, changing at the times above.' : 'One time of day is on, so the app always uses it.'}
          </small>
        </div>

        <div className="themeSection">
          <h3 className="themeSectionTitle">Times of day</h3>
          <div className="themeZones">
            {ZONE_KEYS.map(zone => (
              <ZoneCard
                key={zone} zone={zone} theme={theme} roles={roles} offPalette={offPalette} now={now}
                onToggle={() => editThemeDraft(t => (t.zones[zone].configured ? disableZone(t, zone) : enableZone(t, zone)))}
              />
            ))}
          </div>
        </div>
      </div>
    </ThemeDndContext.Provider>
  )
}

export default ThemeSettingsPanel
