import { useEffect, useSyncExternalStore } from 'react'
import { listPlaces } from '../../../../api/mapsApi'
import type { MapPlace } from '../../../../api/types'

// The places of the open project (named symbols of its maps), shared by what lets a scene pick one: the Outline's scene fields and the Draft's chips. Loaded
// when something that shows a location appears, and again a moment after anything is saved (the maps may have changed). A load that fails leaves what was
// there. An external store, like the planner's (schedule/planStore.ts).

const RELOAD_DELAY_MS = 600

let projectId: string | null = null
let places: MapPlace[] = []
let status: 'idle' | 'loading' | 'ready' = 'idle'
let version = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let users = 0

const emit = () => { version += 1; for (const l of listeners) l() }

export async function loadPlaces(id: string, force = false): Promise<void> {
  if (!force && projectId === id && status !== 'idle') return
  if (projectId !== id) { projectId = id; places = []; status = 'loading'; emit() }
  try {
    const rows = await listPlaces(id)
    if (projectId !== id) return
    places = Array.isArray(rows) ? rows : []
  } catch {
    // The places stay as they were.
  }
  if (projectId === id) { status = 'ready'; emit() }
}

function scheduleReload() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; if (projectId && users > 0) void loadPlaces(projectId, true) }, RELOAD_DELAY_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export interface PlacesView {
  places: MapPlace[]
  byKey: Map<string, MapPlace>
  ready: boolean
}

const EMPTY: PlacesView = { places: [], byKey: new Map(), ready: false }
let cached: { version: number; id: string | null; view: PlacesView } = { version: -1, id: null, view: EMPTY }

// The places of a project (none while it loads or when no project is open). The store is read again a moment after anything is saved.
export function usePlaces(id: string | null): PlacesView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (!id) return
    users += 1
    void loadPlaces(id)
    const onChanged = () => scheduleReload()
    window.addEventListener('scriblr:changed', onChanged)
    return () => { users -= 1; window.removeEventListener('scriblr:changed', onChanged) }
  }, [id])
  if (!id || projectId !== id) return EMPTY
  if (cached.version !== version || cached.id !== id) cached = { version, id, view: { places, byKey: new Map(places.map(p => [p.key, p])), ready: status === 'ready' } }
  return cached.view
}

// What a scene's stored location is: a place of the project (`mapId/placeId`), or old text that was typed before places existed.
export function describeLocation(value: string, byKey: Map<string, MapPlace>): { kind: 'none' } | { kind: 'place'; place: MapPlace } | { kind: 'old'; text: string } {
  const text = value.trim()
  if (text === '') return { kind: 'none' }
  const place = byKey.get(text)
  return place ? { kind: 'place', place } : { kind: 'old', text }
}

// Whether a stored location has the shape of a place key (so a text that was typed is not mistaken for one that is gone).
export const looksLikePlaceKey = (value: string) => /^map_[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(value.trim())

export function __resetPlacesForTests() {
  projectId = null; places = []; status = 'idle'; version = 0; users = 0
  if (timer) { clearTimeout(timer); timer = null }
  cached = { version: -1, id: null, view: EMPTY }
  listeners.clear()
}
