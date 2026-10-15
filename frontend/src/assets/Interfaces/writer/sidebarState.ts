import { useEffect, useState, useSyncExternalStore } from 'react'
import { useStoredState } from './storage'

// The Writer's side column (the collapsed levels beside the focused one): its width and whether it is hidden. Both are kept on
// this machine (`scriblr.writer.sidebar`) and shared by the column itself (levels/WriterLevels.tsx) and the toggle in the app's
// header (Header.tsx), which is why they live outside the component.
//
//   width   null = the default, clamp(280px, 32%, 460px); otherwise pixels, held between SIDE_MIN_W and 60% of the Writer's width
//   hidden  null = automatic (hidden while the window is narrower than AUTO_HIDE_BELOW); true / false = what the toggle last set

export const SIDE_MIN_W = 200
export const SIDE_MAX_FRACTION = 0.6
export const AUTO_HIDE_BELOW = 1000
const KEY = 'scriblr.writer.sidebar'

export interface SideSetting { width: number | null; hidden: boolean | null }
const DEFAULT_SETTING: SideSetting = { width: null, hidden: null }

// A dragged width, held between the minimum and 60% of the container (never under the minimum, however narrow the window).
export const clampSideWidth = (width: number, containerWidth: number): number =>
  Math.round(Math.min(Math.max(width, SIDE_MIN_W), Math.max(SIDE_MIN_W, containerWidth * SIDE_MAX_FRACTION)))

// The CSS variables that give the column its width: the same limits again in CSS, so shrinking the window holds a stored width too.
export function sideVars(width: number): Record<string, string> {
  return {
    '--wr-side-w': `min(max(${width}px, ${SIDE_MIN_W}px), ${SIDE_MAX_FRACTION * 100}%)`,
    '--wr-side-px': `clamp(${SIDE_MIN_W}px, ${width}px, ${SIDE_MAX_FRACTION * 100}cqw)`,
  }
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < AUTO_HIDE_BELOW)
  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < AUTO_HIDE_BELOW)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return narrow
}

export function useSidebar() {
  const [setting, setSetting] = useStoredState<SideSetting>(KEY, DEFAULT_SETTING)
  const narrow = useNarrow()
  const hidden = setting.hidden ?? narrow
  return {
    width: setting.width,
    hidden,
    setWidth: (width: number | null) => setSetting(prev => ({ ...prev, width })),
    toggle: () => setSetting(prev => ({ ...prev, hidden: !hidden })),
  }
}

// Whether the Writer is showing a side column at all (not at the Dash), so the header's toggle can say it has nothing to do.
let available = false
const listeners = new Set<() => void>()
export function setSideAvailable(value: boolean) {
  if (available === value) return
  available = value
  listeners.forEach(l => l())
}
export const useSideAvailable = (): boolean =>
  useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l) } }, () => available)
