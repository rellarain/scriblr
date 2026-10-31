import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import { emptyPlanner, type Planner, type RibbonData } from './lib/facets'
import { shiftOccurrences, type ShiftOccurrence } from './lib/recurrence'
import { ribbonSlots, slotOfDate } from './lib/ribbon'
import { getKv, subscribeKv } from './settings/settingsStore'
import { useThemeState } from './theme/useTheme'

// Row 2 of the header: today in 144 ten-minute slots, drawn from the account's real activity (every project added together) and its scheduled
// shifts. A slot with activity is the accent hue, shaded by how today compares with the usual in that slot (the last 28 days' average): in the
// light zones (dawn, day) more activity is darker, in the dark ones (dusk, night) lighter. A slot a shift still has to fill is a little brighter
// than the ground, one it did not fill (nothing logged in it) a little darker. The slot the clock is in is the ink colour. A slot with nothing
// collapses to no height, so it never covers the user card beneath. Root element IS the row's own flex container.

const ACCOUNT_PLANNER = 'scriblr.writer.planner.account'
const REFRESH_MS = 60_000
const AFTER_SAVE_MS = 1500

interface ProjectRef { projectId: string }

async function loadShifts(today: string): Promise<ShiftOccurrence[]> {
  const projects = await api.get<ProjectRef[]>('/projects')
  const planners = await Promise.all(projects.map(p => api.get<Planner>(`/projects/${encodeURIComponent(p.projectId)}/planner`).catch(() => emptyPlanner())))
  const account = { ...emptyPlanner(), ...(getKv<Planner>(ACCOUNT_PLANNER) ?? {}) }
  const all = [...planners, account]
  return shiftOccurrences(all.flatMap(p => p.shifts ?? []), all.flatMap(p => p.restDays ?? []), today, today)
}

export function useRibbon(): { data: RibbonData | null; shifts: ShiftOccurrence[]; nowSlot: number } {
  const [data, setData] = useState<RibbonData | null>(null)
  const [shifts, setShifts] = useState<ShiftOccurrence[]>([])
  const [nowSlot, setNowSlot] = useState(() => slotOfDate(new Date()))
  const refresh = useCallback(() => {
    api.get<RibbonData>('/activity/ribbon').then(d => {
      setData(d)
      return loadShifts(d.date).then(setShifts)
    }).catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    let later: ReturnType<typeof setTimeout> | null = null
    // Saves anywhere in the app (see api/client.ts) refresh it a moment after the last one.
    const onChanged = () => { if (later) clearTimeout(later); later = setTimeout(refresh, AFTER_SAVE_MS) }
    window.addEventListener('scriblr:changed', onChanged)
    const unsubscribe = subscribeKv(ACCOUNT_PLANNER, refresh)
    const tick = setInterval(() => {
      const slot = slotOfDate(new Date())
      setNowSlot(prev => {
        if (slot < prev) refresh() // the day rolled over at local midnight
        return slot
      })
    }, 30_000)
    const poll = setInterval(refresh, REFRESH_MS)
    return () => { window.removeEventListener('scriblr:changed', onChanged); unsubscribe(); clearInterval(tick); clearInterval(poll); if (later) clearTimeout(later) }
  }, [refresh])
  return { data, shifts, nowSlot }
}

function HeaderActivityRibbon() {
  const { data, shifts, nowSlot } = useRibbon()
  const { activeZone } = useThemeState()
  const ground = activeZone === 'dawn' || activeZone === 'day' ? 'light' : 'dark'
  const slots = ribbonSlots(data, shifts, nowSlot)
  return (
    <div className="headerRibbonRow" data-ground={ground} role="img" aria-label="Today's activity and scheduled shifts, in 10-minute intervals">
      {slots.map((kind, i) => <span key={i} className={`headerRibbonSegment headerRibbonSegment--${kind}`} />)}
    </div>
  )
}

export default HeaderActivityRibbon
