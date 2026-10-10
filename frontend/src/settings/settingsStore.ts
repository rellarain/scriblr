import { useMemo, useSyncExternalStore } from 'react'
import type { SaveStatus } from '../lib/useAutosave'
import { defaultThemeSettings, DEFAULT_UI_SETTINGS } from '../theme/defaults'
import { normalizeTheme } from '../theme/zones'
import { newestFirst, nextSetting, sameValue } from '../lib/logUndo'
import { UndoStack } from '../lib/useUndoHistory'
import type { SettingsLogEntry } from '../types'
import { AUTOSAVE_SECONDS, type AutosaveMode, type ThemeSettings, type UiSettings } from '../theme/types'

// User settings that must survive relaunches: the time-of-day theme, UI
// preferences, and the Writer's saved UI state (key/value). The backend
// (user-settings.json) is the source of truth; localStorage is a synchronous
// cache so the first paint already has the right theme and the Writer's
// stored state, with no flash. (The packaged app's backend port -- and so the
// browser origin, and its localStorage -- changes every launch, which is why
// localStorage alone is not enough.)
//
//  - Reads are synchronous (memory, then the localStorage cache).
//  - Writes update memory + cache immediately and are sent to the backend
//    debounced (~400ms); a failed send is retried every 15s, and everything
//    pending is flushed with keepalive when the page is hidden.
//  - initSettings() (called once at startup) loads the backend copy; the
//    backend wins, except for anything with a write still pending here.
//  - One-time migration: the first load with migratedFromLocal false imports
//    the `scriblr.writer.*` localStorage keys the backend does not have yet.

const API = '/api/user-settings'
const THEME_CACHE_KEY = 'scriblr.settings.cache'
const MIGRATE_PREFIX = 'scriblr.writer.'
const DEBOUNCE_MS = 400
const RETRY_MS = 15_000

interface RemoteSettings {
  theme: ThemeSettings
  ui: UiSettings
  kv: Record<string, unknown>
  migratedFromLocal: boolean
}

export interface SettingsSnapshot {
  theme: ThemeSettings
  ui: UiSettings
  loaded: boolean
}

// --- localStorage helpers (it can be unavailable, full, or blocked) ---

function lsGet(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string): void {
  try { window.localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

// --- state ---

// Autosave seconds: the nearest of 1, 5 or 10 minutes (an older 30-second setting becomes 1 minute).
export function normalizeAutosaveSeconds(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_UI_SETTINGS.autosaveSeconds
  return AUTOSAVE_SECONDS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), AUTOSAVE_SECONDS[0]) as number
}

function normalizeUi(ui: Partial<UiSettings> | undefined): UiSettings {
  const merged = { ...DEFAULT_UI_SETTINGS, ...(ui ?? {}) }
  return { ...merged, autosaveEnabled: merged.autosaveEnabled === true, autosaveSeconds: normalizeAutosaveSeconds(merged.autosaveSeconds) }
}

