import { useEffect, useSyncExternalStore } from 'react'
import { UndoStack } from '../lib/useUndoHistory'
import { flushSettings, getSettings, setTheme, subscribeSettings } from '../settings/settingsStore'
import { normalizeTheme } from './zones'
import type { ThemeSettings } from './types'

// The account theme panel's staged edits (hues, the roles they are dropped on, zones turned on and off, the day bar's start times).
// They are held here, not in the settings store, so the rest of the app keeps the saved look until the Save control commits them.
//
//  - One draft is shared by everything that shows it: the Dash tab and the account drawer can both have the panel open, and the Save
//    control (components/SettingsSaveCluster.tsx) reads it from outside the panel.
//  - It begins with the first edit, from the theme as saved, and has its own undo (UndoStack), which Undo in the Save control steps
//    through before it reaches the settings store's own history.
//  - Leaving without saving drops it: when the last panel unmounts the draft is discarded, with no prompt.
//  - Only `zones` and `hues` are staged. The lock on a zone (the header's sky toggle) and the rest of the settings are the store's.

let panels = 0
let staged: ThemeSettings | null = null
const stack = new UndoStack<ThemeSettings>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(fn => fn())

const sameStaged = (a: ThemeSettings, b: ThemeSettings) => a === b || (JSON.stringify(a.zones) === JSON.stringify(b.zones) && JSON.stringify(a.hues) === JSON.stringify(b.hues))

export interface ThemeDraftView {
  // What the panel shows: the saved theme with the staged zones and hues laid over it.
  theme: ThemeSettings
  // Staged edits differ from the saved theme.
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
}

let cached: { saved: ThemeSettings; staged: ThemeSettings | null; undo: boolean; redo: boolean; view: ThemeDraftView } | null = null

export function getThemeDraft(): ThemeDraftView {
  const saved = getSettings().theme
  const undo = stack.canUndo
  const redo = stack.canRedo
  if (cached && cached.saved === saved && cached.staged === staged && cached.undo === undo && cached.redo === redo) return cached.view
  const dirty = staged !== null && !sameStaged(staged, saved)
  const theme = staged !== null && dirty ? normalizeTheme({ ...saved, zones: staged.zones, hues: staged.hues }) : saved
  const view: ThemeDraftView = { theme, dirty, canUndo: undo, canRedo: redo }
  cached = { saved, staged, undo, redo, view }
  return view
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const unsubscribe = subscribeSettings(fn)
  return () => { listeners.delete(fn); unsubscribe() }
}

// The draft, for anything that only needs to know about it (the Save control).
export function useThemeDraftView(): ThemeDraftView {
  return useSyncExternalStore(subscribe, getThemeDraft, getThemeDraft)
}

// The draft, for a panel that edits it: mounting one keeps the draft, and the last one to unmount drops it.
export function useThemeDraft(): ThemeDraftView {
  useEffect(() => {
    panels += 1
    return () => {
      panels -= 1
      if (panels === 0) discardThemeDraft()
    }
  }, [])
  return useThemeDraftView()
}

// An edit of the theme as the panel shows it (normalized, so the same rules hold as for the saved theme). No change is no step.
export function editThemeDraft(change: (theme: ThemeSettings) => ThemeSettings): void {
  const base = getThemeDraft().theme
  const next = normalizeTheme(change(base))
  if (sameStaged(next, base)) return
  if (staged === null) stack.reset(getSettings().theme)
  staged = next
  stack.record(next)
  emit()
}

export function discardThemeDraft(): void {
  if (staged === null && !stack.hasBaseline) return
  staged = null
  stack.clear()
  emit()
}

export function undoThemeDraft(): void {
  const value = stack.undo()
  if (value) { staged = value; emit() }
}

export function redoThemeDraft(): void {
  const value = stack.redo()
  if (value) { staged = value; emit() }
}

// Save: commit what is staged to the settings (the rest of the app takes it on), then send everything that is waiting.
export async function saveThemeDraft(): Promise<void> {
  const draft = getThemeDraft()
  if (draft.dirty && staged) {
    const { zones, hues } = staged
    setTheme(prev => ({ ...prev, zones, hues }))
  }
  staged = null
  stack.clear()
  emit()
  await flushSettings()
}
