import { useEffect, useState } from 'react'

// State that survives reloads, for the parts of the Writer interface with no
// backend yet (dashboard checklists, scratchpad notes, reactions). Storage
// access is wrapped: it can be unavailable or full.
export function useStoredState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
  }, [key, value])
  return [value, setValue]
}
