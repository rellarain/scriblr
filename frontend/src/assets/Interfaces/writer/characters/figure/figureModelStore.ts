import { useEffect, useSyncExternalStore } from 'react'
import { addFigureModel, listFigureModels } from '../../../../../api/figureModelsApi'
import type { FigureModel, FigureModelCreate } from '../../../../../api/types'

// The copies of models that characters' figures are drawn from. A copy is kept under a key that is a hash of its content, so one key is always the same copy whichever
// project it came from: this store is one map for the whole app, filled from the open project (and from a book's extras in the reader), and it can never hold a wrong
// copy. An external store, like the cast (castStore.ts). A load that fails leaves what was there; a figure whose copy is not here yet draws the portrait.

const copies = new Map<string, FigureModel>()
const loaded = new Set<string>()
let version = 0
const listeners = new Set<() => void>()
const emit = () => { version += 1; for (const l of listeners) l() }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

// Remember some copies (the ones a book's extras carry, or one just made).
export function registerCopies(models: Iterable<FigureModel>): void {
  let added = false
  for (const m of models) if (m && typeof m.id === 'string' && !copies.has(m.id)) { copies.set(m.id, m); added = true }
  if (added) emit()
}

export async function loadFigureModels(projectId: string, force = false): Promise<void> {
  if (!force && loaded.has(projectId)) return
  loaded.add(projectId)
  try {
    const rows = await listFigureModels(projectId)
    registerCopies(Array.isArray(rows) ? rows : [])
  } catch {
    // The copies stay as they were; the next try loads again.
    loaded.delete(projectId)
  }
}

// A copy of a published model (or of the content a character file carries) is made in the project once; the entry that is there already comes back for the same content.
export async function ensureFigureModel(projectId: string, body: FigureModelCreate): Promise<FigureModel> {
  const made = await addFigureModel(projectId, body)
  registerCopies([made])
  return made
}

// The copies of some keys, from the store; when one is not there the project's copies are read again first (an export needs them all).
export async function figureCopiesFor(projectId: string, keys: string[]): Promise<FigureModel[]> {
  if (keys.length === 0) return []
  if (keys.some(k => !copies.has(k))) await loadFigureModels(projectId, true)
  return keys.map(k => copies.get(k)).filter((m): m is FigureModel => !!m)
}

export const copyOfKey = (key: string | null | undefined): FigureModel | undefined => (key ? copies.get(key) : undefined)

// Loads the copies of the open project when something that draws figures appears; the copies are then read with `useFigureCopy`.
export function useFigureModels(projectId: string | null): void {
  useEffect(() => {
    if (projectId) void loadFigureModels(projectId)
  }, [projectId])
}

// The copy a figure points at (none while it loads, or when this project does not have it).
export function useFigureCopy(key: string | null | undefined): FigureModel | undefined {
  useSyncExternalStore(subscribe, () => version)
  return copyOfKey(key)
}

// The copy of a key, read when the component renders and again whenever a copy arrives (for code that looks up several copies).
export function useFigureCopies(): (key: string) => FigureModel | undefined {
  useSyncExternalStore(subscribe, () => version)
  return copyOfKey
}

export function __resetFigureModelsForTests() {
  copies.clear(); loaded.clear(); version = 0; listeners.clear()
}
