import { useEffect, useSyncExternalStore } from 'react'
import { getResources } from '../api/resourcesApi'
import type { ResourcesFile } from '../api/types'

// The Resources file (the channel nodes, their articles and assessments), shared by the Help tiles, the markup's links and the link picker.
// Loaded once when something that needs it appears (`enabled`); the admin's Resources builder hands every edit straight in
// (`setResourcesFile`), so a link to a guide just written finds it. A load that fails leaves what was there. An external store, like the
// channel list (channelStore.ts).

let file: ResourcesFile | null = null
let status: 'idle' | 'loading' | 'ready' = 'idle'
let version = 0
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

const emit = () => { version += 1; for (const l of listeners) l() }

export function loadResources(force = false): Promise<void> {
  if (inflight) return inflight
  if (!force && status === 'ready') return Promise.resolve()
  status = 'loading'
  inflight = getResources()
    .then(body => { if (body && Array.isArray(body.nodes)) file = body })
    .catch(() => { /* the file stays as it was */ })
    .finally(() => { status = 'ready'; inflight = null; emit() })
  return inflight
}

export function setResourcesFile(next: ResourcesFile) {
  file = next
  status = 'ready'
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export interface ResourcesView { file: ResourcesFile | null; ready: boolean }
let cached: { version: number; view: ResourcesView } = { version: -1, view: { file, ready: false } }

export function useResourcesFile(enabled = true): ResourcesView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => { if (enabled) void loadResources() }, [enabled])
  if (cached.version !== version) cached = { version, view: { file, ready: status === 'ready' } }
  return cached.view
}

export function __resetResourcesForTests() {
  file = null
  status = 'idle'
  version = 0
  inflight = null
  cached = { version: -1, view: { file, ready: false } }
  listeners.clear()
}