function readCache(): { theme: ThemeSettings; ui: UiSettings } {
  try {
    const raw = lsGet(THEME_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return {
      theme: normalizeTheme(parsed?.theme),
      ui: normalizeUi(parsed?.ui),
    }
  } catch {
    return { theme: defaultThemeSettings(), ui: normalizeUi(undefined) }
  }
}

let snapshot: SettingsSnapshot = { ...readCache(), loaded: false }
const listeners = new Set<() => void>()
const kvMemory = new Map<string, unknown>()
const kvListeners = new Map<string, Set<() => void>>()

// key -> the timer that will send it ('theme', 'ui' and 'kv:<key>'); null when
// autosave is off and only a Save (or leaving the page) will send it.
const pending = new Map<string, ReturnType<typeof setTimeout> | null>()
const senders = new Map<string, (keepalive: boolean) => Promise<void>>()

function emit() { listeners.forEach(fn => fn()) }

function writeCache() {
  lsSet(THEME_CACHE_KEY, JSON.stringify({ theme: snapshot.theme, ui: snapshot.ui }))
}

// --- sending ---

async function send(method: string, path: string, body: unknown, keepalive: boolean): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive,
  })
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status})`)
}

// --- save state (what a Save button shows) ---

let inFlight = 0
const sending = new Set<Promise<void>>() // sends under way (restore waits for them)
const failed = new Map<string, string>() // id -> the last error for a send that failed
let lastSavedAt: number | null = null
let saveStatus: SaveStatus = { state: 'saved', dirty: false, saving: false, error: undefined, lastSavedAt: null }
const saveListeners = new Set<() => void>()

// When the theme and UI changes will be sent on their own (the countdown pill), and the wait; null when nothing waits or autosave is off.
const deadlines = new Map<string, number>()
let countdown: { nextSaveAt: number | null; wait: number | null } = { nextSaveAt: null, wait: null }

function refreshSaveStatus() {
  const saving = inFlight > 0
  const dirty = pending.size > 0 || saving || failed.size > 0
  const error = failed.size > 0 ? [...failed.values()][0] : undefined
  const state = error ? 'error' : saving ? 'saving' : dirty ? 'unsaved' : 'saved'
  const times = ['theme', 'ui'].map(id => deadlines.get(id)).filter((t): t is number => t !== undefined)
  const nextSaveAt = times.length > 0 ? Math.min(...times) : null
  const wait = snapshot.ui.autosaveEnabled ? snapshot.ui.autosaveSeconds * 1000 : null
  const countdownChanged = nextSaveAt !== countdown.nextSaveAt || wait !== countdown.wait
  if (countdownChanged) countdown = { nextSaveAt, wait }
  if (!countdownChanged && state === saveStatus.state && dirty === saveStatus.dirty && saving === saveStatus.saving && error === saveStatus.error && lastSavedAt === saveStatus.lastSavedAt) return
  saveStatus = { state, dirty, saving, error, lastSavedAt }
  saveListeners.forEach(fn => fn())
}

export function useSettingsCountdown(): { nextSaveAt: number | null; wait: number | null } {
  return useSyncExternalStore(
    fn => { saveListeners.add(fn); return () => { saveListeners.delete(fn) } },
    () => countdown,
    () => countdown,
  )
}

export function useSettingsSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    fn => { saveListeners.add(fn); return () => { saveListeners.delete(fn) } },
    () => saveStatus,
    () => saveStatus,
  )
}

// `delay` null = autosave is off: the write waits for a Save, or for the page to
// be hidden (flushSettings), so nothing is lost.
function schedule(id: string, sender: (keepalive: boolean) => Promise<void>, delay: number | null = DEBOUNCE_MS) {
  const existing = pending.get(id)
  if (existing) clearTimeout(existing)
  senders.set(id, sender)
  pending.set(id, delay === null ? null : setTimeout(() => { void run(id, false) }, delay))
  if (delay === null || delay <= DEBOUNCE_MS) deadlines.delete(id)
  else deadlines.set(id, Date.now() + delay)
  refreshSaveStatus()
}

function run(id: string, keepalive: boolean): Promise<void> {
  const sender = senders.get(id)
  const timer = pending.get(id)
  if (timer) clearTimeout(timer)
  pending.delete(id)
  deadlines.delete(id)
  if (!sender) { refreshSaveStatus(); return Promise.resolve() }
  senders.delete(id)
  inFlight += 1
  refreshSaveStatus()
  const attempt: Promise<void> = sender(keepalive).then(
    () => { failed.delete(id); lastSavedAt = Date.now(); if (id === 'theme' || id === 'ui') { history.markSaved(); void refreshUserLog() } },
    err => {
      failed.set(id, err instanceof Error ? err.message : 'Failed to save')
      // Keep it dirty and try again later (when autosave is on), unless a newer write already replaced it.
      if (!senders.has(id) && !restoring) schedule(id, sender, autosaveEnabledNow() ? RETRY_MS : null)
    },
  ).finally(() => {
    inFlight -= 1
    sending.delete(attempt)
    refreshSaveStatus()
  })
  sending.add(attempt)
  return attempt
}

// Send everything pending now: the Save button, and when the page is hidden.
export function flushSettings(): Promise<void> {
  return Promise.all([...senders.keys()].map(id => run(id, true))).then(() => undefined)
}

export const saveSettingsNow = flushSettings

// --- theme + ui ---

export function getSettings(): SettingsSnapshot { return snapshot }

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// --- autosave policy ---

const autosaveEnabledNow = () => snapshot.ui.autosaveEnabled
// The wait before an edit is sent on its own; null when autosave is off.
const autosaveDelayNow = (): number | null => (snapshot.ui.autosaveEnabled ? snapshot.ui.autosaveSeconds * 1000 : null)

export interface AutosavePolicy { enabled: boolean; delay: number }

export function getAutosavePolicy(): AutosavePolicy {
  return { enabled: snapshot.ui.autosaveEnabled, delay: snapshot.ui.autosaveSeconds * 1000 }
}

// What the editors read: whether they autosave, and how long they wait.
export function useAutosavePolicy(): AutosavePolicy {
  const { ui } = useSettings()
  return useMemo(() => ({ enabled: ui.autosaveEnabled, delay: ui.autosaveSeconds * 1000 }), [ui.autosaveEnabled, ui.autosaveSeconds])
}

// --- undo and redo of the theme and UI settings ---
// The history holds the theme and the UI settings together. Autosave itself is not part of it: choosing an autosave wait must not be undone
// by an Undo, so an Undo keeps the current autosave setting.
interface SettingsValue { theme: ThemeSettings; ui: UiSettings }
const history = new UndoStack<SettingsValue>()
// Today's log of settings changes (newest first), how far Undo has gone into it, and what the Undo button may do: step back in memory, or
// on into the log (lib/logUndo.ts).
let userLog: SettingsLogEntry[] = []
let userCursor: string | null = null
let historyFlags = { canUndo: false, canRedo: false }
const historyListeners = new Set<() => void>()
function syncHistory() {
  const canUndo = history.canUndo || nextSetting(userLog, userCursor) !== null
  if (historyFlags.canUndo === canUndo && historyFlags.canRedo === history.canRedo) return
  historyFlags = { canUndo, canRedo: history.canRedo }
  historyListeners.forEach(fn => fn())
}
async function refreshUserLog(): Promise<void> {
  try {
    const response = await fetch(`${API}/activity`)
    if (!response.ok) return
    userLog = newestFirst((await response.json()) as SettingsLogEntry[])
    syncHistory()
  } catch { /* the log is a convenience: Undo then has only the history in memory */ }
}
// The first edit before any load (the backend may be offline) starts the history from the settings as they were.
function ensureBaseline(before: SettingsValue) {
  if (history.current === undefined) history.reset(before)
}
function recordHistory(text: boolean) {
  history.record({ theme: snapshot.theme, ui: snapshot.ui }, { text })
  syncHistory()
}
export function useSettingsHistory(): { canUndo: boolean; canRedo: boolean } {
  return useSyncExternalStore(
    fn => { historyListeners.add(fn); return () => { historyListeners.delete(fn) } },
    () => historyFlags,
    () => historyFlags,
  )
}

// Show an earlier or later settings value as an unsaved change (the autosave setting stays as it is).
function applySettingsValue(value: SettingsValue) {
  const ui = { ...value.ui, autosaveEnabled: snapshot.ui.autosaveEnabled, autosaveSeconds: snapshot.ui.autosaveSeconds }
  snapshot = { ...snapshot, theme: value.theme, ui }
  writeCache()
  emit()
  schedule('theme', keepalive => send('PUT', '/user-settings/theme', value.theme, keepalive), autosaveDelayNow())
  schedule('ui', keepalive => send('PUT', '/user-settings/ui', ui, keepalive), autosaveDelayNow())
}
// Go back into today's log: the next change that is not already the value shown, as an unsaved change (and redoable).
function logUndoSettings(): void {
  let at = userCursor
  for (let guard = 0; guard < 25; guard += 1) {
    const entry = nextSetting(userLog, at)
    if (!entry) break
    at = entry.id
    const before = entry.before as { theme?: ThemeSettings; ui?: UiSettings }
    const value: SettingsValue = {
      theme: entry.kind === 'theme' && before.theme ? normalizeTheme(before.theme) : snapshot.theme,
      ui: entry.kind === 'ui' && before.ui ? normalizeUi(before.ui) : snapshot.ui,
    }
    if (sameValue({ theme: value.theme, ui: { ...value.ui, autosaveEnabled: 0, autosaveSeconds: 0 } }, { theme: snapshot.theme, ui: { ...snapshot.ui, autosaveEnabled: 0, autosaveSeconds: 0 } })) continue
    userCursor = at
    history.stepBack(value)
    syncHistory()
    applySettingsValue(value)
    return
  }
  userCursor = at
  syncHistory()
}

export function undoSettings(): void {
  if (history.canUndo) {
    const value = history.undo()
    syncHistory()
    if (value) applySettingsValue(value)
  } else {
    logUndoSettings()
  }
}
export function redoSettings(): void {
  const value = history.redo()
  syncHistory()
  if (value) applySettingsValue(value)
}

export function setTheme(next: ThemeSettings | ((prev: ThemeSettings) => ThemeSettings)): void {
  ensureBaseline({ theme: snapshot.theme, ui: snapshot.ui })
  const resolved = normalizeTheme(typeof next === 'function' ? next(snapshot.theme) : next)
  snapshot = { ...snapshot, theme: resolved }
  writeCache()
  emit()
  recordHistory(true)
  schedule('theme', keepalive => send('PUT', '/user-settings/theme', resolved, keepalive), autosaveDelayNow())
}

// The Save component's autosave toggle: Off, or save after 1, 5 or 10 minutes.
export function setAutosaveMode(mode: AutosaveMode): void {
  setUi(prev => ({ ...prev, autosaveEnabled: mode !== 0, ...(mode !== 0 ? { autosaveSeconds: mode } : {}) }))
}

export function setUi(next: UiSettings | ((prev: UiSettings) => UiSettings)): void {
  const previous = snapshot.ui
  ensureBaseline({ theme: snapshot.theme, ui: previous })
  const resolved = normalizeUi(typeof next === 'function' ? next(previous) : next)
  snapshot = { ...snapshot, ui: resolved }
  writeCache()
  emit()
  const policyChanged = resolved.autosaveEnabled !== previous.autosaveEnabled || resolved.autosaveSeconds !== previous.autosaveSeconds
  // The autosave choice is not an undoable step; any other UI setting is.
  if (policyChanged && resolved.viewAs === previous.viewAs && resolved.handedness === previous.handedness) {
    history.replace({ theme: snapshot.theme, ui: resolved })
  } else {
    recordHistory(false)
  }
  // Changing the autosave setting itself is saved promptly, whatever it was set to.
  schedule('ui', keepalive => send('PUT', '/user-settings/ui', resolved, keepalive), policyChanged ? DEBOUNCE_MS : autosaveDelayNow())
  // Anything already waiting follows the new setting: sent now when autosave is on
  // (a changed interval never leaves it waiting under the old one), held when it is off.
  if (policyChanged && senders.has('theme')) {
    if (resolved.autosaveEnabled) void run('theme', false)
    else schedule('theme', senders.get('theme')!, null)
  }
}

// Throw away the theme and UI changes that have not been saved and go back to
// what the backend has (the "restore last saved version" button).
let restoring = false
export async function restoreSettings(): Promise<void> {
  restoring = true
  try {
    for (const id of ['theme', 'ui']) {
      const timer = pending.get(id)
      if (timer) clearTimeout(timer)
      pending.delete(id)
      senders.delete(id)
      failed.delete(id)
    }
    refreshSaveStatus()
    await Promise.allSettled([...sending])
    const response = await fetch(API)
    if (!response.ok) throw new Error(`GET ${API} failed (${response.status})`)
    applyRemote((await response.json()) as RemoteSettings)
  } finally {
    restoring = false
    refreshSaveStatus()
  }
}

export function useSettings(): SettingsSnapshot {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings)
}

// --- key/value (the Writer's saved UI state) ---

export function getKv<T>(key: string): T | undefined {
  if (kvMemory.has(key)) return kvMemory.get(key) as T
  const raw = lsGet(key)
  if (raw === null) return undefined
  try {
    const value = JSON.parse(raw) as T
    kvMemory.set(key, value)
    return value
  } catch {
    return undefined
  }
}

export function subscribeKv(key: string, fn: () => void): () => void {
  let set = kvListeners.get(key)
  if (!set) { set = new Set(); kvListeners.set(key, set) }
  set.add(fn)
  return () => { set!.delete(fn) }
}

function notifyKv(key: string) { kvListeners.get(key)?.forEach(fn => fn()) }

export function setKv(key: string, value: unknown): void {
  kvMemory.set(key, value)
  lsSet(key, JSON.stringify(value))
  notifyKv(key)
  schedule(`kv:${key}`, keepalive => send('PUT', `/user-settings/kv/${key}`, { value }, keepalive))
}

// --- loading from the backend ---

let started = false

function applyRemote(remote: RemoteSettings) {
  if (!pending.has('theme')) snapshot = { ...snapshot, theme: normalizeTheme(remote.theme) }
  if (!pending.has('ui')) snapshot = { ...snapshot, ui: normalizeUi(remote.ui) }
  snapshot = { ...snapshot, loaded: true }
  if (!pending.has('theme') && !pending.has('ui')) { history.reset({ theme: snapshot.theme, ui: snapshot.ui }); userCursor = null; syncHistory(); void refreshUserLog() }
  writeCache()
  for (const [key, value] of Object.entries(remote.kv)) {
    if (pending.has(`kv:${key}`)) continue
    if (JSON.stringify(kvMemory.get(key) ?? getKv(key)) === JSON.stringify(value)) continue
    kvMemory.set(key, value)
    lsSet(key, JSON.stringify(value))
    notifyKv(key)
  }
  emit()
}

function localMigrationValues(): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(MIGRATE_PREFIX)) continue
      const raw = window.localStorage.getItem(key)
      if (raw !== null) values[key] = JSON.parse(raw)
    }
  } catch { /* unreadable storage or a value that isn't JSON: skip */ }
  return values
}

// Start the backend load (once). Resolves when the first response has been
// applied, or when it failed -- the app is usable either way, from the cache.
export async function initSettings(): Promise<void> {
  if (started) return
  started = true
  try {
    const response = await fetch(API)
    if (!response.ok) throw new Error(`GET ${API} failed (${response.status})`)
    let remote = (await response.json()) as RemoteSettings
    if (!remote.migratedFromLocal) {
      const values = localMigrationValues()
      const imported = await fetch(`${API}/kv-import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }),
      })
      if (imported.ok) remote = (await imported.json()) as RemoteSettings
    }
    applyRemote(remote)
  } catch {
    snapshot = { ...snapshot, loaded: true }
    emit()
  }
}

export function installFlushOnHide(): () => void {
  const onHide = () => flushSettings()
  const onVisibility = () => { if (document.visibilityState === 'hidden') flushSettings() }
  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('pagehide', onHide)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

// Test-only: forget everything held in memory.
export function __resetSettingsForTests(): void {
  started = false
  history.clear()
  userLog = []
  userCursor = null
  historyFlags = { canUndo: false, canRedo: false }
  deadlines.clear()
  countdown = { nextSaveAt: null, wait: null }
  pending.forEach(t => { if (t) clearTimeout(t) })
  pending.clear()
  senders.clear()
  kvMemory.clear()
  kvListeners.clear()
  inFlight = 0
  sending.clear()
  restoring = false
  failed.clear()
  lastSavedAt = null
  saveStatus = { state: 'saved', dirty: false, saving: false, error: undefined, lastSavedAt: null }
  snapshot = { ...readCache(), loaded: false }
  refreshSaveStatus()
}

// The countdown starts from the autosave setting as it is.
refreshSaveStatus()
