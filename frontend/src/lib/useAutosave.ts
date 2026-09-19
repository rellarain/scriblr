import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAutosavePolicy } from '../settings/settingsStore'

// Autosave with a visible state, shared by the editors that save a whole
// document (outline, plot, admin config, chapter draft).
//
//  - schedule(value): remember the latest value and save it after `delay` ms
//    of inactivity (each call restarts the wait).
//  - saveNow(value?): save immediately -- structural edits.
//  - flush(): save whatever is waiting right now (the Save button, navigation,
//    page hidden, unmount); a no-op when nothing is.
//  - discard(): forget what is waiting and wait for any save under way -- the
//    caller then reloads the last saved copy ("restore").
//
// The user turns autosave off, or picks the wait (30 seconds to 10 minutes),
// in the UUI settings (settings/settingsStore.ts). With it off, schedule and
// saveNow only keep the edit waiting (dirty) until a flush: the Save button, or
// leaving the page, so an edit is never lost. Changing the setting saves what
// is waiting straight away.
//  - dirty: something is not saved yet (waiting, in flight, or failed).
//    A failed save keeps the value, reports `error`, and retries later.
//
// Saves run one at a time, in order, so the last value always wins on the
// server, and `dirty` only clears once the LATEST value has been saved.
export interface AutosaveOptions<T> {
  save: (value: T) => Promise<void>
  // Override the user's autosave setting (tests).
  enabled?: boolean
  delay?: number
  retryDelay?: number
}

export interface Autosave<T> {
  schedule: (value: T) => void
  saveNow: (value?: T) => Promise<void>
  flush: () => Promise<void>
  // True while a value is waiting to be saved (debounce running, or failed).
  isPending: () => boolean
  // True when something newer than the save now running is waiting or queued
  // behind it. A finished save must not replace the editor's state with the
  // server copy then: it would revert edits made while it was in flight.
  hasNewer: () => boolean
  // Forget a waiting value without saving it (the document it belonged to is gone).
  cancel: () => void
  // cancel(), then resolves once any save already under way has finished.
  discard: () => Promise<void>
  dirty: boolean
  saving: boolean
  error: string | undefined
  lastSavedAt: number | null
}

export const DEFAULT_RETRY_DELAY = 15_000

export function useAutosave<T>({ save, enabled, delay, retryDelay = DEFAULT_RETRY_DELAY }: AutosaveOptions<T>): Autosave<T> {
  const policy = useAutosavePolicy()
  const auto = enabled ?? policy.enabled
  const wait = delay ?? policy.delay
  const autoRef = useRef(auto)
  const waitRef = useRef(wait)
  autoRef.current = auto
  waitRef.current = wait

  const saveRef = useRef(save)
  saveRef.current = save

  const pending = useRef<{ value: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const inFlight = useRef(0)
  // Bumped by cancel/discard so a save that fails afterwards does not bring its value back.
  const epoch = useRef(0)

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const mounted = useRef(true)

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }

  // Save the waiting value (if any), after any save already running.
  const run = useCallback((): Promise<void> => {
    clearTimer()
    const waiting = pending.current
    if (!waiting) return chain.current
    pending.current = null
    inFlight.current += 1
    const startedIn = epoch.current
    if (mounted.current) setSaving(true)
    chain.current = chain.current.then(async () => {
      try {
        await saveRef.current(waiting.value)
        if (mounted.current) { setError(undefined); setLastSavedAt(Date.now()) }
      } catch (err) {
        if (epoch.current === startedIn) {
          // Keep the value (unless something newer replaced it) and try again later
          // (only while autosave is on; otherwise it waits for a Save).
          if (!pending.current) {
            pending.current = waiting
            if (mounted.current && autoRef.current) timer.current = setTimeout(() => { void run() }, retryDelay)
          }
          if (mounted.current) setError(err instanceof Error ? err.message : 'Failed to save')
        }
      } finally {
        inFlight.current -= 1
        if (mounted.current) {
          if (inFlight.current === 0) setSaving(false)
          setDirty(pending.current !== null || inFlight.current > 0)
        }
      }
    })
    return chain.current
  }, [retryDelay])

  const schedule = useCallback((value: T) => {
    pending.current = { value }
    if (mounted.current) setDirty(true)
    clearTimer()
    if (autoRef.current) timer.current = setTimeout(() => { void run() }, waitRef.current)
  }, [run])

  const saveNow = useCallback((value?: T): Promise<void> => {
    if (value !== undefined) pending.current = { value }
    if (pending.current && mounted.current) setDirty(true)
    if (!autoRef.current) { clearTimer(); return chain.current }
    return run()
  }, [run])

  const flush = useCallback((): Promise<void> => run(), [run])

  const isPending = useCallback(() => pending.current !== null, [])
  // Called from inside a save, where inFlight counts that save too.
  const hasNewer = useCallback(() => pending.current !== null || inFlight.current > 1, [])

  const cancel = useCallback(() => {
    clearTimer()
    epoch.current += 1
    pending.current = null
    if (mounted.current) { setError(undefined); setDirty(inFlight.current > 0) }
  }, [])

  const discard = useCallback(async () => {
    cancel()
    await chain.current
    if (mounted.current) setDirty(pending.current !== null)
  }, [cancel])

  // Changing the setting (on/off, or the wait) saves what is waiting now when
  // autosave is on, and holds it when it is off.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (auto) void run()
    else clearTimer()
  }, [auto, wait, run])

  // Save what is waiting when the page is hidden or closed, and on unmount.
  useEffect(() => {
    mounted.current = true
    const onHide = () => { void run() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') void run() }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      void run()
      mounted.current = false
      clearTimer()
    }
  }, [run])

  return useMemo(
    () => ({ schedule, saveNow, flush, isPending, hasNewer, cancel, discard, dirty, saving, error, lastSavedAt }),
    [schedule, saveNow, flush, isPending, hasNewer, cancel, discard, dirty, saving, error, lastSavedAt],
  )
}

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

export interface SaveStatus {
  state: SaveState
  dirty: boolean
  saving: boolean
  error: string | undefined
  // When the last save (manual or automatic) landed; null = none yet.
  lastSavedAt: number | null
}

// One status for several autosaves (e.g. outline + plot + draft).
export function combineSaveStatus(...parts: Array<Pick<Autosave<unknown>, 'dirty' | 'saving' | 'error' | 'lastSavedAt'>>): SaveStatus {
  const dirty = parts.some(p => p.dirty)
  const saving = parts.some(p => p.saving)
  const error = parts.find(p => p.error)?.error
  const state: SaveState = error ? 'error' : saving ? 'saving' : dirty ? 'unsaved' : 'saved'
  const times = parts.map(p => p.lastSavedAt).filter((t): t is number => t !== null)
  return { state, dirty, saving, error, lastSavedAt: times.length > 0 ? Math.max(...times) : null }
}
