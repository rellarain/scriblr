import { useEffect, useSyncExternalStore } from 'react'
import { listAllItems } from '../../../../api/itemsApi'
import type { ItemDoc } from '../../../../api/types'

// The items of the open project, whole, shared by what shows them: the Items console's links and the characters' pages (what a character carries). Loaded when something
// that shows the items appears, and again a moment after anything is saved. A load that fails leaves what was there. An external store, like the cast (characters/castStore.ts).

const RELOAD_DELAY_MS = 600

let projectId: string | null = null
let items: ItemDoc[] = []
let status: 'idle' | 'loading' | 'ready' = 'idle'
let version = 0
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let users = 0

const emit = () => { version += 1; for (const l of listeners) l() }

export async function loadItems(id: string, force = false): Promise<void> {
  if (!force && projectId === id && status !== 'idle') return
  if (projectId !== id) { projectId = id; items = []; status = 'loading'; emit() }
  try {
    const rows = await listAllItems(id)
    if (projectId !== id) return
    items = Array.isArray(rows) ? rows : []
  } catch {
    // The items stay as they were.
  }
  if (projectId === id) { status = 'ready'; emit() }
}

// Something was saved that may have changed an item: the items are read again in a moment.
export function notifyItemsChanged() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; if (projectId && users > 0) void loadItems(projectId, true) }, RELOAD_DELAY_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export interface ItemsView { items: ItemDoc[]; ready: boolean }
const EMPTY: ItemsView = { items: [], ready: false }
let cached: { version: number; id: string | null; view: ItemsView } = { version: -1, id: null, view: EMPTY }

// The whole library of a project (none while it loads or when no project is open).
export function useItemStore(id: string | null): ItemsView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (!id) return
    users += 1
    void loadItems(id)
    const onChanged = () => notifyItemsChanged()
    window.addEventListener('scriblr:changed', onChanged)
    return () => { users -= 1; window.removeEventListener('scriblr:changed', onChanged) }
  }, [id])
  if (!id || projectId !== id) return EMPTY
  if (cached.version !== version || cached.id !== id) cached = { version, id, view: { items, ready: status === 'ready' } }
  return cached.view
}

export function __resetItemsForTests() {
  projectId = null; items = []; status = 'idle'; version = 0; users = 0
  if (timer) { clearTimeout(timer); timer = null }
  cached = { version: -1, id: null, view: EMPTY }
  listeners.clear()
}
