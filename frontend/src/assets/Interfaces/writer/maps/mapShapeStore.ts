import { useEffect, useSyncExternalStore } from 'react'
import type { MapLibraryShape, MyMapShape } from '../../../../api/types'
import { addMyShape, deleteMyShape, getMyShapes, getPublishedShapes, renameMyShape } from '../../../../api/mapShapesApi'
import { starterShapes } from './mapShapeSeed'

// The shape libraries a map is built from: the admin's published default shapes (loaded once per run; the starter list until they come, or when they
// cannot) and the writer's own ("My shapes", for every project). Saving to My shapes goes to the server at once (it is not part of a map's undo).

let published: MapLibraryShape[] | null = null
let publishedStatus: 'idle' | 'loading' | 'ready' = 'idle'
let mine: MyMapShape[] = []
let mineStatus: 'idle' | 'loading' | 'ready' = 'idle'
let version = 0
const listeners = new Set<() => void>()
const emit = () => { version += 1; for (const l of listeners) l() }

export async function loadPublishedShapes(force = false): Promise<void> {
  if (!force && publishedStatus !== 'idle') return
  publishedStatus = 'loading'
  try {
    const res = await getPublishedShapes()
    if (Array.isArray(res?.shapes)) published = res.shapes
  } catch {
    // The starter list stays.
  }
  publishedStatus = 'ready'
  emit()
}

export async function loadMyShapes(force = false): Promise<void> {
  if (!force && mineStatus !== 'idle') return
  mineStatus = 'loading'
  try {
    const res = await getMyShapes()
    if (Array.isArray(res?.shapes)) mine = res.shapes
  } catch {
    // None, for now.
  }
  mineStatus = 'ready'
  emit()
}

// Keep a shape among My shapes; the saved shape, or null when it could not be saved.
export async function saveMyShape(shape: MapLibraryShape, projectId: string, projectTitle: string): Promise<MyMapShape | null> {
  try {
    const saved = await addMyShape(shape, projectId, projectTitle)
    mine = [...mine, saved]
    emit()
    return saved
  } catch {
    return null
  }
}

export async function renameMine(id: string, name: string): Promise<boolean> {
  try {
    const saved = await renameMyShape(id, name)
    mine = mine.map(s => (s.id === id ? saved : s))
    emit()
    return true
  } catch {
    return false
  }
}

export async function deleteMine(id: string): Promise<boolean> {
  try {
    await deleteMyShape(id)
    mine = mine.filter(s => s.id !== id)
    emit()
    return true
  } catch {
    return false
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
let starter: MapLibraryShape[] | null = null

export interface ShapeLibraryView { published: MapLibraryShape[]; mine: MyMapShape[] }
let cached: { version: number; view: ShapeLibraryView } | null = null

// The default shapes and My shapes, loading them when first used.
export function useShapeLibrary(): ShapeLibraryView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => { void loadPublishedShapes(); void loadMyShapes() }, [])
  if (!cached || cached.version !== version) {
    starter ??= starterShapes()
    cached = { version, view: { published: published ?? starter, mine } }
  }
  return cached.view
}

export function __resetShapeLibraryForTests() {
  published = null; publishedStatus = 'idle'; mine = []; mineStatus = 'idle'; version = 0; cached = null
  listeners.clear()
}
