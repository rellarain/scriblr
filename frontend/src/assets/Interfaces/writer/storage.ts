import { useCallback, useEffect, useRef, useState } from 'react'
import { getKv, setKv, subscribeKv } from '../../../settings/settingsStore'

// State that survives reloads AND relaunches of the packaged app, for the
// parts of the Writer interface that keep their own UI state (dashboard
// checklists, scratchpad notes, reactions, the chapter mode). It is backed by
// the user-settings store: read synchronously from memory / the localStorage
// cache, written through to the backend (see settings/settingsStore.ts).
export function useStoredState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const read = (): T => {
    const stored = getKv<T>(key)
    return stored === undefined ? initial : stored
  }

  const [value, setValueState] = useState<T>(read)

  // A different key is a different piece of state (e.g. the reactions for
  // another chapter): re-read instead of keeping the old key's value.
  const [stateKey, setStateKey] = useState(key)
  if (stateKey !== key) {
    setStateKey(key)
    setValueState(read())
  }

  // Follow changes that arrive from elsewhere (the backend load).
  const initialRef = useRef(initial)
  initialRef.current = initial
  useEffect(() => {
    return subscribeKv(key, () => {
      const stored = getKv<T>(key)
      setValueState(stored === undefined ? initialRef.current : stored)
    })
  }, [key])

  // The latest value, so consecutive functional updates in one tick compose.
  const latest = useRef(value)
  latest.current = value

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(latest.current) : next
    latest.current = resolved
    setValueState(resolved)
    setKv(key, resolved)
  }, [key])

  return [value, setValue]
}
