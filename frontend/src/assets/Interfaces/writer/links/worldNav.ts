import { useEffect, useRef, useSyncExternalStore } from 'react'

// A jump from a link to a character or a place that lives in another console: the request waits here until the console that shows that kind is on screen
// (it is, when its tile is open beside; else when its tab is next opened) and then opens the thing. A plot node is opened through the workspace instead.

export type NavKind = 'char' | 'place'
let pending: { kind: NavKind; id: string } | null = null
let version = 0
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function requestOpen(kind: NavKind, id: string) {
  pending = { kind, id }
  version += 1
  for (const l of listeners) l()
}

// Whether a request for this kind is waiting (a console that opens its first thing by itself leaves it alone then).
export const hasPending = (kind: NavKind) => pending?.kind === kind

// In a console: open what was asked for, once `ready` (its things are loaded). The handler gets the id (a place's is "mapId/symbolId").
export function usePendingOpen(kind: NavKind, ready: boolean, handle: (id: string) => void) {
  const seen = useSyncExternalStore(subscribe, () => version)
  const latest = useRef(handle)
  latest.current = handle
  useEffect(() => {
    if (!ready || !pending || pending.kind !== kind) return
    const { id } = pending
    pending = null
    latest.current(id)
  }, [seen, ready, kind])
}

export function __resetWorldNavForTests() { pending = null; version = 0; listeners.clear() }
