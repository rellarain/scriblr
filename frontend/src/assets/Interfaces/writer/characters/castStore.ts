import { useEffect, useSyncExternalStore } from 'react'
import { listAllCharacters, putCharacter } from '../../../../api/charactersApi'
import type { CharacterDoc } from '../../../../api/types'

// The cast of the open project, whole, shared by what shows who is in a scene: the Outline's scene cards, the Draft's chips and the Characters console's overview and
// compare. Loaded when something that shows the cast appears, and again a moment after anything is saved (a character may have changed). A load that fails leaves what
// was there. An external store, like the places (maps/placesStore.ts).

const RELOAD_DELAY_MS = 600

let projectId: string | null = null
let cast: CharacterDoc[] = []
let status: 'idle' | 'loading' | 'ready' = 'idle'
let version = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let users = 0

const emit = () => { version += 1; for (const l of listeners) l() }

export async function loadCast(id: string, force = false): Promise<void> {
  if (!force && projectId === id && status !== 'idle') return
  if (projectId !== id) { projectId = id; cast = []; status = 'loading'; emit() }
  try {
    const rows = await listAllCharacters(id)
    if (projectId !== id) return
    cast = Array.isArray(rows) ? rows : []
  } catch {
    // The cast stays as it was.
  }
  if (projectId === id) { status = 'ready'; emit() }
}

// Something was saved that may have changed a character: the cast is read again in a moment.
export function notifyCastChanged() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; if (projectId && users > 0) void loadCast(projectId, true) }, RELOAD_DELAY_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export interface CastView { cast: CharacterDoc[]; ready: boolean }
const EMPTY: CastView = { cast: [], ready: false }
let cached: { version: number; id: string | null; view: CastView } = { version: -1, id: null, view: EMPTY }

// The whole cast of a project (none while it loads or when no project is open).
export function useCast(id: string | null): CastView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (!id) return
    users += 1
    void loadCast(id)
    const onChanged = () => notifyCastChanged()
    window.addEventListener('scriblr:changed', onChanged)
    return () => { users -= 1; window.removeEventListener('scriblr:changed', onChanged) }
  }, [id])
  if (!id || projectId !== id) return EMPTY
  if (cached.version !== version || cached.id !== id) cached = { version, id, view: { cast, ready: status === 'ready' } }
  return cached.view
}

// The characters tagged on a chapter or scene.
export const taggedOn = (all: CharacterDoc[], nodeId: string): CharacterDoc[] => all.filter(c => c.appearances.includes(nodeId))

// Tag a character on a chapter or scene, or take the tag off: the character is saved at once (the whole document, as it is in the store).
export async function setAppearance(id: string, characterId: string, nodeId: string, on: boolean): Promise<boolean> {
  const doc = cast.find(c => c.id === characterId)
  if (!doc || projectId !== id) return false
  const has = doc.appearances.includes(nodeId)
  if (has === on) return true
  const next: CharacterDoc = { ...doc, appearances: on ? [...doc.appearances, nodeId] : doc.appearances.filter(a => a !== nodeId) }
  // Shown at once; the server's answer replaces it.
  cast = cast.map(c => (c.id === characterId ? next : c))
  emit()
  try {
    const saved = await putCharacter(id, next)
    if (projectId === id) { cast = cast.map(c => (c.id === characterId ? saved : c)); emit() }
    return true
  } catch {
    if (projectId === id) { cast = cast.map(c => (c.id === characterId ? doc : c)); emit() }
    return false
  }
}

export function __resetCastForTests() {
  projectId = null; cast = []; status = 'idle'; version = 0; users = 0
  if (timer) { clearTimeout(timer); timer = null }
  cached = { version: -1, id: null, view: EMPTY }
  listeners.clear()
}
