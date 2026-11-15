import { useEffect, useSyncExternalStore } from 'react'
import { getChannels } from '../api/channelsApi'
import type { ResourceNode } from '../api/types'
import { indexChannels, type ChannelIndex } from './channelTree'

// The channel list, shared by everything that names a place in the app (the Help tiles, feedback, plans, chats, queues). Loaded
// once when something that shows it appears; Configuration > Channels hands its edits straight in (`setChannels`). A load that
// fails leaves what was there. An external store, like the cast (writer/characters/castStore.ts).

let index: ChannelIndex = indexChannels([])
let status: 'idle' | 'loading' | 'ready' = 'idle'
let version = 0
const listeners = new Set<() => void>()

const emit = () => { version += 1; for (const l of listeners) l() }

export async function loadChannels(force = false): Promise<void> {
  if (!force && status !== 'idle') return
  status = 'loading'
  try {
    const body = await getChannels()
    index = indexChannels(Array.isArray(body?.nodes) ? body.nodes : [])
  } catch {
    // The list stays as it was.
  }
  status = 'ready'
  emit()
}

// The list as an edit left it (the Resources node routes answer with the whole file).
export function setChannels(nodes: ResourceNode[]) {
  index = indexChannels(nodes)
  status = 'ready'
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export interface ChannelsView { index: ChannelIndex; ready: boolean }
let cached: { version: number; view: ChannelsView } = { version: -1, view: { index, ready: false } }

export function useChannels(): ChannelsView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => { void loadChannels() }, [])
  if (cached.version !== version) cached = { version, view: { index, ready: status === 'ready' } }
  return cached.view
}

export function __resetChannelsForTests() {
  index = indexChannels([])
  status = 'idle'
  version = 0
  cached = { version: -1, view: { index, ready: false } }
  listeners.clear()
}
