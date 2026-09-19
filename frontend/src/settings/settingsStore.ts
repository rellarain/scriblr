import { useSyncExternalStore } from 'react'
import { defaultThemeSettings, DEFAULT_UI_SETTINGS } from '../theme/defaults'
import { normalizeTheme } from '../theme/zones'
import type { ThemeSettings, UiSettings } from '../theme/types'

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

function readCache(): { theme: ThemeSettings; ui: UiSettings } {
  try {
    const raw = lsGet(THEME_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return {
      theme: normalizeTheme(parsed?.theme),
      ui: { ...DEFAULT_UI_SETTINGS, ...(parsed?.ui ?? {}) },
    }
  } catch {
    return { theme: defaultThemeSettings(), ui: { ...DEFAULT_UI_SETTINGS } }
  }
}

let snapshot: SettingsSnapshot = { ...readCache(), loaded: false }
const listeners = new Set<() => void>()
const kvMemory = new Map<string, unknown>()
const kvListeners = new Map<string, Set<() => void>>()

// key -> the timer that will send it. 'theme', 'ui' and 'kv:<key>'.
const pending = new Map<string, ReturnType<typeof setTimeout>>()
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

function schedule(id: string, sender: (keepalive: boolean) => Promise<void>, delay = DEBOUNCE_MS) {
  const existing = pending.get(id)
  if (existing) clearTimeout(existing)
  senders.set(id, sender)
  pending.set(id, setTimeout(() => run(id, false), delay))
}

function run(id: string, keepalive: boolean) {
  const sender = senders.get(id)
  const timer = pending.get(id)
  if (timer) clearTimeout(timer)
  pending.delete(id)
  if (!sender) return
  senders.delete(id)
  sender(keepalive).catch(() => {
    // Keep it dirty and try again later, unless a newer write already replaced it.
    if (!senders.has(id)) schedule(id, sender, RETRY_MS)
  })
}

// Send everything pending now (used when the page is being hidden).
export function flushSettings(): void {
  for (const id of [...senders.keys()]) run(id, true)
}

// --- theme + ui ---

export function getSettings(): SettingsSnapshot { return snapshot }

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function setTheme(next: ThemeSettings | ((prev: ThemeSettings) => ThemeSettings)): void {
  const resolved = normalizeTheme(typeof next === 'function' ? next(snapshot.theme) : next)
  snapshot = { ...snapshot, theme: resolved }
  writeCache()
  emit()
  schedule('theme', keepalive => send('PUT', '/user-settings/theme', resolved, keepalive))
}

export function setUi(next: UiSettings | ((prev: UiSettings) => UiSettings)): void {
  const resolved = typeof next === 'function' ? next(snapshot.ui) : next
  snapshot = { ...snapshot, ui: resolved }
  writeCache()
  emit()
  schedule('ui', keepalive => send('PUT', '/user-settings/ui', resolved, keepalive))
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
  if (!pending.has('ui')) snapshot = { ...snapshot, ui: { ...DEFAULT_UI_SETTINGS, ...remote.ui } }
  snapshot = { ...snapshot, loaded: true }
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
  pending.forEach(t => clearTimeout(t))
  pending.clear()
  senders.clear()
  kvMemory.clear()
  kvListeners.clear()
  snapshot = { ...readCache(), loaded: false }
}
